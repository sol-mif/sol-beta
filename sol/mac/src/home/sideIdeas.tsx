// Build's sidebar, three whole ideas (mine, 2026-11-11): a design page drawn only from the kit (kit/index.ts, so
// tokens.json) and the jelly itself (Body.tsx). Dev only, like kit/stage.tsx: side-ideas.html is not in the face's build
// inputs. His words (taste.md, 2026-11-11): "just different colored dots, words that are thin, and some shittly made svg
// icons"; "its not just the folder its every aspect of the sidebar, you think too small". So each idea is the whole
// sidebar: the top, what needs him, pinned, active, folders, helpers, artifacts (the peek on hover, everything made on a
// click), the quick edit, the foot. No dot, no drawn icon: a state is said by weight, by glass, or by the thing made.
//   read   what matters is bigger and bolder; a session that needs him is a card with its question and the answer
//   hold   everything is glass he could pick up: a folder is a tray, a lead holds its helpers, running is goo on the edge
//   made   the sidebar shows what was made: a session wears its last artifact, what is on stage sits on top
// The session names are his own (the sidebar, this morning); the asks, the doing lines and the artifacts are written
// for the page.   side-ideas.html?v=all|read|hold|made
import { StrictMode, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import { Button, Card, Field, FileMark, Glass, Meter, Pearl, Pill, Row } from "../kit";
import { black, deep, dim, ink, mute, on, TYPE } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { Body, haloDoing } from "../Body";
import "../palette.css";
import "../kit/type.css";
import type { Metas } from "./meta";

// A dev page of design ideas (side-ideas.html), not a part of the shipped face: its sessions and artifacts are made-up
// data, so these metas say what each piece of the page draws, not what the product does.
export const meta = {
  Box: {
    job: "a piece of glass that grows with what it holds: the tray, card and raised surface every idea is built from",
    flow: "pickup",
    states: ["glass", "raised", "box"],
    keys: [
      { press: "point at it", does: "none of its own; the foot's tray and the folder trays pass a pointer or click through to the peek" },
    ],
    listens: ["its props (radius, step, surface, padding)", "onPointerEnter, onPointerLeave and onClick passed by its parent"],
  },
  Head: {
    job: "a section's small name and its count, above its rows (active, pinned, hidden)",
    flow: "pickup",
    states: ["with a count", "name only"],
    keys: [],
    listens: ["its props (name, count)"],
  },
  Name: {
    job: "a title's words in a given weight and colour: the one place a session, folder or artifact name is set",
    flow: "pickup",
    states: ["strong", "plain", "quiet"],
    keys: [],
    listens: ["its props (words, weight, colour)"],
  },
  Doing: {
    job: "the line of what a running session does now, in code type and dim",
    flow: "know",
    states: ["a line"],
    keys: [],
    listens: ["its props (the line)"],
  },
  Marks: {
    job: "a small overlapping stack of file marks: what a folder, a helper group or the stage has made",
    flow: "know",
    states: ["one mark", "a stack"],
    keys: [],
    listens: ["its props (file kinds, height)"],
  },
  Ask: {
    job: "the session that needs the person: its question and the two answers, drawn three ways (a lit card, a pearl, the thing made)",
    flow: "answer",
    states: ["read: a card", "hold: the pearl", "made: the thing, large"],
    keys: [
      { press: "click the first answer (post it)", does: "none here: the buttons are drawn, not wired", goal: "answer" },
      { press: "click the second answer (hold)", does: "none here: drawn only", goal: "answer" },
    ],
    listens: ["its direction prop", "the page's made-up NEEDS session"],
  },
  Kids: {
    job: "the helpers under a lead session: words in a line (read, made) or rows inside the lead's glass (hold)",
    flow: "know",
    states: ["one helper", "several, some working", "several, all done"],
    keys: [],
    listens: ["its props (the helpers, direction)"],
  },
  Line: {
    job: "one session row in a direction: its mark (made), its second line and goo when active, its helpers",
    flow: "pickup",
    states: ["quiet", "running", "unread", "recent with its age", "picked", "with helpers"],
    keys: [
      { press: "click it", does: "none here: a drawn row, not wired", goal: "pickup" },
    ],
    listens: ["its props (session, direction, width, picked)"],
  },
  IdeaTop: {
    job: "the sidebar's top: new session and find (hold), the search field (read), or the shelf of what is on stage plus the field (made)",
    flow: "say",
    states: ["read: field", "hold: two buttons", "made: the stage shelf and field"],
    keys: [
      { press: "click the made count", does: "opens everything made, through the page's onEdit prop", goal: "know", opens: "Everything" },
    ],
    listens: ["its direction prop", "onEdit from IdeaSide"],
  },
  Sections: {
    job: "the sidebar's body: the ask, active sessions, pinned, the sol folder, then the other folders, drawn in the chosen direction",
    flow: "pickup",
    states: ["read: plain headed lists", "hold: trays of glass", "made: folders wearing their marks"],
    keys: [],
    listens: ["its direction prop", "the page's made-up sessions and folders"],
  },
  Foot: {
    job: "the sidebar's foot: the artifacts row or tray, then projects, edit and settings",
    flow: "pickup",
    states: ["read: a row", "hold: a tray of marks", "made: no artifacts row", "lit"],
    keys: [
      { press: "point at artifacts", does: "peeks at what is on stage now", goal: "know", faster: true },
      { press: "click artifacts", does: "opens everything made", goal: "know", opens: "Everything" },
      { press: "click edit", does: "flips the sidebar to its quick edit", opens: "Edit" },
    ],
    listens: ["onPeek, onAll and onEdit from IdeaSide", "its lit prop"],
  },
  IdeaArtRow: {
    job: "one artifact as a row: its mark, name, where it was made and when; wide, how often it was used and whether it feeds",
    flow: "know",
    states: ["narrow", "being made", "wide, feeds", "wide, kept", "wide, never used"],
    keys: [],
    listens: ["its props (artifact, width, wide)"],
  },
  Peek: {
    job: "the card that opens when the pointer is over the foot: what is on stage now across sessions, and a button for everything made",
    flow: "know",
    states: ["open"],
    keys: [
      { press: "click everything made", does: "opens the whole list", goal: "know", opens: "Everything" },
    ],
    listens: ["onAll from IdeaSide", "the page's made-up artifacts on stage"],
  },
  Everything: {
    job: "everything made and what feeds the AI at the start of a session: the share it uses, a sort, a find field and the artifacts, as rows or a grid",
    flow: "know",
    states: ["read: rows", "hold: two-column grid", "made: four-column grid"],
    keys: [
      { press: "press an artifact", does: "says it opens on the stage; not wired here", goal: "pickup" },
    ],
    listens: ["its direction prop", "the page's made-up artifacts"],
  },
  Edit: {
    job: "the quick edit of the sidebar: folders to reorder, a session dragged onto a folder, rename, hide, new folder, hidden folders",
    flow: "mine",
    states: ["a drag in flight"],
    keys: [
      { press: "drag a folder", does: "orders it; drawn as a still, not wired", goal: "mine" },
      { press: "drag a session onto a folder", does: "files it there; drawn as a still", goal: "mine" },
      { press: "click done", does: "none here: the button is drawn" },
    ],
    listens: ["its direction prop", "the page's made-up folders and sessions"],
  },
  IdeaSide: {
    job: "the whole sidebar in one direction, with its peek and everything-made card beside it and its quick edit",
    flow: "pickup",
    states: ["rest", "edit", "peek", "everything"],
    keys: [
      { press: "point at the foot's artifacts", does: "peeks at what is on stage", goal: "know", faster: true },
      { press: "click artifacts or the made count", does: "opens or closes everything made", goal: "know", opens: "Everything" },
      { press: "click edit", does: "swaps the list for the quick edit and back", opens: "Edit" },
      { press: "point away", does: "closes the peek" },
    ],
    listens: ["its props (direction, start, peek)", "pointer leave on the sidebar"],
  },
  Cap: {
    job: "a short caption above each drawing on the page",
    flow: "know",
    states: ["a line"],
    keys: [],
    listens: ["its props (the line)"],
  },
  Band: {
    job: "one idea laid out whole: its words, the sidebar with its peek, everything made, and the edit",
    flow: "know",
    states: ["first", "after another, with a rule above"],
    keys: [],
    listens: ["its index prop", "the page's IDEAS"],
  },
  IdeaPage: {
    job: "the dev page of three sidebar ideas over the desktop picture: all three, or one chosen by ?v=read|hold|made",
    flow: "know",
    states: ["all", "read", "hold", "made"],
    keys: [
      { press: "open side-ideas.html?v=…", does: "shows one idea or, with none, all three", goal: "know" },
    ],
    listens: ["the page's address (the v parameter)"],
  },
} satisfies Metas;

type Dir = "read" | "hold" | "made";
type Ext = "md" | "tsx" | "png" | "pdf" | "docx";
type St = "needs" | "running" | "unread" | "quiet";
type Kid = { t: string; st: St; doing?: string };
type Ses = { t: string; in?: string; st?: St; ago?: string; doing?: string; ask?: string; acts?: [string, string]; made?: Ext; thing?: string; prog?: number; kids?: Kid[] };
type Art = { n: string; short?: string; ext: Ext; from: string; ago: string; used: number; feeds: boolean; stage?: boolean };

const W = 272, P = 10, IN = W - 2 * P, H = 968;
const ty = (k: "label" | "body" | "read" | "title" | "head" | "big" | "display", weight = 400, color: string = ink): CSSProperties => ({ fontSize: T[k][0], lineHeight: `${T[k][1]}px`, fontWeight: weight, color });
const cut: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };

const NEEDS: Ses = { t: "Sol go-to-market: first 100 testers", in: "sol", st: "needs", ask: "The invite is written. Post it in #builds now, or hold it for the site?", acts: ["post it", "hold"], made: "md", thing: "the invite" };
const PINNED: Ses[] = [
  { t: "Build mode stage layout and feel", in: "sol", made: "tsx", kids: [{ t: "shoot every stage state", st: "quiet", doing: "done, 14 shots" }] },
  { t: "dev review · Sun 1 Nov", in: "sol", made: "md" },
  { t: "Personalization discussion", in: "sol" },
];
const ACTIVE: Ses[] = [
  { t: "Buildmode default logo and app icon", in: "sol", st: "running", doing: "drawing the sidebar ideas", prog: 0.62, made: "tsx" },
  { t: "Home mode onboarding", in: "sol", st: "running", doing: "shooting the first run", prog: 0.3, made: "png", kids: [{ t: "walk it as a first-timer", st: "running", doing: "scene 3 of 8" }] },
  { t: "Sol-dev dev review, 2026-11-10", in: "sol", st: "unread", doing: "finished 6 m ago · made 2", prog: 1, made: "md" },
];
const SOL: Ses[] = [
  { t: "Buildmode default logo session", ago: "11m", made: "png" },
  { t: "Sol build orchestration with OpenRig", ago: "3h", made: "md" },
  { t: "Marco's Sol tour feedback", ago: "8h" },
  { t: "Sol build orchestration handover", ago: "18h", made: "md", kids: [{ t: "read the OpenRig source", st: "quiet" }, { t: "map the session tools", st: "quiet" }, { t: "write the handover", st: "quiet" }] },
];
const FOLDERS: [string, number][] = [["kaat", 3], ["masakali", 2], ["computer", 4]];
const ARTS: Art[] = [
  { n: "sidebar ideas", short: "ideas", ext: "tsx", from: "Buildmode default logo", ago: "now", used: 1, feeds: true, stage: true },
  { n: "first run, 8 scenes", short: "first run", ext: "png", from: "Home mode onboarding", ago: "1 m", used: 2, feeds: true, stage: true },
  { n: "the invite", short: "invite", ext: "md", from: "Sol go-to-market", ago: "9 m", used: 1, feeds: false, stage: true },
  { n: "sidebar: needs you first", short: "the list", ext: "md", from: "Buildmode default logo", ago: "12 m", used: 3, feeds: true, stage: true },
  { n: "dev review, 10 Nov", ext: "md", from: "Sol-dev dev review", ago: "6 m", used: 0, feeds: false, stage: true },
  { n: "the two sidebar layers", ext: "tsx", from: "Buildmode default logo", ago: "2 h", used: 4, feeds: true, stage: true },
  { n: "look.md, the rules", ext: "md", from: "Kit sitting", ago: "5 d", used: 31, feeds: true },
  { n: "stage states, 14 shots", ext: "png", from: "Build mode stage layout", ago: "1 d", used: 9, feeds: true },
  { n: "tour feedback, his words", ext: "md", from: "Marco's Sol tour feedback", ago: "8 h", used: 12, feeds: true },
  { n: "OpenRig handover", ext: "md", from: "Sol build orchestration", ago: "18 h", used: 6, feeds: true },
  { n: "dawn, 8 scenes", ext: "tsx", from: "Onboarding", ago: "2 w", used: 2, feeds: false },
  { n: "first 100 testers plan", ext: "pdf", from: "Sol go-to-market", ago: "3 d", used: 5, feeds: true },
  { n: "the legacy map", ext: "png", from: "Legacy by eye", ago: "2 d", used: 7, feeds: false },
  { n: "cowork, three concepts", ext: "tsx", from: "Cowork from nothing", ago: "3 d", used: 1, feeds: false },
];
const STAGE = ARTS.filter((a) => a.stage), KEPT = 43;

