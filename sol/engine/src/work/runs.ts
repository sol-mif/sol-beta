// Live Work sessions: one Claude Code query per open session, kept alive between turns (streaming input), so a
// message sent while it works is queued into the same run and folded in at the next step, as in the Claude app.
// Every event goes to every face, tagged with the session, so two windows (or a split view) show the same run.
// A run that sits idle for 15 minutes is closed; the next message resumes it from the transcript.
import { randomUUID } from "node:crypto";
import { getSettings, liveContext, uiNext } from "../settings.js";
import { latest } from "../models.js";   // an older version of a family runs as its newest (#863)
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordHomeOf, youHereTold } from "../next/you.js";   // "you, here" on a new face's new session (#1615)
import { rememberTold } from "../next/you-known.js";
import { homedir } from "node:os";
import { query, createSdkMcpServer, tool, type HookCallbackMatcher, type HookEvent, type Options, type PermissionMode, type PermissionResult, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { seatTools, runSolTool } from "../tools.js";
import { HOME_ONLY } from "../suggest.js";
import { saveFiles, attachedLines, type FileIn } from "../files.js";
import { Items, type Item } from "./items.js";
import { relocated, sessionInfo, sessionItems, workFolderIn } from "./sessions.js";
import { STATE_DIR, mark, prefs, workState, stricter } from "./state.js";
import { TOOLS as BROWSER_TOOLS } from "../browser.js";
import { forget, heard } from "../openfor.js";   // #1521
import { pagesWritten, pageWritten, askLine, asked, splitAsk, point, start as startStage, whoFor, getBlock, type AskStage } from "./blocks.js";   // the stage's page watcher (#695); the ask's stage (#698); a new session's stage (#700)
import { since as eyesSince } from "./eyes.js";   // what the person did on the stage since the last turn (#1435)
import { WORK_TOOLS, runWorkTool, toolsOnlyFor, narrowFor, runOnlyTool, forCheckout } from "./tools.js";
import { featuresRoot } from "../team/checkpoint.js";   // the tool checkpoint, for feature folders only (#482)
import { mentioned } from "./files.js";
import { makeCopy } from "./copies.js";
import { heldElsewhere, HOLDER_NAME, moving } from "./holders.js";
import type { Changing } from "../changing.js";
import { join as joinBusy, lockSession } from "../busy.js";
import { fromContext, estimateUsage, memoryFiles, catchUp, liveUsage, partOf, type Usage, type ContextAnswer, type CardPart, type PartReading } from "./overview.js";
import { getTeam, speakParagraph } from "../team/settings.js";
import { tableMode } from "../team/tablelevel.js";   // a table's level is its sessions' mode (#1541)
import { onTeamNow } from "../team/onteam.js";
import { guardSpeak } from "../team/control.js";
import { ceilingGuard, ceilingHooks, solChecked } from "../home/ceiling.js";   // Home 5: the upper limit at position two, only inside a Home Run
import { Held, sinceAfter, startsTurn, tasksAfter, type BgTask } from "./turns.js";
import { ownStage, compacting } from "./one.js";
import { AUTOMATION_PURPOSE } from "../next/automation-tool.js";
import { CANVAS_NAMES } from "../next/canvas-tool.js";   // #1615: the canvas's own moves never ask   // #1615: a session Add's Automation opened is told what it is for
import { issueAt } from "../team/show.js";
import { relayUp } from "../team/relay.js";
import { runGit } from "../team/note.js";
import { opening } from "./opening.js";   // a Sol developer's "your area" line (#480, team/area.ts)
import { reachOpening } from "../team/reach.js";   // hand-overs waiting on my person (#1166)
import { startedSession } from "./asks.js";   // what was pressed later comes back on the day's first session (#1298)
import { homeLine } from "../cross.js";   // #1031: the pieces Home hands the talk
import { logging, turnStarted, turnEnded, stepTaken, sent, fileOf, sizeOf, claudeTokens, base64Bytes } from "../seatlog.js";   // this seat's own steps on the log

// Sol changing its own face from a Work session (src/changing.ts): set once by the engine at start
let changing: Changing | null = null;
export function setChanging(c: Changing) { changing = c; }
// a turn of a session ended (its result, a stop, the session closed): what was held for that turn only is let go (#335,
// team/ask.ts: a teammate's given lines, once read)
const turnEnds = new Set<(id: string) => void>();
/** told the session's id each time one of its turns ends; returns the way to stop being told */
export function onTurnEnd(fn: (id: string) => void) { turnEnds.add(fn); return () => { turnEnds.delete(fn); }; }
const turnOver = (id: string) => {
  for (const f of turnEnds) { try { f(id); } catch { /* one listener never stops the run */ } }
  const r = runs.get(id); if (r) r.turnFrom = 0;   // told first, so a listener reads when the turn began (#1297)
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type WorkSay = {
  sessionId: string; fresh?: boolean; cwd?: string; text: string; files?: FileIn[];
  model?: string; effort?: string; mode?: PermissionMode; fast?: boolean; parent?: string;
  worktree?: boolean;   // a fresh session in a side copy of its folder's repo (copies.ts)
  id?: string;          // the message's id, named by the face so its line shows on the press and this echo lands on it (#917)
  opening?: boolean;    // a person started it from the face (#480): only then may it open with their area's line; the
                        // engine's own sessions (the night's review, re-checks, carry-overs, an agent's) never do
  role?: string;        // a fresh session's part in the dev cycle (#484): kept on it (state.ts), the guard's SOL_ROLE
  stage?: AskStage;     // the stage's bar (#698): the chips (things) and what the person pointed at (on), sol.stage only
  home?: unknown[];     // #1031: the pieces a Home folder handed the talk (cross.ts homeLine), read under the words
  person?: boolean;     // #1521: said by the person in their own window (wire.ts work.say), never by Sol, a session or an agent
  place?: unknown;      // #1615: where the new face put a new session ("dev/api"), read by "you, here"
  here?: string;        // #1615: "you, here", set by workSay only (never the face's), read before the words
  owed?: string;        // a switch the session slept through (one.ts owedTo, #1808): set by wire.ts only, read as `here`
  purpose?: unknown;    // #1615 birth.html row 5: what Add made the session for ("automation"), told before the words
};
export type Answer = { allow: boolean; always?: boolean; note?: string; answers?: Record<string, string>; mode?: PermissionMode };
type Bus = (msg: object) => void;

// the newest run's start report: the tools drawer lists its skills, plugins and MCP servers
export let lastInit: any = null;
const IDLE_MS = 15 * 60 * 1000;
// #1335: Claude Code compacts a talk on its own past its autocompact window; an orchestration session renews instead
// (one.ts compacting), so its compaction is held off here, on every seat (a session is promoted after its seat was
// launched)
function heldCompaction(hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>, id: () => string): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const hold: HookCallbackMatcher = { hooks: [async (i) => (i.hook_event_name === "PreCompact" && compacting(i.session_id || id(), i.trigger).hold
    ? { decision: "block" as const, reason: "Sol renews this session with a written handover when the turn ends" } : {})] };
  return { ...hooks, PreCompact: [...(hooks.PreCompact ?? []), hold] };
}
const CLOSING_MS = 10_000;
const WAKE_MS = 30_000;   // how long a background task's end holds the counter for the turn it wakes (#1566)   // how long a message waits for a closing run's CLI to end before it is called lost (#895)
const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
// the Work defaults from Marco's settings file (#94): Claude's model and effort, and the mode
export const workDefaults = () => { const d = getSettings().defaults; return { model: latest(d.model.claude), effort: d.effort.claude, mode: d.mode as PermissionMode }; };
// how free a ticket's executor or an orchestration's session is, as a mode (one.ts Free, ticketTypes.ts Mandate): the
// mandate's `free` tells it apart only while the person's Work default asks at all; a default of bypassPermissions is the
// person's word that every session runs unasked, and the sessions agents start are no exception (Frank, 2026-11-20: the
// executors came up acceptEdits, each asking before a command, while his default said bypass)
export const modeFor = (free: "ask" | "edits" | undefined, dflt: PermissionMode = workDefaults().mode): PermissionMode | undefined =>
  !free ? undefined : dflt === "bypassPermissions" ? "bypassPermissions" : free === "edits" ? "acceptEdits" : "default";
/** the mode a session started from another begins on before any mandate (pure): bypass when the person's Work default is
 *  bypass, whatever the opener runs on (Frank, 2026-11-20 #29: an auto orchestrator started its executors acceptEdits and
 *  they stopped to ask while he was away); else the opener's own while it is live (the picker moved on it mid-session
 *  counts: a session switched to bypass starts the next ones on bypass), never plan (a sub-session is started to do the
 *  work), else the Work default */
export const baseModeFrom = (own: PermissionMode | undefined, dflt: PermissionMode): PermissionMode =>
  dflt === "bypassPermissions" || !own || own === "plan" ? dflt : own;
export const baseModeOf = (parent?: string): PermissionMode => baseModeFrom(parent ? runs.get(parent)?.mode : undefined, workDefaults().mode);
/** a run's mode as it starts (pure, #1151 and #1541): a session another person's words woke asks first, always; one that
 *  works for a table (marked with a roomId) runs in that table's level (tablelevel.ts), no further than does-then-tells
 *  when it is a hand my AI took with nobody pressing; any other keeps its own */
export function startMode(mode: PermissionMode, woken: unknown, level: string | undefined, atTable: boolean, onTeam: boolean, handed = false): PermissionMode {
  if (woken) return "default";
  const m = (atTable ? tableMode(level, onTeam) : null) ?? mode;
  // a hand my AI took on its own carries another person's words (#1541): edits may go ahead, a command still asks
  return handed && m === "bypassPermissions" ? "acceptEdits" : m;
}
// the picker moved on a live session: told the session's id and its new mode, so the sessions under it can follow
const modeChanges = new Set<(id: string, mode: PermissionMode) => void>();
export function onModeChange(fn: (id: string, mode: PermissionMode) => void) { modeChanges.add(fn); return () => { modeChanges.delete(fn); }; }
/** the live sessions that follow `id` when its mode moves (pure): the ones it started (marked parent, not under
 *  another), and its tickets' executors (the ticket is subscribed to it). Plan is nobody's to hand down */
export function modeFollowers(id: string, mode: PermissionMode, live: Iterable<string>, marks: Record<string, { parent?: string | null } | undefined>,
  tickets: { executor?: { sessionId: string }; subs: { kind: string; key: string }[] }[]): string[] {
  if (mode === "plan") return [];
  const out = new Set<string>();
  for (const c of live) if (c !== id && marks[c]?.parent === id) out.add(c);
  for (const t of tickets) if (t.executor && t.subs.some((s) => s.kind === "session" && s.key === id)) out.add(t.executor.sessionId);
  out.delete(id);
  return [...out];
}

class Inbox implements AsyncIterable<SDKUserMessage> {
  private q: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  closed = false;
  push(m: SDKUserMessage) { this.q.push(m); this.wake?.(); }
  close() { this.closed = true; this.wake?.(); }
  async *[Symbol.asyncIterator]() {
    for (;;) {
      if (this.q.length) yield this.q.shift()!;
      else if (this.closed) return;
      else await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }
}

export type RunInfo = {
  sessionId: string; busy: boolean; waiting: number; cwd: string; model: string; effort: string; mode: PermissionMode; fast: boolean;
  context: number; window: number; commands?: string[]; skills?: string[]; agents?: string[]; mcp?: { name: string; status: string }[];
  outputStyle?: string; cost?: number; failed?: boolean;
  usage?: Usage;   // the context split (round 20): counted after each turn, the SDK's estimate at the start, else bytes/4
  tasks: string[];   // the background agents still at work while the main thread waits (their descriptions)
  since: number;     // when this stretch of work began (the turn, or the agents after it), 0 while idle (#47)
  shown: boolean;    // shown to the team over the relay (#101), for this run only
  issue?: number; relay?: boolean;   // the team issue its branch names, and whether the relay is up: the switch shows then
  paused?: boolean;  // held (next.atwork, BR1 item 7): the turn under way finishes, then nothing more begins until Go on
};

export class Run {
  items: Items;
  q: Query | null = null;
  inbox = new Inbox();
  private pages = new Map<string, string>();   // a page's Write or Edit until its result (#695, blocks.ts pagesWritten)
  private held = new Held<SDKUserMessage>();   // said while the main thread works, until the turn ends (#51)
  busy = false;                                // the main thread is in a turn (streaming)
  tasks: BgTask[] = [];                        // background agents at work after the turn ended (turns.ts)
  since = 0;                                   // when `working` last turned on, for the face's clock (#47)
  failed = false;
  paused = false;                              // held (parts/next-atwork.ts): the turn finishes, what waits behind it waits on
  shown = false;                               // shown to the team (#101): set by work.show, never kept past the run
  issue: number | null = null;                 // the issue the folder's branch names, read at start and after each turn
  turnFrom = 0;                                // when the turn under way began, 0 between turns: read at onTurnEnd (#1297, People's minutes)
  perms = new Map<string, (a: Answer) => void>();
  private idle: NodeJS.Timeout | undefined;
  window = 1_000_000;
  init: any = null;
  cost = 0;
  usage: Usage | null = null;                  // the last split getContextUsage gave (overview.ts)
  private measuring = false;
  private again: "summary" | "full" | null = null;   // a count asked while one was under way: made when that one ends
  private counted: ContextAnswer | null = null;      // the last full count, whole: a part's breakdown is read from it (#1519)
  private countedAt = 0;                             // when the last full count was asked (ms): the 10 s throttle
  private countedOk = 0;                             // when the last full count that answered was made: the breakdown's `at`
  private steppedAt = 0;                             // when the last main-thread step's own count came back
  private memory: { path: string; bytes: number }[] | null = null;   // the CLAUDE.md files, for the bytes/4 split
  private leave: (() => void) | null = null;   // this run's turn on the busy counter (busy.ts)
  private holdTasks: (() => void) | null = null;   // its agents' place on the same counter, while any works
  private waking: (() => void) | null = null;      // a background task handed back with the main thread at rest (#1566)
  private wakeT: NodeJS.Timeout | undefined;
  private unlock = () => {};                   // its hold on the session, one writer (busy.ts)
  private uses = new Map<string, { name: string; file?: string; agent: boolean }>();   // every tool_use, for the log's step when its result comes
  private turnOpen = false;                    // a turn is on the log (seatlog.ts) and not yet ended there
  private over = () => {};
  /** resolves when the run has ended: its loop is over and it is off `runs` (workSay waits on it, #895) */
  readonly gone = new Promise<void>((r) => (this.over = r));
  /** something is going on: a turn, or background agents that will wake the main thread when they hand back */
  get working() { return this.busy || this.tasks.length > 0; }
  constructor(public id: string, public cwd: string, public model: string, public effort: string, public mode: PermissionMode, public fast: boolean, private bus: Bus, history?: Items) {
    this.unlock = lockSession(id, "work", cwd);   // throws when Life is writing it: the caller tells the face
    this.items = new Items((it) => this.bus({ type: "work.item", sessionId: id, item: it }), (iid, text) => this.bus({ type: "work.delta", sessionId: id, id: iid, text }));
    if (history) this.items.adopt(history);
  }

  info(): RunInfo {
    return {
      sessionId: this.id, busy: this.busy, waiting: this.perms.size, cwd: this.cwd, model: this.model, effort: this.effort, mode: this.mode,
      fast: this.fast, context: this.items.usage.context, window: this.window, failed: this.failed, cost: this.cost,
      tasks: this.tasks.map((t) => t.description), since: this.since, shown: this.shown, ...(this.paused ? { paused: true } : {}),
      ...(this.issue ? { issue: this.issue, relay: relayUp() } : {}),
      ...(this.init ? { commands: this.init.slash_commands, skills: this.init.skills, agents: this.init.agents, mcp: this.init.mcp_servers, outputStyle: this.init.output_style } : {}),
      ...(this.init || this.items.usage.context ? { usage: this.usage ? (liveContext() ? liveUsage(this.usage, this.items.usage.context, this.steppedAt > this.countedOk) : catchUp(this.usage, this.items.usage.context)) : this.guess() } : {}),
    };
  }

  // the split the way Life does it, while getContextUsage has not answered (or cannot): bytes/4, the rest unknown
  private guess(): Usage {
    this.memory ??= memoryFiles(this.cwd);
    let chars = 0;
    for (const i of this.items.list) {
      if (i.parent) continue;
      if (i.kind === "me" || i.kind === "you" || i.kind === "think") chars += String(i.text ?? "").length;
      else if (i.kind === "tool") chars += JSON.stringify(i.input ?? "").length + String(i.out ?? "").length;
    }
    const u = estimateUsage({ init: this.init, context: this.items.usage.context, window: this.window, chars, memory: this.memory });
    return liveContext() && u.total > 0 ? { ...u, live: true } : u;   // its total is the API's own too (#1519); the parts stay ≈
  }

  // the context split by category, as Claude Code's /context counts it: "summary" is the SDK's quick estimate (at the
  // start), "full" counts with the token-count API (after each turn, off the turn's path). A failed count falls back
  // to the summary; a failed summary keeps what was there.
  async measure(detail: "summary" | "full"): Promise<void> {
    const q = this.q;
    if (!q) return;
    // one count at a time; one asked meanwhile (the turn's end after a mid-turn count, #1519) is made when it ends, so
    // the last word is always the newest count
    if (this.measuring) { if (detail === "full" || !this.again) this.again = detail; return; }
    this.measuring = true;
    if (detail === "full") this.countedAt = Date.now();
    let ok = false;
    try {
      const r = await Promise.race([q.getContextUsage({ detail }), new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 20_000))]);
      this.usage = fromContext(r, detail === "full" ? "counted" : "summary");
      if (detail === "full") { this.counted = r; this.countedOk = Date.now(); }
      ok = true;
    } catch { /* an older CLI, the run going away */ }
    this.measuring = false;
    const next = this.again; this.again = null;
    if (!ok && detail === "full" && next !== "full") return this.measure("summary");
    if (ok && this.q === q) this.tell();
    if (next) return this.measure(next);
  }

  /** what fills one part of the card (#683, #1519: hovered in the context card), from the last full count; a count
   *  older than 10 s is made again first, off the turn's path (a control request beside the stream). null with
   *  work.liveContext off, or when no count can be made (an older CLI, the run gone): the card keeps its own reading */
  async part(id: CardPart): Promise<(PartReading & { at: number }) | null> {
    if (!liveContext()) return null;
    // waited on for 8 s at most: a slow count still lands for the next hover, the face never waits past its ask
    if (this.q && !this.measuring && Date.now() - this.countedAt > 10_000) await Promise.race([this.measure("full"), new Promise((ok) => setTimeout(ok, 8_000))]);
    return this.counted ? { ...partOf(this.counted, id), at: this.countedOk } : null;
  }

  // a step of the main thread came back (#1519): its count is the API's own, exact, so the face is told at once; the split
  // is counted again at most every 10 s while the turn runs, never waited on
  private stepped(before: number) {
    if (!liveContext() || this.items.usage.context === before) return;
    this.steppedAt = Date.now();
    this.tell();
    if (this.busy && Date.now() - this.countedAt > 10_000) void this.measure("full");
  }
  // every change of state is told at once, so the clock lives here: it starts when work starts, stops when it stops
  tell(ended = false) {
    this.since = sinceAfter(this.working, this.since);
    this.bus({ type: "work.run", ...this.info(), ...(ended ? { ended: true } : {}) });
  }

  start(fresh: boolean, open = false) {
    const p = prefs();
    // the browser tools only when the browser drawer allows them; Home's group offer never (#321); the desk's never: a
    // session's things are blocks on its stage, made with the six tools (the swap, #718)
    const browser = new Set(BROWSER_TOOLS.map((t) => t.name));
    // a session a comment on GitHub started (#1151, team/wake.ts) is bare on every run, a resume after a restart too: none
    // of my settings (no allow rules, hooks or MCP servers of mine), none of Sol's tools (no session doors), the ask-first
    // mode and never bypass. One another person woke is narrow besides (its three tools, given again after a restart)
    const woken = workState().marks[this.id]?.woken;
    const side = !!workState().marks[this.id]?.parent;   // a side session builds in the background: nothing for the person lands there (#1298)
    const roomId = workState().marks[this.id]?.roomId;
    this.mode = startMode(this.mode, woken, roomId ? getTeam().rooms.find((r) => r.id === roomId)?.level : undefined, !!roomId, onTeamNow() !== false, !!workState().marks[this.id]?.handed);   // not yet asked counts as on the team: nothing changes until GitHub says no
    const solTools = woken ? [] : seatTools().filter((t) => (p.browser || !browser.has(t.name)) && !HOME_ONLY.has(t.name) && !t.name.startsWith("desk_"));
    // a session given a tool of its own (#421, the re-check) is narrow: that tool and nothing else. No built-in tool
    // (no shell, no edits, no web), none of Sol's other tools and no MCP server from settings, so words planted in the
    // diff it reads can do nothing but answer
    const narrow = narrowFor(this.id) || woken === "others";   // tools given `beside` (an orchestration session, an executor) leave the session its ordinary tools; one another person woke is narrow by its mark (#1151)
    const workTools = narrow || woken ? [] : WORK_TOOLS.filter((t) => t.name !== "checkpoint" || !!featuresRoot(this.cwd));
    // Home 5: every tool on this server is run through the upper limit's guard (runSolTool, runWorkTool, runOnlyTool),
    // so the hook and canUseTool leave these names to it (any other mcp__sol__ name they check themselves)
    solChecked([...(narrow ? [] : solTools), ...workTools, ...toolsOnlyFor(this.id)].map((t) => t.name));
    const sol = createSdkMcpServer({
      name: "sol",
      version: "1.0.0",
      tools: [
        ...(narrow ? [] : solTools).map((t) => tool(t.name, t.description, t.shape, async (args) => (await runSolTool(t.name, args, { sessionId: this.id, seat: "work" })) as any)),
        // checkpoint (#482) only in a checkout of sol-dev with feature folders (featuresRoot): never in a Sol tester's copy or another project
        ...workTools.map((t) => forCheckout(t, teamCheckout(this.cwd))).map((t) => tool(t.name, t.description, t.shape as any, async (args) => (await runWorkTool(t.name, args, this.id)) as any)),
        // a tool given to this session alone (#421, the re-check's answer): asked for by its id at every call
        ...toolsOnlyFor(this.id).map((t) => tool(t.name, t.description, t.shape, async (args) => (await runOnlyTool(this.id, t.name, args)) as any)),
      ],
    });
    // its part in the dev cycle (#484): the guard reads SOL_ROLE, the stricter of the session's own and one this engine
    // was started with (a first-timer's stage), so the guard holds every call of this run to its locks
    const role = stricter(workState().marks[this.id]?.role, process.env.SOL_ROLE);
    const options: Options = {
      model: this.model,
      env: roleEnv(role),
      effort: this.effort as Options["effort"],
      cwd: this.cwd,
      ...(fresh ? { sessionId: this.id } : { resume: this.id }),
      settingSources: woken ? [] : ["user", "project", "local"],
      systemPrompt: {
        type: "preset", preset: "claude_code",
        append: "You are running inside Sol's Work mode (Marco's own Claude Code window). What you make for Marco to see is a block " +
          "on this session's stage (the sol tools compose, update, bind, freeze, place, read). Keep the task list as one list " +
          "block for any request with more than one step (compose it once, then update its steps), and end a turn that changed files or ran " +
          "commands with mcp__sol__wrap_up (two or three sentences of recap; one question and one or two buttons only " +
          "when Marco has a decision to make). Session tools (list, read, message, start, hand off, rename, archive) are on the sol server: " +
          "when Marco's new message is about something else mid-task, hand_off the task; a follow-up you only propose " +
          "is start_session with initiation \"proposal\". " +
          "On a team issue, look at mcp__sol__pings at each pause: what reached Marco while you worked (#100). " +
          "Link a session as [its title](#session/<session id>) and a file as [name](<path>:<line>), so Marco can open them with a click. " +
          "A mockup, review page, board or anything else made for Marco to look at is a page block on the stage, never the browser tab: " +
          "write the HTML file with the Write or Edit tool (an Edit, even one word, shows it again), and it opens on the stage bound to its file. " +
          "To take Marco through a system block, update its body with a lens beside the area (focus, path, say, step, mark, fit, view, show), one step at a time; the rules are the sol skill's \"Taking a person through the map\" (#1220). " +
          "The engine you run inside renews itself: a saved edit to sol/engine/src is built and goes live at the next quiet moment, " +
          "so never restart it from here (launchctl kickstart, stop, bootout, kill): that ends this very session mid-turn. " +
          speakParagraph(getTeam()) +   // where my agent may speak, how it signs (Control, team.json)
          (fresh && open ? opening(this.cwd) : "") + (fresh && !woken ? (side ? reachOpening() : (startedSession(this.id), reachOpening(this.id))) : ""),   // a Sol developer's area, for a new session they started whose checkout has the feature map (#480); what teammates' agents handed over (#1166)
      },
      permissionMode: this.mode,
      // always launched able to take bypass, so the picker can move to it mid-session (#111); the mode itself is Marco's pick
      allowDangerouslySkipPermissions: !woken,
      // Sol's own bookkeeping and look-only session tools never ask; everything else is Marco's call. A woken session: its own tools only.
      // way_press puts its own card in front of him whatever the mode (#1281): asked here too, it would be two cards
      // the canvas's own moves (#1615, next/canvas-tool.ts) are the AI's places, each one the person moves back by hand: never asked.
      // The canvas bar's session (next/canvas-agent.ts) may also use the person's skills
      allowedTools: woken ? toolsOnlyFor(this.id).map((t) => `mcp__sol__${t.name}`)
        : ["TodoWrite", ...(workState().marks[this.id]?.canvas ? ["Skill"] : []), ...["wrap_up", "list_sessions", "read_session", "rename_session", "mark_done", "archive_session", "hand_off", "pings", "read", "way_look", "way_press", ...CANVAS_NAMES, ...toolsOnlyFor(this.id).map((t) => t.name)].map((t) => `mcp__sol__${t}`)],
      canUseTool: guardSpeak(ceilingGuard((name, input, o) => this.ask(name, input, o), () => this.id)),
      hooks: ceilingHooks(() => this.id),   // Home 5: on every seat launched while Home is on, so one launched before its Run is checked too; none while Home is off
      includePartialMessages: true,
      thinking: { type: "adaptive", display: "summarized" },
      promptSuggestions: p.suggest,
      agentProgressSummaries: true,
      mcpServers: { sol },
      ...(narrow ? { tools: [], strictMcpConfig: true } : woken ? { strictMcpConfig: true } : {}),
      ...(this.fast || p.style ? { settings: { ...(this.fast ? { fastMode: true } : {}), ...(p.style ? { outputStyle: p.style } : {}) } as any } : {}),
    };
    options.hooks = heldCompaction(options.hooks!, () => this.id);   // #1335: beside the ceiling's hooks, apart from that line (home-ceiling reads it)
    this.q = query({ prompt: this.inbox, options });
    void this.loop();
    this.readIssue();
  }

  // the branch can change in a turn (sol/take makes one): read again, told only when it changed
  private readIssue() {
    void issueAt(runGit, this.cwd).then((n) => { if (n !== this.issue) { this.issue = n; this.tell(); } });
  }

  private async loop() {
    const q = this.q!;
    try {
      for await (const m of q as AsyncIterable<SDKMessage>) {
        const a = m as any;
        this.watch(a);
        this.note(a);
        // a page this session wrote is a page block on its stage, bound to the file (#695)
        for (const p of pagesWritten(a, this.pages)) void pageWritten(this.id, p).catch(() => {});
        // a turn can begin without say(): a message queued behind the last one (priority "next") runs after that
        // one's result, and a background task's end wakes the main thread by itself. It is a turn all the same: it
        // joins the busy counter, so the renew (renew.ts) never ends the engine in the middle of it (#17). A background
        // agent's own frames are not a turn (they outlive the result; #45): only the main thread's start one.
        // a background task's end wakes the resting main thread, but its first frame can be seconds away (a big context):
        // the wake holds the counter as a turn meanwhile (#1566), so a renew past its cap never lands in that gap
        if (!this.busy && a.type === "system" && a.subtype === "task_notification") this.wake();
        const tasks = tasksAfter(a, this.tasks);
        if (tasks) this.setTasks(tasks);
        if (!this.busy && startsTurn(a)) {
          this.busy = true;
          this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
          this.woke();   // after the turn's own join: the count never touches zero
          this.began();
          this.tell();
        }
        if (a.type === "system" && a.subtype === "init") { this.init = a; lastInit = a; this.mode = a.permissionMode ?? this.mode; this.tell(); void this.measure("summary"); }
        else if (a.type === "stream_event") this.items.stream(a.event, a.parent_tool_use_id ?? null);
        else if (a.type === "result") {
          this.busy = false;
          this.leave?.(); this.leave = null;
          this.woke();
          this.cost = a.total_cost_usd ?? this.cost;
          const real = (a.modelUsage?.[this.model] ?? Object.values(a.modelUsage ?? {})[0] as any)?.contextWindow;
          if (real) this.window = real;
          this.failed = a.subtype !== "success" && !a.stopped;
          if (this.turnOpen) turnEnded("work", this.id, { ok: a.subtype === "success", turns: a.num_turns, tokens: claudeTokens(a.usage), costTotal: a.total_cost_usd });   // on the log: the turn's tokens, the session's cost so far
          this.turnOpen = false;
          mark(this.id, { failed: this.failed || null });   // the ember dot outlives the run
          if (a.subtype !== "success") {
            const why = (a.errors ?? []).join("; ") || a.subtype.replace(/_/g, " ");
            this.items.put({ id: `err:${a.uuid}`, kind: "error", text: why });
          }
          this.items.settle(a.subtype === "success");
          this.tell(true);
          changing?.turn("work", this.id);
          turnOver(this.id);
          this.release();
          this.rest();
          this.readIssue();
          void this.measure("full");
        } else { const before = this.items.usage.context; this.items.feed(a); if (a.type === "assistant" && !a.parent_tool_use_id) this.stepped(before); }
      }
    } catch (err) {
      this.items.put({ id: `err:${randomUUID()}`, kind: "error", text: err instanceof Error ? err.message.split("\n")[0] : String(err) });
      this.failed = true;
      mark(this.id, { failed: true });
    } finally {
      if (this.turnOpen) { this.turnOpen = false; turnEnded("work", this.id, { ok: false }); }   // the run ended mid-turn: stopped, or broke
      changing?.turn("work", this.id);
      turnOver(this.id);
      this.items.settle(false);
      this.busy = false;
      this.leave?.(); this.leave = null;
      this.tasks = [];
      this.holdTasks?.(); this.holdTasks = null;
      this.woke();
      this.unlock();
      for (const [, r] of this.perms) r({ allow: false, note: "the session closed" });
      this.perms.clear();
      for (const m of this.held.release()) this.lost(String(m.uuid));   // said while it worked, never read: the session closed first (#51)
      this.inbox.close();   // nothing reads it from here on: a say() still under way sees that, and says so (#895)
      // a run let go (end) may have a successor (one.ts reopen): that one speaks for the session from here, not this one
      const after = runs.get(this.id), mine = !after || after === this;
      if (mine) { runs.delete(this.id); this.tell(); this.bus({ type: "work.closed", sessionId: this.id }); }
      this.over();
    }
  }

  // on the log (seatlog.ts): a turn begun, once, however it began (say, a queued message, an agent waking the main thread);
  // with the frame off there is no log, and nothing below measures for it
  private began() {
    this.turnFrom ||= Date.now();
    if (this.turnOpen || !logging()) return;
    this.turnOpen = true;
    turnStarted("work", this.id, this.model, this.mode);
  }
  // on the log: each tool this seat used, when its result is back: the tool, the file it named, the bytes it got; a
  // background agent's own marked so. Never the words
  private note(a: any) {
    const content = a.message?.content;
    if (!Array.isArray(content) || !logging()) return;
    if (a.type === "assistant") {
      for (const b of content) if (b?.type === "tool_use") this.uses.set(String(b.id), { name: String(b.name), file: fileOf(b.input), agent: !!a.parent_tool_use_id });
    } else if (a.type === "user") {
      for (const b of content) {
        if (b?.type !== "tool_result") continue;
        const u = this.uses.get(String(b.tool_use_id));
        if (!u) continue;
        this.uses.delete(String(b.tool_use_id));
        stepTaken("work", this.id, u.name, { file: u.file, bytes: sizeOf(b.content), ok: !b.is_error, agent: u.agent });
      }
    }
  }

  // an edit to Sol's face, a mutate or an undo, as it starts and ends (only the top-level calls: a helper's are its own)
  private watch(a: any) {
    if (!changing) return;
    const content = a.message?.content;
    if (!Array.isArray(content)) return;
    if (a.type === "assistant") {
      let said = "";
      for (const b of content) {
        if (b?.type === "text") said += String(b.text ?? "") + "\n";
        else if (b?.type === "tool_use") changing.tool("work", this.id, String(b.id), String(b.name), b.input, this.cwd, said);
      }
    } else if (a.type === "user") {
      for (const b of content) if (b?.type === "tool_result") void changing.result(String(b.tool_use_id), !b.is_error, b.content);
    }
  }

  // the run ends now (its session is being deleted): the SDK process goes, nothing waits on it
  end() { clearTimeout(this.idle); if (runs.get(this.id) === this) runs.delete(this.id); this.inbox.close(); }

  // closed the way the idle close closes it, now (one.ts: a session promoted or demoted, whose MCP server was built with
  // the tools of its start): the next message resumes the session in a fresh run, with the tools it has now
  close() { clearTimeout(this.idle); this.inbox.close(); }

  private rest() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { if (!this.working) this.inbox.close(); }, IDLE_MS);
  }

  // the wake's hold (#1566): until the turn it wakes begins or ends, or WAKE_MS if none comes (an end that wakes nothing)
  private wake() {
    if (this.waking) return;
    this.waking = joinBusy("work", this.id, "waking", this.cwd);
    this.wakeT = setTimeout(() => this.woke(), WAKE_MS);
    this.wakeT.unref?.();
  }
  private woke() { clearTimeout(this.wakeT); this.waking?.(); this.waking = null; }

  // the background agents at work changed: they hold the busy counter as background work (a move or a rename waits for
  // them; the renew does not, #1566, and records them for the next engine, work/cut.ts) and the face shows them; when
  // the last hands back with the main thread idle, the run is idle and the clock restarts
  private setTasks(next: BgTask[]) {
    this.tasks = next;
    if (next.length) this.holdTasks ??= joinBusy("work", this.id, "agents", this.cwd, true);
    else { this.holdTasks?.(); this.holdTasks = null; if (!this.busy) this.rest(); }
    this.tell();
  }

  async say(s: WorkSay) {
    clearTimeout(this.idle);
    const saved = s.files?.length ? await saveFiles(STATE_DIR, s.files) : [];
    // an @ mention names a file Claude should look at: the real ones are spelled out under the message
    const at = mentioned(s.text, this.cwd);
    const atLine = at.length ? `Marco mentioned ${at.length > 1 ? "these" : "this"} with @: ${at.join(", ")}` : "";
    // the stage's bar (#698): what the person pointed at becomes read's target too, and the agent reads the chips and
    // the target under the words (blocks.ts askLine); the person's line keeps only the words, the target as its chip
    let stageLine = "", on: string[] | undefined;
    asked(this.id, s.text, s.stage?.things);   // the kinds named in it land solid (#737: the ask is the press)
    // what the person did on the stage since the last turn (#1435, eyes.ts), read once: inside the same paragraph, so
    // the person's own line never shows it
    const w0 = await whoFor(this.id).catch(() => null);
    const since = w0 ? eyesSince(this.id, (id) => getBlock(w0.project, id)?.title ?? id) : "";
    if (s.stage && (s.stage.on?.length || (s.stage.things?.length ?? 0) > 1)) {
      if (w0) { if (s.stage.on?.length) point(this.id, s.stage.on); stageLine = askLine(w0.project, s.stage, since); on = splitAsk(`\n\n${stageLine}`).on; }
    } else if (since) stageLine = askLine("", { things: [] }, since);
    const text = [s.here, s.text, attachedLines(saved), atLine, stageLine, homeLine(s.home)].filter(Boolean).join("\n\n");   // #1031: Home's pieces
    const images = saved.filter((f) => f.isImage);
    const uuid = typeof s.id === "string" && UUID.test(s.id) && !this.items.has(s.id) ? s.id : randomUUID();
    if (s.person) this.paused = false;   // the person's own words go on a held session (BR1 item 7)
    const queued = this.busy;
    this.items.put({ id: uuid, kind: "me", text: s.text, ...(on ? { on } : {}), at: Date.now(), ...(saved.length ? { files: saved.map((f) => ({ name: f.name, path: f.path })) } : {}), ...(queued ? { queued: true } : {}) });
    await this.adjust(s);
    const msg = {
      type: "user", uuid, parent_tool_use_id: null,
      message: {
        role: "user",
        content: images.length
          ? [{ type: "text", text }, ...images.map((f) => ({ type: "image" as const, source: { type: "base64" as const, media_type: f.mime as "image/png", data: f.dataBase64 } }))]
          : text,
      },
    } as SDKUserMessage;
    // the run takes no more: the idle close, or the CLI's end, came first (#895). Nobody would read it from the inbox,
    // so it is not left looking sent
    if (this.inbox.closed) return this.lost(uuid, queued);
    // Stop, pressed during the picker's round trip above, ended the turn it waited behind: it begins the next one below,
    // as what waited when Stop was pressed does (#900, #1764)
    // said while the main thread works: the run keeps it until the turn ends (#51), the face shows it queued. The turn
    // can end during the picker's round trip above (#900): nothing is left to wait behind, so it goes in now
    this.words.set(uuid, s.person ? s.text : null);   // #1521: whose words these are, told as the message reaches the turn (toInbox)
    if (queued && this.busy) this.held.keep(msg);
    else { if (queued) this.unqueue(uuid); this.toInbox(msg); }
    this.busy = true;
    this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
    this.began();
    // on the log: what Sol handed the seat with this message (the files it saved, the files named with @, the stage's
    // paragraph), not the message; with the frame off nothing is measured
    if (logging()) for (const f of saved) sent("work", this.id, "attachment", { name: f.path, bytes: base64Bytes(f.dataBase64) });
    if (logging()) for (const p of at) sent("work", this.id, "mention", { name: p });
    if (stageLine && logging()) sent("work", this.id, "stage", { bytes: Buffer.byteLength(stageLine) });
    this.failed = false;
    this.tell();
  }

  // #1521: a message reaches the turn here, never earlier: only then do its words stand for set_setting (the person's own,
  // said in their window), or does a message Sol, a session or an agent sent take the person's away. A queued message
  // waiting behind a turn lends that turn nothing
  private words = new Map<string, string | null>();
  private toInbox(m: SDKUserMessage) {
    const id = String(m.uuid), w = this.words.get(id);
    this.words.delete(id);
    if (typeof w === "string") heard(this.id, w); else forget(this.id);
    this.inbox.push(m);
  }

  // the turn ended: what Marco said meanwhile goes to the SDK now, in order, and begins the next turn at once (#51)
  private release() {
    if (this.paused) return;   // held: what was said meanwhile waits until Go on (hold(false))
    const all = this.held.release();
    if (!all.length) return;
    clearTimeout(this.idle);
    const mixed = all.some((m) => typeof this.words.get(String(m.uuid)) !== "string");   // #1521: one turn, words not all the person's
    for (const m of all) { this.toInbox(m); this.unqueue(String(m.uuid)); }
    if (mixed) forget(this.id);   // a turn that holds another's message holds no yes of the person's
    this.busy = true;
    this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
    this.began();
    this.failed = false;
    this.tell();
  }

  // Pause (next.atwork, BR1 item 7): the turn under way finishes its step, then the session waits; Go on lets what was
  // said meanwhile begin the next turn, as at a turn's end
  hold(on: boolean) {
    if (this.paused === on) return;
    this.paused = on;
    if (!on && !this.busy) this.release();
    this.tell();
  }

  // a queued message joins the running turn at its next step (the Claude app's Read now, #51)
  readNow(uuid: string) {
    this.paused = false;   // the person's own press goes on a held session (BR1 item 7)
    const m = this.held.take(uuid);
    if (!m) return;
    if (!this.busy) { this.held.keep(m); this.release(); return; }   // no turn to join: it begins one, as at a turn's end
    this.toInbox({ ...m, priority: "now" });
    this.unqueue(uuid);
  }

  // a queued message is forgotten before it is read (#51); the face hides it
  drop(uuid: string) {
    this.words.delete(uuid);
    if (!this.held.take(uuid)) return;
    this.unqueue(uuid, true);
  }

  private unqueue(uuid: string, dropped = false) {
    const it = this.items.list.find((x) => x.id === uuid);
    if (it) this.items.put({ ...it, queued: false, ...(dropped ? { dropped: true } : {}) });
  }

  // a message nobody will read: marked dropped, with the note that says so (#51, #895)
  private lost(uuid: string, queued = true) {
    this.unqueue(uuid, true);
    this.items.put({ id: `lost:${uuid}`, kind: "note", text: `a ${queued ? "queued " : ""}message was not read: the session closed first` });
  }

  // the picker moved while the session lives: the run follows it without a restart
  async adjust(s: Partial<WorkSay>) {
    const q = this.q;
    if (!q) return;
    try {
      if (s.model && latest(s.model) !== this.model) { const m = latest(s.model); await q.setModel(m); this.model = m; }
      // a woken session (#1151) asks first, or plans: the picker never moves it past that
      const held = !!workState().marks[this.id]?.woken && s.mode !== "default" && s.mode !== "plan";
      if (s.mode && s.mode !== this.mode && MODES.includes(s.mode) && !held) {
        await q.setPermissionMode(s.mode); this.mode = s.mode;
        for (const f of modeChanges) { try { f(this.id, s.mode); } catch { /* one listener never stops the run */ } }   // the sessions under it follow (wire.ts)
      }
      const flags: Record<string, unknown> = {};
      if (s.effort && s.effort !== this.effort) { flags.effortLevel = s.effort; this.effort = s.effort; }
      if (s.fast !== undefined && s.fast !== this.fast) { flags.fastMode = s.fast; this.fast = s.fast; }
      if (Object.keys(flags).length) await q.applyFlagSettings(flags as any);
    } catch (err) {
      this.items.put({ id: `note:${randomUUID()}`, kind: "note", text: "could not change that mid-session: " + (err instanceof Error ? err.message.split("\n")[0] : String(err)) });
    }
    this.tell();
  }

  // Stop: the turn and every background agent are interrupted, and the run is idle at once. No result follows an
  // interrupt that only ended agents (the main thread was already resting), so the flags are cleared here (#45).
  async stop() {
    if (!this.working || !this.q) return;
    try { await this.q.interrupt(); } catch { /* already done */ }
    this.busy = false;
    turnOver(this.id);
    this.leave?.(); this.leave = null;
    this.woke();
    if (this.turnOpen) { this.turnOpen = false; turnEnded("work", this.id, { ok: false }); }   // on the log: the turn ended here, stopped (a late result adds no second line)
    this.setTasks([]);
    for (const [, r] of this.perms) r({ allow: false, note: "stopped" });
    // what waited behind the turn is the next turn, its images with it (#1764: until then a stop dropped it, fr-07 E6, and
    // seven pasted screenshots with the person's feedback were gone). It goes in after the interrupt is through, the way
    // a turn's end lets it go (release): the next turn holds the busy counter from here, so a renew never lands before
    // the CLI begins it, and a turn carrying another's message holds no yes of the person's (#1521). A held session keeps
    // it until Go on; to drop one, × before Stop
    const next = this.paused ? 0 : this.held.size;
    this.items.put({ id: `stop:${randomUUID()}`, kind: "note", text: next ? `stopped · ${next === 1 ? "the queued message goes" : `${next} queued messages go`} next` : "stopped" });
    this.items.settle(false);
    this.release();
    this.tell();
  }

  // canUseTool: the face shows a card (allow once / always / no, a question's options, a plan to approve) and the run
  // waits on Marco's answer
  private ask(name: string, input: Record<string, unknown>, o: { signal: AbortSignal; suggestions?: any[]; toolUseID?: string; title?: string; description?: string; decisionReason?: string; blockedPath?: string; displayName?: string }): Promise<PermissionResult> {
    const id = `perm:${o.toolUseID ?? randomUUID()}`;
    // a proposal starts nothing (its card waits in the talk), so there is nothing to ask
    const offer = name === "mcp__sol__start_session";
    if (offer && input.initiation === "proposal") return Promise.resolve({ behavior: "allow", updatedInput: input });
    if (name === "ExitPlanMode" && !input.plan) { const plan = planText(input); if (plan) input = { ...input, plan }; }
    // a session the one session started on its own: its own stage is its own work, nothing to ask (#1002, one.ts)
    if (ownStage(name, this.mode, workState().marks[this.id]?.parent)) return Promise.resolve({ behavior: "allow", updatedInput: input });
    // the engine this run lives in: a restart from inside ends this very session mid-turn (it happened, 2026-10-16 00:30).
    // The engine renews itself (renew.ts), so the command is never needed; it is refused with the reason, nothing asked.
    if (name === "Bash" && stopsEngine(String(input.command ?? ""))) return Promise.resolve({ behavior: "deny", message: "That would stop the engine this session runs inside, and the session with it, mid-turn. The engine renews itself: a saved edit to sol/engine/src is built and goes live by itself at the next quiet moment. Nothing to run." });
    this.items.put({
      id, kind: "perm", tool: name, input, state: "ask", tool_use: o.toolUseID,
      ...(o.title ? { title: o.title } : {}), ...(o.description ? { description: o.description } : {}),
      ...(o.decisionReason ? { reason: o.decisionReason } : {}), ...(o.blockedPath ? { path: o.blockedPath } : {}),
      always: !!o.suggestions?.length,
    });
    this.tell();
    return new Promise<PermissionResult>((resolve) => {
      const done = (a: Answer) => {
        this.perms.delete(id);
        const state = name === "AskUserQuestion" && a.allow ? "answered" : a.allow ? (a.always ? "always" : "allow") : "deny";
        this.items.put({ ...this.items.get(id)!, state, ...(a.answers ? { answers: a.answers } : {}), ...(a.note ? { note: a.note } : {}) });
        this.tell();
        if (!a.allow && offer && input.initiation === "offer") return resolve({ behavior: "deny", message: "Marco chose to do it here: carry on with it in this session." });
        if (!a.allow) return resolve({ behavior: "deny", message: a.note ? `Marco said no: ${a.note}` : "Marco said no to this." });
        if (name === "ExitPlanMode" && a.mode && MODES.includes(a.mode)) { void this.q?.setPermissionMode(a.mode); this.mode = a.mode; }
        resolve({
          behavior: "allow",
          updatedInput: a.answers ? { ...input, answers: a.answers } : input,
          ...(a.always && o.suggestions?.length ? { updatedPermissions: o.suggestions } : {}),
        });
      };
      this.perms.set(id, done);
      o.signal.addEventListener("abort", () => { if (this.perms.has(id)) done({ allow: false, note: "the step was cancelled" }); }, { once: true });
    });
  }

  /** a card from one of Sol's own tools (#1281, a way's press, team/v3/way-tools.ts): asked whatever the mode, the same
   *  card as a tool's, never "always"; a stop is a no */
  async card(name: string, input: Record<string, unknown>, o: { title: string; description?: string; decisionReason?: string }): Promise<boolean> {
    const r = await this.ask(name, input, { signal: new AbortController().signal, ...o });
    return r.behavior === "allow";
  }

  answer(id: string, a: Answer) { this.perms.get(id)?.(a); }
}

