// The folder shelf (#1031): while a block of Build's stage is dragged toward the spine, Home's folders slide out beside
// the spine's home letter; the block let go on one is seated there (store.seat). The stage's drag asks here for the row
// under the hand (Stage.tsx wraps carry.ts rowAt): a folder answers "home:<id>". No React; a value and its listeners.
import { crossOn } from "./flag";
import { spring } from "../motion";
import { SPRING } from "../kit/feel";
import { nameOf } from "../stage/carry";

let open = false;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
export const shelfOpen = () => open;
export const onShelf = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function setShelf(v: boolean) { if (v !== open) { open = v; tell(); } }

const HOME = "home:";
export const isHomeRow = (row: string | null): row is string => !!row && row.startsWith(HOME);
export const placeOfRow = (row: string) => row.slice(HOME.length);

// The hand and the block stay together: the stage keeps its blocks inside its edge (it clips), so near the shelf the
// held block's own slab leaves the stage and follows the hand on <body>, while the block itself waits faint in its place.
// Let go on a folder, the slab goes into it; anywhere else, it fades back into the block.
type Follow = { el: HTMLElement; block: HTMLElement | null; x: ReturnType<typeof spring>; y: ReturnType<typeof spring>; s: ReturnType<typeof spring>; o: ReturnType<typeof spring> };
let fol: Follow | null = null;
function follower(c: { x: number; y: number }, b: { id: string; title: string }) {
  if (!fol) {
    const el = document.createElement("div");
    el.className = "cross-slab cross-slab-block";
    el.dataset.crossFollow = b.id;
    el.setAttribute("aria-hidden", "true");
    const i = document.createElement("i"), t = document.createElement("b"), s = document.createElement("small");
    t.textContent = b.title; s.textContent = b.id.startsWith("session:") ? "a session of Build's side" : "an artifact of this stage";   // #1045
    el.append(i, t, s);
    document.body.appendChild(el);
    const block = document.querySelector<HTMLElement>(`.st-stage [data-block="${CSS.escape(b.id)}"]`);
    if (block) block.dataset.crossAway = "1";
    const paint = () => { if (fol) { fol.el.style.transform = `translate(${fol.x.v}px, ${fol.y.v}px) scale(${fol.s.v})`; fol.el.style.opacity = String(fol.o.v); } };
    fol = { el, block, x: spring(c.x + 18, SPRING.travel, paint), y: spring(c.y + 12, SPRING.travel, paint), s: spring(0.8, SPRING.lift, paint), o: spring(0, SPRING.fade, paint) };
    fol.s.to(1); fol.o.to(1);
  }
  fol.x.set(c.x + 18); fol.y.set(c.y + 12);   // beside the hand, below it: the folder under the hand stays readable
}
function letGo(into: HTMLElement | null) {
  const f = fol;
  fol = null;
  if (!f) return;
  if (into) { const r = into.getBoundingClientRect(); f.x.to(r.left + 8); f.y.to(r.top); f.s.to(0.5); }
  else if (f.block) { const r = f.block.getBoundingClientRect(); f.x.to(r.left); f.y.to(r.top); }
  f.o.to(0, { cfg: SPRING.fade, delay: into ? 120 : 60 });
  window.setTimeout(() => { f.el.remove(); if (f.block) delete f.block.dataset.crossAway; }, 420);
}
let lastPlace: HTMLElement | null = null;

/** the stage's drag at a point: opens the shelf near the spine, and names the folder under the hand, if any; with the
 *  held block, near the shelf its slab follows the hand */
export function folderAt(c: { x: number; y: number }, b?: { id: string; title: string }): string | null {
  if (!crossOn() || typeof document === "undefined") return null;
  const spine = document.querySelector(".spine")?.getBoundingClientRect();
  if (spine) {
    if (c.x < spine.right + 48) setShelf(true);
    else if (c.x > spine.right + 360) setShelf(false);
  }
  const stage = document.querySelector(".st-stage")?.getBoundingClientRect();
  if (b && open && (!stage || c.x < stage.left + 24)) follower(c, b);
  else if (fol) letGo(null);
  const el = document.elementFromPoint(c.x, c.y)?.closest?.("[data-cross-place]") as HTMLElement | null;
  lastPlace = el?.dataset.crossPlace ? el : null;
  return el?.dataset.crossPlace ? HOME + el.dataset.crossPlace : null;
}
if (typeof window !== "undefined") window.addEventListener("pointerup", () => { letGo(lastPlace); lastPlace = null; window.setTimeout(() => setShelf(false), 30); });

