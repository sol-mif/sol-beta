// The accent pieces (#1218), redrawn from the one system (#1213, Marco 2026-11-15: distil each family, one system, one
// unified look). Every piece is an object at one of the system's depths (tokens.json palette.system.depth: well, card,
// control, lifted, sticker), wears colour only by its role (rest grey, picked pearl nacre, Sol the jelly's bands, meaning
// flat and fixed) and moves only by the system's moves (press, hover, lift, pour, land, drift, drain, breath). The rules,
// one line each: sol/design/system/rules.md; a piece here cites the rule it follows by number. The primitives below are
// exported so a whole window (stage-whole.tsx) is built from the same parts. The thirteen pieces keep the sheet's
// inventory of states and motions (#1218); their pins are kept as `pin` for where each started, not what it looks like.
// Behind a switch still: nothing in the app draws these; the sheets are stage-accent.tsx and stage-whole.tsx.
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FUNCTIONAL } from "../creature/palette";
import { curve } from "./curve";
import { CURVE, DEEP, EASE, GLASS, JELLY, LOOKS, NACRE, PEARL, SHADE, SYSTEM, TIMED, TYPE as T } from "./tokens";

// ---- the token set ------------------------------------------------------------------------------------------------
/** a token set: palette.jelly's shape and palette.glass.light's (a candidate set re-lights the Sol role at once) */
export type Lit = {
  jelly: { six: readonly string[]; warm: readonly string[]; angle: number; soft: number; veil: number };
  light: { from: readonly [number, number] | readonly number[]; rim: number; sheen: number };
};
export const TODAY: Lit = { jelly: JELLY, light: GLASS.light };
const LitCtx = createContext<Lit>(TODAY);
export const LitSet = LitCtx.Provider;
export const useLit = () => useContext(LitCtx);

