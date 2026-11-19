// Build becomes yours (#1089, behind `build.yours`): the record of signals. Read-only over what this machine already
// holds; it writes nothing. A Sol user rarely asks for "a tool": they repeat an ask, correct the agent the same way, move
// the same artifact to the same side, close the same artifact every time. This file finds those and yields candidate
// offers; yoursKeep.ts makes versions of one and keeps the picked one as an artifact in the project.
//
//   asks           every typed turn in ~/.claude/projects/*/*.jsonl (the person's words; never tool results, never the
//                  agent's words, never a command wrapper or a summary)
//   arrangements   <home>/<project>/sessions/<id>/stage.json: an artifact placed by hand (`hand`), and on which side
//   closes         <home>/<project>/blocks/<id>/ledger.jsonl: a "closed" line
//
// The four kinds of offer, each from three or more of the same:
//   ask          the same ask in two or more sessions; what changed between them (a PR number, a folder, a name) are
//                its blanks, so the kept thing is the ask with fields
//   checkin      "is it done", "where is it", "is it merged": short asks after the work, matched as a family
//   correction   a turn right after the agent's that starts "no", "not", "don't", "again", "I said"… and says the same
//                thing as two others: a rule the agent should keep
//   arrangement  the same artifact moved by hand to the same side in three sessions; or closed in three sessions
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { allBlocks, getStage, homeRoot, ledger, projectOf, projects, STAGE_W, type Block } from "./blocks.js";
import { workState } from "./state.js";

export type Ask = { session: string; cwd: string; at: number; text: string; afterAgent: boolean;
  /** the transcript line's entrypoint: cli (Claude Code, typed), sdk-ts (a Sol session), none (an older file) */
  via?: string };
export type Blank = { name: string; values: string[] };
export type OfferKind = "ask" | "checkin" | "correction" | "arrangement" | "closed";
export type Offer = {
  id: string; kind: OfferKind;
  count: number; sessions: number; first: number; last: number;
  /** the shared words, blanks drawn as ____ */
  words: string;
  /** up to three of the real asks, newest first, cut to EXAMPLE letters (they stay on this machine: never to Jev) */
  examples: string[];
  /** the most of them on one day, and how alike they are (0-100: the share of the group's head words each one holds, on
   *  average): the shape of the repeat Jev may read, with no words in it */
  most?: number; alike?: number;
  /** what changed between them, newest value first; an ask's fields */
  blanks: Blank[];
  /** the newest ask with each blank as {name}: what the kept tool fills in */
  template: string;
  /** the one sentence the offer says */
  sentence: string;
  /** the folder most of them were in */
  folder: string;
  /** the words that make the group this group (its first ask's head; a correction's words after the "no"): a just-sent
   *  ask belongs to the offer when it is near them (`belongs`) */
  head: string[];
  /** an arrangement's artifact and side, a closed one's title */
  target?: { title: string; kind?: string; side?: Side; dock?: string; width?: number };
};
export type Side = "left" | "right" | "middle";

export const MIN = 3;            // three of the same is a pattern; two is a coincidence
export const MIN_SESSIONS = 2;   // the same ask twice in one session is a retry, not a habit
export const EXAMPLE = 160;
const ASK_MAX = 4000;            // the template keeps the whole ask up to this; a brief can be long
const HEAD = 40;                 // words compared between two asks
const NEAR = 0.55;               // how alike two asks' heads must be (Jaccard over their words)
const NEAR_FIX = 0.4;            // two corrections: what follows the "no" must share this much
const BLANK_WORDS = 80;         // a blank is one of the first this many words
const BLANKS = 4;               // at most this many fields on a kept tool
export const DAYS = 30;          // older transcripts are not read

// ---------------------------------------------------------------- reading the transcripts

const HEAD_BYTES = 2048;
/** the entrypoints a person types through */
export const PERSON = new Set(["cli", "sdk-ts", "sdk-cli", "claude-desktop"]);
/** entrypoints a program also uses (Sol's own sessions, claude -p, an orchestrator): the person's only when Sol's own
 *  record says they had that session open in Build (the walk: Sol's Build sessions are written as sdk-cli) */
const PROGRAM = new Set(["sdk-ts", "sdk-cli"]);

