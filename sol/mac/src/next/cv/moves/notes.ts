// Notes and sessions inside a folder, the moves (BR1, frame.html parts 5 and 6). Live, each sends its next.note.* or
// next.folder.* (sol/PROTOCOL.md "## next") and the wire (cv/wire/notes.ts) fills D.notes from the answer; on the dev page
// and in tests (no engine) each changes D.notes itself, so the page can be walked. Each answers with an Undo where one
// exists: a deleted note comes back, a gather goes back, a dropped note is held HOLD_MS so Undo can still stop it.
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { D, M, S, ancestors, done, piecesIn, regionOf, render, toPlane, viewSize, type Done, type Moves } from "../core.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { empty, saySent, type Folder, type Note, type Notes } from "../../notes/read.ts";
import { titleOf } from "../../plane/layout.ts";
import { link, send, startedHere } from "../../notes/link.ts";
import { pagesOf } from "../../folder/head.ts";
import { gaveNote } from "./table.ts";

/** BR1, folders in folders: a message about a folder carries the folders it sits in, nearest first, as this face draws
 *  them (the person's, a place's own and a path inside a path), so a session there knows every folder above it
 *  (folders.ts aboveOf; without it the engine walks the person's own `in` alone). Nothing for a session or "new" */
/** a folder's pages: the pieces kept in it that are not its sessions nor folders, by their titles (frame.html part 5,
 *  "its pages"); a session started in or moved to the folder is told them with the rest of what it knows */
export const pagesIn = (rid: string): string[] => pagesOf(piecesIn(rid), titleOf);
const up = (to: string) => (regionOf(to) ? { above: ancestors(to), pages: pagesIn(to).slice(0, 12) } : {});
export const N = (): Notes => ((D.notes as Notes | undefined) ?? (D.notes = empty())) as Notes;
const live = () => !!link.e;
let k = 0;
const newId = () => `note-${Date.now().toString(36)}${(k++).toString(36)}`;
// a folder fact the person forgot on the dev page and in tests (no engine), kept for its Back; live the engine keeps it
const held = new Map<string, Folder["facts"][number]>();
/** how long a note given to a session or put in a folder waits before it is sent, so Undo can still take it back */
export const HOLD_MS = 5000;
let hold: ReturnType<typeof setTimeout> | null = null;
/** the held note goes now: the session reads it as its next message, or the folder keeps it */
export function flush(): void {
  if (hold) { clearTimeout(hold); hold = null; }
  const u = N().undo;
  if (u?.kind !== "held") return;
  N().undo = null;
  if (live()) send({ type: "next.note.send", id: u.note.id, to: u.to, ...up(u.to) });
  else N().said = saySent(u.target === "session" ? "message" : "context", u.name);
  if (u.target === "session") gaveNote(u.to, u.note.id, u.note.text);   // BR1 inside.html §2: on its table from now on
  render();
}
/** the middle of what the person sees, in plane units */
export function middle(): { x: number; y: number } { const { w, h } = viewSize(); return toPlane(w / 2, h / 2); }