// ---- paint --------------------------------------------------------------------------------------------------------
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (h: string, a = 1) => { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
/** a toward b by t, as #rrggbb */
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
export const on = (a: number) => `rgba(255,255,255,${a})`;
export const blk = (a: number) => `rgba(0,0,0,${a})`;
export const ink = on(SHADE.on.ink), dim = on(SHADE.on.dim), mute = on(SHADE.on.mute);
export const deep = (a = 0.9) => rgba(DEEP, a);
const MONO = `ui-monospace, "SF Mono", Menlo, monospace`;
const SY = SYSTEM, DP = SY.depth;

// ---- the roles (rules 13 to 20) ---------------------------------------------------------------------------------
/** meaning, flat and fixed (rule 16): never re-lit by a token set */
const flat = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** worn at rest: the soft shade (rule 17, creature/palette.ts: "in the UI the soft shade is the one worn"); a strong
 *  green coin at rest ran hotter than everything round it, scene after scene (the pack's cohesion read, #1245) */
export const MEANING = { done: flat(FUNCTIONAL.green.soft), ask: flat(FUNCTIONAL.yellow.soft), wrong: flat(FUNCTIONAL.red.soft) } as const;
/** strong, only for the one-beat flash as a meaning arrives (rule 17) */
export const MEANING_FLASH = { done: flat(FUNCTIONAL.green.strong), ask: flat(FUNCTIONAL.yellow.strong), wrong: flat(FUNCTIONAL.red.strong) } as const;
export type Meaning = keyof typeof MEANING;
/** Sol's role (rule 15): the set's six as bands at its angle; `loop` lays them there and back, so a drift has no seam */
export function sol(l: Lit, cols: readonly string[] = l.jelly.six, loop = false, angle = l.jelly.angle) {
  const cs = loop ? [...cols, ...[...cols].reverse()] : cols, n = cs.length, s = l.jelly.soft;
  const pc = (v: number) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`;
  return `linear-gradient(${angle}deg, ${cs.map((c, j) => `${c} ${pc(j / n + s / (loop ? 2 : 1))}, ${c} ${pc((j + 1) / n - s / (loop ? 2 : 1))}`).join(", ")})`;
}
/** the picked role (rule 14): pearl nacre; today's from the kit, a candidate set's laid the same way from its six */
export function picked(l: Lit) {
  if (l === TODAY) return NACRE;
  return `linear-gradient(180deg, ${on(0.35)}, transparent 60%), ${sol(l, l.jelly.six, true, 104).replace(/#([0-9a-f]{6})/gi, (m) => rgba(m, LOOKS.pearl.takes.nacre.hue))}, linear-gradient(${PEARL}, ${PEARL})`;
}

// ---- depth (rules 1 to 8) -----------------------------------------------------------------------------------------
const dropOf = (s: readonly number[]) => (s[0] ? `0 ${s[1]}px ${s[2]}px ${blk(s[0])}` : "0 0 0 transparent");
const rimOf = (a: number) => `inset 0 1px 0 ${on(a)}`;
export type Depth = "card" | "control" | "lifted";
/** a solid object at a depth: its fill, its lit top rim, its drop (rule 3: never an outline) */
export const surface = (d: Depth, extra?: string): CSSProperties => ({
  background: DP[d].fill, boxShadow: [rimOf(DP[d].rim), dropOf(DP[d].shadow), extra].filter(Boolean).join(", "),
});
/** a well, sunk into its card (rule 7): its dark falls from the top edge, the bottom edge catches a little light */
export const well = (): CSSProperties => ({ background: DP.well.fill, boxShadow: `inset 0 1px 3px ${blk(DP.well.inner)}, inset 0 -1px 0 ${on(0.05)}` });
/** a move as css: its duration and curve from palette.motion, by the system's name */
export type Move = keyof typeof SY.move;
export const dur = (m: Move) => TIMED[SY.move[m].d];
export const ease = (m: Move) => EASE[SY.move[m].e];
const tr = (props: string, m: Move = "press") => props.split(" ").map((p) => `${p} ${dur(m)}ms ${ease(m)}`).join(", ");
const anim = (name: string, m: Move, extra = "") => `ac-${name} ${dur(m)}ms ${ease(m)}${extra}`;
const R = { card: CURVE.radius.block, row: CURVE.radius.row, sticker: SY.shape.sticker.radius };
/** the inner shape keeps the outer's curve less the gap (rule 10) */
export const inner = (outer: number, gap: number) => Math.max(2, outer - gap);

/** the moves (palette.system.move) as keyframes; quiet under reduced motion: the end state at once (rule 30) */
export const ACCENT_MOVES = `
@keyframes ac-pour { from { clip-path: inset(0 100% 0 0 round 999px) } to { clip-path: inset(0 0 0 0 round 999px) } }
@keyframes ac-land { from { transform: translateY(${SY.move.land.from[1]}px) scale(${SY.move.land.from[0]}) rotate(var(--tilt, 0deg)); opacity: 0 } to { transform: translateY(0) scale(1) rotate(var(--tilt, 0deg)); opacity: 1 } }
@keyframes ac-drift { from { background-position: 0 0 } to { background-position: var(--run) 0 } }
@keyframes ac-breath { from { transform: scale(1, 1) } to { transform: scale(1.012, 1.02) } }
@keyframes ac-drain { from { opacity: 1 } to { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { [data-ac] *, [data-ac] { animation: none !important; transition: none !important } }
`;

// ---- the parts every piece is made of ------------------------------------------------------------------------------
/** a part of a window that holds its bands still, because the jelly's one motion is elsewhere (rule 19) */
const StillCtx = createContext(false);
export const HoldStill = StillCtx.Provider;
/** Sol at work (rule 27): the bands drifting inside a shape, one cycle, linear; `still` (or HoldStill) holds them */
export function Drift({ w, cols, still: asked, style }: { w: number; cols?: readonly string[]; still?: boolean; style?: CSSProperties }) {
  const l = useLit(), held = useContext(StillCtx), still = asked || held;
  return <span style={{ position: "absolute", inset: 0, backgroundImage: sol(l, cols ?? l.jelly.six, true), backgroundSize: `${w * 2}px 100%`, backgroundRepeat: "repeat-x",
    ["--run" as string]: `${w * 2}px`, animation: still ? undefined : `ac-drift ${dur("drift")}ms ${ease("drift")} infinite`, ...style }} />;
}
/** a sticker (rules 17, 22, 26): flat on a card, a role's colour, mono capitals, a little askew, a hard small drop; it lands */
export function Sticker({ fill = PEARL, children, land, tilt = DP.sticker.tilt, style }: { fill?: string; children: ReactNode; land?: boolean; tilt?: number; style?: CSSProperties }) {
  const S = SY.type.sticker;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 20, padding: "0 7px", borderRadius: R.sticker, background: fill, color: deep(0.88),
      fontFamily: MONO, fontSize: T[S.scale][0], fontWeight: S.weight, letterSpacing: `${S.track}em`, textTransform: "uppercase", lineHeight: "20px", whiteSpace: "nowrap",
      boxShadow: dropOf(DP.sticker.shadow), ["--tilt" as string]: `${tilt}deg`, transform: `rotate(${tilt}deg)`, animation: land ? anim("land", "land", " both") : undefined, ...style }}>{children}</span>
  );
}
/** a coin (rules 16, 17): a round sticker in a meaning's flat colour, or Sol's bands standing still; a glyph in deep */
export function Coin({ role, d = 26, land, children, style }: { role: Meaning | "sol"; d?: number; land?: boolean; children?: ReactNode; style?: CSSProperties }) {
  const l = useLit();
  return (
    <span style={{ position: "relative", width: d, height: d, borderRadius: d / 2, flex: "none", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: role === "sol" ? undefined : MEANING[role], backgroundImage: role === "sol" ? sol(l) : undefined, boxShadow: dropOf(DP.sticker.shadow),
      animation: land ? anim("land", "land", " both") : undefined, ...style }}>{children}</span>
  );
}
/** the glyphs on a coin or a control, drawn on a 16 grid at the kit's stroke */
const G = {
  tick: "M4.5 8.4l2.4 2.4 4.6-5.2", ask: "M6.2 6.2a2 2 0 1 1 2.6 1.9c-.6.2-.8.6-.8 1.1M8 11.6v.1", wrong: "M8 4.6v4.2M8 11.4v.1",
  said: "M4.8 8h.01M8 8h.01M11.2 8h.01", /* three dots: Sol said; two strokes on the bands read as a second face (rule 32) */ up: "M8 12.5V3.8M4.2 7.4L8 3.6l3.8 3.8", chev: "M6.5 4.5l3.5 3.5-3.5 3.5", undo: "M5.5 6.5H10a2.5 2.5 0 0 1 0 5H7M5.5 6.5l2-2M5.5 6.5l2 2",
} as const;
export const Sign = ({ d, c = deep(0.85), s = 14, w = 1.8 }: { d: keyof typeof G; c?: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" style={{ flex: "none" }}><path d={G[d]} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" /></svg>
);
/** a number as a mark (rule 21) */
export const Num = ({ children, c = ink, style }: { children: ReactNode; c?: string; style?: CSSProperties }) => (
  <span style={{ fontSize: T[SY.type.number.scale][0], fontWeight: SY.type.number.weight, fontVariantNumeric: "tabular-nums", color: c, lineHeight: 1, ...style }}>{children}</span>
);

/** the one control (rules 9, 11, 12, 14, 15): a pill. At rest its word on its holder, no fill; hover raises it to the
 *  control depth by a point; press gives; picked pours the pearl; `sol` pours the jelly's bands (still, or drifting) */
export type Press = "rest" | "hover" | "press" | "picked" | "picked-hover" | "sol" | "sol-working";
export function PillControl({ s, w, h = 32, pour, children, style }: { s: Press; w: number; h?: number; pour?: boolean; children: ReactNode; style?: CSSProperties }) {
  const l = useLit();
  const lit = s === "picked" || s === "picked-hover", isSol = s === "sol" || s === "sol-working", up = s === "hover" || s === "picked-hover";
  const raised = s === "hover" || s === "press";
  return (
    <span style={{ position: "relative", width: w, height: h, borderRadius: h / 2, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      ...(raised ? surface("control") : { background: "transparent", boxShadow: lit || isSol ? `${rimOf(DP.control.rim * 2)}, ${dropOf(DP.control.shadow)}` : "none" }),
      transform: `translateY(${up ? SY.move.hover.rise : 0}px) scale(${s === "press" ? SY.move.press.scale : 1})`, transition: tr("transform background box-shadow"),
      fontSize: T.body[0], fontWeight: lit || isSol ? SY.type.picked.weight : SY.type.word.weight, color: lit || isSol ? deep(0.88) : s === "rest" ? dim : ink, overflow: "hidden", ...style }}>
      {(lit || isSol) && <span key={s.split("-")[0]} style={{ position: "absolute", inset: 0, borderRadius: h / 2, overflow: "hidden", backgroundImage: lit ? picked(l) : undefined, animation: pour ? anim("pour", "pour") : undefined }}>
        {isSol && <Drift w={w} still={s !== "sol-working"} />}
      </span>}
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>{children}</span>
    </span>
  );
}

// ---- 1. send -----------------------------------------------------------------------------------------------------
// The bar is a card, the words sit in its well; send is the one pill. Empty: the arrow at mute, no fill (rule 12).
// With words it pours Sol's bands (rule 15: your words go to Sol); press gives; sent drains back to rest; while Sol
// works the same pill drifts with a deep square to stop it (rule 27).
export type SendState = "empty" | "ready" | "hover" | "press" | "sent" | "stop";
export function Send({ s, w = 232, words }: { s: SendState; w?: number; words?: string }) {
  const empty = s === "empty" || s === "sent";
  const ps: Press = s === "empty" || s === "sent" ? "rest" : s === "stop" ? "sol-working" : s === "press" ? "sol" : "sol";
  return (
    <div style={{ width: w, height: 56, borderRadius: R.card, position: "relative", ...surface("card") }}>
      <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, right: 64, borderRadius: inner(R.card, 8), ...well() }}>
        <span style={{ position: "absolute", left: 14, top: 10, fontSize: T.body[0], color: empty ? mute : ink, whiteSpace: "nowrap" }}>{words ?? (empty ? "Ask anything" : s === "stop" ? "working on it" : "write the release notes")}</span>
      </div>
      <span style={{ position: "absolute", right: 8, top: 8, transform: s === "press" ? `scale(${SY.move.press.scale})` : s === "hover" ? `translateY(${SY.move.hover.rise}px)` : undefined, transition: tr("transform") }}>
        <PillControl s={ps} w={48} h={40} pour={s === "ready"}>
          {s === "stop" ? <span style={{ width: 11, height: 11, borderRadius: 3, background: deep(0.85) }} /> : <Sign d="up" c={empty ? mute : deep(0.85)} s={18} w={2} />}
        </PillControl>
      </span>
    </div>
  );
}