// a shell command that would stop this engine: launchd told to stop, kick or unload its label, or its process killed by pid or name
const ENGINE_LABEL = /com\.marco\.sol-engine(?!-build)/;
export function stopsEngine(cmd: string, pid = process.pid): boolean {
  if (/launchctl\s+(kickstart|stop|bootout|unload|remove|kill)\b/.test(cmd) && ENGINE_LABEL.test(cmd)) return true;
  if (new RegExp(`\\bkill\\b[^;&|\\n]*\\b${pid}\\b`).test(cmd)) return true;
  return /\b(pkill|killall)\b[^;&|\n]*(dist\/index\.js|sol-engine)/.test(cmd);
}

// ExitPlanMode can come without its plan: the plan is then the file Claude wrote it in (named in the input, else the
// newest in ~/.claude/plans from the last hour). Read only.
function planText(input: Record<string, unknown>): string {
  try {
    const named = typeof input.planFilePath === "string" ? input.planFilePath : null;
    if (named && existsSync(named)) return readFileSync(named, "utf8");
    const dir = join(homedir(), ".claude", "plans");
    const newest = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    return newest && Date.now() - newest.t < 3_600_000 ? readFileSync(join(dir, newest.f), "utf8") : "";
  } catch { return ""; }
}

const runs = new Map<string, Run>();
export const getRun = (id: string) => runs.get(id);
export const startingRun = (id: string) => starting.has(id);
export const allRuns = () => [...runs.values()];

