// The hub's own words (#206, S1 of #168): the format rules and the wire shapes the hub, its registry and spool, and
// every client agree on. Hub-owned and importing nothing, so the hub loads without the engine (relay-hub.ts); the
// engine's team settings re-export the rules from here (settings.ts), so there is one copy of each.

export const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export const LOGIN = /^[A-Za-z0-9-]{0,39}$/;
/** a share code (#157): six symbols of 32, no 0, O, 1 or I, so a code read aloud or typed by hand has one reading.
 *  registry.ts exports it as the code's own */
export const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export const KINDS = ["hello", "roster", "presence", "changed", "hand", "stable", "ping", "talk", "show", "room", "watch", "event", "runs", "drift", "agents", "ask", "give", "signal"] as const;
// signal (#1377, the plan on #229): a wake with no content in it, who → whom, a kind (1 GitHub, 2 group chat, 3 other)
// and a link; the receiver fetches the words itself (team/signal.ts)
// ask, give (#335): ask a teammate for one of their past group sessions, and their one press gives its lines (team/ask.ts)
// runs (#1150): what a Sol runs, its release and HEAD, and why a dev release did not install itself (team/runs.ts)
// agents (#1166): an ask, answer, hand-over, offer or reply between the team's agents, the Agents' room (team/reach.ts)
// drift (#1153): each person's files off the iteration and how many iterations old, said daily by the runner (team/drift.ts)
export type Kind = (typeof KINDS)[number];
export type From = { login: string; agent: boolean };
export type RelayMsg = { kind: Kind; from: From; at: number; spooled?: boolean; [k: string]: unknown };
/** what the spool keeps and hands back: only what the relay already carried, and only these. Never `event` (#328): the
 *  cloud keeps a room's build updates itself and a hello hands back the last 50 (`events.recent`) */
export const SPOOLED: readonly Kind[] = ["talk", "ping", "room", "agents", "ask", "signal"];   // agents (#1166): a hand-over reaches who is away; never a give (#335): its lines are live only
/** the hub's own word on a hello in a room whose talk it keeps (#315, the cloud): one thread's last lines, `{ thread,
 *  lines }`. Never a kind a client may send (not in KINDS) */
export const TALK_HISTORY = "talk.history";
export type PresenceState = "here" | "elsewhere" | "away" | "working" | "yourcall";
/** the thing a person is in now (#230, the studio PRD §9.2): its id in the room's things, its name, whether their face
 *  has it open in front or their agent said so, and when that was last said (the sender's clock, ms) */
export type RosterThing = { id: string; name: string; source: "face" | "agent"; at: number };
/** a session started under the room (#230, §9.6): its id, its title, the thing beside it. Only a room's own sessions
 *  are ever said; a private Work or Life session never is */
export type RosterSession = { id: string; title: string; thing?: string };
export type RosterEntry = { who: string; agent: boolean; machine: string; state: PresenceState; session?: { title: string; repo?: string }; since: number;
  thing?: RosterThing; sessions?: RosterSession[]; quiet?: true; never?: true;   // quiet (#238): they turned "show my room sessions" off here; never (#335): their past group sessions are never given
  github?: boolean;   // github (#320): GitHub is signed in on their Sol; a boolean only, never a login or a token
  version?: SolVersion };   // version (#417): the release their Sol sits on and their own commits over it; none: an older Sol, "unknown"
/** what a Sol runs (#417): the release it sits on (a release tag, or the branch `stable` / `main` when no tag marks that
 *  commit), that commit (8 hex), how many newer commits that branch has (`behind`), and how many of its own sit on top
 *  (`mine`, on a branch named like marco/mine). Said on the hello and each presence; never a path, a branch name or a subject */
export type SolVersion = { release: string; commit: string; behind?: number; mine?: number };
/** the room sessions one roster entry may carry */
export const SESSIONS_MAX = 5;

// the close codes a hello can get: an unknown code (the room is gone, or was never), over its guesses, and a room with
// as many people on as it takes (#208, A9)
export const GONE = 4404, SLOWED = 4429, FULL = 4409;
/** a hello from a Sol older than the hub takes (#223, C1): "please update Sol" */
export const TOO_OLD = 4426;
/** a connection that kept sending after the hub said wait (#223, B2): a minute, then again */
export const TOO_FAST = 4430;
/** a connection the cloud's admin closed (#225, S7): its account was disabled, or its room closed */
export const KICKED = 4403;