// ---- 2. the picked pill ----------------------------------------------------------------------------------------
// A word among equals. Rest: the word on its holder; hover: control depth; picked: the pearl pours in (rule 14).
export type PillState = "rest" | "hover" | "press" | "lit" | "lit-hover";
export function LitPill({ s, word = "sonnet" }: { s: PillState; word?: string }) {
  const ps: Press = s === "lit" ? "picked" : s === "lit-hover" ? "picked-hover" : s;
  return (
    <div style={{ padding: 6, borderRadius: 24, ...surface("card") }}>
      <PillControl s={ps} w={132} h={36} pour={s === "lit"}>{word}</PillControl>
    </div>
  );
}

// ---- 3. the active row -------------------------------------------------------------------------------------------
// Rows in a card. Where you are is pearl (rule 14); running adds Sol's one drifting mark at its end (rules 15, 19).
export type RowState = "rest" | "hover" | "press" | "active" | "active-running";
export function SessionRow({ title, s, aside, w = 264 }: { title: string; s: RowState; aside?: ReactNode; w?: number }) {
  const l = useLit(), active = s === "active" || s === "active-running", h = 36, r = inner(R.card, 8);
  return (
    <div style={{ position: "relative", width: w, height: h, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", borderRadius: r, boxSizing: "border-box",
      ...(s === "hover" || s === "press" ? surface("control") : {}), transform: `translateY(${s === "hover" ? SY.move.hover.rise : 0}px) scale(${s === "press" ? SY.move.press.scale : 1})`, transition: tr("transform background box-shadow") }}>
      {active && <span style={{ position: "absolute", inset: 0, borderRadius: r, backgroundImage: picked(l), boxShadow: `${rimOf(DP.control.rim * 2)}, ${dropOf(DP.control.shadow)}`, animation: s === "active" ? anim("pour", "pour") : undefined }} />}
      <span style={{ position: "relative", flex: 1, fontSize: T.body[0], fontWeight: active ? SY.type.picked.weight : 400, color: active ? deep(0.88) : s === "rest" ? dim : ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      {s === "active-running" && <span style={{ position: "relative", width: 22, height: 8, borderRadius: 4, overflow: "hidden", flex: "none", ...well() }}><Drift w={22} /></span>}
      {aside != null && <span style={{ position: "relative", fontSize: T.label[0], fontVariantNumeric: "tabular-nums", color: active ? deep(0.6) : mute }}>{aside}</span>}
    </div>
  );
}
export function ActiveRow({ s }: { s: RowState }) {
  return (
    <div style={{ width: 280, padding: 8, borderRadius: R.card, display: "grid", gap: 2, ...surface("card") }}>
      <SessionRow title="the release notes" s={s} aside={s === "active-running" ? "2m" : undefined} />
      <SessionRow title="post in #builds" s="rest" />
      <SessionRow title="the runs map" s="rest" />
    </div>
  );
}

// ---- 4. the halo -> the seat ------------------------------------------------------------------------------------
// No glow (rule 5): the jelly sits in a sunk round well, its seat. At rest the seat is empty and the jelly breathes;
// working, Sol's bands fill the seat and drift (the window's one jelly motion, rule 19); arriving, the jelly lands.
export type HaloState = "rest" | "working" | "arriving";
export function HaloDial({ s, d = 72, body }: { s: HaloState; d?: number; body?: ReactNode }) {
  const b = Math.round(d * 0.92);
  return (
    <div style={{ position: "relative", width: d, height: d, borderRadius: d / 2, overflow: "hidden", ...well() }}>
      {s === "working" && <span style={{ position: "absolute", inset: 0, borderRadius: d / 2, overflow: "hidden", opacity: 0.55, animation: anim("pour", "pour") }}><Drift w={d} /></span>}
      <span style={{ position: "absolute", left: (d - b) / 2, top: (d - b) / 2 - d * 0.04, width: b, height: b }}>{body}</span>
    </div>
  );
}

// ---- 5. the undo ring -> the undo bar -----------------------------------------------------------------------------
// Six pearl steps in a well (yours to take back: rule 14), draining one a second (rule 28); undo pours them back.
export type UndoState = "closed" | "draining" | "last" | "undone" | "gone";
export function UndoRing({ s, w = 286, words = "closed the board" }: { s: UndoState; w?: number; words?: string }) {
  const n = 6, left = s === "closed" || s === "undone" ? 6 : s === "draining" ? 3 : s === "last" ? 1 : 0, gone = s === "gone";
  const tw = 66, sw = (tw - 6 - (n - 1) * 2) / n;
  return (
    <div style={{ width: w, height: 52, borderRadius: R.card, position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "0 8px 0 14px", boxSizing: "border-box",
      ...surface("card"), opacity: gone ? 0 : 1, transform: gone ? "translateY(6px)" : undefined, transition: tr("opacity transform", "drain") }}>
      <span style={{ position: "relative", width: tw, height: 14, borderRadius: 7, display: "flex", gap: 2, padding: 3, boxSizing: "border-box", ...well() }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} style={{ width: sw, height: 8, borderRadius: i === 0 ? "4px 1px 1px 4px" : i === n - 1 ? "1px 4px 4px 1px" : 1, background: PEARL,
            opacity: i < left ? 1 : 0, transition: `opacity ${dur("drain")}ms ${ease(s === "undone" ? "pour" : "drain")} ${s === "undone" ? i * 40 : 0}ms` }} />
        ))}
      </span>
      <Num c={s === "undone" ? mute : ink} style={{ width: 14 }}>{s === "undone" ? "" : left}</Num>
      <span style={{ flex: 1, fontSize: T.body[0], color: dim, whiteSpace: "nowrap" }}>{s === "undone" ? "back where it was" : words}</span>
      {s !== "undone" && <PillControl s="rest" w={64} h={34}><span style={{ color: ink }}>undo</span></PillControl>}
    </div>
  );
}

