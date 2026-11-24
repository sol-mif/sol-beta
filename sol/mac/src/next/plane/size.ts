// The infinite canvas, its sizes (BR1, #1615; mine/look/br1/three.html "An infinite canvas"): the plane goes on forever,
// and each piece has a smallest and a largest size on screen. Between them a piece scales with the camera as before; past
// them it holds its size where it stands (its centre stays at its plane point), so a zoom past a limit changes only the
// space between pieces. What then overlaps joins into one group (group.ts). Pure: no store, no window.
// A folder's opened area is not a piece (it holds them) and is never held here.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).

export type Rect = { x: number; y: number; w: number; h: number };
/** what is drawn: a folder's card at Far, a piece's face at Middle, a piece or a chip on one line */
export type Kind = "card" | "face" | "line";

/** each kind's smallest and largest width on screen, px. card: from 160, where a card is still one piece a person reads
 *  (the card check's own piece floor), to 640, so at the person's zoom (layout.ts Z_PERSON) a folder of two columns (212)
 *  up to six (about 624) draws as before; face: from 160, where the far form still has its
 *  name, to twice FACE_PX (form.ts, 280), past which a face only grows empty; line: a name and its state on one line */
export const SIZE: Record<Kind, { min: number; max: number }> = {
  card: { min: 160, max: 640 },
  face: { min: 160, max: 560 },
  line: { min: 120, max: 280 },
};

/** how much a box's size on screen is held against the camera: 1 between the limits; past one, the factor that brings
 *  its width back to it (its height goes with it) */
export function hold(w: number, z: number, kind: Kind): number {
  const s = w * z, { min, max } = SIZE[kind];
  return s <= 0 ? 1 : s < min ? min / s : s > max ? max / s : 1;
}

/** a box at zoom z as it is drawn, in the plane's units (as .pl-cam places it): its size held by `hold`, its centre where
 *  it was, so only the space around it changes; `k` is the hold (1: as before) */
export function held(q: Rect, z: number, kind: Kind): Rect & { k: number } {
  const k = hold(q.w, z, kind);
  if (k === 1) return { ...q, k };
  const w = q.w * k, h = q.h * k;
  return { x: q.x + (q.w - w) / 2, y: q.y + (q.h - h) / 2, w, h, k };
}

/** the same box on screen, px: the plane point at the centre of the view is `cam` {x, y}, the view `vw` × `vh` */
export function heldOn(q: Rect, cam: { x: number; y: number; z: number }, vw: number, vh: number, kind: Kind): Rect {
  const b = held(q, cam.z, kind);
  return { x: (b.x - cam.x) * cam.z + vw / 2, y: (b.y - cam.y) * cam.z + vh / 2, w: b.w * cam.z, h: b.h * cam.z };
}
