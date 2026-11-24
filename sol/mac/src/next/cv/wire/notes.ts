// Notes and sessions inside a folder, the wire (BR1, frame.html parts 5 and 6): the engine's next.notes, next.folders and
// next.folder read into D.notes through notes/read.ts's allowlist; a refusal for one of them is said; a removed note or a
// gather is held for Undo. It also keeps two things the session pieces carry, without touching the plane's files:
//   - the folder the person put a session in (next.folders): work.sessions files a session by its project, so after each
//     work.sessions the person's folder is put back on the piece;
//   - "automation · <name>" on a session an automation started (D.work's automations, cv/wire/work.ts). A session has no
//     agent name: its folder's mark and its task are what it shows (Marco, 11:51).
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { D, S, change, hooks } from "../core.ts";
import type { Engine } from "./types.ts";
import { link, startedHere } from "../../notes/link.ts";
import { landStarted } from "../moves/near.ts";
import { cleanFolder, cleanInFolder, cleanNote, cleanNotes, empty, folderShort, saySent, type Notes } from "../../notes/read.ts";
import type { Work } from "../../work/read.ts";

const W = (d: Record<string, unknown>): Notes => (d.notes as Notes | undefined) ?? (d.notes = empty()) as Notes;
const ours = (t: unknown) => typeof t === "string" && /^next\.(note|notes|folder|folders)\b/.test(t);
const nameOf = (id: string) => D.regions.find((r) => r.id === id)?.name ?? folderShort(id);

/** the person's folders and the automations' labels, put on the session pieces (after work.sessions or a new list) */
export function marks(d: Record<string, unknown>): boolean {
  const n = W(d), pieces = (d as typeof D).pieces, regions = (d as typeof D).regions;
  const autos = ((d.work as Work | undefined)?.autos ?? []);
  let moved = false;
  for (const p of Object.values(pieces)) {
    if (p.kind !== "session") continue;
    const sid = String(p.sessionId ?? p.id), f = n.inFolder[sid];
    if (f && p.region !== f && regions.some((r) => r.id === f)) {
      p.region = f; moved = true;
      const q = (d as typeof D).pos?.[p.id];
      if (q && q.by === "rule") delete (d as typeof D).pos![p.id];
    }
    const a = autos.find((x) => x.last?.sessionId === sid);
    if (a) p.label = `automation · ${a.name}`;
  }
  return moved;
}

export function attach(e: Engine): void | (() => void) {
  link.e = e;
  const off = e.subscribe((m: { type?: string; [k: string]: unknown }) => {
    const t = m?.type;
    if (t === "next.notes") {
      const notes = cleanNotes(m);
      change((d) => {
        const w = W(d);
        // a note the person is typing in keeps the words on screen; one not yet kept (no words yet) stays too
        const typing = w.notes.filter((x) => x.id === S.noteFocus || !x.text.trim());
        w.notes = [...notes.map((x) => typing.find((y) => y.id === x.id) ?? x), ...typing.filter((y) => !notes.some((x) => x.id === y.id) && !y.text.trim())];
        // a note held after a drop stays off the canvas until it is sent or taken back
        if (w.undo?.kind === "held") { const held = w.undo.note.id; w.notes = w.notes.filter((x) => x.id !== held); }
        w.note = null;
        if (w.undo?.kind === "note" && notes.some((x) => x.id === (w.undo as { note: { id: string } }).note.id)) w.undo = null;
      });
    } else if (t === "next.note.removed") { const note = cleanNote(m.note); if (note) change((d) => { W(d).undo = { kind: "note", note }; }); }
    else if (t === "next.notes.gathered") change((d) => { W(d).undo = { kind: "gather", was: (Array.isArray(m.was) ? m.was : []) as never }; });
    else if (t === "next.note.sent") {
      const to = typeof m.folder === "string" ? nameOf(m.folder) : typeof m.sessionId === "string" ? String(D.pieces[m.sessionId]?.name ?? "the session") : "";
      change((d) => { W(d).said = saySent(m.became, to); });
    } else if (t === "next.folders") change((d) => { W(d).inFolder = cleanInFolder(m); if (marks(d)) hooks.layout?.(); });
    else if (t === "next.folder") { const f = cleanFolder(m); if (f) change((d) => { W(d).folders[f.folder] = f; }); }
    else if (t === "next.folder.started" && typeof m.sessionId === "string" && typeof m.folder === "string") {
      const sid = m.sessionId, f = m.folder;
      change((d) => { W(d).inFolder[sid] = f; W(d).said = `Started in ${nameOf(f)}, knowing what the folder knows.`; });
      // asked here: the session's tab in front, its first words in its talk (BR1 gate 1); a minute is the most a start waits
      const asked = startedHere[f];
      if (asked && Date.now() - asked.at < 60_000) { delete startedHere[f]; change(() => landStarted(sid, f, asked.words)); }
    } else if (t === "work.sessions" || t === "next.autos") change((d) => { if (marks(d)) hooks.layout?.(); });
    else if (t === "next.refused" && ours(m.asked)) {
      const why = typeof m.why === "string" ? m.why.slice(0, 300) : "That was not done.";
      change((d) => { W(d).note = why; });
    }
  });
  e.send({ type: "next.notes.get" });
  e.send({ type: "next.folders.get" });
  return () => { off(); if (link.e === e) link.e = null; };
}