// ---- 6. the done tick ----------------------------------------------------------------------------------------------
// The two who made it (deep seats on a card), then the done coin lands in flat green (rules 16, 26). Several: a count
// sticker. Seen: the coin goes down to a dot.
export type TickState = "waiting" | "landing" | "done" | "several" | "seen";
export function DoneTick({ s }: { s: TickState }) {
  const seen = s === "seen", done = s !== "waiting";
  const seat = (letter: string, x: number) => (
    <span style={{ position: "absolute", left: x, top: 7, width: 30, height: 30, borderRadius: 15, ...surface("control"), color: ink, fontSize: T.label[0], fontWeight: 600, lineHeight: "30px", textAlign: "center" }}>{letter}</span>
  );
  return (
    <div style={{ position: "relative", width: seen ? 92 : 118, height: 44, borderRadius: 22, ...surface("card"), transition: tr("width", "lift") }}>
      {seat("C", 7)}{seat("O", 31)}
      <span style={{ position: "absolute", right: seen ? 14 : 7, top: seen ? 18 : 7, transition: tr("right top", "lift") }}>
        {done ? <Coin key={s === "landing" ? "l" : "k"} role="done" d={seen ? 8 : 30} land={s === "landing"}>{!seen && <Sign d="tick" s={16} />}</Coin>
          : <span style={{ display: "block", width: 30, height: 30, borderRadius: 15, ...well() }} />}
      </span>
      {s === "several" && <span style={{ position: "absolute", left: -8, top: -12 }}><Sticker land>+3</Sticker></span>}
    </div>
  );
}

