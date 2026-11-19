// The ticket store (the superagent model, first sitting 2026-11-12; the contract: ticketTypes.ts `Store`). One file per
// ticket, written whole on every change, so a session's talk can fill, end or be replaced and the work's state stays
// here. No index is kept: the folder is the truth, read once and cached. A file that does not parse is skipped and left
// as it is (never rewritten, never deleted), so a hand edit gone wrong costs that one ticket and nothing else.
//
//   <STATE_DIR>/tickets/<id>.json         the ticket (tmp + rename)
//   <STATE_DIR>/tickets/<id>.log.jsonl    its log lines pushed out past LOG_CAP, oldest first (appended, never rewritten)
//
// Sync throughout: every caller (executor.ts, an orchestration session's tools) reads its write back at once.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { STATE_DIR } from "./state.js";
import { CLOSED, type By, type LogLine, type Mandate, type OpenIn, type Past, type Store, type Sub, type Ticket, type TicketState } from "./ticketTypes.js";

export const LOG_CAP = 200;
export const DIR = join(STATE_DIR, "tickets");
export const fileOf = (id: string) => join(DIR, `${id}.json`);
export const logFileOf = (id: string) => join(DIR, `${id}.log.jsonl`);
const UNTIL = "it comes back with what it made and stops";

let cache: Map<string, Ticket> | null = null;
let top = 0;   // the highest n ever seen (corrupt files too), so a number is never given twice
const listeners = new Set<(t: Ticket) => void>();

const isClosed = (s: TicketState) => CLOSED.includes(s);
const line1 = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const copy = (t: Ticket): Ticket => structuredClone(t);
const okTicket = (v: any): v is Ticket =>
  v && typeof v === "object" && typeof v.id === "string" && /^[0-9a-f]{8}$/.test(v.id) && Number.isInteger(v.n) && typeof v.title === "string" && Array.isArray(v.log);

function load(): Map<string, Ticket> {
  if (cache) return cache;
  cache = new Map();
  let names: string[] = [];
  try { names = readdirSync(DIR); } catch { /* no folder yet: no tickets */ }
  for (const f of names) {
    const m = /^([0-9a-f]{8})\.json$/.exec(f);
    if (!m) continue;
    let text = "";
    try { text = readFileSync(join(DIR, f), "utf8"); } catch { continue; }
    try {
      const v = JSON.parse(text);
      if (!okTicket(v) || v.id !== m[1]) throw new Error("not a ticket");
      // fields a hand edit may have dropped come back empty, so the rest of the store never meets an undefined list
      v.subs ??= []; v.past ??= []; v.summary ??= ""; v.ask ??= "";
      v.mandate = { ...{ may: [], mayNot: [], until: UNTIL, free: "edits" }, ...(v.mandate ?? {}) };
      cache.set(v.id, v);
      top = Math.max(top, v.n);
    } catch {
      // skipped, left untouched; its number (if it can still be read) is not given again
      const n = /"n"\s*:\s*(\d+)/.exec(text);
      if (n) top = Math.max(top, Number(n[1]));
    }
  }
  return cache;
}

function write(t: Ticket) {
  t.updatedAt = Math.max(Date.now(), t.updatedAt);
  mkdirSync(DIR, { recursive: true });
  const f = fileOf(t.id), tmp = f + ".tmp";
  writeFileSync(tmp, JSON.stringify(t, null, 1));
  renameSync(tmp, f);
  load().set(t.id, t);
  const c = copy(t);
  for (const fn of listeners) { try { fn(c); } catch { /* a listener's fault is its own */ } }
}

/** the ticket itself (not a copy), or a throw: every change names a ticket that exists */
function must(ref: string): Ticket {
  const t = byRef(ref);
  if (!t) throw new Error(`no ticket ${ref}`);
  return t;
}

function byRef(ref: string | number): Ticket | undefined {
  const all = load();
  if (typeof ref === "number") return [...all.values()].find((t) => t.n === ref);
  const s = String(ref ?? "").trim().toLowerCase();
  if (all.has(s)) return all.get(s);
  const m = /^(?:ticket\s*)?#?\s*(\d+)$/.exec(s);
  if (m) return [...all.values()].find((t) => t.n === Number(m[1]));
  return undefined;
}

