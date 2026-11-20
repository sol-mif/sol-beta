// The Work wire (PROTOCOL.md round 11): the face's work.* messages, and what goes back to every face.
import { randomUUID } from "node:crypto";
import { PANE_KEY } from "./page.js";
import { homedir } from "node:os";
import { renameSession, deleteSession, forkSession } from "@anthropic-ai/claude-agent-sdk";
import { workSessions, withRuns, sessionItems, sessionInfo, oneSession, invalidate, watchSessions, topicsFor, relocated, workFolderIn, transcriptFiles } from "./sessions.js";
import { gist, saidOf, type Said } from "./gist.js";
import { openThread, codexCwd } from "../threads.js";
import { mkdirSync, statSync } from "node:fs";
import { pickTopic } from "../titles.js";
import { workSay, getRun, allRuns, lastInit, setChanging, workDefaults, modeFor, baseModeOf, onModeChange, modeFollowers, type WorkSay } from "./runs.js";
export { setChanging as setWorkChanging };
import { workState, mark, forget, groupOp, folderOp, folderMoved, setOrder, prefs, setPrefs, stricter, STATE_DIR } from "./state.js";
import { renameFolder, ENGINE_ROOT, SOL_HOME, windowRoot } from "./rename.js";
import { listCopies, removeCopy, stale } from "./copies.js";
import { keepAwake, about, styles } from "./machine.js";
import { setWorkHooks, setUsedHook, giveTool, takeTool, type Start } from "./tools.js";
import * as eyes from "./eyes.js";   // the agent's eyes on its stage (#1435)
import { setHandBus } from "./hands.js";   // and its hands (#1437)
import * as stage from "./blocks.js";   // the stage's blocks (#695)
import * as asks from "./asks.js";   // the press on any block, routed back to who asked (#1298)
import { homeStage } from "../home/hooks.js";   // Home's ear on the stage (#825)
import { piecesMsg, setPiecesBus } from "./pieces.js";   // a folder's pieces (#1092)
import { systemsMsg, dropFace as dropSystemsFace } from "./systems.js";   // the system stage block (#1091)
import { LiveWork, liveMsg, dropLiveFace, heardRun, wireLive } from "./systemsLive.js";   // the work under way, by system (#1156)
import { wholeMsg } from "./systemsWhole.js";   // the whole of Jelly, clusters and the wires between them (#1193)
import * as live from "./live.js";   // the browser and terminal blocks (#699)
import { noteUse, releaseWord } from "../team/used.js";   // the used-Cowork mark (#431)
import { track, isPrivate, setPrivate, privateIds } from "../track.js";
import { versionNow } from "../version.js";
import { aside } from "./aside.js";
import { askWork } from "../call/work.js";
import { watchHolders, holders } from "./holders.js";
import { machineOf } from "../home.js";
import { busyIn, busyList } from "../busy.js";
import { threadView, forkHere, reconcile } from "./reconcile.js";
import { fileHits, folderOf, tree } from "./files.js";
import { review, stopReview, markReview, withReviews } from "./review.js";
import { withTonight } from "../team/tonight.js";   // the review session's card (#416)
import { withHandIn } from "../team/handin.js";   // the hand-in card (#476)
import { withCheckpoints, askPress, featuresRoot, PRESSES } from "../team/checkpoint.js";   // Scoped and Approve (#482)
import { changes, pathIn, readText, writeText, pullRequest, openTerm, getTerm, closeTerm, allTerms, termInfo } from "./panes.js";
import { remote, changesSummary, createPr, CARD_PARTS } from "./overview.js";
import { withMine } from "./mine.js";
import { withPlace } from "./place.js";   // where each folder belongs, Build or Home (#1016)
import { brief, teamNote, runGit } from "../team/note.js";
import { runGh, runGhStdin, record } from "../team/record.js";   // the room's record (#152)
import { getTeam, myLogin, mayAgentSpeak, activeRoom, recordOf } from "../team/settings.js";
import { getThings, agentAdd, agentFolder, agentMove, thingsText } from "../team/things.js";   // the room's things (#194)
import { agentIn } from "../team/here.js";   // in_thing (#230)
import { feedText } from "../team/feed.js";   // room_feed (#232)
import { goalForAgent, goalForRenewal, setGoal, addGoalFile } from "../team/goal.js";   // the room's goal (#216)
import { calendar, calendarText, agentEventAdd } from "../team/calendar.js";   // the room's own tools (#245)
import { decisions, decisionsText, agentDecisionAdd } from "../team/decisions.js";
import { pages, pagesText, pageTile, agentPageRead, agentPageWrite } from "../team/pages.js";   // pages (#433)
import { tables, tablesText, agentTableRead, agentTableWrite } from "../team/tables.js";   // tables (#434)
import { templates, templatesText, agentFromTemplate, agentTemplateSave } from "../team/templates.js";   // templates (#435)
import { memberRefusal, membersNow } from "../team/agents.js";   // agents as members (#435): an agent writes only as a member's
import { polls, pollsText, agentPollAdd } from "../team/polls.js";
import { blocksHere, blocksWaiting, proposeBlockHere, projectRhythm } from "../team/project.js";   // team blocks (#429)
import { blocksText, toolRefusal, shipped as shippedBlocks } from "../team/blocks.js";
import { agentRefusal } from "../team/kit.js";
import { sendRelay, relayUp, hubLogin, relayRoster } from "../team/relay.js";
import { CLOUD_RECORD, DRIVE_RECORD } from "../team/settings.js";
import { takePings, pingsText } from "../team/pings.js";
import { agentShare } from "../team/onboard.js";   // #432: facts only between agents; #430: and until the walk is finished
import { onCall, onCallText } from "../team/oncall.js";   // on-call (#225)
import { shows, issueAt, repoOf } from "../team/show.js";   // Show to team (#101)
import { withRoomIds, roomMark } from "../team/here.js";   // a cowork session's group (#314), its room's mark (#316)
import { noteFrom, roomMemory, type NoteRoom } from "../team/memory.js";   // a group's memory (#316)
import { identity } from "../seams/identity.js";   // sign-in and the Sol ID (#1320)
import { wakeUp } from "../seams/wake.js";   // waking a teammate's Sol (#1320)
import { hubHttp } from "../team/relay.js";
import { listAsked, tellList, type Lean } from "./lean.js";   // the lean list (#870)
import * as one from "./one.js";   // orchestration sessions: promote, demote, renewal, reports, tickets behind build.tickets
import * as children from "./children.js";   // the orchestration stage: one session block per session under an orchestrator (step 4)
import * as group from "./group.js";   // grouping on hard evidence (#1336): a start, a card, a root's send or read
import * as executor from "./executor.js";   // tickets (the superagent model): one executor session per ticket, the Door
import { store as tickets } from "./tickets.js";   // the tickets' files
import { execFileSync } from "node:child_process";
import { join as joinPath } from "node:path";
import { startWake } from "../team/wake.js";   // a comment on GitHub wakes my agent, where I allowed it (#1151)
import { setRoomStart } from "../team/room-start.js";   // a way's room: my AI woken for the moves I put in "AI decides" (#1311)
import * as snap from "./snap.js";   // pieces that snap (#1024, build.snap): the table, and a built row run
import * as yours from "./yoursKeep.js";   // Build becomes yours (#1089, build.yours): offers, versions, kept things

type Wire = { send: (m: object) => void };
const faces = new Map<Wire, { viewing?: string } & Lean>();
const everyone = (m: object) => { for (const f of faces.keys()) f.send(m); };
/** every Work face (#416: the review card's changes, from team/wire.ts) */
let told: (m: any) => void = () => {};   // one notification (#845): the engine hears what the bus says (notify.ts)
export const workBus = (m: object) => { everyone(m); told(m); };

let pending: NodeJS.Timeout | undefined;
async function sessionsMsg() {
  const runs = allRuns().map((r) => r.info());
  const filed = withRuns(await workSessions(), runs);   // a run the list does not know yet shows at once (#111)
  // a GPT talk with a turn going says so on its row (#182): the busy counter has it under the thread's id
  const talking = new Set(busyList().filter((j) => j.kind === "life").map((j) => j.id));
  // a cowork session says its group's id (#314): marked so since, or matched by its room hash among my rooms now
  const rooms = getTeam().rooms.map((r) => ({ ...r, record: recordOf(r) }));
  const sessions = withRoomIds(filed.sessions.map((s) => (s.seat === "codex" && talking.has(s.id) ? { ...s, running: true } : s)), rooms), projects = filed.projects;
  const st = workState();
  // each of my rooms' names by id (#314): Home lists a cowork session under its group's name, with no team link of its own
  const roomNames = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
  return { type: "work.sessions", sessions, projects: withPlace(await withMine(projects)), groups: st.groups, order: st.order, runs, roomNames };
}
// the list goes out at most every 300 ms, however many things changed; a lean face gets it only when it changed (#870)
export function broadcastSessions() {
  clearTimeout(pending);
  pending = setTimeout(async () => { if (faces.size) tellList(faces, await sessionsMsg().catch(() => ({ type: "work.sessions.error" }))); }, 300);
}

// a run's events go to every face; a turn that ends while nobody looks at it leaves the row unread
const ears = new Set<(m: any) => void>();   // the engine's own listeners: a call in a session (call/work.ts)
const bus = (m: any) => {
  everyone(m);
  told(m);
  for (const f of ears) f(m);
  one.hears(m);   // a session under an orchestration session: its reports; an orchestrator's own fill and renewal
  children.hears(m);   // a session under an orchestrator: its block on the orchestrator's stage kept current (step 4)
  executor.hears(m);   // a ticket's executor: its state, its fill, its report to whoever follows the ticket
  snap.hears(m);   // a session a built row waits on (#1024)
  heardRun(m);   // the system view: a tool call that ended may have changed a system (#1156)
  if (m.type === "work.item") shows.item(m.sessionId, m.item);   // a shown session's new line (#101); the rest ignore it
  else if (m.type === "work.closed" && shows.showing(m.sessionId)) void shows.stop(m.sessionId).catch(() => {});
  if (m.type === "work.run") {
    if (m.ended) {
      const looking = [...faces.values()].some((f) => f.viewing === m.sessionId);
      if (!looking && !m.waiting) mark(m.sessionId, { unread: true });
      invalidate();
    }
    keepAwake(allRuns().some((r) => r.working));
    broadcastSessions();
  }
};

// auto-archive (the work drawer): sessions untouched N days, and a side copy's sessions once its PR is merged or
// closed. Pinned sessions and running ones stay. Every half hour while a face is connected, and soon after one is.
let sweeping: NodeJS.Timeout | undefined;
/** a session archived, wherever from (the side, the sweep, an agent's tool, a block's press): under nothing, its block
 *  on its orchestrator's stage closed (children.ts archived) */
