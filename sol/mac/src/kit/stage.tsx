// The kit stage (#674): the jelly at the centre, with nothing behind it, on the window's glass over the desk, every
// primitive the chat bar needs around it, drawn from the kit (index.ts), so from tokens.json only. Each primitive draws
// its pick; a take is asked for by the letter it had on the kit page. Dev only, like gallery.tsx: kit.html is not in the
// face's build inputs; sol/design/system/kit.mjs builds it with them and shoots it on the NucBox.
//   kit.html                               every primitive in its pick, the halo at rest
//   kit.html?focus=<primitive>&t=<a|b|c>   that primitive in that take, the rest in their picks
//   kit.html?t=<a|b|c>                     every primitive in that take
// Under the window, scrolled to: the six type steps (#762), drawn by the kit's own classes (type.css); under them
// the 22 glyphs (#764), each at mute (rest) and at dim (hover).
//   the motion part (#763) along the foot: the five springs, the hand, the slow ×4 switch (motion.ts)
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import home from "../../../design/body/real/desktop.jpg";   // Marco's own desktop, where the notch was shot in #626
import { Button, Card, Field, FileChip, Glyph, GLYPH_SETS, Halo, KINDS, List, LOOKS, Meter, Pill, Ring, Row, curve, type ButtonForm, type ButtonState, type Look } from "./index";
import { black, dim, ink, label, on, TYPE } from "./paint";
import { CURVE, SHADE, TYPE as T } from "./tokens";
import "../palette.css";
import "./type.css";
import { MotionPart } from "./Motion";

type Letter = "a" | "b" | "c";
const q = new URLSearchParams(location.search);
const every = q.get("t") as Letter | null, focus = q.get("focus") as Look | null;
/** the take a primitive draws: the asked letter's, else its pick (the halo's: the take it wears at rest) */
function take<L extends Look>(look: L): keyof (typeof LOOKS)[L]["takes"] {
  const l = LOOKS[look] as { takes: Record<string, { take: string }>; pick?: string; states?: Record<string, string> };
  const asked = focus ? (focus === look ? every : null) : every;
  const named = asked && Object.entries(l.takes).find(([, v]) => v.take === asked)?.[0];
  return (named ?? l.pick ?? l.states!.rest) as keyof (typeof LOOKS)[L]["takes"];
}
const doingOf = (name: string) => Object.entries(LOOKS.halo.states).find(([, t]) => t === name)?.[0] ?? "";

const Under = ({ children, w }: { children: ReactNode; w?: number }) => <div style={{ ...label, marginTop: 8, width: w, textAlign: w ? "center" : undefined }}>{children}</div>;
const Cell = ({ name, title, x, y, w, h, children }: { name: string; title: string; x: number; y: number; w: number; h: number; children: ReactNode }) => (
  <section data-kit={name} style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
    <div style={{ ...label, marginBottom: 10 }}>{title}</div>
    {children}
  </section>
);

