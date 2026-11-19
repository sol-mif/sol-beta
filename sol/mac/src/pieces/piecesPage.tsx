// Build mode as one space of pieces (mine, 2026-11-12): everything right of the two sidebars is one space, and the
// chat, the box and each artifact are pieces of it, arranged by one rule (arrange.ts). The real pieces his window runs
// (Side, WorkTalk, Composer, the artifacts' Frame and kinds) on one session told in 24 moments, so the whole range is
// judged on the real code. Dev only, like space.html: not in the face's build inputs; nothing reaches the engine.
//   pieces.html           the moments, stepped by the strip above the window (← → and space play them)
//   pieces.html?m=8       start at that moment · ?play=1 play them · ?measure=1 keep each frame's time in window.__pc
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import type { Item, Work, WorkSession } from "../work/useWork";
import type { useEngine } from "../useEngine";
import { WorkTalk } from "../work/WorkTalk";
import { Composer, type Draft } from "../work/Composer";
import { Side, SIDE } from "../home/Side";
import { black, TYPE } from "../kit/paint";
import { SHADE } from "../kit/tokens";
import { setStageWhole } from "../flag";
import { EMPTY, type StageStore } from "../stage/store";
import { fixture } from "../stage/fixture";
import type { Block, State } from "../stage/model";
import { BOX, TALK, move, type Layout } from "./arrange";
import { HAND0, Space, type Hand } from "./Space";
import { asksOf, saidOf } from "./lead";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../work/work.css";
import "../home/home.css";
import "../stage/stage.css";
import "../stage/space.css";
import "./pieces.css";

setStageWhole(true);
const q = new URLSearchParams(location.search);
const FRAMED = window.parent !== window;
const session = "pieces", NOW = Date.now(), M = 60_000;
const P = "/Users/you/computer/personal/projects/";
const ses = (id: string, title: string, ago: number, o: Partial<WorkSession> = {}): WorkSession => ({ id, title, cwd: P + "sol", project: P + "sol", updatedAt: NOW - ago, ...o });
const SESSIONS = [ses(session, "The sidebar, from the kit", 0, { pinned: true }), ses("logo", "Buildmode default logo and app icon", 4 * M), ses("onb", "Home mode onboarding", 12 * M), ses("gtm", "Sol go-to-market: first 100 testers", 40 * M), ses("dev", "Sol-dev dev review, 2026-11-10", 90 * M, { unread: true })];
const quiet: StageStore = { read: () => EMPTY, subscribe: () => () => {}, compose() {}, place() {}, update() {}, freeze() {}, close() {}, carry() {}, pull() {} };