const okCwd = (p?: string) => { try { return !!p && existsSync(p) && statSync(p).isDirectory(); } catch { return false; } };

// a session's run is made once, however many messages arrive while it is being made (a side copy takes a moment)
const starting = new Map<string, Promise<Run>>();
export async function workSay(s: WorkSay, bus: Bus, open = openRun): Promise<Run> {
  // a run on its way out (the idle close) is waited for, so the message resumes the session and is not lost (#895)
  if (runs.get(s.sessionId)?.inbox.closed) await settled(s.sessionId);
  // one writer per transcript: a session another live process holds is never resumed or written here (also when
  // Sol had it first and the other opened it since)
  const h = s.fresh ? undefined : heldElsewhere(s.sessionId, !runs.has(s.sessionId));
  if (h) throw new Error(`it is open in ${HOLDER_NAME[h.who]} (${h.status}): fork it here to go on, or write there`);
  if (moving.has(s.sessionId)) throw new Error("its thread is being reconciled: a moment");
  // a new session the person starts in the new face gets "you, here" first, with the place the face put it in, and
  // the facts it told are kept by its id, as index.ts's say does for the old face's (#1615)
  s.here = s.fresh && s.person && uiNext() ? hereFor(s) : undefined;
  if (s.fresh && s.person && uiNext() && s.purpose === "automation") s.here = [s.here, AUTOMATION_PURPOSE].filter(Boolean).join("\n\n");   // Add's Automation (birth.html row 5)
  if (!s.fresh && s.owed) s.here = s.owed;   // before the person's words, never in their line (the item keeps s.text only)
  let run = runs.get(s.sessionId);
  if (!run) {
    let p = starting.get(s.sessionId);
    if (!p) {
      p = open(s, bus);
      starting.set(s.sessionId, p);
      void p.catch(() => {}).finally(() => starting.delete(s.sessionId));
    }
    run = await p;
  }
  await run.say(s);
  return run;
}

