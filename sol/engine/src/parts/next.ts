// The new face's beside-state (#1604, slice 7b of the port, #1615; docs/port/switch.md, slices.md "The contract between
// face and engine"): places on the plane, the diary, the move-in read, and next.state. Behind the switch
// ui.next (settings.ts uiNext(), read on every message): off, no next.* message here is answered, and nothing is written
// or read. Everything it writes is under SOL_HOME/next/ (src/next/). Each message type is its own (no "next." prefix),
// so slice 7a's part answers its own next.* beside this one.
//   next.state                      → next.state to the asker (the face's wire asks on attach)
//   next.pos.set {id,x,y,w,h,by,touched} → next.pos {id, ...} and next.state to every window
//   next.zones.set                  → next.refused: zones are gone (BR1, 2026-11-21), a folder is just a folder
//   next.diary.get {day?}           → next.diary {day, lines, paused} to the asker
//   next.diary.write / .remove / .pause → next.diary to every window (and next.state, today's page being in it)
//   next.movein.read                → next.movein (carry.ts + carry-apps.ts, read only) + judged (movein-place.ts), kept, lead
//   next.movein.lead {lead}         → next.movein.kept {movein} to the asker, next.state to every window
//   next.folder.pick {prompt?, for?} → next.folder.picked {path, kind} | {cancelled} | {error} to the asker
//   next.movein.keep {keep, fix, drop, apart?, into?} →next.movein.kept {movein, batch, placed} to the asker (BR1 item 7: one batch id),
//                                     next.state to every window
//   next.movein.back {batch}        → next.movein.kept {ok, undone} | {ok: false, why, again} (again: Read again instead)
//   every next.movein, next.movein.kept and next.state carries `folders`, the person's folders as one tree (next/tree.ts, #1816): the
//   one list the canvas draws and "Set up for you" names (BR1)
//   next.shelf                      → next.shelf {shelf, n, awake} to the asker
//   next.shelf.put {folder, name} · .take {folder} → next.shelf to every window; a take of a folder the move-in
//                                     removed keeps it again: next.movein.kept and next.state to every window too
//   next.traces {day?}              → next.traces {day, days, runs, coverage} to the asker
//                                     (next/traces.ts, read only; signed: franktsai2008-eng's agent)
// Every one of these answers only one of Sol's own windows (door.ts doorOpen, fromSol), as next-calls.ts's do: any other
// socket is refused and nothing is read or written for it (#1615). A message that is not what it should be changes
// nothing: next.refused {asked, why} to the asker alone.
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import type { Engine, Heard, Parts } from "../parts.js";
import { getSettings, onUiNext, uiNext } from "../settings.js";
import { STATE_DIR } from "../work/state.js";
import { logDir } from "../log.js";
import { homedir } from "node:os";
import { carry, type Where } from "../next/carry.js";
import { appsWhere } from "../next/carry-apps.js";
import { setPos } from "../next/pos.js";
import { DAY, dayOf, diaryMsg, pauseDiary, removeLine, writeLine } from "../next/diary.js";
import { becauseFor } from "../next/you-known.js";
import { dayWords, recordHomeOf, type Where as YouWhere } from "../next/you.js";
import { keepMoveIn, markBatch, migOf, readMoveIn, setLead, unkeep, type MoveInKept } from "../next/movein.js";
import { backMoveIn, foldersOf, holdsAll, judge, keepPlaces, shelfNow, shelfPut, shelfTake } from "../next/movein-place.js";
import { pickFolder } from "../next/pick.js";
import { stateMsg, treeOf } from "../next/state.js";
import { treeDirs, treeKey, type TreeFolder } from "../next/tree.js";
import { setSaidTool } from "../next/said.js";   // the person's folders from their own words (#1816)
import { watch, type FSWatcher } from "node:fs";
import { tracesMsg } from "../next/traces.js";
import { withWork } from "../next/traces-work.js";
import { needsList } from "./next-calls.js";
import { considered } from "../next/tidy.js";

/** where the move-in and the state read today's stores (work.json beside SOL_STATE, the log outside the home) */
export const whereOf = (home: string): Where => ({
  home,
  state: process.env.SOL_STATE || join(STATE_DIR, "work.json"),
  logDir: logDir(home),
  settings: getSettings() as unknown as Record<string, unknown>,
});

