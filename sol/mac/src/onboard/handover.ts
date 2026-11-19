// The hand-over (#1088, the designer's): the onboarding's last frame IS Home's first frame. Nothing is redrawn to
// look like Home; the real Home is already under the stage, and the stage's folders travel to the boxes Home's own
// folders have. While they travel the stage's ground clears, so Home's spine, side, line and sources are simply
// there, in their places, before the folders arrive. At the end the stage's folders sit on Home's to the pixel,
// Home's are shown, and the caller removes the stage in the same frame: no jump, whatever Home's layout is.
//   stage  the onboarding's root (position fixed, its own ground colour); its folders are `.ob-folders [data-folder]`
//   home   the real Home's root, mounted and laid out under the stage; its folders carry the same `data-folder` ids
//   ms     450 at real speed
// Answers false, having moved nothing, when Home's folders are not there or motion is reduced: the caller cuts.
// The stage's jelly (`.ob-jelly`) is left alone: it keeps its own travel to the spine.
const EASE = "cubic-bezier(.45,0,.2,1)";

export function homeReady(home: ParentNode, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => { const el = home.querySelector<HTMLElement>(`[data-folder="${CSS.escape(id)}"]`); return !!el && el.getBoundingClientRect().width > 0; });
}

export async function glide(stage: HTMLElement, home: HTMLElement, ms = 450): Promise<boolean> {
  const mine = [...stage.querySelectorAll<HTMLElement>(".ob-folders [data-folder]")];
  const pairs = mine.map((el) => [el, home.querySelector<HTMLElement>(`[data-folder="${CSS.escape(el.dataset.folder ?? "")}"]`)] as const);
  if (!pairs.length || pairs.some(([, to]) => !to || !to.getBoundingClientRect().width)) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || ms <= 0) return false;

  // nothing on the way may clip a folder as it leaves its column (the stage's right column scrolls, so it clips):
  // every box between a folder and the stage lets its content show; a scrolled one keeps its place by a margin
  for (const el of mine) for (let n = el.parentElement; n && n !== stage; n = n.parentElement) {
    if (getComputedStyle(n).overflow === "visible") continue;
    const top = n.scrollTop, left = n.scrollLeft;
    n.style.overflow = "visible";
    if (top) n.style.marginTop = `${parseFloat(getComputedStyle(n).marginTop) - top}px`;
    if (left) n.style.marginLeft = `${parseFloat(getComputedStyle(n).marginLeft) - left}px`;
  }
  // then measure everything, then write
  const boxes = pairs.map(([el, to]) => ({ el, to: to!, a: el.getBoundingClientRect(), b: to!.getBoundingClientRect() }));
  const you = stage.querySelector<HTMLElement>('.ob-right > [data-folder="you"]');
  const youAt = you?.getBoundingClientRect(), youTo = home.ownerDocument.querySelector<HTMLElement>(".fh-side .fh-row:last-child")?.getBoundingClientRect();
  const keep = new Set<Element>();   // the folders, the jelly and everything that holds them stay; the rest of the stage clears
  for (const el of [...mine, stage.querySelector(".ob-jelly")]) for (let n: Element | null = el; n && n !== stage; n = n.parentElement) keep.add(n);
  const rest = [...stage.querySelectorAll<HTMLElement>("*")].filter((n) => !keep.has(n) && n.parentElement !== null && (n.parentElement === stage || keep.has(n.parentElement)) && !mine.some((f) => f.contains(n)));

  const done: Animation[] = [];
  const opt = { duration: ms, easing: EASE, fill: "forwards" as const };
  for (const { to } of boxes) to.style.visibility = "hidden";   // Home's own folders wait under mine
  // Home's "+" lies where the folders pass: it waits, and comes in once they have landed
  const plus = home.querySelector<HTMLElement>("[data-add]");
  if (plus) plus.style.opacity = "0";
  const end = (a: DOMRect, b: DOMRect) => ({ transform: `translate(${b.left - a.left}px, ${b.top - a.top}px)`, width: `${b.width}px`, minHeight: `${b.height}px` });
  for (const { el, a, b } of boxes) {
    // each folder keeps its top-left corner and its own flow; only its box changes, so its pieces reflow as Home's do
    Object.assign(el.style, { transformOrigin: "0 0", justifySelf: "start", alignSelf: "start", boxSizing: "border-box", willChange: "transform, width" });
    done.push(el.animate([{ transform: "translate(0, 0)", width: `${a.width}px`, minHeight: `${a.height}px` }, end(a, b)], opt));
  }
  for (const n of rest) {
    if (n === you && youAt && youTo) done.push(n.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${youTo.left - youAt.left}px, ${youTo.top - youAt.top}px) scale(.3)`, opacity: 0 }], { ...opt, duration: ms * 0.7 }));
    else done.push(n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: Math.min(200, ms), easing: "ease-out", fill: "forwards" }));
    n.style.pointerEvents = "none";
  }
  const ground = getComputedStyle(stage).backgroundColor;
  done.push(stage.animate([{ backgroundColor: ground }, { backgroundColor: "rgba(0, 0, 0, 0)" }], { duration: ms * 0.8, easing: "ease-out", fill: "forwards" }));
  stage.style.pointerEvents = "none";

  await Promise.all(done.map((x) => x.finished.catch(() => undefined)));
  // Home may have settled while the folders travelled (its head, its line and its sources arrive in their own time):
  // its boxes are measured again, and a folder whose place moved follows it there (120 ms), at most twice
  for (let turn = 0; turn < 2; turn++) {
    const moved = boxes.filter((x) => { const now = x.to.getBoundingClientRect(); return Math.abs(now.left - x.b.left) > 0.5 || Math.abs(now.top - x.b.top) > 0.5 || Math.abs(now.width - x.b.width) > 0.5 || Math.abs(now.height - x.b.height) > 0.5; });
    if (!moved.length) break;
    await Promise.all(moved.map((x) => { const from = end(x.a, x.b); x.b = x.to.getBoundingClientRect(); return x.el.animate([from, end(x.a, x.b)], { duration: 120, easing: "ease-out", fill: "forwards" }).finished.catch(() => undefined); }));
  }
  // the swap, in one frame: Home's folders are shown where mine stand; the caller unmounts the stage right after
  for (const { el, to } of boxes) { to.style.visibility = ""; el.style.visibility = "hidden"; }
  if (plus) { plus.style.opacity = ""; plus.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" }); }
  return true;
}

/** how far each of the stage's folders stands from Home's, in px, after a glide (the walk's proof: every number ≤ 1) */
export function offBy(stage: HTMLElement, home: HTMLElement): number {
  let worst = 0;
  for (const el of stage.querySelectorAll<HTMLElement>(".ob-folders [data-folder]")) {
    const to = home.querySelector<HTMLElement>(`[data-folder="${CSS.escape(el.dataset.folder ?? "")}"]`); if (!to) return Infinity;
    const a = el.getBoundingClientRect(), b = to.getBoundingClientRect();
    worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width));
  }
  return worst;
}
