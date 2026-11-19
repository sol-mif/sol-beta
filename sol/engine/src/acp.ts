// The ACP seat launcher (the v2 design §7.1, step A2), behind a switch that is on unless set off (SOL_ACP_SEAT, record.ts acpSeatOn).
// A brain comes in as a block whose record says needs.seat: { speaks: "acp", start: [program, ...args] }. The shell starts
// that program (kernel.ts walls it: the big room's sandbox profile, its declared folders and a scratch folder of its own,
// its declared domains through a proxy), keeps it running, and speaks ACP to it as the client, one JSON-RPC message a line
// on its stdin and stdout. It is not behind the block's door (the nine verbs): the shell is its client.
//   the protocol  ACP, version ACP_VERSION, pinned: the names below are every message sent or taken, in one place. An
//                 upgrade is a breaking change, made here. Checked against ACP's own v1 schema and against real
//                 agents (codex-acp 2.6.0 and 0.16.0 walled as a seat is; Claude Code through claude-agent-acp
//                 0.106.0, its turns outside the wall and its start inside it: 2026-11-11), and in the tests against
//                 a fake one (test/fixtures/fake-acp.mjs)
//   a turn        session/new once per conversation (cwd: the seat's scratch folder; no MCP servers), then one
//                 session/prompt a task. A task that names a model or an effort has it set first, when the agent
//                 offers that very value among its session's options (session/set_config_option, the option whose
//                 category is model or thought_level); one it does not offer is passed over, and one it offers and
//                 will not set ends the turn with why. Its session/update notes become the seat's out: text chunks
//                 are `delta`, tool calls are `step` (started, then done or failed), and a prompt's answer may say `usage`. Its
//                 session/request_permission becomes `ask({ kind: "permission" })`: "once" picks the option of kind
//                 allow_once, anything else the option that rejects once (never "always": the person says yes a call at
//                 a time). With nobody to ask, it is no. Stop sends session/cancel and answers a pending ask "cancelled"
//   its lines     the seat's own steps on the log, through what the kernel hands in (said): seat.turn, seat.step,
//                 seat.usage, seat.done, by seat:<block>, never the words
//   its end       taken out (close): asked to stop, then killed; it says nothing more. Ended on its own: `gone` is told,
//                 once, and the kernel takes the seat off the seam with the block broken
//   its children  a seat whose record says it starts programs of its own (needs.seat.children) is started as the head
//                 of a process group of its own, and what it started is looked at while it lives (ps), each kept by
//                 its pid and when it was born. Taken out, all of it is asked to stop with it and has the close time
//                 to; then, and at once when the seat ends any other way, what is left is frozen, looked at again
//                 until a look finds nothing new (two seconds at most), and killed. One started between two looks
//                 that left its group and whose parent is gone (a program that makes itself a daemon does that) is
//                 not found, nor is what a chain of them starts faster than a look can follow once the two seconds
//                 are over: macOS has nothing that holds a process's every descendant. It is still inside the wall,
//                 which is inherited and never left. How many it can start has an end the system keeps: it starts
//                 under a limit of its own (procsMax), which all it starts inherit and none can raise, so the last
//                 fifth of the programs this Mac lets one person run is never its to fill. A pid is taken for the
//                 process it was only as a look just saw it; with no look to be had, for a second (FRESH_MS)
//   its size      what it may make Sol hold is bounded: a line (LINE_MAX), what Sol wrote to it and it has not read
//                 (OUT_MAX), a turn's words, steps and questions waiting at once (TEXT_MAX, STEPS_MAX, ASKS_MAX),
//                 and of a conversation's options the few a task can set. Past a line, the unread, a turn's words
//                 or its steps it is stopped, said; past the questions the next is a no, and those still waiting
//                 when the turn ends are answered "cancelled"; a request whose id is not a number or a short
//                 string gets no answer
//   its key       a seat started with a key in its environment (needs.seat.key, `secret` here) holds it: its program
//                 can read it, as an agent that logs in with a token must. What Sol passes on of what it says has the
//                 key's text cut out ("[key]"): its words (a key that comes in two pieces too: what could be its
//                 beginning waits for the next piece), a step's name, a question's line, options and arguments, an
//                 error's reason, why it ended. That keeps a key off the screen and the log when a program prints
//                 its environment or an error quotes it; a program that means to pass it on in another spelling can
// Anything the agent asks the client beyond a permission (fs/*, terminal/*) is refused: the client says it has neither.
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { SeatProvider, SeatResult, SeatCan, SeatOut, SeatSpent } from "./seats.js";