// A session of Build's side put down on a Home folder (#1045). The side's rows are dragged by the side's own drag (the
// browser's: WorkSidebar's "sol/session", the clean side's "text/sol-session"), which also files a session into the
// side's folders; that drag is not taken over. With cross on it is only also heard here: the browser's picture of the
// row gives way to the same slab the stage's block wears (the follower, on the same springs), the shelf slides out by
// the spine as for a block, and a session let go on one of its folders is seated there (store.seatSession, the engine's
// one record). Let go anywhere else, the side's own drag does what it did.
const SESSION_TYPES = ["sol/session", "text/sol-session"];
let held: { id: string; title: string } | null = null;
let blank: HTMLImageElement | null = null;
const sessionOf = (dt: DataTransfer | null) => (dt ? SESSION_TYPES.map((t) => dt.getData(t)).find(Boolean) ?? "" : "");
const carriesSession = (dt: DataTransfer | null) => !!dt && SESSION_TYPES.some((t) => dt.types.includes(t));
/** the folder under a point, if the shelf is out and the session is over one of its folders */
const shelfFolderAt = (x: number, y: number) => (open ? (document.elementFromPoint(x, y)?.closest?.(".cross-shelf [data-cross-place]") as HTMLElement | null) : null);
let onSeat: ((s: { id: string; title: string }, place: string) => void) | null = null;
/** CrossLayer says what a session let go on a folder does (store.seatSession), so this file needs no store */
export const whenSessionSeated = (f: typeof onSeat) => { onSeat = f; };
if (typeof window !== "undefined") {
  window.addEventListener("dragstart", (ev) => {
    // after the row's own dragstart (bubble phase): its data is set, and still readable here
    if (!crossOn() || !carriesSession(ev.dataTransfer)) return;
    const id = sessionOf(ev.dataTransfer);
    if (!id) return;
    const row = (ev.target as HTMLElement)?.closest?.("[data-sid]") as HTMLElement | null;
    const named = nameOf(id);   // the sides tell the stage their names (carry.ts setNames); else the row's first line
    held = { id, title: named !== id.slice(0, 8) ? named : (row?.innerText ?? "").split("\n").map((t) => t.trim()).find(Boolean)?.slice(0, 80) || "a session" };
    blank ??= Object.assign(new Image(), { src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" });
    try { ev.dataTransfer!.setDragImage(blank, 0, 0); } catch { /* the browser's picture stays */ }
  });
  window.addEventListener("dragover", (ev) => {
    if (!held || !crossOn()) return;
    const c = { x: ev.clientX, y: ev.clientY };
    const spine = document.querySelector(".spine")?.getBoundingClientRect();
    if (spine) { if (c.x < spine.right + 48) setShelf(true); else if (c.x > spine.right + 360) setShelf(false); }
    follower(c, { id: `session:${held.id}`, title: held.title });
    const f = shelfFolderAt(c.x, c.y);
    lastPlace = f;
    document.querySelectorAll<HTMLElement>(".cross-shelf [data-cross-over]").forEach((x) => { if (x !== f) delete x.dataset.crossOver; });
    if (f) { f.dataset.crossOver = "1"; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = ev.dataTransfer.effectAllowed === "copy" ? "copy" : "move"; }
  }, true);
  window.addEventListener("drop", (ev) => {
    if (!held || !crossOn()) return;
    const f = shelfFolderAt(ev.clientX, ev.clientY);
    if (!f?.dataset.crossPlace) return;
    ev.preventDefault(); ev.stopPropagation();
    onSeat?.(held, f.dataset.crossPlace);
  }, true);
  window.addEventListener("dragend", () => {
    if (!held) return;
    held = null;
    document.querySelectorAll<HTMLElement>(".cross-shelf [data-cross-over]").forEach((x) => { delete x.dataset.crossOver; });
    letGo(lastPlace); lastPlace = null;
    window.setTimeout(() => setShelf(false), 30);
  });
}
