// The team wire (Together, PROTOCOL.md round 17 and on): the face's team.* messages, one switch, and what goes back to
// every Cowork face. See owns this file; every later slice adds its own cases in its own block, marked `// --- <slice>`.
//
// A face is a Cowork face once it says team.hello; only those are sent team.state, team.board and team.changed.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTeam, patchTeam, forFace, onTeam, fillMe, roomKey, activeRoom, recordOf, sharedHub, hubKey, isCloud, connectedRepos, ROOMS_DIR, type TeamSettings, type Room } from "./settings.js";
import { answeringWhy } from "./reach.js";
import { findRecords } from "./findrecord.js";   // the record GitHub names (#510)
import { getThings, changeThings, forgetThings, onThings, onAgain, thingsMsg, recordBranch, folderId, THINGS_PATH, serialize as serializeThings, type ThingsDeps, type Op as ThingsOp } from "./things.js";   // the room's things (#194)
import { readGoal, readGoalFile, setGoal, addGoalFile, goalMsg, goalHead, goalSnapshot, GOAL_PATH } from "./goal.js";
import { movedOf, movedForFace, cloudMovedOf, followMove, type AwayDeps } from "./moved.js";   // where a room went (#246, #326)
import { usageOf, takeRoom, type TakeDeps } from "./take.js";   // the quota and the move to GitHub (#326)
import { planStart, firstTurn } from "./start.js";   // the box (#234)   // the room's goal (#216)
import { memoryForStart } from "./memory.js";   // a group's memory (#316)
import { Feed, feedOf, pageOf, rosterLines, forYouOf, type FeedLine } from "./feed.js";   // what happened, for you (#232)
import { eventLine, sameAs, pollKey, pollEvents, myPolls, connectEvents, gitWith, SECRET_NAME, POLL_BACK, type EventsDeps, type Key } from "./updates.js";   // build updates (#328)
import { readPings } from "./pings.js";
import { accounts, signinCommand, githubAccount, githubIn, noteGithub, onGithub } from "./control.js";
import { startConnect, cancelConnect, onConnect } from "./gh.js";   // GitHub from a card (#174)
import { update, offerNow, offerShown, shipNow, answered, BRANCH, pinChanged, channelState } from "./ship.js";
import { windowOld, lookAgain, OLD_WINDOW_UPDATE } from "./window.js";   // a Sol.app older than BR1 (ticket K, #1824)
import { countMsg } from "./runs.js";   // who has the release (#1150)
import { startCarry, carryNow, msgOf as carryMsg, check as carryCheck, useIt as carryUse, setAside, stay as carryStay, asides, bringBack, carryOver } from "./carry.js";   // carrying own changes over (#425)
import { startPin, view as pinView, pinHere, unpin, plan as pinPlan, goBack as pinBack, wentBack } from "./pin.js";   // pin and go back (#426)
import { convertCtx } from "../convert/start.js";
import { STEPS } from "../convert/steps.js";
import { busyIn } from "../busy.js";
import { getBoard, peekBoard, onBoard, member, forgetOwners, boardReason, boardWanted, type Board } from "./board.js";
import { routeIssues } from "./leads.js";   // #118: routing on label
import { pressLeads, candidates } from "./press.js";   // the owner's press (#117)
import { relayPollers, sayPresence } from "./relay.js";   // build updates (#328): who polls what, my polls said again
import { setTalkSince, onRelay, sendRelay, relayRoster, relayUp, relayHub, onRelayStatus, restartRelay, setPresence, setInside, setGithub, startRelayClient, hubTicket, hubLogin, onCloud, hubHttp, safeForToken, driveHub, grantDeps, DRIVE_FILE, cloudRoom, onCloudWrite, type RelayMsg } from "./relay.js";
import * as grant from "./grant.js";   // a provider connected to this Sol (#1230)
import { DRIVE, driveForFace } from "./drive.js";   // a Drive room (#152), the first row
import { driveMembers, driveFolderWritable, folderOfRecord } from "./record/drive.js";
import { here, onHereChanged, roomSessions, belongs, roomMark, FocusOrder } from "./here.js";   // who is in which thing (#230)
import { identity } from "../seams/identity.js";   // sign-in and the Sol ID (#1320)
import { groupChat } from "../seams/chat.js";   // group chat (#1320)
import { wakeUp } from "../seams/wake.js";   // waking a teammate's Sol (#1320)
import { teamMembers, refreshMembers, strictMembers, onMembers } from "./members.js";   // #102: who is on the team
import { onTeamCheck, onTeamNow } from "./onteam.js";   // #1541: on the team is GitHub's member list, never a typed org
import { roomOfRepo, askableTable } from "./tablelevel.js";   // the table a hand belongs to (#1541)
import { onCreature } from "../creature.js";
import { mark, workState } from "../work/state.js";
import { allRuns } from "../work/runs.js";
import { workSessions } from "../work/sessions.js";
import { handleWork, nameWhenWritten, workBus, broadcastSessions } from "../work/wire.js";
import { solWindowOn } from "../creature.js";
import { heard as momentHeard } from "../notify.js";
import { tick as tonightTick, press as tonightPress, openNow as tonightOpen, keyOf as tonightKey, rhythmOf, forgetRhythms, backupsOf, type TonightDeps, type Verdict } from "./tonight.js";   // the review session (#416)
import { pressCheckpoint, checkpointKey, localDay } from "./checkpoint.js";   // Scoped and Approve (#482)
import { sentBackTick } from "./sentback.js";   // the slight send back's re-check (#421)
import { thisBroke } from "./broke.js";   // "this broke" (#421)
import { tick as handInTick, openHandInNow, pick as handInPick, type HandInDeps } from "./handin.js";   // the hand-in session (#420)
import { scan as handInScan, bring as handInBring, cardKeyOf as handInCardKey, mergePress as handInMerge, openedInFiles, type CardDeps } from "./handin.js";   // the hand-in card (#476), the box's merge (#579)
import { transcriptFiles } from "../work/sessions.js";
import { execFile } from "node:child_process";
import { timelineNow, releasesNow, keepTimelineIn, type TimelineDeps } from "./timeline.js";   // the timeline (#424)
import { typed, history, threadsWithLines, onTalkLine, hearRelay, watchBridges, threadOf, hearHistory, saidOf, readTalkFile, olderLines, setAttachDeps, talkSince, sweepCache, setChatLogins, setAskAgent, type AttachDeps, type OlderDeps } from "./talk.js";   // Talk (#37); kept on the cloud, attachments (#315)
import { talkFileOf } from "../hub/index.js";
// --- Cowork v3 (fr-30): one switch (settings.ts coworkV3). Every v3 file is loaded only with it on, by the first
// team.v3.* message it may answer (handleV3 below), never before; off, no v3 case answers and nothing of v3 loads (F7)
import { coworkV3, onCoworkV3 } from "../settings.js";
let v3mod: typeof import("./v3/index.js") | null = null;
/** what /health says of the v3 trail, or null while v3 is not loaded (the switch off: nothing) */
export const v3Health = (): { projects: number } | null => (v3mod ? v3mod.v3Health() : null);
// --- end Cowork v3
// --- Hand (#34)
import { startHand, heard, handNow, answerNow, handsNow, boardRead, gitCli, backNow } from "./hand.js";
import { myLogin } from "./settings.js";
import { getRun } from "../work/runs.js";
import { sessionItems, sessionInfo } from "../work/sessions.js";
// --- end Hand
import { startTry, stopTry, tryState, setTryBus, reviewTry, reviewItems, markReady, commentPr, okRepo, okPr } from "./try.js";
import { getShared, openShared, onShared, forgetShared } from "./share.js";
// --- Pings and felt or silent (#100)
import { pingOf, route, keepPing, absorbedLine, flipped, learnedLine, lastPing, kindOf, claimPing, auditTurnedDown, type Ping, type ClaimHit } from "./pings.js";
import { flipBody } from "./mark.js";
import { signature, mayAgentSpeak } from "./settings.js";
import { teamNote, runGit } from "./note.js";
import { record, runGh, runners, ghWithInput, makeGithubRecord, isGithubRecord, runGhStdin } from "./record.js";   // the room's record (#152)
import { moveRoom } from "./move.js";   // a GitHub room to the cloud (#216, C15)
import { STATE_DIR } from "../work/state.js";
import { startOnCall } from "./oncall.js";   // on-call (#225)
// Claims, live (#202): the harness posts a hit to POST /claim (index.ts); it becomes a claim ping to the holder through
// the same route and dials. Myself (another session of mine) hears it here, in my own spool; anyone else over the relay.
export function hearClaim(h: ClaimHit): boolean {
  const me = getTeam().me.login;
  const m = claimPing(h, me);
  if (!m) return false;
  if (m.to === me) { const c = heardPing(m); if (c) everyoneTeam(c); return true; }
  if (onCloud()) return false;   // #214: a hub login there is a Sol name, never the GitHub login a claim names
  return wakeUp().send(m, true);
}
// on-call (#225): an admin's Sol (SOL_CLOUD_WATCH set) pulls the cloud's alerts and hears each as a ping of kind alert,
// on the same path as any ping (kept for the agent, a card by the dial)
// started a tick after load: index.ts reads sol/engine/.env after the imports, and SOL_CLOUD_WATCH usually lives there
setTimeout(() => {
  if (!process.env.SOL_CLOUD_WATCH) return;
  const hub = () => process.env.SOL_CLOUD_WATCH_HUB || identity().accounts()[0]?.hub || "";
  startOnCall({ watch: process.env.SOL_CLOUD_WATCH, file: join(STATE_DIR, "oncall.json"), fetch: globalThis.fetch, now: Date.now,
    ticket: async () => { const h = hub(); return h ? identity().ticket(h) : ""; },
    // not through heardPing: that reads the relay, where a ping that says alert is a teammate's chat
    deliver: (p) => { keepPing(p); if (route("alert", getTeam().dials.alert).card) everyoneTeam({ type: "team.pinged", id: p.id, kind: p.kind, from: p.from, line: p.line, at: p.at }); } });
}, 0).unref?.();
// --- end Pings
import { shows, setShowBus, roomShowsWanted } from "./show.js";   // Show to team (#101)
import { Asks } from "./ask.js";   // ask for a session (#335)
import { onTurnEnd } from "../work/runs.js";
// --- Share code (#157)
import { shareRoom, joinRoom, peekRoom, makeRoom, shareOnArrival, shareAgain, forgetGone, roomPeople, type RoomsDeps } from "./rooms.js";
import type { Registry } from "../hub/index.js";
// --- end Share code
// --- Let in (#162)
import { askIn, cloneRoom, hearRoom, hearCloud, askCloud, askedNow, gitQuiet, remoteOf, roomFolders, letIn, waitingNow, groupClone, cloneAuth, type LetInDeps } from "./letin.js";
// --- end Let in
// --- File it (#119)
import { fileIt, takeShot, heldShot, drop as dropShot, healthLine } from "./file.js";
import { kernelNow, runThingTool } from "../kernel.js";   // file it as Sol's own block (step 7), once it is loaded
import { healthNow } from "../health.js";
// the room's own tools (ADDITIONS §1, #245): the calendar, the decision log, the polls, each a file in the room's record
import { calendar, upcoming, remindersDue, icsOf, type Calendar } from "./calendar.js";
import { decisions, type Log } from "./decisions.js";
import { polls, type Polls } from "./polls.js";
import { pages, pageTile, tilePage, type PageInfo } from "./pages.js";   // pages (#433, round 80): the `page` kind is defined there
import { tables, rowsOf, columnsOf, type TableInfo, type TableFile, type TableOp, type TableSources } from "./tables.js";   // tables (#434, round 82): the `table` kind is defined there
import { templates, saveAsTemplate, templateKinds, TEMPLATES_BLOCK } from "./templates.js";   // templates (#435, round 83): the `template` kind
import { agentsOf, useMembersRead, memberRefusal, type MembersRead } from "./agents.js";   // agents as members (#435)
import { shipped as shippedBlocks } from "./blocks.js";   // team blocks (#429): Sol's own, from the face's blocks.json
import { readUses } from "./used.js";   // who used what (#431, round 76)
import { landOwners } from "./codeowners.js";   // CODEOWNERS written from the project's owners (#438)
import { owners as projectOwners, project, propose as projectPropose, settle as projectSettle, withdraw as projectWithdraw, useProject, startOf as projectStart, viewOf as projectView, keepNight, rhythmIn, agentsIn, ownersIn, type ProjectFile } from "./project.js";   // project settings (#428)
import { onboarded, walkOf } from "./onboard.js";   // onboarding into a project, with skip (#430)
import { openTool } from "./teamtool.js";   // team tools (#436): the kind "tool"'s own fields, the members gate
import { useFolds } from "./folds.js";   // the first team tool, this week's folds (#436)
import { useAnalytics } from "./analytics.js";   // the second, the beta's counts from Sol's cloud (#437)
import { useTesters } from "./testers.js";   // the per-tester list for Isaac's console, from Sol's cloud (#1355)
import { useFeaturesTool, useArea, areaParagraph, devsIn } from "./area.js";   // the Features page and "your area", Sol developers only (#480)
import { setOpening } from "../work/opening.js";
import { useLive } from "./live.js";   // the live block (#485): the newest dev release, its morning run, error counts per feature
import { readFeatures } from "./featuremap.js";   // TO BE REPLACED by ./features.js (#480): the same name
import { DIGEST_TITLE } from "./tonight.js";
import { blockViewsIn } from "./project.js";
// --- end File it
// what a group is connected to, as one answer (#320): its repositories, things, tools, and Google and GitHub here
import { connectors, connectRepo, repoFacts, connectorsMsg, toolLines, memberCount, forgetCounts, pruneMine, mineAfter, adminsAfter, liveOf, type ConnectDeps, type ConnectorsFile } from "./connectors.js";
import { versionNow, refreshVersion, onVersion } from "../version.js";   // what this Sol runs (#417)
import { isQuiet } from "../quiet.js";

type Wire = { send: (m: object) => void };
const faces = new Map<Wire, { cowork: boolean }>();
/** to every Cowork face (one that said team.hello) */
export const everyoneTeam = (m: object) => { for (const [f, s] of faces) if (s.cowork) f.send(m); };

export function addTeamFace(w: Wire) { faces.set(w, { cowork: false }); }
export function removeTeamFace(w: Wire) { faces.delete(w); shows.unwatchFace(w); here.drop(w); sayInside(); }   // what it watched, let go (#223); the thing it had in front (#230)

const stateMsg = () => {
  const s = getTeam();
  // on the team (#1541): GitHub says this machine's own sign-in is in the team's own org; null until asked, then the state again
  const onTeam = onTeamNow();
  if (onTeam === null) void onTeamCheck().then(() => sendState());
  // on a cloud I signed in to, "me" is my Sol name there, the name the roster and every line I send carry (#216): never my
  // GitHub login beside it, which showed one person twice
  return { type: "team.state", me: onCloud(s) ? { ...s.me, login: hubLogin(s) } : s.me, settings: forFace(s), roster: relayRoster(), members: teamMembers(), agents: agentsOf(teamMembers(), relayRoster(), onCloud(s) ? hubLogin(s) : s.me.login), relay: { url: s.relay.url, up: relayUp() }, hub: sharedHub(), cloud: cloudNow(s), version: versionNow(), onTeam };   // version (#417): mine, for the strip when the relay is down
};
/** my Sol account on the shared hub (S6b, #226): its name there, "" when this Sol is not signed in; `need` when the room
 *  in use meets on Sol's cloud, nobody is signed in and the hub is not letting me in, so the face asks me to sign in;
 *  `gone` when the cloud said it has no room with the room's code (4404: a NucBox code the import never saw) */
export function cloudNow(s = getTeam(), up = relayUp()): { hub: string; login: string; need: boolean; gone: boolean } {
  const hub = sharedHub(), http = hubHttp(hub);
  const login = http.startsWith("https://") ? identity().on(http)?.login ?? "" : "";
  const room = activeRoom(s).hub;
  return { hub, login, need: isCloud(hub) && !login && !up && !!room && hubKey(room) === hubKey(hub), gone: relayHub().gone && isCloud(room) };
}
let pending: NodeJS.Timeout | undefined;
const sendState = () => { clearTimeout(pending); pending = setTimeout(() => everyoneTeam(stateMsg()), 100); };
onVersion(() => sendState());   // #417: my version changed: the faces hear it with the state

const boardMsg = (b: Awaited<ReturnType<typeof getBoard>>, folders: Record<string, string>, rid?: unknown) =>
  ({ type: "team.board", ...(rid ? { rid } : {}), repos: b.repos, cards: b.cards, prs: b.prs, branches: b.branches, stable: b.stable, main: b.main, leads: b.leads, owner: b.owner, at: b.at, folders, ...(b.error ? { error: b.error } : {}), ...(b.reason ? { reason: b.reason } : {}) });

// ---- which folder on this machine holds each team repo (Work's folders and this engine's own checkout; then a room's
// own clone, #162) ----
const HERE = dirname(fileURLToPath(import.meta.url));
const remotes = new Map<string, string>();   // folder -> "owner/name" ("" when it is not a GitHub repo)
/** the folders a person already works in that hold the wanted repos: Work's projects and this engine's own checkout */
async function workFolders(wanted: string[] = getTeam().repos): Promise<Record<string, string>> {
  const repos = new Set(wanted.map((r) => r.toLowerCase()));
  const { projects } = await workSessions().catch(() => ({ projects: [] as { path: string }[] }));
  const dirs = [resolve(HERE, "..", "..", "..", ".."), ...projects.map((p) => p.path)];   // .../sol/engine/dist/team -> the repo
  await Promise.all(dirs.filter((d) => !remotes.has(d)).map(async (d) => remotes.set(d, await remoteOf(d))));
  const out: Record<string, string> = {};
  for (const d of dirs) {
    const r = remotes.get(d) ?? "";
    const want = wanted.find((x) => x.toLowerCase() === r.toLowerCase());
    if (want && repos.has(r.toLowerCase()) && !(want in out) && !d.includes("/.claude/worktrees/")) out[want] = d;
  }
  for (const d of dirs) { const r = remotes.get(d) ?? ""; const want = wanted.find((x) => x.toLowerCase() === r.toLowerCase()); if (want && !(want in out)) out[want] = d; }
  return out;
}
export async function teamFolders(): Promise<Record<string, string>> {
  const out = await workFolders();
  // #162: a room's own folder, the clone Sol made, for a repo no folder above holds: it is on disk and its origin is the
  // room's repo (asked each time, never kept: a folder may be gone or moved since). The checkout a person works in wins
  const rooms = await roomFolders(getTeam().rooms, getTeam().repos.filter((r) => !(r in out)), { exists: existsSync, remote: remoteOf });
  return { ...out, ...rooms };
}

// --- Share (#36, PROTOCOL.md round 23): shared with me, sent again to every Cowork face whenever it is read anew
onShared((sh) => everyoneTeam({ type: "team.shared", repos: sh.repos, at: sh.at }));
// --- end Share

