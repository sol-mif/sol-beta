// One permanent session and its specialists (#1053, the fourth design, mine): a design page drawn only from the kit
// (kit/index.ts, so tokens.json) and the jelly itself (Body.tsx). Dev only, like kit/stage.tsx: one-lead.html is not in
// the face's build inputs. His words (taste.md, 2026-11-11): one session that never ends, with the chat box, the bar and
// the stage; what else is fixed around it; under it specialists that never end either, each managing one system and
// each drawn for its matter; other projects are set up first; all projects in one place that is never the front.
//   the jelly is who has the floor: its six colours fused, the lead; one colour, that specialist
//   fixed on the bar: yours (what waits on him), holds (what it keeps for good), running (what works alone), the day
//   a specialist's stage keeps one block for good, its instrument; the lead's stage takes them as its answers
// The numbers are a snapshot of the real thing (lead/data.json, written by /tmp/orch/lead-data.py: the open PRs, the
// screens marked by eye; the units, engines and projects read the same hour). The talk's lines are written for the page.
//   one-lead.html?v=lead|look|brand|review|runs|list|team|new|all   &open=yours
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import { Button, Card, Field, FileChip, Glass, Glyph, Halo, Meter, Pearl, Pill, Ring, Row } from "../kit";
import { black, deep, dim, ink, label, mute, on, pearl, textW, TYPE } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { Body, haloDoing } from "../Body";
import { CREATURE, type RGB } from "../creature/palette";
import data from "./lead/data.json";
import sHome from "./lead/home.jpg";
import sBuild from "./lead/build.jpg";
import sSide from "./lead/side.jpg";
import sSettings from "./lead/settings.jpg";
import sJelly from "./lead/jelly.jpg";
import sCowork from "./lead/cowork.jpg";
import sFirst from "./lead/firstrun.jpg";
import sKit from "./lead/kit.jpg";
import "../palette.css";
import "../kit/type.css";

const c = (x: RGB, a = 1) => `rgba(${x[0]},${x[1]},${x[2]},${a})`;
const q = new URLSearchParams(location.search);

// ── the specialists of sol: one system each, one of the jelly's six colours each ────────────────────────────────────
type SpecId = "look" | "brand" | "review" | "runs" | "list" | "team";
type Spec = { id: SpecId; name: string; colour: RGB; says: string; parts: string[]; yours: number };
const SPECS: Spec[] = [
  { id: "look", name: "look", colour: CREATURE.pink, says: "every screen, the kit, your words on them", parts: ["screens", "the kit", "your words", "old ui"], yours: 1 },
  { id: "brand", name: "brand", colour: CREATURE.heart, says: "the jelly, its colours, the voice, the name", parts: ["the jelly", "colour", "words", "sound"], yours: 1 },
  { id: "review", name: "review", colour: CREATURE.amber, says: "every draft, from built to your press", parts: ["drafts", "checks", "reads", "your press"], yours: 2 },
  { id: "runs", name: "runs", colour: CREATURE.orange, says: "three machines, the timers, the nights", parts: ["machines", "timers", "nights", "releases"], yours: 1 },
  { id: "list", name: "the list", colour: CREATURE.sun, says: "the issues, by area and kind", parts: ["areas", "kinds", "now"], yours: 1 },
  { id: "team", name: "team", colour: CREATURE.green, says: "Frank, Isaac, and their agents", parts: ["people", "their agents", "what waits"], yours: 1 },
];
const spec = (id: SpecId) => SPECS.find((s) => s.id === id)!;

