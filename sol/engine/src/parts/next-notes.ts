// Notes and sessions inside folders for the new face (BR1, frame.html parts 5 and 6): next.note.*, next.notes.*,
// next.folder.* and next.folders.* (sol/PROTOCOL.md "## next"; next/notes.ts, next/folders.ts). Behind ui.next, from
// Sol's own windows only (NOT_OWN), one change at a time. Sessions run through the hands work plans use
// (parts/next-work.ts hands(), work/one.ts sessionHands): no second runner. A new note writes its one Diary line
// ("You noted …"); a session's turn that ends (work/runs.ts onTurnEnd, #1802) and the folders' clock (every 5 s while
// ui.next is on) write back what a finished session said.
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import type { Engine, Heard, Parts } from "../parts.js";
import { onUiNext, uiNext } from "../settings.js";
import { sessionHands } from "../work/one.js";
import { dayOf, diaryMsg, writeLine } from "../next/diary.js";
import * as notes from "../next/notes.js";
import * as folders from "../next/folders.js";
import { hands as planHands } from "./next-work.js";
import { NOT_OWN } from "./next.js";

export const FOLDER_MS = 5000;

/** the session hands a folder and a note use: a plan's, and one more, a message to a session that is already there
 *  (queued after its current step, as the window's own work.say is) */
export function folderHands(): folders.FolderHands {
  const h = planHands();
  return {
    start: h.start, status: h.status, lastWords: h.lastWords,
    say: async (id, text) => { const d = sessionHands(); if (!d) throw new Error("sessions are not wired yet"); await d.say(id, text); },
  };
}
/** a note's first words for its Diary line */
const quote = (t: string) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > 90 ? `${s.slice(0, 89)}…` : s; };

type H = (m: any, h: Heard) => unknown;
/** told each time a session's turn ends: the engine's own (work/runs.ts onTurnEnd), loaded when the part starts, as
 *  parts/next-canvas.ts does; a test gives its own */
export type TurnEnds = (fn: (id: string) => void) => void;
type RunsLike = { onTurnEnd: (fn: (id: string) => void) => unknown; getRun: (id: string) => { turnFrom?: number } | undefined };
/** only a turn that was under way (its run's turnFrom, read at onTurnEnd as People's minutes do, #1297): a run that
 *  closes while it rests (the idle close) is told too, and that is no new word to write back */
export const turnsOf = (runs: RunsLike): TurnEnds => (fn) => { runs.onTurnEnd((id) => { if (runs.getRun(id)?.turnFrom) fn(id); }); };
const engineTurnEnds: TurnEnds = (fn) => { void import("../work/runs.js").then((r) => turnsOf(r as RunsLike)(fn)); };