// ---- started once, when the engine listens (index.ts) ----
let started = false;
export function startTeam() {
  if (started) return;
  started = true;
  // fr-30: the trail's sync, from the start with the switch on, and from the moment it is turned on while the engine
  // runs; turned off, the sync stops
  let v3Started = false;
  const v3Start = () => {
    v3Started = true;
    void import("./v3/switchwire.js").then((x) => x.startV3Sync()).catch(() => {});
    // the ways' runner loop (#987), only with their own switch on too (SOL_COWORK_WAYS); a pull that brought events turns it soon
    void import("./v3/way-switch.js").then(async (sw) => {
      if (!sw.waysOn()) return;
      const x = await import("./v3/way-wire.js");
      x.startWays({ me: () => getTeam().me.login, push: everyoneTeam });
      (await import("./v3/switchwire.js")).onPulled(x.pokeWays);
    }).catch(() => {});
  };
  if (coworkV3()) v3Start();
  onCoworkV3((on) => { if (on) v3Start(); else if (v3Started) void import("./v3/switchwire.js").then((x) => x.stopV3Sync()).catch(() => {}); });
  startRelayClient();
  shareIfNew(null, getTeam());   // #157: a room in use on the shared hub that has no code yet
  void claimRooms();   // #162: a room coded before rooms[].mine, registered again once to see whether it is mine
  // #510: the record of each GitHub room GitHub has not named yet, asked now (a team.json from before) and whenever a
  // room is made or its repositories change (a face's edit, a join, a move); kept in team.json, so asked once
  void askRecords();
  onTeam(() => void askRecords());
  // #189's condition (#230): a turn's title goes to the room only when its session was started under that room
  onCreature((state, turn, cwd) => {
    if (turn?.kind === "work" && turn.title) titles.set(turn.sessionId, turn.title);
    setPresence(state, turn, cwd, belongs(turn ? workState().marks[turn.sessionId] : undefined, markNow()));
    sayInside();
  });
  onHereChanged(sayInside);
  // the relay went down (#238): what the next hub keeps is not known until its hello, so my room shows stop now
  onRelayStatus(() => { if (!relayUp()) sayInside(); });
  // a run that ended leaves my room sessions; the clock ends a thing (here.ts): looked at again every 15 s as well
  setInterval(sayInside, 15_000).unref();
  // the roster changed: who is in each thing changed with it, so the faces get the things again (the cached list)
  // (a second at most: someone moving between things quickly is one push, not one each)
  onRelayStatus(() => { const k = JSON.stringify(relayRoster().map((e) => [e.who, e.thing?.id ?? ""])); if (k !== lastIn) { lastIn = k; clearTimeout(pushIn); pushIn = setTimeout(() => void pushThingsCached(), 1000); pushIn.unref?.(); } });
  onRelayStatus(sendState);
  // #162: each time the relay comes up, the rooms coded before rooms[].mine that were not registered again yet are (a
  // hub that did not answer at start), then the room in use asks to be let into what I cannot write to yet
  let wasUp = false;
  onRelayStatus(() => { const up = relayUp(); if (up && !wasUp) void claimRooms().then(() => { if (!onCloud()) return askIn(letInDeps()); }).catch(() => {}); wasUp = up; });
  // and every ten minutes while it stays up, so an ask that was lost is asked again (askIn skips what is not due)
  setInterval(() => { if (relayUp() && !onCloud()) void askIn(letInDeps()).catch(() => {}); }, 10 * 60_000).unref();
  onTeam(sendState);
  onTeam(() => sayInside());   // #335: "give my past group sessions" turned never is on my roster entry at once
  onRelay("changed", (m) => {
    if (m.leads) forgetOwners(typeof m.repo === "string" ? m.repo : undefined);
    connectors.forget();   // #320: a cloud group's board reads what its connectors.json lists now
    void getBoard(true).catch(() => {});
    // #194: another Sol wrote the room's things (or anything else in the record repo): read the list anew for the faces
    const repo = recordOf(activeRoom(getTeam()));
    if (repo && (typeof m.repo !== "string" || m.repo.toLowerCase() === repo.toLowerCase())) {
      forgetThings(); forgetTools(); settleSoon(repo);
      if ([...faces.values()].some((f) => f.cowork)) { void pushThings(repo).catch(() => {}); void pushTools(repo).catch(() => {}); void pages.list(thingsDeps(), repo, true).then((l) => everyoneTeam(pagesMsg(l, repo)), () => {}); void pushTemplates(repo).catch(() => {}); void tables.list(thingsDeps(), repo, true).then((l) => { everyoneTeam(tablesMsg(l, repo)); everyoneTeam({ type: "team.table.changed", repo, id: "" }); }, () => {}); pushConnectors(); }
      else if (activeRoom(getTeam()).provider === "cloud") void connectors.get(thingsDeps(), repo).then(pruneRepos, () => {});   // P2-5
    }
  });
  // a ping to me heard live; one kept by the hub while I was away comes in `spooled` below, not here
  wakeUp().heard((m) => { if (!m.spooled && m.to === hubLogin()) { const c = heardPing(m); if (c) everyoneTeam(c); } });
  // --- the spool (#102): pings kept while no Sol of mine was on come back at once; more than 3 are one card. Each goes
  // to my agent and through my dial first (#100), like a live one
  onRelay("spooled", (all) => { for (const p of missedPings(all.messages, hubLogin(), heardPing)) everyoneTeam(p); });
  onMembers(sendState);
  // --- end spool
  onBoard((b) => { if ([...faces.values()].some((f) => f.cowork)) void teamFolders().then((f) => everyoneTeam(boardMsg(b, f))); });
  // #320: my hello says whether GitHub is signed in here (a boolean, never a login); asked once now, then again every
  // five minutes, relay or not (review P2-10), so a sign-out in a terminal is heard too
  void githubAccount().then((a) => setGithub(a.in)).catch(() => {});
  setInterval(() => void githubAccount(true).catch(() => {}), 5 * 60_000).unref();
  // who is in the group changed (the roster's people, or the team's members): the tab's member count is counted again
  let people = "";
  onRelayStatus(() => { const k = relayRoster().map((e) => e.who.toLowerCase()).sort().join(","); if (k !== people) { people = k; forgetCounts(); pushConnectors(); } });
  onMembers(() => { forgetCounts(); pushConnectors(); });
  // the board re-reads every minute while someone looks at it
  setInterval(() => { if ([...faces.values()].some((f) => f.cowork)) void getBoard().catch(() => {}); }, 60_000).unref();
  // #328: the repositories the hub named me poller of, read every minute, face or not, their new lines told to the room
  setInterval(() => void pollNow().catch(() => {}), 60_000).unref();
}

// --- Talk (#37, PROTOCOL.md round 24): every new line (said here, heard on the relay, read from a bridge) to every
// Cowork face; a teammate's line is heard from the moment this module loads, like the other relay kinds
onTalkLine((l) => everyoneTeam({ type: "team.talk.line", ...l }));
groupChat().hear(hearRelay);
// the @ rule (#1417): a line may name the group's members; "@<login>'s agent" in a person's general line is an ask on
// reach (loaded as team.room loads it), so that agent alone reads it, on its person's usage
let reachNow: typeof import("./reach.js") | null = null;
void import("./reach.js").then((r) => { reachNow = r; }, () => {});
setChatLogins(() => teamMembers());
/** where an artifact on a chat line may point (#1417): the group in use's repositories, and this checkout's */
const chatRepos = () => [...new Set([...activeRoom(getTeam()).repos, ...getTeam().repos])];
setAskAgent((to, question, id) => reachNow?.askFromChat(to, question, id) ?? false);
// #315: the cloud's history of each thread on my hello, merged by id; attachments go to and come from the room's record
groupChat().heardBack(hearHistory);
const attachNow = (): AttachDeps => ({ record, repo: () => recordOf(activeRoom(getTeam())), branch: (repo) => recordBranch(thingsDeps(), repo), up: relayUp });
setAttachDeps(attachNow);
// a hello says the newest line each thread has here, so the cloud sends only newer ones (#315, the review's P2-12)
setTalkSince(talkSince);
// the copies made to open an attachment are gone a day after: at start, then once a day (the review's P2-11)
setTimeout(() => sweepCache(), 5_000).unref?.();
setInterval(() => sweepCache(), 86_400_000).unref();
/** where the room in use pages its older talk from: the group chat seam's word (#1320) */
const olderNow = (): OlderDeps => groupChat().older();
// --- end Talk

// --- Let in (#162): an ask in the room in use (I may be its maker), or an answer to me; live or kept by the hub
// not on a cloud (#214): there the asker's name is a Sol name, and a yes would give push to whoever holds that GitHub login.
// A cloud group's (#325) is its own path: the ask says the GitHub login, and only the maker's press lets anyone in
onRelay("room", (m) => {
  if (activeRoom(getTeam()).provider === "cloud") void hearCloud(letInDeps(), m).catch(() => {});
  else if (!onCloud()) void hearRoom(letInDeps(), m).catch(() => {});
});
// --- end Let in

// --- the spool (#102, PROTOCOL.md round 26)
const pingedMsg = (m: RelayMsg) => ({ type: "team.pinged", from: m.from, line: String(m.line ?? "").slice(0, 300), at: m.at, ...(m.spooled ? { spooled: true } : {}) });
/** the pings to me among what the hub kept: each one when 3 or fewer, else one card "while you were away: n pings".
 * `card` turns each into its card, or null when my dial keeps it from me (#100); every ping goes through it, so each
 * reaches my agent. Pure with the default */
export function missedPings(messages: unknown, me: string, card: (m: RelayMsg) => object | null = pingedMsg): object[] {
  const pings = (Array.isArray(messages) ? messages as RelayMsg[] : []).filter((m) => m?.kind === "ping" && !!me && m.to === me);
  const cards = pings.map((m) => card({ ...m, spooled: true })).filter((c): c is object => !!c);
  if (cards.length <= 3) return cards;
  const last = cards[cards.length - 1] as { from: unknown; at: unknown };
  return [{ type: "team.pinged", from: last.from, line: `while you were away: ${cards.length} pings`, at: last.at, spooled: true, count: cards.length }];
}
// --- end spool

const RID = (v: unknown) => (typeof v === "string" || typeof v === "number" ? v : undefined);

// What a change of room (or of what the room in use is) does on this engine (#154, #157): the relay meets the new
// place (another hub, key, org, or room on the hub: the hello names the room's code), a new org's members are read at
// once, and other repos are another board and other shared things, read anew
function afterRoomChange(before: TeamSettings, after: TeamSettings) {
  if (activeRoom(after).id !== activeRoom(before).id) { here.clear(); sayInside(); feed.forget(); feed.live.clear(); feed.updates.clear(); lastRoster = []; seeding = true; }   // #230, #232: nothing I was in, nothing live, is the new room's (#328: nor its build updates)
  if (after.relay.url !== before.relay.url || after.relay.key !== before.relay.key || roomKey(after) !== roomKey(before)
    || after.org !== before.org || activeRoom(after).code !== activeRoom(before).code) { sayInside(); restartRelay(); }   // #238: room shows of the room before stop before the relay moves
  if (after.org !== before.org) void refreshMembers(true);   // #102
  if (after.repos.join(",") !== before.repos.join(",") || recordOf(activeRoom(after)) !== recordOf(activeRoom(before))) forgetTools();
  if (after.repos.join(",") !== before.repos.join(",")) { forgetShared(); forgetThings(); feed.forget(); void getShared(true).catch(() => {}); void getBoard(true).catch(() => {}); }
  if (activeRoom(after).repos.join(",") !== activeRoom(before).repos.join(",")) sayPresence();   // #328: the repositories I may poll
}

// The record's lookup (#510, findrecord.ts): one at a time; a change that came while one ran is asked after it
let asking: Promise<void> | null = null, askAgain = false;
function askRecords(): Promise<void> {
  if (process.env.SOL_TEAM_OFFLINE) return Promise.resolve();
  if (asking) { askAgain = true; return asking; }
  asking = (async () => {
    do {
      askAgain = false;
      const rooms = await findRecords(runGh, () => getTeam().rooms).catch(() => null);
      if (!rooms) continue;
      const before = getTeam(), after = patchTeam({ rooms });
      afterRoomChange(before, after);
    } while (askAgain);
  })().finally(() => { asking = null; });
  return asking;
}

// --- Share code (#157): this engine's own registry, when it is a hub (index.ts hands it in), and the deps of share and join
let local: Registry | null = null;
export const setRegistry = (r: Registry | null) => { local = r; };
const roomsDeps = (): RoomsDeps => ({ team: getTeam, patch: patchTeam, local, fetch: globalThis.fetch, token: () => identity().github(), ticket: hubTicket, record, clone: (id) => cloneRoom(letInDeps(), id), cloudAt: (hub) => !!identity().on(hub),
  driveCheck: async (folder) => {
    const why = await driveFolderWritable({ token: () => grant.token(DRIVE, grantDeps(DRIVE)), stale: () => grant.stale(DRIVE) }, folder);
    if (why) return why;
    // the maker writes the record's two files once, now, so the room's people later only update them and never race to
    // make them (the review of #152): an empty list of things and an empty goal, each only when not there
    const repo = `drive:${folder}`;
    for (const [path, text] of [[THINGS_PATH, serializeThings({ v: 1, things: [] })], [GOAL_PATH, ""]] as const) {
      const had = await record().files.readSha(repo, path, "main").then(() => true, (e) => (/\(HTTP 404\)\s*$/.test(String((e as { full?: string })?.full ?? (e as Error)?.message)) ? false : Promise.reject(e)));
      if (!had) await record().files.putBody(repo, path, { message: "room: made", branch: "main", content: Buffer.from(text).toString("base64") }).catch((e) => { if ((e as { status?: number }).status !== 409) throw e; });
    }
    return null;
  } });
// a room as a face may see it: its key said as "set" or ""
const roomForFace = <R extends { key: string }>(r: R) => ({ ...r, key: r.key ? "set" : "" });
// A room met as who I am on GitHub (gate "github": made on the shared hub with no key) has no key there, and an open hub
// opens only rooms with a code (round 35): such a room is registered the moment it is the room in use, so its hello
// names its code and the maker is let in before anyone presses "share". A room that cannot be registered stays as it
// is; "share" says why
function shareIfNew(before: TeamSettings | null, after: TeamSettings) {
  const id = shareOnArrival(before, after);
  if (!id) return;
  void shareRoom(roomsDeps(), id).then((a) => { if ("code" in a) afterRoomChange(after, getTeam()); }).catch(() => {});
}
// #162: every room that has a code, is not mine, was not joined by a code and has no org, registered again once an engine
// run: the hub gives the same code back only to its maker, so a room I shared before rooms[].mine becomes mine
const claimRooms = () => shareAgain(roomsDeps()).catch(() => []);
/** a GitHub room moved to the cloud I am signed in to (#216, move.ts): POST /cloud/move, bash sol/cloud/move */
export const moveNow = (id: unknown, as?: unknown) => moveRoom({ ...roomsDeps(), github: () => makeGithubRecord(runGh), files: record,
  dir: join(STATE_DIR, "cloud", "moves"), hub: sharedHub() }, id, as);
/** a table made by the person's AI on their word (gate one, #1676; table-tools.ts open_table): what the face's
 *  "start a table" asks (team.room.make with a code), the same change of room after it */
export async function makeTableNow(name: string): Promise<{ room: Room; warn?: string } | { error: string }> {
  const before = getTeam();
  const r = await makeRoom(roomsDeps(), { name, where: "cloud" });   // Sol's cloud, never the person's GitHub unasked (gate one q2)
  if (!("error" in r)) afterRoomChange(before, getTeam());
  return r;
}
// --- end Share code

/** my cloud groups' asks to be let in still out (#325, review P2-4), kept beside the engine's other state */
const ASKS_FILE = join(STATE_DIR, "cloud", "letin-asks.json");
// --- Let in (#162, PROTOCOL.md round 37): the friend's Sol asks the room to be let into its repository, the maker's
// answers; a receipt to every face says what came of it
const letInDeps = (): LetInDeps => ({
  team: getTeam, patch: patchTeam, record, send: sendRelay, git: gitQuiet, exists: existsSync, now: Date.now,
  say: (lines) => everyFace({ type: "creature.receipt", lines }),
  reread: () => { void getShared(true).catch(() => {}); void getBoard(true).catch(() => {}); },
  have: async (repo) => (await workFolders([repo]))[repo] ?? "",
  wait: (asks) => everyFace({ type: "team.letin", asks }),
  // #325: a cloud group's ask, the maker's press and the asker's taking in; my name there only when I am on its cloud
  cloud: {
    me: () => (onCloud() ? hubLogin() : ""),
    file: (room) => connectors.get(thingsDeps(), recordOf(room), true),
    change: (room, op) => connectors.change(thingsDeps(), recordOf(room), op),
    github: () => githubAccount(),
    members: async (room) => { const m = await cloudMembers(room.code); return m ? { logins: m.logins, maker: m.maker } : null; },
    take: async (room, repo) => { const r = await connectMine(room, repo); return "error" in r ? r.error : ""; },
    facts: (repo) => repoFacts(runGh, repo),
    prove: (text) => record().who.prove(text),
    unprove: (id) => record().who.unprove(id),
    proofOf: (id) => record().who.proofOf(id),
    // review P2-4: my asks out survive a restart, in the state folder, mine alone to read
    store: { load: () => { try { return readFileSync(ASKS_FILE, "utf8"); } catch { return ""; } },
      save: (text) => { mkdirSync(dirname(ASKS_FILE), { recursive: true, mode: 0o700 }); writeFileSync(`${ASKS_FILE}.tmp`, text, { mode: 0o600 }); renameSync(`${ASKS_FILE}.tmp`, ASKS_FILE); } },
    changed: pushConnectors,
    log: (line) => console.log(line),
  },
});
// --- end Let in

// --- The quota and the move to GitHub (#326, PROTOCOL.md round 58): how full a cloud group is, the maker's move of its
// files to a private repository of theirs, and a member's press on "join it". My name on a group's hub is my account's
// there, the name the cloud knows its maker by
const nameOn = (r: Room) => identity().on(hubHttp(r.hub))?.login ?? "";
const usageDeps = () => ({ team: getTeam, cloud: cloudRoom, me: nameOn });
const ghLogin = () => record().who.login();
const takeDeps = (): TakeDeps => ({ ...usageDeps(), patch: patchTeam, files: record, git: gitQuiet, cloneArgs: cloneAuth, dir: join(STATE_DIR, "cloud", "takes"), roomsDir: ROOMS_DIR,
  github: { login: ghLogin, view: ghView, tree: (repo, sha) => runGh(["api", `repos/${repo}/git/trees/${sha}?recursive=1`]),
    create: async (repo, name) => { await runGh(["repo", "create", repo, "--private", "--add-readme", "--description", `a Sol room: ${name}`]); } } });
/** a repository of GitHub's, as `gh repo view` says it: null when GitHub has none of that name (or I cannot see it) */
const ghView = async (repo: string): Promise<{ private: boolean } | null> => {
  try { return { private: (await runGh(["repo", "view", repo, "--json", "isPrivate", "--jq", ".isPrivate"])).trim() === "true" }; }
  catch (e) { if (/could not resolve|not found|HTTP 404/i.test(String((e as { full?: string })?.full ?? (e as Error)?.message))) return null; throw e; }
};
const awayDeps = (): AwayDeps => ({ usage: cloudRoom.usage });
/** how full a group is, to every Cowork face (a write that answered `warn` or 423, a take that ended); once in three
 *  seconds a group at most, since a burst of writes is one change of the bar, and the last ask of a burst is sent when
 *  the three seconds end, so the bar never stays where the burst began */
const usageSaid = new Map<string, { t: NodeJS.Timeout; again: boolean }>();
function pushUsage(id: string) {
  const w = usageSaid.get(id);
  if (w) { w.again = true; return; }
  usageSaid.set(id, { again: false, t: setTimeout(() => { const x = usageSaid.get(id); usageSaid.delete(id); if (x?.again) pushUsage(id); }, 3000).unref() });
  void usageOf(usageDeps(), id).then((u) => { if (u && !("error" in u)) everyoneTeam({ type: "team.room.usage", ...u }); }).catch(() => {});
}
// a write refused while the group moves or after it moved (423): the move is read anew, and the faces get the things
// with the card at once, not in ten minutes
onCloudWrite((code, said) => {
  const r = getTeam().rooms.find((x) => x.provider === "cloud" && x.code === code);
  if (!r) return;
  pushUsage(r.id);
  if (said.status === 423) void cloudMovedOf(awayDeps(), recordOf(r), Date.now(), true).then((m) => { if (m && activeRoom(getTeam()).id === r.id) return pushThings(recordOf(r)); }).catch(() => {});
});
// --- end The quota

// --- Who is in which thing (#230): my thing and my room sessions in the room in use, said on the relay when they
// change; the face's focus and the agent's in_thing tell `here`, the runs and their marks say the sessions
const titles = new Map<string, string>();   // a room session's title, as its turns said it or as Work named it
let lastIn = "", inTimer: NodeJS.Timeout | undefined, pushIn: NodeJS.Timeout | undefined;
/** what a group session's first turn carries before the words (#234, #245, #316), as the room's content: the goal's
 *  snapshot, the newest five decisions, then the group's memory (the newest notes that fit in 8 KB); and the versions
 *  read, kept on the session (`goalv`, `memv`). Nothing that cannot be read stops a session */
async function roomContext(rec: string): Promise<{ text: string; goalv: string; memv: string }> {
  if (!rec) return { text: "", goalv: "", memv: "" };
  const goal = goalSnapshot(await readGoal(thingsDeps(), rec).catch(() => ({ title: "", lines: "", setBy: "", at: "", files: [] })));
  const dec = (await decisions.get(thingsDeps(), rec).catch(() => null))?.decisions.slice(-5).reverse() ?? [];
  const decLine = dec.length ? `What the room decided, newest first (the tool room_decisions reads them whole):\n${dec.map((d) => `- ${d.title}`).join("\n")}` : "";
  const mem = await memoryForStart({ ...thingsDeps(), log: (l: string) => console.log(`memory: ${l}`) }, rec).catch(() => ({ text: "", version: "" }));
  return { text: [[goal.text, decLine].filter(Boolean).join("\n"), mem.text].filter(Boolean).join("\n\n"), goalv: goal.version, memv: mem.version };
}
/** the mark of the room in use: what a session started under it carries (here.ts roomMark) */
const markNow = () => { const r = activeRoom(getTeam()); return roomMark(r, recordOf(r)); };
function sayInside() {
  const room = markNow(), marks = workState().marks, now = Date.now();
  const runs = allRuns();
  for (const id of titles.keys()) if (!runs.some((r) => r.id === id)) titles.delete(id);   // ended: forgotten
  // a room session with no title yet (a Take's, one never the busiest turn) is named by Work's own record, once
  for (const r of runs) if (marks[r.id]?.room === room && !titles.has(r.id)) { titles.set(r.id, ""); void sessionInfo(r.id).then((i) => { const t = String(i?.customTitle || i?.summary || ""); if (t && titles.get(r.id) === "") { titles.set(r.id, t.slice(0, 120)); sayInside(); } }).catch(() => {}); }
  const open = runs.map((r) => ({ id: r.id, room: marks[r.id]?.room, title: titles.get(r.id) ?? "", at: r.since }));
  const alive = (id: string) => allRuns().some((r) => r.id === id);
  const quiet = activeRoom(getTeam()).quiet === true;
  setInside({ thing: here.thing(now, alive), sessions: roomSessions(open, room), quiet, never: getTeam().leaves.give === "never" });
  showRoomSessions(open, room, quiet);
  clearTimeout(inTimer);
  const next = here.next(now);
  if (next !== null) { inTimer = setTimeout(sayInside, next - now + 50); inTimer.unref?.(); }
}
/** my room sessions streamed to the room in use (#238, the studio PRD §9.6): each running session started under it is
 *  shown while "show my room sessions" is on there; a session that ended, a room left, or the switch off stops it, and
 *  sayInside runs on each of those (a run's turn, the 15 s look, a room change before the relay moves) */