// ── what each cell shows: the stage's own scenes, built only from the kit ──────────────────────────────────────────
const Plus = () => <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
function Buttons() {
  const look = take("button"), forms = Object.keys(LOOKS.button.forms) as ButtonForm[], states: ButtonState[] = ["rest", "hover", "press"];
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {forms.map((form) => (
        <div key={form} style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {states.map((s) => (
            <div key={s} style={{ display: "flex", gap: 8, alignItems: "center", width: 112, height: 40 }}>
              <Button w={72} h={32} form={form} look={look} state={s}>Run</Button>
              <Button w={32} h={32} form={form} look={look} state={s}><Plus /></Button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", gap: 18 }}>{states.map((s) => <div key={s} style={{ ...label, width: 112 }}>{s}</div>)}</div>
      <div style={{ ...label }}>top: {forms[0]}, keeps its shape · under: {forms[1]}, like the jelly</div>
    </div>
  );
}
function Pearls() {
  const pearl = take("pearl"), rows: [string, string, "rest" | "hover" | "picked"][] = [["the release notes", "1h", "rest"], ["a kit for the face", "4h", "hover"], ["fix the focus ring", "2m", "picked"]];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Pill words={["ask", "edits", "auto", "bypass"]} picked={2} pearl={pearl} />
      <div style={{ height: 10 }} />
      {rows.map(([title, time, s]) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...label, width: 44, textAlign: "right" }}>{s}</div>
          <Row w={316} title={title} aside={time} picked={s === "picked"} hover={s === "hover"} pearl={pearl} />
        </div>
      ))}
    </div>
  );
}
function Fields() {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Field w={372} focus={false}>tell Sol what to do</Field><Under>rest</Under>
      <Field w={372} focus>make the ring fill from the keys<span style={{ display: "inline-block", width: 1.5, height: 17, marginLeft: 1, background: ink }} /></Field><Under>it has you</Under>
    </div>
  );
}
function Context() {
  const line = (a: string, b: string) => <div style={{ display: "flex", justifyContent: "space-between", color: dim }}><span>{a}</span><span style={{ color: ink, fontVariantNumeric: "tabular-nums" }}>{b}</span></div>;
  return (
    <Card w={372} h={150}>
      <div style={{ padding: "16px 22px" }}>
        <div style={{ fontSize: T.read[0], lineHeight: `${T.read[1]}px`, fontWeight: 600 }}>The context</div>
        <div style={{ color: dim, marginBottom: 12 }}>a third full · room for about 40 more turns</div>
        <div style={{ height: 1, background: on(SHADE.on.line), margin: "0 0 10px" }} />
        <div style={{ display: "grid", gap: 2 }}>{line("what you said", "12k")}{line("the files", "41k")}</div>
      </div>
    </Card>
  );
}
function Rings() {
  const look = take("ring");
  return <div style={{ display: "flex", gap: 34 }}>{[0.3, 0.7, 0.95].map((v) => <div key={v}><Ring value={v} look={look} /><Under w={80}>{Math.round(v * 100)}%</Under></div>)}</div>;
}
const Files = () => <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{KINDS.map((k) => <FileChip key={k[0]} ext={k[0]} name={k[1]} look={take("file")} />)}</div>;
/** a list in a card (#647, kit growth): a head, rows with a note, the picked one in the pearl, one under the pointer */
function Lists() {
  const items = [{ head: "Claude" }, { id: "o", title: "Opus 5.5", note: "the most capable", picked: true }, { id: "s", title: "Sonnet 5.5", note: "fast and able, for most work" }, { id: "h", title: "Haiku 5.5", note: "the quickest, for small things" }];
  return <Card w={W} step="pop"><div style={{ padding: 8 }}><List w={W - 16} items={items} lit={2} onLit={() => {}} onPick={() => {}} /></div></Card>;
}
/** a meter (#647, kit growth): one value, and parts of a whole */
const Meters = () => (
  <div style={{ display: "grid", gap: 6 }}>
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>{[0.2, 0.6, 1].map((v) => <Meter key={v} w={64} h={6} value={v} />)}<span style={{ ...label }}>one value: how much it does alone</span></div>
    <div style={{ height: 8 }} />
    <Meter w={W} h={10} parts={[0.22, 0.09, 0.04, 0.03]} /><Under>parts of a whole: what fills the context</Under>
  </div>
);
/** the jelly on the window's glass, nothing behind it, in the frame Body.tsx draws it in (1.75 times its place) */
const AtRest = ({ w = 372, h = 320, frame = 196 }) => (
  <div style={{ position: "relative", width: w, height: h }}>
    <div style={{ position: "absolute", left: (w - frame) / 2, top: (h - frame) / 2 }}><Halo size={frame} look={take("halo")} /></div>
  </div>
);
/** the notch as the MacBook shows it: the desk at the screen's top, the black slab hanging from it, the jelly in its
 *  24 px place at the left, drawn 1.75 times that (BodyHere's frame) */
