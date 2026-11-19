// Build becomes yours (#1089): the keep, seen. The picked version travels from the sheet to its place on the stage,
// its hairline going dashed to solid as it lands, so the Sol user watches where their tool went instead of reading it.
// A copy of the picked node flies (the real one leaves with the sheet); nothing in the stage is moved by this.
// Reduced motion: no travel, the block's own arrival is the answer.
const TRAVEL_MS = 320;   // two of the kit's turns: long enough to follow with the eye, short enough to never wait on
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** where a kept thing stands on the stage: its block, once the stage has drawn it (the block's id is the kept id) */
export function placeOf(id: string, root: ParentNode = document): DOMRect | null {
  return root.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null;
}

/** fly a copy of `from` to `to` (or, with no place yet, a short way toward the stage, fading). Resolves when landed */
export function land(from: HTMLElement, to: DOMRect | null): Promise<void> {
  if (reduced() || typeof from.animate !== "function") return Promise.resolve();
  const a = from.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, margin: "0", zIndex: "70", pointerEvents: "none", transformOrigin: "0 0", opacity: "1", transform: "none" });
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  const end = to
    ? `translate(${to.left - a.left}px, ${to.top - a.top}px) scale(${to.width / a.width})`
    : `translate(${Math.min(120, innerWidth - a.right - 24)}px, -12px) scale(.96)`;
  const fly = ghost.animate(
    [{ transform: "none", opacity: 1 }, { transform: end, opacity: to ? 1 : 0, offset: 0.85 }, { transform: end, opacity: 0 }],
    { duration: TRAVEL_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
  );
  return fly.finished.then(() => ghost.remove(), () => ghost.remove());
}

/** wait for the stage to draw the kept block (at most `ms`), then land on it */
export async function landOn(from: HTMLElement, id: string, ms = 400): Promise<void> {
  const t0 = performance.now();
  let to = placeOf(id);
  while (!to && performance.now() - t0 < ms) { await new Promise((r) => requestAnimationFrame(() => r(null))); to = placeOf(id); }
  return land(from, to);
}