function archive(id: string, archived = true) {
  mark(id, { archived });
  if (archived) void children.archived(id).catch(() => {});
}
async function sweep() {
  const p = prefs();
  if (!p.archiveDays && !p.archivePr) return;
  const { sessions } = await workSessions();
  const now = Date.now();
  // asked again at each mark: a PR lookup is slow, and a session may have started or been pinned meanwhile
  const keep = (s: (typeof sessions)[number]) => {
    const mk = workState().marks[s.id] ?? {};
    return !!(mk.archived || mk.pinned) || allRuns().some((r) => r.id === s.id && (r.working || r.perms.size));
  };
  let n = 0;
  if (p.archiveDays) for (const s of sessions) if (!keep(s) && now - s.updatedAt > p.archiveDays * 86_400_000) { archive(s.id); n++; }
  if (p.archivePr) {
    const byCopy = new Map<string, typeof sessions>();
    for (const s of sessions) if (s.worktree && !s.gone && !keep(s) && now - s.updatedAt < 30 * 86_400_000) byCopy.set(s.cwd, [...(byCopy.get(s.cwd) ?? []), s]);
    for (const [cwd, list] of byCopy) {
      const r = await pullRequest(cwd).catch(() => null);
      const st = (r as any)?.pr?.state;
      if ((st === "MERGED" || st === "CLOSED") && prefs().archivePr) for (const s of list) if (!keep(s)) { archive(s.id); n++; }
    }
  }
  if (n) broadcastSessions();
}
function startSweep() {
  if (sweeping) return;
  setTimeout(() => void sweep().catch(() => {}), 10_000);
  sweeping = setInterval(() => { if (faces.size) void sweep().catch(() => {}); }, 30 * 60_000);
}

const inPath = (p: string, dir: string) => p === dir || p.startsWith(dir + "/");
// a Work run, or any job that says its folder (busy.ts: a GPT talk in a folder, #182; a review)
const liveIn = (path: string) => allRuns().some((r) => inPath(r.cwd, path)) || busyIn(path).length > 0;

// a folder renamed on the disk from the side (#181, rename.ts): what runs where, what the side lists, where Sol runs from
const MACHINE = { mac: "the Mac", nucbox: "the NucBox" } as const;
async function renameNow(path: string, name: string) {
  const { sessions, projects } = await workSessions();
  const titled = (id: string) => `"${sessions.find((s) => s.id === id)?.title ?? id.slice(0, 8)}"`;
  const liveIn = (p: string) => {
    const r = allRuns().find((r) => inPath(r.cwd, p));
    if (r) return titled(r.id);
    if (allTerms().some((t) => t.alive && inPath(t.cwd, p))) return "a terminal in Sol";
    // a GPT talk with a turn going in the folder (#182), a review reading it: the busy counter knows their folders
    const job = busyIn(p)[0];
    if (job) return job.kind === "review" ? "a review" : sessions.some((s) => s.id === job.id) ? titled(job.id) : "a GPT talk";
    for (const [id, hs] of holders()) for (const h of hs) if (h.cwd && inPath(h.cwd, p)) return h.name ? `"${h.name}"` : titled(id);
  };
  const here = machineOf(homedir());
  const elsewhere = (p: string) => { const m = sessions.find((s) => s.project === p && s.machine && s.machine !== here)?.machine; return m ? MACHINE[m] : undefined; };
  const r = await renameFolder(path, name, {
    home: homedir(), solRoots: [ENGINE_ROOT, SOL_HOME, process.cwd(), windowRoot() ?? ""].filter(Boolean),
    known: [...projects.map((x) => x.path), ...workState().folders], liveIn, elsewhere, moved: folderMoved, at: relocated,
  });
  return "ok" in r ? { ...r, sessions: projects.find((x) => x.path === path)?.count ?? 0 } : r;
}

// the side copies as the drawer lists them (git and du in each, so only when asked)
async function copiesNow() {
  const { sessions, projects } = await workSessions();
  return listCopies(projects.map((x) => x.path), sessions, allRuns().map((r) => r.cwd));
}

// a call's turn in a project session (#24): said as if typed in its box, the answer's words streamed to the voice
export function askInSession(sessionId: string, text: string, abort: AbortSignal, onDelta?: (t: string) => void) {
  return askWork({
    say: (s) => workSay({ sessionId: sid(s.sessionId), text: s.text }, bus).then(() => broadcastSessions()),
    stop: (id) => void getRun(id)?.stop(),
    listen: (f) => { ears.add(f); return () => { ears.delete(f); }; },
  }, { sessionId, text }, abort, onDelta);
}

// a message to a session from a part (#1166, parts/reach.ts): as a face's, on the same bus
export const sayWork = (s: WorkSay) => workSay(s, bus).then(() => { invalidate(); broadcastSessions(); });

// one notification (#845, notify.ts): the engine hears every run event, and whether a face shows a session now
export function hearWork(f: (m: any) => void) { told = f; }
export const viewed = (sessionId: string) => [...faces.values()].some((f) => f.viewing === sessionId);

// the system view's live reader (#1156): the sessions as the list gives them, and the open PRs against main from GitHub
wireLive(() => new LiveWork({
  sessions: async () => (await workSessions()).sessions.map((s) => ({
    id: s.id, title: s.title, cwd: s.cwd, updatedAt: s.updatedAt, gone: s.gone, ...(s.machine ? { machine: String(s.machine) } : {}),
    get transcript() { return transcriptFiles(s.id, s.cwd)[0]; },   // read only for a recent session (systemsLive.ts placesOf)
  })),
  openPrs: async () => {
    const out = await runGh(["pr", "list", "--base", "main", "--state", "open", "--limit", "80", "--json", "number,files"], ENGINE_ROOT);
    return (JSON.parse(out) as { number: number; files?: { path: string }[] }[]).map((p) => ({ number: p.number, files: (p.files ?? []).map((f) => f.path) }));
  },
  keep: [ENGINE_ROOT],   // the window's own checkout: no proposal is ever written into it (Update and stamp want it clean)
  write: false,   // proposals are shown ("no system yet"), not written: a write dirties a checkout nobody touched; Marco can turn it on
}));

export function addWorkFace(w: Wire) {
  faces.set(w, {});
  watchSessions(broadcastSessions);
  watchHolders(broadcastSessions);
  startSweep();
}
export function removeWorkFace(w: Wire) { faces.delete(w); dropSystemsFace(w); dropLiveFace(w); }   // the areas it showed, let go (#1091, #1156)

const ID = /^[A-Za-z0-9_-]{8,80}$/;
// a session never runs under itself, nor under one that runs under it: `under` walked up from the target, 16 steps at most
export function underCycle(id: string, to: string, marks: Record<string, { under?: string } | undefined> = workState().marks): boolean {
  let at: string | undefined = to;
  for (let i = 0; at && i <= 16; i++) { if (at === id) return true; at = marks[at]?.under; }
  return false;
}
const sid = (v: unknown) => { const s = String(v ?? ""); if (!ID.test(s)) throw new Error("bad session id"); return s; };