// ---- 7. needs you ---------------------------------------------------------------------------------------------------
// The one thing that waits on you is lifted (rule 8) and wears the ask sticker in flat yellow (rules 16, 17); the card
// itself never recolours. Answered: back to card depth, the done coin lands where the sticker was.
export type AskState = "arrives" | "waiting" | "hover" | "answered";
export function NeedsYou({ s, w = 320, ask = "may I push to main?" }: { s: AskState; w?: number; ask?: string }) {
  const up = s !== "answered";
  return (
    <div style={{ position: "relative", width: w, height: 60, borderRadius: R.card, ...surface(up ? "lifted" : "card"),
      transform: up ? `scale(${DP.lifted.scale})` : undefined, transition: tr("transform box-shadow background", "lift") }}>
      {up && <span style={{ position: "absolute", left: 14, top: -10 }}><Sticker key={s === "arrives" ? "a" : "r"} fill={MEANING.ask} land={s === "arrives"}>needs you</Sticker></span>}
      <span style={{ position: "absolute", left: 16, top: 20, fontSize: T.body[0], color: up ? ink : dim }}>{up ? ask : "pushed, you said yes"}</span>
      <span style={{ position: "absolute", right: 10, top: 12 }}>
        {up ? <PillControl s={s === "hover" ? "hover" : "rest"} w={78} h={36}><span style={{ color: ink }}>answer</span></PillControl>
          : <span style={{ display: "inline-flex", padding: 5 }}><Coin role="done" d={26} land><Sign d="tick" s={14} /></Coin></span>}
      </span>
    </div>
  );
}

// ---- 8. the running mark ------------------------------------------------------------------------------------------
// A small well where Sol's bands drift while an agent works (rule 27), slower when it has run long (breath, not a new
// time); it ends flat green or flat red (rule 16). The time is a number (rule 21).
export type RunState = "queued" | "running" | "slow" | "done" | "failed";
export function RunMark({ s, w = 28 }: { s: RunState; w?: number }) {
  const h = 10;
  return (
    <span style={{ position: "relative", width: w, height: h, borderRadius: h / 2, overflow: "hidden", flex: "none", display: "inline-block", ...well() }}>
      {(s === "running" || s === "slow") && <Drift w={w} style={s === "slow" ? { animationDuration: `${TIMED.breath}ms` } : undefined} />}
      {(s === "done" || s === "failed") && <span style={{ position: "absolute", inset: 0, background: s === "done" ? MEANING.done : MEANING.wrong, animation: anim("pour", "pour") }} />}
    </span>
  );
}
export function RunningMark({ s }: { s: RunState }) {
  const words: Record<RunState, [string, string]> = { queued: ["waiting its turn", ""], running: ["thinking", "1m"], slow: ["still on it", "9m"], done: ["done", "4m"], failed: ["stopped: the build broke", ""] };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12, height: 44, padding: "0 16px 0 14px", borderRadius: 22, ...surface("card") }}>
      <RunMark s={s} />
      <span style={{ fontSize: T.body[0], color: s === "queued" ? mute : s === "failed" ? ink : dim, whiteSpace: "nowrap" }}>{words[s][0]}</span>
      {words[s][1] && <Num c={s === "done" ? dim : ink} style={{ fontSize: T.body[0] }}>{words[s][1]}</Num>}
    </div>
  );
}

// ---- 9. the stamp -------------------------------------------------------------------------------------------------
// Something made and kept: a pearl sticker (yours, rule 14), mono capitals (rule 22), landing (rule 26); hover lifts it;
// a day later it fades toward the card, still there.
export type StampState = "lands" | "kept" | "hover" | "a day later";
export function Stamp({ s, w = 220 }: { s: StampState; w?: number }) {
  const old = s === "a day later";
  return (
    <div style={{ position: "relative", width: w, height: 88, borderRadius: R.card, ...surface("card") }}>
      <span style={{ position: "absolute", left: 16, top: 16, fontSize: T.body[0], fontWeight: 500, color: ink }}>the release notes</span>
      <span style={{ position: "absolute", left: 16, top: 36, fontSize: T.label[0], color: mute }}>three lines, posted</span>
      <span style={{ position: "absolute", right: 14, bottom: 14, transform: s === "hover" ? `translateY(-2px)` : undefined, transition: tr("transform", "lift") }}>
        <Sticker key={s === "lands" ? "l" : "k"} land={s === "lands"} fill={old ? mix(PEARL, DP.card.fill, 0.45) : PEARL}
          style={s === "hover" ? { boxShadow: dropOf(DP.control.shadow) } : undefined}>made <Num c={deep(old ? 0.6 : 0.88)} style={{ fontSize: "inherit", fontFamily: MONO, fontWeight: 600 }}>21:04</Num></Sticker>
      </span>
    </div>
  );
}