const seenAt = new Map<string, number>();   // when each room session was first seen here (its title's wait)
function showRoomSessions(open: { id: string; room?: string; title: string }[], room: string, quiet: boolean) {
  for (const id of seenAt.keys()) if (!open.some((o) => o.id === id)) seenAt.delete(id);
  // only a session started under the room by Cowork (marked cowork and the room's): never one of Work's or Life's.
  // And only on a hub that keeps a room show's lines to its watchers (it says rooms, or it is watch-only, as the cloud
  // is): a hub from before sends every show line to the whole room (the review of #238)
  const marks = workState().marks, hub = relayHub().info;
  const keeps = !!hub && (hub.rooms === true || hub.watch === true);
  const want = new Set(keeps ? roomShowsWanted(open.filter((o) => marks[o.id]?.mode === "cowork"), room, quiet) : []);
  for (const id of shows.roomShows()) if (!want.has(id)) void shows.stop(id).catch(() => {});
  for (const o of open) {
    if (!want.has(o.id) || shows.showing(o.id)) continue;
    // its name first: a session not named yet waits a little (Work names it within seconds), so the room sees its title
    if (!seenAt.has(o.id)) seenAt.set(o.id, Date.now());
    if (!o.title && Date.now() - seenAt.get(o.id)! < 15_000) continue;
    const run = getRun(o.id);
    if (run) void shows.startRoom(o.id, { cwd: run.cwd, title: o.title, items: run.items.list as never, ...(marks[o.id]?.thing ? { thing: marks[o.id].thing } : {}),
      still: () => markNow() === room && activeRoom(getTeam()).quiet !== true && workState().marks[o.id]?.room === room && workState().marks[o.id]?.mode === "cowork" && allRuns().some((r) => r.id === o.id) }).catch(() => {});
  }
}
// --- Ask for a session (#335, the Cowork PRD §9.8, PROTOCOL.md round 113): a teammate's agent asks for one of my group
// sessions (a card, give · not now), or my agent or I ask for one of theirs; team/ask.ts holds both ends
/** a session started under the group in use: marked cowork with the room's mark. Only such a session can be given, and
 *  only such a session of mine may ask, so what is given lands in a group session. Work and Life never */
export const inGroup = (id: string) => { const mk = workState().marks[id], room = markNow(); return mk?.mode === "cowork" && !!room && mk.room === room; };
export const asks = new Asks({
  send: (kind, m, agent) => sendRelay(kind, m, agent),
  tell: (m) => everyoneTeam(m),
  roster: () => relayRoster(),
  me: () => hubLogin(),
  setting: () => getTeam().leaves.give,
  mine: (id) => (workState().marks[id] || getRun(id) ? { title: titles.get(id) || "", group: inGroup(id) } : null),
  items: async (id) => (getRun(id)?.items.list ?? (await sessionItems(id)).list) as never,
  msgMax: () => relayHub().info?.msgMax ?? 0,
  now: () => Date.now(),
  every: (ms, fn) => { const t = setInterval(fn, ms); t.unref?.(); return () => clearInterval(t); },
  after: (ms, fn) => { const t = setTimeout(fn, ms); t.unref?.(); return () => clearTimeout(t); },
  home: homedir(),
});
onRelay("ask", (m) => asks.heardAsk(m));     // live, or kept by the hub while I was away (spooled)
onRelay("give", (m) => asks.heardGive(m));
onTurnEnd((id) => asks.turnEnded(id));       // what a turn read is let go when it ends
// --- end Ask for a session
const pushThingsCached = async () => {
  if (![...faces.values()].some((f) => f.cowork)) return;
  const repo = recordOf(activeRoom(getTeam()));
  if (!repo) return;
  const file = await getThings(thingsDeps(), repo).catch(() => null);
  if (file) everyoneTeam(thingsMsg(file, await getBoard().catch(() => null), repo, undefined, relayRoster()));
};
// --- end Who is in which thing

// --- What happened, and for you (#232): the room's feed read once a minute at most (feed.ts), its live lines from the
// relay pushed to every Cowork face as they come; for you is the hands to me and the pings that reached me
export const roomKeyNow = () => `${activeRoom(getTeam()).id} ${recordOf(activeRoom(getTeam()))}`;
export const feed = new Feed({
  // the board as last read, never a read of its own: the board's minute re-read runs while a Cowork face is open
  // (none read yet in a GitHub room: one read starts, the board's own, and the next ask has it)
  // a cloud group's connected repositories too (#320), read with my gh: getBoard says why not when GitHub is not here
  board: async () => {
    const r = activeRoom(getTeam());
    if (r.provider === "drive") return null;
    if (r.provider === "cloud") await boardReason().catch(() => undefined);   // its connectors.json read first
    if (!boardWanted()) return null;
    const b = peekBoard(); if (!b) void getBoard().catch(() => {}); return b;
  },
  notesRepo: () => { const r = recordOf(activeRoom(getTeam())); return isGithubRecord(r) ? r : ""; },
  recent: async (repo) => ((await record().notes.recent(repo, "created")) as any[]).map((c) => ({ repo, number: Number(String(c.issue_url ?? "").split("/").pop()), at: String(c.created_at ?? ""), author: String(c.user?.login ?? "") + (c.user?.type === "Bot" && !/\[bot\]$/.test(String(c.user?.login ?? "")) ? "[bot]" : ""), body: String(c.body ?? ""), url: String(c.html_url ?? "") })),
  things: async () => { const repo = recordOf(activeRoom(getTeam())); return repo ? getThings(thingsDeps(), repo) : null; },
  goal: async () => { const repo = recordOf(activeRoom(getTeam())); return repo ? goalHead(thingsDeps(), repo, await recordBranch(thingsDeps(), repo)) : null; },
  tools: async () => {
    const repo = recordOf(activeRoom(getTeam()));
    if (!repo) return null;
    const [c, d, p] = await Promise.all([calendar.get(thingsDeps(), repo).catch(() => null), decisions.get(thingsDeps(), repo).catch(() => null), polls.get(thingsDeps(), repo).catch(() => null)]);
    return { calendar: c, decisions: d, polls: p };
  },
});
const feedLine = (l: FeedLine | null) => { if (l) everyoneTeam({ type: "team.feed.line", line: l }); };
// the roster as last seen, for what changed in it. A roster after the relay came back (a reconnect, a start, a room
// switch) is only taken in: everyone already there did not just arrive
let lastRoster: { who: string }[] = [], seeding = true, wasRelayUp = false;
onRelayStatus(() => {
  const up = relayUp();
  if (!up) { wasRelayUp = false; return; }
  if (!wasRelayUp) { wasRelayUp = true; seeding = true; }
  const now = relayRoster();
  if (!now.length) return;   // up, but the hub has not answered with its roster yet
  if (seeding) { seeding = false; lastRoster = now; return; }
  for (const l of rosterLines(lastRoster as never, now, hubLogin() || getTeam().me.login, new Date().toISOString())) feedLine(feed.live.add(l));
  lastRoster = now;
});
// a talk line heard: once by its id (a line sent again is one line), cleaned, the first part of a long one only
groupChat().hear((m) => {
  if (m.spooled || (Array.isArray(m.part) && m.part[0] !== 1)) return;
  // an attachment is words to an agent, never bytes (#315): "[an image]", "[a file: <name>]"
  const text = saidOf(typeof m.text === "string" ? m.text.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "", talkFileOf(m.file));
  if (!text) return;
  feedLine(feed.live.add({ at: new Date(typeof m.at === "number" ? m.at : Date.now()).toISOString(), who: m.from.login, agent: m.from.agent, kind: "said", text: `said: ${text.slice(0, 100)}` }, typeof m.id === "string" && /^[\w-]{1,80}$/.test(m.id) ? `talk:${m.id}` : undefined));
});
// --- Build updates (#328, round 60): a cloud group's connected repositories, heard as `event` (the workflow's, or the
// poller's), and the cloud's last ones at each hello. A line the board here says already is not pushed again
onRelay("event", (m) => {
  if (activeRoom(getTeam()).provider !== "cloud") return;
  const l = eventLine(m);
  if (!l || !feed.updates.add(l)) return;
  const said = new Set(feedOf({ board: peekBoard() }).map(sameAs));
  if (!said.has(sameAs(l))) feedLine(l);
});
onRelay("events.recent", (m) => {
  if (activeRoom(getTeam()).provider !== "cloud") return;
  feed.updates.reset((Array.isArray(m.events) ? m.events : []).slice(-50).map((e: unknown) => eventLine(e)));
});
// the poll: what I already told the room (or the cloud told me), and since when, for the room in use
const polled = { room: "", since: 0, sent: new Set<string>(), drafts: new Map<string, boolean>() };
/** the board's new lines of the repositories the hub named me poller of (relay.ts relayPollers), as `event`s, at most
 *  twenty a minute; nothing when I poll none (another Sol does, or a workflow does) */