export async function handleWork(w: Wire, m: any) {
  const me = faces.get(w) ?? {};
  switch (m.type) {
    case "work.list": {   // always answered whole; `lean: true` asks for no list after it that says the same (#870)
      const list = await sessionsMsg();
      listAsked(me, m, list);
      return w.send(list);
    }
    case "work.open": {
      const id = sid(m.sessionId);
      me.viewing = id;
      mark(id, { unread: null, seen: Date.now() });
      const run = getRun(id);
      const items = withCheckpoints(id, withHandIn(id, withTonight(id, withReviews(id, run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? []))));
      const info = await sessionInfo(id);
      w.send({ type: "work.thread", sessionId: id, items, run: run?.info() ?? null, cwd: run?.cwd ?? info?.cwd, branch: info?.gitBranch, title: info?.customTitle || info?.summary });
      return broadcastSessions();
    }
    case "work.view":   // the face shows this session (or none: a fresh one, settings)
      me.viewing = m.sessionId ? sid(m.sessionId) : undefined;
      if (me.viewing) { mark(me.viewing, { unread: null, seen: Date.now() }); broadcastSessions(); }
      return;
    case "work.say": {
      const s = m as WorkSay;
      s.sessionId = sid(s.sessionId);
      s.person = true;   // #1521: the window's own message is the person's words
      me.viewing = s.sessionId;
      await workSay(s, bus);
      if (s.fresh) invalidate();
      if (s.fresh) void fileByTopic(s.sessionId, getRun(s.sessionId)?.cwd ?? s.cwd ?? "", String(s.text ?? ""));
      return broadcastSessions();
    }
    case "work.stop":
      return getRun(sid(m.sessionId))?.stop();
    // a press on a session block of an orchestrator's stage (step 4): steer, answer, stop, archive; one message, one act
    case "work.stage.session": {
      const reply = (o: object) => w.send({ type: "work.stage.session", rid: m.rid, ...o });
      try { reply({ ok: await children.press(sid(m.sessionId), { id: String(m.id ?? ""), press: String(m.press ?? ""), ...(typeof m.text === "string" ? { text: m.text } : {}), ...(Number.isInteger(m.i) ? { i: m.i } : {}), ...(typeof m.label === "string" ? { label: m.label } : {}) }) }); }
      catch (e) { reply({ error: e instanceof Error ? e.message : String(e) }); }
      return broadcastSessions();
    }
    case "work.show": {   // the switch "show to team" (#101): on or off, answered with where it stands
      const id = sid(m.sessionId);
      try { return w.send({ type: "work.show", rid: m.rid, sessionId: id, ...(await showSession(id, !!m.on)) }); }
      catch (e) { return w.send({ type: "work.show", rid: m.rid, sessionId: id, shown: shows.showing(id), error: e instanceof Error ? e.message : String(e) }); }
    }
    case "work.private": {   // turn private (#1242): nothing from this session is counted from now on (src/track.ts), or back
      const id = String(m.sessionId ?? ""), on = !!m.on;
      if (!setPrivate(id, on)) return w.send({ type: "work.private", rid: m.rid, sessionId: id, private: isPrivate(id), error: "could not keep that on this Mac; nothing changed" });
      if (on && shows.showing(id)) await showSession(id, false).catch(() => {});   // a private session is not shown to the team
      everyone({ type: "work.privates", ids: privateIds() });
      return w.send({ type: "work.private", rid: m.rid, sessionId: id, private: on });
    }
    case "work.privates":
      return w.send({ type: "work.privates", rid: m.rid, ids: privateIds() });
    case "work.readnow":   // a queued message joins the running turn now (#51)
      return getRun(sid(m.sessionId))?.readNow(String(m.id));
    case "work.drop":      // a queued message is forgotten before it is read (#51)
      return getRun(sid(m.sessionId))?.drop(String(m.id));
    case "work.perm":
      return getRun(sid(m.sessionId))?.answer(String(m.id), m);
    case "work.aside": {   // a side question: answered to this face only, the session untouched
      const id = sid(m.sessionId);
      const run = getRun(id);
      const cwd = run?.cwd ?? (await sessionInfo(id))?.cwd;
      void aside({ sessionId: id, text: String(m.text ?? "").slice(0, 8000), cwd, model: run?.model }, (x) => w.send(x));
      return;
    }
    case "work.context.part": {   // one part of the context card, hovered (#683, #1519): what fills it, to this face only
      const part = CARD_PARTS.find((x) => x === m.part);
      const r = part ? await getRun(sid(m.sessionId))?.part(part) : null;
      return w.send({ type: "work.context.part", rid: m.rid, sessionId: m.sessionId, part: m.part, ...(r ? { reading: r } : { none: true }) });
    }
    case "work.files": {   // the box's @ list (or a folder check, with q ""): to this face only
      const cwd = folderOf(m.cwd);
      if (!cwd) return w.send({ type: "work.files", rid: m.rid, missing: true, files: [] });
      return w.send({ type: "work.files", rid: m.rid, cwd, files: await fileHits(cwd, String(m.q ?? "").slice(0, 200)) });
    }
    case "work.map": {   // the thread map: the transcript's tree, its ends and who wrote them
      const id = sid(m.sessionId);
      return w.send({ type: "work.map", rid: m.rid, sessionId: id, map: threadView(id) });
    }
    case "work.forkhere": {   // a session open elsewhere goes on in a new one here
      const id = sid(m.sessionId);
      const to = await forkHere(id, m.end ? sid(m.end) : undefined);
      mark(to, { parent: id });
      w.send({ type: "work.forked", sessionId: to, from: id, ...(m.rid ? { rid: m.rid } : {}), here: true });
      return broadcastSessions();
    }
    case "work.reconcile": {   // a split thread: one end kept, the other folded in or forked out
      const id = sid(m.sessionId);
      const r = await reconcile(id, sid(m.keep), sid(m.other), m.how === "fork" ? "fork" : "fold");
      everyone({ type: "work.reconciled", sessionId: id, ...r });
      w.send({ type: "work.map", sessionId: id, map: threadView(id) });
      return broadcastSessions();
    }
    case "work.tree": {   // the show's map: every file of the folder
      const cwd = folderOf(m.cwd);
      if (!cwd) return w.send({ type: "work.tree", rid: m.rid, missing: true, files: [] });
      return w.send({ type: "work.tree", rid: m.rid, cwd, files: await tree(cwd) });
    }
    case "work.peek": {   // a second session beside the open one: its thread, without moving what this face views
      const id = sid(m.sessionId);
      const run = getRun(id);
      const items = withCheckpoints(id, withHandIn(id, withTonight(id, withReviews(id, run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? []))));
      const info = await sessionInfo(id);
      return w.send({ type: "work.thread", sessionId: id, items, run: run?.info() ?? null, cwd: run?.cwd ?? info?.cwd, branch: info?.gitBranch, title: info?.customTitle || info?.summary, peek: true });
    }
    // the panes' questions: each answered to this face, by rid
    case "work.diff": case "work.read": case "work.write": case "work.pr": {
      const cwd = folderOf(m.cwd);
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      if (!cwd) return reply({ error: "that folder is not there" });
      try {
        if (m.type === "work.diff") return reply(await changes(cwd, String(m.scope ?? "all")));
        if (m.type === "work.pr") return reply(await pullRequest(cwd));
        const abs = pathIn(cwd, m.path);
        if (m.type === "work.read") return reply({ path: abs, assetKey: PANE_KEY, ...readText(abs) });
        return reply({ path: abs, ...writeText(abs, String(m.text ?? ""), typeof m.hash === "string" ? m.hash : undefined) });
      } catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
    }
    case "work.review": {   // Codex reads the session's change (the diff pane's scope) and names what is wrong (review.ts)
      const id = sid(m.sessionId);
      const reply = (o: object) => w.send({ type: "work.review", rid: m.rid, sessionId: id, ...o });
      if (m.stop) { stopReview(id); return reply({ ok: true }); }
      const cwd = folderOf(m.cwd);
      if (!cwd) return reply({ error: "that folder is not there" });
      // the remarks sit after what the thread showed when the review began
      const run = getRun(id);
      const list = run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? [];
      const after = [...list].reverse().find((i) => !i.parent && i.kind !== "review")?.id;
      try { return reply(await review({ sessionId: id, cwd, scope: ["all", "uncommitted", "last"].includes(m.scope) ? m.scope : "all", after }, everyone)); }
      catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
    }
    case "work.review.mark":   // a remark sent to Claude, or dismissed
      return markReview(sid(m.sessionId), String(m.id), m.state === "sent" || m.state === "dismissed" ? m.state : "open", everyone);
    case "work.pieces.list": case "work.pieces.make": case "work.pieces.open": case "work.pieces.now": case "work.pieces.seen": case "work.pieces.tick": case "work.pieces.drop": case "work.pieces.trust": case "work.pieces.sources": case "work.pieces.try": case "work.pieces.set": return piecesMsg(w, m);   // #1092
    case "work.stage.get": case "work.stage.ledger": case "work.stage.layout": case "work.stage.point":
    case "work.stage.yes": case "work.stage.freeze": case "work.stage.close": case "work.stage.carry": case "work.stage.reopen":
    case "work.stage.leave": case "work.stage.press": case "work.stage.compose": case "work.stage.update": case "work.stage.wheel": case "work.stage.at": case "work.stage.shot": case "work.stage.seen": case "work.stage.felt":
      return stageMsg(w, m);
    case "work.systems.area": case "work.systems.history":   // the system block: an area of the registry, read live (#1091)
      return systemsMsg(w, m);
    case "work.systems.live":   // the work under way now, by system: which sessions change what (#1156)
      return liveMsg(w, m);
    case "work.systems.whole":   // the whole: clusters, the wires between them, who is where (#1193)
      return wholeMsg(w, m);
    case "work.term.open": {   // a new terminal in a folder; its output goes to every face
      const cwd = folderOf(m.cwd);
      if (!cwd) return w.send({ type: "work.term.opened", rid: m.rid, error: "that folder is not there" });
      let t;
      try { t = openTerm(cwd, Number(m.cols), Number(m.rows), everyone); }
      catch (err) { return w.send({ type: "work.term.opened", rid: m.rid, error: `the terminal did not open: ${err instanceof Error ? err.message : err}` }); }
      everyone({ type: "work.terms", terms: allTerms() });
      return w.send({ type: "work.term.opened", rid: m.rid, ...termInfo(t), buf: "" });
    }
    case "work.term.attach": {   // a pane showing a terminal that runs: what it said so far
      const t = getTerm(m.tid);
      return w.send(t ? { type: "work.term.opened", rid: m.rid, ...termInfo(t), buf: t.buf, seq: t.seq } : { type: "work.term.opened", rid: m.rid, tid: m.tid, gone: true });
    }
    case "work.term.in":
      return getTerm(m.tid)?.pty.write(String(m.data ?? ""));
    case "work.term.size": {
      const t = getTerm(m.tid);
      if (t?.alive) t.pty.resize(Math.max(20, Number(m.cols) | 0), Math.max(5, Number(m.rows) | 0));
      return;
    }
    case "work.term.close":
      closeTerm(m.tid);
      return everyone({ type: "work.terms", terms: allTerms() });
    case "work.term.list":
      return w.send({ type: "work.terms", terms: allTerms() });
    case "work.handover": {   // a Life conversation becomes a Work one (PROTOCOL round 11). Unused by the face since Home
      // (#132); kept for one release, it goes with #25's clean-up
      const reply = (o: object) => w.send({ type: "work.handover", rid: m.rid, ...o });
      if (m.seat === "claude") {   // the same Claude session, now marked as Work's: it opens in Work as it is
        const id = sid(m.sessionId);
        if (!(await sessionInfo(id))) return reply({ error: "that conversation is not there" });
        mark(id, { mode: "work" });
        invalidate(); broadcastSessions();
        return reply({ sessionId: id });
      }
      // Codex: Work cannot resume it, so its words come along as the first message of a new Work session, for Marco to send.
      // The Codex conversation is marked too (by its own id), so Life shows it as moved.
      const said: { who: string; text: string }[] = Array.isArray(m.said) ? m.said : [];
      if (!said.length) return reply({ error: "that conversation is empty or not there" });
      mark(sid(m.sessionId), { mode: "work" });
      return reply({ brief: gist(said, { title: m.title, from: "a Life conversation", to: "in Work" }) });
    }
    case "work.switch": {   // the switch flipped mid-talk (#182): a new talk on the other seat, in the same folder, carries on
      // from this one. The engine only reads: the gist of the talk and where it works, for the face to put in the new
      // talk's box (Marco sends it himself) with this talk as its parent. Nothing on this talk changes.
      const reply = (o: object) => w.send({ type: "work.switch", rid: m.rid, ...o });
      const id = sid(m.sessionId), from = m.seat === "codex" ? "codex" : "claude";
      const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };
      let said: Said[] = [], at: string | null | undefined;
      if (from === "claude") {
        const run = getRun(id);
        said = saidOf(run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? []);
        at = run?.cwd ?? (await sessionInfo(id))?.cwd;
      } else {
        said = await openThread("", "codex", id).catch(() => []);
        at = await codexCwd(id);
      }
      if (!said.length) return reply({ error: "that talk is empty or not there" });
      const cwd = at ? workFolderIn(at, homedir(), isDir, relocated) : undefined;
      if (!cwd) return reply({ error: "its folder is gone" });
      const title = typeof m.title === "string" && m.title ? m.title : (await workSessions()).sessions.find((s) => s.id === id)?.title;
      const [was, now] = from === "claude" ? ["Claude", "GPT"] : ["GPT", "Claude"];
      return reply({ brief: gist(said, { title, from: `a talk with ${was}`, to: `with ${now}`, you: was }), cwd, parent: id, seat: from === "claude" ? "codex" : "claude" });
    }
    case "work.adjust":
      return getRun(sid(m.sessionId))?.adjust(m);
    case "work.mark": {
      const ids: string[] = Array.isArray(m.sessionIds) ? m.sessionIds.map(sid) : [sid(m.sessionId)];
      for (const id of ids) { mark(id, m.patch ?? {}); if (m.patch?.archived === true) void children.archived(id).catch(() => {}); }
      return broadcastSessions();
    }
    // two kinds of session: `under` is the orchestration session that runs this one, set here by a drop onto that row or
    // cleared by "release" (and, since #1336 decided 2026-11-16, by a start or a root's send or read: group.ts). A session
    // put under one with a transcript arrives there as one summary turn (one.ts joined; not for an executor)
    case "work.under": {
      const id = sid(m.sessionId), to = typeof m.under === "string" && m.under ? sid(m.under) : null;
      // every answer, a refusal too, goes back by its rid so the face hears it; a refusal changes and broadcasts nothing
      const no = (error: string) => w.send({ type: "work.under", rid: m.rid, error });
      if (to && !one.runsOthers(to)) return no("only an orchestration session or the anchor runs others");
      if (to && underCycle(id, to)) return no("that would run it under itself");
      const was = workState().marks[id]?.under;
      const undone = was !== to && group.left(id, was);   // out of a grouping the engine made: that pair stays apart (#1336)
      mark(id, { under: to });
      // a move taken back (⌘Z, `undo`) returns it to an orchestrator that already heard its summary: not sent again.
      // Its block is composed again all the same (compose kind session binds the same block)
      if (to && was !== to) void one.joined(id, to, { undo: m.undo === true }).catch(() => {});
      w.send({ type: "work.under", rid: m.rid, ok: true, under: to });
      if (was !== to) void children.moved(id, to, was, undone ? "undo" : "hand").catch(() => {});   // its block closes there, is composed here
      return broadcastSessions();
    }
    // grouping on hard evidence (#1336, group.ts): what it is (on or off and why, its moves, how many were taken back),
    // and the switch in Build's own settings that turns it on again once it turned itself off
    case "work.grouping": {   // grouping on evidence (#1336): read, or switched in Build's settings ("work.group" is a folder's topic groups)
      if (m.on === true) group.turnOn();
      else if (m.on === false) group.turnOff();
      return w.send({ type: "work.grouping", rid: m.rid, ...group.state() });
    }
    // promote (a session that runs others: one_sessions and stop_session, its renewal, one turn) or demote (null: those taken
    // back, the sessions under it let loose, one turn); one.ts promote, demote
    case "work.kind": {
      const id = sid(m.sessionId);
      try {
        if (m.kind === "orchestration") { const r = await one.promote(id); w.send({ type: "work.kind", rid: m.rid, ...r }); void children.promoted(id, r.adopted ?? []).catch(() => {}); }
        else { const r = await one.demote(id); w.send({ type: "work.kind", rid: m.rid, ...r }); void children.demoted(id, r.loose).catch(() => {}); }
      }
      catch (e) { w.send({ type: "work.kind", rid: m.rid, error: e instanceof Error ? e.message : String(e) }); }
      return broadcastSessions();
    }
    case "work.rename":
      await renameSession(sid(m.sessionId), String(m.title ?? "").slice(0, 200));
      invalidate();
      return broadcastSessions();
    case "work.group":
      groupOp(String(m.op), m);
      return broadcastSessions();
    case "work.order":
      setOrder(m.keys);
      return broadcastSessions();
    case "work.folder":
      if (m.op === "rename") {   // the real folder, on the disk (#181): answered by rid, the reason when refused
        const reply = (o: object) => w.send({ type: "work.folder", rid: m.rid, ...o });
        let r;
        try { r = await renameNow(String(m.path ?? ""), String(m.name ?? "")); }
        catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
        if ("ok" in r) { invalidate(); broadcastSessions(); }
        return reply(r);
      }
      folderOp(String(m.op), String(m.path ?? ""));
      invalidate();
      return broadcastSessions();
    case "work.delete": {
      const id = sid(m.sessionId);
      if (getRun(id)?.working) throw new Error("stop the session before deleting it");
      getRun(id)?.end();
      await deleteSession(id);
      forget(id);
      invalidate();
      everyone({ type: "work.deleted", sessionId: id });
      return broadcastSessions();
    }
    case "work.start": {   // a proposal card's start: the session it proposed, marked as started from the one that proposed it
      const reply = (o: object) => w.send({ type: "work.start", rid: m.rid, ...o });
      try {
        const a = { title: String(m.title ?? "").slice(0, 200), prompt: String(m.prompt ?? ""), cwd: m.cwd ? String(m.cwd) : undefined, fork: !!m.fork, worktree: !!m.worktree, card: m.card ? String(m.card).slice(0, 120) : undefined };
        if (!a.prompt.trim()) return reply({ error: "the card has no task in it" });
        const from = sid(m.from);
        // a card starts once: a second click (or a second window) gets the session the first one made
        const made = a.card && Object.entries(workState().marks).find(([, k]) => k.card === a.card && k.parent === from)?.[0];
        if (made) return reply({ sessionId: made });
        const key = `${from}:${a.card ?? randomUUID()}`;
        let p = carding.get(key);
        if (!p) { p = startFrom(from, a); carding.set(key, p); void p.catch(() => {}).finally(() => carding.delete(key)); }
        reply({ sessionId: await p });
      } catch (err) { reply({ error: err instanceof Error ? err.message : String(err) }); }
      return broadcastSessions();
    }
    case "work.prefs": {   // the drawers the engine acts on: read, or changed (patch)
      const reply = (o: object) => w.send({ type: "work.prefs", rid: m.rid, ...o });
      try {
        const p = m.patch && typeof m.patch === "object" ? setPrefs(m.patch) : prefs();
        if (m.patch) { keepAwake(allRuns().some((r) => r.working)); if ("archiveDays" in m.patch || "archivePr" in m.patch) void sweep().catch(() => {}); }
        // every face learns the change (the side's stale folders, the folder new sessions start in)
        if (m.patch) { everyone({ type: "work.prefs", prefs: p }); if ("stale" in m.patch) broadcastSessions(); }
        return reply({ prefs: p });
      } catch (err) { return reply({ error: err instanceof Error ? err.message : String(err), prefs: prefs() }); }
    }
    case "work.copies": case "work.copies.remove": case "work.copies.clean": {
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      try {
        const list = await copiesNow();
        if (m.type === "work.copies") return reply(list);
        if (m.type === "work.copies.remove") {
          const c = list.copies.find((x) => x.path === String(m.path));
          if (!c) return reply({ error: "that side copy is not there any more" });
          const said = await removeCopy(c, liveIn, !!m.force);
          invalidate(); broadcastSessions();
          return reply({ ok: true, said });
        }
        let removed = 0; const errors: string[] = [];
        for (const c of list.copies.filter(stale)) await removeCopy(c, liveIn).then(() => removed++, (err) => errors.push(`${c.path}: ${err.message}`));
        invalidate(); broadcastSessions();
        return reply({ removed, errors });
      } catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
    }
    case "work.about": {   // the machine and tools drawers: versions, the log, output styles, what the newest run loaded
      const i = lastInit;
      return w.send({ type: "work.about", rid: m.rid, ...(await about()), styles: styles(),
        tools: i ? { skills: i.skills ?? [], plugins: (i.plugins ?? []).map((x: any) => x.name ?? String(x)), mcp: i.mcp_servers ?? [], agents: i.agents ?? [], style: i.output_style, cwd: i.cwd } : null });
    }
    case "work.fork": {
      const id = sid(m.sessionId);
      const r = await forkSession(id, { ...(m.upTo ? { upToMessageId: String(m.upTo) } : {}), ...(m.title ? { title: String(m.title) } : {}) });
      mark(r.sessionId, { parent: id });
      invalidate();
      w.send({ type: "work.forked", from: id, sessionId: r.sessionId });
      return broadcastSessions();
    }
    // --- overview (PROTOCOL.md round 20, #40)
    case "work.compact": {   // the Context card's "Compact session": /compact into the session, as the box would send it
      const id = sid(m.sessionId);
      const r = getRun(id);
      await workSay({ sessionId: id, text: "/compact", model: r?.model ?? m.model, effort: r?.effort ?? m.effort, mode: r?.mode ?? m.mode, fast: r?.fast ?? m.fast }, bus);
      return broadcastSessions();
    }
    case "work.remote":   // Remote Control: the away page over `tailscale serve`; on undefined reads the state only
      return w.send({ type: "work.remote", rid: m.rid, ...(await remote(typeof m.on === "boolean" ? m.on : undefined)) });
    case "work.changes.summary": case "work.pr.create": {   // the Changes card: +n −m, and a draft PR from the branch
      const cwd = folderOf(m.cwd);
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      if (!cwd) return reply({ error: "that folder is not there" });
      try { return reply(m.type === "work.pr.create" ? await createPr(cwd) : await changesSummary(cwd)); }
      catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
    }
    // orchestration sessions and the anchor as kept (the side: sideKept.ts, one/anchor.ts), a renewal on the person's ask,
    // build.tickets as the face says it (an orchestration session then routes to tickets; one.ts setTickets), the anchor
    // opened from its row (one.ts openAnchor), and build.orchestration as the face says it (one.ts setOrchestration)
    case "work.one.kept": case "work.one.renew": case "work.tickets.on": case "work.one.open": case "work.orchestration.on": {
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      try {
        if (m.type === "work.one.kept") return reply(one.kept());
        if (m.type === "work.tickets.on") return reply({ ...one.setTickets(m.on === true), on: one.ticketsOn() });
        if (m.type === "work.orchestration.on") return reply({ ...one.setOrchestration(m.on !== false), on: one.orchestrationOn() });
        if (m.type === "work.one.open") {
          const r = await one.openAnchor(typeof m.cwd === "string" && m.cwd ? m.cwd : undefined);
          if (r.made) invalidate();
          reply(r); return broadcastSessions();
        }
        return reply(await one.renew("asked", typeof m.sessionId === "string" && m.sessionId ? sid(m.sessionId) : undefined));
      } catch (err) { return reply({ error: err instanceof Error ? err.message : String(err) }); }
    }
    // tickets (the face and the walk): the summary an orchestration session holds and the list, or one ticket whole; the
    // person asking for a fresh executor; the person's words straight to a ticket (nobody between, so nobody else is subscribed)
    case "work.tickets.list": case "work.tickets.get": case "work.tickets.replace": case "work.tickets.send": {
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      try {
        if (m.type === "work.tickets.list") return reply({ summary: executor.door.summary(), tickets: executor.door.list() });
        if (typeof m.ticket !== "string" && typeof m.ticket !== "number") return reply({ error: "which ticket?" });
        if (m.type === "work.tickets.replace") return reply({ ticket: await executor.door.replace(String(m.ticket)) });
        if (m.type === "work.tickets.send") {
          if (typeof m.words !== "string" || !m.words.trim()) return reply({ error: "no words to send" });
          return reply({ ticket: await executor.door.send("person", String(m.ticket), m.words, m.reopen === true ? { reopen: true } : undefined) });
        }
        return reply({ text: executor.door.read(String(m.ticket)) });
      } catch (err) { return reply({ error: err instanceof Error ? err.message : String(err) }); }
    }
    // pieces that snap (#1024, build.snap): the face asks only with the switch on; nothing runs before a row is pressed
    case "work.snap.get": case "work.snap.put": case "work.snap.run": case "work.snap.hand": case "work.snap.stop": case "work.snap.switch": {
      const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
      try {
        // the window's build.snap (#1679): off stops the morning clock at once, kept across restarts; on starts it again
        if (m.type === "work.snap.switch") { if (typeof m.on === "boolean") snap.setSnapOn(m.on); return reply({ on: snap.snapOn() }); }
        if (m.type === "work.snap.get") { snap.startClock(undefined, true); const rs = snap.sections().map((s) => snap.runOf(s.id)).filter(Boolean); return reply({ sections: snap.sections(), runs: rs }); }
        if (m.type === "work.snap.put") return reply({ sections: snap.putTable(m.sections) });
        if (m.type === "work.snap.run") return reply({ run: await snap.runSection(String(m.id)) });
        if (m.type === "work.snap.hand") return reply({ run: await snap.hand(String(m.run), String(m.brick), m.go !== false) });
        return reply({ run: snap.stop(String(m.run)) });
      } catch (err) { return reply({ error: err instanceof Error ? err.message : String(err) }); }
    }
    // Build becomes yours (#1089, build.yours): the face asks only with the switch on; nothing is sent for the person
    case "work.yours.offer": case "work.yours.seen": case "work.yours.adjust": case "work.yours.page": case "work.yours.keep": case "work.yours.undo": case "work.yours.list": case "work.yours.again": case "work.yours.shelf": case "work.yours.lay": case "work.yours.change": case "work.yours.unchange": case "work.yours.forget": case "work.yours.sent": case "work.yours.learn":
      return void yours.hear(m, (o) => w.send({ type: m.type, rid: m.rid, ...o }));
    default:   // a type this engine does not know (a newer face): answered by its rid, so the face's ask does not wait 20 s
      return w.send({ type: m.type, rid: m.rid, error: `this engine does not know ${String(m.type)}` });
  }
}