/** glass that grows with what it holds */
function Box({ r = CURVE.radius.block, step = "card", surface, pad = 0, style, children, ...rest }: { r?: number; step?: "side" | "card" | "raised" | "box" | "pop"; surface?: "glass" | "raised" | "box"; pad?: number; style?: CSSProperties; children?: ReactNode; onPointerEnter?: () => void; onPointerLeave?: () => void; onClick?: () => void }) {
  return <div {...rest} style={{ position: "relative", isolation: "isolate", padding: pad, ...style }}><Glass r={r} step={step} surface={surface} />{children}</div>;
}
const Head = ({ name, n }: { name: string; n?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", padding: "14px 12px 4px", gap: 8 }}>
    <span style={{ ...ty("label", 500, mute), flex: 1 }}>{name}</span>{n != null && <span style={ty("label", 400, mute)}>{n}</span>}
  </div>
);
const Name = ({ s, weight = 500, color = ink }: { s: string; weight?: number; color?: string }) => <span style={{ fontWeight: weight, color }}>{s}</span>;
const Doing = ({ s }: { s: string }) => <span className="t-code" style={{ color: dim, fontSize: T.label[0] }}>{s}</span>;
const Marks = ({ exts, h = 16 }: { exts: Ext[]; h?: number }) => <span style={{ display: "flex" }}>{exts.map((e, i) => <span key={i} style={{ marginLeft: i ? -h * 0.28 : 0, display: "grid" }}><FileMark ext={e} h={h} /></span>)}</span>;

// ── the ask, three ways ──────────────────────────────────────────────────────────────────────
function Ask({ dir }: { dir: Dir }) {
  const s = NEEDS, acts = (
    <div style={{ display: "flex", gap: 6, marginTop: 10 }}><Button h={30} acts>{s.acts![0]}</Button><Button h={30}>{s.acts![1]}</Button></div>
  );
  if (dir === "hold")
    return (
      <Pearl w={IN} h={148} r={CURVE.radius.block}>
        <div style={{ padding: 12 }}>
          <div style={ty("label", 500, deep(0.55))}>{s.in} asks you</div>
          <div style={{ ...ty("body", 600, deep()), ...cut }}>{s.t}</div>
          <div style={{ ...ty("body", 400, deep(0.72)), marginTop: 4 }}>{s.ask}</div>
          {acts}
        </div>
      </Pearl>
    );
  if (dir === "made")
    return (
      <Box surface="raised" step="raised" pad={12}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: "none", paddingTop: 2 }}><FileMark ext={s.made!} h={44} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={ty("body", 600)}>{s.thing} is ready</div>
            <div style={{ ...ty("label", 400, dim), ...cut }}>{s.t}</div>
          </div>
        </div>
        <div style={{ ...ty("body", 400, dim), marginTop: 8 }}>{s.ask}</div>
        {acts}
      </Box>
    );
  return (
    <Box surface="raised" step="raised" pad={12}>
      <div style={ty("label", 500, dim)}>{s.in} asks you</div>
      <div style={{ ...ty("read", 600), marginTop: 2 }}>{s.t}</div>
      <div style={{ ...ty("body", 400, dim), marginTop: 4 }}>{s.ask}</div>
      {acts}
    </Box>
  );
}