// ---- 10. the ping -------------------------------------------------------------------------------------------------
// What happened while you were away: one coin each, in its meaning (an ask yellow, done green, wrong red) or Sol's
// still bands for something Sol said; they land in a holder card and fan under the pointer; the count is a number.
export type PingState = "one" | "three" | "fanned" | "seen";
type CoinKind = "ask" | "done" | "wrong" | "said";
export function Ping({ s }: { s: PingState }) {
  const coins: CoinKind[] = s === "one" ? ["said"] : s === "seen" ? [] : ["ask", "said", "done"];
  const gap = s === "fanned" ? 6 : -8;
  return (
    <div style={{ height: 44, display: "inline-flex", alignItems: "center", gap: 10, padding: "0 14px 0 7px", borderRadius: 22, minWidth: 60, boxSizing: "border-box", ...surface("card") }}>
      {coins.length > 0 && <div style={{ display: "flex" }}>
        {coins.map((k, i) => (
          <span key={`${s}${i}`} style={{ marginLeft: i ? gap : 0, zIndex: 10 - i, position: "relative", transition: tr("margin-left", "lift"), borderRadius: 16, boxShadow: `0 0 0 2px ${DP.card.fill}` }}>
            <Coin role={k === "said" ? "sol" : k} d={30} land={s === "one" || (s === "three" && i === 0)}><Sign d={k === "said" ? "said" : k === "done" ? "tick" : k} s={15} /></Coin>
          </span>
        ))}
      </div>}
      {/* rule 13: "all seen" alone sits centred in its pill, no empty coin row before it */}
      {coins.length ? <Num>{coins.length}</Num> : <span style={{ fontSize: T.body[0], color: mute, paddingLeft: 7 }}>all seen</span>}
    </div>
  );
}

// ---- 11. the meter --------------------------------------------------------------------------------------------------
// How full Sol is: a well with Sol's bands poured to the level, matte (rule 6), the percent a number; never red.
export type MeterState = "a fifth" | "half" | "nearly full" | "filling";
export function MeterBar({ v, w = 240, h = 14, pour }: { v: number; w?: number; h?: number; pour?: boolean }) {
  const l = useLit(), g = 3;
  return (
    <span style={{ position: "relative", display: "inline-block", width: w, height: h, borderRadius: h / 2, flex: "none", ...well() }}>
      <span key={pour ? "p" : "r"} style={{ position: "absolute", left: g, top: g, bottom: g, width: (w - 2 * g) * v, borderRadius: inner(h / 2, g), overflow: "hidden",
        backgroundImage: sol(l, l.jelly.warm), backgroundSize: `${w - 2 * g}px 100%`, animation: pour ? anim("pour", "pour") : undefined, transition: tr("width", "pour") }} />
    </span>
  );
}
export function GlassMeter({ s }: { s: MeterState }) {
  const v = s === "a fifth" ? 0.2 : s === "half" ? 0.52 : s === "nearly full" ? 0.9 : 0.66;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14, height: 44, padding: "0 16px", borderRadius: 22, ...surface("card") }}>
      <MeterBar v={v} pour={s === "filling"} />
      <Num style={{ width: 40, textAlign: "right" }}>{Math.round(v * 100)}%</Num>
    </div>
  );
}

// ---- 12. the file mark --------------------------------------------------------------------------------------------
// A small card (the continuous corner), the kind's colour on its sticker alone (rule 18); made, the sticker lands;
// hover lifts, press gives, dragged is lifted (height, never tilt: rule 8).
export type FileState = "rest" | "hover" | "press" | "dragged" | "made";
export function FileTile({ s, kind = 0, name }: { s: FileState; kind?: number; name?: string }) {
  const [, nm, letter, colour] = LOOKS.file.kinds[kind % LOOKS.file.kinds.length], S = 64, r = CURVE.radius.field;
  const d: Depth = s === "dragged" ? "lifted" : "card";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ width: S, height: S, position: "relative", transform: s === "press" ? `scale(${SY.move.press.scale})` : s === "dragged" ? `translateY(-6px) scale(${DP.lifted.scale})` : s === "hover" ? `translateY(${SY.move.hover.rise * 2}px)` : undefined,
        transition: tr("transform", "lift") }}>
        <div style={{ position: "absolute", inset: 0, clipPath: `path("${curve(S, S, r)}")`, background: DP[d].fill }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: r + 4, boxShadow: [rimOf(DP[d].rim), dropOf(DP[d].shadow)].join(", "), pointerEvents: "none", clipPath: "inset(-80px)" }} />
        {[0, 1, 2].map((i) => <span key={i} style={{ position: "absolute", left: 14, right: i === 2 ? 26 : 14, top: 14 + i * 7, height: 2, borderRadius: 1, background: on(0.12) }} />)}
        <span style={{ position: "absolute", left: 10, bottom: 10 }}><Sticker key={s === "made" ? "m" : "r"} land={s === "made"} fill={colour} style={{ color: deep(0.85) }}>{letter || "img"}</Sticker></span>
      </div>
      <span style={{ fontSize: T.label[0], color: dim }}>{name ?? nm}</span>
    </div>
  );
}