/** the wire's version (#223, C1): what a hello says as `v`. A hello with none is 1, every Sol before S6a. 2 (S6a): `watch`,
 *  ids on every message, the hub's answers (kind `hub`): its hello, an ok for a kept kind, retry, the light, update */
export const PROTOCOL = 2;
/** the hub's own word to one connection (#223), never a kind a client may send: { say: "hello" | "ok" | "retry" |
 *  "watch" | "light" | "update", ... } */
export const HUB = "hub";

const STATES = new Set<PresenceState>(["here", "elsewhere", "away", "working", "yourcall"]);
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the creature's eight states said as the five a teammate sees (listening and speaking are "here") */
export function presenceOf(state: string): PresenceState {
  return STATES.has(state as PresenceState) ? (state as PresenceState) : state === "unplugged" ? "elsewhere" : "here";
}

const THING_ID = /^[\w-]{1,40}$/, SESSION_ID = /^[\w-]{1,80}$/;
/** one line of plain text (pure): no control or format characters, whitespace folded, cut to max; the join page's
 *  name too (join.ts, #327) */
export const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const line = oneLine;

/** a presence's thing as the hub passes it (#230): exactly id, name, source and at, each checked; anything else, none */
export function thingOf(v: unknown): RosterThing | undefined {
  if (!isObj(v) || typeof v.id !== "string" || !THING_ID.test(v.id)) return undefined;
  if (v.source !== "face" && v.source !== "agent") return undefined;
  if (typeof v.at !== "number" || !Number.isFinite(v.at) || v.at <= 0) return undefined;
  return { id: v.id, name: line(v.name, 60), source: v.source, at: Math.floor(v.at) };
}

/** a presence's room sessions as the hub passes them (#230): at most SESSIONS_MAX, each id, title and a thing id */
export function sessionsOf(v: unknown): RosterSession[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: RosterSession[] = [];
  for (const x of v) {
    if (out.length >= SESSIONS_MAX) break;
    if (!isObj(x) || typeof x.id !== "string" || !SESSION_ID.test(x.id) || out.some((o) => o.id === x.id)) continue;
    out.push({ id: x.id, title: line(x.title, 120), ...(typeof x.thing === "string" && THING_ID.test(x.thing) ? { thing: x.thing } : {}) });
  }
  return out.length ? out : undefined;
}

/** a hello's or a presence's GitHub flag as the hub passes it (#320): true or false, anything else none. A login, a
 *  token or any other word a sender puts there is never carried */
const RELEASE = /^[A-Za-z0-9][\w.-]{0,59}$/, COMMIT = /^[0-9a-f]{7,12}$/;
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1_000_000 ? v : undefined);
/** a hello's or a presence's version (#417) as the hub passes it: exactly release, commit, behind and mine, each checked;
 *  a release or commit that is not their shape: none (the face then says "unknown") */
export function solVersionOf(v: unknown): SolVersion | undefined {
  if (!isObj(v) || typeof v.release !== "string" || !RELEASE.test(v.release) || typeof v.commit !== "string" || !COMMIT.test(v.commit)) return undefined;
  const behind = count(v.behind), mine = count(v.mine);
  return { release: v.release, commit: v.commit, ...(behind ? { behind } : {}), ...(mine ? { mine } : {}) };
}
export const githubOf = (v: unknown): boolean | undefined => (v === true || v === false ? v : undefined);

/** a GitHub login as GitHub writes one (#325): what a cloud group's ask says its asker is on GitHub. LOGIN above also
 *  takes "", the empty login of the hub's own words */
export const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;
/** the maker's three answers to an ask (#162) */
export const ANSWERS = ["invited", "already", "no"] as const;
/** a `room` word as the hub passes it (#162, #325): an ask, `{ want: "in", repo, to?, github?, proof? }`, or an
 *  answer, `{ to, repo, in, why? }` */
