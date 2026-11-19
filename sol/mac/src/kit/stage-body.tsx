// The body sitting's stage (#1215): one body as the whole Build window, on the kit, on today's black glass ground, the
// way the frame stage draws its window (stage-frame.tsx). The body's token set is laid over the kit's before anything
// draws (body/variants.ts), so the pills, send, the active row, the halo and the notch re-light from it: what is judged
// is the window, not the creature. Dev only; sol/design/system/body.mjs builds and shoots it on the NucBox.
//   body.html?variant=a|one            the body (a, today's, is the default; one is drawn from the system, #1213)
//   body.html?take=rest                at rest: the empty Build window, the body in the spine, the hero, the notch strip
//   body.html?take=work                at work: three blocks on the stage, the side's active row running, a lit pill, send
//   body.html?take=small               small: the notch strip, the body at 24 and 48 in the side, a lit pill, a raised button
//   body.html?take=clip                the hero close, the body mounted again every 3 s so its one motion plays
import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { Body } from "../Body";
import { BODIES, setBodyVariant, VARIANTS, type BodyVariant } from "../body/variants";
import { Block } from "./Block";
import { Button, Field, Glyph, Halo, Pill, Row } from "./index";
import { curve } from "./curve";
import { black, dim, ink, label, mute, on, TYPE } from "./paint";
import { CURVE, SHADE, TYPE as T } from "./tokens";
import { FRAME, MAC } from "./geometry";
import "../palette.css";
import "../tokens.css";
import "./type.css";

const q = new URLSearchParams(location.search);
const asked = q.get("variant") as BodyVariant | null;
const variant: BodyVariant = asked && VARIANTS.includes(asked) ? asked : "a";
setBodyVariant(variant);   // before anything draws: the kit reads JELLY and GLASS at render
const take = q.get("take") ?? "rest";

const W = 1280, H = 800, MENU = 34, SPINE = FRAME.spine, SIDE = FRAME.side, BAR = 56;
/** the frame Body draws a slot in (BodyHere's: 1.75 times the slot, centred on it), so the settled body is the slot */
const SLOT = 1.75;
function Slot({ size }: { size: number }) {
  const f = Math.round(size * SLOT), off = (size - f) / 2;
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, verticalAlign: "top" }}>
      <span style={{ position: "absolute", left: off, top: off }}><Body size={f} state="settled" /></span>
    </span>
  );
}

/** the menu bar's strip of the desk, the black slab hanging from it with the body in its 24 px place at the left */
function NotchStrip({ w, h = MENU, words }: { w: number; h?: number; words?: string }) {
  const NW = 273, NH = 32, NR = 14, S = CURVE.smoothing, nx = (w - NW) / 2;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: `url(${desk}) 50% 0 / ${W}px auto` }}>
      <div style={{ position: "absolute", inset: 0, background: black(0.18) }} />
      <svg width={NW} height={NH} style={{ position: "absolute", left: nx, top: 0 }} aria-hidden><path d={curve(NW, NH + NR, NR, S, 0, -NR)} fill={black(1)} /></svg>
      <div style={{ position: "absolute", left: nx + 12, top: (NH - 24) / 2 }}><Slot size={24} /></div>
      {words && <div style={{ position: "absolute", left: nx + 48, right: w - nx - NW + 14, top: 0, height: NH, display: "flex", alignItems: "center", justifyContent: "flex-end", ...label, color: dim }}>{words}</div>}
    </div>
  );
}

/** the Mac's three lights, the window not key: grey dots, where tauri.conf.json puts them */
const Lights = () => (
  <div style={{ position: "absolute", left: MAC.lights.x, top: MAC.lights.y, display: "flex", gap: MAC.lights.gap }}>
    {[0, 1, 2].map((i) => <span key={i} style={{ width: MAC.lights.d, height: MAC.lights.d, borderRadius: 6, background: on(0.16) }} />)}
  </div>
);

/** the spine: the body first, under the lights, then the modes as glyphs at mute */
const Spine = () => (
  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SPINE, borderRight: `1px solid ${on(SHADE.on.line)}` }}>
    <div style={{ position: "absolute", left: (SPINE - 24) / 2, top: FRAME.row + 6 }}><Slot size={24} /></div>
    <div style={{ position: "absolute", left: (SPINE - 24) / 2, top: FRAME.row + 56, display: "grid", gap: 14, color: mute }}>
      {(["list", "canvas", "files"] as const).map((g) => <Glyph key={g} name={g} />)}
    </div>
  </div>
);

const SESSIONS = ["today", "the release", "the board", "school, exam friday"];
/** the side: the mode's name, its sessions; `active` runs with the working halo as its lead */
function Side({ active, head }: { active?: number; head?: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: SPINE, top: 0, bottom: 0, width: SIDE, background: "var(--side)", borderRight: `1px solid ${on(SHADE.on.line)}` }}>
      {head ?? <div style={{ ...label, color: dim, padding: `${FRAME.row + 8}px 20px 8px` }}>build</div>}
      <div style={{ padding: "0 8px", display: "grid", gap: 2 }}>
        {SESSIONS.map((s, i) => (
          <Row key={s} w={SIDE - 16} title={s} picked={i === active}
            lead={i === active ? <span style={{ display: "inline-flex", width: 16, height: 16 }}><Halo size={16} doing="working" /></span> : undefined}
            aside={i === active ? "2m" : undefined} />
        ))}
      </div>
    </div>
  );
}

