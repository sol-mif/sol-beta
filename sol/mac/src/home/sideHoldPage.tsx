// Build's sidebar, "hold it" (mine, 2026-11-11): the real Side (Side.tsx, side.css, sideArts.tsx), not a drawing of it,
// on sessions written for the page, so the look is judged on the code his window runs. Dev only, like kit/stage.tsx:
// side-hold.html is not in the face's build inputs. The session names are his own (the sidebar, this morning); the
// states and the artifacts are written for the page. The page keeps its own sessions, so a drag onto a folder, a pin, a
// rename and a hide all answer here; nothing reaches the engine.
//   side-hold.html            at rest
//   side-hold.html?edit=1     (press edit) · ?quiet=1 nothing needs you, nothing runs
//   press "sessions" at the foot: every session, read in plain words (sideAll.tsx); a session pressed reads its thread
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import type { Work, WorkSession, RunInfo } from "../work/useWork";
import type { StageStore, Seen } from "../stage/store";
import { EMPTY } from "../stage/store";
import type { Block } from "../stage/model";
import { black, TYPE } from "../kit/paint";
import { SHADE } from "../kit/tokens";
import { Side, SIDE } from "./Side";
import { dur } from "../motion";
import type { Metas } from "./meta";
// the builders' first prompts, as they were typed: their issue numbers read as colours to the look lint, so they live as data
import PROMPTS from "./sideHoldPage.prompts.json";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../work/work.css";
import "./home.css";

export const meta = {
  HoldPage: {
    job: "a dev page (side-hold.html, not in the build): the real side on sessions written for the page, so the look is judged on the code the window runs; every press answers on the page, nothing reaches the engine",
    flow: "pickup",
    states: ["at rest", "edit (?edit=1)", "quiet (?quiet=1: nothing needs you, nothing runs)", "wide", "every session open"],
    keys: [
      { press: "click a session", does: "makes it the open one and says so on the page" },
      { press: "any press on the side (pin, rename, hide, drag onto a folder, a new session, settings)", does: "answers on the page with what the engine would have been asked" },
    ],
    listens: ["the page's own sessions, threads and stages (a fake work and stage store)", "the address's ?edit and ?quiet"],
  },
} satisfies Metas;