// one session, told once; a moment shows it up to a point
let seq = 0;
const tool = (name: string, input: object, o: Partial<Item> = {}): Item => ({ id: `t${++seq}`, kind: "tool", name, input, done: true, ok: true, at: NOW - 6 * M, ...o });
const sh = (description: string, o: Partial<Item> = {}) => tool("Bash", { description, command: "cd sol/mac && grep -n className src/home/Side.tsx" }, o);
const going = (description: string) => sh(description, { done: false, ok: undefined, at: NOW - 4000 });
const ASK = "rebuild the sidebar from the kit. write the brief first, show me three stills of it, then change Side.tsx and run the gate on the NucBox";
const me1: Item = { id: "m1", kind: "me", at: NOW - 30 * M, text: ASK };
const look = [tool("Read", { file_path: P + "sol/sol/mac/src/home/Side.tsx" }), tool("Read", { file_path: P + "sol/sol/mac/src/kit/index.ts" }), sh("List the kit's pieces the sidebar can use")];
const y1: Item = { id: "y1", kind: "you", text: "The plan is beside this: four steps. I start with the brief." };
const brief = [tool("Write", { file_path: P + "sol/sol/design/side/brief.md", content: "the side" }), sh("Check the brief against the kit's tokens")];
const y2: Item = { id: "y2", kind: "you", text: "The brief is written. What it says, in short:\n\n**One list, two depths.** The rail holds the modes and never moves. The second layer holds this mode's sessions, grouped the way you pick below.\n\n**Every row is the kit's Row.** The hand-made rows go: one height, one radius, the pearl bar on the row you are in. A session that needs you wears the yellow dot and nothing else does.\n\n**Nothing is said twice.** A session's state is its dot; the count of what needs you is on the mode's mark only.\n\n**What is cut.** The search field (the filter is the first thing you type), the three fold arrows, and the footer's second settings button." };
const ask: Item = { id: "w1", kind: "wrap", recap: "The brief is written. One thing is yours before I draw it.", ask: "Sessions grouped by project, or one list by time?", actions: [{ label: "by project", message: "by project" }, { label: "by time", message: "by time" }] };
const me2: Item = { id: "m2", kind: "me", at: NOW - 16 * M, text: "by project" };
const draw = [tool("mcp__sol__browser_open", { url: "http://localhost:1420/side-hold.html" }), tool("mcp__sol__browser_screenshot", {}), tool("mcp__sol__browser_screenshot", {}), tool("mcp__sol__browser_screenshot", {})];
const y3: Item = { id: "y3", kind: "you", text: "Three stills are up: at rest, under the hand, and folded. Keep the ones that read right." };
const me3: Item = { id: "m3", kind: "me", at: NOW - 9 * M, text: "keep the first and the third. go on" };
const change = [tool("Edit", { file_path: P + "sol/sol/mac/src/home/Side.tsx", old_string: "a", new_string: "b" }), tool("Edit", { file_path: P + "sol/sol/mac/src/home/home.css", old_string: "a", new_string: "b" }), sh("Run the face's tests")];
const y4: Item = { id: "y4", kind: "you", text: "Side.tsx is changed: 41 lines out, 18 in. The gate is running on the NucBox." };
const gate = [sh("Start the gate on the NucBox"), sh("Read the gate's last lines")];
const packed: Item = { id: "c1", kind: "compact", text: "the talk so far was summarised (148k tokens), by itself" };
const end: Item = { id: "w2", kind: "wrap", recap: "The sidebar is rebuilt from the kit: two files changed, the gate is green on the NucBox. Not done: the wide state.", ask: "Try it in your window?", actions: [{ label: "show me", message: "show me the sidebar" }] };
const upTo = { asked: [me1, ...look], plan: [me1, ...look, y1], brief: [me1, ...look, y1, ...brief], read: [me1, ...look, y1, ...brief, y2], asks: [me1, ...look, y1, ...brief, y2, ask] };
const stills = [...upTo.read, ask, me2, ...draw, y3], changed = [...stills, me3, ...change, y4], ran = [...changed, ...gate];