// ── the snapshot ─────────────────────────────────────────────────────────────────────────────────────────────────────
type PR = { n: number; who: string; ready: boolean; st: "red" | "green" | "stopped" | "none"; area: string; t: string };
const PRS = data.prs as PR[];
const ST: { st: PR["st"]; name: string; colour: RGB | null }[] = [
  { st: "red", name: "red", colour: CREATURE.ember }, { st: "stopped", name: "stopped", colour: CREATURE.amber },
  { st: "none", name: "never ran", colour: null }, { st: "green", name: "green", colour: CREATURE.green },
];
const count = (st: PR["st"]) => PRS.filter((p) => p.st === st).length;
const ready = PRS.filter((p) => p.ready), franks = PRS.filter((p) => p.who === "them");
const near = [...PRS.filter((p) => p.st === "green"), ...ready.filter((p) => p.st !== "green")];
const LOOK = data.look as Record<string, { current: number; legacy: number; unsure: number }>;
const SCREENS: { id: string; img: string; word?: string }[] = [
  { id: "home", img: sHome, word: "its just shit and all text" }, { id: "build", img: sBuild, word: "ok i see the switch its ok" },
  { id: "side", img: sSide, word: "the side bar is fine" }, { id: "settings", img: sSettings },
  { id: "jelly", img: sJelly, word: "think about our kit and our jelly creature" }, { id: "cowork", img: sCowork },
  { id: "first run", img: sFirst, word: "it just looked so disgusting i didn't want to do it" }, { id: "kit", img: sKit },
];
const lookAll = Object.values(LOOK).reduce((a, x) => ({ current: a.current + x.current, legacy: a.legacy + x.legacy, unsure: a.unsure + x.unsure }), { ...(data.lookOther as { current: number; legacy: number; unsure: number }) });
const PARTS = data.parts as { current: number; legacy: number; unsure: number };
const now = (() => { const [h, m] = data.at.slice(11).split(":").map(Number); return h + m / 60; })();
const NUC = { engine: "dev-20261111 · up since 09:03", runs: ["the team's checks", "the stage watch", "the runs board", "the notify watch", "chain run751"], died: ["n11-home", "n11-one", "stage-minemerge", "mine-merge"], next: [["mine-merge", "14:17"], ["the night", "03:00"], ["the release", "09:00"]] };
const AREAS: [string, number][] = [["product", 107], ["cowork", 77], ["work", 74], ["base", 69], ["life", 13], ["marketing", 3], ["social", 1]];
const KINDS: [string, number][] = [["feature", 190], ["bug", 96], ["chore", 32], ["decision", 24]];
const BRAND = { done: ["the person", "the promise", "the enemy", "the tension and the place", "the words", "the direction", "the material", "the jelly", "the column", "the logo", "customization"], open: ["sound", "voice", "the name"] };
const SIX: [string, RGB][] = [["heart", CREATURE.heart], ["pink", CREATURE.pink], ["orange", CREATURE.orange], ["amber", CREATURE.amber], ["sun", CREATURE.sun], ["green", CREATURE.green]];
// every project under ~/computer, and when it last changed (git, the same hour); only sol is set up
const OTHERS: [string, string][] = [["masakali", "3 days"], ["rightfirst", "3 days"], ["versely", "3 days"], ["world building", "3 days"], ["boxy-backups", "3 days"], ["broker", "2 weeks"], ["cashout-labs", "2 weeks"], ["kaat", "7 weeks"], ["rise", "7 weeks"], ["wannabefund", "7 weeks"], ["r-tuned", "9 weeks"], ["jobpilot", "4 months"], ["school", "no history"]];
const YOURS: { by: SpecId; t: string; act: string }[] = [
  { by: "review", t: `${near.length} drafts are closest to your press`, act: "read" },
  { by: "review", t: "nine drafts from the night wait for your try", act: "try" },
  { by: "runs", t: `${NUC.died.length} units died last night on the NucBox`, act: "rerun" },
  { by: "look", t: "a felt word for each stop of the tour (#1048)", act: "say" },
  { by: "list", t: "now is on 37 issues; the rule is one", act: "pick" },
  { by: "brand", t: "sound, voice, the name: three headings open", act: "open" },
  { by: "team", t: `${ready.filter((p) => p.who === "them").length} of Frank's are ready for a read`, act: "read" },
];
const HOLDS = 142;   // 26 lines of his words (taste.md) and 116 kept facts (memory), the same hour

type Line = { who: "you" | SpecId | "sol"; t: string; act?: string };
const TALK: Record<"lead" | SpecId, Line[]> = {
  lead: [
    { who: "you", t: "why is review all red" },
    { who: "review", t: `${count("red")} of ${PRS.length} open drafts are red, ${count("none")} never ran, ${count("stopped")} were stopped. ${count("green")} are green and ${ready.length} are ready for a read. The flow is on your stage.` },
    { who: "you", t: "and what died last night" },
    { who: "runs", t: `Four units on the NucBox: ${NUC.died.join(", ")}. The engine there is up on dev-20261111. The day is under the flow.`, act: "rerun the four" },
  ],
  look: [{ who: "look", t: `${lookAll.current + lookAll.legacy + lookAll.unsure} screens checked by eye: ${lookAll.current} current, ${lookAll.legacy} old, ${lookAll.unsure} unsure. Settings and the first run are all unsure; the jelly's old screens wait on the notch.` }, { who: "you", t: "show me what is still old in home" }, { who: "look", t: "Eight screens of Home are old. They are lit on the wall.", act: "open the eight" }],
  brand: [{ who: "brand", t: `${BRAND.done.length} headings are decided. ${BRAND.open.length} are open: ${BRAND.open.join(", ")}. The jelly on the stage is the one in your window, not a picture of it.` }],
  review: [{ who: "review", t: `${PRS.length} open. ${count("red")} red, ${count("stopped")} stopped, ${count("none")} never ran, ${count("green")} green. ${franks.length} are Frank's, ${ready.length} of all are ready for a read.` }, { who: "you", t: "which ones can I press today" }, { who: "review", t: `${near.length} are closest: the green ones and the ready ones. They are under the flow.`, act: "read the first" }],
  runs: [{ who: "runs", t: `Five units run on the NucBox, ${NUC.died.length} died last night. Legion finished both builders. The next thing on the day is the hand in at 20:00.`, act: "rerun the four" }],
  list: [{ who: "the list" as never, t: "" }],
  team: [{ who: "team", t: `Frank holds ${franks.length} open, ${ready.filter((p) => p.who === "them").length} ready for a read. Isaac has none open. Your agent holds ${PRS.length - franks.length}.` }],
};
TALK.list = [{ who: "list", t: "342 issues are open. now is on 37 of them; the rule is one. Say the one and I take it off the rest.", act: "show the 37" }];

