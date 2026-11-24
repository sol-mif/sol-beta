// A note is a session not sent (BR1, frame.html part 6; #1615). Words typed on the canvas
// and not sent are kept as typed, through quits and restarts, until the person deletes them; nothing typed is never kept.
// One file, SOL_HOME/next/drafts.json { v: 1, notes: Note[] }, written whole (file.ts). Behind ui.next; the part is
// parts/next-notes.ts. Where a note goes when it is sent is folders.ts's (a session, a session's next message, a folder's
// context); this file keeps the notes and their places only.
//   next.note.write  { id?, text, x?, y?, w?, h?, folder? }   saved as typed; empty text takes the note away (no Undo:
//                                                            there was nothing to keep)
//   next.note.move   { id, x, y, w?, h? } | { id, folder }   on the canvas, or into a folder (folder null: loose again)
//   next.note.remove { id } → next.note.removed { note }      next.note.restore { note } is its Undo
//   next.notes.gather { x, y } → next.notes.gathered { was }  every loose note into one pile; next.notes.put { was } undoes
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type Note = { id: string; text: string; x: number | null; y: number | null; w: number; h: number; folder: string | null; at: number; made: number; noted: string | null };
export type Place = { id: string; x: number; y: number; w: number; h: number };
export type R<T> = ({ ok: true } & T) | { ok: false; why: string };

export const MAX_TEXT = 8000, MAX_NOTES = 500, NOTE_W = 300, NOTE_H = 180;
export const notesFile = (home: string) => join(nextDir(home), "drafts.json");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;
/** a time in ms (a place on the canvas is num, at most 1e7; a time is far past that, so it reads its own way) */
const time = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const okId = (v: unknown): v is string => typeof v === "string" && /^[\w.:-]{1,80}$/.test(v);
/** a folder as the face names it ("w:/path", "h:school"): a short line of text */
export const okFolder = (v: unknown): v is string => typeof v === "string" && v.length > 2 && v.length <= 1000 && /^[wh]:/.test(v) && !/[\u0000-\u001f]/.test(v);
const size = (v: unknown, d: number) => (num(v) && v >= 60 && v <= 4000 ? v : d);

function cleanNote(v: unknown): Note | null {
  if (!isObj(v) || !okId(v.id) || typeof v.text !== "string" || !v.text.trim()) return null;
  const placed = num(v.x) && num(v.y);
  return {
    id: v.id, text: v.text.slice(0, MAX_TEXT), x: placed ? (v.x as number) : null, y: placed ? (v.y as number) : null,
    w: size(v.w, NOTE_W), h: size(v.h, NOTE_H), folder: okFolder(v.folder) ? v.folder : null,
    at: time(v.at) ? v.at : 0, made: time(v.made) ? v.made : time(v.at) ? v.at : 0, noted: typeof v.noted === "string" ? v.noted.slice(0, 10) : null,
  };
}
export function readNotes(home: string): Note[] {
  const { data } = readJson(notesFile(home));
  return (Array.isArray(data.notes) ? data.notes : []).map(cleanNote).filter((n): n is Note => !!n);
}
const save = (home: string, notes: Note[]) => writeJson(notesFile(home), { v: 1, notes });
export const notesMsg = (home: string) => ({ type: "next.notes", notes: readNotes(home) });
const newId = () => `note-${randomBytes(5).toString("hex")}`;

/** next.note.write: saved as typed. A first save with words is a new note (and `fresh`, so the part writes its one
 *  Diary line); a save with no words takes the note away. */
export function write(home: string, m: unknown, now = Date.now()): R<{ note: Note | null; fresh?: true; gone?: true }> {
  const a = isObj(m) ? m : {};
  if (typeof a.text !== "string") return { ok: false, why: "a note needs its words" };
  if (a.text.length > MAX_TEXT) return { ok: false, why: "a note holds 8000 characters" };
  const notes = readNotes(home);
  const i = okId(a.id) ? notes.findIndex((n) => n.id === a.id) : -1;
  if (!a.text.trim()) {
    if (i < 0) return { ok: true, note: null };
    notes.splice(i, 1); save(home, notes);
    return { ok: true, note: null, gone: true };
  }
  if (i >= 0) {
    const n = notes[i];
    n.text = a.text; n.at = now;
    if (num(a.x) && num(a.y)) { n.x = a.x; n.y = a.y; }
    n.w = size(a.w, n.w); n.h = size(a.h, n.h);
    if (a.folder === null || okFolder(a.folder)) n.folder = (a.folder as string | null);
    save(home, notes);
    return { ok: true, note: n };
  }
  if (notes.length >= MAX_NOTES) return { ok: false, why: "500 notes are kept; send or delete some first" };
  const placed = num(a.x) && num(a.y);
  const n: Note = { id: okId(a.id) ? a.id : newId(), text: a.text, x: placed ? (a.x as number) : null, y: placed ? (a.y as number) : null,
    w: size(a.w, NOTE_W), h: size(a.h, NOTE_H), folder: okFolder(a.folder) ? a.folder : null, at: now, made: now, noted: null };
  notes.push(n); save(home, notes);
  return { ok: true, note: n, fresh: true };
}

