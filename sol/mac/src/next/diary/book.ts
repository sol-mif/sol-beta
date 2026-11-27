// The diary's book (#1604; the mockup's merge/diary.js, round 3 · C3, functions.json D1–D8), ported as it is. A page a
// day, written as the day goes by the one voice and by the person. The book lives beside the canvas, keyed by D in a
// WeakMap (never inside D), so counts 13 and 14 see D exactly as the AI's calls leave it.
//   note({who, what, region, embed, why})  one line; a line per AI call (the agent's claim/fromRow), per answered ask,
//                                          per piece opened, per life move
//   lines(day) · since(t) · query(words) · headline() · fromRow(row) · claim(seq, row) · forget(id) · book()
//   write · remove_line · pause_diary · flip · to_sticky: the moves (cv/moves/life.ts makes them M's)
// The AI's side (the agent's clock, its ledger H, its rows) is slice 5's: read through hooks.agent when it is there.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { D, S, SCEN, SCN, asksInRegion, dataVer, hooks, open, regionOf, type Data, type Piece } from "../cv/core.ts";
import { changedWords } from "../lead/rules.ts";

export const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
/** the canvas's today: Wednesday, 18 November (the agent's clock agrees); a real Sol's own today once goLive() runs */
export let TODAY0 = Date.UTC(2026, 10, 18);
/** a real Sol (cv/wire/diary.ts): the person's clock. The book reads every time with the UTC getters, so a moment is
 *  kept shifted by the local offset (loc) and prints as the person's own hour */
