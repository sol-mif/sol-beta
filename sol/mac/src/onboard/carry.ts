// The carry (#1088, the designer's): a fact travels as the thing the person just saw, never as a dot. The calendar
// block, the file mark, the round letter lifts out of the lens (Lens.tsx `data-lens-fact`), crosses in a low arc and
// shrinks into its own piece of its folder (Folder.tsx `data-piece="<area>:<kind>"`). The parent then lets the fact
// land (the piece draws it) and dips the folder for 220 ms: seen, carried, kept.
//   layer  an absolutely placed, pointer-less box over the whole screen (it may be zoomed; the maths allows for it)
//   el     the element in the lens; it is copied with its look, the original stays as the source's faint trace
//   to     where it lands: the piece's box, or the folder's when the piece is not there yet
//   ms     450 at real speed. With reduced motion nothing travels: the promise resolves at once.
const LOOK = ["display", "alignItems", "justifyContent", "placeItems", "flexDirection", "gap", "padding", "background", "color", "font", "lineHeight", "letterSpacing", "borderRadius",
  "boxShadow", "outline", "outlineOffset", "overflow", "textAlign", "whiteSpace", "textOverflow", "boxSizing", "fill", "stroke", "gridTemplateColumns"] as const;
const BOX = ["position", "left", "top", "right", "bottom", "width", "height", "margin", "transform", "flex"] as const;

function wear(src: Element, dst: HTMLElement | SVGElement, root: boolean) {
  const cs = getComputedStyle(src);
  for (const p of LOOK) dst.style[p as any] = cs[p as any];
  if (!root && !(src instanceof SVGElement && src.tagName !== "svg")) for (const p of BOX) dst.style[p as any] = cs[p as any];
  dst.style.animation = "none"; dst.style.transition = "none"; dst.style.opacity = "1";
  for (let i = 0; i < src.children.length; i++) if (dst.children[i]) wear(src.children[i], dst.children[i] as HTMLElement, false);
}

export function carry(layer: HTMLElement, el: Element, to: DOMRect, ms = 450): Promise<void> {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || ms <= 0) return Promise.resolve();
  const b = layer.getBoundingClientRect(), z = b.width / layer.offsetWidth || 1, from = el.getBoundingClientRect();
  if (!from.width || !from.height) return Promise.resolve();
  const c = el.cloneNode(true) as HTMLElement;
  c.removeAttribute("data-lens-fact"); c.removeAttribute("class"); c.setAttribute("data-carried", "");
  wear(el, c, true);
  const w = Math.min(from.width / z, 200), h = from.height / z;   // a whole row travels as its head: the letter and the name, not its bar
  Object.assign(c.style, { position: "absolute", left: "0", top: "0", width: `${w}px`, height: `${h}px`, margin: "0", overflow: "hidden", pointerEvents: "none", willChange: "transform", transformOrigin: "50% 50%", zIndex: "1" });
  layer.appendChild(c);
  const x0 = (from.left - b.left) / z, y0 = (from.top - b.top) / z;
  const x1 = (to.left + to.width / 2 - b.left) / z - w / 2, y1 = (to.top + to.height / 2 - b.top) / z - h / 2;
  const k = Math.max(0.45, Math.min(1, 22 / h)),   // it lands about a line tall and stays readable: a file keeps its name
    rise = Math.min(70, 24 + Math.hypot(x1 - x0, y1 - y0) * 0.08);
  const a = c.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1)`, filter: "drop-shadow(0 0 0 rgba(0,0,0,0))" },
    { transform: `translate(${x0}px, ${y0 - 6}px) scale(1.08)`, filter: "drop-shadow(0 10px 18px rgba(0,0,0,.6))", offset: 0.16 },   // the lift: it comes off the page
    { transform: `translate(${x0 + (x1 - x0) * 0.55}px, ${Math.min(y0, y1) - rise}px) scale(${(1 + k) / 2})`, filter: "drop-shadow(0 10px 18px rgba(0,0,0,.6))", offset: 0.62 },
    { transform: `translate(${x1}px, ${y1}px) scale(${k})`, filter: "drop-shadow(0 0 0 rgba(0,0,0,0))", opacity: 0.85 },                // the click: straight down into the piece
  ], { duration: ms, easing: "cubic-bezier(.45,0,.2,1)" });
  return a.finished.then(() => c.remove(), () => c.remove());
}