function cleanList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => line1(String(x ?? ""), 200)).filter(Boolean).slice(0, 12);
}

/** what of a patch is kept: lists cut, `where` only an absolute path ("" clears it), `free` only ask or edits */
function cleanMandate(p: Partial<Mandate> | undefined): Partial<Mandate> {
  const r: Partial<Mandate> = {};
  if (!p) return r;
  const may = cleanList(p.may), mayNot = cleanList(p.mayNot);
  if (may) r.may = may;
  if (mayNot) r.mayNot = mayNot;
  if (typeof p.until === "string" && p.until.trim()) r.until = line1(p.until, 300);
  if (typeof p.where === "string" && (p.where === "" || isAbsolute(p.where))) r.where = p.where;
  if (p.free === "ask" || p.free === "edits") r.free = p.free;
  return r;
}

function merge(m: Mandate, p: Partial<Mandate>): Mandate {
  const r: Mandate = { ...m, ...p };
  if (r.where === "" || r.where === undefined) delete r.where;
  return r;
}

function pushLog(t: Ticket, l: Omit<LogLine, "at">) {
  const line: LogLine = { at: Date.now(), by: l.by, kind: l.kind, text: String(l.text ?? "").slice(0, 2000), ...(l.session ? { session: l.session } : {}) };
  t.log.push(line);
  if (t.log.length > LOG_CAP) {
    // the jsonl is written before the ticket, so a crash between the two can at worst repeat lines, never lose them
    const out = t.log.splice(0, t.log.length - LOG_CAP);
    mkdirSync(DIR, { recursive: true });
    appendFileSync(logFileOf(t.id), out.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
}

export function open(a: OpenIn): Ticket {
  const all = load();
  let id = randomBytes(4).toString("hex");
  while (all.has(id) || existsSync(fileOf(id))) id = randomBytes(4).toString("hex");
  for (const t of all.values()) top = Math.max(top, t.n);
  const now = Date.now();
  const t: Ticket = {
    id, n: ++top, title: line1(String(a.title ?? ""), 80) || "untitled", ask: String(a.ask ?? "").slice(0, 4000),
    mandate: merge({ may: [], mayNot: [], until: UNTIL, free: "edits" }, cleanMandate(a.mandate)),
    state: "open", summary: "just opened", log: [], subs: a.sub ? [{ kind: "session", key: a.sub, at: now }] : [], past: [],
    at: now, updatedAt: now,
  };
  pushLog(t, { by: a.by ?? "orchestrator", kind: "opened", text: "opened" });
  write(t);
  return copy(t);
}

export function get(id: string | number): Ticket | undefined {
  const t = byRef(id);
  return t && copy(t);
}

const newest = (a: Ticket, b: Ticket) => b.updatedAt - a.updatedAt || b.n - a.n;

export function list(f?: { closed?: boolean }): Ticket[] {
  return [...load().values()].filter((t) => f?.closed || !isClosed(t.state)).sort(newest).map(copy);
}

// words that say nothing about which piece of work is meant
const STOP = new Set(("the and for are but not you all any can had her was one our out has him his how its may new now old see two way who did " +
  "get got let put say she too use with that this from have what when will your they them then than there their about would could should " +
  "into just like some more make made also been were here only over very want need does done thing things stuff that's it's please " +
  "ticket tickets work working one ones bit lot sure yes okay back again still").split(" "));
/** a word as compared: lower case, a plural's s taken off ("logins" reaches "login"; "class" stays) */
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem));