/** "you, here" for a new session (next/you.ts youHereTold) in Sol's home (SOL_HOME, else the checkout's), its told kept */
function hereFor(s: WorkSay): string | undefined {
  try {
    const sol = realpathSync(process.env.SOL_HOME ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "home")), user = homedir();
    const w = { sol, user, rec: recordHomeOf(sol, user) }, cwd = s.cwd ?? sol;
    const { text, told } = youHereTold(w, cwd, { place: s.place });
    rememberTold(w, s.sessionId, cwd, told);
    return text || undefined;
  } catch { return undefined; }   // no record or no home: the words go on alone
}

/** The run a message for this session goes to, or none (a new one is opened). A run whose inbox is closed is on its
 *  way out, but it stays in `runs` until the CLI's output has ended (#895): the message waits for that, and then
 *  resumes the session from the transcript instead of going into an inbox nobody reads. A CLI that takes longer than
 *  `ms` to end: the closing run is answered as it is, and its say() marks the message not read. */
export async function settled(id: string, ms = CLOSING_MS): Promise<Run | undefined> {
  for (;;) {
    const run = runs.get(id);
    if (!run?.inbox.closed) return run;
    let t: NodeJS.Timeout | undefined;
    const ended = await Promise.race([run.gone.then(() => true), new Promise<boolean>((r) => (t = setTimeout(() => r(false), ms)))]);
    clearTimeout(t);
    if (!ended) return run;
  }
}
/** for tests: a run put on `runs` the way openRun does, with no CLI started */
export const _adopt = (run: Run) => { runs.set(run.id, run); };