// ---- 13. the effort pill ------------------------------------------------------------------------------------------
// Levels as words in a well; the pick is Sol's heat (rule 15), more of the six the higher, still once set (rule 19);
// changing, it pours; hover raises a level to control depth.
export type EffortState = "low" | "medium" | "high" | "hover" | "changing";
const LEVELS = ["low", "medium", "high", "max"] as const;
export function heatOf(l: Lit, i: number) { const six = l.jelly.six; return i <= 0 ? l.jelly.warm.slice(0, 2) : i === 1 ? l.jelly.warm : i === 2 ? six : [...six, ...six]; }
export function EffortChips({ s }: { s: EffortState }) {
  const l = useLit(), pick = s === "low" ? 0 : s === "medium" || s === "changing" ? 1 : 2;
  return (
    <div style={{ display: "inline-flex", padding: 6, borderRadius: 24, ...surface("card") }}>
      <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 21, ...well() }}>
        {LEVELS.map((lv, i) => i === pick ? (
          <span key={lv} style={{ position: "relative", height: 34, width: 78, borderRadius: 17, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: `${rimOf(DP.control.rim * 2)}, ${dropOf(DP.control.shadow)}` }}>
            <span key={s} style={{ position: "absolute", inset: 0, borderRadius: 17, backgroundImage: sol(l, heatOf(l, i)), animation: s === "changing" ? anim("pour", "pour") : undefined }} />
            <span style={{ position: "relative", fontSize: T.body[0], fontWeight: SY.type.picked.weight, color: deep(0.88) }}>{lv}</span>
          </span>
        ) : (
          <PillControl key={lv} s={s === "hover" && i === 3 ? "hover" : "rest"} w={62} h={34}>{lv}</PillControl>
        ))}
      </div>
    </div>
  );
}