export type RoomWire = { want: "in"; repo: string; to?: string; github?: string; proof?: string } | { to: string; repo: string; in: (typeof ANSWERS)[number]; why?: string };
/** a gist's id (#325): what a cloud group's ask names as the proof of its GitHub login, as proof.ts takes one */
const GIST_ID = /^[0-9a-f]{1,64}$/i;
/** a `room` word rebuilt field by field (#325), so nothing a sender adds rides along. An ask names a repository; on a
 *  cloud group it is directed (`to`, the maker's Sol name) and says the asker's GitHub login (`github`) with the gist that proves it (`proof`), which only an
 *  ask carries. An answer names its person, the repository and one of the three answers, its why one line of 120. A
 *  `to` or a `github` that is there but not a login drops the whole word: a bad `to` must never turn a directed ask
 *  into one for the whole room. Anything else, null: not carried */
export function roomOf(v: Record<string, unknown>): RoomWire | null {
  if (typeof v.repo !== "string" || !REPO.test(v.repo)) return null;
  const to = typeof v.to === "string" && v.to && LOGIN.test(v.to) ? v.to : "";
  if (v.to !== undefined && !to) return null;
  if (v.want === "in") {
    if (v.github !== undefined && !(typeof v.github === "string" && GITHUB_LOGIN.test(v.github))) return null;
    if (v.proof !== undefined && !(typeof v.proof === "string" && GIST_ID.test(v.proof))) return null;
    return { want: "in", repo: v.repo, ...(to ? { to } : {}), ...(typeof v.github === "string" ? { github: v.github } : {}), ...(typeof v.proof === "string" ? { proof: v.proof } : {}) };
  }
  if (v.want !== undefined || v.github !== undefined || v.proof !== undefined || !to || !ANSWERS.includes(v.in as never)) return null;
  const why = line(v.why, 120);
  return { to, repo: v.repo, in: v.in as (typeof ANSWERS)[number], ...(why ? { why } : {}) };
}

/** a show's line roles (#101) */
export const SHOW_ROLES = ["person", "agent", "tool"] as const;
/** a show's line, at most this long (show.ts TEXT_MAX) */
export const SHOW_TEXT_MAX = 400;
export type ShowWire = { issue: number; repo: string; session: { id: string; title: string }; event: "start" | "line" | "end";
  scope?: "room"; thing?: string; line?: { role: (typeof SHOW_ROLES)[number]; text: string; at: number } };
// a line's text: no control or format characters but the newlines a show's lines are glued with, cut to the max
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\p{Cf}]|[^\P{Cc}\n]/gu, "").trim().slice(0, max) : "");

/** a show as the hub passes it (#238): rebuilt field by field, each checked, so nothing a sender adds rides along (a
 *  file, a path, a tool's output). An issue show (#101) names its issue; a room session's show (`scope: "room"`, the
 *  studio PRD §9.6) names none. Anything else, null: not carried */
export function showOf(v: Record<string, unknown>): ShowWire | null {
  const ev = v.event;
  if (ev !== "start" && ev !== "line" && ev !== "end") return null;
  const s = isObj(v.session) ? v.session : null;
  if (!s || typeof s.id !== "string" || !SESSION_ID.test(s.id)) return null;
  const room = v.scope === "room";
  const issue = room ? 0 : Number(v.issue);
  if (!room && (!Number.isInteger(issue) || issue <= 0 || issue > 1e9)) return null;
  const repo = room ? "" : typeof v.repo === "string" && /^[\w.\/-]{0,100}$/.test(v.repo) ? v.repo : "";
  const out: ShowWire = { issue, repo, session: { id: s.id, title: line(s.title, 120) }, event: ev };
  if (room) { out.scope = "room"; if (typeof v.thing === "string" && THING_ID.test(v.thing)) out.thing = v.thing; }
  if (ev === "line") {
    const l = isObj(v.line) ? v.line : null;
    if (!l || !SHOW_ROLES.includes(l.role as never)) return null;
    const t = text(l.text, SHOW_TEXT_MAX);
    if (!t) return null;
    out.line = { role: l.role as (typeof SHOW_ROLES)[number], text: t, at: typeof l.at === "number" && Number.isFinite(l.at) && l.at > 0 ? Math.floor(l.at) : Date.now() };
  }
  return out;
}

// ---- talk's attachments (#315, PROTOCOL.md round 54): a talk line may name a file the sender's Sol wrote into the room's
// record; the line carries where it is and what it is, never its bytes ----
/** where an attachment lives in a room's record: `.sol/talk/<line id>.<ext>` */
export const TALK_FILE_PATH = /^\.sol\/talk\/[\w-]{1,80}\.[a-z0-9]{1,8}$/;
/** an attachment's name is one line of at most this many characters */
export const TALK_FILE_NAME_MAX = 100;
/** an attachment is at most 5 MB, the record's own cap on a file */
export const TALK_FILE_MAX = 5 * 1024 * 1024;
export type TalkFile = { path: string; name: string; size: number; kind: "image" | "file" };