// ── small pieces, each the kit's ─────────────────────────────────────────────────────────────────────────────────────
const Dot = ({ colour, size = 8 }: { colour: RGB | null; size?: number }) => <i style={{ display: "block", width: size, height: size, borderRadius: size / 2, background: colour ? c(colour) : on(SHADE.on.mute), flex: "none" }} />;
const Lead = ({ children }: { children: ReactNode }) => <span style={{ display: "grid", placeItems: "center", width: 24, height: 24 }}>{children}</span>;
const Caret = ({ open }: { open: boolean }) => <Lead><span style={{ color: mute, rotate: open ? "90deg" : "0deg", transition: "rotate 160ms ease" }}>›</span></Lead>;
/** how many are yours: the pearl, the kit's mark for what has you */
const Yours = ({ n }: { n: number }) => <Pearl w={n > 9 ? 26 : 22} h={18} r={9}><span style={{ display: "grid", placeItems: "center", height: "100%", color: deep(), fontSize: T.label[0], fontWeight: 600 }}>{n}</span></Pearl>;
const Head = ({ a, b }: { a: ReactNode; b?: ReactNode }) => <div className="t-read" style={{ fontWeight: 600, marginBottom: 14 }}>{a} {b && <span style={{ color: dim, fontWeight: 400 }}>{b}</span>}</div>;