const own: Moves = {
  /** a new empty note where the person looks; it is kept only once it has words (next.note.write) */
  note_new(x?: number, y?: number): Done {
    const at = typeof x === "number" && typeof y === "number" ? { x, y } : middle();
    const n: Note = { id: newId(), text: "", x: Math.round(at.x - 150), y: Math.round(at.y - 90), w: 300, h: 180, folder: null, at: Date.now() };
    N().notes.push(n); S.noteFocus = n.id; render();
    return done(true, n.id, () => { N().notes = N().notes.filter((x) => x.id !== n.id); render(); });
  },
  /** the words as typed; the layer sends them a moment after the last key */
  note_write(id: string, text: string): Done {
    const n = N().notes.find((x) => x.id === id);
    if (!n) return done(false);
    n.text = String(text).slice(0, 8000); n.at = Date.now();
    send({ type: "next.note.write", id, text: n.text, ...(n.x != null ? { x: n.x, y: n.y, w: n.w, h: n.h } : {}), ...(n.folder ? { folder: n.folder } : {}) });
    if (!n.text.trim() && !live()) N().notes = N().notes.filter((x) => x.id !== id);
    render();
    return done(true, id);
  },
  note_move(id: string, x: number, y: number, w?: number, h?: number): Done {
    const n = N().notes.find((q) => q.id === id);
    if (!n || !isFinite(+x) || !isFinite(+y)) return done(false);
    const was = { x: n.x, y: n.y, w: n.w, h: n.h };
    n.x = Math.round(+x); n.y = Math.round(+y); if (w) n.w = Math.round(w); if (h) n.h = Math.round(h);
    if (n.text.trim()) send({ type: "next.note.move", id, x: n.x, y: n.y, w: n.w, h: n.h });
    render();
    return done(true, id, () => { Object.assign(n, was); if (n.text.trim()) send({ type: "next.note.move", id, x: n.x, y: n.y, w: n.w, h: n.h }); render(); });
  },
  /** ⋯ › Delete: gone, with an Undo line */
  note_delete(id: string): Done {
    const n = N().notes.find((q) => q.id === id);
    if (!n) return done(false);
    N().notes = N().notes.filter((q) => q.id !== id);
    if (n.text.trim()) { N().undo = { kind: "note", note: n }; send({ type: "next.note.remove", id }); }
    render();
    return done(true, id, () => own.note_undo());
  },
  /** Send as a session (to "new"), to a session (its next message) or into a folder (its context) */
  note_send(id: string, to: string): Done {
    const n = N().notes.find((q) => q.id === id);
    if (!n || !n.text.trim() || !to) return done(false);
    if (live()) send({ type: "next.note.send", id, to, ...up(to) });
    else { N().notes = N().notes.filter((q) => q.id !== id); N().said = to === "new" ? "Sent as a new session." : "Sent."; }
    S.noteAsk = null; render();
    return done(true, id);
  },
  /** Arrange › Gather notes: every loose note into one pile beside the person */
  notes_gather(): Done {
    const loose = N().notes.filter((n) => !n.folder && n.text.trim());
    if (loose.length < 2) return done(false);
    const at = middle(), x = Math.round(at.x - 150), y = Math.round(at.y - 120);
    if (live()) send({ type: "next.notes.gather", x, y });
    else {
      N().undo = { kind: "gather", was: loose.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, w: n.w, h: n.h })) };
      loose.forEach((n, i) => { n.x = x + i * 18; n.y = y + i * 26; });
    }
    render();
    return done(true, undefined, () => own.note_undo());
  },
  /** a note dropped on an armed session or folder (notes/drop.ts): off the canvas at once, sent after HOLD_MS unless the
   *  Undo line is pressed first; one held at a time, so an earlier one goes now */
  note_give(id: string, to: string, target: string, name: string): Done {
    const n = N().notes.find((q) => q.id === id);
    if (!n || !n.text.trim() || !to || (target !== "session" && target !== "folder")) return done(false);
    N().said = null;
    flush();
    send({ type: "next.note.write", id, text: n.text, ...(n.x != null ? { x: n.x, y: n.y, w: n.w, h: n.h } : {}) });
    N().notes = N().notes.filter((q) => q.id !== id);
    N().undo = { kind: "held", note: n, to, target, name: String(name || "").slice(0, 80), was: { x: n.x ?? 0, y: n.y ?? 0 } };
    hold = setTimeout(flush, HOLD_MS);
    render();
    return done(true, id, () => own.note_undo());
  },
  /** the Undo line's press: the deleted note back, the pile back where each note was, a held note back unsent, or a
   *  session back in the folder it was in */
  note_undo(): Done {
    const u = N().undo;
    if (!u) return done(false);
    if (u.kind === "note") { send({ type: "next.note.restore", note: u.note }); if (!live() || !N().notes.some((n) => n.id === u.note.id)) N().notes.push(u.note); }
    else if (u.kind === "held") { if (hold) { clearTimeout(hold); hold = null; } u.note.x = u.was.x; u.note.y = u.was.y; N().notes.push(u.note); N().said = null; }
    else if (u.kind === "moved") { const p = D.pieces[u.sessionId], q = D.pos?.[u.sessionId]; if (q && u.at) { q.x = u.at.x; q.y = u.at.y; } if (p) { p.region = u.was; N().inFolder[u.sessionId] = u.was; send({ type: "next.folder.move", sessionId: p.sessionId ?? u.sessionId, folder: u.was, title: p.name, ...up(u.was) }); } N().said = null; }
    else { send({ type: "next.notes.put", was: u.was }); for (const p of u.was) { const n = N().notes.find((q) => q.id === p.id); if (n) { n.x = p.x; n.y = p.y; } } }
    N().undo = null; render();
    return done(true);
  },
  /** open a folder in place on the canvas (BR1 2+Q2, frame.html part 5): what every session there knows, and its sessions
   *  on shelves; `as: "page"` opens it straight up into its page (⤢) */
  folder_open(rid: string, as: "place" | "page" = "place"): Done {
    if (!D.regions.some((r) => r.id === rid)) return done(false);
    const was = { page: S.page, folder: S.folder, folderAs: S.folderAs };
    S.page = "folder"; S.folder = rid; S.folderAs = as === "page" ? "page" : "place";
    send({ type: "next.folder.get", folder: rid, ...up(rid) });
    render();
    return done(true, rid, () => { S.page = was.page; S.folder = was.folder; S.folderAs = was.folderAs; render(); });
  },
  /** ⤢ on a folder open in place: up into its page, with its parts (walk 5: Working now, What changed, Coming up, Files) */
  folder_page(rid?: string): Done {
    const id = rid || (S.page === "folder" ? String(S.folder ?? "") : "");
    return id ? own.folder_open(id, "page") : done(false);
  },
  /** the page's way back down: the folder open in place again (Esc does it too) */
  folder_place(): Done {
    if (S.page !== "folder" || S.folderAs !== "page") return done(false);
    S.folderAs = "place"; render();
    return done(true, String(S.folder ?? ""), () => { S.folderAs = "page"; render(); });
  },
  /** ＋ New session in <folder>, or words said while the folder is open */
  folder_start(rid: string, text: string): Done {
    const t = String(text || "").trim();
    if (!t || !rid) return done(false);
    // the dev page: the folder's start is a new session's, started at once in its tab (no engine to know the folder)
    if (!live()) { const r = M.start({ region: rid, words: t, tab: true }) as Done; if (r.ok && r.id && D.pieces[r.id]?.kind === "starter") M.start(r.id); return r; }
    startedHere[rid] = { at: Date.now(), words: t };   // its tab opens when the engine says it started (cv/wire/notes.ts)
    send({ type: "next.folder.start", folder: rid, text: t, ...up(rid) });
    return done(true, rid);
  },
  /** ＋ Tell <folder> something: a fact every session there knows */
  folder_tell(rid: string, text: string): Done {
    const t = String(text || "").trim();
    if (!t || !rid) return done(false);
    if (live()) send({ type: "next.folder.tell", folder: rid, text: t });
    else { const f = N().folders[rid] ?? (N().folders[rid] = { folder: rid, place: null, facts: [], backs: [], sessions: [] }); f.facts.push({ id: newId(), fact: t, source: "you told this folder", stale: false }); }
    render();
    return done(true, rid);
  },
  /** Forget on one of a folder's facts (its k, "fact:<id>", known.ts): held out of every session's context from now
   *  (next.you.fact.forget, the engine's one way to forget), the folder read again; back: Back, the fact returns */
  folder_forget(rid: string, k: string, back = false): Done {
    const id = k.startsWith("fact:") ? k.slice(5) : "", f = N().folders[rid];
    if (!rid || !id) return done(false);
    if (live()) {
      // the engine keeps the forget as one fix line (next.known) and gives the fact back from its own store on Back:
      // the face holds no copy, the folder's re-read says it, and known() holds it out meanwhile (forgotNow)
      if (!back && f) f.facts = f.facts.filter((y) => y.id !== id);
      send({ type: "next.you.fact.forget", k, ...(back ? { back: true } : {}) }); send({ type: "next.folder.get", folder: rid, ...up(rid) });
    } else if (back) { const x = held.get(k); if (x && f && !f.facts.some((y) => y.id === id)) f.facts.push(x); held.delete(k); }
    else { const x = f?.facts.find((y) => y.id === id); if (x) held.set(k, x); if (f) f.facts = f.facts.filter((y) => y.id !== id); }
    render();
    return done(true, k, () => own.folder_forget(rid, k, !back));
  },
  /** a session into another folder: its context changes from its next message, and it says so in one line. The plane's
   *  own drop calls this too, when the bar helper wires it */
  into_folder(sessionId: string, rid: string): Done {
    const p = D.pieces[sessionId];
    if (!p || p.kind !== "session" || !D.regions.some((r) => r.id === rid) || p.region === rid) return done(false);
    const was = p.region;
    flush();
    p.region = rid; N().inFolder[sessionId] = rid;
    N().said = `“${titleOf(p)}” works in ${D.regions.find((r) => r.id === rid)?.name ?? "that folder"} from its next message.`;
    const q = D.pos?.[sessionId];
    N().undo = { kind: "moved", sessionId, was, name: titleOf(p), ...(q ? { at: { x: q.x, y: q.y } } : {}) };
    send({ type: "next.folder.move", sessionId: p.sessionId ?? sessionId, folder: rid, title: p.name, ...up(rid) });
    render();
    return done(true, sessionId, () => own.note_undo());
  },
};
export default own;

// the AI's side: notes and a folder's context are the person's own words, so an AI may not write, send or delete them
// (it may suggest a folder, which the person presses); opening a folder is the camera; a session into a folder is a placing
for (const n of ["note_new", "note_write", "note_move", "note_delete", "note_send", "note_give", "note_undo", "folder_tell", "folder_forget"]) PERSON_ONLY[n] = "words";
PERSON_ONLY.folder_open = "camera"; PERSON_ONLY.folder_page = "camera"; PERSON_ONLY.folder_place = "camera";
Object.assign(MOVE_FN, { notes_gather: "place", folder_open: "look", folder_page: "look", folder_place: "look", folder_start: "start", into_folder: "place",
  note_new: "offer", note_write: "offer", note_move: "offer", note_delete: "offer", note_send: "offer", note_give: "offer", note_undo: "offer", folder_tell: "offer", folder_forget: "offer" });