const q = new URLSearchParams(location.search), quiet = q.get("quiet") === "1";
const NOW = Date.now(), M = 60_000, H = 60 * M;
const P = "/Users/you/computer/personal/projects/";
const ses = (id: string, title: string, proj: string, ago: number, o: Partial<WorkSession> = {}): WorkSession => ({ id, title, cwd: P + proj, project: P + proj, updatedAt: NOW - ago, ...o });
const SESSIONS: WorkSession[] = [
  ses("gtm", "Sol go-to-market: first 100 testers", "sol", 9 * M),
  ses("stage", "Build mode stage layout and feel", "sol", 40 * M, { pinned: true }),
  ses("stage-k", "shoot every stage state", "sol", 50 * M, { parent: "stage", done: true }),
  ses("review", "dev review · Sun 1 Nov", "sol", 2 * H, { pinned: true }),
  ses("pers", "Personalization discussion", "sol", 5 * H, { pinned: true }),
  ses("logo", "Buildmode default logo and app icon", "sol", 1 * M),
  ses("onb", "Home mode onboarding", "sol", 2 * M),
  ses("onb-k", "walk it as a first-timer", "sol", 2 * M, { parent: "onb" }),
  ses("dev", "Sol-dev dev review, 2026-11-10", "sol", 6 * M, { unread: true }),
  ses("logo2", "Buildmode default logo session", "sol", 11 * M),
  ses("rig", "Sol build orchestration with OpenRig", "sol", 3 * H),
  ses("tour", "Marco's Sol tour feedback", "sol", 8 * H),
  ses("hand", "Sol build orchestration handover", "sol", 18 * H),
  ses("hand-1", "read the OpenRig source", "sol", 19 * H, { parent: "hand", done: true }),
  ses("hand-2", "map the session tools", "sol", 19 * H, { parent: "hand", done: true }),
  ses("hand-3", "write the handover", "sol", 18 * H, { parent: "hand", done: true }),
  ses("k1", "Kaat: the price sheet", "kaat", 4 * H), ses("k2", "Kaat: card scans", "kaat", 9 * H), ses("k3", "Kaat: the landing page", "kaat", 20 * H),
  ses("m1", "Masakali menu", "masakali", 6 * H), ses("m2", "Masakali: the booking form", "masakali", 21 * H),
  ses("c1", "NucBox backups", "computer", 2 * H), ses("c2", "Legion runners", "computer", 7 * H), ses("c3", "dots: the sync", "computer", 12 * H), ses("c4", "almanac upkeep", "computer", 22 * H),
  ses("e1", "Whiteboard look", "sol", 30 * H), ses("e2", "Kit sitting", "sol", 50 * H), ses("e3", "Onboarding: dawn", "sol", 70 * H),
  // the sessions card's reading (sideAll.tsx): titles that are raw first prompts, two folders named "base", a failed one,
  // one put away; ?quiet=1 keeps them all quiet
  ses("step5", "# Step 5: the folders' agents inside Home mode (one builder, NucBox, a plain git copy of Marco's tree, branch marco/mine…", "sol", 3 * H, { unread: !quiet, machine: "nucbox", parent: "hand" }),
  ses("bD", PROMPTS.bD, "scratch/sol/tour4/base", 25 * M, { parent: "onb", machine: "nucbox", done: true }),
  ses("bA", PROMPTS.bA, "scratch/sol/tour4/base", 40 * M, { parent: "onb", machine: "nucbox", done: true }),
  ses("b3", PROMPTS.b3, "scratch/sol/tour3/base", 2 * H, { parent: "onb", machine: "nucbox" }),
  ses("kf", "Kaat: import the card scans from the shared drive and match each one to its price in the sheet", "kaat", 26 * H, { failed: !quiet }),
  ses("old", "Old logo tries", "sol", 12 * 24 * H, { archived: true }),
];
// what each session said (its thread), for the card's reading; the open one's is held, the rest come on a peek
const me = (text: string) => ({ id: `m${text.length}`, kind: "me", text }), you = (text: string) => ({ id: `y${text.length}`, kind: "you", text });
const wrap = (recap: string) => ({ id: `w${recap.length}`, kind: "wrap", recap });
const THREADS: Record<string, { kind: string; [k: string]: unknown }[]> = {
  logo: [me("make Build mode's default logo and the app icon from the jelly body"), you("Three logo directions are on the stage."), wrap("Three logo directions are on the stage as one page; the app icon follows the one you pick. Not done: the small sizes.")],
  step5: [me("# Step 5: the folders' agents inside Home mode (one builder, NucBox, a plain git copy of Marco's tree). Each folder in Home gets its own agent that keeps its notes and answers about it."), you("Built and checked."), wrap("Each Home folder now has an agent that keeps the folder's notes and answers questions about it. Checked on the NucBox: 212 tests pass. Not done: the agent's picture on the folder card.")],
  bD: [me(PROMPTS.bDasked), you("Joined: the tour runs from the welcome to the first folder in one go, no gaps. Shots in tour4/shots.")],
  dev: [me("run the dev review for 10 Nov"), you("The review is on the stage: 4 PRs merged, 2 wait on Frank, 1 needs your word on the price page.")],
  kf: [me("Kaat: import the card scans from the shared drive and match each one to its price in the sheet"), you("The shared drive asked for a sign-in I cannot give, so no scan was read. Sign in once in the browser and ask again.")],
  gtm: [me("plan the first 100 testers for Sol"), you("Two ways to find them are drawn up; which one do you want first: the waitlist or your classmates?")],
};
const run = (o: Partial<RunInfo>): RunInfo => ({ sessionId: "", busy: false, waiting: 0, cwd: "", model: "", effort: "", mode: "default", fast: false, context: 0, window: 0, ...o }) as RunInfo;
const RUNS: Record<string, RunInfo> = quiet ? {} : {
  gtm: run({ waiting: 1 }), logo: run({ busy: true, since: NOW - 4 * M }), onb: run({ busy: true, since: NOW - 12 * M }), "onb-k": run({ busy: true, since: NOW - 3 * M }),
};