export default function (p: Parts, turnEnds: TurnEnds = engineTurnEnds) {
  let line: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T> | T): Promise<T> => { const r = line.then(f, f); line = r.catch(() => {}); return r; };
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  const own = (type: string, f: H) => p.on(type, (m, h) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, type, NOT_OWN);
    return serial(() => f(m ?? {}, h));
  });
  const tellNotes = (e: Engine) => e.everyone(notes.notesMsg(e.HOME));
  const tellFolders = (e: Engine, changed: string[] = []) => {
    e.everyone(folders.foldersMsg(e.HOME));
    for (const f of changed) e.everyone(folders.folderMsg(e.HOME, f));
  };
  const tellDiary = (e: Engine) => e.everyone(diaryMsg(e.HOME, dayOf(new Date())));

  own("next.notes.get", (_m, h) => h.send(h.ws, notes.notesMsg(h.HOME)));
  own("next.note.write", (m, h) => {
    const r = notes.write(h.HOME, m);
    if (!r.ok) return refuse(h, "next.note.write", r.why);
    // left on the canvas, a note is in that day's Diary: one line when it is first written, never one per keystroke
    if (r.fresh && r.note) {
      const day = dayOf(new Date());
      const d = writeLine(h.HOME, { words: `You noted “${quote(r.note.text)}”`, ...(r.note.folder ? { region: r.note.folder } : {}), embed: { id: r.note.id }, via: "note" });
      if (d.ok) { notes.markNoted(h.HOME, r.note.id, day); tellDiary(h); }
    }
    // the window that typed has its words already; the others hear the note
    tellNotes(h);
    if (r.note && m.rid !== undefined) h.send(h.ws, { type: "next.note.written", rid: m.rid, id: r.note.id });
  });
  own("next.note.move", (m, h) => { const r = notes.move(h.HOME, m); if (!r.ok) return refuse(h, "next.note.move", r.why); tellNotes(h); });
  own("next.note.remove", (m, h) => {
    const r = notes.remove(h.HOME, m);
    if (!r.ok) return refuse(h, "next.note.remove", r.why);
    tellNotes(h);
    h.send(h.ws, { type: "next.note.removed", note: r.note });
  });
  own("next.note.restore", (m, h) => { const r = notes.restore(h.HOME, m); if (!r.ok) return refuse(h, "next.note.restore", r.why); tellNotes(h); });
  own("next.notes.gather", (m, h) => {
    const r = notes.gather(h.HOME, m);
    if (!r.ok) return refuse(h, "next.notes.gather", r.why);
    tellNotes(h);
    h.send(h.ws, { type: "next.notes.gathered", was: r.was, moved: r.moved });
  });
  own("next.notes.put", (m, h) => { const r = notes.put(h.HOME, m); if (!r.ok) return refuse(h, "next.notes.put", r.why); tellNotes(h); });
  own("next.note.send", async (m, h) => {
    const r = await folders.sendNote(h.HOME, m, folderHands()).catch((e: unknown) => ({ ok: false as const, why: e instanceof Error ? e.message.split("\n")[0] : "it could not be sent" }));
    if (!r.ok) return refuse(h, "next.note.send", r.why);
    tellNotes(h);
    tellFolders(h, r.folder ? [r.folder] : r.note.folder ? [r.note.folder] : []);
    h.send(h.ws, { type: "next.note.sent", id: r.note.id, became: r.became, ...(r.sessionId ? { sessionId: r.sessionId } : {}), ...(r.folder ? { folder: r.folder } : {}) });
  });

  own("next.folders.get", (_m, h) => h.send(h.ws, folders.foldersMsg(h.HOME)));
  own("next.folder.make", (m, h) => {
    const r = folders.make(h.HOME, m);
    if (!r.ok) return refuse(h, "next.folder.make", r.why);
    h.send(h.ws, { type: "next.folder.made", id: r.id, name: r.name, made: r.made });
  });
  own("next.folder.get", (m, h) => {
    if (!notes.okFolder(m.folder)) return refuse(h, "next.folder.get", "that is not a folder");
    h.send(h.ws, folders.folderMsg(h.HOME, m.folder, m.above));
  });
  own("next.folder.start", async (m, h) => {
    const r = await folders.startIn(h.HOME, m, folderHands()).catch((e: unknown) => ({ ok: false as const, why: e instanceof Error ? e.message.split("\n")[0] : "it could not start" }));
    if (!r.ok) return refuse(h, "next.folder.start", r.why);
    tellFolders(h, [m.folder]);
    h.send(h.ws, { type: "next.folder.started", folder: m.folder, sessionId: r.sessionId });
  });
  own("next.folder.tell", (m, h) => {
    const r = folders.tell(h.HOME, m);
    if (!r.ok) return refuse(h, "next.folder.tell", r.why);
    tellFolders(h, [m.folder]);
  });
  own("next.folder.move", async (m, h) => {
    const r = await folders.moveSession(h.HOME, m, folderHands()).catch((e: unknown) => ({ ok: false as const, why: e instanceof Error ? e.message.split("\n")[0] : "it could not move" }));
    if (!r.ok) return refuse(h, "next.folder.move", r.why);
    if (r.moved) tellFolders(h, [m.folder]);
  });

  p.atStart((e) => {
    const t = setInterval(() => {
      if (!uiNext() || !sessionHands()) return;
      void serial(async () => {
        const changed = await folders.watch(e.HOME, folderHands());
        if (changed.length) { tellFolders(e, changed); tellDiary(e); }
      }).catch(() => {});
    }, FOLDER_MS);
    t.unref();
    // a turn that ended writes back at once (#1802): a continued session's turn can start and end between two looks of
    // the clock, so the clock alone never saw it working and the folder kept its first answer
    turnEnds((id) => {
      if (!uiNext() || !sessionHands()) return;
      void serial(async () => {
        const changed = await folders.turnEnded(e.HOME, id, folderHands());
        if (changed.length) { tellFolders(e, changed); tellDiary(e); }
      }).catch(() => {});
    });
    onUiNext((on) => { if (on) { tellNotes(e); tellFolders(e); } });
  });
}