/** the typed words of one transcript line, or null when it is not the person typing (pure) */
export function typed(line: unknown): { text: string; at: number; session: string; cwd: string; via?: string } | null {
  const d = line as { type?: string; isMeta?: boolean; isSidechain?: boolean; entrypoint?: string; message?: { role?: string; content?: unknown }; timestamp?: string; sessionId?: string; cwd?: string } | null;
  if (!d || d.type !== "user" || d.isMeta || d.isSidechain) return null;
  // a person types in Claude Code (cli) or in Sol's own sessions (sdk-ts); `claude -p` and an orchestrator's runs
  // (sdk-cli and the rest) are an agent's prompts, never the person's habit
  if (d.entrypoint !== undefined && !PERSON.has(d.entrypoint)) return null;
  const c = d.message?.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((x) => x && typeof x === "object" && (x as { type?: string }).type === "tool_result")) return null;
    text = c.filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "text").map((x) => String((x as { text?: unknown }).text ?? "")).join("\n");
  }
  text = text.trim();
  if (!ownWords(text)) return null;
  const at = Date.parse(d.timestamp ?? "") || 0;
  // a copy, never a slice of the line: the line (up to LINE_MAX) must not stay alive behind a 2 KB ask
  return { text: Buffer.from(text.slice(0, ASK_MAX), "utf8").toString("utf8"), at, session: String(d.sessionId ?? ""), cwd: String(d.cwd ?? ""), ...(d.entrypoint ? { via: d.entrypoint } : {}) };
}