/** the one ACP version the shell speaks */
export const ACP_VERSION = 1;
/** every ACP message the shell sends or takes */
export const ACP = {
  initialize: "initialize",                    // client → agent: { protocolVersion, clientCapabilities } → { protocolVersion, agentCapabilities, authMethods }
  newSession: "session/new",                   // client → agent: { cwd, mcpServers } → { sessionId }
  prompt: "session/prompt",                    // client → agent: { sessionId, prompt: [{ type: "text", text }] } → { stopReason, usage?: { inputTokens, outputTokens, cachedReadTokens?, cachedWriteTokens? } }
  update: "session/update",                    // agent → client, a note: { sessionId, update: { sessionUpdate, ... } }
  permission: "session/request_permission",    // agent → client: { sessionId, toolCall, options: [{ optionId, name, kind }] } → { outcome }
  cancel: "session/cancel",                    // client → agent, a note: { sessionId }
  setOption: "session/set_config_option",      // client → agent: { sessionId, configId, value } → { configOptions }
} as const;
/** the most one line from the agent may hold, in characters: past it, the seat is broken (a program that floods its stdout) */
const LINE_MAX = 4 * 1024 * 1024;
/** the most Sol's messages to the agent may wait unread, in bytes: one that would take them past it is not written
 *  and the seat is broken (a program that asks and asks and never reads the answers). A message with nothing waiting
 *  before it is written whatever its size: an answer is no longer than the line it answers, the rest is Sol's own */
export const OUT_MAX = 8 * 1024 * 1024;
/** the longest id of a request of the agent's that is answered (the answer carries it back) */
const ID_MAX = 200;
/** the most one turn may come to: its words, its steps, its questions waiting for an answer at once */
export const TEXT_MAX = 16 * 1024 * 1024;
const STEPS_MAX = 10_000, ASKS_MAX = 16;
/** how long the ending of what a seat started may go on finding more of it */
const SWEEP_MS = 2000;
/** how long a pid alone is taken for the process it was, when no look can be had: what the last look saw, and the
 *  group of a seat that has ended, are killed unseen only this soon after (a pid goes to another program once enough
 *  have started since: some hundred thousand on a Mac) */
const FRESH_MS = 1000;
/** the most programs the person may have running for a seat with children to start one more: four fifths of what this
 *  Mac lets one person run (kern.maxprocperuid), asked once. Not a Mac, or no answer: none */
let procs: number | null | undefined;
function procsMax(): number | null {
  if (procs !== undefined) return procs;
  procs = null;
  if (process.platform === "darwin") try {
    const m = Number(execFileSync("/usr/sbin/sysctl", ["-n", "kern.maxprocperuid"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim());
    if (Number.isInteger(m) && m >= 100) procs = Math.floor(m * 4 / 5);
  } catch { /* none */ }
  return procs;
}
/** a shell that sets that limit for itself, the lower of it and the one it has, then becomes the program (exec: the
 *  same process, the same pid). The system keeps it: all the program starts inherit it and none can raise it. A limit
 *  that cannot be set starts nothing, said */
export const LIMITED = `n=$0; c=$(ulimit -u); case $c in *[!0-9]*|"") ;; *) [ "$c" -lt "$n" ] && n=$c ;; esac; ulimit -u "$n" 2>/dev/null || { echo "Sol could not set how many programs it may start" >&2; exit 71; }; exec "$@"`;
/** what may not reach a person's card from what a seat wrote: control, format, separator, private and unassigned characters */
const UNSEEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}]/gu;
/** what the agent wrote, as words: a string, a number, a yes or no; anything else is no words (an object is never
 *  asked to say itself: one whose toString is not a function would throw here, in the reader of its lines) */
const words = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? String(x) : "");
const oneLine = (x: unknown, max = 200): string => {
  const all = words(x), cut = Math.max(1024, 4 * max);   // only its head is cleaned: a title megabytes long, said again and again, costs no more than a short one
  const s = (all.length > cut ? all.slice(0, cut) : all).replace(UNSEEN, " ").replace(/\s+/g, " ").trim();
  return s.length > max || (all.length > cut && s.length > 0) ? `${s.slice(0, max)}…` : s;
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** a text cut out of what a seat says, wherever it shows (bigroom.ts redact, for a seat's own key): in a string, in
 *  every string of a value, and in words that come in pieces, where what could be the text's beginning is held until
 *  the next piece says (`rest` is what is still held when the words end) */
export const SECRET_MIN = 8;   // a shorter one is not cut out (a text that is part of "[key]" would be said again by its own cut): no seat is started with it
export function cutOut(secret: string | undefined) {
  const text = (s: string) => (secret ? s.split(secret).join("[key]") : s);
  const all = (x: unknown): unknown => (typeof x === "string" ? text(x) : Array.isArray(x) ? x.map(all) : isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [text(k), all(v)])) : x);
  const piece = (held: string, s: string): { say: string; held: string } => {
    if (!secret) return { say: s, held: "" };
    const parts = (held + s).split(secret), last = parts.pop()!;
    let keep = Math.min(secret.length - 1, last.length);
    while (keep > 0 && !secret.startsWith(last.slice(last.length - keep))) keep--;
    return { say: [...parts, last.slice(0, last.length - keep)].join("[key]"), held: last.slice(last.length - keep) };
  };
  /** the end of what a program wrote, kept by its last characters: one that begins inside the text begins with "[key]" */
  const tail = (s: string, cutAt: boolean): string => {
    if (!secret) return s;
    const t = text(s);
    if (!cutAt) return t;
    for (let n = Math.min(secret.length - 1, t.length); n > 0; n--) if (secret.endsWith(t.slice(0, n))) return `[key]${t.slice(n)}`;
    return t;
  };
  return { text, all, piece, tail };
}
/** what a JSON-RPC error says, in one line: its message, what its data adds when that is words (an agent's "Internal
 *  error" says why only there), its code */