export function find(q: string): Ticket[] {
  const s = String(q ?? "");
  const all = load();
  // a number or id named outright wins: the whole line a number ("3", "#3", "ticket 3"), or "#3" / "ticket 3" / an id
  // anywhere in it. A bare number inside a sentence ("fix the 2 failing tests") is not a ticket
  const whole = byRef(s);
  if (whole) return [copy(whole)];
  for (const m of s.matchAll(/(?:#|\bticket\s*#?\s*)(\d+)\b/gi)) {
    const t = byRef(Number(m[1]));
    if (t) return [copy(t)];
  }
  for (const m of s.toLowerCase().matchAll(/\b[0-9a-f]{8}\b/g)) if (all.has(m[0])) return [copy(all.get(m[0])!)];
  const want = words(s);
  if (!want.size) return [];
  const scored: { t: Ticket; score: number }[] = [];
  for (const t of all.values()) {
    const title = words(t.title), ask = words(t.ask);
    let score = 0;
    for (const w of want) score += title.has(w) ? 2 : ask.has(w) ? 1 : 0;   // a word of the title says more than one of the ask
    if (score) scored.push({ t, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || Number(isClosed(a.t.state)) - Number(isClosed(b.t.state)) || newest(a.t, b.t))
    .slice(0, 5).map((x) => copy(x.t));
}

export function log(id: string, line: Omit<LogLine, "at">): Ticket {
  const t = must(id);
  pushLog(t, line);
  write(t);
  return copy(t);
}

export function setState(id: string, s: { state: TicketState; summary?: string; waitsOn?: string; by: By }): Ticket {
  const t = must(id);
  const from = t.state;
  // a closed ticket stays as it was unless it is reopened: a late report of its executor cannot undo a done
  if (isClosed(from) && s.state !== "open") return copy(t);
  const summary = s.summary !== undefined ? line1(s.summary, 160) : t.summary;
  const waitsOn = s.state === "waiting" ? (s.waitsOn !== undefined ? line1(s.waitsOn, 200) || undefined : from === "waiting" ? t.waitsOn : undefined) : undefined;
  if (from === s.state && summary === t.summary && waitsOn === t.waitsOn) return copy(t);
  t.state = s.state; t.summary = summary;
  if (waitsOn) t.waitsOn = waitsOn; else delete t.waitsOn;
  const head = from === s.state ? `still ${from}` : `${from} → ${s.state}`;
  pushLog(t, { by: s.by, kind: "state", text: head + (waitsOn ? ` (waits on: ${waitsOn})` : "") + (s.summary !== undefined && summary ? `: ${summary}` : "") });
  write(t);
  return copy(t);
}

/** what a mandate change did, in words: "may now: a, b; may not: none; until: x" */
function said(before: Mandate, after: Mandate): string {
  const ls = (x: string[]) => (x.length ? x.join(", ") : "none");
  const r: string[] = [];
  if (ls(before.may) !== ls(after.may)) r.push(`may now: ${ls(after.may)}`);
  if (ls(before.mayNot) !== ls(after.mayNot)) r.push(`may not now: ${ls(after.mayNot)}`);
  if (before.until !== after.until) r.push(`until: ${after.until} (was: ${before.until})`);
  if (before.where !== after.where) r.push(after.where ? `where: ${after.where}` : "where: no folder of its own");
  if (before.free !== after.free) r.push(after.free === "ask" ? "how free: asks before every step" : "how free: changes files in its folder on its own");
  return r.join("; ");
}

export function setMandate(id: string, patch: Partial<Mandate>, by: By): Ticket {
  const t = must(id);
  const after = merge(t.mandate, cleanMandate(patch));
  const text = said(t.mandate, after);
  if (!text) return copy(t);
  t.mandate = after;
  pushLog(t, { by, kind: "mandate", text });
  write(t);
  return copy(t);
}

const WHY: Record<Past["why"], string> = { full: "its talk was full", asked: "it was asked for", lost: "it was lost" };

export function setExecutor(id: string, e: { sessionId: string; cwd: string } | null, was?: { why: Past["why"]; noted: boolean }): Ticket {
  const t = must(id);
  // the same session again is a resume, not a new copy
  if (e && t.executor?.sessionId === e.sessionId) return copy(t);
  if (!e && !t.executor) return copy(t);
  const now = Date.now();
  const cur = t.executor;
  if (cur) {
    const why = was?.why ?? "lost";
    t.past.push({ sessionId: cur.sessionId, from: cur.at, to: now, context: cur.context ?? 0, window: cur.window ?? 0, why, noted: was?.noted ?? false });
    if (!e) pushLog(t, { by: "engine", kind: "executor", text: `copy ${cur.n} stopped: ${WHY[why]}`, session: cur.sessionId });
  }
  if (e) {
    t.executor = { sessionId: e.sessionId, cwd: e.cwd, at: now, n: t.past.length + 1 };
    pushLog(t, { by: "engine", kind: "executor", text: `copy ${t.executor.n} started in ${e.cwd}` + (cur ? ` (copy ${cur.n} replaced: ${WHY[was?.why ?? "lost"]})` : ""), session: e.sessionId });
  } else delete t.executor;
  write(t);
  return copy(t);
}

/** where the current executor really works, once the engine says (its side copy of a repo): a fresh copy starts there.
 *  No log line: the start line already said where it began, and this is the same copy in the same work */
export function setCwd(id: string, cwd: string): Ticket {
  const t = must(id);
  const x = t.executor;
  if (!x || typeof cwd !== "string" || !isAbsolute(cwd) || x.cwd === cwd) return copy(t);
  x.cwd = cwd;
  write(t);
  return copy(t);
}

export function setFill(id: string, context: number, window: number): Ticket {
  const t = must(id);
  const x = t.executor;
  if (!x || (x.context === context && x.window === window)) return copy(t);
  x.context = context; x.window = window;
  write(t);
  return copy(t);
}

export function subscribe(id: string, sub: Omit<Sub, "at">): Ticket {
  const t = must(id);
  if (t.subs.some((s) => s.kind === sub.kind && s.key === sub.key)) return copy(t);
  t.subs.push({ kind: sub.kind, key: sub.key, at: Date.now() });
  write(t);
  return copy(t);
}

export function unsubscribe(id: string, sub: Omit<Sub, "at">): Ticket {
  const t = must(id);
  const keep = t.subs.filter((s) => !(s.kind === sub.kind && s.key === sub.key));
  if (keep.length === t.subs.length) return copy(t);
  t.subs = keep;
  write(t);
  return copy(t);
}

export function subscribed(kind: Sub["kind"], key: string): Ticket[] {
  return [...load().values()].filter((t) => !isClosed(t.state) && t.subs.some((s) => s.kind === kind && s.key === key)).sort(newest).map(copy);
}

export function repoint(kind: Sub["kind"], from: string, to: string): number {
  if (from === to) return 0;
  let n = 0;
  // closed tickets too: a reopened one should still reach whoever holds the subscription now
  for (const t of load().values()) {
    if (!t.subs.some((s) => s.kind === kind && s.key === from)) continue;
    const had = t.subs.some((s) => s.kind === kind && s.key === to);
    t.subs = had ? t.subs.filter((s) => !(s.kind === kind && s.key === from)) : t.subs.map((s) => (s.kind === kind && s.key === from ? { ...s, key: to } : s));
    write(t);
    n++;
  }
  return n;
}

export function ofSession(sessionId: string): Ticket | undefined {
  const t = [...load().values()].find((x) => x.executor?.sessionId === sessionId);
  return t && copy(t);
}

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const logLine = (l: LogLine, n: number) => `- ${when(l.at)} ${l.by} ${l.kind}: ${cut(l.text.replace(/\s*\n\s*/g, " / "), n)}`;

export function brief(id: string, max = 6000, next?: { why: Past["why"]; noted: boolean }): string {
  const t = must(id);
  const m = t.mandate, ls = (x: string[]) => (x.length ? x.join("; ") : "nothing named");
  // `next`: for the copy about to replace the current one, as setExecutor will record it (the current one into past)
  const lastPast = next && t.executor ? { why: next.why, noted: next.noted } : t.past[t.past.length - 1];
  const copyN = next && t.executor ? t.past.length + 2 : t.executor?.n ?? t.past.length + 1;
  const head = [
    `# Ticket #${t.n}: ${t.title}`, "",
    "## The ask (the person's words)", t.ask, "",
    "## Mandate",
    `- may: ${ls(m.may)}`,
    `- may not: ${ls(m.mayNot)}`,
    `- until: ${m.until}`,
    `- where: ${m.where ?? "its own folder (no project folder named)"}`,
    `- how free: ${m.free === "ask" ? "ask before every step" : "change files in its folder on its own; commands still ask"}`, "",
    "## Where it stands",
    `- state: ${t.state}` + (t.waitsOn ? ` (waits on: ${t.waitsOn})` : ""),
    `- summary: ${t.summary}`,
    `- this is copy ${copyN} of its executor` + (lastPast ? `; copy ${copyN - 1} was replaced because ${WHY[lastPast.why]}${lastPast.noted ? ", after writing its closing note" : ", without a closing note"}` : ""),
  ].join("\n");
  const notes = t.log.filter((l) => l.kind === "note").map((l) => logLine(l, 2000));
  const rest = t.log.filter((l) => l.kind !== "note").map((l) => logLine(l, 300));
  const pushed = existsSync(logFileOf(t.id));
  const render = (nk: number, rk: number) => {
    const left = notes.length - nk + rest.length - rk;
    const parts = [head];
    if (nk) parts.push("", "## Notes", ...notes.slice(notes.length - nk));
    if (rk) parts.push("", "## Log", ...rest.slice(rest.length - rk));
    if (left || pushed) parts.push("", `(${left ? `${left} older line${left === 1 ? "" : "s"} left out here; ` : "older lines are not here; "}the full log is in ${fileOf(t.id)}${pushed ? ` and ${logFileOf(t.id)}` : ""})`);
    return parts.join("\n");
  };
  // the ask and the mandate are never cut: the log's tail goes first, then the oldest notes
  let nk = notes.length, rk = rest.length, out = render(nk, rk);
  while (out.length > max && rk > 0) out = render(nk, --rk);
  while (out.length > max && nk > 0) out = render(--nk, rk);
  return out;
}

const RANK: Record<string, number> = { waiting: 0, working: 1, open: 2 };

export function summary(max = 1200): string {
  const all = [...load().values()];
  const live = all.filter((t) => !isClosed(t.state)).sort((a, b) => RANK[a.state] - RANK[b.state] || newest(a, b));
  const closed = all.length - live.length;
  if (!all.length) return "no tickets yet".slice(0, max);
  const tail = `${closed} closed`;
  const lineOf = (t: Ticket, short: boolean) =>
    `#${t.n} [${t.state}] ${short ? cut(t.title, 40) : t.title}: ${short ? cut(t.summary, 60) : t.summary}` + (t.state === "waiting" && t.waitsOn ? ` (waits on: ${short ? cut(t.waitsOn, 60) : t.waitsOn})` : "");
  const join_ = (ls: string[], more: number) => [...ls, ...(more ? [`and ${more} more open (tickets with find, or ticket_read by number)`] : []), tail].join("\n");
  let out = join_(live.map((t) => lineOf(t, false)), 0);
  if (out.length <= max) return out;
  const short = live.map((t) => lineOf(t, true));
  // the least pressing go first: the end of the order (the oldest plain open ones), so the waiting ones stay in sight
  let keep = short.length, len = short.reduce((s, l) => s + l.length + 1, 0) + tail.length;
  const room = (k: number) => len + (k < short.length ? `and ${short.length - k} more open (tickets with find, or ticket_read by number)`.length + 1 : 0);
  while (keep > 0 && room(keep) > max) len -= short[--keep].length + 1;
  out = join_(short.slice(0, keep), short.length - keep);
  return out.length <= max ? out : out.slice(0, max);
}

export function onChange(fn: (t: Ticket) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function _reload() { cache = null; top = 0; }

export const store: Store = { open, get, list, find, log, setState, setMandate, setExecutor, setCwd, setFill, subscribe, unsubscribe, subscribed, repoint, ofSession, brief, summary, onChange, _reload };