/** the bar: the halo, the field, the mode picker (lit when `lit`), send (touched when `send`) */
function Bar({ lit, send, doing }: { lit?: boolean; send?: boolean; doing: "rest" | "working" }) {
  const left = SPINE + SIDE + 40, fw = W - left - 40 - 40 - 10 - 250 - 10 - 44 - 10;
  return (
    <div style={{ position: "absolute", left, right: 40, bottom: 28, height: BAR, display: "flex", alignItems: "center", gap: 10 }}>
      <Halo size={40} doing={doing} />
      <Field w={fw} h={44}><span style={{ color: dim, paddingLeft: 14 }}>{lit ? "post the three lines in #builds" : "ask, or drop a file"}</span></Field>
      <Pill words={["ask", "edits", "auto", "bypass"]} picked={lit ? 3 : 2} wash={lit ? 1 : 0} h={32} />
      <Button w={44} h={44} flat acts state={send ? "hover" : "rest"} label="send">↑</Button>
    </div>
  );
}

const Line = ({ title, note }: { title: string; note?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 16px", fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}><span style={{ color: ink }}>{title}</span><span style={{ color: dim }}>{note}</span></div>
);
const Para = ({ children }: { children: ReactNode }) => <div style={{ padding: "12px 16px 0", fontSize: T.body[0], lineHeight: `${T.body[1] + 1}px`, color: dim }}>{children}</div>;

/** the window: the glass ground over the desk, under the menu bar's strip, its top corners on the continuous curve */
function Window({ children }: { children: ReactNode }) {
  const wh = H - MENU, d = curve(W, wh + 40, 18, CURVE.smoothing);
  return (
    <div style={{ position: "absolute", left: 0, top: MENU, width: W, height: wh, clipPath: `path('${d}')` }}>
      <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% -${MENU}px / ${W}px auto` }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}` }} />
      <Lights />
      {children}
    </div>
  );
}

const STAGE = SPINE + SIDE;
/** the hero: the body at its 56 px slot over the question, in the middle of the empty stage */
const Hero = ({ y = 0 }: { y?: number }) => (
  <div style={{ position: "absolute", left: STAGE, right: 0, top: 0, bottom: BAR + 28 + y, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
    <Slot size={56} />
    <p style={{ margin: 0, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: dim }}>what are we doing in <b style={{ color: ink, fontWeight: 500 }}>sol</b>?</p>
  </div>
);

function Rest() {
  return (
    <>
      <NotchStrip w={W} />
      <Window><Spine /><Side /><Hero /><Bar doing="rest" /></Window>
    </>
  );
}

function Work() {
  return (
    <>
      <NotchStrip w={W} words="the release · 2m" />
      <Window>
        <Spine /><Side active={1} />
        <div style={{ position: "absolute", left: STAGE + 40, top: 64 }}>
          <Block w={440} h={220} title="the release notes" state="working">
            <Line title="read the merged PRs" note="done" /><Line title="write the three lines" note="2m" /><Line title="post in #builds" note="waits" />
          </Block>
        </div>
        <div style={{ position: "absolute", left: STAGE + 512, top: 64 }}>
          <Block w={340} h={220} title="what changed" state="waiting"><Para>the window lies on the ground; every block is a card on it, one solid thing with a lip and a shadow.</Para></Block>
        </div>
        <div style={{ position: "absolute", left: STAGE + 40, top: 324 }}>
          <Block w={440} h={180} title="the board" state="done"><Line title="eleven families, 215 pins" note="11-14" /><Line title="the body sitting" note="now" /></Block>
        </div>
        <Bar lit send doing="working" />
      </Window>
    </>
  );
}

/** small: a 640 × 400 corner of the screen drawn at twice its size (so the shot is at four times its pixels): the notch
 *  strip, the spine's 24 px body, the side's 48 px head, the active row, one lit pill and one raised button */
function Small() {
  const w = 640, h = 400;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: "scale(2)", transformOrigin: "0 0", overflow: "hidden" }}>
      <NotchStrip w={w} words="working" />
      <div style={{ position: "absolute", left: 0, top: MENU, width: w, height: h - MENU, clipPath: `path('${curve(w + 40, h - MENU + 40, 18, CURVE.smoothing)}')` }}>
        <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% -${MENU}px / ${W}px auto` }} />
        <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
        <Lights />
        <Spine />
        <Side active={1} head={
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: `${FRAME.row + 4}px 20px 14px` }}>
            <Slot size={48} /><div><div style={{ color: ink, fontWeight: 500 }}>sol</div><div style={{ ...label, color: mute }}>build · 4 sessions</div></div>
          </div>
        } />
        <div style={{ position: "absolute", left: STAGE + 28, top: 72, display: "grid", gap: 22, justifyItems: "start" }}>
          <Pill words={["auto", "bypass"]} picked={1} wash={1} h={32} />
          <Button h={36} state="hover">compact now</Button>
          <Button h={36}>compact now</Button>
        </div>
      </div>
    </div>
  );
}

/** the clip: the at-rest window's middle at twice its size, the bodies mounted again every 3 s so the motion plays */
function Clip() {
  // the motion plays once as the bodies mount; a click mounts them again (the shoot drives the clock itself, frame by
  // frame, since a recorder on a software GPU drops most of a motion's frames)
  const [k, setK] = useState(0);
  const cx = STAGE + (W - STAGE) / 2, cy = MENU + (H - MENU - BAR - 28) / 2;
  return (
    <div key={k} onClick={() => setK((v) => v + 1)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `translate(${W / 2 - cx * 2}px, ${H / 2 - cy * 2}px) scale(2)`, transformOrigin: "0 0" }}>
      <Rest />
    </div>
  );
}

function Stage() {
  return (
    <div data-body={variant} data-take={take} style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover` }}>
      {take === "work" ? <Work /> : take === "small" ? <Small /> : take === "clip" ? <Clip /> : <Rest />}
      <div data-ready data-name={BODIES[variant].name} style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Stage /></StrictMode>);