/** a folder in a checkout that holds the team's locks (sol/locks/team.mjs, never in a Sol tester's copy) */
export function teamCheckout(dir: string): boolean {
  let d = dir;
  for (let i = 0; i < 40 && d; i++) {
    if (existsSync(join(d, ".git"))) return existsSync(join(d, "sol", "locks", "team.mjs"));
    const up = dirname(d); if (up === d) break; d = up;
  }
  return false;
}
/** the environment a run starts with: the engine's own, SOL_ROLE set to the session's part, or none */
export function roleEnv(role: string | undefined, base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base };
  if (role) env.SOL_ROLE = role; else delete env.SOL_ROLE;
  return env;
}

async function openRun(s: WorkSay, bus: Bus): Promise<Run> {
  const fresh = !!s.fresh;
  const info = fresh ? undefined : await sessionInfo(s.sessionId);
  // a session whose folder is gone (a removed side copy) cannot be resumed: its transcript lives under that folder. One
  // the other machine made goes on in the same folder in this home (One Sol, #62), where Syncthing filed its transcript;
  // one in a folder that moved goes on where the folder is now (#129).
  const here = info?.cwd ? workFolderIn(info.cwd, homedir(), okCwd, relocated) : undefined;
  if (!fresh && info?.cwd && !here) throw new Error(`its folder is gone (${info.cwd}); fork it from the menu to go on`);
  let cwd = fresh ? (okCwd(s.cwd) ? s.cwd! : homedir()) : here ?? homedir();
  if (fresh && s.worktree) cwd = (await makeCopy(cwd, s.text)).cwd;
  const history = fresh ? undefined : await sessionItems(s.sessionId).catch(() => undefined);
  const run = new Run(s.sessionId, cwd, s.model ? latest(s.model) : workDefaults().model, s.effort ?? workDefaults().effort, s.mode ?? workDefaults().mode, !!s.fast, bus, history);
  runs.set(s.sessionId, run);
  if (fresh && s.parent) mark(s.sessionId, { parent: s.parent });
  if (fresh && s.role) mark(s.sessionId, { role: s.role });   // before its first run: the guard holds it from the first call
  run.start(fresh, fresh && s.opening === true);
  // a new session opens its stage on the project's open blocks and its last ledger lines (#700, blocks.ts start)
  if (fresh) void whoFor(s.sessionId).then((w) => startStage(w, s.parent ? { from: s.parent } : {})).catch(() => {});
  return run;
}
