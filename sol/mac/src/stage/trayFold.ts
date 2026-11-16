// The tray (#779, #751 B16), for the stage behind `stage.whole` (trayFold.ts: beside #739's Tray.tsx, a name a Mac's disk
// tells apart): feel.md "fold" and "unfold", whole.md "#746" and the
// engine's start(). A new session lays no blocks: the past waits here, by session. Pure: what the tray holds (the
// stage's own folds in front, then the project's other blocks grouped by the session that made them, newest first),
// where the strip's squares are, and the fold flight's arithmetic (translate + one uniform scale into a square, and back
// out of it). No DOM; trayHand.ts moves the blocks, WholeTray.tsx draws the strip and its shelf.
import type { Kind, Rect } from "./model.ts";
import { TRAY } from "../kit/feel.ts";

/** one of the project's blocks not on this stage, as #820's work.stage.get will carry it (`tray`, #746's blocks.ts
 *  trayOf): `from` is the session that made it, `at` when */
export type TrayBlock = { id: string; kind: Kind; title: string; state: string; from: string; at: number; body?: unknown };
/** a small copy in the tray; `body` when the face has it (a fold of this stage; the engine's tray once it carries bodies):
 *  the copy draws it live (#954, whole.md "the tray holds small live copies") */
export type Mini = { id: string; kind: Kind; title: string; own: boolean; body?: unknown };
/** the stage's own folds (`from` null, "this session") in front, then each session that made the rest */
export type Group = { from: string | null; minis: Mini[] };
/** a block folded on this stage, with the session that made it (block.sessions[0]) */
export type Folded = { id: string; kind: Kind; title: string; made?: string; body?: unknown };

/** what the tray holds. Folded here and made here: this session's, in the order they folded. Folded here but made in
 *  another session (today's engine lays the project's open blocks folded on a new stage): the past, under the session
 *  that made it. The engine's tray (#820) adds the project's blocks that are on no stage of this session's */
export function trayGroups(session: string, folded: Folded[], engine: TrayBlock[] = []): Group[] {
  const out: Group[] = [];
  const own = folded.filter((f) => !f.made || f.made === session);
  if (own.length) out.push({ from: null, minis: own.map((f) => ({ id: f.id, kind: f.kind, title: f.title, own: true, ...withBody(f.body) })) });
  const by = new Map<string, Mini[]>(), seen = new Set(own.map((f) => f.id));
  const put = (from: string, m: Mini) => { if (seen.has(m.id)) return; seen.add(m.id); by.set(from, [...(by.get(from) ?? []), m]); };
  for (const t of [...engine].sort((a, b) => b.at - a.at)) put(t.from, { id: t.id, kind: t.kind, title: t.title, own: false, ...withBody(t.body) });
  for (const f of folded) if (f.made && f.made !== session) put(f.made, { id: f.id, kind: f.kind, title: f.title, own: true, ...withBody(f.body) });
  for (const [from, minis] of by) out.push({ from, minis });
  return out;
}
const withBody = (body: unknown) => (body === undefined ? {} : { body });
/** how many it holds: the strip's count */
export const count = (gs: Group[]) => gs.reduce((n, g) => n + g.minis.length, 0);
/** how many squares the strip draws */
export const squares = (n: number) => Math.min(TRAY.max, n);
/** the i-th square, from the squares' row's top left (stage coordinates) */
export function squareRect(row: { x: number; y: number }, i: number): Rect {
  return { x: row.x + Math.min(i, TRAY.max - 1) * (TRAY.sq.w + TRAY.sq.gap), y: row.y, w: TRAY.sq.w, h: TRAY.sq.h };
}

/** a transform with its origin at the block's top left */
export type Fly = { dx: number; dy: number; s: number };
/** the fold flight: the block, scaled by one factor to fit the square, centred on it */
export function flight(from: Rect, to: Rect): Fly {
  const s = Math.min(to.w / from.w, to.h / from.h);
  return { dx: to.x + (to.w - from.w * s) / 2 - from.x, dy: to.y + (to.h - from.h * s) / 2 - from.y, s };
}
/** unfold: where the block starts, as a transform on it at its place: its small copy (or the strip's first square) */
export function unflight(copy: Rect, to: Rect): Fly {
  return { dx: copy.x - to.x, dy: copy.y - to.y, s: copy.w / to.w };
}
/** a transform applied to a rect, for the tests and the shots: where the block shows */
export const shownAt = (r: Rect, f: Fly): Rect => ({ x: r.x + f.dx, y: r.y + f.dy, w: r.w * f.s, h: r.h * f.s });

/** a copy's scale: the block's whole size into the copy's body */
export const miniScale = (r: { w: number; h: number }) => Math.min(TRAY.mini.w / r.w, TRAY.mini.body / r.h);
/** a copy dragged out: the block at its own size, around the finger (its head under it), kept on the stage */
export function copyAt(pointer: { x: number; y: number }, size: { w: number; h: number }, room: { w: number; h: number }, pad = 16, head = 20): Rect {
  const x = Math.max(pad, Math.min(pointer.x - size.w / 2, room.w - pad - size.w));
  const y = Math.max(pad, Math.min(pointer.y - head, room.h - size.h));
  return { x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };
}
/** #954: the shell's words without its escapes, the last `n` lines (pure, for the tests) */
export function lastLines(buf: string, n = 14): string {
  // eslint-disable-next-line no-control-regex
  const plain = buf.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*\x07/g, "").replace(/\r\n?/g, "\n");
  return plain.split("\n").slice(-n).join("\n");
}

/** the engine's tray, when it sends one (#820's work.stage.get `tray`); today's engine sends none */
export const trayOf = (s: unknown): TrayBlock[] => { const t = (s as { tray?: unknown } | null)?.tray; return Array.isArray(t) ? (t as TrayBlock[]) : []; };
