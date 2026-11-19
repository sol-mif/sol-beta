// The ground stage (#1183, the board 11-14, walk 1): the window lying on the kit's Ground, with the few things that sit
// on it in every mode, drawn from the kit (index.ts), so from tokens.json only: two blocks, the sidebar, the chat bar,
// the jelly at rest. The one thing it varies is the ground's take. Dev only, like kit.html: ground.html is not in the
// face's build inputs; sol/design/system/ground.mjs builds it with them and shoots it on the NucBox.
//   ground.html                              glass, the default
//   ground.html?take=mist|cream|dusk   a take of palette.ground; glass, the window as it ships today
//   ground.html?mode=build|home        the things of that mode on the ground
//   ground.html?desk=plain             today's glass over a flat grey desk instead of the wallpaper
// On a light paper the blocks are frosted pearl and their words deep (the kit's Glass with a pearl fill); the kit's light skin
// for every primitive comes with this walk once a take is picked.
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { Button, Card, Field, Glass, Halo, Pill, Row } from "./index";
import { GROUND } from "./tokens";
import { Ground, groundIsLight, type GroundTake } from "./Ground";
import { deep, dim, ink, label, on, pearl, TYPE } from "./paint";
import { CURVE, SHADE } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

const q = new URLSearchParams(location.search);
const asked = q.get("take"), take: GroundTake | "glass" = asked === "glass" ? "glass" : asked && asked in GROUND.takes ? (asked as GroundTake) : "glass";
const plain = q.get("desk") === "plain", mode = q.get("mode") === "home" ? "home" : "build", light = take !== "glass" && groundIsLight(take);
const W = 1280, SIDE = 232, BAR = 56;
const word = light ? deep(0.88) : ink, quiet = light ? deep(0.5) : dim;

/** a block: the kit's Card on the dark; on pearl the kit's Glass, frosted pearl */
function Block({ w, h, x, y, children }: { w: number; h: number; x: number; y: number; children: ReactNode }) {
  const at = { position: "absolute" as const, left: x, top: y };
  return light
    ? <Glass w={w} h={h} r={CURVE.radius.card} fill={pearl(0.62)} edge={0.5} blur={24} style={at}>{children}</Glass>
    : <Card w={w} h={h} step={take === "glass" ? "card" : "box"} style={at}>{children}</Card>;
}
const Title = ({ children }: { children: ReactNode }) => <div className="t-title" style={{ color: word, fontWeight: 500, padding: "14px 16px 6px" }}>{children}</div>;
const Line = ({ w, title, note, picked }: { w: number; title: string; note: string; picked?: boolean }) => light && !picked
  ? <div style={{ display: "flex", justifyContent: "space-between", width: w - 32, padding: "8px 16px", color: word }}><span>{title}</span><span style={{ color: quiet }}>{note}</span></div>
  : <Row w={w} title={title} note={note} picked={picked} />;

function Build() {
  return (
    <>
      <Block w={460} h={220} x={SIDE + 40} y={64}>
        <Title>the release notes</Title>
        <Line w={460} title="read the merged PRs" note="done" />
        <Line w={460} title="write the three lines" note="2m" picked />
        <Line w={460} title="post in #builds" note="waits" />
      </Block>
      <Block w={340} h={220} x={SIDE + 540} y={64}>
        <Title>what changed</Title>
        <div className="t-body" style={{ color: quiet, padding: "0 16px", lineHeight: 1.5 }}>the window lies on the jelly's own colours, one soft mass, grained like print.</div>
      </Block>
    </>
  );
}
function Home() {
  const folders: [string, string][] = [["school", "an exam friday"], ["jobs", "two to answer"], ["sol", "the board, 11-14"]];
  return <>{folders.map(([name, says], i) => (
    <Block key={name} w={280} h={160} x={SIDE + 40 + i * 310} y={84}><Title>{name}</Title><div className="t-body" style={{ color: quiet, padding: "0 16px" }}>{says}</div></Block>
  ))}</>;
}

function Stage() {
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: plain ? "#6b6b6b" : `url(${desk}) center/cover` }}>
      {take === "glass"
        ? <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
        : <Ground take={take} />}
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${light ? deep(0.12) : on(SHADE.on.edge)}` }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDE, background: light ? pearl(0.35) : "var(--side)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRight: `1px solid ${light ? deep(0.08) : on(SHADE.on.line)}` }}>
        <div style={{ ...label, color: quiet, padding: "52px 20px 8px" }}>{mode}</div>
        {["today", "the release", "the board"].map((s, i) => light && i !== 1
          ? <div key={s} style={{ color: word, padding: "8px 20px" }}>{s}</div>
          : <Row key={s} w={SIDE} title={s} picked={i === 1} />)}
      </div>
      {mode === "home" ? <Home /> : <Build />}
      <div data-bar style={{ position: "absolute", left: SIDE + 40, right: 40, bottom: 28, height: BAR, display: "flex", alignItems: "center", gap: 10 }}>
        <Halo size={40} doing="rest" />
        {light
          ? <Glass w={W - SIDE - 80 - 40 - 10 - 250 - 10 - 44 - 10} h={44} r={CURVE.radius.field} fill={pearl(0.7)} edge={0.4} blur={24}><span className="t-body" style={{ color: quiet, paddingLeft: 14, lineHeight: "44px" }}>ask, or drop a file</span></Glass>
          : <Field w={W - SIDE - 80 - 40 - 10 - 250 - 10 - 44 - 10} h={44}><span className="t-body" style={{ color: dim, paddingLeft: 14 }}>ask, or drop a file</span></Field>}
        <Pill words={["ask", "edits", "auto", "bypass"]} picked={2} h={32} />
        <Button w={44} h={44} form="holds">↑</Button>
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Stage /></StrictMode>);
