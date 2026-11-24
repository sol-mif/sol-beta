// The sidebar's folders are the canvas's, in one order from one source (walk note item 8, BR1 #1615): the canvas's
// positions (cv/core.ts folderOrder). A folder dragged in the sidebar to another place among the folders at the top is
// moved on the canvas: the folders are laid out again in the new order by the layout's own rows (plane/layout.ts flow),
// from where the first of them starts and as wide as they span now, and each one that moves is put there by M.place,
// as a drag on the canvas would. The sidebar then reads the new order back from the positions; it keeps none of its own.
// A folder inside a folder sits in its folder's cells by rule (layout.ts placeInside), so it is not dragged here.
// Signed: marcocyl04-ux's agent (builder E8), BR1 (#1615).
import { D, M, ancestors, folderOrder } from "./cv/index.ts";
import { flow, isOff } from "./plane/layout.ts";

type Rect = { x: number; y: number; w: number; h: number };

/** the order after `moved` is dropped before `before` (null: after the last) (pure) */
export function dropOrder(order: string[], moved: string, before: string | null): string[] {
  if (moved === before || !order.includes(moved)) return order;
  const rest = order.filter((id) => id !== moved), at = before ? rest.indexOf(before) : -1;
  return at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** where each folder goes so the canvas reads in `order`: the layout's rows from where the first of them starts, as wide
 *  as they span now (so a canvas laid out by rule, read in its own order, moves nothing); only the ones that move (pure) */
export function placesFor(order: string[], at: Record<string, Rect | undefined>): { id: string; x: number; y: number }[] {
  const qs = order.flatMap((id) => (at[id] ? [{ id, q: at[id]! }] : []));
  if (qs.length < 2) return [];
  const x0 = Math.min(...qs.map((x) => x.q.x)), y0 = Math.min(...qs.map((x) => x.q.y));
  const W = Math.max(...qs.map((x) => x.q.x + x.q.w)) - x0;
  return flow(qs.map((x) => ({ r: { id: x.id }, cols: 0, w: x.q.w, h: x.q.h })), W).at
    .map(({ q, x, y }) => ({ id: q.r.id, x: x0 + x, y: y0 + y }))
    .filter((p) => Math.round(at[p.id]!.x) !== Math.round(p.x) || Math.round(at[p.id]!.y) !== Math.round(p.y));
}

/** the folders at the top of the canvas that are on it, in the canvas's order: the ones a sidebar drag reorders */
export const reorderable = (): string[] => folderOrder().filter((id) => !ancestors(id).length && !isOff(id));

/** a sidebar drop: `moved` before `before` (null: last); each folder that moves goes through M.place. False: nothing moved */
export function dropFolder(moved: string, before: string | null): boolean {
  const order = reorderable();
  if (!order.includes(moved)) return false;
  const ps = placesFor(dropOrder(order, moved, before), D.pos ?? {});
  for (const p of ps) M.place(p.id, p.x, p.y);
  return ps.length > 0;
}

// ---------------------------------------------------------------- the drag, on a folder's row (Next.tsx PlaceRow)

let justDragged = false;
/** a press that ended a drag is not a press: the row's click asks this (and it is reset) */
export const wasDrag = (): boolean => { const d = justDragged; justDragged = false; return d; };

/** press and move a top folder's row: a line shows where it goes among the folders; letting go puts it there */
export function grabRow(e: { button: number; clientX: number; clientY: number; currentTarget: EventTarget }, id: string): void {
  if (e.button !== 0 || !reorderable().includes(id)) return;
  const row = e.currentTarget as HTMLElement, sx = e.clientX, sy = e.clientY;
  let on = false, mark: HTMLElement | null = null, before: string | null | undefined;
  const clear = () => { mark?.classList.remove("nx-drop-before", "nx-drop-after"); mark = null; };
  const target = (x: number, y: number) => {
    const t = (document.elementFromPoint(x, y) as Element | null)?.closest?.<HTMLElement>("#sideregions .nx-reg[data-region]");
    const tid = t?.dataset.region;
    if (!t || !tid || !reorderable().includes(tid)) return { t: null, before: undefined };
    const r = t.getBoundingClientRect(), after = y > r.top + r.height / 2, order = reorderable();
    return { t, after, before: after ? order[order.indexOf(tid) + 1] ?? null : tid };
  };
  const mv = (ev: PointerEvent) => {
    if (!on && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) return;
    if (!on) { on = true; row.classList.add("nx-dragging"); }
    const g = target(ev.clientX, ev.clientY);
    clear();
    before = g.before;
    if (g.t && g.t !== row) { mark = g.t; mark.classList.add(g.after ? "nx-drop-after" : "nx-drop-before"); }
  };
  const up = () => {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    clear(); row.classList.remove("nx-dragging");
    if (!on) return;
    justDragged = true; setTimeout(() => { justDragged = false; }, 0);
    if (before !== undefined && before !== id) dropFolder(id, before);
  };
  addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
}
