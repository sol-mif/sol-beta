// Build mode as one space (mine, 2026-11-12): the real pieces his window runs (Side, StageColumn, WorkTalk, Composer,
// the stage and its artifacts), on a talk written for the page, so the space is judged on the real code. Dev only, like
// stage.html and side-hold.html: space.html is not in the face's build inputs; nothing reaches the engine.
//   space.html            a session at work: a long ask with attachments, runs of steps, a summary mark, three artifacts
//   space.html?n=0        the chat alone · ?folded=12 that many artifacts off the stage · ?busy=1 a run still going
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
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
import { StageColumn } from "./StageColumn";
import { LocalStore } from "./store";
import { pour } from "./fixture";
import type { Block } from "./model";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../work/work.css";
import "../home/home.css";

setStageWhole(true);
const q = new URLSearchParams(location.search), busy = q.get("busy") === "1";
const session = "space", NOW = Date.now(), M = 60_000;
const store = new LocalStore(`sol.space.page.${NOW}.`);
const P = "/Users/you/computer/personal/projects/";
const ses = (id: string, title: string, ago: number, o: Partial<WorkSession> = {}): WorkSession => ({ id, title, cwd: P + "sol", project: P + "sol", updatedAt: NOW - ago, ...o });
const SESSIONS = [ses(session, "Build mode as one space", 0, { pinned: true }), ses("logo", "Buildmode default logo and app icon", 4 * M), ses("onb", "Home mode onboarding", 12 * M), ses("gtm", "Sol go-to-market: first 100 testers", 40 * M), ses("dev", "Sol-dev dev review, 2026-11-10", 90 * M, { unread: true })];

let seq = 0;
const tool = (name: string, input: object, o: Partial<Item> = {}): Item => ({ id: `t${++seq}`, kind: "tool", name, input, done: true, ok: true, at: NOW - 6 * M, ...o });
const sh = (description: string, o: Partial<Item> = {}) => tool("Bash", { description, command: "cd /Users/you/computer/personal/projects/my-sol/sol/mac && grep -n className src/stage/StageColumn.tsx" }, o);
const ITEMS: Item[] = [
  { id: "m1", kind: "me", at: NOW - 30 * M, text: "show the week, the kit's side and a diff of Side.tsx" },
  tool("Read", { file_path: P + "sol/sol/mac/src/home/Side.tsx" }), tool("Read", { file_path: P + "sol/sol/mac/src/kit/index.ts" }),
  { id: "y1", kind: "you", text: "Three things are on the stage: the week, the kit's side, and what changed in Side.tsx." },
  { id: "c1", kind: "compact", text: "the talk so far was summarised (172k tokens), by itself" },
  { id: "m2", kind: "me", at: NOW - 8 * M, text: "ok first lets look at the formatting and ui mechanics within the chatbox and the chatbar (the default vanilla) i want to understand how everything is being controlled, and then in terms of UX design how to make it as well as stage fall into this harmonic cohesive system, currently what i already see is this, refer to ss1 and ss2, the margins, padding etc. formatting everything is wrong here, or more precisely unrefined, it works functionally but it feels like crap\n\nAttached: /Users/you/Library/Application Support/com.marcol04.sol/attachments/2026-11-12-image-4.png\nAttached: /Users/you/Library/Application Support/com.marcol04.sol/attachments/2026-11-12-image-5.png" },
  sh("Show the temporary measure on the page instead"), tool("mcp__sol__browser_open", { url: "http://localhost:1420/stage.html" }, { ok: false, out: "Browser error: page.goto: Timeout 30000ms exceeded." }),
  tool("mcp__sol__browser_read", {}), tool("mcp__sol__browser_find", {}), sh("Show the temporary debug line"), tool("mcp__sol__browser_screenshot", {}),
  sh("Find how the chat box is styled inside the talk"), tool("Edit", { file_path: P + "sol/sol/mac/src/stage/space.css", old_string: "a", new_string: "b" }),
  sh("Remove the debug line, move the margin onto the box"), tool("mcp__sol__browser_open", { url: "http://localhost:1420/stage.html" }),
  { id: "y2", kind: "you", text: "The box now sits on the same two edges as the words above it, and the gaps between things come from four named sizes in one file. **Not seen in your window yet.**" },
  { id: "m3", kind: "me", at: NOW - 2 * M, text: "much better now and then lets come back to the space issue" },
  sh("List the face's files and the stage and kit folders"), tool("Read", { file_path: "a" }), tool("Read", { file_path: "b" }), tool("Read", { file_path: "c" }),
  sh("Read the existing dev pages and the kit's index"), sh("Read how the sidebar dev page mounts the real Side"), sh("Find how the real talk, box and spine are mounted", busy ? { done: false, ok: undefined, at: NOW - 4000 } : {}),
  ...(busy ? [] : [{ id: "y3", kind: "you", text: "Build mode is one space now: the sessions, the chat and what Sol makes are pieces of it. Each one can be small, normal or wide, and Sol sets them for the work in front of you." },
    { id: "w1", kind: "wrap", recap: "The chat reads calmer: a run of steps is one line, the summary is a mark that room was made. Not done: the pieces' three sizes.", ask: "Does the chat read calmer?", actions: [{ label: "it does", message: "the chat reads calmer" }] }] as Item[]),
];