// ── the instruments: what a specialist keeps on its stage for good, each drawn for its matter ───────────────────────
/** review: every open draft as one cell, in the state its checks left it; under them the ones closest to his press */
function Review({ w, h }: { w: number; h: number }) {
  const CW = 40, CH = 20, G = 4, total = PRS.length;
  // the cells across are shared out by how many drafts each state holds, so the four columns end near the same height
  const N = Math.floor((w - 3 * 16 + 4 * G) / (CW + G)), per = ST.map((s) => Math.max(1, Math.round((count(s.st) / total) * N)));
  while (per.reduce((a, b) => a + b, 0) > N) per[per.indexOf(Math.max(...per))]--;
  const cols = ST.map((s, i) => ({ ...s, cw: Math.max(per[i] * (CW + G) - G, 76), rows: Math.ceil(count(s.st) / per[i]) }));
  const gridH = Math.max(...cols.map((x) => x.rows)) * (CH + G) + 24, fit = Math.max(0, Math.floor((h - 38 - gridH - 44) / 34));
  return (
    <div>
      <Head a={`${total} open.`} b={`${count("red")} red, ${count("green")} green. ${ready.length} ready for a read.`} />
      <div style={{ display: "flex", justifyContent: "space-between", height: gridH }}>
        {cols.map((s) => (
          <div key={s.st} style={{ width: s.cw }}>
            <div style={{ ...label, display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}><Dot colour={s.colour} size={6} />{s.name} {count(s.st)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: G }}>
              {PRS.filter((p) => p.st === s.st).map((p) => (
                <span key={p.n} title={p.t} style={{ width: CW, height: CH, display: "grid", placeItems: "center", borderRadius: CURVE.radius.chip, fontSize: T.label[0], fontVariantNumeric: "tabular-nums",
                  background: s.colour ? c(s.colour, 0.24) : on(SHADE.on.hover), color: p.ready ? ink : dim, boxShadow: p.ready ? `inset 0 0 0 1.5px ${pearl()}` : undefined }}>{p.n}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {fit > 0 && <>
        <div style={{ ...label, display: "flex", gap: 8, alignItems: "center", margin: "6px 0 6px", color: ink }}>closest to your press <Yours n={near.length} /><span style={{ color: mute }}>· in the pearl's line: ready for a read</span></div>
        <div style={{ display: "grid", gap: 2 }}>
          {near.slice(0, fit).map((p) => <Row key={p.n} w={w} h={32} lead={<Dot colour={ST.find((s) => s.st === p.st)!.colour} size={6} />} title={<><span style={{ color: mute, fontVariantNumeric: "tabular-nums" }}>#{p.n}</span>  {p.t}</>} aside={`${p.who}${p.ready ? " · ready" : ""}`} />)}
        </div>
      </>}
    </div>
  );
}

/** runs: the day as one line with what is timed on it, and the three machines with what runs, what died, what is next */
function Runs({ w, h }: { w: number; h: number }) {
  const DAY: [number, string][] = [[3, "night"], [9, "release"], [9.5, "morning"], [20, "hand in"], [21, "review"]];
  const x = (hr: number) => (hr / 24) * w, cw = (w - 24) / 3, ch = Math.min(h - 38 - 74, 96 + 12 * 28), rows = Math.max(2, Math.floor((ch - 96) / 28));
  const M: { name: string; engine: string; lines: [string, string, RGB | null][] }[] = [
    { name: "NucBox", engine: NUC.engine, lines: [...NUC.died.map((d): [string, string, RGB | null] => [d, "died", CREATURE.ember]), ...NUC.runs.map((r): [string, string, RGB | null] => [r, "runs", CREATURE.green]), ...NUC.next.map(([n, t]): [string, string, RGB | null] => [n, t, null])] },
    { name: "Legion", engine: "three check runners", lines: [["one-build", "#1057", CREATURE.green], ["one-project", "done", CREATURE.green]] },
    { name: "MacBook", engine: "your engine · up since 10:09", lines: [["this session", "runs", CREATURE.green], ["the hot face", ":1420", CREATURE.green]] },
  ];
  return (
    <div>
      <Head a={`${NUC.died.length} units died last night.`} b={`${NUC.runs.length} run on the NucBox. Next: the hand in, 20:00.`} />
      <div style={{ position: "relative", height: 60 }}>
        <div style={{ position: "absolute", left: 0, top: 26 }}><Meter w={w} h={6} value={now / 24} /></div>
        {DAY.map(([hr, name], i) => (
          <div key={name} style={{ position: "absolute", left: x(hr), top: i % 2 ? 36 : 4, ...label, color: hr > now ? dim : mute, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
            {i % 2 === 0 && name}<i style={{ display: "block", width: 1, height: 8, margin: "2px auto", background: on(SHADE.on.dim) }} />{i % 2 === 1 && name}
          </div>
        ))}
        <div style={{ position: "absolute", left: x(now), top: 14, width: 2, height: 30, marginLeft: -1, borderRadius: 1, background: pearl() }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        {M.map((m) => (
          <Card key={m.name} w={cw} h={ch} step="raised">
            <div style={{ padding: "14px 6px 6px" }}>
              <div style={{ padding: "0 12px", fontWeight: 500 }}>{m.name}</div>
              <div style={{ ...label, padding: "2px 12px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.engine}</div>
              {m.lines.slice(0, rows).map(([t, a, col]) => <Row key={t + a} w={cw - 12} h={28} lead={<Dot colour={col} size={6} />} title={t} aside={<span style={{ color: a === "died" ? c(CREATURE.ember) : undefined }}>{a}</span>} />)}
              {m.lines.length > rows && <div style={{ ...label, padding: "4px 12px" }}>{m.lines.length - rows} more</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** look: the screens themselves, each with how much of it is current, old or unsure and his last word on it; the kit live */
function Look({ w, h }: { w: number; h: number }) {
  const G = 12, tw = (w - 3 * G) / 4, ih = Math.min(tw * 0.625, (h - 38 - 96 - 2 * 74 - G) / 2);
  const total = lookAll.current + lookAll.legacy + lookAll.unsure, pt = PARTS.current + PARTS.legacy + PARTS.unsure;
  return (
    <div>
      <Head a={`${total} screens checked by eye.`} b={`${lookAll.current} current, ${lookAll.legacy} old, ${lookAll.unsure} unsure.`} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(4, ${tw}px)`, gap: G }}>
        {SCREENS.map((s) => {
          const n = LOOK[s.id], t = Math.max(1, n.current + n.legacy + n.unsure);
          return (
            <div key={s.id} style={{ height: ih + 74 }}>
              <div style={{ width: tw, height: ih, borderRadius: CURVE.radius.row, background: `${black(1)} url(${s.img}) center top / cover`, boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "8px 2px 6px" }}><span style={{ fontWeight: 500 }}>{s.id}</span><span style={{ ...label }}>{n.legacy ? `${n.legacy} old` : n.unsure ? `${n.unsure} unsure` : "current"}</span></div>
              <Meter w={tw} h={4} parts={[n.current / t, n.legacy / t, n.unsure / t]} />
              {s.word && <div style={{ ...label, color: dim, margin: "6px 2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>“{s.word}”</div>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: G }}>
        <Card w={w} h={84} step="raised">
          <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 18, padding: "0 18px" }}>
            <div style={{ width: 118, flex: "none" }}><div style={{ fontWeight: 500 }}>the kit, live</div><div style={{ ...label }}>{pt} parts · {PARTS.legacy} old</div></div>
            <Button h={32}>Run</Button>
            <Pill words={["ask", "edits", "auto"]} picked={1} h={28} />
            <div style={{ width: 40, height: 40, flex: "none" }}><Ring value={0.7} size={40} /></div>
            <div style={{ marginLeft: 8 }}><Yours n={3} /></div>
            <div style={{ flex: 1 }} />
            <div style={{ flex: "none" }}><Meter w={Math.max(60, Math.min(120, w - 500))} h={6} parts={[PARTS.current / pt, PARTS.legacy / pt, PARTS.unsure / pt]} /><div style={{ ...label, marginTop: 6 }}>current · old</div></div>
          </div>
        </Card>
      </div>
      {h - 38 - 2 * (ih + 74) - G - 96 - 40 > 4 * 32 && <>
        <div style={{ ...label, margin: "18px 0 6px" }}>your words, kept on the screen they were said about</div>
        {SCREENS.filter((x) => x.word).slice(0, Math.floor((h - 38 - 2 * (ih + 74) - G - 96 - 40) / 32)).map((x) => <Row key={x.id} w={w} h={32} lead={<Dot colour={CREATURE.pink} size={6} />} title={`“${x.word}”`} aside={x.id} />)}
      </>}
    </div>
  );
}

/** brand: the jelly itself, what it does, its six colours, and the headings: decided, or open and his */
function Brand({ w, h }: { w: number; h: number }) {
  const big = Math.min(168, h * 0.3), lw = Math.max(210, w * 0.36), rw = w - lw - 24;
  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ width: lw }}>
        <div style={{ height: big * 1.75, display: "grid", placeItems: "center" }}><Body size={big} state="settled" follow halo={haloDoing("rest")} /></div>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
          {(["rest", "working", "arriving"] as const).map((d) => <div key={d} style={{ textAlign: "center" }}><Halo size={56} doing={d} /><div style={{ ...label, marginTop: 2 }}>{d}</div></div>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 22 }}>
          {SIX.map(([n, col]) => <div key={n} style={{ textAlign: "center" }}><div style={{ margin: "0 auto", width: 22, height: 22, borderRadius: 11, background: c(col), boxShadow: `inset 0 1px 0 ${on(0.35)}` }} /><div style={{ ...label, marginTop: 6 }}>{n}</div></div>)}
        </div>
      </div>
      <div style={{ width: rw }}>
        <Head a={`${BRAND.done.length} headings decided.`} b={`${BRAND.open.length} are open.`} />
        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          {BRAND.open.map((o) => (
            <Card key={o} w={rw} h={56} step="raised">
              <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 10px 0 18px" }}>
                <Pearl w={8} h={8} r={4} /><span className="t-read" style={{ fontWeight: 600, flex: 1 }}>{o}</span><span style={{ ...label }}>open · yours</span><Button h={30} flat acts w={textW("start", T.pill[0], 500) + 30}>start</Button>
              </div>
            </Card>
          ))}
        </div>
        <div style={{ ...label, marginBottom: 8 }}>decided</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {BRAND.done.map((d) => <span key={d} style={{ ...label, color: dim, padding: "4px 10px", borderRadius: CURVE.radius.chip, background: on(SHADE.on.hover) }}>{d}</span>)}
        </div>
      </div>
    </div>
  );
}

/** the list: each area as one line as long as what is open in it, the kinds as parts of the whole, and where it drifted */
function TheList({ w }: { w: number; h: number }) {
  const max = AREAS[0][1], all = KINDS.reduce((a, [, n]) => a + n, 0), bw = w - 96 - 44;
  return (
    <div>
      <Head a="now is on 37 issues." b="The rule is one." />
      <Card w={w} h={64} step="raised">
        <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 18px" }}>
          <Yours n={37} /><span style={{ flex: 1 }}>Say the one being worked and it comes off the other 36.</span><Button h={30} flat acts w={textW("show the 37", T.pill[0], 500) + 30}>show the 37</Button>
        </div>
      </Card>
      <div style={{ ...label, margin: "22px 0 10px" }}>open, by area</div>
      <div style={{ display: "grid", gap: 10 }}>
        {AREAS.map(([a, n]) => <div key={a} style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 84, color: dim }}>{a}</span><Meter w={Math.max(8, (bw * n) / max)} h={8} value={1} /><span style={{ ...label, fontVariantNumeric: "tabular-nums" }}>{n}</span></div>)}
      </div>
      <div style={{ ...label, margin: "24px 0 10px" }}>open, by kind</div>
      <Meter w={w} h={10} parts={KINDS.map(([, n]) => n / all)} />
      <div style={{ display: "flex", marginTop: 8 }}>{KINDS.map(([k, n]) => <span key={k} style={{ ...label, width: `${(n / all) * 100}%`, minWidth: 64, color: dim }}>{k} {n}</span>)}</div>
    </div>
  );
}

/** team: each person with their agent, what they hold open, and what of it waits on a read */
function Team({ w, h }: { w: number; h: number }) {
  const cw = (w - 24) / 3, mine = PRS.filter((p) => p.who === "me");
  const P: { name: string; does: string; open: PR[]; line: string }[] = [
    { name: "Marco", does: "product and design", open: mine, line: `${mine.filter((p) => p.st === "red").length} red · ${mine.filter((p) => p.st === "green").length} green` },
    { name: "Frank", does: "engineering", open: franks, line: `${franks.filter((p) => p.ready).length} ready` },
    { name: "Isaac", does: "marketing, social", open: [], line: "nothing open" },
  ];
  const rows = Math.max(1, Math.floor((h - 38 - 150) / 30));
  return (
    <div>
      <Head a={`${franks.filter((p) => p.ready).length} of Frank's wait on a read.`} b={`Your agent holds ${mine.length} drafts.`} />
      <div style={{ display: "flex", gap: 12 }}>
        {P.map((p) => (
          <Card key={p.name} w={cw} h={h - 38} step="raised">
            <div style={{ padding: "16px 6px 6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px 12px" }}>
                <div style={{ width: 44, height: 44, flex: "none" }}><Ring value={p.open.length ? p.open.filter((x) => x.st === "green" || x.ready).length / p.open.length : 0} size={44} /></div>
                <div style={{ minWidth: 0, marginLeft: 6 }}><div className="t-read" style={{ fontWeight: 600 }}>{p.name}</div><div style={{ ...label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.does}</div></div>
              </div>
              <div style={{ padding: "0 12px 8px", color: dim, whiteSpace: "nowrap" }}>{p.open.length ? `${p.open.length} open · ${p.line}` : p.line}</div>
              {[...p.open].sort((a, b) => +b.ready - +a.ready).slice(0, rows).map((x) => <Row key={x.n} w={cw - 12} h={28} lead={<Dot colour={ST.find((s) => s.st === x.st)!.colour} size={6} />} title={x.t} aside={x.ready ? "ready" : `#${x.n}`} />)}
              {p.open.length > rows && <div style={{ ...label, padding: "4px 12px" }}>{p.open.length - rows} more</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
const INSTRUMENT: Record<SpecId, (p: { w: number; h: number }) => ReactNode> = { look: Look, brand: Brand, review: Review, runs: Runs, list: TheList, team: Team };

/** a block on the stage: the specialist's colour, its name, the parts of its system, and the instrument inside */
function Block({ id, w, h, kept }: { id: SpecId; w: number; h: number; kept?: boolean }) {
  const s = spec(id), I = INSTRUMENT[id];
  return (
    <Card w={w} h={h}>
      <div style={{ height: 48, display: "flex", alignItems: "center", gap: 10, padding: "0 14px 0 20px" }}>
        <Dot colour={s.colour} /><span style={{ fontWeight: 500 }}>{s.name}</span><span style={{ ...label }}>{kept ? "always here" : "from " + s.name}</span>
        <div style={{ flex: 1 }} />
        {kept && w > 520 ? <Pill words={s.parts} picked={0} h={26} /> : <Glyph name="focus" />}
      </div>
      <div style={{ padding: "4px 20px 0", height: h - 52, overflow: "hidden" }}><I w={w - 40} h={h - 72} /></div>
    </Card>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────────
type View = { k: "lead" } | { k: "spec"; id: SpecId } | { k: "new" } | { k: "all" };
const start = (): View => { const v = q.get("v") ?? "lead"; return v === "new" || v === "all" || v === "lead" ? { k: v } : { k: "spec", id: v as SpecId }; };
const SIDE = 216, PAD = 16;

function Page() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => { const f = () => setSize({ w: innerWidth, h: innerHeight }); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  const [view, setView] = useState<View>(start);
  const [open, setOpen] = useState(q.get("open") === "yours");
  const at = view.k === "spec" ? spec(view.id) : null, rw = SIDE - 16;
  const mw = size.w - SIDE - 2 * PAD, tw = Math.round(Math.max(320, Math.min(400, mw * 0.36))), sw = mw - tw - PAD, sh = size.h - 2 * PAD;
  const go = (v: View) => { setOpen(false); setView(v); };

  const side: ReactNode = (
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDE }}>
      <Glass r={0} step="side" edge={0} />
      <div style={{ position: "absolute", inset: 0, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        <Row w={rw} h={32} lead={<Glyph name="note" />} title="new" aside="⌘N" />
        <Row w={rw} h={32} lead={<Glyph name="web" />} title="everything" aside="⌘K" picked={view.k === "all"} onClick={() => go({ k: "all" })} />
        <div style={{ ...label, padding: "14px 12px 6px" }}>projects</div>
        <Row w={rw} h={32} lead={<Caret open />} title={<span style={{ color: view.k === "lead" ? ink : undefined }}>sol</span>} picked={false} aside={view.k === "lead" ? undefined : <Yours n={YOURS.length} />} onClick={() => go({ k: "lead" })} />
        <div style={{ paddingLeft: 14, display: "grid", gap: 2 }}>
          {SPECS.map((s) => <Row key={s.id} w={rw - 14} h={32} lead={<Dot colour={s.colour} />} title={s.name} picked={at?.id === s.id} aside={at?.id === s.id ? undefined : s.yours ? <Yours n={s.yours} /> : undefined} onClick={() => go({ k: "spec", id: s.id })} />)}
        </div>
        <Row w={rw} h={32} lead={<Caret open={false} />} title="school" picked={view.k === "new"} aside={view.k === "new" ? undefined : "set up"} onClick={() => go({ k: "new" })} />
        {OTHERS.slice(0, 4).map(([n]) => <Row key={n} w={rw} h={32} lead={<Caret open={false} />} title={n} />)}
        <Row w={rw} h={32} lead={<Lead><span style={{ color: mute }}>·</span></Lead>} title={<span style={{ color: mute }}>{OTHERS.length - 5} more</span>} onClick={() => go({ k: "all" })} />
        <div style={{ flex: 1 }} />
        <Row w={rw} h={32} lead={<Glyph name="hold" />} title="settings" />
      </div>
    </div>
  );

  // what is fixed on the bar: yours, holds, running, the day
  const chip = (word: string, lead: ReactNode, onClick?: () => void, up?: boolean) => {
    const w = textW(word, T.pill[0], 500) + 46;
    return <Button key={word} h={28} w={w} flat up={up} onClick={onClick}><span style={{ display: "flex", alignItems: "center", gap: 7 }}>{lead}{word}</span></Button>;
  };
  const fixed = (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {chip("yours", <Yours n={at ? at.yours : YOURS.length} />, () => setOpen((v) => !v), open)}
      {chip(`holds ${HOLDS}`, <Dot colour={null} size={6} />)}
      {chip(`running ${NUC.runs.length + 2}`, <Dot colour={CREATURE.green} size={6} />)}
    </div>
  );
  const yours = (at ? YOURS.filter((y) => y.by === at.id) : YOURS);
  const pop = open && (
    <div style={{ position: "absolute", left: 0, bottom: 44 + 8 + 28 + 10, zIndex: 3 }}>
      <Card w={tw} step="pop">
        <div style={{ padding: "14px 6px 8px" }}>
          <div style={{ padding: "0 12px 8px", display: "flex", gap: 8, alignItems: "baseline" }}><span style={{ fontWeight: 500 }}>yours</span><span style={{ ...label }}>what waits on you, from every specialist</span></div>
          {yours.map((y) => <Row key={y.t} w={tw - 12} h={34} lead={<Dot colour={spec(y.by).colour} />} title={y.t} aside={<span style={{ color: ink }}>{y.act}</span>} />)}
        </div>
      </Card>
    </div>
  );

  const lines = TALK[at ? at.id : "lead"];
  const talk: ReactNode = (
    <div style={{ position: "absolute", left: SIDE + PAD, top: PAD, width: tw, bottom: PAD, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 84, marginLeft: -14 }} role="button" onClick={() => go({ k: "all" })} title="every project">
        <div style={{ width: 84, height: 84, display: "grid", placeItems: "center", flex: "none" }}><Body size={48} state="settled" follow you={at ? at.colour : null} halo={haloDoing(at ? "working" : "rest")} /></div>
        <div><div className="t-read" style={{ fontWeight: 600 }}>{at ? at.name : "sol"}</div><div style={{ color: dim }}>{at ? at.says : "one session, kept for good · six specialists"}</div></div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, padding: "0 4px 18px" }}>
        {lines.map((l, i) => l.who === "you"
          ? <div key={i} style={{ alignSelf: "flex-end", maxWidth: "86%", position: "relative", padding: "8px 14px", isolation: "isolate" }}><Glass r={CURVE.radius.field} step="raised" />{l.t}</div>
          : <div key={i}>
              <div style={{ ...label, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Dot colour={l.who === "sol" ? null : spec(l.who).colour} size={6} />{l.who === "sol" ? "sol" : spec(l.who).name}</div>
              <div style={{ color: on(SHADE.on.ink) }}>{l.t}</div>
              {l.act && <div style={{ marginTop: 8 }}><Button h={28} flat acts w={textW(l.act, T.pill[0], 500) + 30}>{l.act}</Button></div>}
            </div>)}
      </div>
      <div style={{ position: "relative" }}>
        {pop}
        {fixed}
        <Field w={tw}><span style={{ color: on(SHADE.on.mute) }}>{at ? `say it to ${at.name}` : "say what you want"}</span></Field>
      </div>
    </div>
  );

  const sx = SIDE + PAD + tw + PAD;
  const stage: ReactNode = at
    ? <div style={{ position: "absolute", left: sx, top: PAD }}><Block id={at.id} w={sw} h={sh} kept /></div>
    : <div style={{ position: "absolute", left: sx, top: PAD, display: "grid", gap: 12 }}>
        <Block id="review" w={sw} h={Math.round((sh - 12) * 0.45)} />
        <Block id="runs" w={sw} h={sh - 12 - Math.round((sh - 12) * 0.45)} />
      </div>;

  // a project that is not set up: what is in it, and the specialists it would grow, each kept or cut by touching it
  const [keep, setKeep] = useState<Record<string, boolean>>({ classes: true, prep: true, exams: true });
  const GROW: { id: string; name: string; colour: RGB; from: string; rows: [string, string][] }[] = [
    { id: "classes", name: "classes", colour: CREATURE.pink, from: "four courses in the project's note", rows: [["LA245 business law", "Tue Thu 9:30"], ["DS480 data, society, ai ethics", "Tue Thu 12:30"], ["FE457 credit analysis", ""], ["IS223 information systems", ""]] },
    { id: "prep", name: "prep", colour: CREATURE.amber, from: "two notes in prep", rows: [["the two-week plan", "Nov 1"], ["thursday", "Oct 8"]] },
    { id: "exams", name: "exams", colour: CREATURE.green, from: "nothing here yet: Blackboard has the dates", rows: [] },
  ];
  const kept = GROW.filter((g) => keep[g.id]).length, gw = (mw - 24) / 3;
  const fresh: ReactNode = (
    <div style={{ position: "absolute", left: SIDE + PAD, top: PAD, width: mw, bottom: PAD, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 150, marginLeft: -20 }}>
        <div style={{ width: 150, height: 150, display: "grid", placeItems: "center", flex: "none" }}><Body size={86} state="apart" follow halo={haloDoing("arriving")} /></div>
        <div><div className="t-display">School is not set up.</div><div className="t-read" style={{ color: dim, marginTop: 4 }}>I read the folder. Three specialists would hold it; keep the ones you want.</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 14px" }}>
        <span style={{ ...label, width: 84 }}>what is here</span>
        <div style={{ display: "flex", gap: 4, margin: "0 14px" }}><FileChip ext="md" name="school" /><FileChip ext="md" name="plan" /><FileChip ext="md" name="thursday" /></div>
        <span style={{ ...label, color: dim }}>three notes · four courses named · no history</span>
      </div>
      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {GROW.map((g) => (
          <div key={g.id} style={{ opacity: keep[g.id] ? 1 : 0.42, transition: "opacity 180ms ease" }}>
            <Card w={gw} h={Math.min(330, size.h - 2 * PAD - 150 - 80 - 76)}>
              <div style={{ padding: "16px 8px 8px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}><Dot colour={g.colour} /><span className="t-read" style={{ fontWeight: 600 }}>{g.name}</span></div>
                <div style={{ ...label, padding: "2px 12px 12px" }}>{g.from}</div>
                {g.rows.map(([t, a]) => <Row key={t} w={gw - 16} h={30} title={t} aside={a} />)}
                {!g.rows.length && <div style={{ padding: "0 12px" }}><Button h={30} flat acts w={textW("let it look", T.pill[0], 500) + 30}>let it look</Button></div>}
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 4px 4px" }}><Pill words={["keep", "cut"]} picked={keep[g.id] ? 0 : 1} h={28} onPick={(i) => setKeep((k) => ({ ...k, [g.id]: i === 0 }))} /></div>
              </div>
            </Card>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        <div style={{ flex: 1 }}><Field w={mw - 190}><span style={{ color: on(SHADE.on.mute) }}>or say what school is, in your words</span></Field></div>
        <Button h={44} w={178} acts>{kept === 3 ? "grow these three" : kept ? `grow ${kept === 1 ? "this one" : "these two"}` : "start with none"}</Button>
      </div>
    </div>
  );

  // every project: one line from the manager, the one that needs him first, the rest by when they last moved
  const week = OTHERS.filter(([, t]) => t.includes("day")), quiet = OTHERS.filter(([, t]) => !t.includes("day"));
  const all: ReactNode = (
    <div style={{ position: "absolute", left: SIDE + PAD, top: PAD, width: mw, bottom: PAD, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 150, marginLeft: -20 }}>
        <div style={{ width: 150, height: 150, display: "grid", placeItems: "center", flex: "none" }}><Body size={86} state="settled" follow halo={haloDoing("rest")} /></div>
        <div><div className="t-display">Sol needs you in {YOURS.length} places.</div><div className="t-read" style={{ color: dim, marginTop: 4 }}>{week.length} other projects moved this week. {OTHERS.length} are not set up.</div></div>
      </div>
      <Row w={mw} h={52} lead={<Yours n={YOURS.length} />} title={<span style={{ color: ink, fontWeight: 500 }}>sol</span>} note={`${count("red")} drafts red · ${NUC.died.length} units died last night · now on 37 issues`} aside={<Button h={30} flat acts w={textW("open review", T.pill[0], 500) + 30} onClick={() => go({ k: "spec", id: "review" })}>open review</Button>} onClick={() => go({ k: "lead" })} />
      <div style={{ ...label, margin: "18px 12px 6px" }}>moved this week · not set up</div>
      {week.map(([n, t]) => <Row key={n} w={mw} h={40} lead={<Dot colour={null} size={6} />} title={n} note={`last change ${t} ago`} aside={<Button h={28} flat w={textW("set up", T.pill[0], 500) + 30}>set up</Button>} />)}
      <div style={{ ...label, margin: "18px 12px 8px" }}>quiet</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px" }}>
        {quiet.map(([n, t]) => <span key={n} role="button" onClick={n === "school" ? () => go({ k: "new" }) : undefined} style={{ padding: "5px 12px", borderRadius: CURVE.radius.chip, background: on(SHADE.on.hover), color: dim }}>{n} <span style={{ ...label }}>{t}</span></span>)}
      </div>
      <div style={{ flex: 1 }} />
      <Field w={mw}><span style={{ color: on(SHADE.on.mute) }}>ask across every project</span></Field>
    </div>
  );

  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover` }}>
      <div style={{ position: "absolute", inset: 0, background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      {side}
      {view.k === "new" ? fresh : view.k === "all" ? all : <>{talk}{stage}</>}
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
