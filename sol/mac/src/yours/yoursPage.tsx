// Build becomes yours (#1089): the whole part to press, drawn only from the kit (kit/index.ts, so tokens.json) and the
// part's own pieces (Chip, Made, land). Dev only, like kit/stage.tsx: yours.html is not in the face's build inputs.
// The window is Build at 1280 x 800: the talk and its box on the left, the stage on the right. The path, pressed:
//   again   the Sol user sends an ask they have sent before           (press send, or Enter)
//   offer   1200 ms later one line stands above the box: the tool itself as a dashed chip, its count, "not now"
//   shape   pressing the chip lays three made versions over the stage; 1 2 3 pick, chips or words change the picked one
//   keep    the picked one travels to the stage and its hairline goes solid; the line says it is theirs, with undo
//   back    the kept piece's corner peels: where it came from, what it may do, undo
//   (stage folded: the talk is the whole window; the versions stand above the line, the box in sight)   &fold=1
//   Jev: sure (it acts), unsure (a dashed ghost: the pearl alone, nothing picked, the title dashed), quiet (nothing; "noticed" in the list)   &jev=0|1|2
//   &narrow=1 a stage under 560 wide: one version in front, two dashed edges behind   &empty=1 the list with nothing kept
//   a month on   the shelf: their kept things as solid chips on the line's row; a press opens one above its chip
//   first minute   the switch goes on: the pearl reads 30 days, then up to three dashed chips of what they repeat; a row's
//           press opens its versions at once (no ask to remember)   &first=0|1|2  &empty=1
//   a run (&k=run)   two kept tools used one after the other in three sessions: the chip is the two, snapped; one press
//           keeps it; a press on the kept run fills the box with step one, and after the send step two stands in the box
//   list    Build settings > yours: every kept thing as its chip, and the offers passed
//   the look (&k=look)   the talk docked the same way by hand in three sessions: the chip is the window in small; one
//           press keeps it; then three glyphs stand in its place and the window itself tries each while the pointer is on it
// yours.html?s=again|offer|shape|keep|back|list  &k=ask|checkin|correction|arrangement|closed|look  &still=1 (no strip)
import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Button, Card, Field, Glass, Pearl, Pill, Row } from "../kit";
import { dim, ink, label, mute, on, TYPE } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { Chip } from "./Chip";
import { RunChip } from "./Run";
import { FoundRows, Reading } from "./Found";
import { Made, MADE_W } from "./Made";
import { land } from "./land";
import { LayGlyph, LayPick, laysOf, layTitle, type Lay } from "./Look";
import type { Spec } from "./model";
import "../palette.css";
import "../kit/type.css";
import "../kit/moves.css";

type Kind = "ask" | "checkin" | "correction" | "arrangement" | "closed" | "look" | "lent" | "learns" | "run";
const KINDS: Kind[] = ["ask", "checkin", "correction", "arrangement", "closed", "look", "lent", "learns", "run"];
const KIND_WORDS = ["an ask again", "“is it done?”", "the same fix", "the same place", "always closed", "the talk, your way", "lent to you", "it learns", "two, snapped"];
const SCENES = ["first minute", "again", "offer", "shape", "keep", "back", "list", "a month on"] as const;
type Scene = (typeof SCENES)[number];
const base = { size: "m" as const, accent: "pearl" as const, said: [] as string[] };
const f = (name: string, ...values: string[]) => ({ name, value: values[0], values });

