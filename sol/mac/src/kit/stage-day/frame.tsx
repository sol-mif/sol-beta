// The frame every scene of the day stands in (#1245): stage-whole.tsx's frame (#1213), grown, never a new one. The same
// notch strip on the menu bar, the window on the desk (the one see-through thing, rule 2), the spine, the side card, the
// stage and the bar with the jelly in its seat; the same sizes, depths and type. What grows: the ground and the set are
// the person's (kit/Yours.tsx), the jelly can leave its seat and travel (carry, point), and a scene plays as steps.
import { createContext, useContext, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import desk from "../../../../design/direction/shots/desk-sonoma.jpg";
import { BodyMark, BodyOne, type Toward } from "../../body/Bodies";
import type { Act as Role } from "../../body/role";
import { dur, ease, reducedMotion } from "../../motion";
import {
  Coin, HaloDial, HoldStill, MEANING, MeterBar, Num, PillControl, Ping, SessionRow, Sign, Sticker,
  blk, deep, dim, heatOf, ink, mute, on, picked, sol, surface, useLit, well, type PingState,
} from "../Accent";
import { Glyph, type GlyphName } from "../Glyph";
import { Ground } from "../Ground";
import { curve } from "../curve";
import { FRAME, MAC } from "../geometry";
import { CURVE, SHADE, SYSTEM, TYPE as T } from "../tokens";
import { Pure, type GroundId } from "../Yours";

/** the window's size: a 13" Mac's 1280 × 800, or the small Mac's 1024 × 640 (`?size=small`, or the "small" scene,
 *  #1245's also): there the side folds to the rail's glyphs (SIDE is 0, the spine stays) and the bar's mode words to
 *  theirs. Read once from the page, so the day reloads when it crosses between sizes (stage-day.tsx's go) */
const sq = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
export const SMALL = sq.get("size") === "small" || sq.get("scene") === "small";
export const W = SMALL ? 1024 : 1280, H = SMALL ? 640 : 800, MENU = 34, WH = H - MENU;
export const SPINE = FRAME.spine, SIDE = SMALL ? 0 : FRAME.side, STAGE = SPINE + SIDE;
/** the stage's own width: from the side card's edge plus one margin to the window's right margin */
export const SW = W - STAGE - 64;
export const R = CURVE.radius.block, DP = SYSTEM.depth;
export const label: CSSProperties = { fontSize: T.label[0], lineHeight: `${T.label[1]}px` };
/** the bar's top, in the window: everything on the stage stays above it */
export const BAR_H = 72, BAR_TOP = WH - 20 - BAR_H;
/** where the jelly sits in the bar (its seat's middle), in the window */
export const SEAT: readonly [number, number] = [STAGE + 32 + 10 + 26, BAR_TOP + BAR_H / 2];

// ---- a scene plays as steps ---------------------------------------------------------------------------------------
/** the beat every scene counts in: one pour (850 ms), the jelly's own time */
export const beat = (n: number) => dur("pour") * n;
/** the step a scene is at: each step starts at its time; under reduced motion the last step at once (rule 30) */
export function usePlay(at: readonly number[], hold?: number | null): number {
  const last = at.length - 1, still = hold != null ? Math.min(last, Math.max(0, hold)) : reducedMotion() ? last : null;
  const [i, setI] = useState(still ?? 0);
  useEffect(() => {
    if (still != null) return;
    const ts = at.slice(1).map((ms, k) => window.setTimeout(() => setI(k + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return i;
}

// ---- the ground: what the window lies on, and the words that sit straight on it --------------------------------
const GroundCtx = createContext<GroundId>("glass");
export const GroundSet = GroundCtx.Provider;
/** the words straight on the window (not on a card): grey on black glass, deep on cream (cards stay solid on both, rule 1) */
export function useOnGround() {
  const g = useContext(GroundCtx);
  return g === "cream" ? { ground: g, ink: deep(0.9), dim: deep(0.58), mute: deep(0.36), faint: deep(0.14) } : { ground: g, ink, dim, mute, faint: on(0.16) };
}

// ---- the jelly ------------------------------------------------------------------------------------------------------
/** the jelly doing an act (body/role.ts, acted by body/Bodies.tsx): its pure six whatever the pieces wear (rule 16); under
 *  20 px the mark (rule 34). `toward` is what it looks at (an element's id, or an eye offset); `holding` what is in its
 *  hands while it carries, at its front, as jelly-role.html shows it */
export function Jelly({ role, size, toward, holding }: { role: Role; size: number; toward?: Toward; holding?: ReactNode }) {
  return (
    <span data-role={role} style={{ display: "inline-flex", width: size, height: size, flex: "none" }}>
      <Pure>{role === "mark" || size < 20 ? <BodyMark size={size} color={ink} /> : <BodyOne size={size} act={role} toward={toward} holding={holding} />}</Pure>
    </span>
  );
}
/** where its eyes go while it travels from `a` to `b`: the way it is going, as an eye offset in its 100 box. A carry looks
 *  where it goes and never names the target by id, or the body would take itself there too (Bodies.tsx) while the
 *  traveller already does */
export const aim = (a: readonly [number, number], b: readonly [number, number]): readonly [number, number] => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
  return [+(dx / d * 4).toFixed(2), +(dy / d * 3).toFixed(2)];
};
/** the jelly out of its seat, travelling the window: at `at` (its middle, in the window's px), doing its act. It carries
 *  (what it holds at its front), works beside a block, points at one, lands a result on one, and sits as it goes home
 *  (role.ts: after land it goes back to sit). It moves on the jelly's own time (one pour) and never jumps (rule 29) */
export function Traveller({ role, at, size = 84, show = true, holding, toward }: {
  role: Role; at: readonly [number, number]; size?: number; show?: boolean; holding?: ReactNode; toward?: Toward;
}) {
  return (
    <div data-traveller={role} style={{ position: "absolute", left: 0, top: 0, width: size, height: size, zIndex: 20, pointerEvents: "none",
      transform: `translate(${at[0] - size / 2}px, ${at[1] - size / 2}px)`, opacity: show ? 1 : 0,
      transition: `transform ${dur("pour")}ms ${ease("move")}, opacity ${dur("glass")}ms ${ease("move")}` }}>
      <Jelly role={role} size={size} toward={role === "carry" && typeof toward === "string" ? undefined : toward} holding={role === "carry" ? holding : undefined} />
    </div>
  );
}

/** the notch's middle, in the window's px (the window starts under the menu bar): where the jelly arrives from and goes
 *  back to as the window closes */
export const NOTCH: readonly [number, number] = [W / 2, -MENU / 2];
/** where an element sits on the window, its middle in the window's px (`dx`, `dy` move off it): measured once laid out,
 *  so the jelly goes to a word or a swatch wherever the type puts it (`edge` left: the element's left edge instead). The page may scale the window; the scale is undone */
export function useSpot(sel: string, dx = 0, dy = 0, fallback: readonly [number, number] = [W / 2, WH / 2], edge: "middle" | "left" = "middle"): readonly [number, number] {
  const [at, setAt] = useState<readonly [number, number]>(fallback);
  useLayoutEffect(() => {
    const el = document.querySelector(sel), win = el?.closest("[data-window]");
    if (!el || !win) return;
    const r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), k = w.width / W || 1;
    setAt([Math.round((r.left + (edge === "left" ? 0 : r.width / 2) - w.left) / k + dx), Math.round((r.top + r.height / 2 - w.top) / k + dy)]);
  }, [sel, dx, dy, edge]);
  return at;
}
/** the jelly's seat out on the stage: the bar seat's well, drawn under it wherever it stops on bare ground, so it never
 *  floats over nothing (the pack's first read, Cowork's middle step). It sits at the well's depth (rule 1: no new
 *  material); `at` is the jelly's middle, `size` its size, the seat under its foot */
export function Perch({ at, size = 84, show = true }: { at: readonly [number, number]; size?: number; show?: boolean }) {
  const w = Math.round(size * 0.9), h = 14;
  return (
    <div data-perch style={{ position: "absolute", left: 0, top: 0, width: w, height: h, borderRadius: h / 2, zIndex: 19, pointerEvents: "none", ...well(),
      transform: `translate(${at[0] - w / 2}px, ${at[1] + size / 2 - h / 2 - 12}px)`, opacity: show ? 1 : 0,
      transition: `transform ${dur("pour")}ms ${ease("move")}, opacity ${dur("glass")}ms ${ease("move")}` }} />
  );
}

/** what the jelly holds while it carries (a spec it wrote, a file it made): folded to a pill at the control depth with
 *  its name, small enough to ride at its front (rule 1: one more solid thing, never a new material) */
export const HeldPill = ({ children }: { children: ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 28, padding: "0 12px", borderRadius: 14, whiteSpace: "nowrap", fontSize: T.label[0], color: ink, ...surface("control") }}>{children}</span>
);

// ---- the frame ------------------------------------------------------------------------------------------------------
/** the menu bar's strip of the desk, the black slab hanging from it, the jelly in its place (or the mark), the words */
export function NotchStrip({ role = "sit", words, ask, mark, arriving }: { role?: Role; words?: ReactNode; ask?: boolean; mark?: boolean; arriving?: boolean }) {
  const NW = 273, NH = 32, NR = 14, nx = (W - NW) / 2;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: MENU, overflow: "hidden", background: `url(${desk}) 50% 0 / ${W}px auto` }}>
      <div style={{ position: "absolute", inset: 0, background: blk(0.18) }} />
      <svg width={NW} height={NH} style={{ position: "absolute", left: nx, top: 0 }} aria-hidden><path d={curve(NW, NH + NR, NR, CURVE.smoothing, 0, -NR)} fill="#000" /></svg>
      {mark
        ? <div style={{ position: "absolute", left: nx + 18, top: (NH - 16) / 2 }}><Jelly role="mark" size={16} /></div>
        : <div key={arriving ? "a" : "s"} style={{ position: "absolute", left: nx + 6, top: -4 }}><Jelly role={role === "work" ? "sit" : role} size={40} /></div>}
      {words && <div style={{ position: "absolute", left: nx + 52, width: NW - 66, top: 0, height: NH, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, ...label, color: dim, whiteSpace: "nowrap" }}>
        {ask && <Coin role="ask" d={7} />}{words}</div>}
    </div>
  );
}
const Lights = () => {
  const g = useOnGround();
  return (
    <div style={{ position: "absolute", left: MAC.lights.x, top: MAC.lights.y, display: "flex", gap: MAC.lights.gap }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: MAC.lights.d, height: MAC.lights.d, borderRadius: 6, background: g.faint }} />)}
    </div>
  );
};
/** the window: the one see-through thing (rule 2), its top corners on the continuous curve; on cream it lies on paper.
 *  Closed, it has sunk back toward the desk */
