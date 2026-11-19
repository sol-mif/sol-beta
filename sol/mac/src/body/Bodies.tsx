// The body from the one system (#1213, sol/design/system/rules.md rules 31 to 34), drawn where Body.tsx would draw A when
// the page's switch (body/variants.ts) names "one". It is a piece like the others: a solid object with the card's light
// (one lit top rim, from above and a little left) and the card's drop, the jelly's six as bands for its fill, deep pill
// eyes. It is the only thing on the window with a face and the only glossy thing (rule 32). It never wears a meaning
// colour: needs-you lifts it and turns its eyes toward the ask, while the yellow stays on the block (rule 33). Its moves
// are the system's: it lands on arrival, breathes at rest, its bands drift at work, it lifts when it needs you; under
// reduced motion it holds its end state. Under 20 px it is the mark: one flat ink shape with the eyes punched out (rule 34).
// It fills Body's frame the way A does: about half the frame wide, centred a little low, so a 24 px slot, the seat and the
// hero hold it unchanged.
// It performs the acts of body/role.ts (#1245): arrive, sit, carry, work, point, land, wait, mark. `act` names one; with
// none it plays the face's ladder state (`doing`: rest sits, work works, needs points), so every page that passed `doing`
// draws as before. `toward` is what it looks at, and for carry where it takes the thing: an element's id, a rect, or (as
// before) an eye offset in its 100 box. Its light is A's (one lit top rim, the one gloss); its halo stays the jelly's own
// (rule 5), drawn by its seat, never lent to a piece.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { sol, useLit, ink, blk, deep } from "../kit/Accent";
import { SYSTEM } from "../kit/tokens";
import { dur, ease } from "../motion";
import { actInfo, actOf, type Act } from "./role";
import { bodyDoing, type BodyDoing, type BodyVariant } from "./variants";

/** the body's outline on a 100 box: a soft dome on a flat seat; x 23 to 77, y 30 to 80 */
const SHAPE = "M23 72 C22 50 30 30 50 30 C70 30 78 50 77 72 C77 78 72 80 66 80 L34 80 C28 80 23 78 23 72 Z";
const X0 = 23, BW = 54;
const scaled = (d: string, k: number) => d.replace(/-?\d+(\.\d+)?/g, (n) => (+n * k).toFixed(2));
const DP = SYSTEM.depth, MV = SYSTEM.move;
const t = (m: keyof typeof MV) => `${dur(MV[m].d)}ms ${ease(MV[m].e)}`;
/** an act's own motion, by role.ts's names */
const ta = (a: Act) => `${dur(actInfo(a).dur)}ms ${ease(actInfo(a).ease)}`;

/** the body's moves; quiet under reduced motion (the end state at once, rule 30) */
const BODY_MOVES = `
@keyframes bo-land { from { transform: translateY(${MV.land.from[1] * 2}%) scale(${MV.land.from[0]}); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes bo-arrive { from { transform: translateY(-70%) scale(.55); opacity: 0 } 30% { opacity: 1 } to { transform: none; opacity: 1 } }
@keyframes bo-set { 0% { transform: none } 45% { transform: scale(1.04, .94) } 100% { transform: none } }
@keyframes bo-breath { from { transform: scale(1, 1) } to { transform: scale(1.015, 1.03) } }
@keyframes bo-drift { from { background-position: var(--x0) 0 } to { background-position: var(--x1) 0 } }
@keyframes bo-blink { 0%, 94%, 100% { transform: scaleY(1) } 97% { transform: scaleY(.12) } }
@media (prefers-reduced-motion: reduce) { [data-body-one], [data-body-one] * { animation: none !important; transition: none !important } }
`;

/** what the body looks at: an element's id, a rect on the page, or an eye offset in its 100 box (the old form) */
export type Toward = string | { left: number; top: number; width: number; height: number } | readonly [number, number];
type Rect = { left: number; top: number; width: number; height: number };