const NUMBER = { name: "invoice", value: "#1049", values: ["#1048", "#1047", "#1046"], next: true };
/** an ask with no blank that is a choice (a counter and a bare number): fields · a pin by the box · the whole ask   &nochoice=1 */
const NO_CHOICE: Spec[] = [
  { ...base, shape: "button", title: "Invoice", fields: [NUMBER, f("hours", "7", "9", "3")], template: "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page." },
  { ...base, size: "s", shape: "pin", title: "Invoice", fields: [NUMBER, f("hours", "7", "9", "3")], template: "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page." },
  { ...base, shape: "brief", title: "Invoice", fields: [NUMBER, f("hours", "7", "9", "3")], template: "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page, due in 14 days, my bank details at the foot." },
];
/** drawn data, one offer of each kind. Every value here is made up: nobody's asks, counts or names */
const DATA: Record<Kind, { count: number; since: string; again: string; what: string; versions: Spec[] }> = {
  // they just sent #1048 for Northside, 6 hours: every blank shows the value just sent; the number only ever counted up,
  // so it is a counter and shows the NEXT one (#1049), never a row each
  ask: { count: 7, since: "14 Oct", what: "asks", again: "Draft invoice #1048 for Northside, 6 hours, at my usual rate…",
    versions: [
      { ...base, shape: "button", title: "Invoice", fields: [NUMBER, f("client", "Northside", "Okafor & Co", "Bright Dental"), f("hours", "6", "11", "4")], template: "Draft invoice {invoice} for {client}, {hours} hours, at my usual rate. One page." },
      { ...base, shape: "rows", title: "Invoice", fields: [NUMBER, f("client", "Northside", "Okafor & Co", "Bright Dental"), f("hours", "6", "11", "4")], template: "Draft invoice {invoice} for {client}, {hours} hours, at my usual rate. One page." },
      { ...base, shape: "brief", title: "Invoice", fields: [NUMBER, f("client", "Northside"), f("hours", "6")], template: "Draft invoice {invoice} for {client}, {hours} hours, at my usual rate. One page, due in 14 days, my bank details at the foot." },
    ] },
  checkin: { count: 31, since: "2 Nov", what: "asks", again: "is it done?",
    versions: [
      { ...base, shape: "checkin", title: "Where it stands", fields: [], template: "Where does this stand? One line each: done, waiting on me, next." },
      { ...base, size: "s", shape: "pin", title: "Is it done?", fields: [], template: "Is it done? Yes or no first, then what is left." },
      { ...base, shape: "brief", title: "Where it stands, in full", fields: [], template: "Where does this stand? What landed, what is open with links, what waits on me, and the next step." },
    ] },
  correction: { count: 4, since: "9 Nov", what: "corrections", again: "no, shorter. One line first, then the rest.",
    versions: [
      { ...base, shape: "rule", title: "Shorter", fields: [], template: "Shorter. One line first, then the rest." },
      { ...base, size: "s", shape: "pin", title: "Shorter", fields: [], template: "Shorter. One line first, then the rest." },
      { ...base, shape: "brief", title: "Say it again", fields: [], template: "From now on: shorter. One line first, then the rest." },
    ] },
  arrangement: { count: 5, since: "8 Nov", what: "sessions", again: "(you drag the list to the right, again)", versions: [{ ...base, shape: "layout", title: "The list on the right", fields: [], template: "" }] },
  look: { count: 3, since: "9 Nov", what: "sessions", again: "(you dock the talk on the right, again)", versions: [{ ...base, shape: "layout", title: "Talk on the right", fields: [], template: "" }] },
  // lending, a design only: the other side. Sam lent Invoice; it arrives as the same dashed chip, its slots empty
  lent: { count: 0, since: "13 Nov", what: "asks", again: "(any ask, in the project you both work in)", versions: [{ ...base, shape: "button", title: "Invoice", fields: [{ name: "client", value: "", values: [] }, { name: "hours", value: "", values: [] }], template: "Draft this month's invoice for {client}, {hours} hours, at my usual rate. One page." }] },
  // the tool learns (next, after NOW): a kept tool pressed, then its fill edited the same way three times. The chip is the tool
  // with the edit in its slot; one press changes the tool, "changed · undo" (nothing to shape: the edit is theirs already)
  learns: { count: 3, since: "9 Nov", what: "edits", again: "Draft this month's invoice for Northside: the hours from my calendar, at my usual rate, one page. Due in 7 days, bank details at the foot.",
    versions: [{ ...base, shape: "brief", title: "Invoice", fields: [f("client", "Northside")], template: "Draft this month's invoice for {client}: the hours from my calendar, at my usual rate, one page. Due in 7 days, bank details at the foot." }] },
  // a run (a system of their own): two kept tools used one after the other in three sessions. The chip is the two, snapped;
  // one press keeps it. A press on it fills the box with step one; when the agent's turn ends, step two stands in the box
  run: { count: 3, since: "6 Nov", what: "sessions", again: "Where does this stand? One line each: done, waiting on me, next.", versions: [{ ...base, shape: "hide", title: "Invoice, then Where it stands", fields: [], template: "" }] },
  closed: { count: 6, since: "6 Nov", what: "closes", again: "(you close the terminal, again)", versions: [{ ...base, shape: "hide", title: "Terminal, put away", fields: [], template: "" }] },
};

/** what a press or a few plain words change in a version, the engine's `adjust` in small (pure) */
function adjust(s: Spec, words: string): { spec: Spec; changed: string | null } {
  const w = words.toLowerCase();
  const name = /\b(?:call it|name it)\s+(.{1,40})$/i.exec(words);
  if (name) return { spec: { ...s, title: name[1].trim() }, changed: "title" };
  if (/\bsmaller|small\b/.test(w)) return { spec: { ...s, size: "s" }, changed: "size" };
  if (/\bbigger|big\b/.test(w)) return { spec: { ...s, size: "l" }, changed: "size" };
  if (/\bplain\b/.test(w)) return { spec: { ...s, accent: "plain" }, changed: "look" };
  if (/\bpearl\b/.test(w)) return { spec: { ...s, accent: "pearl" }, changed: "look" };
  if (/\brow/.test(w) && s.fields.length) return { spec: { ...s, shape: "rows" }, changed: "shape" };
  const drop = /\bwithout (?:the )?(.+)$/.exec(w);
  if (drop) { const i = s.fields.findIndex((x) => x.name.toLowerCase() === drop[1].trim()); if (i >= 0) return { spec: { ...s, template: s.template.split(`{${s.fields[i].name}}`).join(s.fields[i].value), fields: s.fields.filter((_, j) => j !== i) }, changed: "shape" }; }
  return { spec: s, changed: null };
}
/** the presses a version offers: only what would change THIS one (pure) */
const pushesOf = (s: Spec): string[] => s.shape === "pin" ? [] : [   // a pin has no size or look by the box: only "say…" and keep
  ...(s.size !== "s" ? ["smaller"] : ["bigger"]), ...(s.accent === "pearl" ? ["plain"] : ["pearl"]),
  ...(s.shape === "button" && s.fields.some((x) => !x.next && (x.values?.length ?? 0) > 1 && !(x.values ?? []).every((v) => /^[\d.,]+$/.test(v))) ? ["a row each"] : []), ...(s.shape === "button" ? s.fields.filter((x) => !x.next).slice(1).map((x) => `without ${x.name}`) : []),
];

/** a month on (drawn): what this Sol user's Build holds that nobody else's does. The shelf: kept things of this project
 *  as solid chips on the line's row; a press opens the piece above its chip, a press inside fills the box */