/** a talk line's id without its part (`<id>-p2` is a part of `<id>`, round 41): the stem its attachment's path must
 *  have (pure) */
export const lineBase = (id: string) => id.replace(/-p\d{1,3}$/, "");
/** is a talk line's id true to its part (pure; the second review): an id `<id>-pN` only with `part [N, …]`, and an id
 *  with no part names no part, so `-pN` cannot be used to point at another line's attachment */
export function partIdOk(id: string, part: unknown): boolean {
  const m = /-p(\d{1,3})$/.exec(id);
  if (!m) return true;
  return Array.isArray(part) && Number(part[0]) === Number(m[1]);
}
/** a talk line's `file` as the hub passes it and an engine keeps it (#315): exactly path, name, size and kind, each
 *  checked (the path under `.sol/talk/`, the name one line of 100 with no `/`, the size a whole number up to 5 MB, the
 *  kind image or file); anything else, none. With the line's `id`, the path's name must be that line's (`.sol/talk/<id>.
 *  <ext>`), so a line can never point at another line's file (pure) */
export function talkFileOf(v: unknown, id?: string): TalkFile | undefined {
  if (!isObj(v) || typeof v.path !== "string" || !TALK_FILE_PATH.test(v.path)) return undefined;
  if (id !== undefined && v.path.slice(10, v.path.lastIndexOf(".")) !== lineBase(id)) return undefined;
  const name = line(v.name, TALK_FILE_NAME_MAX);
  if (!name || name.includes("/")) return undefined;
  if (typeof v.size !== "number" || !Number.isInteger(v.size) || v.size < 0 || v.size > TALK_FILE_MAX) return undefined;
  if (v.kind !== "image" && v.kind !== "file") return undefined;
  return { path: v.path, name, size: v.size, kind: v.kind };
}

const THREAD_NAME = /^(general|#[1-9]\d{0,5})$/;
export type TalkWire = { thread: string; text: string; part?: [number, number]; to?: "discord"; file?: TalkFile };
/** a talk line as the hub passes it (#315, the review): rebuilt from exactly its thread, text, part, to and file, each
 *  checked, so nothing a sender adds (bytes, a path of its own) is fanned out or spooled. A `file` that does not check,
 *  or names another line's file, refuses the whole line: null (pure; the id and the signature are the hub's own) */
export function talkOf(v: Record<string, unknown>, id: string): TalkWire | null {
  if (typeof v.thread !== "string" || !THREAD_NAME.test(v.thread) || typeof v.text !== "string") return null;
  if (!partIdOk(id, v.part)) return null;
  const out: TalkWire = { thread: v.thread, text: v.text };
  if (Array.isArray(v.part) && v.part.length === 2 && v.part.every((x) => Number.isInteger(x) && x >= 1 && x <= 999)) out.part = [v.part[0] as number, v.part[1] as number];
  if (v.to === "discord") out.to = "discord";
  if (v.file !== undefined) { const f = talkFileOf(v.file, id); if (!f) return null; out.file = f; }
  return out;
}
/** a hello's `talkSince { [thread]: at }` (#315): the newest line each thread already has on that Sol, so the hub sends
 *  only newer ones. At most 50 threads, each a real thread and a time (pure); none: the whole history, as before */
export function talkSinceOf(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, at] of Object.entries(v).slice(0, 50)) if (THREAD_NAME.test(k) && typeof at === "number" && Number.isFinite(at) && at > 0) out[k] = Math.floor(at);
  return Object.keys(out).length ? out : undefined;
}

// ---- build updates (#328, the Cowork PRD §9.6; PROTOCOL round 60) ----
/** what happened in a connected repository, one word each, as the feed says it: a push, a pull request opened or marked
 *  ready, one merged (landed) or closed, an issue opened or closed, a release published (stamped) */
export const EVENTS = ["pushed", "pr-opened", "pr-ready", "landed", "closed", "opened", "stamped"] as const;
export type EventWord = (typeof EVENTS)[number];
/** where a build update came from: the repository's workflow (`.github/workflows/sol-group.yml`), or a connector's Sol
 *  that read the board for the members without gh (`poll`) */