// the move-in read is the one that also reads Claude Code and Codex (carry-apps.ts, read only), with what was kept
// with every place judged (movein-place.ts, read only too): its parent by the disk, the shelf by how it was lived in
// read 2 (migration.html B): once the person has written what they do day to day (next.you.day), the same read looks
// again knowing their words, which only open folders of their home read 1 skipped (carry-said.ts); never inside Sol's
export function readIn(home: string) {
  // the person's home, SOL_HOME, an app's storage and a sync root are never a folder (movein-place.ts holdsAll)
  const user = process.env.HOME || homedir(), homes = [user, home], words = dayWords(you(home));
  const said = words ? { words, user, never: (q: string) => holdsAll(q, homes) || q.startsWith(home + "/") } : undefined;
  const read = foldersOf(carry({ ...whereOf(home), apps: appsWhere(homedir(), process.env, [STATE_DIR]), said }), homes);
  return { read, judged: judge(read, undefined, { stop: homes }) };
}
export function you(home: string): YouWhere { const user = process.env.HOME || homedir(); return { sol: home, user, rec: recordHomeOf(home, user) }; }
// (exported for the sort offered after the move-in, parts/next-tidy.ts: the same read, never a copy; builder T)

type H = (m: any, h: Heard) => unknown;
export const NOT_OWN = "only Sol's own windows";
export const ZONES_GONE = "zones are gone: a folder is just a folder, and it sits where it is put";