const SHELF: Spec[] = [
  { ...base, shape: "rows", title: "Invoice", fields: [f("client", "Northside", "Okafor & Co", "Bright Dental"), f("hours", "6", "11", "4")], template: "Draft this month's invoice for {client}, {hours} hours, at my usual rate. One page." },
  { ...base, size: "s", shape: "checkin", title: "Where it stands", fields: [], template: "Where does this stand? One line each: done, waiting on me, next." },
  { ...base, size: "s", accent: "plain", shape: "rule", title: "Shorter", fields: [], template: "Shorter. One line first, then the rest." },
  { ...base, shape: "button", title: "Captions", fields: [f("clip", "tuesday-demo", "launch-teaser"), f("tone", "dry", "warm")], template: "Three captions for {clip}, {tone}, under 12 words each." },
  { ...base, shape: "button", title: "Lesson plan", fields: [f("class", "Year 9", "Year 11"), f("topic", "tides", "rivers")], template: "A lesson plan for {class} on {topic}: 50 minutes, one activity, one question to end on." },
];
/** what a kept thing may do, on its back, by shape: the ceiling in the Sol user's words */
const MAY: Record<Spec["shape"], string> = { button: "fills your box · never sends", rows: "fills your box · never sends", brief: "fills your box · never sends", checkin: "fills your box · never sends", rule: "fills your box · never sends", pin: "fills your box · never sends", layout: "moves one thing on your stage", hide: "keeps one thing closed" };
/** the sheet's head, by kind: what was noticed, in four words */
/** the first minute (drawn): what the first read finds, most repeated first */
const FOUND: Kind[] = ["checkin", "ask", "correction"];
/** asks sent once (made up): they stand in "you asked" when fewer than three things repeat, so the first minute is never
 *  empty. From one ask only its numbers and paths are blanks; nothing came back, so there is no row each: fields · the whole ask */