function errorOf(e: Record<string, unknown>): string {
  const d = e.data;
  const more = oneLine(typeof d === "string" ? d : isObj(d) ? (typeof d.message === "string" ? d.message : typeof d.details === "string" ? d.details : "") : "", 300);
  const said = oneLine(e.message, 300);
  const all = !more || said.includes(more) ? said : !said || more.includes(said) ? more : `${said}: ${more}`;   // said once, when one holds the other
  return `${all || "an error"} (${oneLine(e.code, 20) || "?"})`;
}
/** a process as ps says it now: who started it, its process group, and when it was born (a pid is used again, a pid
 *  born at the same second is the same process) */
type Proc = { pid: number; parent: number; group: number; born: string };
const PS = ["-axo", "pid=,ppid=,pgid=,lstart="];
function procsOf(out: string): Proc[] {
  const all: Proc[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S.*?)\s*$/.exec(line);
    if (m && Number(m[1]) > 1) all.push({ pid: Number(m[1]), parent: Number(m[2]), group: Number(m[3]), born: m[4]! });   // never launchd
  }
  return all;
}
/** of those processes, a seat's own, its program apart: what is in its process group (while that group is still its
 *  own: grouped), what was seen before and is still the same process, and all that any of those started (who started
 *  whom) */
function family(all: Proc[], seen: Map<number, string>, head: number, grouped = true): Proc[] {
  const kids = new Map<number, Proc[]>();
  for (const p of all) if (p.parent > 1) { const of = kids.get(p.parent); if (of) of.push(p); else kids.set(p.parent, [p]); }
  const found = new Map<number, Proc>();
  const todo = all.filter((p) => (grouped && p.group === head) || seen.get(p.pid) === p.born);
  for (let p = todo.pop(); p; p = todo.pop()) { if (found.has(p.pid)) continue; found.set(p.pid, p); todo.push(...(kids.get(p.pid) ?? [])); }
  found.delete(head);
  return [...found.values()];
}
/** an option of a session the person may pick (ACP's configOptions): its id, its category, the value now, the values offered */
type Option = { id: string; category: string; now: unknown; values: string[] };
/** kept small whatever the agent sends, for as long as the seat lives: of the first 50 options, the first four a task
 *  can set (a model, an effort), 200 values each, names of 200 characters at most */
const OPTIONS_MAX = 50, KEPT_MAX = 4, VALUES_MAX = 200, NAME_MAX = 200;
const SET = ["model", "thought_level"];
const short = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= NAME_MAX;
export const optionsOf = (x: unknown): Option[] => (Array.isArray(x) ? x.slice(0, OPTIONS_MAX).filter(isObj).filter((c) => SET.includes(c.category as string)).slice(0, KEPT_MAX) : []).flatMap((c) => {
  if (!short(c.id) || !short(c.category)) return [];
  const flat = (Array.isArray(c.options) ? c.options.slice(0, VALUES_MAX).filter(isObj) : []).flatMap((v) => (Array.isArray(v.options) ? v.options.slice(0, VALUES_MAX).filter(isObj) : [v]));   // a group of values is its values
  return [{ id: c.id, category: c.category, now: short(c.currentValue) ? c.currentValue : undefined, values: flat.map((v) => v.value).filter(short).slice(0, VALUES_MAX) }];
});
/** a tool's kind as ACP says it (read, edit, execute, ...), as a short name; anything else is "other" */
const toolOf = (k: unknown): string => (typeof k === "string" && /^[a-z_]{1,32}$/.test(k) ? k : "other");
/** what a prompt's answer says the turn spent (ACP's usage): in and out, and the cached parts when the agent says
 *  them. The numbers are the agent's own, passed on as said: Claude Code's `inputTokens` is only what its cache did
 *  not hold (4 in a turn that read 80,070 from it); ACP does not say whether another's counts the cached part in */
