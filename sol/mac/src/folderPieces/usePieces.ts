// A folder's pieces from the engine (#1092): asked once per folder (work.pieces.list), asked again when the engine says
// the folder's pieces changed (work.pieces.changed) or one of their blocks did (work.stage.changed for a piece-… id).
// One small store shared by every row and page, so a folder listed twice is asked once.
import { useEffect, useSyncExternalStore } from "react";
import { store } from "../stage/engineStore";
import { againIn, type PieceInfo } from "./model";

type Folder = { pieces: PieceInfo[]; project?: string; errors: { file: string; error: string }[]; error?: string };
const EMPTY: Folder = { pieces: [], errors: [] };
const folders = new Map<string, Folder>();
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
const asking = new Set<string>();
let listening: (() => void) | null = null;

type Ask = <T = unknown>(type: string, a: object, wait?: number) => Promise<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listen = (f: (m: any) => void) => () => void;
/** the sockets handed in, the last one in first (Build's app, Home's folders): one leaving goes back to the one before */
const owners: { ask: Ask; listen: Listen }[] = [];
const own = () => owners[owners.length - 1] ?? null;
/** Build's app hands its socket in at load (WorkApp), Home's folders theirs (FolderHome); the stage's link otherwise */
export function connectPieces(ask: Ask, listen: Listen): () => void {
  const me = { ask, listen };
  owners.push(me);
  const relisten = () => { if (listening) { listening(); listening = null; } asking.clear(); listen_(); for (const cwd of folders.keys()) void askList(cwd); };
  relisten();
  return () => {
    const i = owners.indexOf(me);
    if (i < 0) return;
    const wasTop = i === owners.length - 1;
    owners.splice(i, 1);
    if (wasTop) relisten();   // its socket answers nothing now: the one before it (or the stage's link) is used
  };
}
/** the engine's link: the last socket handed in, else the stage's, when the socket is up */
export const link = (): { ask: Ask; listen: Listen } | null => own() ?? store.link();

async function askList(cwd: string) {
  const l = link();
  if (!l || asking.has(cwd)) return;
  asking.add(cwd);
  try {
    const r = await l.ask<Folder & { error?: string }>("work.pieces.list", { cwd }, 15_000);
    folders.set(cwd, r.error ? { ...EMPTY, error: r.error } : { pieces: r.pieces ?? [], project: r.project, errors: r.errors ?? [] });
    tell();
  } finally { asking.delete(cwd); }
}

function listen_() {
  if (listening) return;
  const l = link();
  if (!l) return;
  let t: ReturnType<typeof setTimeout> | undefined;
  const again = new Set<string>();
  const soon = (cwd: string) => { again.add(cwd); clearTimeout(t); t = setTimeout(() => { for (const c of again) void askList(c); again.clear(); }, 120); };
  listening = l.listen((m: { type?: string; cwd?: string; project?: string; block?: { id?: string } }) => {
    if (m.type === "work.pieces.changed" && m.cwd && folders.has(m.cwd)) soon(m.cwd);
    else if (m.type === "work.stage.changed" && m.block?.id?.startsWith("piece-")) for (const [cwd, f] of folders) if (!m.project || f.project === m.project) soon(cwd);
  });
}

/** the folder's pieces; asked when first shown, and kept fresh while anything shows them */
export function usePieces(cwd: string | null): Folder {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => (cwd ? folders.get(cwd) ?? EMPTY : EMPTY));
  useEffect(() => {
    if (!cwd) return;
    listen_();
    void askList(cwd);
    // the socket may come up after the first draw, or the folder answered an error: asked again, backing off
    let tries = 0, t: ReturnType<typeof setTimeout> | undefined;
    const again = () => { t = setTimeout(() => { listen_(); const f = folders.get(cwd); if (!f || f.error) { tries++; void askList(cwd); } else tries = 0; again(); }, againIn(tries)); };
    again();
    return () => clearTimeout(t);
  }, [cwd]);
  return v;
}

/** a press answered on the face before the engine replies (the design: under 100 ms): the row's figure moves now */
export function bump(cwd: string, name: string, by: number) {
  const f = folders.get(cwd);
  if (!f) return;
  folders.set(cwd, { ...f, pieces: f.pieces.map((p) => (p.name === name ? { ...p, wants: Math.max(0, p.wants + by), ...(p.open !== undefined ? { open: Math.max(0, p.open + by) } : {}), ...(p.fresh !== undefined && by < 0 ? { fresh: Math.max(0, p.fresh + by) } : {}) } : p)) });
  tell();
}

/** ask the folder again now (after a recipe was made from the face) */
export const refresh = (cwd: string) => askList(cwd);

/** the presses, each one engine message; the list comes back by the engine's change */
export type Opened = { piece?: PieceInfo; seen?: { body?: { text?: string }; lines?: { at: number; by: string; ev: string; note?: string }[] }; recipe?: unknown; file?: string; error?: string };
export const piecesAct = {
  open: (cwd: string, name: string): Promise<Opened> => link()?.ask<Opened>("work.pieces.open", { cwd, name }) ?? Promise.resolve({ error: "not connected" }),
  now: (cwd: string, name: string) => link()?.ask("work.pieces.now", { cwd, name }, 40_000),
  seen: (cwd: string, name: string) => link()?.ask("work.pieces.seen", { cwd, name }),
  /** the row named by its id and title (the order may change under the press), its place only as a last resort */
  tick: (cwd: string, name: string, row: number, key?: { id?: string; t: string }) => link()?.ask("work.pieces.tick", { cwd, name, row, ...(key ? { key: { t: key.t, ...(key.id ? { id: key.id } : {}) } } : {}) }),
  /** "let it act": his press raises the piece's ceiling to what its agent asked, and tells the session that asked */
  letMay: async (cwd: string, p: { name: string; title: string; may?: string; mayFrom?: string }) => {
    if (!p.may) return;
    // his engine lets it, the committed recipe (every teammate's) stays as it is
    const r = await link()?.ask<{ ok?: boolean; error?: string }>("work.pieces.set", { cwd, name: p.name, ceiling: p.may, here: true });
    if (r?.ok && p.mayFrom) void Promise.resolve(link()?.ask("work.say", { sessionId: p.mayFrom, text: `I let ${p.title} ${p.may === "draft" ? "draft" : p.may}. Go on.` }, 1500)).catch(() => {});
    return r;
  },
  /** his yes: this project's scripts may run (the dashed chip) */
  trust: (cwd: string, code: string) => link()?.ask<{ error?: string }>("work.pieces.trust", { cwd, code }),
  drop: (cwd: string, name: string, sessionId: string, at?: { x: number; y: number; w: number; h: number }) =>
    link()?.ask<{ error?: string }>("work.pieces.drop", { cwd, name, sessionId, ...(at ? { at } : {}) }) ?? Promise.resolve({ error: "not connected" }),
};

/** a piece by its name in any folder shown now (a seated block knows its id, not its folder) */
export function usePieceNamed(name: string): { cwd: string; p: PieceInfo } | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => {
    for (const [cwd, f] of folders) { const p = f.pieces.find((x) => x.name === name); if (p) return cacheNamed(cwd, p); }
    return null;
  });
}
// the same object while nothing changed, as useSyncExternalStore wants (one per name: two seated pieces never thrash)
const named = new Map<string, { cwd: string; p: PieceInfo }>();
const cacheNamed = (cwd: string, p: PieceInfo) => { const was = named.get(p.name); if (was && was.cwd === cwd && was.p === p) return was; const now = { cwd, p }; named.set(p.name, now); return now; };