export default function (p: Parts) {
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  /** a message of this part: nothing at all while the switch is off, and refused unless it comes from Sol's own window */
  const own = (type: string, f: H) => p.on(type, (m, h) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, type, NOT_OWN);
    return f(m, h);
  });
  /** every window hears the state; the tree it carries is the one followed on the disk from then on */
  const tellState = async (e: Engine) => { const msg = await stateMsg(whereOf(e.HOME)); follow(e, msg.folders); e.everyone(msg); };
  /** next.movein.kept with the person's folders, the one tree (next/tree.ts) */
  const keptMsg = (h: Heard, m: { movein: MoveInKept | null; [k: string]: unknown }) => ({ type: "next.movein.kept", ...m, folders: treeOf(whereOf(h.HOME), m.movein) });

  // the tree follows the disk (#1816): where one of its folders sits changes (a folder moved, renamed, put in the Trash,
  // one made in Sol's home) and every window hears the state again, once the tree is not what it was
  let followed: { key: string; ws: FSWatcher[]; t?: NodeJS.Timeout } | null = null;
  const follow = (e: Engine, tree: TreeFolder[]) => {
    const key = treeKey(tree);
    if (followed?.key === key) return;
    for (const x of followed?.ws ?? []) x.close();
    clearTimeout(followed?.t);
    const f: NonNullable<typeof followed> = followed = { key, ws: [] };
    const again = () => {
      clearTimeout(f.t);
      f.t = setTimeout(() => { if (followed === f && uiNext() && treeKey(treeOf(whereOf(e.HOME))) !== f.key) void tellState(e); }, 1500);
    };
    for (const d of treeDirs(tree, e.HOME).slice(0, 200)) try { f.ws.push(watch(d, { persistent: false }, again)); } catch { /* not there, or not ours to watch */ }
  };

  own("next.state", async (_m, h) => {
    const msg = await stateMsg(whereOf(h.HOME), () => needsList(h.HOME));
    follow(h, msg.folders);
    h.send(h.ws, msg);
  });
  own("next.pos.set", async (m, h) => {
    const r = setPos(h.HOME, m);
    if (!r.ok) return refuse(h, "next.pos.set", r.why);
    h.everyone({ type: "next.pos", id: r.id, ...r.pos });
    await tellState(h);
  });
  // BR1 (#1615, 2026-11-21): zones are gone, the canvas holds only folders; an old face's ask is refused, nothing written
  own("next.zones.set", (_m, h) => refuse(h, "next.zones.set", ZONES_GONE));
  own("next.diary.get", (m, h) => {
    const day = typeof m.day === "string" && DAY.test(m.day) ? m.day : dayOf(new Date());
    h.send(h.ws, diaryMsg(h.HOME, day));
  });
  const diaryChanged = async (h: Heard, day: string) => {
    h.everyone(diaryMsg(h.HOME, day));
    if (day === dayOf(new Date())) await tellState(h);
  };
  // a line written for a session (m.session) is Sol's, and carries its because or is refused (one store, #1615)
  own("next.diary.write", async (m, h) => {
    const user = process.env.HOME || homedir(), sid = typeof m.session === "string" && m.session.trim() ? m.session.trim() : null;
    const r = writeLine(h.HOME, m, new Date(), sid ? { session: sid, because: becauseFor({ sol: h.HOME, user, rec: recordHomeOf(h.HOME, user) }, m.because, sid) } : undefined);
    if (!r.ok) return refuse(h, "next.diary.write", r.why);
    await diaryChanged(h, r.day);
  });
  own("next.diary.remove", async (m, h) => {
    const r = removeLine(h.HOME, m);
    if (!r.ok) return refuse(h, "next.diary.remove", r.why);
    await diaryChanged(h, r.day);
  });
  own("next.diary.pause", (m, h) => {
    pauseDiary(h.HOME, m.on !== false);
    h.everyone(diaryMsg(h.HOME, dayOf(new Date())));
  });
  own("next.movein.read", (_m, h) => {
    const kept = readMoveIn(h.HOME), { read, judged } = readIn(h.HOME);
    h.send(h.ws, { ...read, judged, kept, folders: treeOf(whereOf(h.HOME), kept), lead: kept?.lead ?? null });
  });
  // what the person wants to see first (BR1): kept beside the move-in's answers; every window hears the state, so the
  // plane's starting arrangement follows
  own("next.movein.lead", async (m, h) => {
    const r = setLead(h.HOME, m);
    if (!r.ok) return refuse(h, "next.movein.lead", r.why);
    h.send(h.ws, keptMsg(h, { movein: r.movein }));
    await tellState(h);
  });
  // a folder of this Mac, chosen in macOS's own picker (next/pick.ts): its path and what it holds, or cancelled
  own("next.folder.pick", async (m, h) => h.send(h.ws, { type: "next.folder.picked", ...(await pickFolder(typeof m.prompt === "string" ? m.prompt : undefined)), ...(typeof m.for === "string" ? { for: m.for } : {}) }));
  // How Sol worked (#1615): a person's own history, so only Sol's own windows hear it, as needs are
  own("next.traces", (m, h) => {
    const w = whereOf(h.HOME);
    // with the work plans, the automations and the planner in it (next/traces-work.ts)
    h.send(h.ws, withWork(tracesMsg({ home: w.home, logDir: w.logDir }, m.day), w.home));
  });
  // the kept folders placed under one batch (the field E's Undo takes); a Back takes the whole batch out, until the
  // person's first own change (then again: true, and the face offers Read again)
  // every window then hears the state, its `folders` the one tree the canvas and the sidebar draw (next/tree.ts)
  own("next.movein.keep", async (m, h) => {
    const before = readMoveIn(h.HOME), kept = keepMoveIn(h.HOME, m), judged = readIn(h.HOME).judged, { batch, placed } = keepPlaces(you(h.HOME), judged, kept.keep, undefined, kept.drop, migOf(m));
    markBatch(h.HOME, batch, before);
    considered(h.HOME, judged, kept.keep);   // what the move-in weighed, so the sort after it never offers it again (next/tidy.ts)
    h.send(h.ws, keptMsg(h, { movein: readMoveIn(h.HOME), batch, placed }));
    await tellState(h);
  });
  // the whole move-in back: its placements out and its answers as they were before it (movein.ts unkeep)
  own("next.movein.back", async (m, h) => {
    const r = backMoveIn(you(h.HOME), m);
    h.send(h.ws, keptMsg(h, { ...r, movein: r.ok ? unkeep(h.HOME, r.batch) : readMoveIn(h.HOME) }));
    if (r.ok) await tellState(h);
  });
  // the shelf: what is on it (Sol's and the person's), its count, what woke; a put or a take answers with the shelf
  const shelfMsg = (h: Heard) => ({ type: "next.shelf", ...shelfNow(you(h.HOME), h.HOME) });
  own("next.shelf", (_m, h) => h.send(h.ws, shelfMsg(h)));
  // a put or a take changes what every canvas draws (a folder on the shelf is off it): every window hears the shelf
  own("next.shelf.put", (m, h) => { const r = shelfPut(you(h.HOME), m); return r.ok ? h.everyone(shelfMsg(h)) : refuse(h, "next.shelf.put", r.why); });
  // a folder taken off the shelf that the move-in removed is kept again, so the canvas draws it at once: the one list
  // to every window (first-timer P 4; BR1 order 2)
  own("next.shelf.take", async (m, h) => {
    const r = shelfTake(you(h.HOME), m);
    if (!r.ok) return refuse(h, "next.shelf.take", r.why);
    if (readMoveIn(h.HOME)?.drop.includes(r.folder)) { h.everyone(keptMsg(h, { movein: keepMoveIn(h.HOME, { keep: [r.folder] }) })); await tellState(h); }
    h.everyone(shelfMsg(h));
  });

  // the switch turned on while the engine runs: every window hears the state (off: nothing is said)
  p.atStart((e) => { onUiNext((on) => { if (on) void tellState(e).catch(() => {}); }); });
  // folders_set (next/said.ts) writes into this home; every window then hears the state with the new tree (#1816)
  p.atStart((e) => setSaidTool(e.HOME, () => void tellState(e).catch(() => {})));
}