/** one transcript's asks, in order (pure over its text): whether each came right after the agent spoke */
export function asksOf(jsonl: string | Buffer): Ask[] { return asksFrom(jsonl).asks; }
/** the same, from where an earlier read stopped: `agent` says whether the agent spoke last before it (pure) */
export function asksFrom(jsonl: string | Buffer, agentBefore = false): { asks: Ask[]; agent: boolean } {
  const buf = typeof jsonl === "string" ? Buffer.from(jsonl) : jsonl;
  const out: Ask[] = [];
  let agent = agentBefore;
  // a transcript is mostly the agent's turns and tool results: each line is judged by its first bytes, and only the
  // person's own lines are parsed
  for (let i = 0; i < buf.length;) {
    let j = buf.indexOf(10, i); if (j < 0) j = buf.length;
    // a line is judged by its head; a long folder name can push "type" and "role" far in, so the head is 2 KB
    const head = buf.toString("latin1", i, Math.min(j, i + HEAD_BYTES));
    const at = i; i = j + 1;
    if (/"role":\s*"assistant"/.test(head)) { if (!/"isSidechain":\s*true/.test(head)) agent = true; continue; }
    if (!/"type":\s*"user"/.test(head) || /"content":\s*\[\s*\{\s*("tool_use_id"|"type":\s*"tool_result")/.test(head)) continue;
    let d: unknown; try { d = JSON.parse(buf.toString("utf8", at, j)); } catch { continue; }
    const a = typed(d);
    if (!a) continue;
    out.push({ ...a, afterAgent: agent });
    agent = false;
  }
  return { asks: out, agent };
}

/** each transcript read so far: the bytes read (to its last whole line), whether the agent spoke last, its asks */
type Read = { off: number; agent: boolean; asks: Ask[]; skip?: boolean };
const cache = new Map<string, Read>();
/** where the transcripts are: SOL_YOURS_DIR (the tests' own), else Claude Code's own folder on this machine */
export const transcriptsRoot = () => process.env.SOL_YOURS_DIR ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
/** how often the transcripts are read again at most (the engine has one thread: never on the send path) */
export const RESCAN_MS = 3 * 60_000;
/** the most asks kept in memory from one transcript (a long session's last ones are its habits now) */
export const PER_FILE = 400;
/** the most asks kept from every transcript together (the newest) */
export const TOTAL = 20_000;
/** a line longer than this is not a person typing (a tool's output, a pasted file): passed over to its end */
export const LINE_MAX = Number(process.env.SOL_YOURS_LINE) > 0 ? Number(process.env.SOL_YOURS_LINE) : 16 << 20;   // SOL_YOURS_LINE: the tests' own
/** bytes read at a time from one transcript */
export const CHUNK = Number(process.env.SOL_YOURS_CHUNK) > 0 ? Number(process.env.SOL_YOURS_CHUNK) : 8 << 20;   // SOL_YOURS_CHUNK: the tests' own

/** a Sol session (sdk-ts) is the person's when they had it open in Build and it is not an agent's part in the dev cycle
 *  nor started by another session: Sol starts sessions of its own (a ticket's executor, a piece's turn) that
 *  must never become "your" habits. Claude Code's (cli) are typed by the person. The tests' own */
/** the sessions the person sent in from Build (yoursKeep.ts records each send it hears): only there is a Sol-written
 *  session's ask theirs. Opening a session is not enough: the engine writes first prompts of its own (a ticket's
 *  executor's brief) and a claude -p run can be opened once */
let typedIn: (session: string, text: string) => boolean = () => false;
export const setTypedIn = (f: (session: string, text: string) => boolean) => { typedIn = f; };
/** what a send is known by (pure): its words with the spaces made one, the first 400 characters, hashed. Only an ask
 *  whose words were heard from Build is the person's: the engine's own later turns in the same session never are */
export const sentKey = (text: string) => createHash("sha256").update(text.replace(/\s+/g, " ").trim().slice(0, 400)).digest("hex").slice(0, 16);
const byRule = (a: Pick<Ask, "session" | "via"> & { text?: string }): boolean => {
  if (!PROGRAM.has(a.via ?? "")) return true;
  const m = workState().marks?.[a.session];
  return typedIn(a.session, a.text ?? "") && !m?.role && !m?.parent;
};
let person = byRule;
export const setPersonRule = (f: ((a: Pick<Ask, "session" | "via">) => boolean) | null) => { person = f ?? byRule; };
/** words a person may have typed (pure): never a wrapper, a stop or a summary */
export const ownWords = (text: string) => !!text && !/^</.test(text) && !/^(Caveat:|\[Request interrupted|This session is being continued)/.test(text);
/** an ask is the person's by the rule in force (a send kept by yoursKeep.ts is judged as a Sol session's line) */
export const theirs = (a: Pick<Ask, "session" | "via" | "text">) => person(a);

/** every ask on this machine in the last `days`, oldest first. Async and from where each file's last read stopped:
 *  only the bytes added since are read, a file that shrank is read again, and a file no longer in the scan is dropped */
export async function readAsks(root = transcriptsRoot(), days = DAYS, now = Date.now()): Promise<Ask[]> {
  const since = now - days * 86_400_000;
  const seen = new Set<string>();
  let dirs: string[] = [];
  try { dirs = await readdir(root); } catch { dirs = []; }
  for (const d of dirs) {
    let files: string[] = [];
    // a project folder that is a link is not followed either
    try { if (!(await lstat(join(root, d))).isDirectory()) continue; files = (await readdir(join(root, d))).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const p = join(root, d, f);
      let st; try { st = await lstat(p); } catch { continue; }
      if (!st.isFile() || st.mtimeMs < since) continue;   // a link is not followed: only Claude's own files are read
      seen.add(p);
      let c = cache.get(p);
      if (c && st.size < c.off) c = undefined;   // rewritten: read again from the start
      if (!c) c = { off: 0, agent: false, asks: [] };
      if (st.size > c.off) {
        try {
          const fh = await open(p, "r");
          try {
            // in chunks of CHUNK bytes, the engine's thread given back between them: a large transcript never blocks it
            let carry = Buffer.alloc(0);
            for (let at = c.off; at < st.size;) {
              const want = Math.min(CHUNK, st.size - at);
              const buf = Buffer.alloc(want);
              const { bytesRead } = await fh.read(buf, 0, want, at);
              if (!bytesRead) break;
              at += bytesRead;
              let got = buf.subarray(0, bytesRead);
              if (c.skip) {   // inside a line too long to be a person's: everything up to its end is passed over
                const nl = got.indexOf(10);
                if (nl < 0) { c = { ...c, off: c.off + got.length }; continue; }
                c = { ...c, off: c.off + nl + 1, skip: false }; got = got.subarray(nl + 1);
              }
              const all = carry.length ? Buffer.concat([carry, got]) : got;
              const end = all.lastIndexOf(10) + 1;   // a line still being written waits for the next read
              if (end > 0) { const r = asksFrom(all.subarray(0, end), c.agent); readSoFar += r.asks.filter((x) => person(x)).length; c = { off: c.off + end, agent: r.agent, asks: c.asks.concat(r.asks).slice(-PER_FILE) }; }
              carry = Buffer.from(all.subarray(end));
              // one line longer than LINE_MAX: passed over to its end, for good (never held, never read again)
              if (carry.length > LINE_MAX) { c = { ...c, off: c.off + carry.length, skip: true }; carry = Buffer.alloc(0); }
              await new Promise((r) => setImmediate(r));
            }
          } finally { await fh.close(); }
        } catch { continue; }
      }
      // only what can still be read stays in memory: asks older than the window go, and at most PER_FILE of a file's newest
      if (c.asks.length && (c.asks[0].at < since || c.asks.length > PER_FILE)) c = { ...c, asks: c.asks.filter((x) => x.at >= since).slice(-PER_FILE) };
      cache.set(p, c);
    }
  }
  for (const p of [...cache.keys()]) if (!seen.has(p)) cache.delete(p);
  let all: Ask[] = [];
  for (const c of cache.values()) for (const a of c.asks) if (a.at >= since && person(a)) all.push(a);
  all.sort((a, b) => a.at - b.at);
  if (all.length > TOTAL) {   // the newest TOTAL across every transcript; the memory held for older ones goes too
    const cut = all[all.length - TOTAL].at;
    all = all.slice(-TOTAL);
    for (const [p, c] of cache) if (c.asks.length && c.asks[0].at < cut) cache.set(p, { ...c, asks: c.asks.filter((x) => x.at >= cut) });
  }
  return all;
}

let snapshot: Ask[] = [], scanned = 0, scanning: Promise<Ask[]> | null = null, changes = 0, lastKey = "";
/** what a read brought, in a few characters (pure): how many asks, and the sum of their times and their lengths */
const keyOf = (a: Ask[]) => { let t = 0, l = 0; for (const x of a) { t = (t + x.at) % 1e15; l += x.text.length; } return `${a.length}:${t}:${l}`; };
// a failed read ends "reading" too (scanned is set either way): the face never polls for ever
const start = (now = Date.now()) => {
  scanning ??= readAsks(transcriptsRoot(), DAYS, now).then((a) => { const k = keyOf(a); if (k !== lastKey) { changes++; lastKey = k; } snapshot = a; scanned = Date.now(); return a; }, () => { scanned = Date.now(); return snapshot; }).finally(() => { scanning = null; });
  return scanning;
};
/** the asks as last read, at once (the send path never waits on a disk); a read starts in the background when the last
 *  one is RESCAN_MS old. The first send after the engine starts finds none: the offer comes on a later one */
export function asksNow(now = Date.now()): Ask[] {
  if (!scanning && now - scanned >= RESCAN_MS) void start(now);
  return snapshot;
}
/** the list opened (not the send path): a read older than `age` is read on, from where it stopped (only what was
 *  appended: milliseconds), waited for at most `wait` ms, so an ask sent a minute ago is a row (the designer, NOW 05:44) */
export async function freshen(age = 10_000, wait = 1500): Promise<void> {
  if (scanned && Date.now() - scanned < age) return;
  let t: NodeJS.Timeout | undefined;
  await Promise.race([start(), new Promise<void>((r) => { t = setTimeout(r, wait); })]);
  clearTimeout(t);
}
/** how many asks the read running now has found so far (the first read's "reading 30 days · n asks") */
let readSoFar = 0;
export const readCount = () => (scanned === 0 ? readSoFar : snapshot.length);
/** the background read, for the tests and the walk: wait for the one running (or start one) */
export async function scanNow(): Promise<Ask[]> { if (!scanning) scanned = 0; asksNow(); return scanning ?? snapshot; }
/** the first read since the engine started has not finished yet (the list says "reading 30 days") */
export const reading = () => scanned === 0;
/** moves only when a read brought different asks (not on every read): what is worked out from them holds until then */
export const readAt = () => changes;
export const _forget = () => { cache.clear(); snapshot = []; scanned = 0; readSoFar = 0; lastKey = ""; };

// ---------------------------------------------------------------- the shape of an ask

const STOP = new Set("a an the and or but to of in on for at by with from as is are was were be been it its this that these those i you we me my your our us he she they them do does did done not no so if then than there here just also can will would should could please ok okay".split(" "));
// a word that changes between asks of the same kind: a number, an issue or PR, a path, a code span, a hash, a URL, a name with digits
const SLOT = /^(#?\d[\w.-]*|[\w.-]*\d[\w.-]*|`[^`]+`|\S*\/\S*|~\S*|https?:\/\/\S+|[0-9a-f]{7,})$/i;
const clean = (w: string) => w.replace(/^[("'`[{]+|[)"'`\]},.;:!?]+$/g, "");

export type Shape = { words: string[]; slots: { at: number; raw: string; before: string; after?: string }[]; head: Set<string> };
/** an ask as words, with the words that change made slots (pure) */
export function shapeOf(text: string): Shape {
  const raw = text.replace(/`[^`\n]*`/g, (m) => m.replace(/\s+/g, " ")).split(/\s+/).filter(Boolean);
  const words: string[] = [], slots: Shape["slots"] = [];
  for (const r of raw) {
    const w = clean(r);
    if (!w) continue;
    if (SLOT.test(w)) { slots.push({ at: words.length, raw: w.replace(/ /g, " "), before: clean(words[words.length - 1] ?? "").toLowerCase() }); words.push("_"); }
    else words.push(w.toLowerCase());
  }
  for (const sl of slots) { const a = words[sl.at + 1]; if (a && a !== "_") sl.after = a; }
  const head = new Set(words.slice(0, HEAD).filter((w) => w !== "_" && !STOP.has(w)));
  return { words, slots, head };
}

export const near = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
};

const CHECKIN = /\b(is (it|this|that) (done|merged|finished|ready|in|landed|green)|where (is|are|does) (it|this|that|we|things)|is it there|status\??$|how far|any (news|update)|eta\b|did it (land|merge|finish|work))/i;
/** a short "is it done / where is it" (pure) */
export const isCheckin = (text: string) => text.split(/\s+/).length <= 14 && CHECKIN.test(text);
const FIX = /^(no\b|nope|not\b|don'?t\b|do not\b|stop\b|wrong\b|again\b|i said\b|i told you\b|that'?s not\b|never\b|instead\b|why did you\b|you (forgot|missed)\b)/i;
/** a correction: right after the agent spoke, it starts by saying no (pure) */
export const isCorrection = (a: Pick<Ask, "text" | "afterAgent">) => a.afterAgent && FIX.test(a.text.trim()) && a.text.split(/\s+/).length <= 80;
/** too small to be a habit: yes, go, continue, thanks */
const tiny = (s: Shape) => s.head.size < 2;

// ---------------------------------------------------------------- grouping

type Group = { kind: OfferKind; rep: Shape; asks: { a: Ask; s: Shape }[] };
/** asks into groups of the same ask, greedily against each group's first (pure) */
export function group(asks: Ask[]): Group[] {
  const gs: Group[] = [];
  const checkins: Group = { kind: "checkin", rep: shapeOf("is it done"), asks: [] };
  for (const a of asks) {
    const s = shapeOf(a.text);
    if (isCheckin(a.text)) { checkins.asks.push({ a, s }); continue; }
    const kind: OfferKind = isCorrection(a) ? "correction" : "ask";
    const sig = kind === "correction" ? fixHead(s) : s.head;
    if (sig.size < (kind === "correction" ? 1 : 2) || (kind === "ask" && tiny(s))) continue;
    let best: Group | null = null, score = 0;
    for (const g of gs) {
      if (g.kind !== kind) continue;
      const v = near(sig, kind === "correction" ? fixHead(g.rep) : g.rep.head);
      if (v > score) { score = v; best = g; }
    }
    if (best && score >= (kind === "correction" ? NEAR_FIX : NEAR)) best.asks.push({ a, s });
    else gs.push({ kind, rep: s, asks: [{ a, s }] });
  }
  if (checkins.asks.length) gs.push(checkins);
  return gs;
}
/** what a correction says after its "no": the words that make it this correction */
const fixHead = (s: Shape) => new Set([...s.head].filter((w) => !/^(no|nope|not|don'?t|stop|wrong|again|said|told|that'?s|never|instead|why|forgot|missed|i)$/.test(w)));

// a blank is named by what its value is (a folder, a file, a date, a number, a link, a name), in the Sol user's words;
// the word before it names it only when the value cannot say it: "PR #12", "issue #12", "branch x"
const BEFORE = new Set(["pr", "issue", "branch", "invoice", "order", "ticket", "room", "table", "week", "chapter", "page"]);
// a number before its unit is named by the unit: "6 hours" is hours
const UNIT = new Set(["hours", "minutes", "days", "weeks", "months", "pages", "words", "items", "people", "slides", "questions", "euros", "dollars", "pounds"]);
/** a slot's name (pure) */
/** words that ask for something: a number after one is no name of it */
const ASKING = /^(pick|take|make|give|get|add|use|write|send|check|do|does|need|have|want|see|show|list|find|keep|set|put|draft|plan|read|run|book|try|choose|select|wait|cut|move|top|last|first|next|about|around|over|under|only|every|than|most|least|least|more|less|just|maybe|need|needs)$/;
export function blankName(before: string, raw: string, taken: Set<string>, after = ""): string {
  let n = BEFORE.has(before) ? (before === "pr" ? "PR" : before)
    : /^\d+(\.\d+)?$/.test(raw) && UNIT.has(after) ? after
    : /^https?:\/\//.test(raw) ? "link"
    : /^\d{4}-\d{2}-\d{2}/.test(raw) ? "date"
    : /\//.test(raw) || /^~/.test(raw) ? (/\.\w{1,5}$/.test(raw) ? "file" : "folder")
    // a bare number after a plain noun is that noun's ("bed 28", "row 29"): never a small word or a verb ("pick 2")
    : /^\d+$/.test(raw) && /^[a-z]{3,}$/.test(before) && !STOP.has(before) && !ASKING.test(before) && !UNIT.has(after) && !/^[a-z]{3,}s$/.test(after) ? before
    : /^#?\d+$/.test(raw) ? "number" : "name";
  let k = n, i = 2;
  while (taken.has(k)) k = `${n} ${i++}`;
  taken.add(k);
  return k;
}

/** the blanks of a group: the newest ask's slots, each with what stood in its place in the others (pure) */
export function blanksOf(g: Group): { blanks: Blank[]; template: string } {
  const newest = g.asks[g.asks.length - 1];
  const taken = new Set<string>();
  const blanks: (Blank & { raw: string; also: string[] })[] = [];
  newest.s.slots.forEach((slot, i) => {
    // a long brief's blanks are in its opening; what changes further down is that one brief's own words
    if (slot.at >= BLANK_WORDS || blanks.length >= BLANKS) return;
    const values: string[] = [];
    for (let j = g.asks.length - 1; j >= 0; j--) {
      const s = g.asks[j].s.slots;
      // the same slot in an older ask: the one after the same word, else the same position
      const o = s.find((x) => x.before && x.before === slot.before) ?? s[i];
      if (o && !values.includes(o.raw)) values.push(o.raw);
    }
    if (values.length < 2) return;   // the same every time: fixed words, not a blank
    // the same thing written again (gh pr view 936 after PR #936; a status file named after the builder): one blank
    const same = (b: { values: string[] }) => b.values.every((v, k) => values[k] !== undefined && (digits(v) && digits(v) === digits(values[k]) || values[k].includes(v) || v.includes(values[k])));
    const twin = blanks.find(same);
    if (twin) { twin.also.push(slot.raw); return; }
    blanks.push({ name: blankName(slot.before, slot.raw, taken, slot.after), values: values.slice(0, 8), raw: slot.raw, also: [] });
  });
  let template = newest.a.text;
  // the newest ask's own words for each blank, longest first, so a value inside another is not cut out of it
  const subs = blanks.flatMap((b) => [b.raw, ...b.also].map((raw) => ({ raw, b }))).sort((x, y) => y.raw.length - x.raw.length);
  for (const { raw, b } of subs) template = template.split(raw).join(b.raw === raw || !raw.includes(b.raw) ? `{${b.name}}` : raw.split(b.raw).join(`{${b.name}}`));
  return { blanks: blanks.map(({ name, values }) => ({ name, values })), template };
}

const digits = (v: string) => v.replace(/\D+/g, "");
export const cut = (t: string, n = EXAMPLE) => { const one = t.replace(/\s+/g, " ").trim(); return one.length > n ? one.slice(0, n - 1).trimEnd() + "…" : one; };
export const idOf = (kind: string, key: string) => createHash("sha256").update(`${kind}\n${key}`).digest("hex").slice(0, 12);
const mostOf = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** the offer one group makes, or null below the bar (pure) */
export function offerOf(g: Group): Offer | null {
  const sessions = new Set(g.asks.map((x) => x.a.session)).size;
  if (g.asks.length < MIN || (g.kind === "ask" && sessions < MIN_SESSIONS)) return null;
  const newestFirst = [...g.asks].reverse();
  const { blanks, template } = g.kind === "ask" ? blanksOf(g) : { blanks: [], template: g.asks[g.asks.length - 1].a.text };
  const words = g.kind === "checkin" ? "is it done? where is it?" : cut(g.rep.words.slice(0, 14).map((w) => (w === "_" ? "____" : w)).join(" "), 90);
  const folder = mostOf(g.asks.map((x) => x.a.cwd));
  const perDay = new Map<string, number>(); for (const x of g.asks) { const k = new Date(x.a.at).toDateString(); perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const rh = g.kind === "correction" ? fixHead(g.rep) : g.rep.head;
  const alike = Math.round(100 * g.asks.reduce((n, x) => { const h = g.kind === "correction" ? fixHead(x.s) : x.s.head; let k = 0; for (const w of rh) if (h.has(w)) k++; return n + (rh.size ? k / rh.size : 0); }, 0) / g.asks.length);
  const sentence =
    g.kind === "ask" ? `You've asked this ${g.asks.length} times${blanks.length ? `, changing only the ${blanks.slice(0, 2).map((b) => b.name).join(" and ")}` : ""}. Keep it as a tool?`
    : g.kind === "checkin" ? `You've asked "is it done?" ${g.asks.length} times. Keep a piece that says where things stand?`
    : `You've corrected the agent this way ${g.asks.length} times. Keep it as a rule?`;
  // the id holds steady while the group grows: its kind and its first ask's head
  const key = g.kind === "checkin" ? "checkin" : [...(g.kind === "correction" ? fixHead(g.rep) : g.rep.head)].slice(0, 12).join(" ");
  return {
    id: idOf(g.kind, key), kind: g.kind, count: g.asks.length, sessions, head: [...(g.kind === "correction" ? fixHead(g.rep) : g.rep.head)].slice(0, HEAD),
    first: g.asks[0].a.at, last: g.asks[g.asks.length - 1].a.at,
    words, examples: newestFirst.slice(0, 3).map((x) => cut(x.a.text)), blanks, template, sentence, folder,
    most: Math.max(...perDay.values()), alike,
  };
}

// ---------------------------------------------------------------- arrangement and closes (the stage's own record)

/** the side of the stage a placed artifact stands on (pure) */
export const sideOf = (x: number, w: number, stageW = STAGE_W): Side => { const mid = x + w / 2; return mid < stageW / 3 ? "left" : mid > (stageW * 2) / 3 ? "right" : "middle"; };
const titleKey = (b: Pick<Block, "title" | "kind">) => `${b.kind} ${b.title.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()}`;

/** what the stage's files say: artifacts moved by hand to the same side, and the same artifact closed, across sessions */
export function stageOffers(root = homeRoot(), only?: string): Offer[] {
  if (!existsSync(root)) return [];
  const out: Offer[] = [];
  // every project the stage has a file for: one with artifacts (projects()), or only sessions whose talk was set
  let named: string[] = [];
  try { named = readdirSync(root).filter((p) => existsSync(join(root, p, "sessions"))); } catch { named = []; }
  for (const project of [...new Set([...projects(), ...named])].sort()) {
    if (only !== undefined && project !== only) continue;   // one project's files, not every project's, per send
    const blocks = new Map(allBlocks(project, true).map((b) => [b.id, b]));
    const placed = new Map<string, { sessions: Set<string>; at: number[]; b: Block; side: Side }>();
    const closed = new Map<string, { sessions: Set<string>; at: number[]; b: Block }>();
    let sids: string[] = [];
    try { sids = readdirSync(join(root, project, "sessions")); } catch { sids = []; }
    // the look: the talk docked or sized the same way by hand in three sessions (its width a share, read to tenths)
    const talks = new Map<string, { sessions: Set<string>; dock: string; width?: number; at: number[] }>();
    for (const sid of sids) {
      const st = getStage(project, sid);
      if (st.talk && (st.talk.dock !== "left" || st.talk.width !== undefined)) {
        const width = st.talk.width !== undefined ? Math.round(st.talk.width * 10) / 10 : undefined;
        const k = `${st.talk.dock}|${width ?? ""}`;
        const e = talks.get(k) ?? { sessions: new Set(), dock: st.talk.dock, ...(width !== undefined ? { width } : {}), at: [] };
        let t = 0; try { t = statSync(join(root, project, "sessions", sid, "stage.json")).mtimeMs; } catch { /* gone */ }
        e.sessions.add(sid); e.at.push(t); talks.set(k, e);
      }
      for (const p of st.blocks) {
        const b = blocks.get(p.id);
        if (!b || !p.hand || p.folded) continue;
        const side = sideOf(p.x, p.w);
        const k = `${titleKey(b)}|${side}`;
        const e = placed.get(k) ?? { sessions: new Set(), at: [], b, side };
        e.sessions.add(sid); e.at.push(b.at); placed.set(k, e);
      }
    }
    for (const b of blocks.values()) {
      for (const l of ledger(project, b.id)) {
        if (l.ev !== "closed") continue;
        const k = titleKey(b);
        const e = closed.get(k) ?? { sessions: new Set(), at: [], b };
        e.sessions.add(b.sessions[b.sessions.length - 1] ?? b.id); e.at.push(l.at); closed.set(k, e);
      }
    }
    for (const [k, e] of placed) {
      if (e.sessions.size < MIN) continue;
      out.push({ id: idOf("arrangement", `${project}|${k}`), kind: "arrangement", count: e.sessions.size, sessions: e.sessions.size, first: Math.min(...e.at), last: Math.max(...e.at),
        words: `${e.b.title} on the ${e.side}`, examples: [], blanks: [], template: "", folder: project, head: [],
        sentence: `You've put ${e.b.title} on the ${e.side} in ${plural(e.sessions.size, "session")}. Keep it there?`, target: { title: e.b.title, kind: e.b.kind, side: e.side } });
    }
    for (const [k, e] of talks) {
      if (e.sessions.size < MIN) continue;
      const where = e.dock === "bottom" ? "at the foot" : e.dock === "full" ? "the whole window" : `on the ${e.dock}`;
      const how = e.width !== undefined ? `${where}, ${Math.round(e.width * 100)}% wide` : where;
      const ats = e.at.filter((x) => x > 0);
      out.push({ id: idOf("look", `${project}|${k}`), kind: "arrangement", count: e.sessions.size, sessions: e.sessions.size, first: ats.length ? Math.min(...ats) : Date.now(), last: ats.length ? Math.max(...ats) : Date.now(),
        words: `the talk ${how}`, examples: [], blanks: [], template: "", folder: project, head: [],
        sentence: `You've set the talk ${how} in ${plural(e.sessions.size, "session")}. Keep it that way?`, target: { title: "the talk", kind: "talk", side: e.dock === "right" ? "right" : e.dock === "left" ? "left" : "middle", dock: e.dock, ...(e.width !== undefined ? { width: e.width } : {}) } });
    }
    for (const [k, e] of closed) {
      if (e.at.length < MIN) continue;
      out.push({ id: idOf("closed", `${project}|${k}`), kind: "closed", count: e.at.length, sessions: e.sessions.size, first: Math.min(...e.at), last: Math.max(...e.at),
        words: `${e.b.title}, closed`, examples: [], blanks: [], template: "", folder: project, head: [],
        sentence: `You've closed ${e.b.title} ${e.at.length} times. Stop opening it?`, target: { title: e.b.title, kind: e.b.kind } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the offers

/** every offer this machine's records hold, the strongest first; `folder` keeps those of one project (its path, or a
 *  folder under it) and the stage's of that project */
export function offers(o: { asks?: Ask[]; stage?: Offer[]; folder?: string; only?: "asks" | "stage" } = {}): Offer[] {
  const inFolder = (cwd: string) => !o.folder || cwd === o.folder || cwd.startsWith(o.folder + "/");
  const fromAsks = o.only === "stage" ? [] : group((o.asks ?? asksNow()).filter((a) => inFolder(a.cwd))).map(offerOf).filter((x): x is Offer => !!x);
  const fromStage = o.only === "asks" ? [] : (o.stage ?? stageOffers(homeRoot(), o.folder ? projectOf(o.folder) : undefined)).filter((x) => !o.folder || x.folder === projectOf(o.folder));
  const weight = (x: Offer) => x.count + x.last / 1e14;   // the most repeated first; the newest breaks a tie
  return [...fromAsks, ...fromStage].sort((a, b) => weight(b) - weight(a));
}

/** a just-sent ask belongs to an offer: the same family, said again (pure). An arrangement or a close is never an ask */
export function belongs(o: Pick<Offer, "kind" | "head">, text: string, afterAgent = true): boolean {
  if (o.kind === "checkin") return isCheckin(text);
  if (o.kind === "correction") return isCorrection({ text, afterAgent }) && near(fixHead(shapeOf(text)), new Set(o.head)) >= NEAR_FIX;
  if (o.kind === "ask") {
    if (isCheckin(text)) return false;
    const h = shapeOf(text).head, g = new Set(o.head);
    // the same ask, or a shorter wording of it: most of what was sent stands in the group's words
    let both = 0; for (const w of h) if (g.has(w)) both++;
    return near(h, g) >= NEAR || (both >= 6 && both / h.size >= 0.6);
  }
  return false;
}