// --- Show (#101): a running session on a team issue shown to the team over the relay, read-only, or no longer
export async function showSession(id: string, on: boolean): Promise<{ shown: boolean; note?: string }> {
  const run = getRun(id);
  if (!on) {
    if (!shows.showing(id)) return { shown: false };
    const note = await shows.stop(id);
    if (run) { run.shown = false; run.tell(); }
    return { shown: false, note };
  }
  if (isPrivate(id)) throw new Error("this session is private: turn private off first, then show it");   // #1242
  if (!run) throw new Error("this session is not running: send it a message, then show it");
  // a room session streaming to its room (#238) is shown on its issue instead: the room show ends first
  if (shows.roomShows().includes(id)) await shows.stop(id);
  if (shows.showing(id)) return { shown: true };
  const issue = await issueAt(runGit, run.cwd);
  if (!issue) throw new Error("this session's branch does not name a team issue (start the work with sol/take <issue>)");
  if (!relayUp()) throw new Error("the team relay is not connected (Cowork, settings)");
  const info = await sessionInfo(id).catch(() => undefined);
  const title = String(info?.customTitle || info?.summary || `#${issue}`);
  await shows.start(id, { cwd: run.cwd, issue, repo: await repoOf(runGit, run.cwd), title, existing: run.items.list.map((i) => i.id) });
  run.shown = true; run.issue = issue; run.tell();
  return { shown: true };
}
// --- end Show

