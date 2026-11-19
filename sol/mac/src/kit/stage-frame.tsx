// The frame stage (#766, the board 11-14, walk 2): the block as a card, drawn by the kit's Block, on the ground a person
// picks (glass, the default, or a take of palette.ground). Dev only, like ground.html: sol/design/system/frame.mjs builds
// and shoots it on the NucBox.
//   frame.html?scene=states          the eight states, one block each
//   frame.html?scene=stack           a stack of sheets, and Home's folders as the same card
//   frame.html?scene=build           the Build window: two blocks, the side, the bar
//   frame.html?scene=takes           the three lips: tab, band, plain
//   frame.html?take=glass|cream|mist|dusk
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { Block, BLOCK_STATES, type BlockState, type BlockTake } from "./Block";
import { Button, Field, Glass, Halo, Pill, Row } from "./index";
import { Ground, groundIsLight, type GroundTake } from "./Ground";
import { deep, dim, ink, label, mute, on, pearl, TYPE } from "./paint";
import { CURVE, GROUND, LOOKS, SHADE, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

const q = new URLSearchParams(location.search);
const asked = q.get("take"), take: GroundTake | "glass" = asked && asked in GROUND.takes ? (asked as GroundTake) : "glass";
const scene = q.get("scene") ?? "states";
const light = take !== "glass" && groundIsLight(take);
const W = 1280, SIDE = 232, BAR = 56;
const word = light ? deep(0.88) : ink, quiet = light ? deep(0.5) : dim, faint = light ? deep(0.34) : mute;

const Line = ({ title, note }: { title: string; note?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 16px", fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}><span style={{ color: word }}>{title}</span><span style={{ color: quiet }}>{note}</span></div>
);
const Para = ({ children }: { children: ReactNode }) => <div style={{ padding: "12px 16px 0", fontSize: T.body[0], lineHeight: `${T.body[1] + 1}px`, color: quiet }}>{children}</div>;
const Under = ({ children }: { children: ReactNode }) => <div style={{ ...label, color: faint, marginTop: 10 }}>{children}</div>;

const TITLES: Record<BlockState, string> = { resting: "the release notes", working: "the release notes", waiting: "post in #builds", done: "the three lines", pinned: "the board", broken: "what changed", stale: "the runs map", carried: "the release notes" };

function States() {
  return (
    <div style={{ position: "absolute", left: 64, top: 64, display: "grid", gridTemplateColumns: "repeat(4, 268px)", gap: "40px 28px" }}>
      {BLOCK_STATES.map((st) => (
        <div key={st}>
          <Block w={268} h={164} title={TITLES[st]} state={st} light={light}>
            <Line title="read the merged PRs" note="done" />
            <Line title="write the three lines" note="2m" />
            <Line title="post in #builds" note={st === "waiting" ? "waits" : ""} />
          </Block>
          <Under>{st}</Under>
        </div>
      ))}
    </div>
  );
}
function Stack() {
  const folders: [string, string][] = [["school", "an exam friday"], ["jobs", "two to answer"], ["sol", "the board, 11-14"]];
  return (
    <>
      <div style={{ position: "absolute", left: 64, top: 84 }}>
        <Block w={320} h={190} title="the board" behind={2} light={light}><Para>three versions kept; the last one is on top.</Para></Block>
        <Under>a stack: the versions of one block</Under>
      </div>
      <div style={{ position: "absolute", left: 440, top: 84, display: "flex", gap: 24 }}>
        {folders.map(([name, says]) => <Block key={name} w={236} h={150} title={name} light={light}><Para>{says}</Para></Block>)}
      </div>
      <div style={{ position: "absolute", left: 440, top: 244, ...label, color: faint }}>Home's folders: the same card holding things</div>
      <div style={{ position: "absolute", left: 64, top: 360, display: "flex", alignItems: "flex-start" }}>
        <Block w={300} h={170} title="what changed" light={light}><Para>the window lies on the ground; every block is a card on it.</Para></Block>
        <Block w={300} h={170} title="the release notes" state="carried" light={light} style={{ marginLeft: -60, marginTop: 30 }}><Line title="read the merged PRs" note="done" /><Line title="write the three lines" note="2m" /></Block>
      </div>
      <div style={{ position: "absolute", left: 64, top: 560, ...label, color: faint }}>carried: lifted over the others, still solid</div>
    </>
  );
}
function Takes() {
  const takes = Object.keys(LOOKS.block.takes) as BlockTake[];
  return (
    <div style={{ position: "absolute", left: 64, top: 84, display: "flex", gap: 36 }}>
      {takes.map((t) => (
        <div key={t}>
          <Block w={340} h={200} title="the release notes" take={t} light={light}>
            <Line title="read the merged PRs" note="done" />
            <Line title="write the three lines" note="2m" />
            <Line title="post in #builds" note="waits" />
          </Block>
          <Under>{LOOKS.block.takes[t].take} · {LOOKS.block.takes[t].name}</Under>
        </div>
      ))}
    </div>
  );
}
function Build() {
  return (
    <>
      <div style={{ position: "absolute", left: SIDE + 40, top: 64 }}>
        <Block w={460} h={220} title="the release notes" state="working" light={light}>
          <Line title="read the merged PRs" note="done" />
          <Line title="write the three lines" note="2m" />
          <Line title="post in #builds" note="waits" />
        </Block>
      </div>
      <div style={{ position: "absolute", left: SIDE + 540, top: 64 }}>
        <Block w={340} h={220} title="what changed" state="waiting" light={light}><Para>the window lies on the ground; every block is a card on it, one solid thing with a lip and a shadow.</Para></Block>
      </div>
    </>
  );
}

function Stage() {
  const sideBg = light ? pearl(0.35) : "var(--side)";
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover` }}>
      {take === "glass"
        ? <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
        : <Ground take={take} />}
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${light ? deep(0.12) : on(SHADE.on.edge)}` }} />
      {scene === "build" && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDE, background: sideBg, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRight: `1px solid ${light ? deep(0.08) : on(SHADE.on.line)}` }}>
            <div style={{ ...label, color: quiet, padding: "52px 20px 8px" }}>build</div>
            {["today", "the release", "the board"].map((s, i) => light && i !== 1 ? <div key={s} style={{ color: word, padding: "8px 20px" }}>{s}</div> : <Row key={s} w={SIDE} title={s} picked={i === 1} />)}
          </div>
          <div style={{ position: "absolute", left: SIDE + 40, right: 40, bottom: 28, height: BAR, display: "flex", alignItems: "center", gap: 10 }}>
            <Halo size={40} doing="rest" />
            {light
              ? <Glass w={W - SIDE - 80 - 40 - 10 - 250 - 10 - 44 - 10} h={44} r={CURVE.radius.field} fill={pearl(0.7)} edge={0.4} blur={24}><span style={{ color: quiet, paddingLeft: 14, lineHeight: "44px" }}>ask, or drop a file</span></Glass>
              : <Field w={W - SIDE - 80 - 40 - 10 - 250 - 10 - 44 - 10} h={44}><span style={{ color: dim, paddingLeft: 14 }}>ask, or drop a file</span></Field>}
            <Pill words={["ask", "edits", "auto", "bypass"]} picked={2} h={32} />
            <Button w={44} h={44} form="holds">↑</Button>
          </div>
        </>
      )}
      {scene === "states" ? <States /> : scene === "stack" ? <Stack /> : scene === "takes" ? <Takes /> : <Build />}
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Stage /></StrictMode>);