/** the day a note's "you noted…" line went into the Diary, so it is written once */
export function markNoted(home: string, id: string, day: string): void {
  const notes = readNotes(home), n = notes.find((x) => x.id === id);
  if (n) { n.noted = day; save(home, notes); }
}

/** next.note.move: a new place on the canvas, or into a folder (null: loose again, where it lands next) */
export function move(home: string, m: unknown, now = Date.now()): R<{ note: Note }> {
  const a = isObj(m) ? m : {};
  const notes = readNotes(home), n = notes.find((x) => x.id === a.id);
  if (!n) return { ok: false, why: "that note is not here any more" };
  if ("folder" in a) {
    if (a.folder !== null && !okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
    n.folder = a.folder as string | null;
  }
  if (num(a.x) && num(a.y)) { n.x = a.x; n.y = a.y; n.w = size(a.w, n.w); n.h = size(a.h, n.h); }
  else if (!("folder" in a)) return { ok: false, why: "say where the note goes" };
  n.at = now; save(home, notes);
  return { ok: true, note: n };
}

/** next.note.remove: gone from the canvas; the answer carries it whole for Undo */
export function remove(home: string, m: unknown): R<{ note: Note }> {
  const a = isObj(m) ? m : {};
  const notes = readNotes(home), i = notes.findIndex((x) => x.id === a.id);
  if (i < 0) return { ok: false, why: "that note is not here any more" };
  const [note] = notes.splice(i, 1); save(home, notes);
  return { ok: true, note };
}

/** next.note.restore: a removed note back as it was (Undo); a note with that id already here is left alone */
export function restore(home: string, m: unknown): R<{ note: Note }> {
  const a = isObj(m) ? m : {};
  const note = cleanNote(a.note);
  if (!note) return { ok: false, why: "nothing to put back" };
  const notes = readNotes(home);
  if (notes.some((x) => x.id === note.id)) return { ok: true, note };
  if (notes.length >= MAX_NOTES) return { ok: false, why: "500 notes are kept; send or delete some first" };
  notes.push(note); save(home, notes);
  return { ok: true, note };
}

/** next.notes.gather: every loose note (on the canvas, in no folder) into one pile at x, y, a little apart, newest on top;
 *  `was` is where each was, for Undo (next.notes.put) */
export function gather(home: string, m: unknown, now = Date.now()): R<{ was: Place[]; moved: number }> {
  const a = isObj(m) ? m : {};
  if (!num(a.x) || !num(a.y)) return { ok: false, why: "say where the pile goes" };
  const notes = readNotes(home);
  const loose = notes.filter((n) => !n.folder).sort((p, q) => p.made - q.made);
  if (loose.length < 2) return { ok: false, why: "there are no loose notes to gather" };
  const was = loose.filter((n) => n.x != null).map((n) => ({ id: n.id, x: n.x!, y: n.y!, w: n.w, h: n.h }));
  loose.forEach((n, i) => { n.x = (a.x as number) + i * 18; n.y = (a.y as number) + i * 26; n.at = now; });
  save(home, notes);
  return { ok: true, was, moved: loose.length };
}

/** next.notes.put: notes back where `was` says (the gather's Undo) */
export function put(home: string, m: unknown): R<{ moved: number }> {
  const a = isObj(m) ? m : {};
  const was = (Array.isArray(a.was) ? a.was : []).filter(isObj).filter((p) => okId(p.id) && num(p.x) && num(p.y));
  if (!was.length) return { ok: false, why: "nothing to put back" };
  const notes = readNotes(home);
  let moved = 0;
  for (const p of was) { const n = notes.find((x) => x.id === p.id); if (n) { n.x = p.x as number; n.y = p.y as number; moved++; } }
  save(home, notes);
  return { ok: true, moved };
}