/** the target's rect against the body's own (untransformed) box, kept fresh on resize, scroll and the target's moves */
function useTarget(self: RefObject<HTMLDivElement | null>, toward: Toward | undefined, on: boolean) {
  const [got, setGot] = useState<{ me: Rect; it: Rect } | null>(null);
  const r = toward && typeof toward === "object" && "left" in toward ? toward : null;
  const key = r ? `${r.left},${r.top},${r.width},${r.height}` : String(toward);
  useLayoutEffect(() => {
    if (!on || !toward || Array.isArray(toward)) { setGot(null); return; }
    let raf = 0;
    const read = () => {
      const me = self.current?.getBoundingClientRect();
      const el = typeof toward === "string" ? (document.getElementById(toward) ?? document.querySelector(`[data-toward="${toward}"]`)) : null;
      const it = typeof toward === "string" ? el?.getBoundingClientRect() : (toward as Rect);
      if (!me || !it) { setGot(null); return; }
      setGot((g) => (g && g.me.left === me.left && g.me.top === me.top && g.it.left === it.left && g.it.top === it.top && g.it.width === it.width ? g : { me, it }));
    };
    const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(read); };
    read();
    // a target that moves after it is drawn (a card lifting): read once more when its own move has settled
    const later = window.setTimeout(read, dur("pour"));
    window.addEventListener("resize", soon); window.addEventListener("scroll", soon, true);
    const el = typeof toward === "string" ? document.getElementById(toward) : null;
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(soon) : null;
    if (el && ro) ro.observe(el);
    return () => { cancelAnimationFrame(raf); clearTimeout(later); window.removeEventListener("resize", soon); window.removeEventListener("scroll", soon, true); ro?.disconnect(); };
  }, [key, on]);   // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}

/** the body from the system, at `size` px, doing `act` (body/role.ts); with no act, the face's ladder state (`doing`,
 *  defaulting to the page's, variants.ts setBodyDoing) as its act. `holding` is the thing in its hands while it carries */