type Moment = { name: string; why: string; items: Item[]; busy?: boolean; open?: string[]; away?: string[]; lead?: string; win?: [number, number]; draft?: string; hand?: (l: Layout) => Layout; held?: string[]; large?: string; small?: boolean; state?: Record<string, State> };
const PLAN = "k-plan", BRIEF = "k-brief", STILLS = "stills", DIFF = "side-diff", TERM = "k-term", SITE = "k-site", RUNS = "k-runs", GATE = "k-card";
const ALSO = [PLAN, BRIEF, DIFF, TERM, SITE, RUNS, GATE];
const MOMENTS: Moment[] = [
  { name: "a new session", why: "nothing said yet: the box alone, in the middle", items: [] },
  { name: "a long ask", why: "the box grows with what you type; nothing else moves", items: [], draft: ASK + "\n\nkeep the rail as it is. the second layer is what changes: every row the kit's Row, nothing said twice, and cut what nobody uses" },
  { name: "working, nothing made", why: "the talk and the box are one column; no empty half waits beside them", items: [...upTo.asked.slice(0, 3), going("List the kit's pieces the sidebar can use")], busy: true },
  { name: "the plan arrives", why: "a list stands beside the talk, no wider than it reads; the talk keeps the room", items: upTo.plan, open: [PLAN] },
  { name: "the brief is being written", why: "what is being made leads: the talk gives it the room", items: [...upTo.brief.slice(0, -1), going("Check the brief against the kit's tokens")], busy: true, open: [BRIEF, PLAN], lead: BRIEF, state: { [BRIEF]: "working" } },
  { name: "a long answer", why: "you are reading: the talk leads again, the artifacts stack", items: upTo.read, open: [BRIEF, PLAN] },
  { name: "Sol asks you", why: "a question is in the talk: nothing moves, the answer is one press", items: upTo.asks, open: [BRIEF, PLAN] },
  { name: "an artifact waits on your yes", why: "the stills lead and are the one thing that asks for the eye", items: stills, open: [STILLS, BRIEF, PLAN], lead: STILLS, state: { [STILLS]: "waits" } },
  { name: "three at work", why: "the one being changed beside the other two", items: [...changed.slice(0, -1), going("Run the face's tests")], busy: true, open: [DIFF, STILLS, PLAN], lead: DIFF, state: { [DIFF]: "working" } },
  { name: "three at work, the chat made small", why: "your – on the chat: it gives its column to the three and stays as one line on the box, saying what Sol does now", items: [...changed.slice(0, -1), going("Run the face's tests")], busy: true, open: [DIFF, STILLS, PLAN], lead: DIFF, state: { [DIFF]: "working" }, small: true },
  { name: "six made", why: "three stand open; the others are put away by name, one press to bring back", items: changed, open: [DIFF, TERM, PLAN], away: [BRIEF, STILLS, SITE], lead: TERM, state: { [TERM]: "working" } },
  { name: "reading the change", why: "one artifact and the talk at its floor", items: changed, open: [DIFF], away: [TERM, PLAN, BRIEF, STILLS, SITE], lead: DIFF },
  { name: "the gate runs", why: "the terminal leads; the site it checks stands beside it", items: [...ran.slice(0, -1), going("Read the gate's last lines")], busy: true, open: [TERM, SITE], away: [DIFF, PLAN, BRIEF, STILLS], lead: TERM, state: { [TERM]: "working" } },
  { name: "one taken large", why: "the piece, the box, and the chat as its last line on the box: press the line for more of it", items: ran, open: [SITE, TERM], away: [DIFF, PLAN, BRIEF, STILLS], lead: SITE, large: SITE },
  { name: "large, Sol at work", why: "the line says what Sol is doing now, as it does it", items: [...ran.slice(0, -1), going("Read the gate's last lines")], busy: true, open: [SITE, TERM], away: [DIFF, PLAN, BRIEF, STILLS], lead: SITE, large: SITE },
  { name: "large, Sol asks you", why: "a question to you is never one line: the chat opens far enough to show it and its answer", items: [...ran, end], open: [SITE, TERM], away: [DIFF, PLAN, BRIEF, STILLS], lead: SITE, large: SITE },
  { name: "moved by your hand", why: "the talk carried to the right: it is held there (the pearl grip) until you let it go", items: ran, open: [DIFF, TERM, PLAN], away: [BRIEF, STILLS, SITE], lead: DIFF, hand: (l) => move(l, TALK, { before: l.cols.length }), held: [TALK] },
  { name: "the box across the foot", why: "the box pulled to the bottom edge: the talk takes the column's whole height", items: ran, open: [DIFF, TERM], away: [PLAN, BRIEF, STILLS, SITE], lead: DIFF, hand: (l) => move(l, BOX, { foot: true }), held: [BOX] },
  { name: "half the screen", why: "the change would be too narrow to read beside the chat: the chat gives way to its last lines", items: ran, open: [DIFF, TERM], away: [PLAN, BRIEF, STILLS, SITE], lead: DIFF, win: [1140, 1070] },
  { name: "half the screen, reading", why: "Sol wrote to you: the chat takes its column back and the change stands beside it", items: [...ran, end], open: [DIFF, TERM], away: [PLAN, BRIEF, STILLS, SITE], win: [1140, 1070] },
  { name: "a small window", why: "one thing at a time: what leads, over the chat's last lines", items: ran, open: [DIFF, TERM], away: [PLAN, BRIEF, STILLS, SITE], lead: DIFF, win: [960, 760] },
  { name: "a wide window", why: "the same rule with more room; the talk never grows past where it reads", items: ran, open: [DIFF, TERM, RUNS], away: [PLAN, BRIEF, STILLS, SITE], lead: DIFF, win: [2240, 1260] },
  { name: "coming back", why: "an old session opens as it was left: the talk, the last thing shown, the rest by name", items: [packed, ...ran.slice(-6)], open: [GATE], away: [DIFF, TERM, PLAN, BRIEF, STILLS, SITE] },
  { name: "done", why: "the recap leads; the result stands beside it", items: [packed, ...ran.slice(-6), end], open: [GATE, DIFF], away: [TERM, PLAN, BRIEF, STILLS, SITE] },
];