function Notch({ w = 372, h = 84 }) {
  const NW = 273, NH = 32, NR = 14, SLOT = 24, F = Math.round(SLOT * 1.75), nx = (w - NW) / 2, S = CURVE.smoothing;
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", clipPath: `path('${curve(w, h, CURVE.radius.row, S)}')`, background: `url(${home}) 50% 0 / 1280px auto` }}>
      <svg width={NW} height={NH} style={{ position: "absolute", left: nx, top: 0 }} aria-hidden><path d={curve(NW, NH + NR, NR, S, 0, -NR)} fill={black(1)} /></svg>
      <div style={{ position: "absolute", left: nx + 12 + (SLOT - F) / 2, top: (NH - SLOT) / 2 + (SLOT - F) / 2 }}><Halo size={F} look={take("halo")} /></div>
    </div>
  );
}

/** the 22 glyphs (#764) in ui.html's three sets: each at mute as it rests, at dim as under the pointer, its name under */
function Glyphs() {
  const COL = 48, HEAD = 64, row = (hover: boolean, set: (typeof GLYPH_SETS)[number]) => (
    <div style={{ display: "flex" }}>{set.glyphs.map(([g, means]) => <div key={g} title={means} style={{ width: COL, height: 40, display: "flex", alignItems: "center" }}><Glyph name={g} hover={hover || undefined} /></div>)}</div>
  );
  return (
    <div style={{ display: "flex" }}>
      <div style={{ width: HEAD, paddingTop: 26 }}>
        {["rest, mute", "hover, dim"].map((s) => <div key={s} style={{ ...label, height: 40, display: "flex", alignItems: "center" }}>{s}</div>)}
      </div>
      {GLYPH_SETS.map((set, i) => (
        <div key={set.title} data-glyph-set={set.title} style={{ marginRight: i < GLYPH_SETS.length - 1 ? 24 : 0 }}>
          <div style={{ ...label, height: 26 }}>{set.title}</div>
          {row(false, set)}
          {row(true, set)}
          <div style={{ display: "flex" }}>{set.glyphs.map(([g]) => <div key={g} style={{ ...label, width: COL, color: dim }}>{g}</div>)}</div>
        </div>
      ))}
    </div>
  );
}

// the stage's layout: three columns in a 1280 × 800 window
const L = 48, M = 452, Rx = 860, W = 372;
const title = (look: Look) => LOOKS[look].title.toLowerCase();
const CELLS: { name: string; title: string; x: number; y: number; w?: number; h: number; draw: () => ReactNode }[] = [
  { name: "button", title: title("button"), x: L, y: 40, h: 156, draw: () => <Buttons /> },
  { name: "pearl", title: title("pearl"), x: L, y: 220, h: 206, draw: () => <Pearls /> },
  { name: "field", title: `${title("field")}, settled (a)`, x: L, y: 452, h: 170, draw: () => <Fields /> },
  { name: "halo", title: `${title("halo")}, ${doingOf(take("halo"))}`, x: M, y: 40, h: 346, draw: () => <AtRest /> },
  { name: "notch", title: "the jelly in the notch, 24 px", x: M, y: 404, h: 112, draw: () => <Notch /> },
  { name: "ring", title: title("ring"), x: M + (W - 308) / 2, y: 548, w: 308, h: 134, draw: () => <Rings /> },
  { name: "meter", title: "a meter", x: L, y: 646, h: 100, draw: () => <Meters /> },
  { name: "file", title: title("file"), x: Rx, y: 40, h: 196, draw: () => <Files /> },
  { name: "card", title: `${title("card")}, settled (c, ${CURVE.radius.card})`, x: Rx, y: 252, h: 178, draw: () => <Context /> },
  { name: "list", title: "a list in a card, at the pop step", x: Rx, y: 450, h: 240, draw: () => <Lists /> },
];

