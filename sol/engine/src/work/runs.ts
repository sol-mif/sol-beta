// Live Work sessions: one Claude Code query per open session, kept alive between turns (streaming input), so a
// message sent while it works is queued into the same run and folded in at the next step, as in the Claude app.
// Every event goes to every face, tagged with the session, so two windows (or a split view) show the same run.
// A run that sits idle for 15 minutes is closed; the next message resumes it from the transcript.
import { randomUUID } from "node:crypto";
import { getSettings } from "../settings.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { query, createSdkMcpServer, tool, type Options, type PermissionMode, type PermissionResult, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { seatTools, runSolTool } from "../tools.js";
import { HOME_ONLY } from "../suggest.js";
import { saveFiles, attachedLines, type FileIn } from "../files.js";
import { Items, type Item } from "./items.js";
import { relocated, sessionInfo, sessionItems, workFolderIn } from "./sessions.js";
import { STATE_DIR, mark, prefs, workState, stricter } from "./state.js";
import { TOOLS as BROWSER_TOOLS } from "../browser.js";
import { pagesWritten, pageWritten, askLine, asked, splitAsk, point, start as startStage, whoFor, type AskStage } from "./blocks.js";   // the stage's page watcher (#695); the ask's stage (#698); a new session's stage (#700)
import { WORK_TOOLS, runWorkTool, toolsOnlyFor, runOnlyTool, forCheckout } from "./tools.js";
import { featuresRoot } from "../team/checkpoint.js";   // the tool checkpoint, for feature folders only (#482)
import { mentioned } from "./files.js";
import { makeCopy } from "./copies.js";
import { heldElsewhere, HOLDER_NAME, moving } from "./holders.js";
import type { Changing } from "../changing.js";
import { join as joinBusy, lockSession } from "../busy.js";
import { fromContext, estimateUsage, memoryFiles, catchUp, type Usage } from "./overview.js";
import { getTeam, speakParagraph } from "../team/settings.js";
import { guardSpeak } from "../team/control.js";
import { Held, sinceAfter, startsTurn, tasksAfter, type BgTask } from "./turns.js";
import { issueAt } from "../team/show.js";
import { relayUp } from "../team/relay.js";
import { runGit } from "../team/note.js";
import { opening } from "./opening.js";   // a Sol developer's "your area" line (#480, team/area.ts)
import { turnStarted, turnEnded, stepTaken, sent, fileOf, sizeOf, claudeTokens, base64Bytes } from "../seatlog.js";   // this seat's own steps on the log

// Sol changing its own face from a Work session (src/changing.ts): set once by the engine at start
let changing: Changing | null = null;
export function setChanging(c: Changing) { changing = c; }

export type WorkSay = {
  sessionId: string; fresh?: boolean; cwd?: string; text: string; files?: FileIn[];
  model?: string; effort?: string; mode?: PermissionMode; fast?: boolean; parent?: string;
  worktree?: boolean;   // a fresh session in a side copy of its folder's repo (copies.ts)
  opening?: boolean;    // a person started it from the face (#480): only then may it open with their area's line; the
                        // engine's own sessions (the night's review, re-checks, carry-overs, an agent's) never do
  role?: string;        // a fresh session's part in the dev cycle (#484): kept on it (state.ts), the guard's SOL_ROLE
  stage?: AskStage;     // the stage's bar (#698): the chips (things) and what the person pointed at (on), sol.stage only
};
export type Answer = { allow: boolean; always?: boolean; note?: string; answers?: Record<string, string>; mode?: PermissionMode };
type Bus = (msg: object) => void;