type S = { open: string[]; away: string[]; lead: string };

function Page() {
  useEffect(() => { if (FRAMED) parent.postMessage({ pieces: { w: win[0] + 24, h: win[1] + 52 } }, "*"); });
  const [blocks, setBlocks] = useState<Record<string, Block> | null>(null);
  const [m, setM] = useState(() => Math.max(0, Math.min(MOMENTS.length - 1, +(q.get("m") ?? 1) - 1)));
  const [play, setPlay] = useState(q.get("play") === "1");
  const [draft, setDraft] = useState<Draft>({ text: "", atts: [] });
  const [aside, setAside] = useState(false);
  const [view, setView] = useState({ w: innerWidth, h: innerHeight });
  const mo = MOMENTS[m], win = mo.win ?? [1710, 1070];
  const enter = (x: Moment): S => ({ open: x.open ?? [], away: x.away ?? [], lead: x.lead ?? TALK });
  const [s, set] = useState<S>(() => enter(mo));
  const [hand, setHand] = useState<Hand>(() => ({ ...HAND0, held: mo.held ?? [], large: mo.large ?? null, talk: !mo.small }));
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void fixture(ALSO).then((f) => setBlocks(Object.fromEntries(f.blocks.map((b) => [b.id, b])))); }, []);
  useEffect(() => { set(enter(mo)); setHand({ ...HAND0, held: mo.held ?? [], large: mo.large ?? null, talk: !mo.small }); setDraft({ text: mo.draft ?? "", atts: [] }); }, [m]);
  useEffect(() => { if (!play) return; const t = setInterval(() => setM((i) => (i + 1) % MOMENTS.length), 2600); return () => clearInterval(t); }, [play]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input")) return;
      if (e.key === "ArrowRight") setM((i) => Math.min(MOMENTS.length - 1, i + 1)); else if (e.key === "ArrowLeft") setM((i) => Math.max(0, i - 1));
      else if (e.key === " ") { e.preventDefault(); setPlay((p) => !p); }
    };
    const size = () => setView({ w: innerWidth, h: innerHeight });
    addEventListener("keydown", key); addEventListener("resize", size);
    return () => { removeEventListener("keydown", key); removeEventListener("resize", size); };
  }, []);
  useEffect(() => { if (q.get("measure") !== "1") return; const f: number[] = []; (window as any).__pc = f; let last = performance.now(), on = true; const tick = (t: number) => { f.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return () => { on = false; }; }, []);

  // what is open and what is put away is the moment's here (Build: the stage store's folds)
  const onAway = (id: string) => set((v) => ({ ...v, open: v.open.filter((x) => x !== id), away: [id, ...v.away.filter((x) => x !== id)], lead: v.lead === id ? TALK : v.lead }));
  const onClose = (id: string) => set((v) => ({ ...v, open: v.open.filter((x) => x !== id), away: v.away.filter((x) => x !== id), lead: v.lead === id ? TALK : v.lead }));
  const onBring = (id: string, out?: string) => set((v) => ({ lead: id, open: [id, ...v.open.filter((x) => x !== id && x !== out)], away: [...(out ? [out] : []), ...v.away.filter((x) => x !== id)] }));

  const w = useMemo(() => ({
    sessions: SESSIONS, runs: {}, loaded: true, order: [], groups: [], freshCwd: "", live: session, thread: { sessionId: session, items: mo.items }, threads: {}, projects: [{ path: P + "sol", name: "sol", count: SESSIONS.length }],
    run: { sessionId: session, busy: !!mo.busy, waiting: 0, cwd: P + "sol", model: "claude-fable-5-2", effort: "medium", mode: "bypassPermissions", fast: false, context: 61000, window: 200000 },
    mode: "bypassPermissions", model: "claude-fable-5-2", effort: "medium", fast: false, copy: null, error: "", prefs: {}, files: { files: [] }, current: null,
    say: () => true, stop: () => {}, adjust: () => {}, fresh: () => {}, fork: () => {}, forkHere: () => {}, mark: () => {}, rename: () => {}, folder: () => {}, peek: () => {}, unpeek: () => {}, open: () => {}, setCopy: () => {}, readNow: () => {}, drop: () => {}, aside: () => {}, dropAside: () => {}, sideAnswer: null,
  }) as unknown as Work, [m]);
  const e = useMemo(() => ({ up: true, flash: () => {}, settings: {}, setSettings: () => {}, models: { seats: [] }, efforts: ["low", "medium", "high"], health: null, send: () => {}, hear: () => {}, heardCb: { current: () => {} }, partialCb: { current: () => {} } }) as unknown as ReturnType<typeof useEngine>, []);

  const talk = useMemo(() => <WorkTalk items={mo.items} busy={!!mo.busy} w={w} view="normal" onFresh={() => {}} onLink={() => {}} />, [w]);
  const boxEl = <div data-kind="bar" tabIndex={-1} className="hc-barbox"><Composer w={w} e={e} busy={!!mo.busy} working={!!mo.busy} cwd={P + "sol"} asideOn={aside} setAsideOn={setAside} box={box} onSent={() => {}} onRec={() => {}} d={draft} setD={setDraft} clean staged /></div>;
  const side = useMemo(() => <Side w={w} width={SIDE} live={session} wide={false} onOpen={() => {}} onBeside={() => {}} onFresh={() => {}} onWide={() => {}} onSettings={() => {}} onMode={() => {}} stageStore={quiet} />, [w]);
  const stateOf = useCallback((id: string) => mo.state?.[id], [m]); // eslint-disable-line react-hooks/exhaustive-deps
  // inside another page (the stage shows this one in a frame) the frame is sized to the window and scaled from outside:
  // a transform here would shrink what the kit's glass measures of itself
  const k = FRAMED ? 1 : Math.min(1, (view.w - 24) / win[0], (view.h - 52) / win[1]);
  return (
    <div className="pc-page" style={TYPE}>
      <div className="pc-strip">
        <button onClick={() => setM((i) => Math.max(0, i - 1))} aria-label="the moment before">‹</button>
        <span className="pc-ticks">{MOMENTS.map((x, i) => <button key={i} className={i === m ? "on" : ""} title={x.name} aria-label={x.name} onClick={() => { setPlay(false); setM(i); }} />)}</span>
        <button onClick={() => setM((i) => Math.min(MOMENTS.length - 1, i + 1))} aria-label="the next moment">›</button>
        <button onClick={() => setPlay((p) => !p)}>{play ? "pause" : "play"}</button>
        <b>{m + 1} · {mo.name}</b><i>{mo.why}</i>
      </div>
      <div className="pc-win" style={{ width: win[0], height: win[1], transform: `translateX(${(-win[0] * k) / 2}px) scale(${k})`, background: `url(${desk}) center/cover` }}>
        <div className="face hc" style={{ height: "100%", background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }}>
          <div className="hc-main">
            {side}
            <section className="hc-talk">
              {blocks && <Space key={m} session={session} blocks={blocks} open={s.open} away={s.away} lead={s.lead} empty={!mo.items.length} talk={talk} said={saidOf(mo.items, !!mo.busy)} asks={asksOf(mo.items, !!mo.busy)} box={boxEl}
                hand={hand} setHand={setHand} onAway={onAway} onClose={onClose} onBring={onBring} stateOf={stateOf} onHold={() => setPlay(false)} seed={mo.hand} attrs={{ "data-moment": m + 1 }} />}
            </section>
          </div>
        </div>
      </div>
      {blocks && <div data-ready style={{ display: "none" }} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