/** the six type steps (#762; ui.md "Type"): each drawn by its kit class, with its numbers and where it is used. The size
 *  and line are the tokens'; the weight and tracking are the class's (type.css). Sentence case, never capitals. */
const STEPS: { step: "display" | "title" | "read" | "body" | "code" | "label"; weight: string; track: string; says: string; where: string }[] = [
  { step: "display", weight: "600", track: "−.02em", says: "Three things need you. Two are moving on their own.", where: "Home's one line; a page opened full. One per screen" },
  { step: "title", weight: "600", track: "−.01em", says: "Chem 110 set 6 is due tonight.", where: "a thing opened, a settings page, a block in focus. Never in a row" },
  { step: "read", weight: "400, 600 a card's head", track: "0", says: "Sol may draft replies to school email but asks before it sends anything.", where: "the box's field, the policy, a card's head" },
  { step: "body", weight: "400, 500 names", track: "0", says: "I split the set into three parts and put the hard one first; the answers are in the block on the right.", where: "the talk, rows, block heads, most text" },
  { step: "code", weight: "400 · mono", track: "0", says: "+ const PAD = SPACE.s4;   // 16, the scale", where: "diff, terminal, a step's output, values, the making line" },
  { step: "label", weight: "400", track: "+.01em", says: "Canvas · school › chem 110 · read 2 min ago", where: "meta, crumbs, captions, chips, the judge's track. Never capitals" },
];
const TY = 800, TH = 840;   // the type section: under the window's 800, scrolled to
const GY = TY + TH, GH = 240;   // the glyphs (#764): under the type
function Types() {
  const line = `1px solid ${on(SHADE.on.line)}`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 300px", columnGap: 32 }}>
      {STEPS.map(({ step, weight, track, says, where }) => {
        const [size, lh] = T[step];
        return [
          <div key={`${step}-n`} data-step={step} style={{ borderTop: line, padding: "16px 0" }}>
            <div className="t-body" style={{ color: ink, fontWeight: 500 }}>{step}</div>
            <div className="t-code" style={{ color: dim }}>{size}/{lh} · {weight} · {track}</div>
          </div>,
          <div key={`${step}-x`} className={`t-${step}`} style={{ borderTop: line, padding: "16px 0", color: step === "label" ? dim : ink }}>{says}</div>,
          <div key={`${step}-w`} className="t-label" style={{ borderTop: line, padding: "16px 0", color: dim }}>{where}</div>,
        ];
      })}
      <div style={{ gridColumn: "1 / -1", borderTop: line, paddingTop: 16, display: "flex", gap: 32, alignItems: "baseline" }}>
        {([400, 500, 600] as const).map((w) => <span key={w} className="t-title" style={{ fontWeight: w }}>{w} {w === 400 ? "reads" : w === 500 ? "names" : "heads"}</span>)}
        <span className="t-label" style={{ color: dim }}>no 300, no 700: the count disc's 700 is the one exception</span>
      </div>
    </div>
  );
}

function Stage() {
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover` }}>
      {/* the window: the one black at its opacity over the desk, blurred (brand.md, the material; face.css's --base) */}
      <div style={{ position: "absolute", inset: 0, background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}` }} />
      {/* the window's 800 as it was, and the type under it: the page scrolls over the glass, which stays */}
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        <div style={{ position: "relative", height: GY + GH }}>
          {CELLS.map((c) => <Cell key={c.name} name={c.name} title={c.title} x={c.x} y={c.y} w={c.w ?? W} h={c.h}>{c.draw()}</Cell>)}
          <MotionPart x={M} y={704} w={Rx + W - M} />
          <Cell name="type" title="type: six steps, three weights, no capitals" x={L} y={TY + 40} w={1280 - 2 * L} h={TH - 80}><Types /></Cell>
          <Cell name="glyph" title="the 22 glyphs, 24 px: acts at mute, dim on hover" x={L} y={GY} w={1280 - 2 * L} h={GH - 80}><Glyphs /></Cell>
        </div>
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Stage /></StrictMode>);