export function BodyOne({ size, act, doing, toward: asked, holding, className }: {
  size: number; act?: Act; doing?: BodyDoing; toward?: Toward; holding?: ReactNode; className?: string;
}) {
  const a: Act = act ?? actOf(doing ?? bodyDoing());
  // pointing with no target named, it looks a little to its right, where the notch's words are (as before #1245)
  const toward: Toward | undefined = asked ?? (a === "point" ? [3, 0] : undefined);
  const l = useLit(), uid = useId().replace(/:/g, ""), self = useRef<HTMLDivElement>(null), hold = useRef<HTMLDivElement>(null);
  const info = actInfo(a), aims = info.toward && toward != null;
  const got = useTarget(self, toward, aims && a !== "mark" && size >= 20);
  // the first act decides how it enters: arrive drops from the notch, everything else lands where it is drawn
  const [first] = useState(a);
  const [, tick] = useState(0);
  useEffect(() => { if (a === "land") { const h = window.setTimeout(() => tick((n) => n + 1), dur(info.dur)); return () => clearTimeout(h); } }, [a]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (a === "mark" || size < 20) return <BodyMark size={size} className={className} />;
  const k = size / 100, bw = BW * k, x0 = X0 * k;
  const work = a === "work", lifted = info.depth === "lifted", low = a === "wait", still = a === "wait";
  // where it looks: a unit vector toward the target's middle, from its own middle
  let look: readonly [number, number] = [0, 0], lean = 0, go: readonly [number, number] = [0, 0];
  if (aims && Array.isArray(toward)) look = toward as readonly [number, number];
  else if (aims && got) {
    const cx = got.it.left + got.it.width / 2 - (got.me.left + got.me.width / 2), cy = got.it.top + got.it.height / 2 - (got.me.top + got.me.height / 2);
    const d = Math.hypot(cx, cy) || 1, ux = cx / d, uy = cy / d;
    look = [ux * 4, uy * 3];
    // it turns toward the ask when it points (rule 33); a little, from its seat
    if (a === "point") lean = ux * 4;
    // it takes the thing to where it lands: beside the target, at its left, held level with its middle
    if (a === "carry") go = [got.it.left - Math.max(size, hold.current?.offsetWidth ?? 0) / 2 - size / 2 - size * 0.25 - got.me.left, got.it.top + got.it.height / 2 - size * 0.6 - got.me.top];
  }
  const lift = lifted ? `translateY(${-8}%) scale(${DP.lifted.scale})` : low ? "translateY(6%)" : "none";
  const shadowA = DP.card.shadow[0] * (lifted ? 0.6 : 0.9);
  const enter = first === "arrive" ? `bo-arrive ${ta("arrive")} both` : `bo-land ${t("land")} both`;
  const breath = `bo-breath ${dur("breath")}ms ${ease("breath")} infinite alternate`;
  const life = a === "sit" || a === "arrive" ? breath + (a === "arrive" ? ` ${dur("pour")}ms` : "")
    : a === "land" ? `bo-set ${ta("land")} 1, ${breath} ${dur("land")}ms` : undefined;
  return (
    <div ref={self} data-body-one data-act={a} className={className} style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <style>{BODY_MOVES}</style>
      <div style={{ position: "absolute", inset: 0, transform: go[0] || go[1] ? `translate(${go[0]}px, ${go[1]}px)` : "none", transition: `transform ${ta("carry")}` }}>
        {/* its drop, on the ground below it: the card's drop, wider and softer when it lifts */}
        <div style={{ position: "absolute", left: "26%", right: "26%", top: "78%", height: "7%", borderRadius: "50%", background: blk(shadowA),
          filter: `blur(${Math.max(1, size * (lifted ? 0.05 : 0.03))}px)`, transform: lifted ? "scale(1.12)" : "none", transition: `transform ${t("lift")}, background ${t("lift")}` }} />
        <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 80%", transform: lean ? `${lift} rotate(${lean.toFixed(2)}deg)` : lift,
          transition: `transform ${low ? ta("wait") : t("lift")}` }}>
          <div style={{ position: "absolute", inset: 0, animation: enter }}>
            <div key={a === "land" ? "land" : "on"} style={{ position: "absolute", inset: 0, transformOrigin: "50% 80%", animation: life }}>
              {/* the fill: the jelly's six as bands across the body; at work they drift, there and back so there is no seam;
                  waiting, they dim and hold (the steady parts carry the error, rule 37) */}
              <div style={{ position: "absolute", inset: 0, clipPath: `path("${scaled(SHAPE, k)}")`,
                backgroundImage: sol(l, l.jelly.six, work), backgroundSize: `${work ? bw * 2 : bw}px 100%`, backgroundRepeat: "repeat-x", backgroundPosition: `${x0}px 0`,
                ["--x0" as string]: `${x0}px`, ["--x1" as string]: `${x0 + bw * 2}px`, animation: work ? `bo-drift ${dur(MV.drift.d)}ms ${ease(MV.drift.e)} infinite` : undefined,
                ...(low ? { filter: "saturate(.4) brightness(.62)", transition: `filter ${ta("wait")}` } : {}) }} />
              <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                <defs>
                  <clipPath id={`c${uid}`}><path d={SHAPE} /></clipPath>
                  <linearGradient id={`s${uid}`} x1="0" y1="30" x2="0" y2="80" gradientUnits="userSpaceOnUse">
                    <stop offset="0.5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.3" />
                  </linearGradient>
                  <linearGradient id={`r${uid}`} x1="0" y1="30" x2="0" y2="62" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#fff" stopOpacity={Math.min(0.9, l.light.rim * 1.6)} /><stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <radialGradient id={`g${uid}`} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.6" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <g clipPath={`url(#c${uid})`}>
                  {/* the dark falls to its seat: a solid thing on a ground */}
                  <rect x="0" y="0" width="100" height="100" fill={`url(#s${uid})`} />
                  {/* the one gloss on the window, where the light lands (upper left) */}
                  <ellipse cx="38" cy="40" rx="11" ry="6" transform="rotate(-24 38 40)" fill={`url(#g${uid})`} />
                </g>
                {/* the lit top rim: the card's, brighter at the crown, gone by the middle */}
                <path d={SHAPE} fill="none" stroke={`url(#r${uid})`} strokeWidth={1.2} clipPath={`url(#c${uid})`} />
                {/* deep pill eyes: they blink; they follow `toward`; waiting they are half shut and still */}
                <g style={{ transform: `translate(${look[0].toFixed(2)}px, ${look[1].toFixed(2)}px)`, transition: `transform ${t("lift")}` }}>
                  {[41, 56].map((x, i) => (
                    <g key={i} style={{ transformBox: "fill-box", transformOrigin: "50% 100%", transform: low ? "scaleY(.5)" : "none", transition: `transform ${ta("wait")}` }}>
                      <rect x={x} y={49} width={5.6} height={11} rx={2.8} fill={deep(0.92)}
                        style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: still ? undefined : `bo-blink 3900ms linear ${700 + i * 40}ms infinite` }} />
                    </g>
                  ))}
                </g>
              </svg>
              {/* the thing in its hands while it carries: held at its front, below the eyes */}
              {a === "carry" && holding != null && (
                <div ref={hold} data-holding style={{ position: "absolute", left: "50%", top: "76%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{holding}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** the mark under 20 px (rule 34): one flat ink shape, the eyes punched out; no gloss, no face, no motion */
export function BodyMark({ size, color = ink, className }: { size: number; color?: string; className?: string }) {
  const eyes = [41, 56].map((x) => `M${x + 2.8} 49 a2.8 2.8 0 0 1 2.8 2.8 v5.4 a2.8 2.8 0 0 1 -5.6 0 v-5.4 a2.8 2.8 0 0 1 2.8 -2.8 Z`).join(" ");
  return (
    <svg className={className} width={size} height={size} viewBox="18 22 64 64" style={{ flex: "none" }}>
      <path d={`${SHAPE} ${eyes}`} fill={color} fillRule="evenodd" />
    </svg>
  );
}

/** Body.tsx's hook: the body the switch names, when it is not A */
export function BodyVariantView(p: { variant: Exclude<BodyVariant, "a">; size: number; className?: string }) {
  return <BodyOne size={p.size} className={p.className} />;
}