// ── helpers: words under their lead (read, made) or rows inside its glass (hold) ───────────────────────────
function Kids({ kids, dir }: { kids: Kid[]; dir: Dir }) {
  const one = kids.length === 1, live = kids.filter((k) => k.st === "running").length;
  const words = one ? kids[0].t : `${kids.length} helpers${live ? ` · ${live} working` : " · all done"}`;
  if (dir === "hold")
    return <>{(one ? kids : kids.slice(0, 3)).map((k) => (
      <div key={k.t} style={{ display: "flex", gap: 8, padding: "3px 12px 3px 22px", ...ty("label", 400, k.st === "running" ? ink : dim) }}>
        <span style={{ ...cut, flex: 1 }}>{k.t}</span>{k.doing && <span style={{ color: mute, flex: "none" }}>{k.doing}</span>}
      </div>
    ))}<div style={{ height: 5 }} /></>;
  return (
    <div style={{ margin: "0 12px 6px 20px", paddingLeft: 10, borderLeft: `1px solid ${on(SHADE.on.edge)}`, display: "flex", gap: 8, ...ty("label", 400, live ? ink : dim) }}>
      {dir === "made" && !one && <Marks exts={["md", "md", "png"]} h={13} />}
      <span style={{ ...cut, flex: 1 }}>{words}</span>{one && kids[0].doing && <span style={{ color: mute, flex: "none" }}>{kids[0].doing}</span>}
    </div>
  );
}