export let LIVE = false;
export const loc = (at: number) => at - new Date(at).getTimezoneOffset() * 6e4;
export function goLive(): void {
  const d = new Date();
  TODAY0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); LIVE = true;
  const b = book(); b.start = loc(Date.now()); b.loadedAt = Date.now();
}
/** where a line of the person's goes in a real Sol (the wire sets these): the engine keeps it (next.diary.write/remove) */
export const out: { write?: (l: Line) => void; remove?: (l: Line, back: boolean) => void } = {};
/** a line after 21:00 belongs to the next morning's page */
const NIGHT = 3 * HOUR;
export const pageOf = (t: number) => Math.floor((t + NIGHT - TODAY0) / DAY);
const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (t: number) => { const d = new Date(t); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dateWords = (k: number) => { const d = new Date(TODAY0 + k * DAY); return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`; };
export const dayName = (k: number) => (k === 0 ? "Today" : k === -1 ? "Yesterday" : k === 1 ? "Tomorrow" : WD[new Date(TODAY0 + k * DAY).getUTCDay()]);
export const VOICE = "Your AI";
const clone = <T>(x: T): T => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** what a line carries: the thing itself (a piece, a page, a split, a draft, a folder) */
export type Embed = { id?: string | null; kind?: string; open?: string; title?: string; sticky?: string } | null;
export type Line = {
  id: string; t: number; day: number; who: string; what: string; region: string | null; embed: Embed; why: string | null; mine: boolean;
  kind: string; key: string | null; row: string | null; ask: string | null; fn: string | null; gate: string | null; small: boolean;
  proof: { rows?: string[]; piece?: string } | null; removed: boolean; sticky: string | null; via: string | null; asked?: string;
  /** the keys of the facts Sol acted on (the engine's; a session's line or answer): its because… (because/Because.tsx) */
  because?: string[];
  /** the folder agent's sort this line says (the engine's run id): its Undo puts the moves back (cv/moves/setup.ts fsSortBack) */
  sort?: string;
};
export type Page = { k: number; lines: Line[]; closing: { t: number; what: string } | null };
export type Take = { length: string; keeps: string; notes: string; tone: string; first: string | null };
export type Pause = { from: number; to?: number; skipped: number };
export type Query = { words: string; span: string; groups: { who: string; lines: string[] }[]; n: number; before: string | null };
export type Book = {
  name: string; pages: Record<number, Page>; seq: number; paused: Pause | null; pauses: Pause[]; showing: number; read: boolean; take: Take;
  said: string[]; offered: Record<number, string>; loadedAt: number; start: number; asked: Query | null; focus: boolean; sources: string[];
  firstOpens?: Record<string, number>;
};
/** a row of the AI's ledger (slice 5's agent.js H), as the diary reads it */
export type Row = { id: string; who: string; fn: string; args?: Record<string, any>; value?: unknown; gate?: string; ok?: boolean; line?: string; t?: number; undone?: boolean; brief?: string };
/** slice 5's agent, when it is there (hooks.agent): its clock, its ledger, its rows */
type Agent = { clock?: number | null; H?: Row[]; batch?: boolean; brief?: (r: Row) => string; rows?: (n: number) => (Row & { at: string; brief: string })[] };
export const agent = (): Agent | undefined => (hooks as unknown as { agent?: Agent }).agent;
const ledger = (): Row[] => agent()?.H ?? [];

// ---------------------------------------------------------------- the book: one per canvas

const TAKE: Take = { length: "short", keeps: "what mattered", notes: "first", tone: "plain", first: null };
const books = new WeakMap<Data, Book>();
function startOf(name: string): number {
  const l = SCEN[name]?.label || "";
  const h = /11pm/.test(l) ? 23 * 60 : /2am/.test(l) ? 2 * 60 : /morning/.test(l) ? 8 * 60 + 10 : 9 * 60 + 30;
  return TODAY0 + h * MIN;
}
function fresh(name: string): Book {
  return { name, pages: {}, seq: 0, paused: null, pauses: [], showing: 0, read: false, take: { ...TAKE }, said: [], offered: {}, loadedAt: Date.now(), start: startOf(name), asked: null, focus: false, sources: ["Sol"] };
}
export function book(d: Data = D): Book { let b = books.get(d); if (!b) { b = fresh(SCN); books.set(d, b); } return b; }
export function page(k: number, b: Book = book()): Page { return b.pages[k] || (b.pages[k] = { k, lines: [], closing: null }); }
/** the time a line is written: the scripted clock when one is set, else the person's morning plus the time since load */
export function now(b: Book = book()): number { const c = agent()?.clock; if (c != null) return c; if (LIVE) return loc(Date.now()); return b.start + Math.max(0, Date.now() - b.loadedAt); }
export const dayNow = () => { const c = agent()?.clock; return c != null ? pageOf(c) : 0; };
export const allLines = (b: Book = book()) => Object.values(b.pages).flatMap((p) => p.lines);
export const byKey = (key: string, b: Book = book()) => allLines(b).find((l) => l.key === key) || null;
export const byId = (id: string, b: Book = book()) => allLines(b).find((l) => l.id === id) || null;
export const personName = () => (SCEN[SCN]?.label || "You").split(" · ")[0];

// ---------------------------------------------------------------- note: one line

export type NoteIn = {
  who?: string; what?: string; region?: string | null; embed?: Embed | string; why?: string | null; key?: string; row?: string; ask?: string; kind?: string; mine?: boolean;
  force?: boolean; t?: number; day?: number; fn?: string; gate?: string; small?: boolean; proof?: Line["proof"]; via?: string; because?: string[]; sort?: string;
};
export function note(o: NoteIn = {}): string | null {
  const b = book();
  if (!o || !o.what) return null;
  const key = o.key || (o.row ? "row:" + o.row : o.ask ? "ask:" + o.ask : null);
  if (key) { const had = byKey(key, b); if (had) return had.id; }
  if (o.who === "you" || o.who === "You") o = { ...o, who: "person", kind: o.kind || "did", what: /^you\b/i.test(o.what!) ? o.what : "You " + o.what };   // a move of yours, said by life
  const mine = o.mine != null ? !!o.mine : o.who === "person" && (!o.kind || o.kind === "mine");
  if (b.paused && !mine && !o.force) { b.paused.skipped++; return null; }   // "don't write this down": nothing, and the gap is said
  const scripted = o.t != null || agent()?.clock != null;
  const t = o.t != null ? o.t : now(b), day = o.day != null ? o.day : scripted ? pageOf(t) : 0;
  const embed: Embed = typeof o.embed === "string" ? { id: o.embed } : o.embed ? clone(o.embed) : null;
  const l: Line = {
    id: "dl" + ++b.seq, t, day, who: mine ? "person" : String(o.who || VOICE), what: String(o.what).trim(), region: o.region || regionOfThing(embed?.id) || null,
    embed, why: o.why || null, mine, kind: o.kind || (mine ? "mine" : o.ask ? "decided" : "ai"), key, row: o.row || null, ask: o.ask || null, fn: o.fn || null, gate: o.gate || null,
    small: !!o.small, proof: o.proof ? clone(o.proof) : null, removed: false, sticky: null, via: o.via || null, ...(o.because?.length ? { because: [...o.because] } : {}),
    ...(o.sort ? { sort: o.sort } : {}),
  };
  page(day, b).lines.push(l);
  if (mine && !key?.startsWith("eng:")) out.write?.(l);   // a line the engine sent is never sent back
  return l.id;
}
/** a thing's folder is in a scoped Diary (BR1 item 1): the scope itself, or (once folders hold folders) one inside it;
 *  the canvas's Diary (scope null) holds everything, a thing in no folder only that. E's within(id, scope) (cv/core.ts)
 *  takes this one's place when it lands */
export const within = (id: string | null | undefined, scope: string | null) => scope == null || (!!id && id === scope);
export function regionOfThing(id: string | null | undefined): string | null {
  if (!id) return null;
  const p = D.pieces[id];
  if (p) return p.region;
  const blk = blockOf(id);
  if (blk) return blk.region;
  if (regionOf(id)) return id;
  const dr = (D.drafts as Record<string, { region?: string }> | undefined)?.[id];
  return dr?.region ?? null;
}
/** a block an AI attached that still waits in its session's arrivals */
export function blockOf(id: string): ({ id: string; title?: string; placed?: boolean; session: string; region: string } & Record<string, unknown>) | null {
  for (const p of Object.values(D.pieces)) for (const x of (p.arrivals as { id: string }[] | undefined) || []) if (x.id === id) return { ...x, session: p.id, region: p.region };
  return null;
}

// ---------------------------------------------------------------- what an AI call says in the diary: one fact, past tense

/** a session is said by its task, never by an AI's name (a session is not an agent: Marco, 2026-11-21): "fix-login" is
 *  "Fix login"; one an automation started or a seat holds says so */
export function taskOf(p: Piece | null | undefined): string {
  if (!p) return "a session";
  const named = p.name && !(p.copy && p.name.endsWith(" in " + p.copy)) ? p.name : "";
  const raw = String(p.words || named || p.copy || "a session"), t = /\s/.test(raw) ? raw : raw.replace(/[-_]+/g, " ");
  const of = p.of as { automation?: string } | undefined, seat = typeof p.seat === "string" ? p.seat : "";
  return (t[0].toUpperCase() + t.slice(1)) + (of?.automation ? " (automation)" : seat ? ` (seat · ${seat})` : "");
}
/** who wrote a line, said for the page: an AI's name that is a session's is that session's task */
export function sayWho(who: string, region?: string | null): string {
  const ss = Object.values(D.pieces).filter((p) => p.kind === "session" && p.ai === who);
  const s = ss.find((p) => p.region === region) || ss[0];
  return s ? taskOf(s) : who;
}

export function nameOf(id: string | null | undefined): string {
  if (!id) return "it";
  const p = D.pieces[id];
  if (p) return p.kind === "session" ? taskOf(p) : `“${p.name}”`;
  const r = regionOf(id);
  return r ? r.name.replace(/ \(.*\)$/, "") : id;
}
const list = (a: string[]) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const WANT: Record<string, string> = { camera: "move your view", answer: "answer for you", serious: "answer a serious ask", setting: "change a setting", project: "remove a folder", placed: "move a piece you placed" };
export function fromRow(r: Row | null | undefined): string | null {
  if (!r || r.who === "person" || r.who === "probe") return null;
  const a = r.args || {}, v = r.value, f = r.fn;
  let what = "", embed: Embed = null, small = false, kind = "ai", region: string | null = null;
  const pid = a.piece || a.run || a.session || a.parent || a.target || null;
  switch (f) {
    case "look": what = "Looked at where you were."; small = true; break;
    case "read": what = `Read ${nameOf(a.target)}.`; small = true; break;
    case "needs": what = "Went over what needs you."; small = true; break;
    case "since": what = "Read back through the diary."; small = true; break;
    case "find": what = `Looked for “${a.words || ""}”.`; small = true; break;
    case "make": what = `Made ${a.kind || "a piece"} “${a.title || ""}”.`; embed = typeof v === "string" && D.pieces[v] ? { id: v } : null; region = a.region; break;
    case "place": what = `Moved ${nameOf(a.piece)} to a new spot.`; embed = { id: a.piece }; break;
    case "group": region = regionOfThing((a.pieces || [])[0]); what = `Offered to group ${list((a.pieces || []).map(nameOf).filter((x: string, i: number, s: string[]) => s.indexOf(x) === i))}: ${a.evidence || "they belong together"}.`; break;
    case "split": what = `Split ${nameOf(a.piece)} into ${(a.parts || []).length || "parts"}.`; embed = { id: a.piece }; break;
    case "attach": what = `Wrote a page, “${a.block?.title || "a page"}”, for ${nameOf(a.session)}.`;
      embed = { kind: "page", id: typeof v === "string" ? v : null, open: a.session, title: a.block?.title }; kind = "arrived"; break;
    case "start": what = `Started “${a.words || ""}”${a.region ? " in " + nameOf(a.region) : ""}.`; embed = typeof v === "string" && D.pieces[v] ? { id: v } : null; region = a.region; break;
    case "split_run": { const ps = (a.parts || []).map((p: Piece) => taskOf(p)); what = `Split it ${NUM[ps.length] || ps.length} ways: ${list(ps)}.`; embed = { kind: "split", id: a.parent }; break; }
    case "pass": what = `Passed ${nameOf(a.run)} to ${a.to}.`; embed = { id: a.run }; break;
    case "redirect": what = `Told ${nameOf(a.run)}: “${a.words || ""}”.`; embed = { id: a.run }; break;
    case "pause": case "resume": case "stop": what = `${({ pause: "Paused", resume: "Resumed", stop: "Stopped" } as Record<string, string>)[f]} ${nameOf(a.run)}.`; embed = { id: a.run }; break;
    case "check": what = `Checked ${nameOf(a.run)}.`; embed = { id: a.run }; break;
    case "take_back": what = `Asked to take back what ${nameOf(a.run)} changed.`; embed = { id: a.run }; break;
    case "ask": what = `Asked you: ${String(a.words || "").replace(/^\w+: /, "")}`; embed = { id: a.piece }; kind = "ask"; break;
    case "withdraw": what = "Took back one of its asks."; small = true; break;
    case "tell": what = a.words || ""; embed = a.piece ? { id: a.piece } : null; break;
    case "headline": what = a.outcome || ""; kind = "headline"; region = null; break;
    case "offer": what = `Offered a new way to work: ${a.take?.what || a.take || ""}.`; break;
    case "point": what = `Pointed you at ${nameOf(a.target)}${a.words ? ": " + String(a.words).replace(/\.$/, "") + "." : "."}`; embed = { id: a.target }; break;
    case "beside": what = `Suggested ${nameOf(a.piece)} beside.`; break;
    case "write": what = a.words || ""; region = a.region || null; embed = a.embed || null; break;
    case "remove_line": what = "Removed one of its own lines."; small = true; break;
    case "sticky": what = `Made a sticky: “${a.words || ""}”.`; region = a.region; embed = typeof v === "string" ? { id: v } : null; break;
    case "run_sticky": what = `Worked on ${nameOf(a.id || a.sticky)}.`; embed = { id: a.id || a.sticky }; break;
    case "finish": what = `Marked ${nameOf(a.id)} done.`; embed = { id: a.id }; break;
    case "drop": what = `Asked to drop ${nameOf(a.id)}.`; embed = { id: a.id }; break;
    case "due": what = `Set ${nameOf(a.id)} due ${a.when || ""}.`; embed = { id: a.id }; break;
    default: what = `${f.replace("_", " ")}.`;
  }
  if (r.gate === "refused") { what = `Wanted to ${WANT[refusedKind(r)] || f.replace("_", " ")}; left it, since that is yours.`; small = true; embed = null; kind = "ai"; }
  if (r.ok === false && r.gate !== "refused" && r.line) what += ` It could not: ${r.line}`;
  const why = r.gate === "draft" ? "waits for your press" : r.gate === "ask" && kind !== "ask" ? "needs you" : null;
  return note({ who: r.who, what, region: region || regionOfThing(pid) || (embed && regionOfThing(embed.id)) || null, embed, why, row: r.id, fn: f, gate: r.gate, small, kind,
    proof: f === "headline" ? a.proof : null, t: agent()?.clock != null ? r.t : undefined });
}
function refusedKind(r: Row): string {
  const n = r.fn;
  if (["pan", "zoom", "enter", "leave", "in", "out", "jump", "goto", "dive", "map", "back", "fwd", "recent", "door", "drawer", "pane", "next", "follow", "flip"].includes(n)) return "camera";
  if (["answer", "accept", "refuse", "keep"].includes(n)) return "answer";
  if (["remove_region", "keep_region", "remove"].includes(n)) return "project";
  return "setting";
}

// ---------------------------------------------------------------- the person's side: answered asks, pieces opened

let lastSeen: string | null = null;
/** swept on every change: one line per answered ask and per piece opened */
export function sweep(): void {
  if (!D || !S) return;
  const b = book();
  for (const a of Object.values(D.asks || {})) if (a.answered && !a.withdrawn && !byKey("ask:" + a.id, b)) {
    const p = D.pieces[a.piece];
    note({ who: "person", kind: "decided", ask: a.id, what: `You said ${a.said === "no" ? "no" : "yes"}: ${shortAsk(a.text)}`, region: p ? p.region : null, embed: { id: a.part || a.piece },
      why: a.by ? `${a.by} asked` : a.source ? `${a.source.split(" · ")[0]} asked` : null });
  }
  const here = S.dist === "near" && S.piece && D.pieces[S.piece] ? S.piece : null;
  if (here && here !== lastSeen) { const key = "open:" + here + ":" + dayNow(); if (!byKey(key, b)) note({ who: "person", kind: "opened", key, what: `You opened ${nameOf(here)}.`, region: D.pieces[here].region, embed: { id: here }, small: true }); }
  lastSeen = here;
}
const shortAsk = (t: string) => String(t || "").replace(/^[A-Z][\w-]*(?: \([^)]*\))?: /, "").replace(/\s*(Allow|Confirm|Accept)\?$/, "").replace(/\?$/, "").trim();

// ---------------------------------------------------------------- reading the diary

export function lines(k: number = book().showing, { removed = false } = {}): Line[] { const p = book().pages[k]; return p ? p.lines.filter((l) => removed || !l.removed) : []; }
export const rowOf = (id: string | null) => (id ? ledger().find((r) => r.id === id) ?? null : null);
/** every line from t on, all pages, in order (the agent's since() reads this) */
export function since(t = 0) {
  return allLines().filter((l) => !l.removed && l.t >= t).sort((a, b) => a.t - b.t).map((l) => {
    const r = rowOf(l.row);
    return { id: l.row || l.id, line: l.id, t: l.t, at: hm(l.t), who: l.who, fn: l.fn, gate: l.gate, text: l.what, region: l.region, mine: l.mine, undone: !!r?.undone, brief: r && agent()?.brief ? agent()!.brief!(r) : l.what };
  });
}
/** the headline: the newest headline line still standing (its proof rows not undone, its piece there) */
export function headline(): { text: string; proof: NonNullable<Line["proof"]>; ai: string; at: string; line: string } | null {
  const H = ledger();
  const ls = allLines().filter((l) => l.kind === "headline" && !l.removed && l.day <= 0).sort((a, b) => b.t - a.t);
  for (const l of ls) {
    const p = l.proof || {}, r = rowOf(l.row);
    if (r?.undone) continue;
    const ok = (p.rows || []).every((id) => { const x = H.find((y) => y.id === id); return x && !x.undone && x.ok; }) && (!p.piece || !!D.pieces[p.piece]);
    if (ok && ((p.rows || []).length || p.piece)) return { text: l.what, proof: p, ai: l.who, at: hm(l.t), line: l.id };
  }
  return null;
}
/** a question to the diary: "which AI changed what in the last hour", "what did fix login do yesterday", "what did I decide today" */
const CHANGING = new Set(["make", "place", "group", "split", "attach", "start", "split_run", "pass", "redirect", "pause", "resume", "stop", "check", "take_back", "sticky", "run_sticky", "finish", "drop", "due", "write", "tell"]);
export function query(words: string): Query {
  const w = String(words || "").toLowerCase(), b = book(), n = now(b);
  let from = -Infinity, to = Infinity, span = "", m: RegExpExecArray | null;
  if ((m = /last (\d+|an?|one|two|three) (hour|minute)s?/.exec(w))) {
    const k = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1]] || +m[1];
    from = n - k * (m[2] === "hour" ? HOUR : MIN); span = `in the last ${k === 1 ? "" : k + " "}${m[2]}${k === 1 ? "" : "s"}`;
  } else if (/yesterday/.test(w)) { from = TODAY0 - DAY - NIGHT; to = TODAY0 - NIGHT; span = "yesterday"; }
  else if (/night|overnight|while i was away/.test(w)) { from = TODAY0 - NIGHT; to = b.start; span = "overnight"; }
  else { from = TODAY0 - NIGHT; span = "today"; }
  const ais = new Set([VOICE, ...(D.ais || []).map((a) => a.name), ...((D.crew as { name: string }[] | undefined) || []).map((c) => c.name),
    ...Object.values(D.pieces).filter((p) => p.kind === "session").map(taskOf)]);
  const named = [...ais].find((a) => new RegExp("\\b" + a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(w));
  const mineQ = /\b(i|me|my)\b/.test(w) && !/which ai/.test(w);
  const ls = allLines().filter((l) => !l.removed && l.t >= from && l.t < to && (mineQ ? l.mine || l.kind === "decided" : !l.mine && l.kind !== "decided" && l.kind !== "opened") && (!named || l.who === named || l.what.includes(named))
    && (/changed|did|made/.test(w) && !mineQ ? CHANGING.has(l.fn as string) || (!l.fn && !l.small) : true)).sort((a, b) => a.t - b.t);
  const by: Record<string, Line[]> = {};
  for (const l of ls) (by[l.who] = by[l.who] || []).push(l);
  const latest = ls.length ? null : allLines().filter((l) => !l.removed && !l.mine && l.t < from && CHANGING.has(l.fn as string)).sort((a, b) => b.t - a.t)[0] || null;
  return { words: String(words), span, groups: Object.entries(by).map(([who, l]) => ({ who, lines: l.map((x) => x.id) })), n: ls.length, before: latest ? latest.id : null };
}

// ---------------------------------------------------------------- yesterday: a real day, seeded through hooks.onLoad

/** the person's own lines are the panel's people's (sample data); the AI's lines are read from the canvas itself */
const OWN: Record<string, [string | null, string][]> = {
  dev: [["api", "The migration waits until the login fix is in."], [null, "Ask for a test database that isn’t staging."]],
  jayden: [["cs", "Start HW3 with the linked-list tests, then the essay."], [null, "Chapter 4 on the bus tomorrow."]],
  denise: [["kids", "Mia’s school form is in the blue folder."], [null, "Call mum on Sunday."]],
  minji: [["studio", "The client likes the second hero best."]], sam: [],
};
const blankLine = (b: Book, o: Partial<Line>): Line => ({
  id: "dl" + ++b.seq, t: 0, day: -1, who: VOICE, what: "", mine: false, kind: "ai", key: null, row: null, ask: null, fn: "tell", gate: "do",
  small: false, proof: null, removed: false, sticky: null, embed: null, why: null, region: null, via: null, ...o,
});
export function seed(d: Data, name: string): void {
  const b = fresh(name);
  books.set(d, b);
  lastSeen = null;
  if (name === "fresh") return;   // Sam starts today: no yesterday yet
  const who = name.startsWith("jayden") ? "jayden" : name.startsWith("denise") ? "denise" : name.startsWith("minji") ? "minji" : "dev";
  const at = (h: number, m: number) => TODAY0 - DAY + (h * 60 + m) * MIN;
  const L = (h: number, m: number, o: Partial<Line>) => { const l = blankLine(b, { t: at(h, m), day: -1, ...o }); page(-1, b).lines.push(l); return l; };
  const regs = d.regions, sess = Object.values(d.pieces).filter((p) => p.kind === "session"), life = Object.values(d.pieces).filter((p) => p.text && p.kind !== "session");
  let h = 8, m = 40;
  const tick = (k: number): [number, number] => { m += k; while (m >= 60) { m -= 60; h++; } return [h, m]; };
  // the morning's story, folded: yesterday's page was read
  L(7, 30, { kind: "headline", what: sess.length ? `${sess.length === 1 ? taskOf(sess[0]) + " kept working" : sess.length + " sessions kept working"} overnight; nothing needed you before nine.` : `Your ${regs.length} folders stayed as you left them.` });
  for (const [i, s] of sess.slice(0, 6).entries()) {
    const [hh, mm] = tick(37 + i * 23);
    L(hh, mm, { who: taskOf(s), region: s.region, what: i % 3 === 2 ? "Ran its tests: all passing." : `Changed ${Math.max(2, Math.round((s.files ?? 0) * 0.6))} files.`, fn: i % 3 === 2 ? "check" : "start", embed: { id: s.id } });
  }
  for (const [i, p] of life.slice(0, 2).entries()) { const [hh, mm] = tick(29 + i * 41); L(hh, mm, { who: "person", mine: false, kind: "opened", region: p.region, what: `You opened “${p.name}”.`, small: true, embed: { id: p.id } }); }
  const [dh, dm] = tick(18);
  if (sess[1]) L(dh, dm, { who: "person", kind: "decided", region: sess[1].region, what: `You let ${taskOf(sess[1])} run its tests.`, embed: { id: sess[1].id } });
  for (const [i, [rid, w]] of (OWN[who] || []).entries()) { const [hh, mm] = tick(53 + i * 71); L(hh, mm, { who: "person", mine: true, kind: "mine", region: rid && d.regions.some((r) => r.id === rid) ? rid : null, what: w }); }
  if (sess[0]) { const [hh, mm] = tick(46); L(hh, mm, { who: VOICE, region: sess[0].region, what: `Made a note of what ${taskOf(sess[0])} changed, for the morning.`, kind: "arrived", fn: "make" }); }
  // the opens that teach a take: the folder you went to first most days
  const top = sess[0] ? sess[0].region : regs[0]?.id;
  page(-1, b).closing = { t: at(21, 10), what: closingOf(page(-1, b).lines) };
  b.firstOpens = top ? { [top]: 3 } : {};
  if (!/^ai-/.test(name)) seedNight(d, b, sess);
}
/** today, before you came back: what the sessions did and what they asked, from the canvas as loaded (ai-night writes its own) */
function seedNight(d: Data, b: Book, sess: Piece[]): void {
  const ss = sess.filter((s) => (s.files ?? 0) > 0).sort((a, c) => (c.files ?? 0) - (a.files ?? 0)).slice(0, 4);
  const asks = Object.values(d.asks || {}).filter((a) => !a.answered && !a.withdrawn && d.pieces[a.piece]);
  const n = ss.length + asks.length, span = Math.min(7.5 * 60, (b.start - TODAY0 + 3 * 60 * MIN) / MIN - 20);
  let i = 0;
  const at = () => b.start - Math.round(((n - i++) * span) / Math.max(1, n)) * MIN;
  const L = (o: Partial<Line>) => page(0, b).lines.push(blankLine(b, { day: 0, fn: "start", ...o }));
  const regionOfEv = (x: { s?: Piece; a?: { piece: string } }) => (x.s ? x.s.region : d.pieces[x.a!.piece].region);
  const ev = [...ss.map((s) => ({ s })), ...asks.map((a) => ({ a }))].sort((x, y) => (regionOfEv(x) < regionOfEv(y) ? -1 : 1));
  for (const e of ev) {
    const t = at();
    if ("s" in e) L({ t, who: taskOf(e.s), region: e.s.region, what: `${changedWords(e.s.files).replace(/^./, (c) => c.toUpperCase())}${e.s.tests ? `; tests: ${e.s.tests}` : ""}.`, embed: { id: e.s.id } });
    else { const p = d.pieces[e.a.piece]; L({ t, who: p.kind === "session" ? taskOf(p) : p.ai || VOICE, region: p.region, kind: "ask", asked: e.a.id, key: "asked:" + e.a.id, fn: "ask", gate: "ask", what: `Asked you: ${String(e.a.text).replace(/^[a-z][\w-]*: /i, "")}`, embed: { id: e.a.part || e.a.piece } }); }
  }
  page(0, b).lines.sort((x, y) => x.t - y.t);
}
function closingOf(ls: Line[]): string {
  const done = ls.filter((l) => !l.mine && !l.small && l.kind !== "headline").length, dec = ls.filter((l) => l.kind === "decided").length, own = ls.filter((l) => l.mine).length;
  const by: Record<string, number> = {};
  ls.filter((l) => l.region).forEach((l) => (by[l.region!] = (by[l.region!] || 0) + 1));
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const where = top ? (regionOf(top[0]) || { name: top[0] }).name.replace(/ \(.*\)$/, "") : null;
  return `${done ? `${done} thing${done === 1 ? "" : "s"} done` : "A quiet day"}${where ? `, most of it in ${where}` : ""}; you decided ${dec || "nothing"}${own ? ` and wrote ${own === 1 ? "one line" : own + " lines"}` : ""}.`;
}

// ---------------------------------------------------------------- the seam with the agent (slice 5)

/** a call whose move already told the diary (life's moves do) keeps that line as its one line; else fromRow writes it */
export function claim(seq: number, r: Row | null | undefined): string | null {
  if (!r) return null;
  const b = book();
  if (r.who === "person" || r.who === "probe") return null;
  const l = allLines(b).find((x) => +x.id.slice(2) > seq && !x.key && x.who === r.who);
  if (!l) return fromRow(r);
  l.key = "row:" + r.id; l.row = r.id; l.fn = r.fn; l.gate = r.gate ?? null;
  return l.id;
}
export const forget = (id: string | null | undefined) => { if (id == null) return; const l = byId(id); if (l) l.removed = true; };

// ---------------------------------------------------------------- takes: how it writes; at most one offer a day

export const TAKES: Record<keyof Omit<Take, "first">, Record<string, string>> = {
  length: { short: "short", full: "every line" }, keeps: { "what mattered": "what mattered", everything: "everything" },
  notes: { first: "your lines first", last: "your lines last" }, tone: { plain: "plain", warm: "warm" },
};
export function offerOf(): { k: keyof Take; v: string; words: string } | null {
  const b = book(), d = dayNow();
  if (b.offered[d] === "done") return null;
  const top = Object.entries(b.firstOpens || {}).sort((a, c) => c[1] - a[1])[0];
  if (top && top[1] >= 3 && b.take.first !== top[0] && regionOf(top[0])) return { k: "first", v: top[0], words: `You open ${regionOf(top[0])!.name.replace(/ \(.*\)$/, "")} first most mornings. Start the page with it?` };
  if (lines(0).filter((l) => l.mine).length >= 3 && b.take.notes !== "first") return { k: "notes", v: "first", words: "You write here often. Put your own lines first?" };
  return null;
}

/** the folders the page groups its lines by, most relevant first (asks, waiting things, lines, then newest) */
export function groups(ls: Line[], take: Take): { k: string; lines: Line[] }[] {
  // kept per version of the data (#1615 S32): a pan draws the page again, it does not score it again
  const key = `${dataVer()} ${take.notes} ${take.first} ${ls.map((l) => l.id).join(",")}`;
  if (kept && kept.d === D && kept.key === key) return kept.gs;
  const gs = groupsNow(ls, take);
  kept = { d: D, key, gs };
  return gs;
}
let kept: { d: Data; key: string; gs: { k: string; lines: Line[] }[] } | null = null;
function groupsNow(ls: Line[], take: Take): { k: string; lines: Line[] }[] {
  const by = new Map<string, Line[]>();
  for (const l of ls) { const k = l.mine && !l.region ? "~mine" : l.region && regionOf(l.region) ? l.region : "~all"; if (!by.has(k)) by.set(k, []); by.get(k)!.push(l); }
  const drafts = (D.drafts as Record<string, { pressed?: boolean; region?: string }> | undefined) || {};
  const waiting = (rid: string) => Object.values(drafts).filter((x) => !x.pressed && x.region === rid).length
    + Object.values(D.pieces).filter((p) => p.region === rid).reduce((n, p) => n + ((p.arrivals as { placed?: boolean }[] | undefined) || []).filter((x) => !x.placed).length, 0);
  const score = (k: string) => (k === "~mine" ? (take.notes === "first" ? 1e7 : -1e7) : k === "~all" ? -1e6
    : (take.first === k ? 1e6 : 0) + asksInRegion(k).length * 100 + waiting(k) * 50 + by.get(k)!.filter((l) => !l.small).length + Math.max(...by.get(k)!.map((l) => l.t)) / 1e13);
  return [...by.keys()].sort((a, b) => score(b) - score(a)).map((k) => ({ k, lines: by.get(k)!.sort((a, b) => a.t - b.t) }));
}
export const openAsks = open;