const blk = (id: string, kind: Block["kind"], title: string, from: string, ago: number, o: Partial<Block> = {}): Block => ({ id, kind, title, state: "live", versions: [{ at: NOW - ago } as never], sessions: [from], ...o });
const HERE: Block[] = [
  blk("a1", "page", "sidebar ideas", "logo", 1 * M, { bind: { source: "sol/mac/src/home/sideIdeas.tsx" } }),
  blk("a2", "list", "sidebar: needs you first", "logo", 12 * M),
  blk("a3", "page", "the two sidebar layers", "logo", 2 * H, { bind: { source: "sol/mine/look/side/layers.html" }, sessions: ["logo", "stage", "onb", "dev"] }),
];
const TRAY = [
  { id: "t1", kind: "shots" as const, title: "first run, 8 scenes", state: "live" as const, from: "onb", at: NOW - 1 * M },
  { id: "t2", kind: "card" as const, title: "the invite", state: "waits" as const, from: "gtm", at: NOW - 9 * M },
  { id: "t3", kind: "page" as const, title: "dev review, 10 Nov", state: "live" as const, from: "dev", at: NOW - 6 * M },
  { id: "t4", kind: "shots" as const, title: "stage states, 14 shots", state: "frozen" as const, from: "stage", at: NOW - 26 * H },
  { id: "t5", kind: "page" as const, title: "tour feedback, his words", state: "live" as const, from: "tour", at: NOW - 8 * H },
  { id: "t6", kind: "page" as const, title: "OpenRig handover", state: "live" as const, from: "hand", at: NOW - 18 * H },
];
const KAAT: Block[] = [blk("b1", "table", "the price sheet", "k1", 4 * H), blk("b2", "shots", "card scans, 40", "k2", 9 * H)];
const SEEN: Record<string, Seen> = {
  logo: { ...EMPTY, ready: true, blocks: HERE, stage: { ...EMPTY.stage, blocks: HERE.map((b, i) => ({ id: b.id, x: 0, y: 0, w: 400, h: 300, z: i }) as never) }, tray: TRAY },
  k1: { ...EMPTY, ready: true, blocks: KAAT },
};
const NOSTAGE: Seen = { ...EMPTY, ready: true };
const fake = { read: (id: string) => SEEN[id] ?? NOSTAGE, subscribe: () => () => {}, place: () => {}, pull: () => {}, compose: () => {}, update: () => {}, freeze: () => {}, close: () => {}, carry: () => {} } as unknown as StageStore;

function HoldPage() {
  const [sessions, setSessions] = useState(SESSIONS);
  const [live, setLive] = useState<string | null>("logo");
  const [wide, setWide] = useState(false);
  const [said, setSaid] = useState("press anything: it answers on this page, nothing reaches the engine");
  const [threads, setThreads] = useState<Record<string, { sessionId: string; items: unknown[] }>>(() => ({ logo: { sessionId: "logo", items: THREADS.logo } }));
  const w = useMemo(() => ({
    sessions, runs: RUNS, loaded: true, order: [], groups: [], freshCwd: "",
    projects: ["sol", "kaat", "masakali", "computer", "scratch"].map((n) => ({ path: P + n, name: n, count: sessions.filter((s) => s.project === P + n).length })),
    mark: (id: string, patch: Partial<WorkSession>) => { setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s))); setSaid(`work.mark ${id} ${JSON.stringify(patch)}`); },
    rename: (id: string, title: string) => setSessions((all) => all.map((s) => (s.id === id ? { ...s, title } : s))),
    fresh: (cwd?: string) => setSaid(`a new session${cwd ? ` in ${cwd.split("/").pop()}` : ""}`),
    folder: (op: string, path: string) => setSaid(`work.folder ${op} ${path}`),
    // work.peek answers a moment later with the thread, or an empty one
    threads, peek: (id: string) => { setSaid(`work.peek ${id}`); setTimeout(() => setThreads((t) => ({ ...t, [id]: { sessionId: id, items: THREADS[id] ?? [] } })), dur("glass")); },
    unpeek: (id: string) => setThreads((t) => { const n = { ...t }; if (id !== "logo") delete n[id]; return n; }),
  }) as unknown as Work, [sessions, threads]);
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover fixed` }}>
      <div className="hc" style={{ height: "100%", display: "flex", background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)`, padding: "8px 0 0" }}>
        <Side w={w} width={SIDE} live={live} wide={wide} onOpen={(id) => { setLive(id); setSaid(`opens ${sessions.find((s) => s.id === id)?.title}`); }} onBeside={(id) => setSaid(`beside: ${id}`)}
          onFresh={() => setSaid("a new session")} onWide={setWide} onSettings={() => setSaid("Build settings")} onMode={() => {}} stageStore={fake} />
        {!wide && <div style={{ flex: 1, padding: 32, color: "var(--mute)" }}>{said}</div>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><HoldPage /></StrictMode>);