export function Window({ open = true, children }: { open?: boolean; children: ReactNode }) {
  const g = useOnGround();
  return (
    <div data-window={open ? "open" : "closed"} style={{ position: "absolute", left: 0, top: MENU, width: W, height: WH, clipPath: `path('${curve(W, WH + 40, 18, CURVE.smoothing)}')`,
      opacity: open ? 1 : 0, transform: open ? "none" : `translateY(24px) scale(0.98)`, transformOrigin: "50% 0",
      transition: `opacity ${dur("pour")}ms ${ease("move")}, transform ${dur("pour")}ms ${ease("move")}` }}>
      {g.ground === "cream" ? <Ground take="cream" /> : <>
        <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% -${MENU}px / ${W}px auto` }} />
        <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      </>}
      <Lights />
      {children}
    </div>
  );
}
/** the desk under the window, darkened as the menu bar's strip is: what shows before the window opens and after it closes */
export const Desk = () => (
  <div style={{ position: "absolute", left: 0, top: MENU, width: W, height: WH, background: `url(${desk}) 50% -${MENU}px / ${W}px auto` }}>
    <div style={{ position: "absolute", inset: 0, background: blk(0.18) }} />
  </div>
);

/** the spine: Home (the folders), Build, Cowork, as glyphs at mute; where you are a pearl seat (rule 14) */
export type Mode = "home" | "build" | "cowork";
const MODES: readonly [Mode, GlyphName][] = [["home", "files"], ["build", "canvas"], ["cowork", "messages"]];
export function Spine({ at }: { at?: Mode }) {
  const g = useOnGround(), l = useLit();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SPINE }}>
      <div style={{ position: "absolute", left: (SPINE - 36) / 2, top: FRAME.row + 8, display: "grid", gap: 10 }}>
        {MODES.map(([m, glyph]) => (
          <span key={m} data-mode={m} style={{ width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", color: m === at ? deep(0.85) : g.mute,
            ...(m === at ? { backgroundImage: picked(l), boxShadow: `inset 0 1px 0 ${on(0.5)}, 0 2px 6px ${blk(0.45)}` } : {}) }}>
            {/* the rail's glyphs take the ground's ink, so they hold on cream as on black glass (the pack's read, #1245) */}
            <Glyph name={glyph} color={m === at ? deep(0.85) : g.ground === "cream" ? g.mute : undefined} /></span>
        ))}
      </div>
    </div>
  );
}
/** the side: one card holding the mode's list; its head the mark and the mode's word, a count; its foot what it holds */
export function Side({ title, count, foot, children }: { title: string; count?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <div data-side style={{ position: "absolute", left: SPINE, top: FRAME.row - 4, bottom: 16, width: SIDE - 8, borderRadius: R, ...surface("card") }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 10px" }}>
        <BodyMark size={16} color={ink} /><span style={{ fontSize: T.body[0], fontWeight: 500, color: ink }}>{title}</span>
        <span style={{ flex: 1 }} />{count != null && <Num c={dim} style={{ fontSize: T.body[0] }}>{count}</Num>}{/* a count is a mark: tabular, weight 500, at its title's size (rule 21) */}
      </div>
      {children}
      {foot && <div style={{ position: "absolute", left: 18, right: 18, bottom: 18 }}>{foot}</div>}
    </div>
  );
}
/** the side's rows: a list of sessions or folders, the one you are in pearl */
export function Rows({ rows }: { rows: readonly { title: string; s: "rest" | "active" | "active-running"; aside?: ReactNode }[] }) {
  return (
    <HoldStill value>
      <div style={{ padding: "0 8px", display: "grid", gap: 2 }}>
        {rows.map((r) => <SessionRow key={r.title} title={r.title} w={SIDE - 24} s={r.s} aside={r.aside} />)}
      </div>
    </HoldStill>
  );
}
/** the side's foot: how full the day is (a meter: steady, never plays, rule 37) */
export const DayUse = ({ v }: { v: number }) => (
  <div style={{ display: "grid", gap: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", ...label }}><span style={{ color: mute }}>today's use</span><Num c={dim} style={{ fontSize: T.label[0] }}>{Math.round(v * 100)}%</Num></div>
    <HoldStill value><MeterBar v={v} w={SIDE - 44} h={10} /></HoldStill>
  </div>
);

// ---- the stage's things -------------------------------------------------------------------------------------------
/** a card on the stage (rule 1): one solid object; lifted, it is height, never a new material (rule 8) */
export function Card({ id, x, y, w, h, title, lifted, mark, land, children, style }: {
  id?: string; x: number; y: number; w: number; h: number; title?: ReactNode; lifted?: boolean; mark?: ReactNode; land?: boolean; children?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div id={id} data-card style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: R, ...surface(lifted ? "lifted" : "card"),
      transform: lifted ? `translateY(-4px) scale(${DP.lifted.scale})` : "none", zIndex: lifted ? 5 : undefined,
      transition: `transform ${dur("glass")}ms ${ease("reveal")}, box-shadow ${dur("glass")}ms ${ease("reveal")}, height ${dur("glass")}ms ${ease("reveal")}`,
      animation: land ? `ac-land ${dur("land")}ms ${ease("pour")} both` : undefined, ...style }}>
      {/* its head as the whole's and the generator's: 16 above a 20 line, 8 below (44 in all), so two cards side by side
          hold their titles on one line (layout rule 5) */}
      {title != null && <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, minHeight: 20, padding: "16px 18px 8px", boxSizing: "border-box" }}>
        <span style={{ fontSize: T.head[0], fontWeight: 500, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span><span style={{ flex: 1 }} />{mark}
      </div>}
      {children}
    </div>
  );
}
export const Step = ({ lead, words, note, quiet }: { lead: ReactNode; words: ReactNode; note?: ReactNode; quiet?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 34, padding: "0 18px" }}>
    <span style={{ width: 28, display: "inline-flex", justifyContent: "center", flex: "none" }}>{lead}</span>
    <span style={{ flex: 1, fontSize: T.body[0], color: quiet ? mute : ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{words}</span>
    {note != null && <span style={{ fontSize: T.label[0], color: mute, whiteSpace: "nowrap" }}>{note}</span>}
  </div>
);
export const Para = ({ children, style }: { children: ReactNode; style?: CSSProperties }) =>
  <div style={{ padding: "0 18px", fontSize: T.body[0], lineHeight: `${T.body[1] + 2}px`, color: dim, ...style }}>{children}</div>;
export const Done = ({ d = 16 }: { d?: number }) => <Coin role="done" d={d}><Sign d="tick" s={Math.round(d * 0.7)} w={2} /></Coin>;
export const Ask = ({ d = 16 }: { d?: number }) => <Coin role="ask" d={d}><Sign d="ask" s={Math.round(d * 0.7)} w={2} /></Coin>;
/** a stamp (rule 17: done is a stamp): a sticker in done's flat soft green, a little askew, landing (rule 26). The same
 *  green as the generator's done sticker (specs.ts `role: "done"`), so done reads one way in every scene (the pack's read) */
export const Stamped = ({ words, land }: { words: ReactNode; land?: boolean }) => <Sticker fill={MEANING.done} land={land}>{words}</Sticker>;
/** another's agent, signed (rule 37's steady row): their initial on a flat grey coin and whose agent it is, grey. Never
 *  the jelly's mark: the jelly is the one thing with a face, and it is yours (rules 32, 34; the pack's read) */
export const Signed = ({ who }: { who: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...label, color: mute, whiteSpace: "nowrap" }}>
    <span style={{ width: 14, height: 14, borderRadius: 7, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on(0.1), color: dim, fontSize: 9, fontWeight: 500, lineHeight: 1 }}>{who.slice(0, 1).toUpperCase()}</span>{who}'s agent</span>
);

// ---- the bar: the one box ------------------------------------------------------------------------------------------
const MODE_WORDS = ["ask", "edits", "auto", "bypass"], MODE_W = [52, 60, 58, 72];
/** at the small size the modes keep their place and order and lose their words to the rail's glyphs (rule 12) */
const MODE_GLYPHS: readonly GlyphName[] = ["messages", "note", "run", "focus"];
/** the one picked pill group: words on the card, the pick pearl (rules 12, 14) */
function Modes({ pick }: { pick: number }) {
  return <div style={{ display: "flex", gap: 2 }}>{MODE_WORDS.map((w, i) => <PillControl key={w} s={i === pick ? "picked" : "rest"} w={SMALL ? 36 : MODE_W[i]} h={32}>
    {SMALL ? <span aria-label={w} style={{ display: "inline-flex" }}><Glyph name={MODE_GLYPHS[i]} color={i === pick ? deep(0.85) : undefined} /></span> : w}</PillControl>)}</div>;
}
/** how hard Sol thinks: the pick in Sol's heat, still once set */
function Effort() {
  const l = useLit();
  return (
    <span style={{ position: "relative", height: 32, width: 62, borderRadius: 16, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none",
      boxShadow: `inset 0 1px 0 ${on(0.24)}, 0 2px 6px ${blk(0.45)}`, backgroundImage: sol(l, heatOf(l, 2)) }}>
      <span style={{ fontSize: T.body[0], fontWeight: 500, color: deep(0.88) }}>high</span>
    </span>
  );
}
export type BarState = "empty" | "typed" | "sent" | "working";
/** the bar: one card. The seat with the jelly (empty while it is out carrying), the words in their well, the modes (the
 *  person's last pick, rule 38), the effort, send */
export function Bar({ state = "empty", words, role = "sit", away, pick = 2, hint = "ask, or drop a file", toward = [-3, -3] }: {
  state?: BarState; words?: string; role?: Role; away?: boolean; pick?: number; hint?: string; toward?: readonly [number, number];
}) {
  const has = state === "typed";
  return (
    <div data-bar={state} style={{ position: "absolute", left: STAGE + 32, right: 32, top: BAR_TOP, height: BAR_H, borderRadius: R, display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 10px", boxSizing: "border-box", ...surface("card") }}>
      <HoldStillUnless moving={role === "work"}>
        <SeatDial working={role === "work"} body={away ? null : <Jelly role={role} size={48} toward={toward} />} />
      </HoldStillUnless>
      <div style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 22, display: "flex", alignItems: "center", padding: "0 16px", ...well() }}>
        <span style={{ fontSize: T.body[0], color: has ? ink : mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{has ? words : hint}</span>
      </div>
      <Modes pick={pick} />
      <Effort />
      <HoldStill value>
        <PillControl s={has ? "sol" : "rest"} w={48} h={44} pour={has}>
          {state === "working" ? <span style={{ width: 11, height: 11, borderRadius: 3, background: deep(0.85) }} /> : <Sign d="up" c={has ? deep(0.85) : mute} s={18} w={2} />}
        </PillControl>
      </HoldStill>
    </div>
  );
}
const HoldStillUnless = ({ moving, children }: { moving: boolean; children: ReactNode }) => <HoldStill value={!moving}>{children}</HoldStill>;
const SeatDial = ({ working, body }: { working: boolean; body: ReactNode }) => <HaloDial s={working ? "working" : "rest"} d={52} body={body} />;

/** the stage's top right: what came while you were away (the coins) */
export const Corner = ({ s }: { s: PingState }) => (
  <div style={{ position: "absolute", right: 32, top: 8, display: "flex", gap: 10, alignItems: "center" }}>
    <HoldStill value><Ping s={s} /></HoldStill>
  </div>
);
