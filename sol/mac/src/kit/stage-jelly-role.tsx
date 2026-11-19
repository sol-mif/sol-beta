// The jelly's role across the window (#1245, item 1), the sheet: each of the body's acts (body/role.ts) performed by
// the real body (body/Bodies.tsx BodyOne) on a small piece of the frame (the notch, a block, the bar), drawn from the
// kit's own parts on the window's glass, its reason under it in one line. At the top, the day in order: which act
// happens at each moment. At the foot, the rule for the day's scenes: one line each, scene, acts, why, and where the
// heading sits (the jelly is never a picture, #1245). Written for the product lead's eye: plain words, large, no file names on the page.
// Dev only; sol/design/system/jelly-role.mjs shoots it for sol/design/system/jelly-role.html.
//   jelly-role.html            every scene plays its act on a loop (the one-shot acts replay)
//   jelly-role.html?still      every scene at its end state (the shots)
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import tokens from "../../../design/system/tokens.json";
import { BodyMark, BodyOne } from "../body/Bodies";
import { ACTS, DAY, IN_SCENES, type Act } from "../body/role";
import { setBodyVariant } from "../body/variants";
import { dur } from "../motion";
import {
  ACCENT_MOVES, Coin, HaloDial, HoldStill, MEANING, Num, PillControl, RunMark, Sign, Sticker,
  blk, dim, ink, inner, mute, on, pieceStyle, surface, well,
} from "./Accent";
import { curve } from "./curve";
import { CURVE, SHADE, SYSTEM, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

setBodyVariant("one");
const still = new URLSearchParams(location.search).has("still");
const R = CURVE.radius.block, DP = SYSTEM.depth;
/** headings and big numbers: SF Pro Display at Black, tight (font.display, rule 23) */
const FD = tokens.palette.font.display;
const display = (px: number) => ({ fontFamily: FD.value, fontWeight: FD.weight, letterSpacing: `${FD.tracking}em`, fontSize: px, lineHeight: 1.05 });
const W = 1280, PAD = 64, COL = (W - PAD * 2 - 32) / 2, SCENE_H = 248;

/** a beat that counts up, so a one-shot act (arrive, carry, land) plays again: the drift's cycle, twice */
function useBeat() {
  const [n, setN] = useState(0);
  useEffect(() => { if (still) return; const h = window.setInterval(() => setN((x) => x + 1), dur("cycle") * 2); return () => clearInterval(h); }, []);
  return n;
}

// ---- the frame's small pieces -----------------------------------------------------------------------------------------
/** a block: a card on the glass (rule 1), its name on top, lifted when it waits on you (rule 8) */
function Block({ id, w, h, title, lifted, mark, children }: { id?: string; w: number; h: number; title: string; lifted?: boolean; mark?: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} style={{ position: "relative", width: w, height: h, borderRadius: R, flex: "none", ...surface(lifted ? "lifted" : "card"),
      transform: lifted ? `translateY(-4px) scale(${DP.lifted.scale})` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 8px" }}>
        <span style={{ fontSize: T.head[0], fontWeight: 500, color: ink, whiteSpace: "nowrap" }}>{title}</span><span style={{ flex: 1 }} />{mark}
      </div>
      {children}
    </div>
  );
}
const Line = ({ lead, words, note, quiet }: { lead: ReactNode; words: string; note?: string; quiet?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 32, padding: "0 18px" }}>
    <span style={{ width: 24, display: "inline-flex", justifyContent: "center" }}>{lead}</span>
    <span style={{ flex: 1, fontSize: T.body[0], color: quiet ? mute : ink, whiteSpace: "nowrap" }}>{words}</span>
    {note && <span style={{ fontSize: T.label[0], color: mute }}>{note}</span>}
  </div>
);
const done = <Coin role="done" d={16}><Sign d="tick" s={11} w={2} /></Coin>;
/** the notch: the black slab hanging from the top edge, on the continuous curve */
function Notch({ w = 220, h = 30, children }: { w?: number; h?: number; children?: ReactNode }) {
  const r = 13;
  return (
    <div style={{ position: "relative", width: w, height: h, flex: "none" }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }} aria-hidden><path d={curve(w, h + r, r, CURVE.smoothing, 0, -r)} fill="#000" /></svg>
      {children}
    </div>
  );
}
/** the menu bar's strip of the desk */
const MenuStrip = ({ w, children }: { w: number; children?: ReactNode }) => (
  <div style={{ position: "relative", width: w, height: 30, borderRadius: inner(R, 8), overflow: "hidden", background: `url(${desk}) 50% 0 / 1280px auto` }}>
    <div style={{ position: "absolute", inset: 0, background: blk(0.18) }} />
    <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, padding: "0 14px", fontSize: T.label[0], color: on(0.9) }}>{children}</div>
  </div>
);
/** the bar: the seat, the words in their well, send */
function Bar({ w, words, seat }: { w: number; words?: string; seat: ReactNode }) {
  return (
    <div style={{ width: w, height: 68, borderRadius: R, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", boxSizing: "border-box", ...surface("card") }}>
      {seat}
      <div style={{ flex: 1, height: 42, borderRadius: 21, display: "flex", alignItems: "center", padding: "0 16px", ...well() }}>
        <span style={{ fontSize: T.body[0], color: words ? ink : mute, whiteSpace: "nowrap" }}>{words ?? "ask, or drop a file"}</span>
      </div>
      <PillControl s="rest" w={44} h={42}><Sign d="up" c={words ? ink : mute} s={18} w={2} /></PillControl>
    </div>
  );
}

// ---- the scenes: one act each, on its piece of the frame ---------------------------------------------------------------
const center = { position: "absolute" as const, inset: 0, display: "flex", alignItems: "center", justifyContent: "center" };

function Arrive({ beat }: { beat: number }) {
  return (
    <div style={{ ...center, alignItems: "flex-start" }}>
      <MenuStrip w={COL - 40} />
      <div style={{ position: "absolute", top: 0, left: (COL - 220) / 2 }}><Notch /></div>
      <div style={{ position: "absolute", top: 44, left: (COL - 120) / 2 }}><BodyOne key={beat} size={120} act="arrive" /></div>
      <div style={{ position: "absolute", bottom: 18, fontSize: T.body[0], color: dim }}>good morning</div>
    </div>
  );
}
function Sit() {
  return <div style={center}><Bar w={COL - 80} seat={<HaloDial s="rest" d={50} body={<BodyOne size={46} act="sit" />} />} /></div>;
}
function Carry({ beat }: { beat: number }) {
  // there and back: on odd beats it carries your words to the block; on even ones it sits in the bar again
  const going = beat % 2 === 1 || still;
  const chip = (
    <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 10px", borderRadius: 11, fontSize: T.label[0], color: ink, ...surface("control") }}>the release notes</span>
  );
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", right: 40, top: 36 }}><Block id="jr-carry" w={232} h={92} title="the release notes"><Line lead={<RunMark s="queued" w={22} />} words="read the merged PRs" quiet /></Block></div>
      <div style={{ position: "absolute", left: 40, bottom: 20 }}>
        <Bar w={COL - 80} words={going ? undefined : "write the release notes"} seat={<HaloDial s="rest" d={50} />} />
      </div>
      {/* the body sits over the seat, not in it, so it can leave with the thing in its hands */}
      <div style={{ position: "absolute", left: 40 + 10 + 2, bottom: 20 + 9 + 2 }}>
        <BodyOne size={46} act={going ? "carry" : "sit"} toward="jr-carry" holding={going ? chip : undefined} />
      </div>
    </div>
  );
}
function Work() {
  return (
    <div style={{ ...center, gap: 18 }}>
      <BodyOne size={72} act="work" toward="jr-work" />
      <HoldStill value>
        <Block id="jr-work" w={300} h={136} title="the release notes" mark={<Num c={dim} style={{ fontSize: T.body[0] }}>2m</Num>}>
          <Line lead={done} words="read the eleven merged PRs" note="done" />
          <Line lead={<RunMark s="running" w={22} />} words="write the three lines" note="now" />
          <Line lead={<RunMark s="queued" w={22} />} words="post them in #builds" quiet />
        </Block>
      </HoldStill>
    </div>
  );
}
function Point() {
  return (
    <div style={{ ...center, gap: 18 }}>
      <Block id="jr-point" w={300} h={150} title="the release notes" lifted>
        <span style={{ position: "absolute", left: 16, top: -11 }}><Sticker fill={MEANING.ask}>needs you</Sticker></span>
        <div style={{ margin: "4px 10px 0", padding: "12px 16px", borderRadius: inner(R, 10), ...well() }}>
          <div style={{ fontSize: T.body[0], color: ink, marginBottom: 10 }}>May I post the three lines now?</div>
          <div style={{ display: "flex", gap: 6 }}><PillControl s="hover" w={92} h={30}>post them</PillControl><PillControl s="rest" w={80} h={30}>not yet</PillControl></div>
        </div>
      </Block>
      <BodyOne size={72} act="point" toward="jr-point" />
    </div>
  );
}
function Land({ beat }: { beat: number }) {
  return (
    <div style={{ ...center, gap: 18 }}>
      <BodyOne key={beat} size={72} act="land" toward="jr-land" />
      <Block id="jr-land" w={300} h={136} title="the release notes"
        mark={<Coin key={beat} role="done" d={24} land={!still}><Sign d="tick" s={14} w={2} /></Coin>}>
        <Line lead={done} words="read the eleven merged PRs" note="done" />
        <Line lead={done} words="write the three lines" note="done" />
        <Line lead={done} words="post them in #builds" note="done" />
      </Block>
    </div>
  );
}
function Wait() {
  // the steady part says why (rule 37): the same shape every time, flat, still; the jelly only sits lower
  return (
    <div style={{ ...center, gap: 18 }}>
      <HaloDial s="rest" d={76} body={<BodyOne size={72} act="wait" />} />
      <div style={{ width: 300, borderRadius: R, padding: "16px 18px", boxSizing: "border-box", ...surface("card") }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Coin role="wrong" d={16}><Sign d="wrong" s={11} w={2} /></Coin>
          <span style={{ fontSize: T.head[0], fontWeight: 500, color: ink }}>Sol can't reach its engine</span>
        </div>
        <div style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: dim, marginTop: 8 }}>Your work is safe. Trying again in <Num c={ink} style={{ fontSize: T.body[0] }}>20</Num> s.</div>
      </div>
    </div>
  );
}
function Mark() {
  const tag = (s: string) => <div style={{ fontSize: T.label[0], color: mute, marginTop: 8, textAlign: "center" }}>{s}</div>;
  return (
    <div style={{ ...center, gap: 28, alignItems: "flex-start", paddingTop: 52 }}>
      <div><Notch w={150} h={30}><span style={{ position: "absolute", left: 14, top: 7 }}><BodyMark size={16} color={on(0.9)} /></span></Notch>{tag("the notch, idle")}</div>
      <div><MenuStrip w={150}><BodyMark size={16} color={on(0.9)} /><span>Sun 9:41</span></MenuStrip>{tag("the menu bar")}</div>
      <div>
        <div style={{ width: 190, borderRadius: inner(R, 4), padding: "10px 14px", boxSizing: "border-box", ...surface("card") }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><BodyMark size={16} /><span style={{ fontSize: T.label[0], fontWeight: 500, color: ink }}>Sol</span></div>
          <div style={{ fontSize: T.body[0], color: dim }}>Posted the three lines.</div>
        </div>
        {tag("a message's author")}
      </div>
    </div>
  );
}

const SCENES: Record<Act, (p: { beat: number }) => ReactNode> = {
  arrive: Arrive, sit: Sit, carry: Carry, work: Work, point: Point, land: Land, wait: Wait, mark: Mark,
};
const PLAIN: Record<Act, string> = { arrive: "Arrive", sit: "Sit", carry: "Carry", work: "Work", point: "Point", land: "Land", wait: "Wait", mark: "The mark" };

// ---- the page ---------------------------------------------------------------------------------------------------------
/** the day, in order: one moment per act, the body as it is then, held still (at rest only one thing moves, rule 20) */
function Day() {
  const cw = (W - PAD * 2) / DAY.length;
  return (
    <div data-still style={{ display: "flex", borderRadius: R, padding: "22px 8px 20px", ...surface("card") }}>
      {DAY.map((d, i) => (
        <div key={d.act} style={{ width: cw - 2, padding: "0 10px", boxSizing: "border-box", borderLeft: i ? `1px solid ${on(SHADE.on.line)}` : "none" }}>
          <div style={{ ...display(T.big[0]), color: ink, fontVariantNumeric: "tabular-nums" }}>{d.at}</div>
          <div style={{ height: 64, display: "flex", alignItems: "flex-end", margin: "8px 0 6px" }}>
            {d.act === "mark" ? <span style={{ padding: "0 0 8px 6px" }}><BodyMark size={16} /></span> : <BodyOne size={56} act={d.act} />}
          </div>
          <div style={{ fontSize: T.head[0], fontWeight: 500, color: ink }}>{PLAIN[d.act]}</div>
          <div style={{ fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: dim, marginTop: 4 }}>{d.moment}</div>
        </div>
      ))}
    </div>
  );
}

/** the rule for the day's scenes: in each, the acts it does (never a still picture) and why; the heading sits centred
 *  under the notch when the jelly drops from there, at the stage's left edge when the window is already open */
function InScenes() {
  const where = { centred: "heading centred, under the notch", left: "heading at the stage's left edge", none: "no heading, the blocks lead" } as const;
  return (
    <div data-in-scenes style={{ position: "relative", padding: `0 ${PAD}px 72px` }}>
      <h2 style={{ ...display(T.display[0]), color: ink, margin: "0 0 6px" }}>In every scene, an act</h2>
      <p style={{ fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: dim, margin: "0 0 20px", maxWidth: 860 }}>
        The jelly is never a picture: in every scene it does something you can name, at the one size the stage uses.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "140px 300px 1fr", columnGap: 24 }}>
        {IN_SCENES.map((x) => (
          <div key={x.scene} style={{ display: "contents" }}>
            <div style={{ fontSize: T.head[0], fontWeight: 500, color: ink, padding: "12px 0", borderTop: `1px solid ${on(SHADE.on.line)}` }}>{x.scene}</div>
            <div style={{ fontSize: T.body[0], color: ink, padding: "12px 0", borderTop: `1px solid ${on(SHADE.on.line)}` }}>
              {x.acts.map((a) => PLAIN[a]).join(" → ")}
              <div style={{ fontSize: T.label[0], color: mute, marginTop: 2 }}>{where[x.heading]}</div>
            </div>
            <div style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: dim, padding: "12px 0", borderTop: `1px solid ${on(SHADE.on.line)}` }}>{x.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sheet() {
  const beat = useBeat();
  return (
    <div data-ac style={{ ...pieceStyle, position: "relative", width: W, minHeight: "100vh", margin: "0 auto", overflow: "hidden" }}>
      <style>{ACCENT_MOVES}{`[data-still] [data-body-one], [data-still] [data-body-one] * { animation: none !important; transition: none !important }`}</style>
      {/* the window's glass: the desk under the base, blurred, as whole.html draws it */}
      <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% 0 / cover` }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      <div style={{ position: "relative", padding: `56px ${PAD}px 72px` }}>
        <h1 style={{ ...display(T.display[0] * 2), color: ink, margin: 0 }}>What the jelly does</h1>
        <p style={{ fontSize: T.title[0], lineHeight: `${T.title[1]}px`, color: dim, margin: "14px 0 36px", maxWidth: 860 }}>
          A window has to answer four questions. The window itself answers <b style={{ color: ink, fontWeight: 500 }}>where am I</b> and <b style={{ color: ink, fontWeight: 500 }}>what did I just do</b>.
          The jelly answers the other two: <b style={{ color: ink, fontWeight: 500 }}>what is happening</b> and <b style={{ color: ink, fontWeight: 500 }}>what needs me</b>. It does that with eight acts.
        </p>
        <div style={{ fontSize: T.label[0], fontWeight: 500, color: mute, margin: "0 0 10px 4px" }}>a day</div>
        <Day />
        <div style={{ display: "grid", gridTemplateColumns: `${COL}px ${COL}px`, columnGap: 32, rowGap: 44, marginTop: 56 }}>
          {ACTS.map((a, i) => {
            const S = SCENES[a.name];
            return (
              <section key={a.name} data-act={a.name}>
                <div style={{ position: "relative", height: SCENE_H, borderRadius: R, background: blk(0.2) }}>
                  <S beat={beat} />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "18px 4px 0" }}>
                  <Num c={mute} style={{ ...display(T.title[0]) }}>{i + 1}</Num>
                  <h2 style={{ ...display(T.display[0]), color: ink, margin: 0 }}>{PLAIN[a.name]}</h2>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: T.label[0], color: a.answers === "what needs me" ? ink : mute }}>{a.answers}</span>
                </div>
                <p style={{ fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: dim, margin: "8px 4px 0" }}>{a.reason.replace(/ \(rules? \d+\)/g, "")}</p>
              </section>
            );
          })}
        </div>
      </div>
      <InScenes />
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Sheet /></StrictMode>);