// ---- the registry: each piece, its states, its one motion, the moment that fires it, its role ---------------------
export type PieceId = "send" | "pill" | "row" | "halo" | "undo" | "tick" | "needs" | "running" | "stamp" | "ping" | "meter" | "file" | "effort";
export type Piece = {
  id: PieceId; name: string; pin: number; family: string; states: readonly string[]; draw: (s: string) => ReactNode;
  /** the one motion, played by itself in the clip: the states in order, how long each holds */
  play: readonly (readonly [string, number])[]; motion: string; moment: string; why: string; slots: string; today: string;
};
const S = <X extends string>(f: (p: { s: X }) => ReactNode) => (s: string) => f({ s: s as X });
export const PIECES: readonly Piece[] = [
  { id: "send", name: "send", pin: 20, family: "card · well · pill · sol", states: ["empty", "ready", "hover", "press", "sent", "stop"], draw: S(Send),
    play: [["empty", 700], ["ready", 1100], ["hover", 500], ["press", 220], ["sent", 700], ["stop", 2400], ["empty", 600]],
    motion: "pour: with words the pill fills with Sol's bands from the left; working, they drift", moment: "you press send or ⏎ with words in the box",
    why: "rule 15: your words go to Sol, so send wears Sol's colour, only while it can go", slots: "system.depth card, well · role sol · move pour, drift, press", today: "kit/Button.tsx; work/Composer's send" },
  { id: "pill", name: "the picked pill", pin: 144, family: "card · pill · picked", states: ["rest", "hover", "press", "lit", "lit-hover"], draw: S(LitPill),
    play: [["rest", 700], ["hover", 500], ["press", 200], ["lit", 1400], ["rest", 500]],
    motion: "pour: the pearl fills from the left", moment: "you pick one of several: the model, the mode, the folder",
    why: "rule 14: what you chose is pearl; the rest stay words on the card (rule 12)", slots: "system.depth card, control · role picked · move hover, press, pour", today: "kit/Pill.tsx" },
  { id: "row", name: "the active row", pin: 77, family: "card · picked · sol", states: ["rest", "hover", "press", "active", "active-running"], draw: S(ActiveRow),
    play: [["rest", 600], ["hover", 500], ["press", 200], ["active", 1300], ["active-running", 2400]],
    motion: "pour: the pearl fills the row; running, Sol's small mark drifts at its end", moment: "the session you open comes to the front",
    why: "rule 14: where you are is pearl; rule 19: Sol's working colour in one small place", slots: "system.depth card, control, well · role picked, sol · move pour, drift", today: "home/Side.tsx" },
  { id: "halo", name: "the seat", pin: 18, family: "well · sol · the jelly", states: ["rest", "working", "arriving"], draw: S((p: { s: HaloState }) => <HaloDial s={p.s} />),
    play: [["rest", 900], ["working", 2600], ["arriving", 1300], ["rest", 700]],
    motion: "pour then drift: the seat fills with Sol's bands while the jelly works", moment: "the jelly starts on your ask, or something lands",
    why: "rule 5: no glow; the jelly's light is a sunk seat that fills, calm at rest", slots: "system.depth well · role sol · move pour, drift", today: "kit/Halo.tsx" },
  { id: "undo", name: "the undo bar", pin: 99, family: "card · well · picked", states: ["closed", "draining", "last", "undone", "gone"], draw: S(UndoRing),
    play: [["closed", 1000], ["draining", 1000], ["last", 900], ["undone", 1200], ["gone", 700]],
    motion: "drain: the pearl steps go out one a second; undo pours them back", moment: "you close or remove something: six seconds to take it back",
    why: "rule 28: nothing is final; the time left is yours, so pearl", slots: "system.depth card, well · role picked · move drain, pour · type number", today: "kit/feel.ts RING; home/folders/Board's fh-undo" },
  { id: "tick", name: "the done coin", pin: 150, family: "card · coin · done", states: ["waiting", "landing", "done", "several", "seen"], draw: S(DoneTick),
    play: [["waiting", 800], ["landing", 900], ["several", 1100], ["seen", 1000]],
    motion: "land: the green coin arrives a little big and settles", moment: "a step or a run you started finishes",
    why: "rule 16: done is flat green, everywhere the same", slots: "system.depth card, control, well · role done · move land, lift", today: "kit/Block.tsx Stamp; stage/kinds/RunRows" },
  { id: "needs", name: "needs you", pin: 155, family: "lifted · sticker · ask", states: ["arrives", "waiting", "hover", "answered"], draw: S(NeedsYou),
    play: [["answered", 600], ["arrives", 1400], ["hover", 800], ["answered", 1200]],
    motion: "lift and land: the card rises, the yellow sticker lands on it", moment: "an agent asks you a question or a permission",
    why: "rule 8: the one thing that waits on you is lifted; rule 17: the yellow is a sticker, never the frame", slots: "system.depth lifted, sticker · role ask, done · move lift, land", today: "kit/Block.tsx note; stage/kinds/RunRows" },
  { id: "running", name: "the running mark", pin: 203, family: "card · well · sol", states: ["queued", "running", "slow", "done", "failed"], draw: S(RunningMark),
    play: [["queued", 700], ["running", 2400], ["slow", 2400], ["done", 1000]],
    motion: "drift: Sol's bands slide in a small well; slower when long; pour to green or red at the end", moment: "an agent is at work on something of yours",
    why: "rule 27: a drift, never a spinner", slots: "system.depth card, well · role sol, done, wrong · move drift, pour · type number", today: "home/Side.tsx; work/Show" },
  { id: "stamp", name: "the stamp", pin: 38, family: "card · sticker · picked", states: ["lands", "kept", "hover", "a day later"], draw: S(Stamp),
    play: [["kept", 400], ["lands", 1300], ["hover", 900], ["kept", 600]],
    motion: "land: the pearl sticker arrives a little big and askew, and settles", moment: "something is made and kept: a block frozen, a PR merged, a release",
    why: "rule 22: Sol says it in mono capitals on a sticker; pearl, as what is kept is yours", slots: "system.depth card, sticker · role picked · move land, lift · type sticker", today: "kit/Block.tsx Stamp; stage-feel Slip" },
  { id: "ping", name: "the ping", pin: 95, family: "card · coin · meaning", states: ["one", "three", "fanned", "seen"], draw: S(Ping),
    play: [["seen", 600], ["one", 1000], ["three", 1100], ["fanned", 1100], ["seen", 800]],
    motion: "land: a coin drops into the holder; under the pointer they fan", moment: "something of yours wants a look while you were elsewhere",
    why: "rule 16: each coin is its meaning; what Sol said is Sol's still bands; never a red count", slots: "system.depth card, sticker · role ask, done, wrong, sol · move land, lift · type number", today: "notify/InPlace" },
  { id: "meter", name: "the meter", pin: 64, family: "card · well · sol", states: ["a fifth", "half", "nearly full", "filling"], draw: S(GlassMeter),
    play: [["a fifth", 900], ["half", 1100], ["nearly full", 1300], ["a fifth", 900]],
    motion: "pour: the bands fill the well to the level", moment: "the context fills, or the day's use grows",
    why: "rule 15: how full Sol is wears Sol's colour; warm, never red", slots: "system.depth card, well · role sol · move pour · type number", today: "kit/Meter.tsx, kit/Ring.tsx" },
  { id: "file", name: "the file mark", pin: 167, family: "card · sticker · kind", states: ["rest", "hover", "press", "dragged", "made"], draw: S(FileTile),
    play: [["rest", 600], ["made", 1000], ["hover", 800], ["press", 250], ["dragged", 1000], ["rest", 500]],
    motion: "land: the kind's sticker arrives; dragged, the card lifts", moment: "a file is made or attached",
    why: "rule 18: the kind's colour on its sticker alone, the rest a card like every card", slots: "system.depth card, lifted, sticker · role kind · move land, lift, press", today: "kit/FileMark.tsx" },
  { id: "effort", name: "the effort pill", pin: 214, family: "card · well · sol", states: ["low", "medium", "high", "hover", "changing"], draw: S(EffortChips),
    play: [["low", 900], ["changing", 1200], ["high", 1400], ["hover", 800]],
    motion: "pour: the pick fills with Sol's heat, more of the six the higher", moment: "you set how hard the AI should think",
    why: "rule 15: effort is Sol's heat; still once set (rule 19)", slots: "system.depth card, well, control · role sol · move pour, hover", today: "EffortPill.tsx" },
];

/** a candidate set to prove the switch: cold where today is warm */
export const TEST_SET: Lit = {
  jelly: { six: ["#2f6bff", "#4fb3ff", "#20d6c7", "#7c5cff", "#b98bff", "#18c08f"], warm: ["#4fb3ff", "#20d6c7", "#7c5cff", "#b98bff"], angle: 135, soft: 0.12, veil: 0.4 },
  light: { from: [0.6, -0.75], rim: 0.6, sheen: 0.14 },
};
export const pieceStyle: CSSProperties = { fontFamily: T.family, WebkitFontSmoothing: "antialiased" };