function Page() {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft>({ text: "", atts: [] });
  const [aside, setAside] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    void pour(store, session, +(q.get("n") ?? 3)).then(() => {
      const more = +(q.get("folded") ?? 0);
      const names = ["chat-system.html", "several-stages.html", "the session's space", "localhost:1420/stage.html", "Side.tsx, what changed", "the gate's run", "kit: the pieces", "the week, v2"];
      for (let i = 0; i < more; i++) {
        const b: Block = { id: `f${i}`, kind: (["page", "page", "list", "browser", "diff", "terminal", "page", "table"] as const)[i % 8], title: names[i % 8], state: "live", versions: [], sessions: [i < 5 ? session : "logo"] };
        store.compose(session, b, { x: 12, y: 12, w: 400, h: 300, z: 10 + i, folded: true });
      }
      setReady(true);
    });
  }, []);
  const w = useMemo(() => ({
    sessions: SESSIONS, runs: {}, loaded: true, order: [], groups: [], freshCwd: "", live: session, thread: { sessionId: session, items: ITEMS }, threads: {}, projects: [{ path: P + "sol", name: "sol", count: SESSIONS.length }],
    run: { sessionId: session, busy, waiting: 0, cwd: P + "sol", model: "claude-fable-5-2", effort: "medium", mode: "bypassPermissions", fast: false, context: 61000, window: 200000 },
    mode: "bypassPermissions", model: "claude-fable-5-2", effort: "medium", fast: false, copy: null, error: "", prefs: {}, files: { files: [] }, current: null,
    say: () => true, stop: () => {}, adjust: () => {}, fresh: () => {}, fork: () => {}, forkHere: () => {}, mark: () => {}, rename: () => {}, folder: () => {}, peek: () => {}, unpeek: () => {}, open: () => {}, setCopy: () => {}, readNow: () => {}, drop: () => {}, aside: () => {}, dropAside: () => {}, sideAnswer: null,
  }) as unknown as Work, []);
  const e = useMemo(() => ({ up: true, flash: () => {}, settings: {}, setSettings: () => {}, models: { seats: [] }, efforts: ["low", "medium", "high"], health: null, send: () => {}, hear: () => {}, heardCb: { current: () => {} }, partialCb: { current: () => {} } }) as unknown as ReturnType<typeof useEngine>, []);
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover fixed` }}>
      <div className="face hc" style={{ height: "100%", background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }}>
        <div className="hc-main">
          <Side w={w} width={SIDE} live={session} wide={false} onOpen={() => {}} onBeside={() => {}} onFresh={() => {}} onWide={() => {}} onSettings={() => {}} onMode={() => {}} stageStore={store} />
          <section className="hc-talk">
            {ready && <StageColumn store={store} session={session} items={ITEMS} busy={busy} writing={draft.text.trim() !== ""} onType={() => {}}
              talk={(shown) => <WorkTalk items={shown} busy={busy} w={w} view="normal" onFresh={() => {}} onLink={() => {}} />}
              box={<div data-kind="bar" tabIndex={-1} className="hc-barbox"><Composer w={w} e={e} busy={busy} working={busy} cwd={P + "sol"} asideOn={aside} setAsideOn={setAside} box={box} onSent={() => {}} onRec={() => {}} d={draft} setD={setDraft} clean staged /></div>} />}
          </section>
        </div>
      </div>
      {ready && <div data-ready style={{ display: "none" }} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
