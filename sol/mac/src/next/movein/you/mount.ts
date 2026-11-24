// How Sol sees you, drawn in roots of its own (BR1, #1615), so no file of the move-in's (#1757: Welcome.tsx, state.ts,
// index.tsx) or the shell's needs a slot for it:
//   #yu   the screens, over the whole window, the frame zoomed to the window (--yk). One move-in screen at a time: while
//         the move-in's own #mvi is up (movein/mount.ts: body.moving) #yu is not mounted at all, and it comes up where it
//         was once #mvi is down (a first-timer froze with both up, #1615)
//   #yus  screen 5, the line on top of Sol's canvas once the screens are down (Open Sol pressed and applied)
// The look is the face's own: dark only in its Night look (never the Mac's dark mode), big type, high contrast and calm from the face's knobs (the
// classes on <html>, when they are there). Signed: marcocyl04-ux's agent (builder F).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./you.css";
import You, { Opened, words } from "./You.tsx";
import * as Y from "./store.ts";
import type { Port } from "./port.ts";
import Lens, { type LookCtl, type Plane } from "./Lens.tsx";
import type { Box } from "./lens-state.ts";
import { layerRoot } from "../../layers.ts";

let root: Root | null = null, sroot: Root | null = null, offStep: (() => void) | null = null;
// the screens as opened (their look) until down(); drawn only while the move-in's screen is not up
let want: { look: string } | null = null, mo: MutationObserver | null = null;
/** the move-in's own screen is up (movein/mount.ts show: body.moving with #mvi shown), or the first-launch start-up before
 *  it (movein/startup.ts: body.starting; a first-timer met #yu over its "Let’s move in", BR1 #1615) */
const moving = () => ["moving", "starting"].some((c) => document.body.classList.contains(c)) || document.getElementById("mvi")?.hidden === false;

function el(id: string, label: string): HTMLElement {
  let d = document.getElementById(id);
  if (d) return d;
  d = document.createElement("div");
  d.id = id; d.setAttribute("role", id === "yu" ? "dialog" : "region"); d.setAttribute("aria-label", label); d.dataset.face = "next";
  layerRoot(d);   // the four layers (next/layers.ts), as on .nx
  document.body.appendChild(d);
  return d;
}
/** the face's look as classes: dark only when the face is (the person's Night look, data-st-look, or a "dark" class on
 *  <html>), never the Mac's own dark: the move-in before it and the canvas after it are the face's light Paper, so a
 *  Mac in dark mode drew this one screen black between two light ones (BR1 rapid item 1, #1615); and the knobs the face
 *  sets on <html> (big, contrast, calm) */
export function lookNow(): string {
  const r = document.documentElement, h = r.classList, dark = h.contains("dark") || r.dataset.stLook === "night";
  return [dark ? "dark" : "light", ...["big", "contrast", "calm"].filter((k) => h.contains(k) || document.body.classList.contains(k))].join(" ");
}
/** the frame's zoom: the drawing's 1040×680 with room around it, never under 0.8 or over 2 */
function fit(d: HTMLElement): void {
  const k = Math.max(0.8, Math.min(2, Math.min(innerWidth / 1100, innerHeight / 720)));
  d.style.setProperty("--yk", k.toFixed(3));
}

const refit = () => { const d = document.getElementById("yu"); if (d && !d.hidden) fit(d); };
/** #yu as wanted: mounted and shown when the screens are open and the move-in's screen is not up, else not mounted */
function draw(): void {
  const d = document.getElementById("yu");
  if (!d) return;
  if (!want || moving()) { d.hidden = true; root?.unmount(); root = null; return; }
  if (d.nextSibling) document.body.appendChild(d);   // last on the body, over the shell
  d.className = `yu ${want.look}`; d.hidden = false; fit(d);
  root ??= createRoot(d);
  root.render(createElement(You, { look: want.look }));
}
/** the screens up on a port (the engine, or a panel person on the dev page); held while the move-in's screen is up */
export function openYou(port: Port, o: { name?: string | null; ko?: boolean; step?: Y.Step; look?: string; hooks?: Y.Hooks } = {}): void {
  if (typeof document === "undefined") return;
  const look = o.look ?? lookNow();
  const d = el("yu", "How Sol sees you");
  d.hidden = true;
  addEventListener("resize", refit);   // one listener however often the screens open
  want = { look };
  Y.setHooks({ ...(o.hooks ?? {}), opened: () => { down(); o.hooks?.opened?.(); line(look); } });
  Y.start(port, { name: o.name, ko: o.ko, step: o.step });
  mo ??= new MutationObserver(draw);
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  draw();
}
/** the screens down (the line stays when there is one) */
export function down(): void {
  want = null;
  draw();
  mo?.disconnect(); mo = null;
  offStep?.(); offStep = null;
}
// ---- Settings › You: the cards on the canvas (Lens.tsx), in #yul over the view (the sidebar stays), Escape or Done closes
let lroot: Root | null = null, offKey: (() => void) | null = null, offSize: (() => void) | null = null;
/** the room the layer takes: the view (#view) when the face has one, else the window */
function frameOf(): Box {
  const v = document.getElementById("view")?.getBoundingClientRect();
  return v && v.width > 0 && v.height > 0 ? { x: v.left, y: v.top, w: v.width, h: v.height } : { x: 0, y: 0, w: innerWidth, h: innerHeight };
}
/** the layer's size from the window: the drawing's 1440 wide at 1, up to 1.5 on a big screen */
const lensK = () => Math.max(1, Math.min(1.5, innerWidth / 1440)).toFixed(3);
export function openLens(port: Port, o: { name?: string | null; ko?: boolean; plane?: Plane; look?: LookCtl; onClose?: () => void; at?: string } = {}): void {
  if (typeof document === "undefined") return;
  const d = el("yul", "You");
  d.setAttribute("role", "dialog");
  const draw = () => {
    const f = frameOf();
    Object.assign(d.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    d.style.setProperty("--lk", lensK());
    d.className = `yu yl-on ${o.look ? (o.look.dark() ? "dark" : "light") + (o.look.big() ? " big" : "") : lookNow()}`;
  };
  draw(); d.hidden = false;
  const close = () => { closeLens(); o.onClose?.(); };
  const look: LookCtl | undefined = o.look && { ...o.look, set: (k) => { o.look!.set(k); requestAnimationFrame(draw); } };
  Y.watch(port, { name: o.name, ko: o.ko });
  lroot ??= createRoot(d);
  lroot.render(createElement(Lens, { plane: o.plane, look, at: o.at, onDone: close, frame: () => { const r = d.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; } }));
  offKey?.(); offSize?.();
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener("keydown", key, true); offKey = () => removeEventListener("keydown", key, true);
  addEventListener("resize", draw); offSize = () => removeEventListener("resize", draw);
}
export function closeLens(): void {
  const d = document.getElementById("yul");
  if (d) d.hidden = true;
  offKey?.(); offKey = null; offSize?.(); offSize = null;
  lroot?.unmount(); lroot = null;
  Y.stop();
}
export const lensOpen = () => !!document.getElementById("yul") && !document.getElementById("yul")!.hidden;

/** screen 5's line, over whatever Sol shows */
function line(look: string): void {
  const s = el("yus", "Set up for you");
  s.className = `yu ${look}`; s.hidden = false;
  sroot ??= createRoot(s);
  sroot.render(createElement(Opened, { T: words(Y.get().ko), onClose: () => { s.hidden = true; } }));
}