// the newest run's start report: the tools drawer lists its skills, plugins and MCP servers
export let lastInit: any = null;
const IDLE_MS = 15 * 60 * 1000;
const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
// the Work defaults from Marco's settings file (#94): Claude's model and effort, and the mode
export const workDefaults = () => { const d = getSettings().defaults; return { model: d.model.claude, effort: d.effort.claude, mode: d.mode as PermissionMode }; };

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
  shown = false;                               // shown to the team (#101): set by work.show, never kept past the run
  issue: number | null = null;                 // the issue the folder's branch names, read at start and after each turn
  perms = new Map<string, (a: Answer) => void>();
  private idle: NodeJS.Timeout | undefined;
  window = 1_000_000;
  init: any = null;
  cost = 0;
  usage: Usage | null = null;                  // the last split getContextUsage gave (overview.ts)
  private measuring = false;
  private memory: { path: string; bytes: number }[] | null = null;   // the CLAUDE.md files, for the bytes/4 split
  private leave: (() => void) | null = null;   // this run's turn on the busy counter (busy.ts)
  private holdTasks: (() => void) | null = null;   // its agents' place on the same counter, while any works
  private unlock = () => {};                   // its hold on the session, one writer (busy.ts)
  private uses = new Map<string, { name: string; file?: string; agent: boolean }>();   // every tool_use, for the log's step when its result comes
  private turnOpen = false;                    // a turn is on the log (seatlog.ts) and not yet ended there
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
      tasks: this.tasks.map((t) => t.description), since: this.since, shown: this.shown,
      ...(this.issue ? { issue: this.issue, relay: relayUp() } : {}),
      ...(this.init ? { commands: this.init.slash_commands, skills: this.init.skills, agents: this.init.agents, mcp: this.init.mcp_servers, outputStyle: this.init.output_style } : {}),
      ...(this.init || this.items.usage.context ? { usage: this.usage ? catchUp(this.usage, this.items.usage.context) : this.guess() } : {}),
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
    return estimateUsage({ init: this.init, context: this.items.usage.context, window: this.window, chars, memory: this.memory });
  }

  // the context split by category, as Claude Code's /context counts it: "summary" is the SDK's quick estimate (at the
  // start), "full" counts with the token-count API (after each turn, off the turn's path). A failed count falls back
  // to the summary; a failed summary keeps what was there.
  async measure(detail: "summary" | "full"): Promise<void> {
    const q = this.q;
    if (!q || this.measuring) return;
    this.measuring = true;
    let ok = false;
    try {
      const r = await Promise.race([q.getContextUsage({ detail }), new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 20_000))]);
      this.usage = fromContext(r, detail === "full" ? "counted" : "summary");
      ok = true;
    } catch { /* an older CLI, the run going away */ }
    this.measuring = false;
    if (!ok && detail === "full") return this.measure("summary");
    if (ok && this.q === q) this.tell();
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
    const solTools = seatTools().filter((t) => (p.browser || !browser.has(t.name)) && !HOME_ONLY.has(t.name) && !t.name.startsWith("desk_"));
    // a session given a tool of its own (#421, the re-check) is narrow: that tool and nothing else. No built-in tool
    // (no shell, no edits, no web), none of Sol's other tools and no MCP server from settings, so words planted in the
    // diff it reads can do nothing but answer
    const narrow = toolsOnlyFor(this.id).length > 0;
    const sol = createSdkMcpServer({
      name: "sol",
      version: "1.0.0",
      tools: [
        ...(narrow ? [] : solTools).map((t) => tool(t.name, t.description, t.shape, async (args) => (await runSolTool(t.name, args, { sessionId: this.id, seat: "work" })) as any)),
        // checkpoint (#482) only in a checkout of sol-dev with feature folders (featuresRoot): never in a Sol tester's copy or another project
        ...(narrow ? [] : WORK_TOOLS.filter((t) => t.name !== "checkpoint" || !!featuresRoot(this.cwd))).map((t) => forCheckout(t, teamCheckout(this.cwd))).map((t) => tool(t.name, t.description, t.shape as any, async (args) => (await runWorkTool(t.name, args, this.id)) as any)),
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
      settingSources: ["user", "project", "local"],
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
          "The engine you run inside renews itself: a saved edit to sol/engine/src is built and goes live at the next quiet moment, " +
          "so never restart it from here (launchctl kickstart, stop, bootout, kill): that ends this very session mid-turn. " +
          speakParagraph(getTeam()) +   // where my agent may speak, how it signs (Control, team.json)
          (fresh && open ? opening(this.cwd) : ""),   // a Sol developer's area, for a new session they started whose checkout has the feature map (#480)
      },
      permissionMode: this.mode,
      // always launched able to take bypass, so the picker can move to it mid-session (#111); the mode itself is Marco's pick
      allowDangerouslySkipPermissions: true,
      // Sol's own bookkeeping and look-only session tools never ask; everything else is Marco's call
      allowedTools: ["TodoWrite", ...["wrap_up", "list_sessions", "read_session", "rename_session", "mark_done", "archive_session", "hand_off", "pings", "read", ...toolsOnlyFor(this.id).map((t) => t.name)].map((t) => `mcp__sol__${t}`)],
      canUseTool: guardSpeak((name, input, o) => this.ask(name, input, o)),
      includePartialMessages: true,
      thinking: { type: "adaptive", display: "summarized" },
      promptSuggestions: p.suggest,
      agentProgressSummaries: true,
      mcpServers: { sol },
      ...(narrow ? { tools: [], strictMcpConfig: true } : {}),
      ...(this.fast || p.style ? { settings: { ...(this.fast ? { fastMode: true } : {}), ...(p.style ? { outputStyle: p.style } : {}) } as any } : {}),
    };
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
        const tasks = tasksAfter(a, this.tasks);
        if (tasks) this.setTasks(tasks);
        if (!this.busy && startsTurn(a)) {
          this.busy = true;
          this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
          this.began();
          this.tell();
        }
        if (a.type === "system" && a.subtype === "init") { this.init = a; lastInit = a; this.mode = a.permissionMode ?? this.mode; this.tell(); void this.measure("summary"); }
        else if (a.type === "stream_event") this.items.stream(a.event, a.parent_tool_use_id ?? null);
        else if (a.type === "result") {
          this.busy = false;
          this.leave?.(); this.leave = null;
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
          this.release();
          this.rest();
          this.readIssue();
          void this.measure("full");
        } else this.items.feed(a);
      }
    } catch (err) {
      this.items.put({ id: `err:${randomUUID()}`, kind: "error", text: err instanceof Error ? err.message.split("\n")[0] : String(err) });
      this.failed = true;
      mark(this.id, { failed: true });
    } finally {
      if (this.turnOpen) { this.turnOpen = false; turnEnded("work", this.id, { ok: false }); }   // the run ended mid-turn: stopped, or broke
      changing?.turn("work", this.id);
      this.items.settle(false);
      this.busy = false;
      this.leave?.(); this.leave = null;
      this.tasks = [];
      this.holdTasks?.(); this.holdTasks = null;
      this.unlock();
      for (const [, r] of this.perms) r({ allow: false, note: "the session closed" });
      this.perms.clear();
      for (const m of this.held.release()) {   // said while it worked, never read: the session closed first (#51)
        this.unqueue(String(m.uuid), true);
        this.items.put({ id: `lost:${m.uuid}`, kind: "note", text: "a queued message was not read: the session closed first" });
      }
      runs.delete(this.id);
      this.tell();
      this.bus({ type: "work.closed", sessionId: this.id });
    }
  }

  // on the log (seatlog.ts): a turn begun, once, however it began (say, a queued message, an agent waking the main thread)
  private began() {
    if (this.turnOpen) return;
    this.turnOpen = true;
    turnStarted("work", this.id, this.model, this.mode);
  }
  // on the log: each tool this seat used, when its result is back: the tool, the file it named, the bytes it got; a
  // background agent's own marked so. Never the words
  private note(a: any) {
    const content = a.message?.content;
    if (!Array.isArray(content)) return;
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
  end() { clearTimeout(this.idle); runs.delete(this.id); this.inbox.close(); }

  private rest() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { if (!this.working) this.inbox.close(); }, IDLE_MS);
  }

  // the background agents at work changed: they hold the busy counter (the renew waits for them, as for a turn) and
  // the face shows them; when the last hands back with the main thread idle, the run is idle and the clock restarts
  private setTasks(next: BgTask[]) {
    this.tasks = next;
    if (next.length) this.holdTasks ??= joinBusy("work", this.id, "agents", this.cwd);
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
    if (s.stage && (s.stage.on?.length || (s.stage.things?.length ?? 0) > 1)) {
      const w = await whoFor(this.id).catch(() => null);
      if (w) { if (s.stage.on?.length) point(this.id, s.stage.on); stageLine = askLine(w.project, s.stage); on = splitAsk(`\n\n${stageLine}`).on; }
    }
    const text = [s.text, attachedLines(saved), atLine, stageLine].filter(Boolean).join("\n\n");
    const images = saved.filter((f) => f.isImage);
    const uuid = randomUUID();
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
    // said while the main thread works: the run keeps it until the turn ends (#51), the face shows it queued
    if (queued) this.held.keep(msg); else this.inbox.push(msg);
    this.busy = true;
    this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
    this.began();
    // on the log: what Sol handed the seat with this message (the files it saved, the files named with @, the stage's
    // paragraph), not the message
    for (const f of saved) sent("work", this.id, "attachment", { name: f.path, bytes: base64Bytes(f.dataBase64) });
    for (const p of at) sent("work", this.id, "mention", { name: p });
    if (stageLine) sent("work", this.id, "stage", { bytes: Buffer.byteLength(stageLine) });
    this.failed = false;
    this.tell();
  }

  // the turn ended: what Marco said meanwhile goes to the SDK now, in order, and begins the next turn at once (#51)
  private release() {
    const all = this.held.release();
    if (!all.length) return;
    clearTimeout(this.idle);
    for (const m of all) { this.inbox.push(m); this.unqueue(String(m.uuid)); }
    this.busy = true;
    this.leave ??= joinBusy("work", this.id, this.mode, this.cwd);
    this.began();
    this.failed = false;
    this.tell();
  }

  // a queued message joins the running turn at its next step (the Claude app's Read now, #51)
  readNow(uuid: string) {
    const m = this.held.take(uuid);
    if (!m) return;
    if (!this.busy) { this.held.keep(m); this.release(); return; }   // no turn to join: it begins one, as at a turn's end
    this.inbox.push({ ...m, priority: "now" });
    this.unqueue(uuid);
  }

  // a queued message is forgotten before it is read (#51); the face hides it
  drop(uuid: string) {
    if (!this.held.take(uuid)) return;
    this.unqueue(uuid, true);
  }

  private unqueue(uuid: string, dropped = false) {
    const it = this.items.list.find((x) => x.id === uuid);
    if (it) this.items.put({ ...it, queued: false, ...(dropped ? { dropped: true } : {}) });
  }

  // the picker moved while the session lives: the run follows it without a restart
  async adjust(s: Partial<WorkSay>) {
    const q = this.q;
    if (!q) return;
    try {
      if (s.model && s.model !== this.model) { await q.setModel(s.model); this.model = s.model; }
      if (s.mode && s.mode !== this.mode && MODES.includes(s.mode)) { await q.setPermissionMode(s.mode); this.mode = s.mode; }
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
    this.leave?.(); this.leave = null;
    if (this.turnOpen) { this.turnOpen = false; turnEnded("work", this.id, { ok: false }); }   // on the log: the turn ended here, stopped (a late result adds no second line)
    this.setTasks([]);
    for (const [, r] of this.perms) r({ allow: false, note: "stopped" });
    const held = this.held.release();   // what waited behind the turn goes with it (#51): a stop means nothing more runs
    for (const m of held) this.unqueue(String(m.uuid), true);
    this.items.put({ id: `stop:${randomUUID()}`, kind: "note", text: held.length ? `stopped · ${held.length === 1 ? "the queued message was" : `${held.length} queued messages were`} dropped with it` : "stopped" });
    this.items.settle(false);
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
export async function workSay(s: WorkSay, bus: Bus): Promise<Run> {
  // one writer per transcript: a session another live process holds is never resumed or written here (also when
  // Sol had it first and the other opened it since)
  const h = s.fresh ? undefined : heldElsewhere(s.sessionId, !runs.has(s.sessionId));
  if (h) throw new Error(`it is open in ${HOLDER_NAME[h.who]} (${h.status}): fork it here to go on, or write there`);
  if (moving.has(s.sessionId)) throw new Error("its thread is being reconciled: a moment");
  let run = runs.get(s.sessionId);
  if (!run) {
    let p = starting.get(s.sessionId);
    if (!p) {
      p = openRun(s, bus);
      starting.set(s.sessionId, p);
      void p.catch(() => {}).finally(() => starting.delete(s.sessionId));
    }
    run = await p;
  }
  await run.say(s);
  return run;
}

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
  const run = new Run(s.sessionId, cwd, s.model ?? workDefaults().model, s.effort ?? workDefaults().effort, s.mode ?? workDefaults().mode, !!s.fast, bus, history);
  runs.set(s.sessionId, run);
  if (fresh && s.parent) mark(s.sessionId, { parent: s.parent });
  if (fresh && s.role) mark(s.sessionId, { role: s.role });   // before its first run: the guard holds it from the first call
  run.start(fresh, fresh && s.opening === true);
  // a new session opens its stage on the project's open blocks and its last ledger lines (#700, blocks.ts start)
  if (fresh) void whoFor(s.sessionId).then((w) => startStage(w, s.parent ? { from: s.parent } : {})).catch(() => {});
  return run;
}