const ONCE: { id: string; when: string; opening: string; versions: Spec[] }[] = [
  { id: "once-notes", when: "once · today", opening: "Summarise notes/12-nov.md in 5 lines, the decisions first", versions: [
    { ...base, shape: "button", title: "Summarise", fields: [f("file", "notes/12-nov.md"), f("lines", "5")], template: "Summarise {file} in {lines} lines, the decisions first." },
    { ...base, shape: "brief", title: "Summarise", fields: [f("file", "notes/12-nov.md"), f("lines", "5")], template: "Summarise {file} in {lines} lines, the decisions first." }] },
  { id: "once-plan", when: "once · yesterday", opening: "List what changed in the plan since Monday, one line each", versions: [
    { ...base, shape: "button", title: "What changed", fields: [], template: "List what changed in the plan since Monday, one line each." },
    { ...base, shape: "brief", title: "What changed", fields: [], template: "List what changed in the plan since Monday, one line each." }] },
  { id: "once-thanks", when: "once · 11 Nov", opening: "Write a thank-you note for order 4417, two sentences, warm", versions: [
    { ...base, shape: "button", title: "Thank-you note", fields: [f("order", "4417")], template: "Write a thank-you note for order {order}, two sentences, warm." },
    { ...base, shape: "brief", title: "Thank-you note", fields: [f("order", "4417")], template: "Write a thank-you note for order {order}, two sentences, warm." }] },
];
const OPENING: Partial<Record<Kind, string>> = { checkin: "is it done? where is it?", ask: "Draft invoice ____ for ____, ____ hours, at my usual rate", correction: "no, shorter. One line first" };
const HEAD: Record<Kind, string> = { run: "", learns: "", ask: "You ask this often.", checkin: "You check on this often.", correction: "You have said this before.", arrangement: "", closed: "", look: "", lent: "Sam lent you this." };
/** an arrangement or a thing always closed has nothing to shape: the chip's press does it, undo beside it */
const direct = (k: Kind) => k === "arrangement" || k === "closed" || k === "look" || k === "run";
/** the run, drawn: its steps and what each puts in the box */
const RUN = [{ title: "Invoice", fill: "Draft invoice #1049 for Northside, 6 hours, at my usual rate. One page." }, { title: "Where it stands", fill: "Where does this stand? One line each: done, waiting on me, next." }];
/** the look, drawn: the talk docked right, by hand, in three sessions; its versions by Look's rule */
const THEIRS: Lay = { dock: "right" };
const LAYS = laysOf(THEIRS);
/** the kept tool before it learned (drawn) */
const LEARNS_WAS: Spec = { ...base, shape: "brief", title: "Invoice", fields: [f("client", "Northside")], template: "Draft this month's invoice for {client}: the hours from my calendar, at my usual rate, one page, due in 14 days." };
const q = new URLSearchParams(location.search);
const W = 1280, H = 800, FOOT = 300;
/** the talk's box and the stage's, in the window, for a layout: [tx, ty, tw, th, sx, sy, sw, sh] */
const rectsOf = (l: Lay): number[] => {
  const tw = Math.round((l.width ?? 0.36) * W);
  return l.dock === "full" ? [0, 0, W, H, W, 0, 0, H] : l.dock === "bottom" ? [0, H - FOOT, W, FOOT, 0, 0, W, H - FOOT] : l.dock === "right" ? [W - tw, 0, tw, H, 0, 0, W - tw, H] : [0, 0, tw, H, tw, 0, W - tw, H];
};
/** numbers that travel to their target in `ms` on the kit's reveal curve (the window re-laid: every box follows, frame by frame) */
function useTween(target: number[], ms = 320): number[] {
  const [v, setV] = useState(target), cur = useRef(target), key = target.join(",");
  useEffect(() => {
    const from = cur.current, t0 = performance.now();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || from.join(",") === key) { cur.current = target; setV(target); return; }
    let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); const n = target.map((x, i) => from[i] + (x - from[i]) * e); cur.current = n; setV(n); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

function Page() {
  const [kind, setKind] = useState<Kind>((q.get("k") as Kind) || "ask");
  const [scene, setScene] = useState<Scene>(() => { const s = (q.get("s") as Scene) || "again"; return s === "shape" && direct((q.get("k") as Kind) || "ask") ? "keep" : s; });
  const d = DATA[kind];
  const [fold, setFold] = useState(!!q.get("fold")), [narrow, setNarrow] = useState(!!q.get("narrow"));
  const [versions, setVersions] = useState(q.get("nochoice") && kind === "ask" ? NO_CHOICE : d.versions);
  const [pick, setPick] = useState(Number(q.get("jev")) === 1 ? -1 : Math.min(1, d.versions.length - 1));
  const [pulse, setPulse] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [miss, setMiss] = useState(false);
  const [saying, setSaying] = useState(false);
  // Jev's three bands, to press: sure (0.7 and over) acts; unsure (0.45 and over) shows a dashed ghost; quiet shows nothing
  const [jev, setJev] = useState(Number(q.get("jev") ?? 0));
  const [woke, setWoke] = useState(false);
  const [openShelf, setOpenShelf] = useState(-1);
  const [boxText, setBoxText] = useState(scene === "again" ? d.again : "");
  const [shown, setShown] = useState(scene !== "again");
  const [undone, setUndone] = useState(false);
  // the first minute: the switch off (0), just turned on and reading (1), what they repeat found (2)
  const [first, setFirst] = useState(Number(q.get("first") ?? 0));
  // a kept run: which step's fill stands in the box (-1: not running), and what was last sent
  const [runAt, setRunAt] = useState(-1), [runSent, setRunSent] = useState("");
  const runPress = () => { setRunAt(0); setBoxText(RUN[0].fill); };
  const runSend = () => { const i = runAt; setRunSent(RUN[i].fill); setBoxText(""); setTimeout(() => { if (i + 1 < RUN.length) { setRunAt(i + 1); setBoxText(RUN[i + 1].fill); } else setRunAt(-1); }, q.get("still") ? 300 : 1600); };
  const turnOn = () => { if (first) { setFirst(0); return; } setFirst(1); setTimeout(() => setFirst((x) => (x === 1 ? 2 : x)), 1400); };
  // how much the first read found: three that repeat (0), one (1), none but asks sent once (2), no ask at all (3)
  const [foundN, setFoundN] = useState(Number(q.get("found") ?? (q.get("empty") ? 3 : 0)));
  const [once, setOnce] = useState<(typeof ONCE)[number] | null>(null);
  const onceAt = useRef<(typeof ONCE)[number] | null>(null);
  const openOnce = (id: string) => { const o = ONCE.find((x) => x.id === id)!; onceAt.current = o; setOnce(o); setKind("ask"); setVersions(o.versions); setPick(0); setScene("shape"); setShown(true); setBoxText(""); };
  // back at the start of the path, the once ask is put down
  useEffect(() => { if (onceAt.current && (scene === "first minute" || scene === "again" || scene === "offer")) { onceAt.current = null; setOnce(null); setVersions(DATA[kind].versions); setPick(Math.min(1, DATA[kind].versions.length - 1)); } }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  const openFound = (k: Kind) => { setKind(k); setScene("shape"); setShown(true); setBoxText(""); };
  const [lentTo, setLentTo] = useState<string[]>([]);
  // forget (the list): an undone row can be forgotten for good; "forgotten · undo" for 8 s, then the row is gone
  const [forgot, setForgot] = useState<number | null>(null), [gone, setGone] = useState<number[]>([]);
  const forget = (i: number) => { setForgot(i); setTimeout(() => setForgot((f) => { if (f === i) setGone((g) => [...g, i]); return f === i ? null : f; }), q.get("still") ? 60000 : 8000); };
  // a kept thing being changed by saying so: what it was (so "not now" and undo put it back), and whether it was changed
  const [was, setWas] = useState<Spec | null>(null), [prior, setPrior] = useState<Spec | null>(null), changed = !!prior;
  // the look: which layout is theirs (an index into LAYS) and which is being tried while the pointer is on it
  const [layKept, setLayKept] = useState(0), [tryI, setTryI] = useState<number | null>(null);
  const keptNow = scene === "keep" || scene === "back" || scene === "list" || scene === "a month on";
  const baseLay: Lay = fold ? { dock: "full" } : { dock: "left", width: (narrow ? 760 : 440) / W };
  const lay: Lay = kind !== "look" || scene === "again" ? baseLay : tryI !== null ? LAYS[tryI].lay : scene === "offer" ? THEIRS : keptNow && !undone ? LAYS[layKept].lay : baseLay;
  const [tx, ty, TALK, th, sx, sy, sw, sh] = useTween(rectsOf(lay)).map(Math.round);
  const BOX = Math.min(TALK - 40, 696);
  const picked = useRef<HTMLDivElement>(null), place = useRef<HTMLDivElement>(null);
  useEffect(() => { if (onceAt.current) { setVersions(onceAt.current.versions); setPick(0); } else { setVersions(q.get("nochoice") && kind === "ask" ? NO_CHOICE : DATA[kind].versions); setPick(jev === 1 ? -1 : Math.min(1, DATA[kind].versions.length - 1)); } setUndone(false); setLayKept(0); setTryI(null); setWas(null); setPrior(null); setRunAt(-1); setRunSent(""); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = useCallback((s0: Scene) => { const s = s0 === "shape" && direct(kind) ? "keep" : s0; setScene(s); if (s === "again") setWoke(false); setShown(s !== "again"); setBoxText(s === "again" ? DATA[kind].again : ""); }, [kind]);
  const send = () => { if (scene !== "again") return; setBoxText(""); setScene("offer"); setShown(false); setTimeout(() => setShown(true), 1200); };
  const change = (w: string) => {
    const r = adjust(versions[pick], w);
    if (!r.changed) { setMiss(true); setTimeout(() => setMiss(false), 400); return; }
    setVersions((v) => v.map((x, i) => (i === pick ? { ...r.spec, said: [...r.spec.said, w] } : x))); setWords(""); setSaying(false); setPulse(r.changed); setTimeout(() => setPulse(null), 400);
  };
  const keep = async () => { if (picked.current && place.current) await land(picked.current, place.current.getBoundingClientRect()); setUndone(false); if (was) { setPrior(versions[0] !== was ? was : null); setWas(null); } go("keep"); };
  // change a kept thing: the same group, this one alone in it (one version, centred, no 1 2 3)
  const reshape = () => { const cur = versions[pick] ?? versions[0]; setWas(cur); setPrior(null); setVersions([cur]); setPick(0); setScene("shape"); };
  const leave = () => { if (was) { setVersions([was]); setWas(null); setScene("keep"); } else go("again"); };
  // the tool learns: the chip's press changes the kept tool by the edit they made twice; the changed part beats
  const learn = () => { setPrior(LEARNS_WAS); setUndone(false); go("keep"); setPulse("shape"); setTimeout(() => setPulse(null), 400); };
  const press = () => (kind === "learns" ? learn() : go(direct(kind) ? "keep" : "shape"));
  const unchange = () => { if (prior) setVersions([prior]); setPrior(null); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" && e.key !== "Escape" && e.key !== "Enter") return;
      if (scene === "again" && e.key === "Enter") send();
      else if (scene === "offer" && e.key === "Enter") press();
      else if (scene === "shape") {
        if (e.key === "Escape") { if (was) leave(); else go("offer"); }
        else if (e.key === "Enter" && !words && pick >= 0) void keep();
        else if (e.key >= "1" && e.key <= String(versions.length)) setPick(Number(e.key) - 1);
        else if (e.key === "ArrowRight") setPick((p) => Math.min(versions.length - 1, p + 1));
        else if (e.key === "ArrowLeft") setPick((p) => Math.max(0, p - 1));
        else if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey) setSaying(true);   // a letter starts saying it
      } else if (scene === "back" && e.key === "Escape") go("keep");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const spec = versions[pick] ?? versions[Math.min(1, versions.length - 1)];
  const blanks = spec.fields.map((x) => ({ name: x.name, value: x.value }));
  const kept = scene === "keep" || scene === "back" || scene === "list" || scene === "a month on";

  const line = scene === "offer" && jev === 2 ? null : scene === "offer" && jev === 1 && !woke ? (
    <div data-yours-line style={{ height: 36, display: "flex", alignItems: "center", padding: "0 4px", opacity: shown ? 1 : 0, transition: "opacity var(--d-reveal) var(--e-reveal)" }}>
      <button type="button" aria-label="Jelly noticed something you repeat" title="noticed something" onClick={() => setWoke(true)} style={{ all: "unset", cursor: "pointer", width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 13, border: `1px dashed ${on(SHADE.on.mute)}`, boxSizing: "border-box" }}>
        <Pearl w={14} h={14} r={7} />
      </button>
    </div>
  ) : scene === "offer" ? (
    <Line on={shown}>
      {kind === "run" ? <RunChip steps={RUN.map((r) => r.title)} onPress={press} label="You use these two one after the other: keep them snapped" /> :
      <Chip title={versions[0].title} lead={kind === "look" ? <LayGlyph lay={THEIRS} /> : undefined} blanks={kind === "learns" ? [{ name: "edit", value: "due in 7 days" }] : versions[0].fields.map((x) => ({ name: x.name, value: x.value }))} onPress={press} label={`You ask this often. ${spec.title}: see it made`} />}
      <span title={d.again} style={{ color: dim, fontSize: T.label[0], fontVariantNumeric: "tabular-nums" }}>{kind === "lent" ? "from Sam" : `${d.count}×`}</span>
      <span style={{ flex: 1 }} />
      <Quiet onClick={() => go("again")}>not now</Quiet>
    </Line>
  ) : scene === "keep" || scene === "back" ? (
    <Line on>
      {kind === "look" && !undone ? <LayPick versions={LAYS} kept={layKept} onTry={setTryI} onKeep={setLayKept} after="from now on" />
        : kind === "run" && !undone ? <RunChip steps={RUN.map((r) => r.title)} kept at={runAt} onPress={runPress} label="Invoice, then Where it stands: start it" />
        : <b style={{ color: ink, fontWeight: 500, fontSize: T.body[0] }}>{kind === "look" ? layTitle(LAYS[layKept].lay) : spec.title}</b>}
      {!(kind === "look" && !undone) && <span data-yours-word style={{ color: dim, fontSize: T.label[0], whiteSpace: "nowrap" }}>{undone ? "undone" : kind === "run" ? (runAt < 0 ? "yours" : `${runAt + 1} of ${RUN.length}`) : direct(kind) ? "from now on" : changed ? "changed" : "yours"}</span>}
      {!undone && !direct(kind) && !changed && <span title="it also stands in this project's folder, not shared" style={{ color: mute, fontSize: T.label[0], whiteSpace: "nowrap" }}>in the folder</span>}
      <span style={{ flex: 1 }} />
      {/* after a change, undo puts it back as it was (it stays kept); otherwise undo takes it off */}
      <Quiet onClick={changed && !undone ? unchange : () => setUndone((u) => !u)}>{undone ? "bring it back" : "undo"}</Quiet>
    </Line>
  ) : scene === "a month on" ? (
    <div data-yours-shelf style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, height: 36 }}>
      {SHELF.slice(0, fold ? 5 : 3).map((t, i) => <Chip key={t.title} title={t.title} blanks={t.fields.slice(0, 1).map((x) => ({ name: x.name, value: x.value }))} kept onPress={() => setOpenShelf(openShelf === i ? -1 : i)} />)}
      {!fold && <span style={{ color: dim, fontSize: T.label[0], padding: "0 4px" }}>+{SHELF.length - 3}</span>}
      {openShelf >= 0 && <div className="k-pop" style={{ position: "absolute", left: 0, bottom: 44, zIndex: 5, background: "#000", borderRadius: CURVE.radius.card }}>
        <Made spec={SHELF[openShelf]} state="kept" onFill={(t) => { setBoxText(t); setOpenShelf(-1); }} back={{ from: "kept this month", may: MAY[SHELF[openShelf].shape] }} />
      </div>}
    </div>
  ) : null;

  // the versions: over the stage when it is open; with the stage folded, in the talk's space above the line. Never over the box
  const shaping = (
              <div className="k-pop" data-yours-shaping style={fold ? { width: 840, display: "grid", gap: 16, padding: "16px 16px 12px", margin: "0 -16px", background: "var(--base-color)", borderRadius: CURVE.radius.block, position: "relative", zIndex: 1 } : { position: "absolute", inset: 16, display: "grid", alignContent: "end", gap: 16, paddingBottom: 56 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Pearl w={18} h={18} r={9} /><b style={{ fontWeight: 600, fontSize: T.read[0], color: ink }}>{was ? "Yours, to change." : once ? "You asked this." : HEAD[kind]}</b>
                  <span style={{ ...label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{was ? `kept ${d.since}` : once ? once.when : kind === "lent" ? "empty: it fills with your own values" : `${d.count} ${d.what} since ${d.since}`}</span>
                  <Quiet onClick={leave}>{was ? "leave it" : "not now"}</Quiet>
                </div>
                {narrow && !fold ? (
                  // a stage under 560 wide: one version in front, the others as two dashed edges behind it; arrows or 1 2 3 turn
                  <div style={{ alignSelf: "center", justifySelf: "center", display: "grid", justifyItems: "center", gap: 14 }}>
                    <div style={{ position: "relative" }} ref={picked}>
                      {[2, 1].map((k) => versions.length > k && <div key={k} aria-hidden style={{ position: "absolute", inset: 0, transform: `translate(${k * 7}px, ${k * 7}px)`, borderRadius: CURVE.radius.card, border: `1px dashed ${on(k === 1 ? 0.3 : 0.18)}` }} />)}
                      <div style={{ position: "relative", background: "#000", borderRadius: CURVE.radius.card }}>
                        <Made spec={spec} index={Math.max(0, pick)} state="picked" pulse={pulse} onFill={setBoxText} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>{versions.map((_, i) => <button key={i} type="button" aria-label={`version ${i + 1}`} onClick={() => setPick(i)} style={{ all: "unset", cursor: "pointer", width: 8, height: 8, borderRadius: 4, background: i === Math.max(0, pick) ? on(SHADE.on.ink) : "transparent", boxShadow: `inset 0 0 0 1px ${on(SHADE.on.mute)}` }} />)}</div>
                  </div>
                ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "center", alignSelf: "center" }}>
                  {versions.map((v, i) => (
                    <div key={i} ref={i === pick ? picked : undefined}>
                      <Made spec={v} index={versions.length > 1 ? i : undefined} state={i === pick ? "picked" : "ghost"} pulse={i === pick ? pulse : null} onPick={() => setPick(i)} onFill={setBoxText} doubt={jev === 1} onName={() => { setPick(i); setWords("call it "); setSaying(true); }} style={pick < 0 ? { opacity: 0.85 } : undefined} solid={fold} />
                    </div>
                  ))}
                </div>
                )}
                {/* one row: what can change this one, to press; "say…" opens the field in the chips' place; keep */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", height: 40 }}>
                  {saying ? (
                    <Field w={360} h={36}>
                      <input autoFocus value={words} onChange={(e) => setWords(e.target.value)} placeholder="call it Bills" aria-label="say what to change" onBlur={() => { if (!words) setSaying(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && words.trim()) { e.preventDefault(); e.stopPropagation(); change(words); } if (e.key === "Escape") { e.stopPropagation(); setWords(""); setSaying(false); } }}
                        style={{ all: "unset", flex: 1, minWidth: 0, color: ink, fontSize: T.body[0], animation: miss ? "yo-beat var(--d-turn) var(--e-arrive) 2 alternate" : undefined }} />
                    </Field>
                  ) : (<>
                    {pick >= 0 && pushesOf(spec).map((p) => <Button key={p} h={28} flat onClick={() => change(p)}>{p}</Button>)}
                    {pick >= 0 && <Button h={28} flat onClick={() => setSaying(true)}>say…</Button>}
                    {pick < 0 && <span style={{ ...label, color: dim }}>press the one that is right</span>}
                  </>)}
                  <span style={{ width: 10 }} />
                  <span style={{ opacity: pick < 0 ? 0.3 : 1, pointerEvents: pick < 0 ? "none" : undefined }}><Button h={36} acts onClick={() => void keep()}>keep</Button></span>
                </div>
              </div>
  );

  return (
    <div style={{ ...TYPE, minHeight: "100vh", display: "grid", placeItems: "center", gap: 12, padding: q.get("still") ? 0 : "12px 0" }}>
      {!q.get("still") && <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", justifyContent: "center", maxWidth: W }}>
        <Pill words={SCENES} picked={SCENES.indexOf(scene)} onPick={(i) => go(SCENES[i])} />
        <Pill words={["stage open", "narrow", "folded"]} picked={fold ? 2 : narrow ? 1 : 0} onPick={(i) => { setFold(i === 2); setNarrow(i === 1); }} />
        <Pill words={["Jev sure", "unsure", "quiet"]} picked={jev} onPick={(i) => { setJev(i); setWoke(false); setPick(i === 1 ? -1 : Math.min(1, versions.length - 1)); }} />
        {scene === "first minute" && <Pill words={["3 repeat", "1 repeats", "none repeat", "no ask yet"]} picked={foundN} onPick={(i) => { setFoundN(i); if (!first) setFirst(2); }} />}
        <span style={{ flexBasis: "100%", height: 0 }} />
        <Pill words={KIND_WORDS} picked={KINDS.indexOf(kind)} onPick={(i) => { setKind(KINDS[i]); go("offer"); }} />
      </div>}
      <Glass w={W} h={H} r={CURVE.radius.box} step="side">
        <div style={{ position: "absolute", inset: 0 }}>
          {/* the talk and its box */}
          <section style={{ position: "absolute", left: tx, top: ty, width: TALK, height: th, display: "flex", flexDirection: "column", alignItems: TALK > 760 ? "center" : undefined, padding: "24px 20px 20px", boxSizing: "border-box",
            [lay.dock === "right" ? "borderLeft" : lay.dock === "bottom" ? "borderTop" : "borderRight"]: `1px solid ${on(SHADE.on.line)}` }}>
            <div style={{ flex: 1, width: BOX, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12, color: dim, paddingBottom: 16, opacity: fold && scene === "shape" ? 0.25 : 1 }}>
              <p style={{ margin: 0, alignSelf: "flex-end", maxWidth: 300, color: ink }}>{scene === "again" ? "…" : kind === "run" && runSent ? runSent : d.again}</p>
              {scene !== "again" && <p style={{ margin: 0, maxWidth: 340 }}>On it.</p>}
            </div>
            {scene === "shape" && fold && shaping}
            <div style={{ minHeight: 36, marginBottom: 6, width: BOX }}>{line}</div>
            <Field w={BOX} h={52} focus={scene === "again"}>
              <span style={{ flex: 1, minWidth: 0, color: boxText ? ink : mute, fontSize: T.read[0], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{boxText || "Ask for one thing…"}</span>
              {scene === "again" && <Button h={30} acts onClick={send}>send</Button>}
              {kind === "run" && scene === "keep" && runAt >= 0 && boxText && <Button h={30} acts onClick={runSend}>send</Button>}
            </Field>
          </section>
          {/* the stage */}
          <section style={{ position: "absolute", left: sx, top: sy, width: sw, height: sh, boxSizing: "border-box", overflow: "hidden", padding: 16, display: fold || sw < 80 ? "none" : undefined }}>
            <div style={{ opacity: scene === "shape" ? 0 : 1, transition: "opacity var(--d-turn) var(--e-move)", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ transform: (kind === "arrangement" || scene === "a month on") && kept && !undone ? `translateX(${sw - 32 - 300}px)` : "none", transition: "transform 320ms var(--e-reveal)", order: 0 }}><Card w={300} h={220}><Block title="the list" lines={["hours this month", "the rate", "send by Friday"]} /></Card></div>
              {kind === "look" && <Card w={300} h={160}><Block title="notes" lines={["what changed", "what to check"]} /></Card>}
              <div ref={place} style={{ width: MADE_W[spec.size], minHeight: 120, display: direct(kind) || scene === "a month on" ? "none" : undefined }}>
                {(kept || (kind === "learns" && scene !== "shape")) && !undone && !direct(kind) && (
                  <div className="k-pop">
                    <Made spec={kind === "learns" && !kept ? LEARNS_WAS : spec} state="kept" pulse={pulse} onFill={setBoxText} turned={scene === "back"} onTurn={(t) => go(t ? "back" : "keep")}
                      back={{ from: kind === "lent" ? `lent by Sam · ${d.since}` : `${d.count} ${d.what} · since ${d.since}`, may: `${MAY[spec.shape]} · in this folder, not shared`, onUndo: () => { setUndone(true); go("keep"); }, onChange: reshape,
                        ...(kind === "lent" ? {} : { people: ["Ana", "Jo"], lent: lentTo, onLend: (who: string) => setLentTo((l) => [...l, who]) }) }} />
                  </div>
                )}
              </div>
            </div>
            {kind === "closed" && kept && !undone && <div className="k-pop" style={{ position: "absolute", left: 16, bottom: 16 }}><Chip title="Terminal" kept /></div>}
            {kind === "closed" && !(kept && !undone) && scene !== "shape" && <div style={{ position: "absolute", left: 16, top: 252 }}><Card w={300} h={120}><div style={{ ...label, padding: 16 }}>terminal</div></Card></div>}
            {scene === "shape" && !fold && shaping}
            {scene === "first minute" && (
              <div className="k-pop" style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${SHADE.steps.box})`, display: "grid", placeItems: "center" }}>
                <Card w={520} step="pop">
                  <div style={{ padding: 20 }} data-yours-first={first}>
                    <div style={{ ...label, marginBottom: 8 }}>Build settings › switches</div>
                    {/* the switch's row: its name, the one line about Jev, and (a second after it goes on) how many were found */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: ink, fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}>yours</div>
                        <div style={{ color: dim, fontSize: T.label[0], lineHeight: `${T.label[1]}px` }}>Offers what you repeat. Jev is told numbers and kinds only. Never your words.</div>
                      </div>
                      {first === 2 && <span className="yo-rise" data-yours-found style={{ color: dim, fontSize: T.label[0], whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{foundN === 0 ? "3 found" : foundN === 1 ? "1 found" : ""}</span>}
                      <button type="button" role="switch" aria-checked={first > 0} aria-label="yours" onClick={turnOn} style={{ all: "unset", cursor: "pointer", flex: "none", width: 34, height: 20, borderRadius: 10, boxSizing: "border-box", background: first ? on(SHADE.on.ink) : "transparent", boxShadow: first ? undefined : `inset 0 0 0 1px ${on(SHADE.on.mute)}`, position: "relative", transition: "background var(--d-turn) var(--e-move)" }}>
                        <span style={{ position: "absolute", top: 3, left: first ? 17 : 3, width: 14, height: 14, borderRadius: 7, background: first ? "#000" : on(SHADE.on.dim), transition: "left var(--d-turn) var(--e-move)" }} />
                      </button>
                    </div>
                    {first > 0 && <div style={{ borderTop: `1px solid ${on(SHADE.on.line)}`, marginTop: 12, paddingTop: 16 }}>
                      <div style={{ ...label, marginBottom: 4 }}>Build settings › yours</div>
                      {first === 1 ? <Reading /> : foundN === 3 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }} data-yours-none>
                          <span style={{ width: 96, height: 28, borderRadius: CURVE.radius.row, border: `1px dashed ${on(SHADE.on.mute)}`, boxSizing: "border-box" }} /><span style={{ color: dim }}>Nothing yet. Your next ask shows here.</span>
                        </div>
                      ) : <>
                        {foundN < 2 && <><div style={{ color: mute, fontSize: T.label[0], lineHeight: `${T.label[1]}px`, margin: "8px 0 2px" }}>you repeat</div>
                        {/* the whole row is the press: settings closes, its versions stand over the session at once */}
                        <FoundRows onOpen={(id) => { onceAt.current = null; setOnce(null); openFound(id as Kind); }} rows={FOUND.slice(0, foundN === 0 ? 3 : 1).map((r) => { const v = DATA[r].versions[0]; return { id: r, title: v.title, blanks: v.fields.map((x) => ({ name: x.name, value: x.value })), count: DATA[r].count, since: DATA[r].since, opening: OPENING[r] }; })} /></>}
                        {/* fewer than three repeat: their last asks fill the rest, so there is always something of theirs to press */}
                        {foundN > 0 && <><div style={{ color: mute, fontSize: T.label[0], lineHeight: `${T.label[1]}px`, margin: "8px 0 2px" }}>you asked</div>
                        <FoundRows onOpen={openOnce} rows={ONCE.slice(0, foundN === 1 ? 2 : 3).map((o) => ({ id: o.id, title: o.versions[0].title, blanks: o.versions[0].fields.map((x) => ({ name: x.name, value: x.value })), count: 1, since: o.when, opening: o.opening }))} /></>}
                      </>}
                    </div>}
                  </div>
                </Card>
              </div>
            )}
            {scene === "list" && (
              <div className="k-pop" style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${SHADE.steps.box})`, display: "grid", placeItems: "center" }}>
                <Card w={520} step="pop">
                  <div style={{ padding: 20 }}>
                    <div style={{ ...label, marginBottom: 12 }}>Build settings › yours</div>
                    {q.get("empty") ? <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }}>
                      <span style={{ width: 96, height: 28, borderRadius: CURVE.radius.row, border: `1px dashed ${on(SHADE.on.mute)}`, boxSizing: "border-box" }} /><span style={{ color: dim }}>Build keeps what you repeat here.</span>
                    </div> : [{ t: spec.title, b: blanks, n: `${d.count} ${d.what} · since ${d.since}`, u: undone }, { t: "Where it stands", b: [], n: "31 asks · since 2 Nov", u: false }, { t: "Shorter", b: [], n: "4 corrections · since 9 Nov", u: true }].map((r, i) => gone.includes(i) ? null : forgot === i ? (
                      <div key={i} data-yours-forgot style={{ display: "flex", alignItems: "center", gap: 12, height: 48, borderTop: i ? `1px solid ${on(SHADE.on.line)}` : undefined }}>
                        <span style={{ flex: 1, color: mute, fontSize: T.label[0] }}>forgotten</span><Quiet onClick={() => setForgot(null)}>undo</Quiet>
                      </div>
                    ) : (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, height: 48, borderTop: i ? `1px solid ${on(SHADE.on.line)}` : undefined }}>
                        {i === 0 && kind === "look" && !r.u ? <LayPick versions={LAYS} kept={layKept} onTry={setTryI} onKeep={setLayKept} /> : <Chip title={r.t} blanks={r.b} kept undone={r.u} lead={i === 0 && kind === "look" ? <LayGlyph lay={LAYS[layKept].lay} /> : undefined} />}
                        <span style={{ flex: 1, color: dim, fontSize: T.label[0] }}>{r.n}</span>
                        <Quiet onClick={i === 0 ? () => setUndone((u) => !u) : undefined}>{r.u ? "bring it back" : "undo"}</Quiet>
                        {r.u && <Quiet onClick={() => forget(i)}>forget</Quiet>}
                      </div>
                    ))}
                    {jev === 2 && <>
                      <div style={{ ...label, margin: "16px 0 4px" }}>noticed</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }}>
                        <Chip title={d.versions[0].title} blanks={d.versions[0].fields.map((x) => ({ name: x.name, value: x.value }))} onPress={() => { setJev(0); go("shape"); }} /><span style={{ flex: 1, color: dim, fontSize: T.label[0] }}>{d.count} {d.what} · since {d.since}</span><Quiet onClick={() => { setJev(0); go("shape"); }}>see it made</Quiet>
                      </div>
                    </>}
                    <div style={{ ...label, margin: "16px 0 4px" }}>passed</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }}>
                      <Chip title="Terminal, put away" /><span style={{ flex: 1, color: mute, fontSize: T.label[0] }}>yesterday</span><Quiet>offer it again</Quiet>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </section>
        </div>
      </Glass>
      <style>{`@keyframes yo-beat { to { opacity: .35; } } .yo-rise { animation: yo-rise var(--d-reveal) var(--e-reveal) both; } @keyframes yo-rise { from { opacity: 0; transform: translateY(4px); } } :root{--base-color:#000000} html,body{background:#000}`}</style>
    </div>
  );
}

