// A note is a session not sent, and sessions inside a folder (BR1, frame.html parts 5 and 6): the engine's next.notes,
// next.folders and next.folder (sol/PROTOCOL.md "## next"; the engine's next/notes.ts and next/folders.ts) read into what
// the notes layer (Layer.tsx) and the opened folder (folder/index.tsx) draw. Pure. Each answer is kept by an allowlist;
// the words say what a drop will do, in plain words. The store's part is D.notes (cv/wire/notes.ts).
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).

export type Note = { id: string; text: string; x: number | null; y: number | null; w: number; h: number; folder: string | null; at: number };
export type Fact = { id: string; fact: string; source: string; stale: boolean; learned?: true };   // learned: the person did not say it (Sol, or an AI they kept)
export type Back = { sessionId: string; title: string; words: string; at: number };
export type Folder = { folder: string; place: string | null; facts: Fact[]; backs: Back[]; sessions: { sessionId: string; title: string }[] };
/** the store's part (D.notes): the notes, which folder each session is in (by the person's move or start), each opened
 *  folder's context as last heard, the last refusal, and what was just removed or gathered, for Undo */
export type Notes = {
  notes: Note[];
  inFolder: Record<string, string>;
  folders: Record<string, Folder>;
  note: string | null;
  undo: { kind: "note"; note: Note } | { kind: "gather"; was: { id: string; x: number; y: number; w: number; h: number }[] }
    /** a note dropped on a session or a folder, held HOLD_MS before it is sent; Undo puts it back where it was */
    | { kind: "held"; note: Note; to: string; target: "session" | "folder"; name: string; was: { x: number; y: number } }
    /** a session dropped into another folder; Undo puts it back in the one it was in */
    | { kind: "moved"; sessionId: string; was: string; name: string; at?: { x: number; y: number } } | null;
  /** a line said after a send ("Sent to Fix login as its next message") */
  said: string | null;
};
export const empty = (): Notes => ({ notes: [], inFolder: {}, folders: {}, note: null, undo: null, said: null });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const okId = (v: unknown): v is string => typeof v === "string" && /^[\w.:-]{1,80}$/.test(v);
export const okFolder = (v: unknown): v is string => typeof v === "string" && v.length > 2 && v.length <= 1000 && /^[wh]:/.test(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function cleanNote(v: unknown): Note | null {
  if (!isObj(v) || !okId(v.id) || typeof v.text !== "string") return null;
  const x = num(v.x), y = num(v.y);
  return { id: v.id, text: v.text.slice(0, 8000), x: x != null && y != null ? x : null, y: x != null && y != null ? y : null,
    w: num(v.w) ?? 300, h: num(v.h) ?? 180, folder: okFolder(v.folder) ? v.folder : null, at: num(v.at) ?? 0 };
}
export const cleanNotes = (m: unknown): Note[] => arr(isObj(m) ? m.notes : null).map(cleanNote).filter((n): n is Note => !!n);
export function cleanInFolder(m: unknown): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(isObj(m) && isObj(m.sessions) ? m.sessions : {})) if (/^[\w.:-]{1,80}$/.test(k) && okFolder(v)) o[k] = v;
  return o;
}
export function cleanFolder(m: unknown): Folder | null {
  if (!isObj(m) || !okFolder(m.folder)) return null;
  return {
    folder: m.folder, place: str(m.place, 1000) || null,
    facts: arr(m.facts).filter(isObj).filter((f) => okId(f.id) && typeof f.fact === "string").map((f) => ({ id: f.id as string, fact: str(f.fact, 500), source: str(f.source, 200), stale: f.stale === true, ...(f.learned === true ? { learned: true as const } : {}) })),
    backs: arr(m.backs).filter(isObj).filter((b) => typeof b.sessionId === "string").map((b) => ({ sessionId: str(b.sessionId, 80), title: str(b.title, 80), words: str(b.words, 400), at: num(b.at) ?? 0 })),
    sessions: arr(m.sessions).filter(isObj).filter((s) => typeof s.sessionId === "string").map((s) => ({ sessionId: str(s.sessionId, 80), title: str(s.title, 80) })),
  };
}

/** what the person sees on a note: its first line as a title, its words, and where it is */
export const firstLine = (t: string) => { const l = t.trim().split("\n")[0] ?? ""; return l.length > 60 ? `${l.slice(0, 59)}…` : l; };
/** what an armed drop target says under the pointer (notes/drop.ts): a session reads what it is given, a folder keeps it */
export function sayDrop(to: { kind: "session" | "folder"; name: string }): string {
  return to.kind === "session" ? `Give to “${to.name}” as your next message` : `Put in ${to.name}`;
}
/** the line after a drop, beside its Undo: a note given waits HOLD_MS before the session reads it */
export function sayHeld(to: { kind: "session" | "folder"; name: string }): string {
  return to.kind === "session" ? `“${to.name}” reads it in 5 seconds` : `Put in ${to.name}`;
}
export function saySent(became: unknown, name: string): string {
  if (became === "message") return `Sent to “${name}” as your next message.`;
  if (became === "context") return `${name} keeps it now. Every session started there knows it.`;
  return "Sent as a new session.";
}
/** a folder's id as a short name, when the store has no folder by that id */
export const folderShort = (id: string) => { const p = id.slice(2).replace(/\/+$/, ""); return p.split("/").pop() || p; };

export type Shelf = "needs" | "working" | "done";
export const SHELVES: { id: Shelf; say: string }[] = [{ id: "needs", say: "Waiting on you" }, { id: "working", say: "Working" }, { id: "done", say: "Done" }];
/** which shelf a session starts on, from what the plane already says of it (state words, an ask on it) */
export function shelfOf(state: string, asks: boolean): Shelf {
  if (asks || state === "asks you" || state === "waiting" || state === "failed") return "needs";
  if (state === "done" || state === "idle" || state === "stopped" || state === "taken back") return "done";
  return "working";
}