/** one session, in a direction: its lead mark (made), its second line (active), its helpers */
function Line({ s, dir, w = IN, picked }: { s: Ses; dir: Dir; w?: number; picked?: boolean }) {
  const active = s.st === "running" || s.st === "unread", strong = s.st === "unread" ? 600 : 500;
  const lead = dir !== "made" ? undefined : s.made ? <FileMark ext={s.made} h={18} /> : <span />;
  const title = picked ? s.t : <Name s={s.t} weight={active || dir === "read" && !s.ago ? strong : s.ago ? 400 : 500} color={s.ago && !active ? on(0.78) : ink} />;
  const row = <Row w={w} h={active ? 50 : 34} title={title} note={active ? <Doing s={s.doing!} /> : undefined} lead={lead} aside={s.ago ?? (active ? (dir === "made" && s.st === "running" ? <Meter w={34} h={5} value={s.prog} /> : undefined) : s.in)} picked={picked} />;
  if (dir === "hold" && (active || s.kids))
    return (
      <Box r={CURVE.radius.row} step="raised" surface={active ? "raised" : "glass"} style={{ marginBottom: 4 }}>
        {row}
        {s.kids && <Kids kids={s.kids} dir={dir} />}
        {active && <div style={{ padding: "0 12px 9px" }}><Meter w={w - 24} h={4} value={s.prog} /></div>}
      </Box>
    );
  return <>{row}{s.kids && <Kids kids={s.kids} dir={dir} />}</>;
}

// ── the sidebar ───────────────────────────────────────────────────────────────────────────
function IdeaTop({ dir, onEdit }: { dir: Dir; onEdit: () => void }) {
  if (dir === "hold")
    return <div style={{ display: "flex", gap: 6 }}><Button w={IN - 90} h={38}>new session</Button><Button w={84} h={38} flat up>find</Button></div>;
  const box = <Field w={IN} h={40}><span style={{ flex: 1 }}>start or find a session</span><span style={ty("label", 400, mute)}>⌘K</span></Field>;
  if (dir === "read") return box;
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", padding: "0 4px 8px" }}><span style={{ ...ty("label", 500, mute), flex: 1 }}>on stage now</span><span style={ty("label", 400, mute)} onClick={onEdit}>{KEPT} made</span></div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {STAGE.slice(0, 4).map((a, i) => (
          <Box key={a.n} r={CURVE.radius.field} step={i === 0 ? "raised" : "card"} surface={i === 0 ? "raised" : "glass"} style={{ width: (IN - 18) / 4, padding: "9px 0 6px", display: "grid", justifyItems: "center", gap: 5 }}>
            <FileMark ext={a.ext} h={30} />
            <span style={{ ...ty("label", 400, i === 0 ? ink : dim), ...cut, maxWidth: 52 }}>{a.short}</span>
          </Box>
        ))}
      </div>
      {box}
    </>
  );
}