export async function pollNow() {
  const room = activeRoom(getTeam());
  if (room.provider !== "cloud" || !relayUp()) return;
  const repos = myPolls(room, relayPollers(), hubLogin());
  if (!repos.length) return;
  if (polled.room !== room.id) { polled.room = room.id; polled.since = Date.now() - POLL_BACK; polled.sent.clear(); polled.drafts.clear(); }
  for (const l of feed.updates.lines) { const k = pollKey(l); if (k) polled.sent.add(k); }
  const b = await getBoard();
  if (activeRoom(getTeam()).id !== room.id) return;
  for (const { key, ev } of pollEvents(b, repos, polled.sent, polled.since, polled.drafts)) if (sendRelay("event", { ...ev, source: "poll" })) polled.sent.add(key);
}
// team.connect.events: the cloud's keys route with my ticket there, gh for the secret, the group's clone for the file
async function eventKeys(room: Room, repo: string, remove: boolean): Promise<Key | { removed: boolean } | { error: string }> {
  const hub = hubHttp(room.hub);
  if (!/^https:\/\/|^http:\/\/127\.0\.0\.1(:\d+)?\//.test(hub) || !room.code) return { error: "sign in to Sol's cloud first" };
  const t = await hubTicket(hub).catch(() => "");
  if (!t) return { error: "sign in to Sol's cloud first" };
  if (isQuiet()) return { error: "this Sol is quiet (SOL_QUIET): it changes nothing on the cloud" };
  const base = `${hub.replace(/\/+$/, "")}/rooms/${room.code}/events/keys`;
  const r = await fetch(remove ? `${base}?repo=${encodeURIComponent(repo)}` : base, { method: remove ? "DELETE" : "POST", signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${t}`, ...(remove ? {} : { "content-type": "application/json" }) }, ...(remove ? {} : { body: JSON.stringify({ repo }) }) }).catch(() => null);
  const v = r ? await r.json().catch(() => null) as Record<string, unknown> | null : null;
  if (!r || !v) return { error: "Sol's cloud isn't reachable right now; try again in a moment" };
  if (!r.ok) return { error: typeof v.error === "string" ? v.error.slice(0, 200) : `Sol's cloud said ${r.status}` };
  if (remove) return { removed: v.removed === true };
  return typeof v.eid === "string" && typeof v.secret === "string" ? { eid: v.eid, secret: v.secret, ...(v.rotated === true ? { rotated: true } : {}) } : { error: "Sol's cloud gave no key; try again in a moment" };
}
const eventsDeps = (): EventsDeps => ({
  gh: runGh, github: () => githubAccount(), file: (room) => connectors.get(thingsDeps(), recordOf(room), true), keys: eventKeys, hub: (room) => hubHttp(room.hub),
  secret: (repo, v) => (v === null ? runGh(["secret", "delete", SECRET_NAME, "--repo", repo]) : runGhStdin(["secret", "set", SECRET_NAME, "--repo", repo], v)),
  folder: (room, repo) => groupClone(letInDeps(), room, repo), git: gitWith,
});
// --- end Build updates
// --- end What happened

// --- Things (#194, PROTOCOL.md round 39): the room's things, one file in its record repo; every change here and every
// read anew after the relay's `changed` goes to every Cowork face
const thingsDeps = (): ThingsDeps => ({ record, changed: (repo) => { sendRelay("changed", { repo }); } });
// a cloud group's move rides every push of its things (#326), from the ten-minute cache
const awayOf = async (repo: string) => { const movedAway = repo.startsWith("cloud:") ? await cloudMovedOf(awayDeps(), repo).catch(() => null) : null; return movedAway ? { movedAway } : {}; };
const pushThings = async (repo: string) => everyoneTeam({ ...thingsMsg(await getThings(thingsDeps(), repo, true), await getBoard().catch(() => null), repo, undefined, relayRoster()), ...(await awayOf(repo)) });
onThings((repo, file) => { void getBoard().catch(() => null).then((b) => everyoneTeam(thingsMsg(file, b, repo, undefined, relayRoster()))); pushConnectors(); });
const thingsError = (type: string, rid: unknown, error: string) => ({ type, rid, error });
// the same thing added again (ADDITIONS §5), by me or my agent: one live line here, the existing one opened (the face's
// answer has it; the agent's tool line names it)
// --- The room's own tools (#245, PROTOCOL.md round 49): the calendar, the decision log, the polls. Each change made
// here goes to every Cowork face of mine; another Sol's change comes as the relay's `changed` and is read anew
const calMsg = (f: Calendar, repo: string, rid?: unknown) => ({ type: "team.calendar" as const, ...(rid !== undefined ? { rid } : {}), repo, events: upcoming(f, Date.now() - 30 * 86_400_000, 300), ...(repo ? {} : { note: NO_RECORD_LINE }) });
const decMsg = (l: Log, repo: string, rid?: unknown) => ({ type: "team.decisions" as const, ...(rid !== undefined ? { rid } : {}), repo, decisions: [...l.decisions].reverse(), ...(repo ? {} : { note: NO_RECORD_LINE }) });
const pollMsg = (f: Polls, repo: string, rid?: unknown) => ({ type: "team.polls" as const, ...(rid !== undefined ? { rid } : {}), repo, polls: [...f.polls].reverse(), ...(repo ? {} : { note: NO_RECORD_LINE }) });
const NO_RECORD_LINE = "this room has no record yet";
/** the room's own tools as tiles (#245): a person on one of their pages stands on its tile, as on a thing's */
/** a page as a thing one can be on (#433): its tile id and title, or none when the project has no such page */
const pageAsThing = async (repo: string, id: string) => { const p = (await pages.list(thingsDeps(), repo).catch(() => [] as PageInfo[])).find((x) => x.id === id); return p ? { id: pageTile(p.id), name: p.title } : undefined; };
export const TOOL_TILES: Record<string, string> = Object.fromEntries(shippedBlocks().filter((b) => b.kind === "tool").map((b) => [`tool-${b.id}`, b.name]));   // from the blocks (#429)
const forgetTools = () => { calendar.forget(); decisions.forget(); polls.forget(); pages.forget(); tables.forget(); templates.forget(); connectors.forget(); project.forget(); forgetRhythms(); };
// pages (#433, round 80): the list after a change goes to every Cowork face of mine; another Sol's comes as `changed`
const pagesMsg = (list: PageInfo[], repo: string, rid?: unknown) => ({ type: "team.pages" as const, ...(rid !== undefined ? { rid } : {}), repo, pages: list, ...(repo ? {} : { note: NO_RECORD_LINE }) });
pages.on((repo, list, page) => { everyoneTeam(pagesMsg(list, repo)); if (page) everyoneTeam({ type: "team.page.changed", repo, page }); });
// tables (#434, round 82): the list after a change goes to every Cowork face of mine, with which table changed; another
// Sol's change comes as the relay's `changed`. A table's rows come from its source: kept (own), or read from the board,
// the feed or this Sol's sessions in the project, never kept
const tablesMsg = (list: TableInfo[], repo: string, rid?: unknown) => ({ type: "team.tables" as const, ...(rid !== undefined ? { rid } : {}), repo, tables: list, ...(repo ? {} : { note: NO_RECORD_LINE }) });
tables.on((repo, id) => { void tables.list(thingsDeps(), repo).then((l) => { everyoneTeam(tablesMsg(l, repo)); everyoneTeam({ type: "team.table.changed", repo, id }); }, () => {}); });
export const tableSources = (): TableSources => ({
  board: async () => { const b = await getBoard(); return { cards: b.cards, ...(b.reason ? { reason: b.reason } : {}) }; },
  feed: async () => { const r = await feed.lines(roomKeyNow()); return { lines: r.lines, ...(r.error ? { error: r.error } : {}) }; },
  sessions: async () => (await workSessions()).sessions,
  roomId: () => activeRoom(getTeam()).id,
});
/** a table as the face draws it: the file, its columns, and its rows read from its source */
const tableAnswer = async (repo: string, id: string, t: TableFile) => { const r = await rowsOf(t, tableSources()); return { repo, id, table: { ...t, columns: columnsOf(t), rows: undefined }, rows: r.rows, ...(r.note ? { note: r.note } : {}) }; };
// templates (#435, round 83): the same, as `team.templates`
const templatesMsg = (list: PageInfo[], repo: string, rid?: unknown) => ({ type: "team.templates" as const, ...(rid !== undefined ? { rid } : {}), repo, templates: list, ...(repo ? {} : { note: NO_RECORD_LINE }) });
// pushed to the faces only while the project's templates block is live (#435): with it off, nothing of the folder is read out
const templatesLive = async (repo: string) => { const f = await project.get(thingsDeps(), repo).catch(() => null); return !!f && !!blockViewsIn(f).find((b) => b.id === TEMPLATES_BLOCK)?.live; };
async function pushTemplates(repo: string) { if (await templatesLive(repo)) everyoneTeam(templatesMsg(await templates.list(thingsDeps(), repo, true), repo)); }
templates.on((repo, list) => { void templatesLive(repo).then((on) => { if (on) everyoneTeam(templatesMsg(list, repo)); }, () => {}); });
calendar.on((repo, f) => { everyoneTeam(calMsg(f, repo)); pushConnectors(); });
decisions.on((repo, l) => { everyoneTeam(decMsg(l, repo)); pushConnectors(); });
polls.on((repo, f) => { everyoneTeam(pollMsg(f, repo)); pushConnectors(); });
const pushTools = async (repo: string) => {
  const [c, d, p] = await Promise.all([calendar.get(thingsDeps(), repo, true).catch(() => null), decisions.get(thingsDeps(), repo, true).catch(() => null), polls.get(thingsDeps(), repo, true).catch(() => null)]);
  if (c) everyoneTeam(calMsg(c, repo)); if (d) everyoneTeam(decMsg(d, repo)); if (p) everyoneTeam(pollMsg(p, repo));
};
// a reminder of the room's calendar to my own person (ADDITIONS §1): a card through the pings, once an event; looked at
// every minute while the room in use has a record. A Sol not running reminds nobody
export const remindNow = async (now = Date.now()) => {
  const repo = recordOf(activeRoom(getTeam())), me = hubLogin() || getTeam().me.login;
  if (!repo || !me) return;
  const f = await calendar.get(thingsDeps(), repo).catch(() => null);
  if (!f) return;
  const room = activeRoom(getTeam()).name;
  for (const r of remindersDue(f, me, now)) {
    if (readPings().some((p) => p.id === r.id)) continue;
    const p: Ping = { id: r.id, kind: "chat", from: { login: r.event.by || "sol", agent: !!r.event.agent }, line: `${room} calendar, ${r.line}`, at: now };
    keepPing(p);
    if (route("chat", getTeam().dials.chat).card) everyoneTeam({ type: "team.pinged", id: p.id, kind: p.kind, from: p.from, line: p.line, at: p.at });
  }
};
setInterval(() => void remindNow().catch(() => {}), 60_000).unref();
// --- end The room's own tools

// --- Project settings (#428, PROTOCOL round 69): `.sol/project.json` in the project's record (project.ts). The page
// reads `team.project`; a change is `team.project.propose`, agreed in the project's polls; any vote heard here settles
// what is decided, and every Cowork face hears the page again. tonight.ts's rhythm loader reads the record first
const projectWhere = (repo?: string): { record: string; code: string } => {
  const s = getTeam(), want = repo?.toLowerCase();
  const room = !want ? activeRoom(s) : s.rooms.find((r) => recordOf(r).toLowerCase() === want || connectedRepos(r).some((x) => x.toLowerCase() === want));
  if (!room) return { record: "", code: "" };
  const code = want && connectedRepos(room).some((x) => x.toLowerCase() === want) ? repo! : connectedRepos(room)[0] ?? "";
  return { record: recordOf(room), code };
};
useProject({ things: () => thingsDeps(), where: projectWhere, gh: runGh });
const projectMsg = async (repo: string, rid?: unknown, file?: ProjectFile) => {
  const { code } = projectWhere();
  const [f, p, start] = await Promise.all([file ? Promise.resolve(file) : project.get(thingsDeps(), repo), polls.get(thingsDeps(), repo).catch(() => null), projectStart(code)]);
  if (repo === recordOf(activeRoom(getTeam()))) keepNight(f);   // the night job runs at the project's hour (nightfile.ts)
  return { type: "team.project" as const, ...(rid !== undefined ? { rid } : {}), ...projectView(f, start, p?.polls ?? [], repo, code) };
};
const pushProject = (repo: string, file?: ProjectFile) => {
  if (repo !== recordOf(activeRoom(getTeam())) || ![...faces.values()].some((f) => f.cowork)) return;
  void projectMsg(repo, undefined, file).then(everyoneTeam, () => {});
};
project.on((repo, f) => pushProject(repo, f));
// a vote (mine, or one the relay says another Sol wrote) may decide a proposal: settled here, once at a time a project
const settling = new Set<string>();
const settleSoon = (repo: string) => {
  if (!repo || settling.has(repo)) return;
  settling.add(repo);
  void projectSettle(thingsDeps(), repo).catch(() => []).then((done) => { if (!done.length) pushProject(repo); }).finally(() => settling.delete(repo));
};
polls.on((repo) => settleSoon(repo));
// #438: an owners change this Sol applied (a settle or a proposal written here) is written into each code repository's
// CODEOWNERS by one PR (codeowners.ts); the release runner folds it. Once a proposal here, by id
const ownersLanded = new Set<string>();
project.on((repo, f) => {
  const set = f.set.owners;
  if (!set || !f.owners || ownersLanded.has(set.proposal)) return;
  ownersLanded.add(set.proposal);
  const room = getTeam().rooms.find((r) => recordOf(r) === repo);
  for (const code of room ? connectedRepos(room).filter(okRepo) : [])
    void landOwners({ gh: runGh }, code, f.owners, { proposal: set.proposal, by: set.by }).then((r) => {
      if ("error" in r) console.error(`[sol] owners: CODEOWNERS of ${code} not written: ${r.error}`);
    }, () => {});
});
// --- end Project settings

// --- Team tools (#436): who the project's members are, for the members gate (teamtool.ts): a cloud group's as its cloud
// says them, a GitHub project's as its org's (members.ts, read at most every ten minutes). A project with neither, or a
// read that failed, has no members known, and every team tool in it stays shut
// strict (#437, a tool reading data that names people): a GitHub org's members a minute old at most and never the old list
// on a failed read (members.ts `strict`); a cloud group's are read fresh every time already, and none on a failure
async function projectMembers(room: Room, force: boolean, strict = false): Promise<string[] | null> {
  if (room.provider === "cloud") { const c = await cloudMembers(room.code); return c?.logins.length ? c.logins : null; }
  // members.ts reads the org in use (getTeam().org, the active room's): only that room's, asked while it still is
  if (room.provider === "github" && room.org && activeRoom(getTeam()).id === room.id && getTeam().org === room.org) {
    if (strict) return strictMembers();
    const l = await refreshMembers(force); return l.length ? l : null;
  }
  return null;
}
useFolds(async (key, refresh) => feed.lines(key, refresh));
// analytics (#437): Sol's cloud's track summary, with my ticket there (the cloud's own gate, SOL_TRACK_READERS), the
// versions placed on the timeline's releases. The cloud is the shared hub's, the one a tester's counts go to (track.ts)
const trackHub = () => { const hub = hubHttp(sharedHub()); return safeForToken(`${hub}/`) ? hub : ""; };
const trackTicket = async () => { const hub = trackHub(); return hub ? hubTicket(hub).catch(() => "") : ""; };
const trackSummary = async (t: string) => {
  const hub = trackHub();
  if (!hub || isQuiet()) return { status: 0, body: null };
  const r = await fetch(`${hub.replace(/\/+$/, "")}/track/summary`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  return r ? { status: r.status, body: await r.json().catch(() => null) } : { status: 0, body: null };
};
useAnalytics({ ticket: trackTicket, summary: trackSummary, releases: () => releasesNow(timelineDeps()) });
// the per-tester list (#1355, for Isaac's console, #134): the same cloud and ticket, its rows placed on the releases
const trackTesters = async (t: string) => {
  const hub = trackHub();
  if (!hub || isQuiet()) return { status: 0, body: null };
  const r = await fetch(`${hub.replace(/\/+$/, "")}/track/testers`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  return r ? { status: r.status, body: await r.json().catch(() => null) } : { status: 0, body: null };
};
useTesters({ ticket: trackTicket, testers: trackTesters, releases: () => releasesNow(timelineDeps()) });
// the live block (#485): the same cloud summary (its byError), the timeline's newest dev release, the newest morning run
// on Sol's own repository's open Night digest (read only), and the feature map of Sol's own checkout
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");   // engine/{src,dist}/team -> the repository's root
useLive({
  ticket: trackTicket, summary: trackSummary, releases: () => releasesNow(timelineDeps()),
  digest: async () => {
    const repo = await remoteOf(resolve(HERE, ".."));
    if (!repo) return [];
    const found = JSON.parse(await runGh(["issue", "list", "--repo", repo, "--state", "open", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title", "--limit", "5"]) || "[]") as { number: number; title?: string }[];
    const n = found.find((x) => String(x.title ?? "").trim() === DIGEST_TITLE)?.number;
    if (!n) return [];
    const v = JSON.parse(await runGh(["issue", "view", String(n), "--repo", repo, "--json", "comments"]) || "{}") as { comments?: { body?: string; createdAt?: string; url?: string; author?: { login?: string } }[] };
    return v.comments ?? [];
  },
  features: () => readFeatures(REPO_ROOT),
});
// the Features page (#480): the map of the checkout this engine runs from, the project's ownership table; and a lead's
// Work sessions open with their area's line, the people read from the project in use
useFeaturesTool({ owners: () => projectOwners() });
useArea({ me: () => hubLogin() || getTeam().me.login });
setOpening(areaParagraph);
// agents as members (#435): the members check reads the project in use's members as the strict gate does (#437): a cloud
// group's fresh, a GitHub org's a minute old at most, a failed read null (shut). A project with neither has no list: its
// record decides who may write
useMembersRead(async (strict): Promise<MembersRead> => {
  const room = activeRoom(getTeam());
  if (room.provider === "cloud") return { source: true, list: await projectMembers(room, false, strict) };
  if (room.provider === "github" && room.org) return { source: true, list: await projectMembers(room, false, strict) };
  return { source: false };
});
// --- end Team tools

// --- Onboarding (#430, PROTOCOL round 75): the walk through a project when someone joins (onboard.ts). What it says is
// the project's settings in force and its `onboarding` part (changed by proposal, as every setting); who walked it is
// `.sol/onboarded.json` in the record, each person writing their own row. Every Cowork face hears the walk again when
// either file changes, each for its own person
const walkMsg = async (repo: string, rid?: unknown, refresh = false) => {
  const d = thingsDeps(), me = hubLogin() || getTeam().me.login;
  const [f, o, start] = await Promise.all([project.get(d, repo, refresh), onboarded.get(d, repo, refresh), projectStart(projectWhere().code)]);
  return { type: "team.onboarding" as const, ...(rid !== undefined ? { rid } : {}), ...walkOf(f, { rhythm: rhythmIn(f, start), owners: ownersIn(f, start), agents: agentsIn(f) }, o, me, repo) };
};
const pushWalk = (repo: string) => {
  if (repo !== recordOf(activeRoom(getTeam())) || ![...faces.values()].some((f) => f.cowork)) return;
  void walkMsg(repo).then(everyoneTeam, () => {});
};
onboarded.on((repo) => pushWalk(repo));
project.on((repo) => pushWalk(repo));
// --- end Onboarding
// --- Who used what (#431, PROTOCOL round 76): the project's `.sol/used/` marks (used.ts), each person's newest use of each
// part over 30 days. Read when a page asks (a minute's cache: the strip and the project page ask together) and pushed
// after a mark of mine; never on another Sol's `changed`, so one read in a project does not make every Sol read
let usedSeen: { repo: string; at: number; msg: object } | null = null;
const usedMsg = async (fresh = false) => {
  const repo = recordOf(activeRoom(getTeam()));
  if (!repo) return { type: "team.used" as const, repo: "", people: {}, note: NO_RECORD_LINE };
  if (!fresh && usedSeen && usedSeen.repo === repo && Date.now() - usedSeen.at < 60_000) return usedSeen.msg;
  const r = await readUses(thingsDeps(), repo);
  const msg = { type: "team.used" as const, repo, people: r.people, ...(r.note ? { note: r.note } : {}) };
  usedSeen = { repo, at: Date.now(), msg };
  return msg;
};
export const pushUsed = () => {
  if (![...faces.values()].some((f) => f.cowork)) { usedSeen = null; return; }
  void usedMsg(true).then(everyoneTeam, () => {});
};
// --- end Who used what

// --- Connectors (#320, PROTOCOL.md round 55): what a group is connected to, as one answer. A cloud group may connect a
// GitHub repository (an admin of it, a private one); its board then reads it with each viewer's own gh. The answer is
// pushed again to every Cowork face whenever one of its parts changes: the things, a tool, connectors.json, Google or
// GitHub here, the record read anew after the relay's `changed`
const connectDeps = (id: string): ConnectDeps => ({ ...thingsDeps(), gh: runGh, github: () => githubIn(), who: () => hubLogin() || getTeam().me.login,
  mine: () => getTeam().rooms.find((r) => r.id === id)?.repos ?? [] });
/** my cloud group's repos that connectors.json no longer lists go (review P2-5): on every read of the file, so one taken
 *  off the group by anyone is never stuck as a target of mine */
function pruneRepos(file: ConnectorsFile | null) {
  const before = getTeam(), room = activeRoom(before);
  if (!file || room.provider !== "cloud" || file.newer) return;
  const kept = pruneMine(room.repos, file), admins = (room.admins ?? []).filter((x) => kept.some((y) => y.toLowerCase() === x.toLowerCase()));
  if (kept.join("\n") !== room.repos.join("\n")) afterRoomChange(before, patchTeam({ rooms: before.rooms.map((x) => (x.id === room.id ? { ...x, repos: kept, admins } : x)) }));
}
/** a cloud group's members as the cloud says them (GET <hub>/rooms/<code>/members, with my ticket there): how many,
 *  their Sol names, and its maker's (#325, the one an ask goes to when connectors.json's row names nobody in the
 *  group); null when it does not say */
async function cloudMembers(code: string): Promise<{ count: number; logins: string[]; maker: string } | null> {
  const v = await cloudGet(code, "members") as { members?: unknown; maker?: unknown } | null;
  const logins = Array.isArray(v?.members) ? v.members.flatMap((x) => (x && typeof x === "object" && typeof (x as { login?: unknown }).login === "string" ? [(x as { login: string }).login] : [])) : [];
  return v ? { count: Array.isArray(v.members) ? v.members.length : 0, logins, maker: typeof v.maker === "string" ? v.maker : "" } : null;
}
/** one GET of a cloud group's own routes (GET <hub>/rooms/<code>/<path>) with my ticket there: its JSON, or null when
 *  the group is not mine, the hub is not one I sign in to, or it does not answer */
async function cloudGet(code: string, path: string): Promise<unknown> {
  const room = getTeam().rooms.find((r) => r.provider === "cloud" && r.code === code);
  const hub = room ? hubHttp(room.hub) : "";
  if (!/^https:\/\/|^http:\/\/127\.0\.0\.1(:\d+)?\//.test(hub)) return null;
  const t = await hubTicket(hub).catch(() => "");
  if (!t || isQuiet()) return null;
  const r = await fetch(`${hub.replace(/\/+$/, "")}/rooms/${code}/${path}`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  return r?.ok ? await r.json().catch(() => null) : null;
}
// the repositories of a cloud group whose build-updates key is live (GET …/events/keys: repo and live only, never a
// secret), read once a minute at most, and again at once after this Sol adds or takes off a key
const liveRead = new Map<string, { repos: string[]; at: number }>();
async function liveKeys(room: Room): Promise<string[]> {
  if (room.provider !== "cloud" || !room.code) return [];
  const had = liveRead.get(room.code);
  if (had && Date.now() - had.at < 60_000) return had.repos;
  const v = await cloudGet(room.code, "events/keys") as { keys?: unknown } | null;
  const repos = liveOf(v);
  if (v) liveRead.set(room.code, { repos, at: Date.now() });
  return repos;
}
/** how many are in a cloud group; 0 when the cloud does not say */
const cloudCount = async (code: string) => (await cloudMembers(code))?.count ?? 0;
/** a repository the group lists made one of my targets (team.connect.repo's checks: GitHub here, my gh may push to it),
 *  written to team.json as it is at the moment of the write (review P2-4) */
async function connectMine(room: Room, repo: unknown, connecting = true) {
  const before = getTeam();
  const r = await connectRepo(connectDeps(room.id), room, repo, connecting);
  if ("error" in r) return r;
  const now = getTeam(), had = now.rooms.find((x) => x.id === room.id), next = had ? mineAfter(had.repos, r) : [];
  const admins = had ? adminsAfter(had.admins ?? [], next, r) : [];   // my gh's admin word, kept with the repos it checked
  if (had && (had.repos.join("\n") !== next.join("\n") || (had.admins ?? []).join("\n") !== admins.join("\n")))
    afterRoomChange(before, patchTeam({ rooms: now.rooms.map((x) => (x.id === room.id ? { ...x, repos: next, admins } : x)) }));
  pushConnectors();
  return r;
}
/** the `team.connectors` answer for the room in use: each part read from its own cache, a part that fails left empty */
async function connectorsNow(rid?: unknown, refresh = false) {
  const room = activeRoom(getTeam()), repo = recordOf(room), d = thingsDeps();
  const [file, members, things, tools, gh, live] = await Promise.all([
    room.provider === "cloud" && repo ? connectors.get(d, repo, refresh).then((f) => { pruneRepos(f); return f; }, () => null) : Promise.resolve(null),
    memberCount({ gh: runGh, cloud: cloudCount }, room).catch(() => 0),
    repo ? getThings(d, repo, refresh).then((f) => thingsMsg(f, peekBoard(), repo, undefined, relayRoster()) as object,
      (e) => ({ repo, things: [], folders: [], error: `couldn't read the room's things: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}` }))
      : Promise.resolve(thingsMsg({ v: 1, things: [] }, null, "") as object),
    repo ? Promise.all([calendar.get(d, repo, refresh).catch(() => null), decisions.get(d, repo, refresh).catch(() => null), polls.get(d, repo, refresh).catch(() => null)]) : Promise.resolve([null, null, null] as const),
    githubAccount().catch(() => ({ in: false, who: undefined })),
    liveKeys(room).catch(() => [] as string[]),
  ]);
  const g = grant.readGrant(DRIVE_FILE);
  return connectorsMsg({ room, file, members, things, tools: toolLines({ calendar: tools[0], decisions: tools[1], polls: tools[2] }),
    me: { google: g ? { in: true, ...(g.email ? { email: g.email } : {}) } : { in: false }, github: gh.in ? { in: true, ...(gh.who ? { who: gh.who } : {}) } : { in: false } }, rid,
    asked: askedNow(letInDeps(), room.id), admins: room.admins ?? [], live });
}
let connTimer: NodeJS.Timeout | undefined;
/** the answer again to every Cowork face, once for a burst of changes */
function pushConnectors() {
  if (![...faces.values()].some((f) => f.cowork)) return;
  clearTimeout(connTimer);
  connTimer = setTimeout(() => void connectorsNow().then(everyoneTeam).catch(() => {}), 300);
  connTimer.unref?.();
}
connectors.on((_repo, f) => { pruneRepos(f); pushConnectors(); });
// GitHub here signed in or out (control.ts): my hello says so again, a cloud group's board and feed read anew, and the
// connectors tab hears it
onGithub((a) => { setGithub(a.in); feed.forget(); void getBoard(true).catch(() => {}); pushConnectors(); });
// --- end Connectors

onAgain((repo, t, who) => {
  if (repo !== recordOf(activeRoom(getTeam()))) return;
  feedLine(feed.live.add({ at: new Date().toISOString(), who: who.by.replace(/'s agent$/, ""), agent: who.agent, kind: "thing-again", text: `added ${t.name.slice(0, 60)} again: already here, opened the existing one`, ref: { thing: t.id, url: t.url } }));
});
// --- end Things

const focusOrder = new FocusOrder();   // a late focus never undoes a blur sent after it (#236)
export async function handleTeam(w: Wire, m: any) {
  const me = faces.get(w);
  if (!me) return;
  const rid = RID(m.rid);
  if (typeof m.type === "string" && m.type.startsWith("team.v3.")) return handleV3(w, m, rid);   // Cowork v3 (fr-30)
  switch (m.type) {
    // --- See (round 17)
    case "team.hello":
      me.cowork = true;
      w.send(stateMsg());
      return w.send(hubNow());   // the hub's light, a queue, "please update" (#223), so a face that opens late says it
    case "team.settings": {
      if (m.patch && typeof m.patch === "object") {
        const before = getTeam();
        // the face never sees the key, so it never sends it back; a new relay url reconnects
        const { relay, me: mine, ...rest } = m.patch as Record<string, any>;
        // the login is GitHub's word (fillMe), never the face's: a face edit of `me` may change the name only
        if (mine && typeof mine === "object") rest.me = { ...mine, login: before.me.login };
        // #157: a code is the engine's word (share, join), never a face's: the stored one is kept (settings.ts keepKeys).
        // A room's folder, `mine` and `joined` (#162) too: only the engine clones, so a face never points a room at a
        // folder of its choosing, never makes a joined room's repos its own, which would let anyone into them, and never
        // makes a joined room look like one of mine to register again
        if (Array.isArray(rest.rooms)) rest.rooms = rest.rooms.map((r: unknown) => { if (!r || typeof r !== "object") return r; const { code: _c, folder: _f, mine: _m, joined: _j, ...x } = r as Record<string, unknown>; return x; });
        // #320: a cloud group's org and repos are not a face's words, nor its connected repos: the room in use's top level
        if (activeRoom(before).provider === "cloud" && !("room" in rest && rest.room !== before.room)) { delete rest.repos; delete rest.org; }
        // #320: a cloud group's repos are connected by team.connect.repo alone (an admin, a private repository), never
        // by a face's edit: the stored ones are kept (settings.ts keepKeys)
        if (Array.isArray(rest.rooms)) rest.rooms = rest.rooms.map((r: unknown) => { if (!r || typeof r !== "object" || !before.rooms.some((x) => x.id === (r as { id?: unknown }).id && x.provider === "cloud")) return r; const { repos: _r, ...x } = r as Record<string, unknown>; return x; });
        const dialsBefore = before.dials;
        const s = patchTeam({ ...rest, ...(relay && typeof relay === "object" ? { relay: { ...relay, key: typeof relay.key === "string" && relay.key !== "set" ? relay.key : before.relay.key } } : {}) });
        afterRoomChange(before, s);
        shareIfNew(before, s);   // #157: a new room on the shared hub gets its code at once
        void forgetGone(roomsDeps(), before, s).catch(() => {});   // a room of mine forgotten here is forgotten on its hub
        const learned = flipped(dialsBefore, s.dials).map((f) => learnedLine(f.kind, f.was, f.now));
        if (learned.length) { void writeLearned(learned).catch(() => {}); return w.send({ type: "team.settings", rid, settings: { ...forFace(s), asksOff: answeringWhy() ?? "" }, learned }); }
      }
      return w.send({ type: "team.settings", rid, settings: { ...forFace(getTeam()), asksOff: answeringWhy() ?? "" } });   // asksOff (#1703): why a teammate's agent is refused here, "" when it is answered
    }
    // --- Share code (#157, PROTOCOL.md round 35): a room's code (made on its hub when it has none), a room joined by one
    case "team.room.share": {
      const before = getTeam();
      const r = await shareRoom(roomsDeps(), typeof m.id === "string" && m.id ? m.id : undefined);
      afterRoomChange(before, getTeam());   // the room in use now has a code: its hello names it
      return w.send({ type: "team.room.share", rid, ...r });
    }
    case "team.room.join": {
      const before = getTeam();
      // #327: a join link's card names the hub it peeked and the name it showed; only that hub is asked
      const r = await joinRoom(roomsDeps(), m.code, typeof m.hub === "string" ? { hub: m.hub, name: m.name } : undefined);
      if ("error" in r) return w.send({ type: "team.room.join", rid, error: r.error });
      afterRoomChange(before, getTeam());   // what team.settings does on a switch
      if (!onCloud()) void askIn(letInDeps(), r.room).catch(() => {});   // #162: let me into its repository (the relay may be down: then on connect)
      return w.send({ type: "team.room.join", rid, room: roomForFace(r.room), ...(r.already ? { already: true } : {}) });
    }
    // #1537: who sits at each of my rooms, for the groups home's tables (me first; a room nothing here can read is me alone)
    case "team.rooms.people": {
      const s = getTeam();
      return w.send({ type: "team.rooms.people", rid, rooms: await roomPeople(roomsDeps(), onCloud(s) ? hubLogin(s) : s.me.login, teamMembers) });
    }
    // #327: a join link's code opened in the app: the group's name, asked before anyone presses join (PROTOCOL round 59)
    case "team.room.peek":
      return w.send({ type: "team.room.peek", rid, ...(await peekRoom(roomsDeps(), m.code)) });
    // the maker's one press (the review of #162): who waits to be let into a room of mine, and yes or not now
    case "team.letin.get":
      return w.send({ type: "team.letin", rid, asks: waitingNow() });
    // Cowork › Room (#1298): the same blocks that ask, every project's: what waits on me, what settled by issue, the thread
    case "team.room": {
      const [{ roomRead, roomBlocks }, { threadNow }] = await Promise.all([import("../work/asks.js"), import("./reach.js")]);
      return w.send({ type: "team.room", rid, ...roomRead(roomBlocks(), threadNow()) });
    }
    case "team.letin.answer":
      // review P1-1: the card as the face showed it, so a press never lets in an ask that changed under it
      return w.send({ type: "team.letin.answer", rid, ...(await letIn(letInDeps(), String(m.room ?? ""), String(m.login ?? ""), m.yes === true,
        Array.isArray(m.repos) ? { github: typeof m.github === "string" ? m.github : "", repos: m.repos.filter((x: unknown): x is string => typeof x === "string").slice(0, 20) } : undefined)) });
    // #325: my press on a cloud group's connected repository, "ask to be let in": the maker is asked once, with my GitHub login
    case "team.letin.ask":
      return w.send({ type: "team.letin.ask", rid, ...(await askCloud(letInDeps(), m.repo)) });
    case "team.room.make": {   // #160: a room from a name alone
      const before = getTeam();
      const r = await makeRoom(roomsDeps(), { name: m.name, ...(typeof m.hub === "string" ? { hub: m.hub } : {}), ...(typeof m.key === "string" ? { key: m.key } : {}), ...(m.code === true ? { code: true } : {}), ...(m.where === "cloud" ? { where: "cloud" } : {}), ...(typeof m.drive === "string" ? { drive: m.drive } : {}) });
      if ("error" in r) return w.send({ type: "team.room.make", rid, error: r.error });
      afterRoomChange(before, getTeam());   // what team.settings does on a switch
      return w.send({ type: "team.room.make", rid, room: roomForFace(r.room), ...(r.warn ? { warn: r.warn } : {}) });
    }
    // --- end Share code
    // --- The quota and the move to GitHub (#326, round 58)
    case "team.room.usage": {
      const u = await usageOf(usageDeps(), m.id);
      return w.send({ type: m.type, rid, ...(u ?? { cloud: false }) });
    }
    case "team.room.take": {
      const before = getTeam(), id = typeof m.id === "string" && m.id ? m.id : before.room;
      const r = await takeRoom(takeDeps(), id);
      pushUsage(id);
      if ("error" in r) return w.send({ type: m.type, rid, ...r });
      afterRoomChange(before, getTeam());   // a GitHub group now: its record, its board
      return w.send({ type: m.type, rid, room: roomForFace(r.room), repo: r.repo, files: r.files, ...(r.already ? { already: true } : {}) });
    }
    case "team.room.follow": {
      const before = getTeam();
      const r = await followMove({ ...awayDeps(), team: getTeam, patch: patchTeam, github: ghLogin }, m.id);
      if ("error" in r) return w.send({ type: m.type, rid, ...r });
      afterRoomChange(before, getTeam());
      return w.send({ type: m.type, rid, room: roomForFace(r.room) });
    }
    // --- end The quota
    case "team.board":
    case "team.board.get":
    case "team.board.refresh": {
      const b = await getBoard(m.type === "team.board.refresh" || !!m.refresh);
      return w.send(boardMsg(b, await teamFolders(), rid));
    }
    // --- Things (#194, round 39): the list, an add, a remove; all on the room in use's record repo
    case "team.things": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsMsg({ v: 1, things: [] }, null, "", rid));
      try {
        // a GitHub room that moved to the cloud (#246, move.ts): its record says the new code, and the face offers to join
        const moved = movedForFace(await movedOf({ ...thingsDeps(), trusted: (h) => !!h && hubKey(h) === hubKey(sharedHub()),
          admin: (r, login) => runGh(["api", `repos/${r}/collaborators/${login}/permission`, "--jq", ".permission"]).then((p) => p.trim() === "admin") }, repo, Date.now(), !!m.refresh), getTeam().rooms);
        // a cloud group whose maker moved its files to GitHub (#326): the card, never a switch on its own
        const movedAway = repo.startsWith("cloud:") ? await cloudMovedOf(awayDeps(), repo, Date.now(), !!m.refresh) : null;
        return w.send({ ...thingsMsg(await getThings(thingsDeps(), repo, !!m.refresh), await getBoard().catch(() => null), repo, rid, relayRoster()), ...(moved ? { moved } : {}), ...(movedAway ? { movedAway } : {}) });
      }
      catch (e) { return w.send(thingsError("team.things", rid, `couldn't read the room's things: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.things.add":
    case "team.things.remove":
    case "team.things.folder":       // #248: make a folder { name }
    case "team.things.move":         // #248: a thing into a folder { id, to } (to "" or null: the top)
    case "team.things.unfolder": {   // #248: a folder off { id }; what was in it moves up one level
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsError(m.type, rid, "this room has no record yet"));
      const by = hubLogin() || getTeam().me.login, at = new Date().toISOString();
      const op: ThingsOp = m.type === "team.things.add" ? { add: { url: m.url, name: m.name, by, at, ...(typeof m.parent === "string" && m.parent ? { parent: m.parent } : {}) } }
        : m.type === "team.things.remove" ? { remove: { id: m.id } }
        : m.type === "team.things.folder" ? { folder: { id: folderId(), name: m.name, by, at, everyone: m.everyone === true } }
        : m.type === "team.things.move" ? { move: { id: m.id, to: typeof m.to === "string" ? m.to : null } }
        : { unfolder: { id: m.id } };
      const r = await changeThings(thingsDeps(), repo, op);
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      // the asker gets the list with its rid (the pure answer); every other Cowork face heard it through onThings
      return w.send({ ...thingsMsg(r.file, await getBoard().catch(() => null), repo, rid, relayRoster()), type: m.type, ...(r.thing ? { thing: r.thing } : {}), ...(r.folder ? { folder: r.folder } : {}), changed: r.changed });
    }
    // #230: the face has a thing of the room open in front (S2, S4), or no longer; the room sees me on its tile
    case "team.thing.focus": {
      const repo = recordOf(activeRoom(getTeam()));
      const id = String(m.id ?? ""), focused = m.focused !== false;
      const n = focusOrder.begin(w);
      // a blur is taken for any id (a thing removed while open still leaves the tile); a focus only for the room's own
      if (!focused) { here.focus(w, id, "", false, Date.now()); sayInside(); return w.send({ type: m.type, rid, id, focused }); }
      const t = repo ? (Object.hasOwn(TOOL_TILES, id) ? { id, name: TOOL_TILES[id] }
        : tilePage(id) ? await pageAsThing(repo, tilePage(id))   // a page (#433): `page-<id>`, its title the name
        : (await getThings(thingsDeps(), repo).catch(() => null))?.things.find((x) => x.id === id)) : undefined;
      if (!t) return w.send(thingsError(m.type, rid, "no such thing in this room"));
      if (!focusOrder.last(w, n)) return w.send({ type: m.type, rid, id: t.id, focused, late: true });   // a later word came first
      here.focus(w, t.id, t.name, focused, Date.now());
      sayInside();
      return w.send({ type: m.type, rid, id: t.id, focused });
    }
    // --- end Things
    // --- What happened, for you (#232)
    case "team.feed": {
      const r = await feed.lines(roomKeyNow(), !!m.refresh);
      const page = pageOf(r.lines, m.before, m.limit);
      // #320: a cloud group whose connected repositories this Sol cannot read says why the feed has no board lines
      const why = activeRoom(getTeam()).provider === "cloud" ? await boardReason().catch(() => undefined) : undefined;
      return w.send({ type: "team.feed", rid, ...page, readAt: r.readAt, ...(r.error ? { error: r.error } : {}), ...(why ? { reason: why } : {}) });
    }
    case "team.foryou": {
      const { pending } = await handsNow().catch(() => ({ pending: [] }));
      const me = hubLogin() || getTeam().me.login;
      return w.send({ type: "team.foryou", rid, items: forYouOf(pending, readPings().filter((p) => p.from.login !== me), Date.now(), getTeam().repos) });
    }
    // --- end What happened
    // --- Goal (#216): the room's goal and its files, in the room's record; the asker gets it with its rid, every other
    // Cowork face here the same message, and another Sol hears the relay's `changed`
    case "team.goal": {
      const repo = recordOf(activeRoom(getTeam()));
      try { return w.send(goalMsg(await readGoal(thingsDeps(), repo), repo, rid)); }
      catch (e) { return w.send(thingsError("team.goal", rid, `couldn't read the room's goal: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.goal.set":
    case "team.goal.add_file": {
      const repo = recordOf(activeRoom(getTeam()));
      const r = m.type === "team.goal.set"
        ? await setGoal(thingsDeps(), repo, { title: m.title, lines: m.lines, by: hubLogin() || getTeam().me.login })
        : await addGoalFile(thingsDeps(), repo, { name: m.name, text: m.text });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      everyoneTeam(goalMsg(r.goal, repo));
      return w.send({ ...goalMsg(r.goal, repo, rid), type: m.type });
    }
    // the goal page (#238): one file's text, opened from its row
    case "team.goal.file": {
      const r = await readGoalFile(thingsDeps(), recordOf(activeRoom(getTeam())), m.name);
      return w.send("error" in r ? thingsError(m.type, rid, r.error) : { type: m.type, rid, ...r });
    }
    // --- end Goal
    // --- The room's own tools (#245, round 49): one message to read each, one to change it; the asker gets its answer
    // with its rid, every other Cowork face here the same message without one (the store's `on`)
    case "team.calendar":
    case "team.decisions":
    case "team.polls": {
      const repo = recordOf(activeRoom(getTeam()));
      const empty = m.type === "team.calendar" ? calMsg({ v: 1, events: [] }, "", rid) : m.type === "team.decisions" ? decMsg({ text: "", decisions: [] }, "", rid) : pollMsg({ v: 1, polls: [] }, "", rid);
      if (!repo) return w.send(empty);
      try {
        if (m.type === "team.calendar") return w.send(calMsg(await calendar.get(thingsDeps(), repo, !!m.refresh), repo, rid));
        if (m.type === "team.decisions") return w.send(decMsg(await decisions.get(thingsDeps(), repo, !!m.refresh), repo, rid));
        return w.send(pollMsg(await polls.get(thingsDeps(), repo, !!m.refresh), repo, rid));
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the room's ${m.type.slice(5)}: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.calendar.add":
    case "team.calendar.remove": {
      const repo = recordOf(activeRoom(getTeam()));
      const by = hubLogin() || getTeam().me.login, at = new Date().toISOString();
      const r = await calendar.change(thingsDeps(), repo, m.type === "team.calendar.add"
        ? { add: { title: m.title, start: m.start, end: m.end, allDay: m.allDay, who: m.who, thing: m.thing, by, at } }
        : { remove: { id: m.id } });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      return w.send({ ...calMsg(r.file, repo, rid), type: m.type, changed: r.changed, ...(r.result ? { event: r.result.event, ...(r.result.again ? { again: true } : {}) } : {}) });
    }
    case "team.calendar.ics": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsError(m.type, rid, NO_RECORD_LINE));
      try { const f = await calendar.get(thingsDeps(), repo); return w.send({ type: m.type, rid, name: `${activeRoom(getTeam()).name.replace(/[^\w .-]+/g, " ").trim() || "room"} calendar.ics`, text: icsOf(f, activeRoom(getTeam()).name) }); }
      catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the room's calendar: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    // --- Pages (#433, round 80): the list, one page, a write. The asker gets its answer with its rid; every other Cowork
    // face here hears the list (and the page) without one (pages.on), another Sol the relay's `changed`
    case "team.pages": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(pagesMsg([], "", rid));
      try { return w.send(pagesMsg(await pages.list(thingsDeps(), repo, !!m.refresh), repo, rid)); }
      catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the project's pages: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.page": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsError(m.type, rid, NO_RECORD_LINE));
      try {
        const page = await pages.read(thingsDeps(), repo, String(m.id ?? ""));
        return w.send(page ? { type: m.type, rid, repo, page } : thingsError(m.type, rid, "no such page here"));
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the page: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.page.write": {
      const repo = recordOf(activeRoom(getTeam()));
      const id = typeof m.id === "string" ? m.id : "";
      const op = !id ? { make: { title: m.title, body: m.body } }
        : typeof m.append === "string" ? { append: { id, text: m.append } }
        : { put: { id, ...(m.title !== undefined ? { title: m.title } : {}), body: m.body, ...(typeof m.base === "string" && m.base ? { base: m.base } : {}) } };
      const r = await pages.change(thingsDeps(), repo, op, { by: hubLogin() || getTeam().me.login, at: new Date().toISOString() });
      if ("error" in r) return w.send({ type: m.type, rid, error: r.error, ...(r.page ? { page: r.page } : {}) });
      return w.send({ type: m.type, rid, repo, page: r.page, changed: r.changed });
    }
    // --- Tables (#434, round 82): the list (the board first), one table with its rows, a write. A write is a list of ops on
    // one table; no id with a `make` makes one. Signed with my login; the asker gets the table as it is after
    case "team.tables": {
      const repo = recordOf(activeRoom(getTeam()));
      try { return w.send(tablesMsg(await tables.list(thingsDeps(), repo, !!m.refresh), repo, rid)); }
      catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the project's tables: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.table": {
      const repo = recordOf(activeRoom(getTeam())), id = typeof m.id === "string" ? m.id : "";
      try {
        const t = await tables.read(thingsDeps(), repo, id, !!m.refresh);
        return w.send(t ? { type: m.type, rid, ...(await tableAnswer(repo, id, t)) } : thingsError(m.type, rid, "no such table here"));
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the table: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.table.write": {
      const repo = recordOf(activeRoom(getTeam())), id = typeof m.id === "string" ? m.id : "";
      const ops = (Array.isArray(m.ops) ? m.ops : []).filter((o: unknown) => !!o && typeof o === "object").slice(0, 500) as TableOp[];
      const r = await tables.change(thingsDeps(), repo, id, ops, { by: hubLogin() || getTeam().me.login, at: new Date().toISOString() });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      return w.send({ type: m.type, rid, ...(await tableAnswer(repo, r.id, r.table)), changed: r.changed, made: r.rows });
    }
    // --- Templates (#435, round 83): pages the team starts from, a block of kind `template`. The engine is the gate: every
    // one of these is refused while the project has not turned the block on
    case "team.templates":
    case "team.template":
    case "team.template.write":
    case "team.template.make":
    case "team.template.save":
    case "team.template.remove": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return m.type === "team.templates" ? w.send(templatesMsg([], "", rid)) : w.send(thingsError(m.type, rid, NO_RECORD_LINE));
      const by = hubLogin() || getTeam().me.login, at = new Date().toISOString();
      try {
        const f = await project.get(thingsDeps(), repo);
        const views = blockViewsIn(f), live = (id: string) => !!views.find((b) => b.id === id)?.live;
        if (!live(TEMPLATES_BLOCK)) return w.send({ ...thingsError(m.type, rid, "templates are not on in this project: the team turns the block on in the project's settings"), gate: "off" });
        if (m.type === "team.templates") return w.send(templatesMsg(await templates.list(thingsDeps(), repo, !!m.refresh), repo, rid));
        if (m.type === "team.template") {
          const t = await templates.read(thingsDeps(), repo, String(m.id ?? ""));
          return w.send(t ? { type: m.type, rid, repo, template: t } : thingsError(m.type, rid, "no such template here"));
        }
        if (m.type === "team.template.remove") {
          const r = await templates.remove(thingsDeps(), repo, String(m.id ?? ""), { by });
          return w.send("error" in r ? thingsError(m.type, rid, r.error) : { type: m.type, rid, repo, removed: r.removed });
        }
        if (m.type === "team.template.write") {
          const id = typeof m.id === "string" ? m.id : "";
          const op = !id ? { make: { title: m.title, body: m.body } } : { put: { id, ...(m.title !== undefined ? { title: m.title } : {}), body: m.body, ...(typeof m.base === "string" && m.base ? { base: m.base } : {}) } };
          const r = await templates.change(thingsDeps(), repo, op, { by, at });
          return w.send("error" in r ? { type: m.type, rid, error: r.error, ...(r.page ? { template: r.page } : {}) } : { type: m.type, rid, repo, template: r.page, changed: r.changed });
        }
        if (m.type === "team.template.save") {
          const r = await saveAsTemplate(thingsDeps(), repo, { page: String(m.page ?? ""), title: m.title, who: { by, at } });
          return w.send("error" in r ? thingsError(m.type, rid, r.error) : { type: m.type, rid, repo, template: r.page });
        }
        // make from template: the kind the template is (a page; a table once #434 defines its kind), and its block live
        const kind = typeof m.kind === "string" ? m.kind : "page";
        const k = templateKinds().find((x) => x.kind === kind);
        if (!k) return w.send(thingsError(m.type, rid, `this Sol cannot make a ${kind.slice(0, 20)} from a template`));
        if (kind === "page" && !live("pages")) return w.send({ ...thingsError(m.type, rid, "pages are not on in this project, so a page cannot be made from a template"), gate: "off" });
        const r = await k.make(thingsDeps(), repo, { id: String(m.id ?? ""), title: m.title, who: { by, at }, zone: f.rhythm?.zone ?? "" });
        if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
        return w.send({ type: m.type, rid, repo, made: r });
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't reach the project's templates: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.decisions.add": {
      const repo = recordOf(activeRoom(getTeam()));
      const r = await decisions.change(thingsDeps(), repo, { add: { title: m.title, lines: m.lines, by: hubLogin() || getTeam().me.login, at: new Date().toISOString() } });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      return w.send({ ...decMsg(r.file, repo, rid), type: m.type, changed: r.changed, ...(r.result ? { decision: r.result.decision } : {}) });
    }
    case "team.polls.add":
    case "team.polls.vote":
    case "team.polls.close": {
      const repo = recordOf(activeRoom(getTeam()));
      const by = hubLogin() || getTeam().me.login, at = new Date().toISOString();
      // a vote that agrees to a settings change (#428) passes the members check first (#435): only a member, on a list a
      // minute old at most, and none while it cannot be read
      if (m.type === "team.polls.vote" && repo) {
        const f = await project.get(thingsDeps(), repo).catch(() => null);
        if (f?.proposals.some((p) => p.state === "open" && p.poll === m.id)) { const no = await memberRefusal({ login: by }, "agree to a settings change"); if (no) return w.send(thingsError(m.type, rid, no)); }
      }
      const r = await polls.change(thingsDeps(), repo, m.type === "team.polls.add" ? { add: { question: m.question, options: m.options, by, at } }
        : m.type === "team.polls.vote" ? { vote: { id: m.id, option: m.option, by } } : { close: { id: m.id, by, at } });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      return w.send({ ...pollMsg(r.file, repo, rid), type: m.type, changed: r.changed, ...(r.result ? { poll: r.result.poll, ...(r.result.again ? { again: true } : {}) } : {}) });
    }
    // --- Project settings (#428, round 69): anyone in the project reads the page; a change is a proposal
    case "team.used":   // who used what (#431, round 76)
      try { return w.send({ ...(await usedMsg(!!m.refresh)), rid }); }
      catch (e) { return w.send(thingsError(m.type, rid, `couldn't read who used what: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    case "team.project": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send({ type: m.type, rid, repo: "", error: NO_RECORD_LINE });
      try {
        if (m.refresh) { project.forget(); settleSoon(repo); }
        return w.send(await projectMsg(repo, rid, await project.get(thingsDeps(), repo, !!m.refresh)));
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the project's settings: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    // --- Team tools (#436, round 81): a team block of kind "tool" opened in the project's centre. The engine is the gate:
    // the tool live in the project in use, and this Sol's person one of its members (teamtool.ts), else refused
    case "team.tool": {
      // one project for the whole answer: its settings, its members and its feed, all of the room in use when asked;
      // an answer for a project left meanwhile is never sent as this one's
      const room = activeRoom(getTeam()), repo = recordOf(room), key = roomKeyNow(), id = typeof m.id === "string" ? m.id : "";
      if (!repo) return w.send({ type: m.type, rid, id, error: NO_RECORD_LINE, gate: "none" });
      try {
        const f = await project.get(thingsDeps(), repo, !!m.refresh);
        const start = await projectStart(projectWhere(repo).code), rhythm = rhythmIn(f, start), zone = rhythm.zone;
        // the "devs" gate (#480): the project's Sol developers, as its settings name them
        const r = await openTool({ id: m.id, views: blockViewsIn(f), me: hubLogin() || getTeam().me.login, members: (strict) => projectMembers(room, !!m.refresh, strict), devs: async () => devsIn(ownersIn(f, start), rhythm), ctx: { key, zone, refresh: !!m.refresh } });
        if (roomKeyNow() !== key) return w.send({ type: m.type, rid, id, error: "you moved to another project while it was read: open it again", gate: "none" });
        return w.send({ type: m.type, rid, ...r });
      } catch (e) { return w.send(thingsError(m.type, rid, `couldn't open the tool: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.project.propose":
    case "team.project.withdraw": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsError(m.type, rid, NO_RECORD_LINE));
      const by = hubLogin() || getTeam().me.login;
      const r = m.type === "team.project.propose"
        ? await projectPropose(thingsDeps(), repo, { patch: m.patch, why: m.why, by, start: await projectStart(projectWhere().code) })
        : await projectWithdraw(thingsDeps(), repo, { id: m.id, by });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      return w.send({ ...(await projectMsg(repo, rid)), type: m.type, proposal: r.proposal });
    }
    // --- Onboarding (#430, round 75): the walk, a step done or skipped, the whole walk finished or skipped, walked again
    case "team.onboarding": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send({ type: m.type, rid, repo: "", error: NO_RECORD_LINE });
      try { return w.send(await walkMsg(repo, rid, !!m.refresh)); }
      catch (e) { return w.send(thingsError(m.type, rid, `couldn't read the project's onboarding: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}`)); }
    }
    case "team.onboarding.step":
    case "team.onboarding.finish":
    case "team.onboarding.redo": {
      const repo = recordOf(activeRoom(getTeam()));
      if (!repo) return w.send(thingsError(m.type, rid, NO_RECORD_LINE));
      const by = hubLogin() || getTeam().me.login, at = new Date().toISOString();
      const r = await onboarded.change(thingsDeps(), repo, m.type === "team.onboarding.step" ? { step: { by, id: m.id, how: m.how, at } }
        : m.type === "team.onboarding.finish" ? { finish: { by, how: m.how, at } } : { redo: { by, at } });
      if ("error" in r) return w.send(thingsError(m.type, rid, r.error));
      try { return w.send({ ...(await walkMsg(repo, rid)), type: m.type }); }
      catch (e) { return w.send(thingsError(m.type, rid, String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200))); }
    }
    // --- end The room's own tools
    // --- Connectors (#320, round 55): the one answer, and a repository connected to (or taken off) a cloud group
    case "team.connectors":
      return w.send(await connectorsNow(rid, !!m.refresh));
    case "team.connect.repo":
    case "team.connect.repo.remove": {
      // the room's own repos are what its board reads: written by the engine only, after the checks (connectMine)
      // #328 (review P1-2): a repository taken off takes its build updates with it first, while my clone of it is still
      // mine (best effort: only its admin can, and a key left behind is heard no more once the group stops listing it)
      if (m.type === "team.connect.repo.remove") await connectEvents(eventsDeps(), activeRoom(getTeam()), m.repo, false).catch(() => null);
      const r = await connectMine(activeRoom(getTeam()), m.repo, m.type === "team.connect.repo");
      if ("error" in r) return w.send({ type: m.type, rid, error: r.error });
      return w.send({ ...(await connectorsNow(rid)), type: m.type, repo: r.connected.repo, changed: r.changed, ...(r.off ? { off: r.off } : {}) });
    }
    // --- Build updates (#328, round 60): the workflow added to (or taken off) a connected repository by its admin
    case "team.connect.events":
    case "team.connect.events.remove": {
      const room = activeRoom(getTeam());
      const r = await connectEvents(eventsDeps(), room, m.repo, m.type === "team.connect.events");
      if (!("error" in r)) { liveRead.delete(room.code); pushConnectors(); }   // its row's `events` read anew
      return w.send({ type: m.type, rid, ...r });
    }
    // --- end Connectors
    // "show my room sessions" (#238, the studio PRD §5): on or off for one room (the room in use unless `id` names
    // another of mine). Off stops their streams at once and my roster entry there says so
    case "team.room.show": {
      const s = getTeam(), id = typeof m.id === "string" && m.id ? m.id : s.room;
      if (!s.rooms.some((r) => r.id === id)) return w.send({ type: m.type, rid, error: "no such room here" });
      const on = m.on !== false;
      const next = patchTeam({ rooms: s.rooms.map((r) => { if (r.id !== id) return r; const { quiet: _q, ...rest } = r; return on ? rest : { ...rest, quiet: true }; }) });
      sayInside();
      return w.send({ type: m.type, rid, id, on: next.rooms.find((r) => r.id === id)?.quiet !== true, settings: forFace(next) });
    }
    case "team.member": {
      const login = String(m.login ?? "");
      const r = await member(login).catch(() => ({ log: [] }));
      return w.send({ type: "team.member", rid, login, ...r });
    }
    case "team.ping": {
      const to = String(m.to ?? "").slice(0, 39), line = String(m.line ?? "").slice(0, 300);
      const ok = !!to && !!line && wakeUp().send({ to, line, pingKind: kindOf(m.kind) });
      return w.send({ type: "team.ping", rid, ok });
    }
    case "team.session.start": {
      // a Work session marked cowork and the room's (#230): Work's side does not list it, Cowork lists it under its room.
      // From a card: its repo's folder. From the box (#234): a bare line, maybe a thing; the goal's snapshot goes first
      const room = activeRoom(getTeam()), rec = recordOf(room);
      const mk = roomMark(room, rec);   // the room as it was asked under: a switch during the awaits below does not move the session
      const things = rec && m.thing ? (await getThings(thingsDeps(), rec).catch(() => ({ things: [] }))).things : [];
      const ctx = await roomContext(rec);
      const plan = planStart({ text: m.text, repo: m.repo, thing: m.thing, room, record: rec, folders: await teamFolders(), home: homedir(), things, goal: ctx.text });
      if ("error" in plan) return w.send({ type: "team.session.start", rid, error: plan.error });
      // a cloud room's folder: made 700, and refused when something else (a link) stands there
      if (plan.make) {
        try { mkdirSync(plan.make, { recursive: true, mode: 0o700 }); if (!lstatSync(plan.make).isDirectory()) throw new Error("something other than a folder is there"); }
        catch (e) { return w.send({ type: "team.session.start", rid, error: `could not make the room's folder: ${String((e as Error)?.message ?? e).slice(0, 120)}` }); }
      }
      const id = randomUUID(), cwd = plan.cwd, repo = plan.repo;
      const issue = Number(m.issue) > 0 ? Number(m.issue) : undefined;
      mark(id, { mode: "cowork", room: mk, roomId: room.id, ...(ctx.goalv ? { goalv: ctx.goalv } : {}), ...(ctx.memv ? { memv: ctx.memv } : {}), ...(typeof m.thing === "string" && /^[\w-]{1,40}$/.test(m.thing) ? { thing: m.thing } : {}) });   // #230: the room's own: its title may go to the room
      // the answer comes once Work took the first turn (§9.7), else its error
      try { await handleWork(w, { type: "work.say", sessionId: id, fresh: true, cwd, text: plan.text, ...(Array.isArray(m.files) ? { files: m.files } : {}) }); }
      catch (e) { return w.send({ type: "team.session.start", rid, error: `the session did not start: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}` }); }
      w.send({ type: "team.session.start", rid, sessionId: id, repo, cwd, ...(ctx.goalv ? { goalVersion: ctx.goalv } : {}), ...(m.thing ? { thing: m.thing } : {}) });
      const card = issue ? (await getBoard().catch(() => null))?.cards.find((c) => c.repo === repo && c.number === issue) : undefined;
      if (issue) void nameWhenWritten(id, `#${issue} ${card?.title ?? basename(cwd)}`.slice(0, 80));   // else Work names it as usual
      return;
    }
    // --- end See
    // --- Control (round 18): my accounts, and the line that signs in
    case "team.accounts": {   // Claude Code, Codex and GitHub signed in on this machine, or not
      const a = await accounts();
      if (a.github.in && !getTeam().me.login) await fillMe(true);   // signed in to GitHub since: the login fills in
      const c = cloudNow();   // and my Sol account on the cloud (S6b, #226)
      return w.send({ type: "team.accounts", rid, ...a, sol: { in: !!c.login, who: c.login, hub: c.hub } });
    }
    case "team.signin": {     // the line to type in a terminal pane; the face opens it and types, the person presses Return
      const command = signinCommand(m.seat);
      const error = m.seat === "github" ? "GitHub signs in from the card (team.github.connect)" : "sign in to what? claude or codex";
      return w.send({ type: "team.signin", rid, ...(command ? { command } : { error }) });
    }
    case "team.cloud.signin": {   // S6b (#226): a Sol account on the shared hub, by Google in the system browser, from the face
      const hub = hubHttp(sharedHub());
      if (!hub.startsWith("https://")) return w.send({ type: "team.cloud.signin", rid, ok: false, error: "no cloud to sign in to (SOL_HUB is off or not wss://)" });
      const out = await identity().signIn(hub);
      if (out.ok) { restartRelay(); sendState(); }   // the next knock carries the new ticket
      return w.send({ type: "team.cloud.signin", rid, ...out });
    }
    case "team.cloud.me": {   // #1608 (decision #1606): whose Sol this is on the cloud, for the onboarding's gate before go: the name
      // signed in there ("" when nobody), and whether there is a cloud to sign in to at all (none: a developer's own run, no gate)
      const c = cloudNow();
      return w.send({ type: "team.cloud.me", rid, login: c.login, hub: c.hub, cloud: hubHttp(sharedHub()).startsWith("https://") });
    }
    case "team.cloud.signout": {   // BR1 (#1615): Settings' Account row signs this machine out of the shared hub (the same as
      // POST /cloud/signout); false when the cloud did not answer, kept to be tried again
      const hub = hubHttp(sharedHub());
      if (!hub.startsWith("https://")) return w.send({ type: "team.cloud.signout", rid, ok: false, error: "no cloud to sign out of" });
      const ok = await identity().signOut(hub);
      if (ok) { restartRelay(); sendState(); }   // the next knock carries no ticket
      return w.send({ type: "team.cloud.signout", rid, ok });
    }
    // --- end Control
    // --- Google Drive for a Drive room (#152, round 48): connect (Google in the system browser, through my cloud),
    // let go, and who the room's folder is shared with. A face hears whether it is connected, the email and the scope,
    // never a token
    case "team.drive": {
      return w.send({ type: "team.drive", rid, ...driveForFace(grant.readGrant(DRIVE_FILE)), hub: driveHub() });
    }
    case "team.drive.connect": {
      const hub = driveHub();
      if (!hub) return w.send({ type: "team.drive.connect", rid, ok: false, error: "sign in to Sol first: Settings › me › Sol (Drive is connected through your Sol account)" });
      const out = await grant.connect(DRIVE, hub, grantDeps(DRIVE));
      if (out.ok) { forgetThings(); everyoneTeam({ type: "team.drive", ...driveForFace(grant.readGrant(DRIVE_FILE)), hub }); pushConnectors(); }
      return w.send({ type: "team.drive.connect", rid, ...(out.ok ? { ok: true, ...driveForFace(grant.readGrant(DRIVE_FILE)) } : out) });
    }
    case "team.drive.disconnect": {
      const ok = await grant.disconnect(DRIVE, grantDeps(DRIVE));
      grant.stale(DRIVE); forgetThings();
      everyoneTeam({ type: "team.drive", ...driveForFace(null), hub: driveHub() });
      pushConnectors();
      return w.send({ type: "team.drive.disconnect", rid, ok });
    }
    case "team.drive.members": {   // the room in use's folder: its people, and which of them I am; unknown is nobody
      const folder = folderOfRecord(recordOf(activeRoom(getTeam())));
      if (!folder) return w.send({ type: "team.drive.members", rid, known: false, people: [], anyone: false, domain: "", error: "this room's record is not a Drive folder" });
      const got = await driveMembers({ token: () => grant.token(DRIVE, grantDeps(DRIVE)), stale: () => grant.stale(DRIVE) }, folder);
      const me = grant.readGrant(DRIVE_FILE)?.email ?? "";
      return w.send({ type: "team.drive.members", rid, folder, ...got, me });
    }
    // --- end Drive
    // --- GitHub from a card (round 42): gh's device flow, the code and the page; the end goes to every face
    case "team.github.connect": {
      const r = await startConnect(m.scope === "workflow" ? { scope: "workflow" } : {});   // #328: one more permission, for workflows
      return w.send({ type: "team.github.connect", rid, ...(m.scope === "workflow" ? { scope: "workflow" } : {}), ...("code" in r ? { code: r.code, url: r.url } : { error: r.error }) });
    }
    case "team.github.connect.cancel":
      cancelConnect();
      return w.send({ type: "team.github.connect.cancel", rid, ok: true });
    // --- end GitHub from a card

    // --- ship (#33, #418, PROTOCOL.md rounds 19 and 67): the offer of a new release, update on yes
    case "team.update": {
      const d = shipNow();
      if (!d) return w.send({ type: "team.update", rid, error: "updates are not set up here" });
      // ticket K (#1824): Update on the old Sol.app's line, no release waiting: nothing moves, its words are the download
      if (windowOld() && !offerNow()?.behind) return w.send({ type: "team.update", rid, error: OLD_WINDOW_UPDATE });
      const r = await update(d);   // the Sol's own channel: dev or stable
      if (r.ok) { answered(r.sha); void refreshVersion(); }   // #417: the release I sit on moved; said on my presence and to the faces
      return w.send({ type: "team.update", rid, ...r });
    }
    case "team.stable.get":
      await lookAgain().catch(() => false);   // a face that just opened: its Sol.app is looked at now (ticket K, window.ts)
      return w.send({ type: "team.stable", ...(rid !== undefined ? { rid } : {}), ...(offerShown() ?? { sha: null }) });
    case "team.runs.get":   // #1150: who has the release, for the release word
      return w.send({ ...countMsg(), ...(rid !== undefined ? { rid } : {}) });
    // the switch in Settings › me (#1150): which channel, the release this Sol runs, and whether it stays on it (beta behind)
    case "team.channel.get":
      return w.send({ type: "team.channel", rid, ...((await channelState().catch(() => null)) ?? { error: "updates are not set up here" }) });
    // --- carrying own changes over (#425, carry.ts, PROTOCOL.md round 70)
    case "team.carry.get":
      await carryCheck().catch(() => null);
      return w.send({ ...carryMsg(), ...(rid !== undefined ? { rid } : {}) });
    case "team.carry.use":
      return w.send({ type: "team.carry.use", rid, ...(await carryUse().catch((e) => ({ error: String(e?.message ?? e) }))) });
    case "team.carry.aside": {
      const o = offerNow();
      const r = await setAside(o?.behind ? { onto: o.sha, tag: o.tag, follow: BRANCH[o.channel] } : undefined).catch((e) => ({ error: String(e?.message ?? e) }));
      return w.send({ type: "team.carry.aside", rid, ...r });
    }
    case "team.carry.stay": {
      const o = offerNow(), back = carryNow()?.kind === "back";
      const r = carryStay(o?.behind ? o.sha : undefined);
      if (r.ok && o?.behind && !back) answered(o.mine);   // the offer stands answered: not shown again, the next release is
      return w.send({ type: "team.carry.stay", rid, ...r });
    }
    case "team.asides":
      return w.send({ type: "team.asides", rid, asides: await asides().catch(() => []) });
    // --- pin and go back (#426, pin.ts, PROTOCOL.md round 79)
    case "team.pin.get":
      return w.send({ type: "team.pin", rid, ...(await pinView(true)) });
    case "team.pin.set":
      return w.send({ type: "team.pin.set", rid, ...(await pinHere().catch((e) => ({ error: String(e?.message ?? e) }))) });
    case "team.pin.clear": {   // back to latest: the pin goes, then Update as usual
      const r = await unpin().catch((e) => ({ error: String(e?.message ?? e) }));
      if (!("ok" in r && r.ok)) return w.send({ type: "team.pin.clear", rid, ...r });
      const d = shipNow();
      if (m.update !== true || !d) return w.send({ type: "team.pin.clear", rid, ok: true });
      const u = await update(d);
      if (u.ok) { answered(u.sha); void refreshVersion(); }
      return w.send({ type: "team.pin.clear", rid, ok: true, update: u });
    }
    case "team.pin.plan":
      return w.send({ type: "team.pin.plan", rid, ...(typeof m.tag === "string" ? await pinPlan(m.tag).catch((e) => ({ error: String(e?.message ?? e) })) : { error: "which release?" }) });
    case "team.pin.back":
      return w.send({ type: "team.pin.back", rid, ...(typeof m.tag === "string" && typeof m.sure === "string" ? await pinBack(m.tag, m.sure).catch((e) => ({ error: String(e?.message ?? e) })) : { error: "which release, and what Sol said it loses?" }) });
    case "team.aside.back": {
      const r = typeof m.name === "string" ? await bringBack(m.name) : { error: "which one?" };
      return w.send({ type: "team.aside.back", rid, ...("error" in r ? { error: r.error } : { ok: true, stage: r.stage, said: r.said }) });
    }
    // --- end ship

    // --- Talk (#37, PROTOCOL.md round 24): a line typed in the chat (a `/discord ` one goes out first), a thread's lines
    case "team.talk": {
      watchBridges();
      // file { name, bytes, kind } (#315): into the room's record first. artifact { kind, ref, title } (#1417): checked
      // against the group's repositories, its link put in the words
      const r = await typed(m.thread, m.text, getTeam(), m.file, null, m.artifact, chatRepos());
      return w.send({ type: "team.talk", rid, ...(r.ok ? { ok: true, id: r.line.id, sent: r.sent, ...(r.line.file ? { file: r.line.file } : {}), ...(r.line.woke ? { woke: r.line.woke } : {}), ...(r.line.pinged ? { pinged: r.line.pinged } : {}) } : { ok: false, error: r.error }) });
    }
    // Cowork › Agents' room as the group's chat (#1417): each person and their agent as members, the general thread and
    // the agents' thread in time order, each line with its read rule in words, what waits on me. `open`: a person has the
    // room open, so the group's store is read every 10 s for the next 30 (the face asks again while it stays open)
    case "team.chat": {
      if (m.open === true) groupChat().quick?.(30_000);
      const [{ roomRead, roomBlocks }, { threadNow }, chat, stage] = await Promise.all([import("../work/asks.js"), import("./reach.js"), import("./chatline.js"), import("../work/blocks.js")]);
      const s = getTeam(), me = onCloud(s) ? hubLogin(s) : s.me.login;
      const r = roomRead(roomBlocks(), []);
      // a block an artifact names opens in the session it sits in: every block on this machine's stage, by id
      const blocks: Record<string, string> = {}, mine: { id: string; title: string; at: number }[] = [];
      for (const p of stage.projects()) for (const b of stage.allBlocks(p)) if (b.sessions[0]) { blocks[b.id] = b.sessions[0]; if (b.state !== "dead") mine.push({ id: b.id, title: b.title, at: b.at }); }
      const lines = chat.chatOf({
        lines: history("general").filter((l) => l.source === "relay"), thread: threadNow(), repos: chatRepos(), blocks, me,
        settled: r.settled.flatMap((g) => g.blocks.filter((b) => b.asks?.answer).map((b) => ({ id: b.id, title: b.title, issue: g.issue, answer: b.asks!.answer! }))),
      });
      // table: whether this Sol sits at any table (a room, or the team's own relay or repositories, activeRoom's stand-in);
      // with none the room is me and my own AI (gate one q2, #1740)
      return w.send({ type: "team.chat", rid, me, group: activeRoom(s).name, table: s.rooms.length > 0 || !!s.relay.url || s.repos.length > 0, members: chat.membersOf(teamMembers(), me), waiting: r.waiting, lines: lines.map((l) => ({ ...l, said: chat.ruleWords(l.rule) })),
        // the blocks on my stage the composer can put on a line, the newest first
        stage: mine.sort((a, b) => b.at - a.at).slice(0, 12).map(({ id, title }) => ({ id, title })), readAt: Date.now() });
    }
    case "team.talk.history": {
      watchBridges();
      const thread = threadOf(m.thread) || "general";
      // #315: older than `before` (ms), a page from the cloud the room meets on, never kept here
      if (m.before !== undefined) { const r = await olderLines(olderNow(), thread, m.before, m.id); return w.send({ type: "team.talk.history", rid, thread, before: m.before, ...r }); }
      const discord = getTeam().speak.discord === "any" && !!process.env.DISCORD_WEBHOOK;
      const lines = history(thread);
      return w.send({ type: "team.talk.history", rid, thread, lines, threads: threadsWithLines(), discord, older: lines.length > 0 && !!olderNow().where() });
    }
    // #315: one attachment of the room in use's talk, its bytes for a thumbnail, or a copy to open (open: true)
    case "team.talk.file": {
      const r = await readTalkFile(attachNow(), m.path, { open: m.open === true, name: m.name });
      return w.send({ type: "team.talk.file", rid, ...r });
    }
    // --- end Talk
    // --- Hand (#34, PROTOCOL.md round 21): hand an issue, a session or a PR to a teammate; take, pass or later
    case "team.hand":
      return w.send({ type: "team.hand", rid, ...(await handNow(m)) });
    case "team.hand.answer":
      return w.send({ type: "team.hand.answer", rid, ...(await answerNow(m.id, m.how, m.line, m.start !== false)) });
    case "team.hand.back":   // #1002: pull a hand of mine back before it is taken
      return w.send({ type: "team.hand.back", rid, ...(await backNow(m.repo, m.issue)) });
    case "team.hands.get":
      return w.send({ type: "team.hands", rid, ...(await handsNow(!!m.refresh)) });
    // --- end Hand
    // --- Try (#35, PROTOCOL.md round 22): a teammate's PR as a second Sol beside mine, the review seat on it, ready, comment
    case "team.try": case "team.try.review": case "team.try.reviews": case "team.pr.ready": case "team.pr.comment": {
      const repo = String(m.repo ?? ""), pr = Number(m.pr);
      const reply = (o: object) => w.send({ type: m.type, rid, ...o });
      if (!okRepo(repo) || !okPr(pr)) return reply({ error: "which pull request?" });
      if (!getTeam().repos.some((r) => r.toLowerCase() === repo.toLowerCase())) return reply({ error: `${repo} is not one of the team's repositories` });
      if (m.type === "team.try.reviews") return reply({ repo, pr, items: reviewItems(repo, pr) });
      if (m.type === "team.pr.ready") return reply(await markReady(repo, pr));
      if (m.type === "team.pr.comment") {
        const line = Number(m.line);
        return reply(await commentPr({ repo, pr, body: String(m.body ?? ""), ...(typeof m.path === "string" && m.path ? { path: m.path.slice(0, 500) } : {}),
          ...(Number.isInteger(line) && line > 0 ? { line } : {}), ...(typeof m.remark === "string" && m.remark ? { remark: m.remark } : {}) }));
      }
      const dir = (await teamFolders())[repo];
      if (m.type === "team.try.review") return reply(await reviewTry(repo, pr, dir));
      if (!dir) return reply({ error: `no folder on this machine holds ${repo}` });
      return reply(await startTry(repo, pr, dir));
    }
    case "team.try.stop":
      return w.send({ type: "team.try.stop", rid, ...(await stopTry()) });
    case "team.try.get":
      return w.send({ ...tryState(), ...(rid !== undefined ? { rid } : {}) });
    // --- end Try
    // --- Share (#36, PROTOCOL.md round 23): shared with me, and one shared thing opened
    case "team.shared": {
      try { const sh = await getShared(!!m.refresh); return w.send({ type: "team.shared", rid, repos: sh.repos, at: sh.at }); }
      catch (e) { return w.send({ type: "team.shared", rid, repos: [], at: Date.now(), error: String((e as Error)?.message ?? e).slice(0, 200) }); }
    }
    case "team.shared.open": {
      const repo = typeof m.repo === "string" ? m.repo : "", path = typeof m.path === "string" ? m.path : "";
      const ref = typeof m.ref === "string" && m.ref ? m.ref : undefined;
      const r = await openShared(repo, path, ref).catch((e) => ({ error: `could not open it: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}` }));
      return w.send({ type: "team.shared.open", rid, repo, path, ...(ref ? { ref } : {}), ...r });
    }
    // --- end Share
    // --- Felt or silent (#100, PROTOCOL.md round 28): the person flips a PR's mark; a comment, signed by them
    case "team.pr.mark": {
      const repo = String(m.repo ?? ""), pr = Number(m.number ?? m.pr), mk = m.mark;
      const reply = (o: object) => w.send({ type: "team.pr.mark", rid, repo, number: pr, ...o });
      if (!okRepo(repo) || !okPr(pr)) return reply({ error: "which pull request?" });
      if (mk !== "felt" && mk !== "silent") return reply({ error: "a mark is felt or silent" });
      if (!getTeam().repos.some((r) => r.toLowerCase() === repo.toLowerCase())) return reply({ error: `${repo} is not one of the team's repositories` });
      const by = signature(getTeam(), false);
      try { await record().notes.addOnPr(pr, flipBody(mk, by), repo); }
      catch (e) { return reply({ error: `GitHub did not take it: ${String((e as Error)?.message ?? e).slice(0, 200)}` }); }
      void getBoard(true).catch(() => {});
      return reply({ ok: true, mark: mk, by });
    }
    // --- end Felt or silent
    // --- who leads a label (#117, #438): who may (the repo's people), and the change asked of the project's settings
    case "team.leads.who": case "team.leads.set": {
      const repo = String(m.repo ?? "");
      const reply = (o: object) => w.send({ type: m.type, rid, repo, ...o });
      if (!okRepo(repo) || !getTeam().repos.some((r) => r.toLowerCase() === repo.toLowerCase())) return reply({ error: `${repo || "that"} is not one of the team's repositories` });
      if (m.type === "team.leads.who") return reply(await candidates({ gh: runGh }, repo).then((people) => ({ people }), (e) => ({ error: String((e as Error)?.message ?? e).slice(0, 200) })));
      const r = await pressLeads({
        gh: runGh, login: myLogin, team: teamMembers,
        ping: (to, line, at) => !onCloud() && wakeUp().send({ to, line, pingKind: "decision", repo: at }),   // #214: GitHub logins
        table: (code) => projectOwners(code),
        propose: async (code, table, by) => {
          const { record } = projectWhere(code);
          if (!record) return { error: "this project has no record yet, so its settings cannot be asked" };
          return projectPropose(thingsDeps(), record, { patch: { owners: table }, by, start: await projectStart(code), why: "who leads, from the board's leads" });
        },
      }, { repo, label: String(m.label ?? ""), leads: m.leads });
      return reply(r);
    }
    // --- end the owner's press
    // --- Ask for a session (#335, PROTOCOL.md round 113): the asks waiting on my press and mine out; ask for one of a
    // person's group sessions from their page; my press on a card
    case "team.asks.get":
      return w.send({ type: "team.asks", rid, asks: asks.list(), asked: asks.asked() });
    case "team.session.ask": {
      const login = typeof m.login === "string" && /^[A-Za-z0-9-]{1,39}$/.test(m.login) ? m.login : "";
      if (!login) return w.send({ type: m.type, rid, error: "whose session that is was not said" });
      try { return w.send({ type: m.type, rid, ok: true, said: asks.request(String(m.id ?? ""), "", false, login) }); }
      catch (e) { return w.send({ type: m.type, rid, error: String((e as Error)?.message ?? e).slice(0, 200) }); }
    }
    case "team.session.give":
      return w.send({ type: m.type, rid, ...(await asks.answer(String(m.ask ?? ""), m.yes === true)) });
    // --- end Ask for a session
    // --- Show (#101, PROTOCOL.md round 27): who is showing a session now, or one shown session's last lines
    case "team.shown.get": {
      const login = typeof m.login === "string" ? m.login : "", id = typeof m.id === "string" ? m.id : "";
      if (!login || !id) return w.send({ type: "team.shown.get", rid, shows: shows.list() });
      const lines = shows.lines(login, id);
      return w.send({ type: "team.shown.get", rid, login, id, ...(lines ? { lines } : { lines: [], ended: true }) });
    }
    // #223 (A6): this face opened a teammate's show, or closed it; the hub sends a show's lines only to Sols watching it
    case "team.shown.watch": {
      const login = typeof m.login === "string" ? m.login : "", id = typeof m.id === "string" ? m.id : "";
      shows.watch(login, id, m.on !== false, w);
      return rid ? w.send({ type: "team.shown.watch", rid, login, id, on: m.on !== false }) : undefined;
    }
    // --- end Show

    // --- File it (#119, PROTOCOL.md round 29): the press takes the shot; the words file the issue; the number comes back
    case "team.file.shot": {
      try { return w.send({ type: "team.file.shot", rid, shot: fileItBlock() ? await viaBlock("shot", {}) : await takeShot() }); }
      catch (e) {
        const why = String((e as Error)?.message ?? e).slice(0, 200);
        return w.send({ type: "team.file.shot", rid, error: `no screenshot: ${why}` });
      }
    }
    // --- The review session (#416): a press on its card, the reviewer's own (tonight.ts checks it); answered by rid
    // fromSol is set by index.ts from the socket's own page, never taken from the message
    case "team.tonight.press": {
      const v = String(m.verdict ?? "") as Verdict;
      const r = await tonightPress(tonightDeps(), { sessionId: String(m.sessionId ?? ""), verdict: v, key: String(m.key ?? ""), window: m.fromSol === true, ...(Number(m.number) > 0 ? { number: Number(m.number) } : {}), ...(typeof m.fix === "string" ? { fix: m.fix } : {}) });
      return w.send({ type: "team.tonight.press", rid, ...r });
    }
    // the card's key, for Sol's own window only: the session's agent never sees it (tonight.ts keyOf)
    case "team.tonight.key": {
      if (m.fromSol !== true) return w.send({ type: "team.tonight.key", rid, error: "only Sol's own window" });
      return w.send({ type: "team.tonight.key", rid, key: tonightKey(String(m.sessionId ?? "")) });
    }
    // --- end The review session
    // --- Scoped and Approve (#482, checkpoint.ts): the Sol developer's press on the card in their session; the key first,
    // which only Sol's own window gets (fromSol is index.ts's word, never the message's)
    case "team.checkpoint.press": {
      const r = await pressCheckpoint({ me: async () => getTeam().me.login || (await myLogin().catch(() => "")), today: () => localDay(), bus: workBus },
        { sessionId: String(m.sessionId ?? ""), id: String(m.id ?? ""), key: String(m.key ?? ""), window: m.fromSol === true });
      return w.send({ type: "team.checkpoint.press", rid, ...r });
    }
    case "team.checkpoint.key": {
      if (m.fromSol !== true) return w.send({ type: "team.checkpoint.key", rid, error: "only Sol's own window" });
      return w.send({ type: "team.checkpoint.key", rid, key: checkpointKey(String(m.sessionId ?? "")) });
    }
    // --- end Scoped and Approve
    // --- "This broke" (#421, broke.ts): the person's press on a change in Cowork; the label, the comment, the cards
    case "team.broke": {
      try { return w.send({ type: "team.broke", rid, ...(await brokeNow({ repo: String(m.repo ?? ""), number: Number(m.number), why: m.why, agent: false })) }); }
      catch (e) { return w.send({ type: "team.broke", rid, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }); }
    }
    // --- end This broke
    // --- The hand-in card (#476, handin.ts): Bring it in / Not tonight, the change's author's own press; fromSol is set
    // by index.ts from the socket's own page, never taken from the message
    case "team.handin.press": {
      const choice = m.choice === "in" ? "in" : m.choice === "not" ? "not" : null;
      if (!choice) return w.send({ type: "team.handin.press", rid, error: "no such button" });
      const r = await handInBring(handInDeps(), { sessionId: String(m.sessionId ?? ""), id: String(m.id ?? ""), choice, key: String(m.key ?? ""), window: m.fromSol === true });
      return w.send({ type: "team.handin.press", rid, ...r });
    }
    // the card's key, for Sol's own window only: the session's agent never sees it. `box`: the wrap-up box's merge asks
    // for it too, in a session with no card yet (#579)
    case "team.handin.key": {
      if (m.fromSol !== true) return w.send({ type: "team.handin.key", rid, error: "only Sol's own window" });
      return w.send({ type: "team.handin.key", rid, key: handInCardKey(String(m.sessionId ?? ""), m.box === true) });
    }
    // the wrap-up box's merge (#579, handin.ts mergePress): ready if a draft, then merged; the person's own press, the
    // same key as the card's
    case "team.handin.merge": {
      const r = await handInMerge(cardDeps(), { sessionId: String(m.sessionId ?? ""), key: String(m.key ?? ""), window: m.fromSol === true, pr: m.pr });
      return w.send({ type: "team.handin.merge", rid, ...r });
    }
    // --- end The hand-in card
    case "team.file": {
      const s = getTeam();
      try {
        const held = typeof m.shot === "string" && fileItBlock() ? heldShot(m.shot) : null;   // for the block: the engine's own shot slot, a grab or a shot taken before it was loaded (main's path reads its own)
        const r: { number: number; url: string; shot: boolean; note?: string } = fileItBlock()
          ? JSON.parse(await viaBlock("file", { mode: m.mode, words: m.words, page: m.page, conversation: m.conversation, ...(held ? { image: held.toString("base64") } : typeof m.shot === "string" ? { shot: m.shot } : {}) }))
          : await fileIt({
          gh: (args) => runGh(args),
          ghInput: (args, body) => ghWithInput((a) => runGh(a), args, body),
          login: () => myLogin(),
          mayGitHub: () => mayAgentSpeak(s, "github"),
          repo: () => s.repos[0] ?? "",
          health: () => healthLine(healthNow()),
          build: async () => { const dir = resolve(HERE, "..", "..", "..", ".."); return (await Promise.all([runGit(["rev-parse", "--abbrev-ref", "HEAD"], dir), runGit(["rev-parse", "--short", "HEAD"], dir)])).join(" "); },
          shot: heldShot,
        }, { mode: m.mode, words: m.words, page: m.page, conversation: m.conversation, shot: m.shot });
        dropShot();
        void getBoard(true).catch(() => {});
        w.send({ type: "creature.receipt", lines: [`filed #${r.number}`, String(m.words ?? "").replace(/\s+/g, " ").trim().slice(0, 60)] });
        return w.send({ type: "team.file", rid, ...r });
      } catch (e) { return w.send({ type: "team.file", rid, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 240) }); }
    }
    // --- end File it
    default:
      return;
  }
}

// --- File it as Sol's own block (step 7 of the design): with the frame on and Sol's own block loaded (its card pressed,
// the key github pasted), the press and the words go to its tools in its big room; otherwise the path above, as before. A
// grab the engine holds goes as the picture itself (the room cannot read the engine's slot). Sol's own only: a block of
// that id in the home is the AI's, and the person's words and grab never go to one nobody pressed for this button
const FILE_IT = "file-it";
const fileItBlock = () => !!kernelNow()?.solOwnReady(FILE_IT, "file");
async function viaBlock(tool: "shot" | "file", args: Record<string, unknown>): Promise<string> {
  const plain = Object.fromEntries(Object.entries(args).filter(([, v]) => typeof v === "string"));   // its tools take words
  const r = await runThingTool(`thing_${FILE_IT}_${tool}`, plain, "face");
  const text = (r.content[0] as { text?: string })?.text ?? "";
  if (r.isError) throw new Error(text || `file it's ${tool} failed`);
  return text;
}

// --- Hand (#34): the record is the issue; the relay carries the word; every face hears a hand to me
const everyFace = (m: object) => { for (const f of faces.keys()) f.send(m); momentHeard(m); };   // a hand to me is a moment (notify.ts)
const quiet: Wire = { send() {} };
startHand({
  gh: runners.hand,
  git: gitCli,
  send: (word) => !onCloud() && sendRelay("hand", word),   // #214: a hand names GitHub logins; a cloud's names are Sol names
  me: async () => getTeam().me.login || (await myLogin().catch(() => "")),
  now: () => new Date(),
  session: async (id) => {
    const info = await sessionInfo(id).catch(() => undefined);
    const run = getRun(id);
    if (!info && !run) return null;
    const items = run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? [];
    return { title: String(info?.customTitle || info?.summary || ""), items, cwd: run?.cwd ?? info?.cwd, branch: info?.gitBranch };
  },
  folders: teamFolders,
  repos: () => getTeam().repos,
  cards: async () => (await getBoard()).cards,
  levelOf: (repo) => roomOfRepo(getTeam().rooms.map((x) => ({ ...x, repos: connectedRepos(x) })), repo)?.level,   // #1541
  // #1654 review: a member of the table that keeps the repo, now. Only the table in use can be asked (its org's members,
  // read fresh: strictMembers, null when GitHub did not answer), and only on a hub that knows people by GitHub (a
  // key-gated hub stamps the login the hello claimed); another table, no org, a key gate: never trusted
  trusted: async (login, repo) => {
    const s = getTeam(), r = roomOfRepo(s.rooms.map((x) => ({ ...x, repos: connectedRepos(x) })), repo);
    if (!askableTable(r, activeRoom(s), s.org)) return false;   // the table in use, its org, a hub that knows people by GitHub
    const list = await strictMembers().catch(() => null);
    return !!list?.some((x) => x.toLowerCase() === login.toLowerCase());
  },
  start: async ({ repo, cwd, issue, title, text, auto }) => {
    // the same session team.session.start makes: in the repo's folder, marked cowork, named after its card, its first
    // turn carrying the room's content and Sol's brief before the hand's words (#316)
    const id = randomUUID();
    // the table that keeps the hand's repository (#1541: its level is the session's mode), else the room in use
    const s0 = getTeam(), r = roomOfRepo(s0.rooms.map((x) => ({ ...x, repos: connectedRepos(x) })), repo) ?? activeRoom(s0), rec = recordOf(r), mk = roomMark(r, rec);   // before the await
    const ctx = await roomContext(rec);
    mark(id, { mode: "cowork", room: mk, roomId: r.id, ...(auto ? { handed: true, unread: true } : {}), ...(ctx.goalv ? { goalv: ctx.goalv } : {}), ...(ctx.memv ? { memv: ctx.memv } : {}) });
    void handleWork(quiet, { type: "work.say", sessionId: id, fresh: true, cwd, text: firstTurn(ctx.text, text) }).catch(() => {});
    void nameWhenWritten(id, `#${issue} ${title || basename(cwd)}`.slice(0, 80));
    return id;
  },
}, everyFace);
onRelay("hand", (m) => { if (!onCloud()) heard(m); });   // #214: never from a Sol name taken for a GitHub login
onBoard(() => boardRead());
// --- end Hand
// --- The timeline (#424, timeline.ts): Sol's own checkout, read on the first ask (never at start), kept beside Work's
// state; everyone on it as the roster says now. No face asks it since #1299 (its wire message went in #1376): the v3 people
// wire and team.releases read it
const timelineDeps = (): TimelineDeps => ({
  dir: resolve(HERE, ".."),
  gh: (args) => runGh(args),
  repo: () => remoteOf(resolve(HERE, "..")),
  developer: async (repo) => { const r = await rhythmOf({ gh: (a) => runGh(a), now: () => new Date() }, repo).catch(() => null); const me = getTeam().me.login.toLowerCase(); return !r || r.dev.some((x) => x.toLowerCase() === me); },
  night: async (repo) => { const r = await rhythmOf({ gh: (a) => runGh(a), now: () => new Date() }, repo).catch(() => null); return r ? { handIn: r.handIn, review: r.review, until: r.until, release: r.release, zone: r.zone, dev: r.dev, beta: r.beta, devBackup: backupsOf(r, "dev"), betaBackup: backupsOf(r, "beta"), handover: r.handover } : null; },   // only backups that count (#478)
});
keepTimelineIn(join(STATE_DIR, "timeline.json"));
function timelineAsk(fresh = false) {
  const s = getTeam(), me = onCloud(s) ? hubLogin(s) : s.me.login;
  const roster = relayRoster().filter((e) => !e.agent);
  const people = [{ login: me, version: roster.find((e) => e.who === me)?.version ?? versionNow() }, ...roster.map((e) => ({ login: e.who, version: e.version ?? null })), ...teamMembers().map((login) => ({ login, version: null }))];
  return timelineNow(timelineDeps(), { me, people, fresh });
}
// --- end The timeline
// --- The review session (#416, tonight.ts): once a minute, a review the project's rhythm names me for opens itself on
// the engine my window is on, in my folder for the project, as a Work session with the summary and its card. Marked cowork under the room that has the
// repo when there is one (Cowork lists it there); else a plain Work session, so it is never hidden
const tonightDeps = (): TonightDeps => ({
  me: () => getTeam().me.login,
  // where the person is: a face on this engine (a NucBox with no window waits, the review stays due until the morning);
  // SOL_TONIGHT=off in sol/engine/.env keeps an engine out of it
  present: () => process.env.SOL_TONIGHT !== "off" && !isQuiet() && solWindowOn(),
  folders: async () => {
    const s = getTeam();
    const own = await remoteOf(resolve(HERE, "..", "..", "..", "..")).catch(() => "");   // this Sol's own repository: SOL's rhythm lives there
    const repos = [...new Set([...s.repos, ...s.rooms.flatMap((r) => connectedRepos(r)), ...(own ? [own] : [])])];
    return workFolders(repos);
  },
  gh: (args) => runGh(args),
  now: () => new Date(),
  start: async ({ cwd, repo, title, text, id: given, role }: Parameters<TonightDeps["start"]>[0] & { role?: string }) => {
    const id = given ?? randomUUID();   // a re-check's own id (#421): its one tool was given to that id first
    if (role) mark(id, { role });   // its part (#484), before its first run: the guard holds it from the first call
    const s = getTeam(), r = s.rooms.find((x) => connectedRepos(x).some((y) => y.toLowerCase() === repo.toLowerCase()));
    if (r) mark(id, { mode: "cowork", room: roomMark(r, recordOf(r)), roomId: r.id, unread: true });
    else mark(id, { unread: true });
    await handleWork(quiet, { type: "work.say", sessionId: id, fresh: true, cwd, text });
    void nameWhenWritten(id, title);
    return id;
  },
  bus: workBus,
  say: (l) => console.log(l),
  ping: (p) => { if (!onCloud()) wakeUp().send({ to: p.to, pingKind: "decision", line: p.line, issue: p.issue, repo: p.repo }, true); },
});
// the hand-in session (#420, handin.ts): the same engine, folders and start as the review's, plus git in the folder
// for the clashes (its origin fetched, then merged in memory; nothing checked out)
const handInDeps = (): HandInDeps => ({
  ...tonightDeps(),
  start: (a) => tonightDeps().start({ ...a, role: "hand-in" } as Parameters<TonightDeps["start"]>[0]),   // the hand-in session's part (#484)
  git: (cwd, args) => new Promise((ok) =>
    execFile("git", args, { cwd, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: String(out) || String(errOut) }))),
});
// the hand-in card (#476, handin.ts scan): the hand-in's deps, plus this machine's Work sessions, where a session's talk
// ends (the card sits after it), and its row marked unread
const cardDeps = (): CardDeps => ({
  ...handInDeps(),
  sessions: async () => (await workSessions()).sessions,
  lastItem: async (id) => {
    const run = getRun(id);
    const list = run ? run.items.list : (await sessionItems(id).catch(() => null))?.list ?? [];
    return list.length ? list[list.length - 1].id : "";
  },
  unread: (id) => { mark(id, { unread: true }); broadcastSessions(); },
  opened: (id, cwd) => openedInFiles(transcriptFiles(id, cwd)),   // the PRs it or its background agents opened (#579)
});
/** POST /tonight (index.ts): a review or the hand-in opened now, by the person on this Mac */
export const tonightNow = (role: "dev" | "beta" | "hand-in", repo?: string) => role === "hand-in"
  ? openHandInNow(handInDeps(), { ...(repo ? { repo } : {}) })
  : tonightOpen(tonightDeps(), { role, ...(repo ? { repo } : {}) });
/** the tool hand_in (work/tools.ts): the hand-in session's agent takes one of the person's PRs back to draft, when the
 *  project lets agents pick; ready is refused, the person's press hands in (#476; handin.ts pick checks it all) */
export const handInMark = (sessionId: string, number: number, ready: boolean) => handInPick(handInDeps(), { sessionId, number, ready });
/** "this broke" (#421), from a press here or an agent's tool (work/wire.ts) */
export const brokeNow = (a: { repo: string; number: number; why: unknown; agent: boolean }) => thisBroke(tonightDeps(), a);
// the slight send backs before the review (#421, sentback.ts): one made severe at `until` shows "back from last night"
// on the review that opens after it
const nightTick = () => {
  if (isQuiet()) return;   // no review, hand-in or send-back session opens itself on a quiet Sol (#1293)
  void (async () => { const d = tonightDeps(); await sentBackTick(d).catch(() => {}); await tonightTick(d).catch(() => {}); })();
  void handInTick(handInDeps()).catch(() => {});
  void handInScan(cardDeps()).catch(() => {});   // every two minutes inside (#476)
};
setTimeout(nightTick, 30_000).unref?.();
setInterval(nightTick, 60_000).unref();
// --- end The review session
// --- Carrying own changes over (#425, carry.ts): the session sits in a side copy, filed under the repo like any Work
// session; the live folder moves only when nothing is at work in it (a Work run, a talk), side copies aside
const SOL_ROOT = resolve(HERE, "..", "..", "..");
void startCarry({
  root: SOL_ROOT,
  open: async ({ cwd, title, text }) => {
    const id = randomUUID();
    mark(id, { unread: true });
    await handleWork(quiet, { type: "work.say", sessionId: id, fresh: true, cwd, text });
    void nameWhenWritten(id, title);
    return id;
  },
  working: (id) => !!getRun(id)?.working,
  // quiet: nothing at work in the live folder itself; a side copy under it (its own worktree, the carry's among them) is
  // a folder of its own that the move does not touch. The live folder may itself be a side copy, so only below it counts
  quiet: (top, copy) => busyIn(top).every((j) => !!j.cwd && (j.cwd.startsWith(`${top.replace(/\/+$/, "")}/.claude/worktrees/`) || (!!copy && (j.cwd === copy || j.cwd.startsWith(`${copy}/`))))),
  tell: (m) => everyFace(m),
  updated: (release) => { answered(release); void refreshVersion(); },
  now: () => new Date(),
  wentBack: (c) => wentBack(c),   // #426: a carry onto an older release, landed: the data and the pin
}).catch(() => {});
// --- end Carrying own changes over
// --- Pin and go back (#426, pin.ts): the release's engine built with the TypeScript the build watcher runs; once
// saved data was put back the engine ends itself and its keeper starts that build
void startPin({
  root: SOL_ROOT,
  ctx: convertCtx,
  now: () => new Date(),
  build: () => new Promise((ok) => execFile(process.execPath, ["node_modules/typescript/bin/tsc"], { cwd: join(SOL_ROOT, "engine"), timeout: 300_000, maxBuffer: 16 * 1024 * 1024 },
    (err, out, errOut) => ok(err ? (`${out}${errOut}`.trim() || String(err.message)) : null))),
  exit: () => { console.log("pin: went back; the engine ends so its keeper starts the release's build"); process.exit(0); },   // at once: no timer of the newer code writes on the older data
  tell: (m) => everyFace(m),
  touched: (id) => { const s = STEPS.find((x) => x.id === id); try { return !!s && s.touches(convertCtx).length > 0; } catch { return true; } },
  carry: (a) => carryOver({ kind: "update", onto: a.onto, source: "HEAD", tag: a.tag, base: a.base, back: a.back }),
  pinned: (p) => pinChanged(!!p),
  moved: () => void refreshVersion(),
}).catch(() => {});
// --- end Pin and go back
// --- GitHub from a card (#174): every face, not only Cowork's. Control sits in Settings in every mode, on the page's
// one link, and that link says team.hello only while Cowork is open, so everyoneTeam would miss a sign-in from Life
onConnect((r) => everyFace("login" in r ? { type: "team.github.connected", login: r.login } : { type: "team.github.connect.failed", error: r.error }));
onConnect((r) => { if ("login" in r) noteGithub({ in: true, who: r.login }); });   // #320: GitHub here now, said to the room and the tab
// --- end GitHub from a card
// --- Try (#35): the try's steps, its state and its review items go to every Cowork face
setTryBus(everyoneTeam);
// --- end Try
// --- Pings (#100): a ping to me lands on my agent first (the spool), then my dial says whether it is a card; a
// "when it matters" call that keeps one from me is written in one line on its issue, signed by my agent
// heardPing keeps it for my agent, writes the absorbed line, and gives back the card my dial makes, or null
function heardPing(m: Record<string, any>): object | null {
  const p = pingOf(m);
  if (!p) return null;
  keepPing(p);
  const s = getTeam();
  // an audit asked while "what leaves this machine" says never: my agent turns it down at once, no card (the switch's word)
  const no = auditTurnedDown(p, s.leaves.audit, s.me.login);
  if (no) { wakeUp().send({ to: p.from.login, line: no, pingKind: "chat" }, true); return null; }
  const r = route(p.kind, s.dials[p.kind]);
  if (r.written) void writeAbsorbed(p).catch(() => {});
  return r.card ? { type: "team.pinged", id: p.id, kind: p.kind, from: p.from, line: p.line, at: p.at, ...(p.issue ? { issue: p.issue } : {}), ...(p.repo ? { repo: p.repo } : {}), ...(m.spooled ? { spooled: true } : {}) } : null;
}
async function writeAbsorbed(p: Ping) {
  const s = getTeam();
  if (!p.issue || !p.repo || !s.me.login || !mayAgentSpeak(s, "github")) return;
  if (!s.repos.some((r) => r.toLowerCase() === p.repo!.toLowerCase())) return;
  await record().notes.add(p.issue, absorbedLine(s.me.login, p), p.repo);
}
// a flipped dial: written once on my plan (team_note's plan kind), on the issue of the last ping of that kind
async function writeLearned(lines: string[]) {
  const s = getTeam();
  const folders = await teamFolders();
  for (const line of lines) {
    const kind = /^dial (\w+)/.exec(line)?.[1] ?? "";
    const last = lastPing(kindOf(kind));
    const repo = last?.repo ?? s.repos[0];
    const cwd = folders[repo];
    if (!last?.issue || !cwd) continue;   // no issue to name: the face said it, the plan waits for the next flip
    await teamNote({ cwd, gh: runGh, git: runGit, login: myLogin, mayGitHub: () => mayAgentSpeak(getTeam(), "github") }, { issue: last.issue, kind: "plan", lines: line });
  }
}
// --- end Pings
// --- Routing (#118, leads.ts): an issue I opened that wears a label gets its leads assigned and pinged on my board's
// read; only mine, so two Sols never route the same issue. The night job routes everyone's. Not at once: an issue I
// open I usually take next, and a lead assigned first makes my own sol/take refuse it (#1711), so mine waits
// ROUTE_AFTER untaken first
const ROUTE_AFTER = 30 * 60_000;
const routed = new Map<string, Set<number>>();   // repo -> issues settled in this engine's life
onBoard((b) => void routeMine(b).catch(() => {}));
async function routeMine(b: Board) {
  const s = getTeam();
  const me = s.me.login.toLowerCase();
  if (!me || !mayAgentSpeak(s, "github")) return;
  for (const repo of b.repos) {
    const l = b.leads?.[repo];
    if (!l) continue;
    const mine = b.cards.filter((c) => c.repo === repo && c.state === "open" && c.author.toLowerCase() === me
      && Date.now() - (Date.parse(c.created) || Date.now()) >= ROUTE_AFTER);
    if (!routed.has(repo)) routed.set(repo, new Set());
    await routeIssues({ gh: runGh, repo, dryRun: false, say: () => {}, seen: routed.get(repo),
      ping: (p) => !onCloud() && wakeUp().send({ to: p.to, pingKind: p.kind, line: p.line, issue: p.issue, repo }, true) }, mine, l);   // #214: GitHub logins
  }
}
// --- end Routing
// --- Show (#101): a shown session's lines (mine, and a teammate's heard on the relay) go to every Cowork face; a
// teammate who leaves the relay without an end is no longer showing
setShowBus(everyoneTeam);
onRelay("show", (m) => shows.hear(m));
onRelayStatus(() => shows.prune(relayRoster().map((r) => r.who)));
// #223: when a hub answers my hello, the shows watched here are asked for again and, on one that sends lines to watchers
// only, mine say start again (a hub that restarted forgot both). A watch it refused is asked again when the light is
// back to green, or after the wait it named
onRelay("hub", (m) => {
  if (m.say === "hello") { sayInside(); shows.again(m.watch === true); }   // #238: what the room in use may see, settled before any start is said again
  else if (m.say === "light" && m.light === "green") shows.again(false);
  else if (m.say === "watch" && m.ok === false && typeof m.login === "string" && typeof m.session === "string" && Number(m.after) > 0) {
    const key = `${m.login}/${m.session}`;
    clearTimeout(reasks.get(key));   // one wait a show, however many refusals came
    reasks.set(key, setTimeout(() => { reasks.delete(key); if (relayUp()) shows.ask(key); }, Math.min(600, Number(m.after)) * 1000 + Math.random() * 5000));
    reasks.get(key)!.unref();
  }
});
const reasks = new Map<string, ReturnType<typeof setTimeout>>();
// --- end Show
// --- The hub's word (#223, S6a): a busy cloud's light, my place in its queue, a message it said to send again, a show
// it would not let me watch, "please update". Every Cowork face hears it as team.hub and says it in place
const HUB_WORDS = ["say", "light", "ok", "why", "after", "login", "session", "ahead", "wait", "what", "on", "join"];   // join (#327): its host serves the join page
onRelay("hub", (m) => {
  if (!["light", "queue", "retry", "watch", "update", "hello"].includes(String(m.say))) return;
  everyoneTeam({ type: "team.hub", ...Object.fromEntries(HUB_WORDS.filter((k) => k in m).map((k) => [k, (m as Record<string, unknown>)[k]])) });
});
function hubNow() { const i = relayHub(); return { type: "team.hub", say: "state", light: i.info?.light ?? "green", old: i.old, join: i.info?.join === true, ...(i.queued ? { ahead: i.queued.ahead, wait: i.queued.wait } : {}) }; }
// --- end The hub's word

// --- Cowork v3 (fr-30): every team.v3.* message, one place. The switch off: no answer, nothing loaded (F7). The face
// speaks room ids; the trail's project ids (a room's cloud code, else its id's slug) are made in team/v3/door.ts.
const V3_SLICE: [RegExp, string][] = [
  [/^team\.v3\.(append|since|record)$/, "trail"],                       // slice 0, the trail and the record
  [/^team\.v3\.(migrate\.dry|migrate\.run|on)$/, "switch"],            // slice 8, the import and the switch per project
  [/^team\.v3\.cross\./, "cross"],                                     // slice 1, the crossing
  [/^team\.v3\.(front|plan|needsme)$/, "plan"],                         // slice 2, the front, Space and Plan, the one count
  [/^team\.v3\.(people|window|running)$/, "people"],                    // slice 3, People, my window, Running
  [/^team\.v3\.places\./, "places"],                                   // slice 4, places and routing
  [/^team\.v3\.(talk|setup|join)\./, "five"],                           // slice 5, Talk per item, setup, joining
  [/^team\.v3\.studio\./, "studio"],                                   // slice 6, the studio and the nights
  [/^team\.v3\.(artifacts|search|floor)\./, "seven"],                   // slice 7, artifacts, search, the floor
  [/^team\.v3\.way\./, "way"],                                         // the ways (#987), behind their own switch too
];
// What a v3 message may do from a socket that is not Sol's own window (#1074): read, and only read. Everything else
// writes as me (a trail event signed by this machine, a key, a pairing code, a grant on GitHub), so it is Sol's own
// window's press only, as team.v3.running's review is; a message that is not named here is a write
const V3_READS = new Set([
  "team.v3.since", "team.v3.record", "team.v3.migrate.dry", "team.v3.on", "team.v3.cross.landed", "team.v3.front", "team.v3.needsme",
  "team.v3.places.read", "team.v3.places.reach", "team.v3.places.letin",
  "team.v3.talk.threads", "team.v3.talk.thread", "team.v3.talk.asks", "team.v3.setup.open", "team.v3.setup.answer", "team.v3.join.waiting", "team.v3.join.arrival",
  "team.v3.studio.list", "team.v3.studio.parse", "team.v3.studio.log",
  "team.v3.artifacts.list", "team.v3.artifacts.get", "team.v3.artifacts.export", "team.v3.search.query",
  "team.v3.way.read",
]);
// not here, though they look like reads: people, window and running seed a project's members as me on first look
// (people.ts peopleOf), and floor.get makes this machine's keys if there are none (floor.ts devices)
/** whether a team.v3.* message only reads; fromSol is index.ts's word from the socket, never the message's */
export function v3Reads(m: { type?: unknown; op?: unknown }): boolean {
  const type = String(m.type ?? "");
  if (V3_READS.has(type)) return true;
  return type === "team.v3.plan" && (m.op === undefined || m.op === "" || m.op === "read");   // a read without an op, a write with one
}
async function handleV3(w: Wire, m: any, rid: ReturnType<typeof RID>) {
  if (!coworkV3()) return;
  const which = V3_SLICE.find(([re]) => re.test(m.type))?.[1];
  if (!which) return;
  if (m.fromSol !== true && !v3Reads(m)) return w.send({ type: "team.error", rid, message: "only Sol's own window" });
  const me = getTeam().me.login;
  switch (which) {
    case "trail": {
      v3mod ??= await import("./v3/index.js");
      const { projectFor } = await import("./v3/project-id.js");
      return w.send(await v3mod.answerV3({ ...m, ...(typeof m.project === "string" ? { project: projectFor(m.project) } : {}) }, me));
    }
    case "switch":
      v3mod ??= await import("./v3/index.js");
      return w.send(await (await import("./v3/switchwire.js")).answerSwitch(m, me));
    case "cross": return (await import("./v3/crossing-wire.js")).handleCrossing(w, m, rid);
    case "plan": return w.send(await (await import("./v3/planwire.js")).handleV3Plan(m));
    case "people": {
      const { handleV3: people } = await import("./v3/peopleWire.js");
      try { return w.send({ type: m.type, rid, ...(await people(v3Deps(), m)) }); }
      catch (e) { return w.send({ type: m.type, rid, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }); }
    }
    case "places": return w.send(await (await import("./v3/places-wire.js")).handleV3Places(m, { usage: (id) => usageOf(usageDeps(), id) }));
    case "five": return w.send(await (await import("./v3/wire5.js")).handleV3Five(m, { me, push: everyoneTeam, projects: () => getTeam().rooms.map((r) => ({ id: r.id, name: r.name || r.id })) }));
    case "studio": return w.send(await (await import("./v3/studio-wire.js")).handleStudio(m));
    case "way": {
      if (!(await import("./v3/way-switch.js")).waysOn()) return;   // the ways' switch off: no answer, nothing of the ways loaded
      const a = await (await import("./v3/way-wire.js")).answerWay(m, { me: () => me });
      return a ? w.send(a) : undefined;
    }
    case "seven": {
      const login = me || (await myLogin().catch(() => ""));
      return w.send(await (await import("./v3/floorwire.js")).answerSeven(m, { me: login, projects: getTeam().rooms.map((r) => r.id) }));
    }
  }
}
/** what slice 3's answers read, from what this file already reads */
function v3Deps(): import("./v3/peopleWire.js").V3Deps {   // a type only: erased at build
  const s = getTeam(), room = activeRoom(s);
  const me = onCloud(s) ? hubLogin(s) : s.me.login;
  const rhythm = (repo: string) => rhythmOf({ gh: (a) => runGh(a), now: () => new Date() }, repo)
    .then((r) => (r ? { handIn: r.handIn, review: r.review, release: r.release, zone: r.zone, dev: r.dev, devBackup: backupsOf(r, "dev") } : null));
  return {
    me: () => me,
    project: () => ({ id: room.id, repos: room.repos.length ? room.repos : s.repos, owners: [me], members: teamMembers().filter((x) => x.toLowerCase() !== me.toLowerCase()) }),
    roster: () => relayRoster(),
    prs: () => peekBoard()?.prs ?? [],
    timeline: async () => { const t = await timelineAsk(); return { waiting: t.waiting, releases: t.releases, people: t.people }; },
    rhythm,
    reds: () => import("./v3/places-wire.js").then((x) => x.redsOf(room.id)),   // Running's red line: its places' own sign-ins
    openReview: (repo) => tonightNow("dev", repo),
    // the dev review open now, if one is: its card's verdicts are the presses (titled "dev review · <night>", tonight.ts)
    reviewOpen: async () => (await workSessions()).sessions.filter((x) => !x.archived && /^dev review · /.test(x.title ?? "") && Date.now() - x.updatedAt < 16 * 3_600_000)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null,
  };
}
// --- end Cowork v3