// the stage (#695, blocks.ts): every change goes to every Work face as work.stage.changed; a session's project is its
// folder's repo; a line is signed as the person's agent
stage.setStageBus((m) => { everyone(m); homeStage(m); children.hears(m); });   // and Home (#825): a block that waits is a Thing on Today; nothing while Home is off; and a child's stage change refreshes its block (step 4)
setHandBus(everyone);   // the agent's moves (#1437) to every Work face; the one showing the session makes them
setPiecesBus((m) => everyone(m));   // #1092
live.setLiveOut((m) => everyone(m));   // a terminal block's output, to every face (#699)
stage.setStageFinder(async (id) => {
  const cwd = getRun(id)?.cwd ?? (await sessionInfo(id).catch(() => undefined))?.cwd;
  const login = await myLogin().catch(() => "");
  return { ...(cwd ? { cwd } : {}), by: `${login || "my"}'s agent · ${id.slice(0, 8)}` };
});
// a press comes back to the session that asked as a turn (#1298), the path send_message takes
asks.setPressDeps({
  turn: async (sessionId, text) => {
    if (!(await sessionInfo(sessionId)) && !getRun(sessionId)) throw new Error("no such session");
    await workSay({ sessionId, text }, bus);
    broadcastSessions();
  },
});
// the person's own hand on the stage, from the face (stage: joins sitting 2): the stage asked for, a drag or a fold
// (layout), what the pointer is on (point), a yes, a freeze, a close. Answered to the asking face by rid
async function stageMsg(w: Wire, m: any) {
  const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
  try {
    const id = sid(m.sessionId);
    const who = await stage.whoFor(id);
    const me = { ...who, by: who.by.replace(/'s agent/, "") };   // the person's own press, signed as them
    switch (m.type) {
      // the whole stage as ever; the list without folded bodies, or one block, to a face that asks for it (#870)
      case "work.stage.get": return reply(stage.stageAnswer(who.project, id, stage.stageAsk(m)));
      case "work.stage.ledger": return reply({ project: who.project, id: String(m.id), lines: stage.ledger(who.project, String(m.id)) });
      case "work.stage.layout": return reply({ stage: stage.layout(who.project, id, m.stage ?? {}) });
      case "work.stage.point": stage.point(id, m.at ?? null); return reply({ ok: true });
      // the face's report of what it drew (#1435, eyes.ts): where each piece stands, how it fits, what the hand did
      // how the agent's moves went (#1437): counted by track.ts as it came in; nothing else to do
      case "work.stage.felt": return reply({ ok: true });
      case "work.stage.seen": eyes.setSeen({ ...(m.report ?? {}), sessionId: id }, (b) => stage.getBlock(who.project, b)?.title ?? b); return reply({ ok: true });
      // the press at the foot of a block that asks (#1298): answered once, keyed by the block; routed back to who asked
      case "work.stage.press": return reply(await asks.pressed(me, { id: String(m.id), choice: String(m.choice ?? "") }));
      case "work.stage.yes": return reply({ block: stage.yes(me, { id: String(m.id), ...(typeof m.note === "string" ? { note: m.note.slice(0, 200) } : {}) }) });
      case "work.stage.freeze": return reply({ block: stage.freeze(me, { id: String(m.id) }) });
      case "work.stage.close": return reply({ block: stage.place(me, { id: String(m.id), close: true }).block });
      case "work.stage.carry": {
        // a tray's miniature dropped on this stage (#739): carried here from the session that made it, at the spot asked;
        // a block dropped on another session's row: with stage.whole on, moved there (#826)
        const at = m.at && typeof m.at === "object" && ["x", "y", "w", "h"].every((k) => Number.isFinite(m.at[k])) ? { at: { x: m.at.x, y: m.at.y, w: m.at.w, h: m.at.h, ...(m.at.hand === true ? { hand: true } : {}) } } : {};
        return reply({ block: stage.carryByHand(me, { id: String(m.id), to: sid(m.to), ...at }) });
      }
      // off this stage alone (#870 item 5): alive for the sessions that still use it, in this one's tray
      case "work.stage.leave": return reply({ block: stage.place(me, { id: String(m.id), leave: true }).block });
      // a close undone (⌘Z, #737): live again where it sat
      case "work.stage.reopen": { const at = m.at && typeof m.at === "object" && [m.at.x, m.at.y, m.at.w, m.at.h].every(Number.isFinite) ? { at: { x: m.at.x, y: m.at.y, w: m.at.w, h: m.at.h, ...(Number.isFinite(m.at.z) ? { z: m.at.z } : {}) } } : {}; return reply({ block: stage.reopen(me, { id: String(m.id), ...at }) }); }
      // the person's own block (a chip dropped on the stage, the fixture poured by ?stage=fixture): composed as theirs, at
      // the place the face asked; and their own change to a body (a still kept or cut, a step's yes)
      // the browser block's wheel changing hands, the person's page moving, a shot to the stills (#699, live.ts)
      case "work.stage.wheel": return reply({ block: live.wheel(me, String(m.id), m.hand === "you" ? "you" : "sol", typeof m.url === "string" ? m.url : undefined) });
      case "work.stage.at": { const b = stage.getBlock(who.project, String(m.id)); if (b?.kind === "browser" && typeof m.url === "string" && /^https?:\/\//.test(m.url)) live.at(who.project, b.id, m.url.slice(0, 2000)); return; }
      case "work.stage.shot": return reply({ block: await live.shoot(me, String(m.id), typeof m.png === "string" ? m.png : undefined) });
      case "work.stage.compose": {
        const a = m.block ?? {};
        // a terminal or a browser of the person's own: its program is the engine's
        if (a.kind === "terminal" || a.kind === "browser") {
          const v = (() => { try { return typeof a.body === "string" ? JSON.parse(a.body) : a.body ?? {}; } catch { return {}; } })();
          const at = m.at && typeof m.at === "object" ? { at: m.at } : {};
          return reply({ block: a.kind === "terminal" ? live.composeTerminal(me, { title: String(a.title ?? ""), run: typeof v?.run === "string" ? v.run : undefined, cwd: folderOf(v?.cwd) ?? undefined, person: true, ...at })
            : live.composeBrowser(me, { title: String(a.title ?? ""), url: typeof v?.url === "string" ? v.url : "", hand: v?.hand === "you" ? "you" : "sol", person: true, ...at }) });
        }
        const b = stage.compose(me, {
          kind: a.kind, title: String(a.title ?? ""), body: typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? ""), format: a.format ?? "json",
          waits: a.waits === true, person: true, ...(stage.validId(a.id) ? { id: a.id } : {}), ...(m.at && typeof m.at === "object" ? { at: m.at } : {}),
          ...(a.bind?.source ? { bind: { source: String(a.bind.source), watch: a.bind.watch ?? false } } : {}),
        });
        return reply({ block: b });
      }
      case "work.stage.update": {
        const b = stage.getBlock(who.project, String(m.id));
        if (!b) return reply({ error: `no block "${m.id}"` });
        if (m.body === undefined) return reply({ block: m.state === "live" && b.state === "waits" ? stage.yes(me, { id: b.id, ...(typeof m.note === "string" ? { note: m.note.slice(0, 200) } : {}) }) : b });
        return reply({ block: stage.update(me, { id: b.id, body: typeof m.body === "string" ? m.body : JSON.stringify(m.body), format: m.format ?? "json", waits: (m.state ?? b.state) === "waits" }) });
      }
    }
  } catch (e) { return reply({ error: e instanceof Error ? e.message : String(e) }); }
}

// the orchestration stage's hands (step 4, children.ts): what a session block reads, and what its presses do
children.setChildDeps({
  session: async (id) => { const s = await oneSession(id).catch(() => undefined); return s ?? (getRun(id) ? { id, cwd: getRun(id)!.cwd } : undefined); },
  run: (id) => { const r = getRun(id); if (!r) return undefined; const i = r.info(); return { busy: i.busy, waiting: i.waiting, tasks: i.tasks ?? [], failed: i.failed, cwd: i.cwd }; },
  items: async (id) => getRun(id)?.items.list ?? (await sessionItems(id).catch(() => null))?.list ?? [],
  // the send_message path: one turn in the child, signed as the person's press from the orchestrator's stage
  say: async (id, text) => { await workSay({ sessionId: id, text }, bus); broadcastSessions(); },
  stop: async (id) => { await getRun(id)?.stop(); },
  archive: (id) => { archive(id); broadcastSessions(); },
});
// the orchestration sessions' hands: the engine's own say, runs and list, given so one.ts never imports this file
one.setOneDeps({
  say: async (sessionId, text, fresh, how) => { const mode = modeFor(how?.free); await workSay({ sessionId, text, ...(fresh ? { fresh: true, cwd: fresh.cwd } : {}), ...(mode ? { mode } : {}) }, bus); if (fresh) invalidate(); broadcastSessions(); },
  run: (id) => getRun(id),
  sessions: async () => (await workSessions()).sessions as never,
  lastWords: async (id) => {
    const run = getRun(id);
    const list = run ? run.items.list : (await sessionItems(id)).list;
    const you = list.filter((i) => i.kind === "you" && String(i.text ?? "").trim());
    return String(you[you.length - 1]?.text ?? "");
  },
  tell: (m) => everyone(m),
  name: (id, title) => nameWhenWritten(id, title),   // #1044
  tickets: executor.door,   // the ticket tools (given only with build.tickets on) and the renewal's summary and repoint
  isExecutor: (id) => !!tickets.ofSession(id),   // its turns reach its followers through its ticket, never as a child's report
  goal: () => goalForRenewal(thingsDeps(), recordOf(activeRoom(getTeam()))),   // the renewal carries the room's goal, read fresh (#1371)
  items: async (id) => getRun(id)?.items.list ?? (await sessionItems(id).catch(() => null))?.list ?? [],   // a joined session's summary (one.ts joined)
  carry: async (from, to) => {
    const who = await stage.whoFor(from);
    stage.start({ ...who, sessionId: to }, { from, carry: stage.getStage(who.project, from).blocks.filter((p) => !p.folded).map((p) => p.id) });
  },
});
one.wakeOrchestrators();   // after a restart, the promoted sessions have their tools again (2026-11-14)
// grouping on hard evidence's hands (#1336, group.ts): a session's project as the side files it (a side copy is its
// repo's), the promote with its blocks, a placed session's block and joined turn, the off line to every face
group.setGroupDeps({
  projectOf: async (id) => (await workSessions()).sessions.find((s) => s.id === id)?.project,
  promote: async (id) => { const r = await one.promote(id); if (r.promoted) void children.promoted(id, r.adopted ?? []).catch(() => {}); return r; },
  placed: async (child, root, rule) => { await children.moved(child, root, undefined, rule); await one.joined(child, root).catch(() => {}); },
  tell: (m) => everyone(m),
});

// the bench's hands (#1024): say to a session (or a new one in a folder), whether one exists, its last words, its allow
snap.setSnapDeps({
  say: async (sessionId, text, fresh) => { await workSay({ sessionId, text, ...(fresh ? { fresh: true, cwd: fresh.cwd } : {}) }, bus); if (fresh) invalidate(); broadcastSessions(); },
  exists: async (id) => !!getRun(id) || (await workSessions()).sessions.some((s) => s.id === id),
  lastWords: async (id) => {
    const run = getRun(id);
    const list = run ? run.items.list : (await sessionItems(id)).list;
    const you = list.filter((i) => i.kind === "you" && String(i.text ?? "").trim());
    return String(you[you.length - 1]?.text ?? "");
  },
  perm: (id) => {
    const run = getRun(id); const p = run?.items.list.slice().reverse().find((i) => i.kind === "perm" && i.state === "ask");
    return run && p?.id && run.answer ? { answer: (allow: boolean) => run.answer!(String(p.id), { allow }) } : null;
  },
  tell: (m) => everyone(m),
});

// the executors' hands (tickets): say (a fresh one in a folder, or a side copy of a repo there, on the mode its ticket's
// mandate gives, or bypass when the person's Work default is bypass), whether a session is still there, its last words, its folder, and every face told of the tickets.
// No parent is marked: an executor is its ticket's, never a child of an orchestration session (no report twice, nothing
// done to it by a renewal). After an engine restart, wake() gives the executors their tools again; with no tickets it
// touches nothing.
const lastWordsOf = async (id: string) => {
  const run = getRun(id);
  const list = run ? run.items.list : (await sessionItems(id)).list;
  const you = list.filter((i) => i.kind === "you" && String(i.text ?? "").trim());
  return String(you[you.length - 1]?.text ?? "");
};
executor.setExecDeps({
  store: tickets,
  say: async (sessionId, text, fresh, how) => {
    const mode = modeFor(how?.free, baseModeOf(how?.from));   // bypass when the opener's own mode or the Work default is bypass, else the mandate's free (runs.ts modeFor)
    await workSay({ sessionId, text, ...(fresh ? { fresh: true, cwd: fresh.cwd, worktree: !!fresh.worktree } : {}), ...(mode ? { mode } : {}) }, bus);
    if (fresh) invalidate(); broadcastSessions();
  },
  run: (id) => getRun(id),
  exists: async (id) => !!getRun(id) || !!(await sessionInfo(id).catch(() => undefined)),
  lastWords: lastWordsOf,
  isRepo: (dir) => { try { return execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim() === "true"; } catch { return false; } },
  cwdOf: async (id) => getRun(id)?.cwd ?? (await sessionInfo(id).catch(() => undefined))?.cwd,
  tell: (m) => everyone(m),
  name: (id, title) => nameWhenWritten(id, title),
  holding: (id) => one.renewing(id),   // an orchestration session writing its handover: reports wait for its fresh copy
});
// the picker moved on a live session: the live sessions under it follow (Frank, 2026-11-20: a session he switched to
// bypass kept starting and running its sessions on the old mode). The ones it started and its tickets' executors; each of
// those tells its own in turn (a tree, so it ends). A woken session never moves past ask-first (Run.adjust holds it)
onModeChange((id, mode) => {
  const live = allRuns().map((r) => r.id);
  for (const c of modeFollowers(id, mode, live, workState().marks, tickets.list())) { const r = getRun(c); if (r && r.mode !== mode) void r.adjust({ mode }); }
});
try { executor.wake(); } catch (e) { console.error("tickets: wake failed", e); }

// wake (#1151, team/wake.ts): a comment on GitHub wakes my agent where my rules allow. A woken session carries the
// `woken` mark, so runs.ts holds it bare (no settings of mine, none of Sol's tools, ask first, never bypass) on every run;
// it is nobody's child; one woken by another person is narrow too (its three tools only, given before it starts). Started a tick after load, as index.ts reads sol/engine/.env after the imports
// (SOL_WAKE=off there stops it)
setTimeout(() => {
  const home = joinPath(STATE_DIR, "wake", "work");
  startWake({
    team: getTeam,
    // my group's members (#1313), as the members check reads them: a minute old at most, null on a failed read (nobody);
    // a project with no list has none
    members: async () => { const r = await membersNow(true); return r.source ? r.list : []; },
    gh: (args) => runGh(args),
    ghIn: (args, input) => runGhStdin(args, input),
    say: async (sessionId, text, cwd, who) => {
      mkdirSync(home, { recursive: true });
      mark(sessionId, { woken: who });   // before its first run: runs.ts holds every run of it bare
      const here = (() => { try { return statSync(cwd).isDirectory(); } catch { return false; } })();   // never the home folder a missing one falls back to
      await workSay({ sessionId, text, fresh: true, cwd: here ? cwd : home, mode: "default" }, bus);
      invalidate(); broadcastSessions();
    },
    // 👀 as me: GitHub answers 201 when it is new, 200 when it was there (another Sol of mine put it)
    claim: async (repo, id) => /^HTTP\/[\d.]+ 201\b/.test(await runGh(["api", "-i", "-X", "POST", `repos/${repo}/issues/comments/${id}/reactions`, "-f", "content=eyes"])),
    give: (sessionId, tools) => { for (const t of tools) giveTool(sessionId, t); },
    name: (id, title) => { void nameWhenWritten(id, title); },
    home,
    file: joinPath(STATE_DIR, "wake.json"),
  });
}, 0).unref?.();

// a way's room (#1311, team/v3/way-room.ts): started as a session other people woke, so runs.ts holds it bare and narrow
// (its tools only, given before it starts) in an empty folder of its own; never in the team room, its title fixed by
// the engine, its last words sent nowhere
{
  const home = joinPath(STATE_DIR, "way-room", "work");
  setRoomStart({
    say: async (sessionId, text) => {
      mkdirSync(home, { recursive: true });
      mark(sessionId, { woken: "others" });   // before its first run
      await workSay({ sessionId, text, fresh: true, cwd: home, mode: "default" }, bus);
      invalidate(); broadcastSessions();
    },
    give: (sessionId, tools) => { for (const t of tools) giveTool(sessionId, t); },
    name: (id, title) => { void nameWhenWritten(id, title); },
    working: (id) => !!getRun(id)?.working,
    stop: async (id, tools) => { for (const t of tools) takeTool(id, t); await getRun(id)?.stop(); },
  });
}

// the doors between sessions, for the model (tools.ts)
const line = (s: { id: string; title: string; cwd: string; updatedAt: number }) => `${s.id}  ${new Date(s.updatedAt).toISOString().slice(0, 16)}  ${s.title}  (${s.cwd})`;
setWorkHooks({
  async list(q) {
    const { sessions } = await workSessions();
    const words = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const hit = sessions.filter((s) => !s.archived && words.every((w) => (s.title + " " + s.cwd).toLowerCase().includes(w)))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
    return hit.map(line).join("\n") || "no sessions";
  },
  async read(id, last = 20, from) {
    if (from) void group.contacted(from, id, "read").then((m) => m && broadcastSessions()).catch(() => {});   // #1336: a root's read groups
    const run = getRun(id);
    const list = run ? run.items.list : (await sessionItems(id)).list;
    return list.filter((i) => i.kind === "me" || i.kind === "you").slice(-last)
      .map((i) => `${i.kind === "me" ? "Marco" : "Claude"}: ${String(i.text).slice(0, 4000)}`).join("\n\n") || "nothing said yet";
  },
  async message(from, asked, text) {
    if (one.isRouter(from)) return "refused: with tickets on you do not talk to sessions yourself: give the words to their ticket (ticket_send), or open a ticket for new work (ticket_open)";
    const to = one.currentOf(asked);   // a renewed orchestration session's old id: its fresh copy hears it
    if (!(await sessionInfo(to)) && !getRun(to)) throw new Error("no such session");
    await workSay({ sessionId: to, text: `<message from session ${from}>\n${text}` }, bus);
    // counted (docs/analytics/tracking.md, "build"): who to whom by kind, and whether an old id was carried to its fresh copy
    if (!isPrivate(from) && !isPrivate(to)) track("build.message.send", { from_orch: one.isOrchestrator(from), to_orch: one.isOrchestrator(to), renewed: to !== asked }, { mode: "work" });
    void group.contacted(from, to, "send").then((m) => m && broadcastSessions()).catch(() => {});   // #1336: a root's send groups
    return to === asked ? "sent; it runs as a turn there" : `sent to ${to}, the renewed copy of ${asked}; write to ${to} from now on`;
  },
  async start(from, a) {
    if (one.isRouter(from)) return "refused: with tickets on you do not start sessions yourself: open a ticket (ticket_open) and its own session does the work";
    if (a.initiation === "proposal") return "proposed: a card waits in the talk and Marco starts it when he wants. Carry on.";
    // an orchestration session runs what it starts (step 4): under it as well as parent, its block on this stage. The
    // anchor too runs what it starts (under it, reporting back), with no block on its stage (children.ts is orchestration's)
    const id = await startFrom(from, { ...a, ...(one.runsOthers(from) ? { under: from } : {}) });
    return one.isOrchestrator(from) ? `started ${id}; it runs under you: its block is on your stage and it reports back here`
      : one.isAnchor(from) ? `started ${id}; it runs under you and reports back here when its turn ends`
      : `started ${id}; it appears beside this one in the person's side, marked as started from here`;
  },
  async handoff(from, title, plan, blocks) {
    if (one.isRouter(from)) return "refused: with tickets on you do not hand your work to a session yourself: open a ticket (ticket_open) and its own session does the work";
    // the "what is left" prose stays; the blocks named go with it (#700)
    const id = await startFrom(from, {
      title, fork: true, blocks: blocks ?? [],
      prompt: `This task was handed off to you from the session you were forked from; it stops there. What is left:\n\n${plan}`,
    });
    return `handed off: started ${id} with the task. Stop it here, say in one line that it moved, and answer Marco's newest message.`;
  },
  // Scoped and Approve (#482, team/checkpoint.ts): the card goes in the session after what was said last; only the
  // person's press (team.checkpoint.press) writes the Status line
  async checkpoint(from, feature, press) {
    if (!PRESSES.includes(press as never)) return `the presses are ${PRESSES.join(" and ")}`;
    const run = getRun(from);
    const cwd = featuresRoot(run?.cwd ?? (await sessionInfo(from))?.cwd ?? "");
    if (!cwd) return "this session's folder has no specs/features: the presses are for Sol developers' feature folders";
    const last = run?.items.list[run.items.list.length - 1]?.id;
    return askPress({ bus: workBus }, { sessionId: from, cwd, feature, press, ...(last ? { after: last } : {}) });
  },
  async archive(id, archived) {
    archive(id, archived);
    broadcastSessions();
    return archived ? "archived" : "back in the side";
  },
  async rename(id, title) {
    await renameSession(id, title);
    invalidate(); broadcastSessions();
    return "renamed";
  },
  async done(id, done) {
    mark(id, { done });
    broadcastSessions();
    return done ? "marked completed" : "unmarked";
  },
  // the brief and team_note (#83): the session's folder is the repo; the login and the GitHub switch from team settings
  async brief(from, issue) {
    const cwd = getRun(from)?.cwd ?? (await sessionInfo(from))?.cwd;
    if (!cwd) throw new Error("no folder for this session");
    return brief(cwd, issue);
  },
  async note(from, n) {
    const cwd = getRun(from)?.cwd ?? (await sessionInfo(from))?.cwd;
    if (!cwd) throw new Error("no folder for this session");
    return teamNote({ cwd, gh: runGh, git: runGit, login: myLogin, mayGitHub: () => mayAgentSpeak(getTeam(), "github"),
      ping: ({ kind, ...p }) => wakeUp().send({ ...p, pingKind: kind }, true) }, n);
  },
  // "this broke" (#421): the change's PR in the session's repository unless named; signed as my agent, when it may
  // write on GitHub (Control)
  async broke(from, a) {
    if (!mayAgentSpeak(getTeam(), "github")) throw new Error("your human has not let their agent write on GitHub (Control in Settings)");
    let repo = a.repo ?? "";
    if (!repo) {
      const cwd = getRun(from)?.cwd ?? (await sessionInfo(from))?.cwd;
      repo = cwd ? await repoOf(runGit, cwd).catch(() => "") : "";
      if (!repo) throw new Error("which repository? give repo as owner/name");
    }
    const { brokeNow } = await import("../team/wire.js");   // late: team/wire.ts imports this file
    const r = await brokeNow({ repo, number: a.number, why: a.why, agent: true });
    const rev = !r.revert ? "" : "error" in r.revert ? `; no revert opened (${r.revert.error})` : `; revert PR #${r.revert.number} ${r.revert.already ? "was open already" : "opened, for its author to merge"}`;
    return `said: #${a.number} in ${repo} wears broke now${r.told.length ? `; ${r.told.join(" and ")} got a card` : ""}${rev}`;
  },
  // the pings to my human (#100), kept by team/wire.ts as they arrive: the unseen ones, marked seen
  async pings(_from, issue) {
    return pingsText(takePings(issue));
  },
  async show(from, on) {   // show_to_team (#101)
    const r = await showSession(from, on);
    return r.note ?? (r.shown ? "shown: the team sees this session's new lines, read-only, until it ends or is switched off" : "it was not shown");
  },
  // the room's things (#194): the list as lines; an add through the same policy and compare-and-swap as the face's,
  // marked as the agent's, refused when my agent may not speak where the record is: GitHub, or Cowork for a cloud room (#216)
  async things() {
    const repo = recordOf(activeRoom(getTeam()));
    return thingsText(repo ? await getThings(thingsDeps(), repo) : { v: 1, things: [] }, repo);
  },
  async thingAdd(_from, url, name, folder) {
    const no = await memberNo("add a thing"); if (no) return `not added: ${no}`;
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    const login = (onCloud ? hubLogin() : "") || getTeam().me.login || (await myLogin().catch(() => ""));
    return agentAdd(thingsDeps(), { repo, mayGitHub: mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github"), login, url, name, parent: folder });
  },
  // room_folder_add, room_thing_move (#248): the same CAS as the face's, under the same "may my agent speak" rule
  async folderAdd(_from, name) {
    const no = await memberNo("add a folder"); if (no) return `not added: ${no}`;
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    const login = (onCloud ? hubLogin() : "") || getTeam().me.login || (await myLogin().catch(() => ""));
    return agentFolder(thingsDeps(), { repo, mayGitHub: mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github"), login, name });
  },
  async thingMove(_from, id, to) {
    const no = await memberNo("move a thing"); if (no) return `not moved: ${no}`;
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    return agentMove(thingsDeps(), { repo, mayGitHub: mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github"), id, to });
  },
  // in_thing (#230): the agent of this session is in one of the room's things; an unknown id is refused in one line
  async inThing(from, id) {
    const repo = recordOf(activeRoom(getTeam()));
    if (!repo) return "this room has no record yet; nothing to be in";
    // a page is one too (#433): `page-<id>`, its title the name
    const [things, list] = await Promise.all([getThings(thingsDeps(), repo), pages.list(thingsDeps(), repo).catch(() => [])]);
    return agentIn([...things.things, ...list.map((p) => ({ id: pageTile(p.id), name: p.title }))], id, from);
  },
  // room_feed (#232): the room's feed as plain lines, the same read the face's "what happened" uses
  async feed() {
    const { feed, roomKeyNow } = await import("../team/wire.js");   // loaded first by index.ts: no load-order cycle
    const r = await feed.lines(roomKeyNow());
    return (r.error ? `(${r.error}; these are from before)\n` : "") + feedText(r.lines);
  },
  // a group's memory (#316): wrap_up's note kept in the group the session was started under (its mark), written after the
  // answer so the turn ends at once; room_memory reads that group's notes (the room in use for a session of no group)
  async memoryNote(from, note) {
    const r = await noteFrom({ ...memoryDeps(), marks: (id) => workState().marks[id], room: noteRoom,
      title: async (id) => { const i = await sessionInfo(id) as { customTitle?: string; summary?: string } | undefined; return String(i?.customTitle || i?.summary || ""); },
      thing: async (repo, id) => (await getThings(thingsDeps(), repo)).things.find((t) => t.id === id)?.name ?? "" }, from, note);
    void r.written?.catch(() => {});
    return r.answer;
  },
  // the project's agent rules (#432, team/facts.ts): a team_note's are its repository's project's, a wrap_up note's the
  // group the session was started under (none: the note is dropped, nobody reads it); facts when the project is unknown
  async agents(from, tool) {
    let repo = "";
    if (tool === "wrap_up") {
      const mark = workState().marks[from]?.room;
      if (!mark) return "more";
      const room = roomOfMark(mark);
      repo = room ? recordOf(room) : "";
    }
    else { const cwd = getRun(from)?.cwd ?? (await sessionInfo(from))?.cwd; repo = cwd ? await repoOf(runGit, cwd).catch(() => "") : ""; }
    return repo ? agentShare(repo, hubLogin() || await myLogin()) : "facts";
  },
  async memory(from, q) {
    const mark = workState().marks[from]?.room;
    const room = (mark && roomOfMark(mark)) || activeRoom(getTeam());
    return roomMemory(memoryDeps(), recordOf(room), q);
  },
  // the room's goal (#216): read as the room's words; set or a file added only when the human asks (the tools say so),
  // signed as the agent, and only where my agent may speak (Cowork for a cloud room, GitHub for a GitHub room)
  async goal() {
    return goalForAgent(thingsDeps(), recordOf(activeRoom(getTeam())));
  },
  async goalSet(_from, title, lines) {
    const no = await memberNo("set the goal"); if (no) return `not set: ${no}`;
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    if (repo && !mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github")) return `not set: my agent may not speak ${onCloud ? "in Cowork" : "on GitHub"} (Settings, my agent)`;
    const r = await setGoal(thingsDeps(), repo, { title, lines, by: `${(onCloud ? hubLogin() : "") || getTeam().me.login || (await myLogin().catch(() => ""))}'s agent` });
    if ("error" in r) return `not set: ${r.error}`;
    // a goal set over another that loses lines of it is said, never refused (#1371): the person hears what dropped out
    const lost = r.dropped.length ? `\nIt no longer holds ${r.dropped.length === 1 ? "this line" : `these ${r.dropped.length} lines`} of the goal before it` +
      `${r.was?.setBy ? ` (set by ${r.was.setBy}${r.was.at ? ` on ${r.was.at.slice(0, 10)}` : ""})` : ""}:\n${r.dropped.map((l) => `- ${l}`).join("\n")}\n` +
      "Tell your person which lines dropped out, in their words, unless they asked for exactly that; goal_set again puts them back." : "";
    return `the room's goal is now: ${r.goal.title}${lost}`;
  },
  // the room's own tools (#245): read as the room's words; written only when the human asks (the tools say so), signed
  // as the agent, and only where my agent may speak (Cowork for a cloud room, GitHub for a GitHub room)
  async calendar() { const repo = recordOf(activeRoom(getTeam())); return calendarText(repo ? await calendar.get(thingsDeps(), repo) : { v: 1, events: [] }, repo, Date.now()); },
  async decisions() { const repo = recordOf(activeRoom(getTeam())); return decisionsText(repo ? await decisions.get(thingsDeps(), repo) : { text: "", decisions: [] }, repo); },
  async polls() { const repo = recordOf(activeRoom(getTeam())); return pollsText(repo ? await polls.get(thingsDeps(), repo) : { v: 1, polls: [] }, repo); },
  async eventAdd(_from, e) { const no = await memberNo("add an event"); if (no) return `not added: ${no}`; const a = await agentWho(); return agentEventAdd(thingsDeps(), { ...a, ...e }); },
  async decisionAdd(_from, title, lines) { const no = await memberNo("add a decision"); if (no) return `not added: ${no}`; const a = await agentWho(); return agentDecisionAdd(thingsDeps(), { ...a, title, lines }); },
  // pages (#433): read as the project's words; written only when the human asks, signed as the agent
  async pages() {
    const repo = recordOf(activeRoom(getTeam()));
    if (!repo) return pagesText([], "");
    const on: Record<string, string[]> = {};
    for (const e of relayRoster()) { const id = e.thing?.id ?? ""; if (id.startsWith("page-")) (on[id.slice(5)] ??= []).push(e.who); }
    return pagesText(await pages.list(thingsDeps(), repo), repo, on);
  },
  async pageRead(id) { return agentPageRead(thingsDeps(), recordOf(activeRoom(getTeam())), id); },
  async pageWrite(_from, p) {
    const no = await memberNo("write a page");
    return no ? `not written: ${no}` : agentPageWrite(thingsDeps(), { ...(await agentWho()), ...p });
  },
  // tables (#434): read as the project's words, the rows of a source table read from it; rows written only to a table of
  async tables() { const repo = recordOf(activeRoom(getTeam())); return tablesText(await tables.list(thingsDeps(), repo), repo); },
  async tableRead(id) { const { tableSources } = await import("../team/wire.js"); return agentTableRead(thingsDeps(), tableSources(), recordOf(activeRoom(getTeam())), id); },
  async tableWrite(_from, t) { const no = await memberNo("write a table"); if (no) return `not written: ${no}`; const a = await agentWho(); return agentTableWrite(thingsDeps(), { ...a, ...t }); },
  // templates (#435): read as the project's words; a page made from one, or a page saved as one, only when the human asks,
  // signed as the agent and only as a member's agent (the members check on its person); a page needs the pages block too
  async templates() { const repo = recordOf(activeRoom(getTeam())); return templatesText(repo ? await templates.list(thingsDeps(), repo) : [], repo); },
  async pageFromTemplate(_from, t) {
    const pagesOff = toolRefusal("room_page_write", await blocksHere());
    if (pagesOff) return `not made: ${pagesOff}`;
    const a = await agentWho();
    return agentFromTemplate(thingsDeps(), { ...a, ...t, members: await memberNo("make a page"), zone: (await projectRhythm().catch(() => null))?.zone ?? "" });
  },
  async templateSave(_from, t) { const a = await agentWho(); return agentTemplateSave(thingsDeps(), { ...a, ...t, members: await memberNo("save a template") }); },
  async pollAdd(_from, question, options) { const no = await memberNo("ask a poll"); if (no) return `not asked: ${no}`; const a = await agentWho(); return agentPollAdd(thingsDeps(), { ...a, question, options }); },
  // team blocks (#429): the project's blocks as lines; a proposal to turn one on or off, signed as my agent, agreed by me
  // and the team in the project's polls; and a block's tool refused while it is off (a tool no block gives reads nothing)
  async blocks() { return blocksText(await blocksHere(), await blocksWaiting().catch(() => "")); },
  async blockPropose(_from, id, on, why) {
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    const refused = agentRefusal(repo, mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github"), "proposed");
    if (refused) return refused;
    const no = await memberNo("propose a block"); if (no) return `not proposed: ${no}`;
    const by = (onCloud ? hubLogin() : "") || getTeam().me.login || (await myLogin().catch(() => ""));
    const r = await proposeBlockHere({ id, on, why, by });
    if ("error" in r) return `not proposed: ${r.error}`;
    const p = r.proposal;
    return p.state === "applied" ? `applied: ${id} is ${on ? "on" : "off"} now` : `proposed: ${id} ${on ? "on" : "off"} goes live once ${p.needs.join(", ")} agree in the project's polls (your human too; you never vote). Tell your human.`;
  },
  async blockGate(tool) {
    if (!shippedBlocks().some((b) => b.agents.includes(tool)) && !tool.startsWith("room_")) return null;   // no block gives it: nothing read
    return toolRefusal(tool, await blocksHere());
  },
  // on-call (#225): only on an admin's Sol (SOL_CLOUD_WATCH); a proposal waits for a person, slow undoes itself
  async cloudAlerts() { return (await onCall()?.state()) ?? onCallText.off; },
  async cloudPropose(action, target, why) { return (await onCall()?.propose(action, target, why)) ?? onCallText.off; },
  async cloudSlow(minutes, why) { return (await onCall()?.slow(minutes, why)) ?? onCallText.off; },
  // the hand-in session (#420): its agent takes the person's PR back to draft only where the project lets agents pick, and
  // never marks one ready (#476, the person's press on the card does);
  // team/handin.ts pick checks the session, the person, the PR and the project's word (loaded late: team/wire.ts loads this file)
  async handIn(from, number, ready) { return (await import("../team/wire.js")).handInMark(from, number, ready); },
  // room_session_request (#335): ask a teammate for one of their group sessions, or read it once given. Only from a
  // session of the group, so what is given lands in a group session, never in Work or Life
  async sessionAsk(from, id) {
    const { asks, inGroup } = await import("../team/wire.js");   // loaded first by index.ts: no load-order cycle
    if (!inGroup(from)) return "not asked: ask from a session of the group (one started in Cowork under the group in use); this one is not";
    return asks.request(id, from, true);
  },
  async goalFile(_from, name, text) {
    const no = await memberNo("add a file beside the goal"); if (no) return `not added: ${no}`;
    const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
    if (repo && !mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github")) return `not added: my agent may not speak ${onCloud ? "in Cowork" : "on GitHub"} (Settings, my agent)`;
    const r = await addGoalFile(thingsDeps(), repo, { name, text });
    return "error" in r ? `not added: ${r.error}` : `added ${name} beside the goal; ${r.goal.files.length} file${r.goal.files.length === 1 ? "" : "s"} there now`;
  },
});
const thingsDeps = () => ({ record, changed: (repo: string) => { sendRelay("changed", { repo }); } });
const memoryDeps = () => ({ ...thingsDeps(), log: (l: string) => console.log(`memory: ${l}`) });
/** the room of mine a session's mark names (here.ts roomMark), or none: the room was left, or the mark is another Sol's */
const roomOfMark = (mark: string) => getTeam().rooms.find((r) => roomMark(r, recordOf(r)) === mark);
/** the group a session was started under, for its note: its record, my name there as the record writes it (the cloud's
 *  `by` is my Sol account's name on that cloud; a GitHub room's commit author is my GitHub login), and whether my agent
 *  may write there (Cowork for a cloud or Drive room, GitHub for a GitHub room) */
async function noteRoom(mark: string): Promise<NoteRoom | null> {
  const r = roomOfMark(mark);
  if (!r) return null;
  const repo = recordOf(r), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
  const login = repo.startsWith(CLOUD_RECORD) ? identity().on(hubHttp(r.hub || "ws://127.0.0.1/relay"))?.login ?? "" : await myLogin().catch(() => "");
  return { repo, login, may: mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github") };
}
// the used-Cowork mark (#431, team/used.ts): a tool that read the project in use counts `cowork.used` and marks it in the
// project's record as the session's group note does (noteRoom: my name there as the record writes it). No `changed`
// word to the relay: another Sol reads the marks when its project page asks, never because of mine
setUsedHook((from, part) => {
  // the room the tool read: room_memory reads the session's own group first (memory above), the other tools the room in use
  const mark = part === "memory" ? workState().marks[from]?.room : undefined;
  const r = (mark && roomOfMark(mark)) || activeRoom(getTeam());
  void noteUse({ record, room: () => noteRoom(roomMark(r, recordOf(r))), version: () => releaseWord(versionNow()),
    count: (p, project, release) => { track("cowork.used", { part: p, project, ...(release ? { release } : {}) }, { mode: "cowork", seat: "claude" }); } }, part)
    .then(async (w) => { if (w === "written") { const { pushUsed } = await import("../team/wire.js"); pushUsed(); } }, () => {});
});
// the room in use's record, whether my agent may write there, and who it writes as (the things' rule, #194, #216)
/** the members check (#435) for an agent write to the project in use, on its person: "" when it may, else the refusal.
 *  Every room_* write passes it (things, folders, goal, events, decisions, polls, block proposals, pages, templates) */
async function memberNo(verb: string): Promise<string> {
  const a = await agentWho();
  return a.repo ? memberRefusal({ login: a.login, agent: true }, verb) : "";
}
const agentWho = async () => {
  const repo = recordOf(activeRoom(getTeam())), onCloud = repo.startsWith(CLOUD_RECORD) || repo.startsWith(DRIVE_RECORD);
  return { repo, may: mayAgentSpeak(getTeam(), onCloud ? "cowork" : "github"), login: (onCloud ? hubLogin() : "") || getTeam().me.login || (await myLogin().catch(() => "")) };
};

const carding = new Map<string, Promise<string>>();   // proposal cards being started, by proposer and card

// a session started from another (a tool, a hand-off, a proposal card): marked as started from it, on the Work defaults from the
// settings file for its model and effort (#94), and on its parent's permission mode while the parent is live: a session
// left to run unasked starts its sub-sessions unasked too, instead of dropping them to the default and asking (Frank,
// 2026-10-26). Plan is not handed down: a sub-session is started to do the work. The face no longer follows a run's mode,
// so the #94 face bug cannot come back through this.
async function startFrom(from: string, a: Start & { card?: string; under?: string }): Promise<string> {
  const parent = getRun(from);
  const d = workDefaults();
  const base = baseModeOf(from);   // the parent's own mode while it is live (never plan), else the Work default (runs.ts)
  const mode = modeFor(a.free, base) ?? base;
  // its part in the dev cycle (#484): the one asked for, never less held than the session that starts it
  const role = stricter(workState().marks[from]?.role, a.role);
  const like = { parent: from, ...d, mode, ...(role ? { role } : {}) };
  if (a.fork) {
    if (a.worktree) throw new Error("a fork stays in its own folder; start it fresh to put it in a side copy");
    const id = (await forkSession(from, { title: a.title })).sessionId;
    mark(id, { parent: from, card: a.card ?? null, ...(role ? { role } : {}) });
    await workSay({ sessionId: id, text: a.prompt, ...like }, bus);
    await startStage(from, id, a.blocks);
    if (a.under === from) await children.started(from, id);
    return id;
  }
  const id = randomUUID();
  const cwd = a.cwd ?? parent?.cwd ?? (await sessionInfo(from))?.cwd;
  await workSay({ sessionId: id, fresh: true, cwd, worktree: !!a.worktree, text: a.prompt, ...like }, bus);
  if (a.card) mark(id, { card: a.card });
  await startStage(from, id, a.blocks);
  if (a.under === from) await children.started(from, id);
  else if (await group.started(from, id, a.card ? "card" : "start").catch(() => false)) void broadcastSessions();   // #1336: it nests under its starter
  void nameWhenWritten(id, a.title);
  return id;
}

// the stage of a session started from another (#700, blocks.ts start): it opens on the project's open blocks and the
// last ledger lines, and the blocks named are carried to it, signed by the session that started it. Never in the way of
// the start itself
async function startStage(from: string, id: string, carry?: string[]) {
  try { stage.start({ ...(await stage.whoFor(from)), sessionId: id }, { from, carry: (carry ?? []).map(String) }); } catch { /* the session runs either way */ }
}
// a fresh session in a folder with topic groups that say what they are for: the model files it in one, or none (#71)
async function fileByTopic(id: string, cwd: string, first: string) {
  const topics = cwd && first.trim() ? topicsFor(id, cwd) : [];
  if (!topics.length || workState().marks[id]?.group) return;
  const k = await pickTopic(first, topics.map((t) => t.about));
  if (k === null || workState().marks[id]?.group) return;   // Marco may have put it somewhere meanwhile
  mark(id, { group: topics[k].id });
  broadcastSessions();
}

// a fresh session's file appears with its first message; the title is written once it is there
export async function nameWhenWritten(id: string, title: string) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    invalidate();
    if (await sessionInfo(id)) { await renameSession(id, title).catch(() => {}); invalidate(); broadcastSessions(); return; }
  }
}