export const EVENT_SOURCES = ["workflow", "poll"] as const;
/** at most this many commits a push carries, each its sha and the first line of its message */
export const COMMITS_MAX = 20;
/** a title's and a commit message's line */
export const EVENT_TEXT_MAX = 140;
export type EventCommit = { sha: string; message: string };
export type EventWire = { repo: string; event: EventWord; actor: string; title: string; number?: number; url?: string; branch?: string;
  commits?: EventCommit[]; total?: number; head?: string; at: number; source: (typeof EVENT_SOURCES)[number] };   // total, head (review P2-7): a push's commit count and its head commit's first line
const ACTOR = /^[A-Za-z0-9-]{1,39}(\[bot\])?$/, SHA = /^[0-9a-f]{7,40}$/, BRANCH = /^[\w./-]{1,100}$/;

/** a build update as the hub, the cloud and every Sol pass it (#328): rebuilt field by field, each checked, so nothing a
 *  sender adds rides along. Its words are untrusted room content (GitHub's titles and commit messages are anyone's who
 *  can push or open an issue): one line each, no control or format characters, 140 at most. A url is GitHub's own page
 *  of that repository or none. `at` is the sender's ms, never past `now` by more than a minute. Anything else, null */
export function eventOf(v: unknown, now = Date.now()): EventWire | null {
  if (!isObj(v) || !EVENTS.includes(v.event as EventWord) || typeof v.repo !== "string" || !REPO.test(v.repo)) return null;
  const source = v.source === "poll" ? "poll" : "workflow";
  const actor = typeof v.actor === "string" && ACTOR.test(v.actor) ? v.actor : "";
  const n = Number(v.number);
  const number = Number.isInteger(n) && n > 0 && n <= 1e9 ? n : undefined;
  const url = typeof v.url === "string" && v.url.length <= 300 && v.url.toLowerCase().startsWith(`https://github.com/${v.repo.toLowerCase()}/`) && !/[\s"'<>\\]/.test(v.url) ? v.url : undefined;
  const branch = typeof v.branch === "string" && BRANCH.test(v.branch) && !v.branch.includes("..") ? v.branch : undefined;
  const commits: EventCommit[] = [];
  for (const c of Array.isArray(v.commits) ? v.commits : []) {
    if (commits.length >= COMMITS_MAX) break;
    if (!isObj(c) || typeof c.sha !== "string" || !SHA.test(c.sha.toLowerCase())) continue;
    commits.push({ sha: c.sha.toLowerCase().slice(0, 40), message: line(typeof c.message === "string" ? c.message.split("\n")[0] : "", EVENT_TEXT_MAX) });
  }
  const t = typeof v.at === "number" && Number.isFinite(v.at) && v.at > 0 ? Math.floor(v.at) : typeof v.at === "string" && !Number.isNaN(Date.parse(v.at)) ? Date.parse(v.at) : now;
  const total = Number(v.total), head = line(typeof v.head === "string" ? v.head.split("\n")[0] : "", EVENT_TEXT_MAX);
  const push = v.event === "pushed" ? { commits, ...(Number.isInteger(total) && total >= commits.length && total <= 1e6 ? { total } : {}), ...(head ? { head } : {}) } : {};
  return { repo: v.repo, event: v.event as EventWord, actor, title: line(v.title, EVENT_TEXT_MAX), ...(number ? { number } : {}), ...(url ? { url } : {}),
    ...(branch ? { branch } : {}), ...push, at: Math.min(t, now + 60_000), source };
}

/** a hello's or a presence's `polls` holds at most this many repositories */
export const POLLS_MAX = 20;
/** the repositories a hello or a presence says this Sol may read the board of for its room (#328, `polls`): GitHub's
 *  shape (REPO), each once, at most POLLS_MAX. Anything else, none. The hub keeps only those its room's record lists
 *  (relay-hub.ts pollers) */
export function pollsOf(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && REPO.test(x) && !out.some((o) => o.toLowerCase() === x.toLowerCase()) && out.length < POLLS_MAX) out.push(x);
  return out.length ? out : undefined;
}

// ---- Ask for a session (#335, the Cowork PRD §9.8; PROTOCOL.md round 113): a teammate's agent, or the teammate, asks
// for one of my past group sessions (`ask`, kept like a ping for a day), and my one press gives it (`give`, pages of
// lines, live only, never kept). Both are directed: they reach `to` and nobody else, and the hub rebuilds them field by
// field, so nothing a sender adds rides along (a path, a tool's output, a file) ----