const Line = ({ on: lit, children }: { on: boolean; children: ReactNode }) => (
  <div data-yours-line style={{ display: "flex", alignItems: "center", gap: 10, height: 36, padding: "0 4px", opacity: lit ? 1 : 0, transform: lit ? "none" : "translateY(4px)", pointerEvents: lit ? "auto" : "none", transition: "opacity var(--d-reveal) var(--e-reveal), transform var(--d-reveal) var(--e-reveal)" }}>
    <Pearl w={18} h={18} r={9} />{children}
  </div>
);
const Quiet = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
  <button type="button" onClick={onClick} style={{ all: "unset", cursor: "pointer", color: dim, fontSize: T.label[0], padding: "0 4px", whiteSpace: "nowrap" }}>{children}</button>
);
const Block = ({ title, lines }: { title: string; lines: string[] }) => (
  <div style={{ padding: 16 }}>
    <div style={{ ...label, marginBottom: 8 }}>{title}</div>
    {lines.map((l, i) => <Row key={l} w={268} h={32} title={l} lead={<span style={{ width: 8, height: 8, borderRadius: 4, boxShadow: `inset 0 0 0 1px ${i ? on(SHADE.on.mute) : on(SHADE.on.ink)}`, background: i ? "transparent" : on(SHADE.on.ink) }} />} />)}
  </div>
);

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