function spentOf(u: unknown): SeatSpent | null {
  const count = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
  if (!isObj(u) || !count(u.inputTokens) || !count(u.outputTokens)) return null;
  return { in: u.inputTokens, out: u.outputTokens, ...(count(u.cachedReadTokens) ? { cacheRead: u.cachedReadTokens } : {}), ...(count(u.cachedWriteTokens) ? { cacheWrite: u.cachedWriteTokens } : {}) };
}
/** a fingerprint of a call's arguments: the same arguments, the same print (keys in order, so their order does not count) */
const sorted = (x: unknown): unknown => (Array.isArray(x) ? x.map(sorted) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
export const printOfArgs = (args: unknown): string => createHash("sha256").update(JSON.stringify(sorted(args ?? null)) ?? "null").digest("hex").slice(0, 16);

// ---- JSON-RPC 2.0 over two streams, one message a line ----

type Handlers = { request: (method: string, params: unknown) => Promise<unknown>; notify: (method: string, params: unknown) => void; bad: (why: string) => void };
export class Rpc {
  private next = 1;
  private waiting = new Map<number, { ok: (x: unknown) => void; no: (e: Error) => void }>();
  private buf = "";
  private shut: string | null = null;
  /** a read may end inside a character (a pipe reads 64 KB at a time, Chinese is three bytes a character): its first bytes
   *  wait here for the rest, so no character is cut into U+FFFD */
  private utf8 = new StringDecoder("utf8");
  /** `clean`: what every message it reads is passed through before anything looks at it (a seat's key cut out) */
  constructor(private out: NodeJS.WritableStream, inp: NodeJS.ReadableStream, private on: Handlers, private clean: (m: unknown) => unknown = (m) => m) {
    inp.on("data", (b: Buffer | string) => this.take(typeof b === "string" ? b : this.utf8.write(b)));
  }
  private take(chunk: string) {
    this.buf += chunk;
    if (this.buf.length > LINE_MAX && !this.buf.slice(0, LINE_MAX).includes("\n")) { this.buf = ""; return this.on.bad(`it wrote a line longer than ${LINE_MAX} characters`); }
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) { try { this.one(line); } catch { /* a line this reader could not take: passed over, as one that is not a message */ } }
    }
  }
  private one(line: string) {
    let m: Record<string, unknown>;
    try { const x = this.clean(JSON.parse(line)); if (!isObj(x)) return; m = x; } catch { return; }   // a line that is not a message (a program's own print): passed over
    if (typeof m.method === "string") {
      if (m.id === undefined || m.id === null) { try { this.on.notify(m.method, m.params); } catch { /* its own trouble */ } return; }
      const id = m.id;
      if (typeof id !== "number" && !(typeof id === "string" && id.length <= ID_MAX)) return;   // no id an answer could carry: passed over
      void this.on.request(m.method, m.params).then(
        (result) => this.send({ jsonrpc: "2.0", id, result }),
        (e) => this.send({ jsonrpc: "2.0", id, error: { code: (e as { code?: number })?.code ?? -32603, message: String((e as Error)?.message ?? e) } }),
      );
      return;
    }
    if (typeof m.id !== "number") return;
    const w = this.waiting.get(m.id);
    if (!w) return;
    this.waiting.delete(m.id);
    if (isObj(m.error)) w.no(new Error(errorOf(m.error)));
    else w.ok(m.result);
  }
  private send(m: object) {
    if (this.shut !== null) return;
    // what it has not read yet is held here, in Sol: an agent that goes on asking and never reads is not answered for ever
    const line = JSON.stringify(m) + "\n", held = (this.out as { writableLength?: number }).writableLength ?? 0;
    if (held && held + Buffer.byteLength(line) > OUT_MAX) {
      const why = `it left more than ${OUT_MAX} bytes of what Sol wrote to it unread`;
      this.on.bad(why);
      return this.close(why);
    }
    try { this.out.write(line); } catch { /* its stdin is gone: its exit says so */ }
  }
  /** with `ms`, an answer that has not come by then is given up on: the request fails saying so, and a late answer is passed over */
  request(method: string, params: unknown, ms?: number): Promise<any> {
    if (this.shut !== null) return Promise.reject(new Error(this.shut));
    const id = this.next++;
    return new Promise((ok, no) => {
      const timer = ms === undefined ? null : setTimeout(() => { if (this.waiting.delete(id)) no(new Error(`it did not answer ${method} within ${ms} ms`)); }, ms).unref();
      const end = <T>(f: (x: T) => void) => (x: T) => { if (timer) clearTimeout(timer); f(x); };
      this.waiting.set(id, { ok: end(ok), no: end(no) });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method: string, params: unknown) { this.send({ jsonrpc: "2.0", method, params }); }
  /** no more messages: every request still waiting fails with why */
  close(why: string) {
    if (this.shut !== null) return;
    this.shut = why;
    for (const w of this.waiting.values()) w.no(new Error(why));
    this.waiting.clear();
  }
}

// ---- the launcher ----

/** the seat's own steps, as the kernel writes them on the log (seat:<block>); session is the shell's id for the conversation */
export type AcpSaid = {
  turn(session: string): void;
  step(session: string, tool: string, ok: boolean): void;
  usage(session: string, spent: SeatSpent): void;
  done(session: string, ok: boolean): void;
};
export type AcpStart = {
  /** the seat's name on the seam (the block's id) */
  name: string;
  /** what to start: the walled command (kernel.ts: sandbox-exec, its profile, the program, its arguments) */
  command: string[];
  /** where the process starts (the block's folder, read only: its arguments may name its files) */
  cwd: string;
  /** the conversation's folder, said to the agent at session/new (the seat's scratch folder) */
  sessionCwd: string;
  env: Record<string, string>;
  /** how long it has to answer initialize; how long a stop waits before the kill; how long it has to open a
   *  conversation or set one of its options (a prompt has no such time: a task takes what it takes, and a stop ends it) */
  startMs: number;
  closeMs: number;
  answerMs: number;
  /** the shell's id for a conversation of this seat's (seats.ts convoId), for the log */
  convo: (inner: string) => string;
  said: AcpSaid;
  /** it ended on its own, once it had started (never after close) */
  gone: (why: string) => void;
  /** it starts programs of its own (needs.seat.children): the head of a process group of its own, so that what it
   *  started goes when it does */
  children?: boolean;
  /** with children: the most processes it may have at once (its own below it and in its group); past that it is stopped */
  kidsMax?: number;
  /** a key it holds in its environment (needs.seat.key): its text is cut out of all that is passed on of what it says */
  secret?: string;
  /** for the tests: what `ps` says now, in place of asking it, when what it started is ended (it throws: no look to be had) */
  ps?: () => string;
  /** for the tests: its limit of programs, in place of this Mac's (procsMax) */
  procs?: number;
};
export type AcpSeat = { pid: number; can: SeatCan; run: SeatProvider["run"]; close(): Promise<void>; alive(): boolean };

type Turn = { session: string; out: SeatOut; text: string; held: string; steps: Map<string, { tool: string; title: string; ended: boolean }>; asks: Set<(answer: string) => void>; no?: string };

/** start a program that speaks ACP and say hello; resolves once it answered initialize with the version pinned, else
 *  rejects with why (it is killed then) */
export function startAcp(o: AcpStart): Promise<AcpSeat> {
  const limit = o.children ? o.procs ?? procsMax() : null;   // one that starts no program needs none
  // no limit to give it (this Mac did not say how many one person may run): one that starts programs is not started
  if (o.children && !(Number.isInteger(limit) && limit! >= 1)) return Promise.reject(new Error("Sol could not learn how many programs this Mac lets one person run, so a seat that starts programs is not started"));
  if (o.secret !== undefined && o.secret.length < SECRET_MIN) return Promise.reject(new Error(`its key is shorter than ${SECRET_MIN} characters, too short to be cut out of what it says`));
  const command = limit !== null ? ["/bin/sh", "-c", LIMITED, String(limit), ...o.command] : o.command;
  const c: ChildProcess = spawn(command[0], command.slice(1), { cwd: o.cwd, env: o.env, stdio: ["pipe", "pipe", "pipe"], ...(o.children ? { detached: true } : {}) });
  let started = false, closing = false, exited = false, tail = "", tailCut = false;
  let turn: Turn | null = null;
  const cut = cutOut(o.secret || undefined);
  const clean = (x: unknown): string => cut.text(words(x));   // the agent's own words, its key cut out
  const sessions = new Map<string, Option[]>();   // its conversations, each with the options it offers
  const pid = c.pid ?? -1, group = !!o.children && pid > 1;   // its process group is its own (detached): the group's id is its pid
  // What it started is looked at while it lives (ps, twice a second in a task and every five seconds between), each
  // kept by its pid and the second it was born: one that left its group, or whose parent has ended since, is still
  // known when the seat goes, however it goes. One started between two looks that left its group and lost its parent is not (PROTOCOL.md says so).
  const known = new Map<number, string>();
  const most = o.kidsMax ?? 200;
  let stopped = "", looking = false, looked = 0, seen = 0, shown = 0, endedAt = 0, other = false;
  // once it has ended, a process a look shows under its pid is another program, started since: the group of that
  // number is no longer the seat's, and is not signalled again
  const mine = (all: Proc[]) => { shown = Date.now(); if (exited && all.some((p) => p.pid === pid)) other = true; return family(all, known, pid, !other); };
  const keep = (now: Proc[]) => { known.clear(); for (const p of now) known.set(p.pid, p.born); seen = Date.now(); return now; };
  const ps = (then: (e: Error | null, out: string) => void) => { try { execFile("/bin/ps", PS, { encoding: "utf8", timeout: 5000 }, then); } catch (e) { then(e as Error, ""); } };
  const psNow = (): Proc[] | null => { try { return procsOf(o.ps ? o.ps() : execFileSync("/bin/ps", PS, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 })); } catch { return null; } };
  const signal = (to: number, sig: NodeJS.Signals) => { try { process.kill(to, sig); } catch { /* gone */ } };
  const look = () => {
    if (!group || exited || looking || (!turn && !closing && Date.now() - looked < 5000)) return;
    looking = true;
    ps((e, out) => {
      looking = false; looked = Date.now();
      if (exited) return;
      // no room on this Mac to start ps at all: whatever filled it, a seat that starts programs is not left running blind
      if (e) { if ((e as NodeJS.ErrnoException).code === "EAGAIN" && !closing) { stopped = "this Mac had no room left to start another program while it ran, and it was stopped"; kill(); } return; }
      const now = keep(mine(procsOf(out)));
      if (now.length > most && !closing) { stopped = `it had more than ${most} programs running at once, and was stopped`; kill(); }
    });
  };
  const watch = group ? setInterval(look, 500) : null;
  watch?.unref();
  // its group by its number: while it lives the number is its own; once it has ended, only as soon after its end or
  // after a look that showed no other under it (FRESH_MS), wherever this is called from
  const rest = () => { if (group && !other && (!exited || Date.now() - Math.max(endedAt, shown) <= FRESH_MS)) signal(-pid, "SIGKILL"); };
  /** what it started, ended for good: frozen first, so none of it starts another meanwhile; looked at again until a
   *  look finds no new one (what was started between a look and the freeze is below something frozen now, and a
   *  frozen parent is not killed while its child may still be unseen: killed, the child would be nobody's), for
   *  SWEEP_MS at most; then killed, a group whose head is its own as a group. Each only as the process a look just
   *  saw, but for one case: no look to be had (no room on this Mac to start ps, or ps too slow), where its group
   *  (while it lives, or within FRESH_MS of its end or of a look) and what a look saw within FRESH_MS go by their
   *  pid alone, which makes room, and it is looked for once more. Older than that, a pid is not trusted: they are
   *  left, walled. After a look of this ending, what is known and not found by it is gone, and is not signalled */
  const sweep = () => {
    if (!group) return;
    const all = new Map<number, Proc>();
    const by = Date.now() + SWEEP_MS;
    for (let blind = false; ;) {
      const now = psNow();
      if (!now) {
        if (blind) break;
        blind = true;
        rest();
        if (!all.size && Date.now() - seen <= FRESH_MS) for (const p of known.keys()) signal(p, "SIGKILL");
        continue;
      }
      const fresh = mine(now).filter((p) => all.get(p.pid)?.born !== p.born);
      if (!fresh.length) break;
      for (const p of fresh) { all.set(p.pid, p); known.set(p.pid, p.born); signal(p.group === p.pid ? -p.pid : p.pid, "SIGSTOP"); }
      if (Date.now() >= by) break;   // it starts them faster than a look follows: what was seen goes, the rest is not found
    }
    for (const p of all.values()) { if (p.group === p.pid) signal(-p.pid, "SIGKILL"); signal(p.pid, "SIGKILL"); }
  };
  const exit = new Promise<void>((done) => c.once("exit", () => {
    exited = true; endedAt = Date.now();
    if (watch) clearInterval(watch);
    const end = () => { sweep(); rest(); done(); };
    if (!group || !closing || stopped) return end();
    // taken out: what it started was asked to stop with it, and has until the close time to, as it had
    const by = Date.now() + o.closeMs;
    const wait = () => ps((e, out) => { if (e || !keep(mine(procsOf(out))).length || Date.now() >= by) return end(); setTimeout(wait, 50); });
    wait();
  }));
  const errs = new StringDecoder("utf8");   // as its stdout's: a read that ends inside a character does not cut it
  c.stderr!.on("data", (b: Buffer) => { const all = tail + errs.write(b); if (all.length > 2000) tailCut = true; tail = all.slice(-2000); });   // kept only to say why it ended
  c.stdin!.on("error", () => {});
  const kill = () => { if (exited) return; if (group) signal(-pid, "SIGSTOP"); sweep(); rest(); try { c.kill("SIGKILL"); } catch { /* gone */ } };   // frozen first: it starts nothing more while what it started is found
  const bad = (why: string) => { if (!closing) { kill(); ended(why); } };
  const rpc = new Rpc(c.stdin!, c.stdout!, {
    bad,
    notify: (method, params) => {
      if (method === ACP.update && isObj(params) && typeof params.sessionId === "string" && sessions.has(params.sessionId) && isObj(params.update) && params.update.sessionUpdate === "config_option_update") {
        const now = optionsOf(params.update.configOptions);   // its options changed on its side: what it offers now
        if (now.length) sessions.set(params.sessionId, now);
        return;
      }
      if (method !== ACP.update || !isObj(params) || !turn || params.sessionId !== turn.session || !isObj(params.update)) return;
      const u = params.update, t = turn;
      if (u.sessionUpdate === "agent_message_chunk" && isObj(u.content) && u.content.type === "text" && typeof u.content.text === "string") {
        if (t.text.length + t.held.length + u.content.text.length > TEXT_MAX) return bad(`it wrote more than ${TEXT_MAX} characters in one turn`);
        const now = cut.piece(t.held, u.content.text);
        t.held = now.held;
        if (!now.say && u.content.text) return;   // all of it could be its key's beginning: said with the next piece
        t.text += now.say;
        t.out.delta?.(now.say);
      } else if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
        const id = oneLine(clean(u.toolCallId), 100);
        if (!id) return;
        const title = oneLine(clean(u.title));
        let s = t.steps.get(id);
        if (!s) {
          if (t.steps.size >= STEPS_MAX) return bad(`it took more than ${STEPS_MAX} steps in one turn`);
          s = { tool: toolOf(u.kind), title: title || toolOf(u.kind), ended: false };
          t.steps.set(id, s);
          t.out.step?.({ id, tool: s.tool, title: s.title, state: "started" });
        }
        // its title is what the latest note said: an agent may name the step only after it began (Claude Code's
        // adapter starts a command as "Terminal" and says the command itself in a later note, none in the last)
        else if (!s.ended && title) s.title = title;
        if (!s.ended && (u.status === "completed" || u.status === "failed")) {
          s.ended = true;
          t.out.step?.({ id, tool: s.tool, title: s.title, state: u.status === "completed" ? "done" : "failed" });
          safe(() => o.said.step(o.convo(t.session), s!.tool, u.status === "completed"));
        }
      }
    },
    request: async (method, params) => {
      if (method !== ACP.permission) throw Object.assign(new Error(`Sol does not offer ${oneLine(method, 60)} to a seat`), { code: -32601 });
      const cancelled = { outcome: { outcome: "cancelled" } };
      const t = turn;
      if (!isObj(params) || !t || params.sessionId !== t.session) return cancelled;
      const options = Array.isArray(params.options) ? params.options.filter(isObj) : [];
      const pick = (...kinds: string[]) => { for (const k of kinds) { const x = options.find((p) => p.kind === k); if (x) return { outcome: { outcome: "selected", optionId: x.optionId } }; } return cancelled; };
      const call = isObj(params.toolCall) ? params.toolCall : {};
      if (!t.out.ask || t.asks.size >= ASKS_MAX) { t.no = oneLine(clean(call.title), 120) || toolOf(call.kind); return pick("reject_once", "reject_always"); }   // nobody to ask, or more questions at once than a person is put: no
      // its line is the agent's own words: the arguments go on the card whole too, with their print (the design: "the card can show the arguments")
      const args = cut.all(call.rawInput);   // as the card shows them: the print is of that
      const q = { kind: "permission" as const, tool: toolOf(call.kind), line: oneLine(clean(call.title)) || toolOf(call.kind), print: printOfArgs(args), options: options.map((p) => oneLine(clean(p.name), 80)), ...(args !== undefined ? { args } : {}) };
      let own: (answer: string) => void = () => {};
      const answer = await new Promise<string>((done) => {
        own = done;
        t.asks.add(done);   // a stop answers it "cancelled"
        t.out.ask!(q).then(done, () => done("no"));
      });
      t.asks.delete(own);   // its own: another still waiting is still answered by a stop
      if (answer === "cancelled") return cancelled;
      if (answer !== "once") t.no = oneLine(q.line, 120);
      return answer === "once" ? pick("allow_once") : pick("reject_once", "reject_always");
    },
  }, cut.all);   // all it says is cut before any of it is looked at: what is shortened after is shortened without its key
  let onRun: ((x: SeatResult) => void) | null = null;
  const ended = (why0: string) => {
    const why = cut.text(why0);
    rpc.close(why);
    onRun?.({ ok: false, why: `the seat ${o.name} is gone: ${why}` });
    if (started && !closing) { closing = true; o.gone(why); }
  };
  c.on("exit", (code, signal) => { if (stopped) ended(stopped); else if (!closing) ended(`its program ended (${signal ? `signal ${signal}` : `exit ${code}`})${tail.trim() ? `: ${oneLine(cut.tail(tail, tailCut).trim().split("\n").pop(), 300)}` : ""}`); else rpc.close("taken out"); });
  c.on("error", (e) => ended(`its program would not start: ${e.message}`));

  const close = async () => {
    closing = true;
    rpc.close("taken out");
    if (exited) return exit;
    // asked to stop: it, its group, and what it started that left its group (looked for first, while it is still
    // there to be their parent, and kept: once it is gone they are tied to it by nothing but having been seen)
    if (group) {
      const now = psNow(), out = now ? keep(mine(now)) : [];
      signal(-pid, "SIGTERM");
      for (const p of out) if (p.group !== pid) signal(p.pid, "SIGTERM");
    } else { try { c.kill("SIGTERM"); } catch { /* gone */ } }
    const timer = setTimeout(kill, o.closeMs);
    await exit;
    clearTimeout(timer);
  };

  const run: SeatProvider["run"] = (task, out, signal) => new Promise<SeatResult>((resolve) => {
    if (signal.aborted) return resolve({ ok: false, why: "cancelled" });
    if (turn) return resolve({ ok: false, why: `the seat ${o.name} is still on its last task` });
    if (exited || closing) return resolve({ ok: false, why: `the seat ${o.name} is gone` });
    if (task.sessionId && !sessions.has(task.sessionId)) return resolve({ ok: false, why: `that conversation ended with the program that held it: start a new one on ${o.name}` });
    let settled = false, session = task.sessionId ?? "";
    const t: Turn = { session, out, text: "", held: "", steps: new Map(), asks: new Set() };
    const settle = (x0: SeatResult) => {
      if (settled) return;
      settled = true;
      const x = x0.ok ? x0 : { ...x0, why: cut.text(x0.why) };
      onRun = null;
      for (const f of t.asks) f("cancelled");   // a turn that ends with questions waiting takes them with it: none is held past its turn
      if (turn && session && !closing) safe(() => o.said.done(o.convo(session), x.ok));   // taken out: nothing more on the log
      turn = null;
      resolve(session ? { ...x, sessionId: session } : x);
    };
    onRun = settle;
    turn = t;
    signal.addEventListener("abort", () => {
      for (const f of t.asks) f("cancelled");
      if (session) rpc.notify(ACP.cancel, { sessionId: session });
      setTimeout(() => settle({ ok: false, why: "cancelled" }), o.closeMs).unref();   // an agent that never answers a cancel: the turn ends anyway
    }, { once: true });
    void (async () => {
      try {
        if (!session) {
          const s = await rpc.request(ACP.newSession, { cwd: o.sessionCwd, mcpServers: [] }, o.answerMs);
          if (!isObj(s) || typeof s.sessionId !== "string" || !s.sessionId || s.sessionId.length > 200) throw new Error("its session/new named no session");
          session = t.session = s.sessionId;
          sessions.set(session, optionsOf(s.configOptions));
          if (signal.aborted) return settle({ ok: false, why: "cancelled" });
        }
        // the model and the effort the task names, when this agent offers that very value: set before the turn
        for (const [category, value] of [["model", task.model], ["thought_level", task.effort]] as const) {
          const opt = value ? sessions.get(session)?.find((c) => c.category === category && c.values.includes(value)) : undefined;
          if (!opt || opt.now === value) continue;
          const r = await rpc.request(ACP.setOption, { sessionId: session, configId: opt.id, value }, o.answerMs);
          const now = optionsOf(isObj(r) ? r.configOptions : null);
          if (now.length) sessions.set(session, now); else opt.now = value;
          if (signal.aborted) return settle({ ok: false, why: "cancelled" });
        }
        safe(() => o.said.turn(o.convo(session)));
        const r = await rpc.request(ACP.prompt, { sessionId: session, prompt: [{ type: "text", text: task.text }] });
        const spent = spentOf(isObj(r) ? r.usage : null);
        if (spent) {
          t.out.usage?.(spent);
          safe(() => o.said.usage(o.convo(session), spent));
        }
        const stop = isObj(r) ? r.stopReason : undefined;
        // an agent that ends its turn at a no (Codex does) says "cancelled" too: said as what it is, not as a stop nobody pressed
        if (stop === "cancelled" && !signal.aborted && t.no) return settle({ ok: false, why: `the seat ${o.name} stopped there: it was not let ${t.no}` });
        if (stop === "cancelled" || signal.aborted) return settle({ ok: false, why: "cancelled" });
        if (stop === "refusal") return settle({ ok: false, why: `the seat ${o.name} refused` });
        if (t.held) { t.text += t.held; t.out.delta?.(t.held); t.held = ""; }   // what waited for a next piece that did not come: not its key
        settle({ ok: true, text: t.text });
      } catch (e) { settle({ ok: false, why: signal.aborted ? "cancelled" : (e as Error).message }); }
    })();
  });

  return new Promise<AcpSeat>((resolve, reject) => {
    const no = (why: string) => { closing = true; kill(); reject(new Error(cut.text(why))); };
    const timer = setTimeout(() => no(`it did not answer initialize within ${o.startMs} ms`), o.startMs);
    onRun = (x) => { clearTimeout(timer); no(x.ok ? "it ended" : x.why.replace(`the seat ${o.name} is gone: `, "")); };
    rpc.request(ACP.initialize, { protocolVersion: ACP_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } }).then((r) => {
      clearTimeout(timer);
      onRun = null;
      if (!isObj(r) || r.protocolVersion !== ACP_VERSION) return no(`it speaks ACP version ${(isObj(r) && oneLine(r.protocolVersion, 20)) || "?"}, and Sol speaks ${ACP_VERSION}`);
      const caps = isObj(r.agentCapabilities) ? r.agentCapabilities : {};
      const mcp = isObj(caps.mcpCapabilities) && caps.mcpCapabilities.http === true ? "http" : "stdio";   // stdio every ACP agent takes
      started = true;
      // it streams, goes on in its conversations while it runs, and comes to ask (session/request_permission); whether it
      // asks before every call is its own choice, so it is walled by Sol's sandbox whatever it says
      const can: SeatCan = { stream: true, resume: true, ask: true, perCall: "request", stopAtTool: true, mcp, sandbox: "ours" };
      resolve({ pid: c.pid ?? -1, can, run, close, alive: () => !exited && !closing });
    }, (e) => { clearTimeout(timer); if (!closing) no(`it did not answer initialize: ${(e as Error).message}`); });
  });
}

/** a line the log cannot take never ends a seat's turn */
function safe(f: () => void) { try { f(); } catch (e) { console.error("the log:", e instanceof Error ? e.message : String(e)); } }