/** an ask lives a day (#335): on the hub's spool and in the asked person's Sol; past that it is gone, unanswered */
export const ASK_MS = 86_400_000;
/** a give's page carries at most this many lines, each at most GIVE_TEXT_MAX characters, and a give at most GIVE_MAX
 *  lines in all: the person's and the agent's words and the tools' names of one session, never more */
export const GIVE_LINES = 200, GIVE_TEXT_MAX = 400, GIVE_MAX = 2000;
export type GiveLine = { role: (typeof SHOW_ROLES)[number]; text: string; at: number };
export type AskWire = { to: string; session: string; title: string };
/** page 1..of of a give; of 0 is "not now" (page 0, no lines) */
export type GiveWire = { to: string; session: string; page: number; of: number; lines: GiveLine[] };
const TO = /^[A-Za-z0-9-]{1,39}$/;

/** an ask as the hub passes it (#335): to, the session's id and its title as the asker read it, each checked; else null */
export function askOf(v: Record<string, unknown>): AskWire | null {
  if (typeof v.to !== "string" || !TO.test(v.to) || typeof v.session !== "string" || !SESSION_ID.test(v.session)) return null;
  return { to: v.to, session: v.session, title: line(v.title, 120) };
}

/** a give's page as the hub passes it (#335): to, the session, the page and how many there are, and at most GIVE_LINES
 *  lines of a show's roles, each text cut to GIVE_TEXT_MAX; a page with no line left is not one. "not now" is of 0 with
 *  no lines. Anything else, null: not carried */
export function giveOf(v: Record<string, unknown>): GiveWire | null {
  if (typeof v.to !== "string" || !TO.test(v.to) || typeof v.session !== "string" || !SESSION_ID.test(v.session)) return null;
  const page = Number(v.page), of = Number(v.of);
  if (!Number.isInteger(of) || of < 0 || of > GIVE_MAX) return null;
  if (of === 0) return { to: v.to, session: v.session, page: 0, of: 0, lines: [] };
  if (!Number.isInteger(page) || page < 1 || page > of || !Array.isArray(v.lines)) return null;
  const lines: GiveLine[] = [];
  for (const l of v.lines.slice(0, GIVE_LINES)) {
    if (!isObj(l) || !SHOW_ROLES.includes(l.role as never)) continue;
    const t = text(l.text, GIVE_TEXT_MAX);
    if (t) lines.push({ role: l.role as GiveLine["role"], text: t, at: typeof l.at === "number" && Number.isFinite(l.at) && l.at > 0 ? Math.floor(l.at) : 0 });
  }
  return lines.length ? { to: v.to, session: v.session, page, of, lines } : null;
}

/** a signal's caps (#1377): signals one person may send in a UTC day, and to any one person in it */
export const SIGNALS_A_DAY = 200, SIGNALS_TO_ONE = 30;
/** what a ping-like kind may say on a signal, so the receiver's dials still route it (a word, never content) */
export const SIGNAL_PK = ["clash", "contract", "claim", "decision", "chat"] as const;
export type SignalWire = { to: string; sk: 1 | 2 | 3; link: string; pk?: (typeof SIGNAL_PK)[number] };
/** a signal as the hub passes it (#1377): to, a kind 1|2|3, an https link of at most 500 characters (a GitHub one for
 *  kinds 1 and 2) and, if said, its ping kind. Nothing else: no line, no text. Anything else, null: not carried */
export function signalOf(v: Record<string, unknown>): SignalWire | null {
  if (typeof v.to !== "string" || !TO.test(v.to)) return null;
  const sk = Number(v.sk);
  if (sk !== 1 && sk !== 2 && sk !== 3) return null;
  if (typeof v.link !== "string" || v.link.length > 500 || /[\s\u0000-\u001f\u007f]/.test(v.link)) return null;
  let u: URL;
  try { u = new URL(v.link); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (sk !== 3 && u.hostname !== "github.com") return null;
  const pk = SIGNAL_PK.includes(v.pk as never) ? (v.pk as SignalWire["pk"]) : undefined;
  return { to: v.to, sk, link: u.href, ...(pk ? { pk } : {}) };
}