function Sections({ dir }: { dir: Dir }) {
  const tray = (name: string, n: ReactNode, rows: ReactNode) => dir === "hold"
    ? <Box pad={6} style={{ marginTop: 8 }}><div style={{ display: "flex", padding: "4px 8px 4px", ...ty("label", 500, dim) }}><span style={{ flex: 1 }}>{name}</span><span style={{ color: mute }}>{n}</span></div>{rows}</Box>
    : <><Head name={name} n={n} />{rows}</>;
  const w = dir === "hold" ? IN - 12 : IN;
  return (
    <>
      <div style={{ marginTop: 10 }}><Ask dir={dir} /></div>
      {dir === "hold"
        ? <div style={{ marginTop: 8 }}>{ACTIVE.map((s) => <Line key={s.t} s={s} dir={dir} />)}</div>
        : <><Head name="active" n={ACTIVE.length} />{ACTIVE.map((s) => <Line key={s.t} s={s} dir={dir} />)}</>}
      {tray("pinned", PINNED.length, PINNED.map((s) => <Line key={s.t} s={s} dir={dir} w={w} />))}
      {tray("sol", 12, <>{SOL.map((s) => <Line key={s.t} s={s} dir={dir} w={w} />)}<div style={{ padding: "4px 12px 6px", ...ty("label", 400, mute) }}>8 more</div></>)}
      {dir === "hold"
        ? FOLDERS.map(([f, n]) => <Box key={f} style={{ marginTop: 6, padding: "10px 14px", display: "flex", ...ty("label", 500, dim) }}><span style={{ flex: 1 }}>{f}</span><span style={{ color: mute }}>{n}</span></Box>)
        : FOLDERS.map(([f, n]) => <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 0", ...ty("label", 500, mute) }}><span style={{ flex: 1 }}>{f}</span>{dir === "made" && <Marks exts={f === "kaat" ? ["pdf", "docx", "md"] : ["md", "png"]} h={14} />}<span style={{ fontWeight: 400 }}>{n}</span></div>)}
    </>
  );
}

function Foot({ dir, lit, onPeek, onAll, onEdit }: { dir: Dir; lit: boolean; onPeek: (on: boolean) => void; onAll: () => void; onEdit: () => void }) {
  const feel = { onPointerEnter: () => onPeek(true), onClick: onAll };
  return (
    <div style={{ padding: `8px ${P}px 10px`, borderTop: `1px solid ${on(SHADE.on.line)}` }}>
      {dir === "read" && <div {...feel}><Row w={IN} h={38} hover={lit || undefined} title={<Name s="artifacts" />} aside={`${STAGE.length} on stage · ${KEPT} made`} /></div>}
      {dir === "hold" && (
        <Box {...feel} step={lit ? "raised" : "card"} surface={lit ? "raised" : "glass"} style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Marks exts={STAGE.map((a) => a.ext)} h={24} /><span style={{ flex: 1 }} /><span style={ty("label", 500, lit ? ink : dim)}>artifacts</span><span style={ty("label", 400, mute)}>{KEPT}</span>
        </Box>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 0 4px" }}>
        <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", flex: "none" }}><Body size={20} state="settled" halo={haloDoing("rest")} /></span>
        <span style={{ ...ty("body", 500), flex: 1 }}>projects</span>
        <span style={ty("label", 400, dim)} onClick={onEdit}>edit</span><span style={ty("label", 400, dim)}>settings</span>
      </div>
    </div>
  );
}

// ── artifacts: the peek on hover, everything made on a click ─────────────────────────────────────────
const IdeaArtRow = ({ a, w, wide }: { a: Art; w: number; wide?: boolean }) => (
  <Row w={w} h={44} lead={<FileMark ext={a.ext} h={22} />} title={<Name s={a.n} />} note={`${a.from} · ${a.ago}`}
    aside={wide ? <span style={{ display: "flex", gap: 14, alignItems: "center" }}><span>{a.used ? `used ${a.used}×` : "never used"}</span><span style={{ width: 62, color: a.feeds ? ink : mute, fontWeight: a.feeds ? 500 : 400 }}>{a.feeds ? "feeds" : "kept"}</span></span> : a.ago === "now" ? "being made" : undefined} />
);
function Peek({ onAll }: { onAll?: () => void }) {
  const w = 300;
  return (
    <Card w={w} step="pop" style={{ padding: 8 }}>
      <div style={{ padding: "6px 12px 6px", ...ty("label", 500, dim) }}>on stage now, across {new Set(STAGE.map((a) => a.from)).size} sessions</div>
      {STAGE.map((a) => <IdeaArtRow key={a.n} a={a} w={w - 16} />)}
      <div style={{ padding: "6px 4px 2px" }} onClick={onAll}><Button w={w - 24} h={32} flat up>everything made · {KEPT}</Button></div>
    </Card>
  );
}
function Everything({ dir }: { dir: Dir }) {
  const w = 468, feeds = ARTS.filter((a) => a.feeds).length, by = [...ARTS].sort((a, b) => b.used - a.used);
  return (
    <Card w={w} step="pop" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ ...ty("title", 600), letterSpacing: "-0.01em", flex: 1 }}>artifacts</span><span style={ty("label", 400, mute)}>{KEPT} made in 38 sessions</span></div>
      <div style={{ margin: "12px 0 6px", ...ty("body", 400, dim) }}>What your AI starts every new session knowing: <Name s={`${feeds * 2} of ${KEPT}`} weight={600} /> feed it, the rest are kept.</div>
      <Meter w={w - 32} h={8} parts={[0.22, 0.14, 0.09, 0.06]} />
      <div style={{ display: "flex", gap: 14, margin: "6px 0 14px", ...ty("label", 400, mute) }}><span>the rules</span><span>his words</span><span>plans</span><span>shots</span><span style={{ flex: 1, textAlign: "right" }}>49% free</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <Pill words={["most used", "newest", "by folder"]} picked={0} h={30} />
        <span style={{ flex: 1 }} /><Field w={150} h={30}><span style={ty("label", 400, mute)}>find a thing</span></Field>
      </div>
      {dir === "read"
        ? by.slice(0, 9).map((a) => <IdeaArtRow key={a.n} a={a} w={w - 32} wide />)
        : <div style={{ display: "grid", gridTemplateColumns: dir === "made" ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
            {by.slice(0, dir === "made" ? 12 : 8).map((a) => dir === "made"
              ? <Box key={a.n} r={CURVE.radius.field} step={a.feeds ? "raised" : "card"} surface={a.feeds ? "raised" : "glass"} style={{ padding: "12px 6px 8px", display: "grid", justifyItems: "center", gap: 6 }}>
                  <FileMark ext={a.ext} h={40} />
                  <span style={{ ...ty("label", 500, a.feeds ? ink : dim), ...cut, maxWidth: 92 }}>{a.n}</span>
                  <span style={ty("label", 400, mute)}>{a.feeds ? `feeds · ${a.used}×` : "kept"}</span>
                </Box>
              : <Box key={a.n} r={CURVE.radius.field} step={a.feeds ? "raised" : "card"} surface={a.feeds ? "raised" : "glass"} style={{ padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
                  <FileMark ext={a.ext} h={34} />
                  <span style={{ minWidth: 0, display: "grid" }}><span style={{ ...ty("body", 500, a.feeds ? ink : dim), ...cut }}>{a.n}</span><span style={{ ...ty("label", 400, mute), ...cut }}>{a.feeds ? `feeds · used ${a.used}×` : `kept · ${a.from}`}</span></span>
                </Box>)}
          </div>}
      <div style={{ marginTop: 12, ...ty("label", 400, mute) }}>Press one to open it on the stage. "feeds" is a switch: on, new sessions in its folder start with it.</div>
    </Card>
  );
}

// ── the quick edit: the same list, loose ─────────────────────────────────────────────────────────
function Edit({ dir }: { dir: Dir }) {
  const hold = dir === "hold";
  const folder = (name: string, n: number, target?: boolean) => target
    ? <div key={name} style={{ marginTop: 6 }}><Row w={IN} h={42} picked title={name} aside="drop here" /></div>
    : <Box key={name} r={CURVE.radius.row} step={hold ? "raised" : "card"} surface={hold ? "raised" : "glass"} style={{ marginTop: 6, padding: "11px 12px", display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ ...ty("body", 600), flex: 1 }}>{name}</span><span style={ty("label", 400, mute)}>{n}</span><span style={ty("label", 400, dim)}>rename</span><span style={ty("label", 400, dim)}>hide</span>
      </Box>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", padding: "0 2px 6px 6px" }}><span style={{ ...ty("read", 600), flex: 1 }}>edit the sidebar</span><Button h={30} acts state="hover">done</Button></div>
      <div style={{ ...ty("label", 400, mute), padding: "0 6px 4px" }}>Drag a folder to order it, a session onto a folder to file it.</div>
      {folder("sol", 12)}
      <div style={{ paddingLeft: 14, opacity: 0.9 }}>
        {SOL.slice(0, 2).map((s) => <Row key={s.t} w={IN - 14} h={32} title={<Name s={s.t} weight={400} color={on(0.78)} />} aside={s.ago} />)}
        <div style={{ height: 32, margin: "2px 0", borderRadius: CURVE.radius.row, border: `1px dashed ${on(SHADE.on.edge)}` }} />
        <Row w={IN - 14} h={32} title={<Name s={SOL[3].t} weight={400} color={on(0.78)} />} aside={SOL[3].ago} />
      </div>
      {folder("kaat", 3, true)}
      {folder("masakali", 2)}
      {folder("computer", 4)}
      <div style={{ marginTop: 8 }}><Button w={IN} h={36} flat up>new folder</Button></div>
      <Head name="hidden" n={2} />
      {["rise", "broker"].map((f) => <Row key={f} w={IN} h={30} title={<Name s={f} weight={400} color={mute} />} aside="show" />)}
      <div style={{ position: "absolute", left: 58, top: 214, transform: "rotate(-2.5deg)", filter: `drop-shadow(0 14px 22px ${black(0.6)})` }}>
        <Glass w={IN - 30} h={36} r={CURVE.radius.row} step="pop" surface="box" blur={12}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 12px", ...ty("body", 500), ...cut }}>Marco's Sol tour feedback</div>
        </Glass>
      </div>
    </>
  );
}

function IdeaSide({ dir, start = "rest", peek = false }: { dir: Dir; start?: "rest" | "edit"; peek?: boolean }) {
  const [mode, setMode] = useState(start), [open, setOpen] = useState(peek), [all, setAll] = useState(false);
  const flip = () => setMode(mode === "edit" ? "rest" : "edit");
  return (
    <div style={{ position: "relative", width: W, height: H, flex: "none" }} onPointerLeave={() => !peek && setOpen(false)}>
      <Glass w={W} h={H} r={CURVE.radius.box} step="side">
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", padding: `${P + 2}px ${P}px 0` }}>
            {mode === "edit" ? <Edit dir={dir} /> : <><IdeaTop dir={dir} onEdit={() => setAll(!all)} /><Sections dir={dir} /></>}
          </div>
          <Foot dir={dir} lit={open} onPeek={setOpen} onAll={() => setAll(!all)} onEdit={flip} />
        </div>
      </Glass>
      {mode !== "edit" && (open || all) && (
        <div style={{ position: "absolute", left: W + 8, ...(dir === "made" ? { top: 8 } : { bottom: 52 }), zIndex: 2 }}>{all ? <Everything dir={dir} /> : <Peek onAll={() => setAll(true)} />}</div>
      )}
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────────────────
const IDEAS: { dir: Dir; name: string; says: string; how: [string, string][] }[] = [
  { dir: "read", name: "read it", says: "No marks at all. What matters is bigger and bolder, and a session that needs you is a card holding its question and the answer.",
    how: [["needs you", "a lit card, the question, two answers"], ["active", "bold, with a line of what it does now"], ["finished, unseen", "boldest, like unread mail"], ["helpers", "one line of words under their lead"], ["artifacts", "a row at the foot"]] },
  { dir: "hold", name: "hold it", says: "Everything is glass you could pick up. A folder is a tray. A session with helpers is a tray holding them. Running is the jelly's goo filling the edge.",
    how: [["needs you", "the pearl, the only bright thing"], ["active", "lit glass, goo along its edge"], ["finished, unseen", "the goo is full"], ["helpers", "rows inside their lead's glass"], ["artifacts", "a tray of what is on stage"]] },
  { dir: "made", name: "what was made", says: "The sidebar shows what was made, not who is talking. Each session wears the last thing it made, and what is on stage sits on top.",
    how: [["needs you", "the thing it wants you to see, large"], ["active", "its thing, and the goo for how far along"], ["finished, unseen", "bold, wearing what it made"], ["helpers", "what they made, in a line"], ["artifacts", "the shelf on top, always there"]] },
];
const Cap = ({ s }: { s: string }) => <div style={{ ...ty("label", 500, dim), padding: "0 4px 8px" }}>{s}</div>;

function Band({ i }: { i: number }) {
  const d = IDEAS[i];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "36px 40px 28px", borderTop: i ? `1px solid ${on(SHADE.on.line)}` : undefined }}>
      <div style={{ width: 216, flex: "none", paddingTop: 22 }}>
        <div style={ty("label", 500, mute)}>idea {i + 1} of 3</div>
        <div style={{ ...ty("display", 600), letterSpacing: "-0.02em", margin: "2px 0 10px" }}>{d.name}</div>
        <div style={ty("body", 400, on(0.78))}>{d.says}</div>
        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          {d.how.map(([k, v]) => <div key={k}><div style={ty("label", 500, ink)}>{k}</div><div style={ty("label", 400, dim)}>{v}</div></div>)}
        </div>
      </div>
      <div><Cap s="the sidebar, and artifacts on hover" /><div style={{ width: W + 316 }}><IdeaSide dir={d.dir} peek /></div></div>
      <div><Cap s="a click: everything made, and what feeds your AI" /><Everything dir={d.dir} /></div>
      <div><Cap s="edit: a drag in flight" /><IdeaSide dir={d.dir} start="edit" /></div>
    </div>
  );
}

function IdeaPage() {
  const v = new URLSearchParams(location.search).get("v") ?? "all", one = IDEAS.findIndex((d) => d.dir === v);
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "auto", background: `url(${desk}) center/cover fixed` }}>
      <div style={{ minHeight: "100%", background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }}>
        {one >= 0
          ? <div style={{ padding: 40, display: "flex", gap: 28 }}><div style={{ width: 216, paddingTop: 22 }}><div style={{ ...ty("title", 600), marginBottom: 8 }}>{IDEAS[one].name}</div><div style={ty("body", 400, on(0.78))}>{IDEAS[one].says} Hover the artifacts, press them, press edit.</div></div><IdeaSide dir={IDEAS[one].dir} /></div>
          : IDEAS.map((_, i) => <Band key={i} i={i} />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><IdeaPage /></StrictMode>);
