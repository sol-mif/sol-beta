// The kit stills (#1879 step 0): the frame's kit parts on one dev page, in the sidebar's named states, for the stills test
// (sol/engine/test/kit-stills.test.ts) to shoot and hold against the approved pictures beside it. Fixtures are generic.
//   kit-stills.html                 every state, one under another
//   kit-stills.html?state=<name>    one: rest, box-open, more-live, tab-front, cmd-held, empty, heavy, then the tab row's (#1879 step 2):
//                                   (the bar's, #1879 step 5: bar-rest, bar-card, bar-customize, bar-zoom)
//                                   tabs-canvas, tabs-session, tabs-held, tabs-corners, tabs-ai, tabs-folder, tabs-overflow, tabs-crumb, tabs-pill
// A state is a <div data-still="<name>">: the tab row over the sidebar (248px, the drawing's) and a strip of canvas.
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BoxCard } from "./BoxIcon";
import { DiaryCard, type DiaryRow } from "./DiaryCard";
import { FolderCard, runningLine } from "./FolderCard";
import { FolderCase } from "./FolderCase";
import { Group } from "./Group";
import { Icon, type BoxInside, type IconName } from "./icons";
import { Key, type KeyState } from "./Key";
import { Mark, paintAt, type Paint } from "./Signs";
import { Tabs, type TabItem } from "./Tab";
import { Tool, ToolBar, ToolSep, ToolZoom } from "./ToolBar";
import "../palette.css";
import "./next.css";
import "./parts.css";

// ---- fixtures: an ordinary morning, an empty account, a heavy one ----
type Live = { name: string; folder: string; paint: Paint; state: KeyState; question: { head: string; words: string }; at: number };
const ask = (name: string, folder: string, i: number, age: string, words: string, count = 1, at = 0): Live =>
  ({ name, folder, paint: paintAt(i), state: { asks: true, age, count }, question: { head: `asked ${age} ago`, words }, at });
const run = (name: string, folder: string, i: number, running: string, progress: number, line: string, at = 0): Live =>
  ({ name, folder, paint: paintAt(i), state: { asks: false, running, progress }, question: { head: "running", words: line }, at });
const FOLDERS = ["api", "web", "infra", "cli", "home", "money", "health"];
const LIVE: Live[] = [
  ask("Fix login", "api", 0, "7h", "Wait for Migrate db, then accept 40 files?", 2, 1),
  ask("Migrate db", "api", 0, "7h", "Allow npm run migrate?", 1, 2),
  ask("Docs pass", "cli", 3, "4h", "Publish the README changes?", 2, 3),
  ask("Main check", "web", 1, "3h", "The check broke on main. Revert it?", 1, 4),
  ask("Nav cleanup", "web", 1, "2h", "Two navs left. Keep the top one?", 1, 5),
  run("Release notes", "api", 0, "40m", 0.4, "Writing the notes, 2 of 5 done", 6),
  ask("Rent", "home", 4, "1h", "Pay Monday's rent from the joint account?", 1, 7),
  run("Deploy infra", "infra", 2, "1h", 0.44, "Deploying, step 4 of 9", 8),
  ask("Appointment", "health", 6, "58m", "Thursday at 3pm works?", 1, 9),
  run("Parse flags", "cli", 3, "12m", 0.43, "Running the tests, 3 of 7", 10),
];
const recent = (l: Live[]) => [...l].sort((a, b) => b.at - a.at);
type Box = { inside: BoxInside; name: string; n: number; hint: string; rows: [string, IconName, string, string][] };
const CHECK: Box[] = [
  { inside: "back", name: "Back to", n: 6, hint: "Migrate db, 08:55", rows: [["Migrate db", "session", "api", "08:55"], ["Budget 2027", "page", "money", "08:31"], ["deploy.log", "page", "infra", "08:12"], ["Weekly review", "loop", "home", "yesterday"], ["Nav cleanup", "session", "web", "yesterday"], ["Docs pass", "session", "cli", "Mon"]] },
  { inside: "kept", name: "Kept", n: 2, hint: "Weekly review", rows: [] },
  { inside: "done", name: "Done", n: 9, hint: "while you were away", rows: [] },
  { inside: "made", name: "Made", n: 5, hint: "lease renewal, today", rows: [] },
];
const EMPTY_CHECK: Box[] = CHECK.map((b) => ({ ...b, n: 0, hint: "nothing yet", rows: [] }));
const TILT = [-2, 2, -1, 1.5];
const paintOf = (folder: string, folders = FOLDERS) => paintAt(Math.max(0, folders.indexOf(folder)));
// heavy: 30 live sessions over 12 folders
const HEAVY_FOLDERS = ["api", "web", "infra", "cli", "home", "money", "health", "docs", "site", "data", "mobile", "ops"];
const HEAVY: Live[] = Array.from({ length: 30 }, (_, i) => {
  const f = HEAVY_FOLDERS[i % 12], p = paintAt(i % 12);
  return i % 3 === 2 ? { ...run(`Task ${i + 1}`, f, 0, `${(i % 50) + 5}m`, (i % 10) / 10, "Working through the list"), paint: p, at: i } : { ...ask(`Task ${i + 1}`, f, 0, `${(i % 9) + 1}h`, "Go ahead with the change?", 1 + (i % 2), i), paint: p };
});

// ---- the pieces of a state ----
const TABS_CANVAS: TabItem[] = [{ id: "canvas", label: "Canvas", icon: "canvas", front: true }, { id: "s1", label: "Fix login", icon: "session" }, { id: "p1", label: "release-notes.md", icon: "page" }];
const TABS_FOLDER: TabItem[] = [{ id: "canvas", label: "Canvas", icon: "canvas" }, { id: "api", label: "api", icon: "folder", paint: "api", front: true }, { id: "s1", label: "Fix login", icon: "session", paint: "api" }, { id: "p1", label: "release-notes.md", icon: "page" }];
// the tab row alone (#1879 step 2): one rule, colour = where, glyph = what, corner = how (decisions.md 2026-11-25)
const CANVAS: TabItem = { id: "canvas", label: "Canvas", icon: "canvas" };
const ROW: TabItem[] = [
  { id: "s1", label: "Fix login", icon: "session", paint: "api" }, { id: "p1", label: "lease renewal", icon: "page", paint: "citrus" },
  { id: "n1", label: "Call notes", icon: "note" }, { id: "x1", label: "New session", icon: "starter" },
];
const front = (t: TabItem[], id: string) => t.map((x) => (x.id === id ? { ...x, front: true } : x));
const CORNERS: TabItem[] = [
  CANVAS, { id: "s1", label: "Fix login", icon: "session", paint: "api", corner: "ask" }, { id: "s2", label: "Deploy infra", icon: "session", paint: "infra", corner: "run" },
  { id: "s3", label: "Migrate db", icon: "session", paint: "rose", corner: "bad" },
];
const OVERFLOW: TabItem[] = [
  { ...CANVAS, front: true }, { id: "s1", label: "Fix login", icon: "session", paint: "api" }, { id: "p1", label: "lease renewal", icon: "page", paint: "citrus" }, { id: "s2", label: "Deploy infra", icon: "session", paint: "infra" },
  { id: "more", label: "", more: 4, fresh: true },
];

function Still({ name, tabs = TABS_CANVAS, held, children }: { name: string; tabs?: TabItem[]; held?: boolean; children: ReactNode }) {
  return (
    <div data-still={name} data-face="next" style={{ width: 680, background: "var(--ground)", display: "flex", flexDirection: "column", fontFamily: "var(--family)" }}>
      <Tabs tabs={tabs} held={held ?? false} />
      <div style={{ display: "flex", minHeight: 520 }}>
        <aside style={{ width: 248, boxSizing: "border-box", background: "var(--sidebar)", borderRight: "var(--hair) solid var(--hairline)", padding: "var(--s3) var(--card-pad)" }}>{children}</aside>
        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}
/** the row alone over a strip of the ground */
function RowStill({ name, tabs, held }: { name: string; tabs: TabItem[]; held?: boolean }) {
  return (
    <div data-still={name} data-face="next" style={{ width: 680, background: "var(--ground)", display: "flex", flexDirection: "column", fontFamily: "var(--family)" }}>
      <Tabs tabs={tabs} held={held ?? false} />
      <div style={{ height: 60 }} />
    </div>
  );
}
function CheckIn({ boxes, open }: { boxes: Box[]; open?: BoxInside }) {
  return <Group label="Check in" items={boxes} render={(b, i) => <BoxCard key={b.inside} inside={b.inside} name={b.name} n={b.n} hint={b.hint} open={b.inside === open} tilt={TILT[i]} />} />;
}
function LiveGroup({ live, folders = FOLDERS, opened, label = "Live", only }: { live: Live[]; folders?: string[]; opened?: boolean; label?: string; only?: boolean }) {
  const asks = live.filter((l) => l.state.asks).length;
  return (
    <Group label={label} count={live.length} opened={opened} items={recent(live)} more="live" paintOf={(l) => l.paint} quiet="Nothing live"
      aside={only ? undefined : live.length ? <><b>{asks}</b> ask · <b>{live.length - asks}</b> running</> : undefined}
      render={(l, i) => <Key key={l.name} name={l.name} paint={l.paint ?? paintOf(l.folder, folders)} folder={l.folder} state={l.state} question={l.question} tilt={TILT[i % 4]} />} />
  );
}
function Elsewhere({ live, folders, here, recentFolders }: { live: Live[]; folders: string[]; here: string; recentFolders: [string, string][] }) {
  const others = live.filter((l) => l.folder !== here), names = [...new Set(others.map((l) => l.folder))];
  const asksIn = (f: string) => others.filter((l) => l.folder === f && l.state.asks).reduce((s, l) => s + (l.state.asks ? l.state.count ?? 1 : 0), 0);
  const runsIn = (f: string) => others.filter((l) => l.folder === f && !l.state.asks).length;
  const sorted = names.sort((a, b) => asksIn(b) - asksIn(a) || folders.indexOf(a) - folders.indexOf(b));
  return (
    <>
      <Group label="Running elsewhere" items={sorted} more={["folder", "folders"]} paintOf={(f) => paintOf(f, folders)} quiet="Nothing running elsewhere"
        aside={others.length ? <><b>{others.length}</b> sessions</> : undefined}
        render={(f, i) => <FolderCard key={f} name={f} paint={paintOf(f, folders)} line={runningLine(asksIn(f), runsIn(f))} tilt={TILT[i % 4]} />} />
      <Group label="Recent" items={recentFolders.filter(([f]) => f !== here)} quiet="No folders yet"
        render={([f, when], i) => <FolderCard key={f} name={f} paint={paintOf(f, folders)} line={when} tilt={TILT[i % 4]} />} />
    </>
  );
}
function BoxList({ box }: { box: Box }) {
  return (
    <div className="kp-part" style={{ marginTop: "var(--s3)" }}>
      <div className="kp-name" style={{ display: "flex", alignItems: "center", gap: "var(--s2)", padding: "var(--s3) var(--s2)", fontSize: "var(--text-head)" }}><Icon name="back" small />{box.name}</div>
      {box.rows.map(([t, icon, f, when]) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: "var(--s2)", height: "var(--h-row)", padding: "0 var(--s2)", borderRadius: "var(--r-item)" }}>
          <span style={{ color: "var(--text2)" }}><Icon name={icon} small /></span>
          <b style={{ fontSize: "var(--text-name)", fontWeight: "var(--weight-ui)" }}>{t}</b>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--s1)", fontSize: "var(--text-line)", color: "var(--text3)" }}><Mark paint={paintOf(f)} size="s" />{when}</span>
        </div>
      ))}
    </div>
  );
}

const RECENT: [string, string][] = [["money", "08:31"], ["health", "08:02"], ["infra", "07:40"], ["web", "yesterday"], ["home", "yesterday"]];
const STATES: Record<string, () => ReactNode> = {
  rest: () => <Still name="rest"><CheckIn boxes={CHECK} /><LiveGroup live={LIVE} /></Still>,
  "box-open": () => <Still name="box-open"><CheckIn boxes={CHECK} open="back" /><BoxList box={CHECK[0]} /></Still>,
  "more-live": () => (
    <Still name="more-live">
      <LiveGroup live={LIVE.filter((l) => l.state.asks)} label="Asks you" opened only />
      <LiveGroup live={LIVE.filter((l) => !l.state.asks)} label="Running" opened only />
    </Still>
  ),
  "tab-front": () => <Still name="tab-front" tabs={TABS_FOLDER}><Elsewhere live={LIVE} folders={FOLDERS} here="api" recentFolders={RECENT} /></Still>,
  "cmd-held": () => <Still name="cmd-held" tabs={TABS_FOLDER} held><Elsewhere live={LIVE} folders={FOLDERS} here="api" recentFolders={RECENT} /></Still>,
  empty: () => <Still name="empty" tabs={[TABS_CANVAS[0]]}><CheckIn boxes={EMPTY_CHECK} /><LiveGroup live={[]} /></Still>,
  heavy: () => (
    <div style={{ display: "flex", gap: 0 }}>
      <Still name="heavy"><CheckIn boxes={CHECK} /><LiveGroup live={HEAVY} folders={HEAVY_FOLDERS} /></Still>
      <Still name="heavy-tab" tabs={TABS_FOLDER}><Elsewhere live={HEAVY} folders={HEAVY_FOLDERS} here="api" recentFolders={HEAVY_FOLDERS.map((f, i): [string, string] => [f, `${8 - (i % 8)}:00`])} /></Still>
    </div>
  ),
};
const TABS_STATES: Record<string, () => ReactNode> = {
  "tabs-canvas": () => <RowStill name="tabs-canvas" tabs={[{ ...CANVAS, front: true }, ...ROW]} />,
  "tabs-session": () => <RowStill name="tabs-session" tabs={[CANVAS, ...front(ROW, "s1")]} />,
  "tabs-held": () => <RowStill name="tabs-held" held tabs={[CANVAS, ...front(ROW, "s1"), { id: "api", label: "api", icon: "folder", paint: "api" }]} />,
  "tabs-corners": () => <RowStill name="tabs-corners" tabs={CORNERS} />,
  "tabs-ai": () => <RowStill name="tabs-ai" tabs={[CANVAS, ...ROW.slice(0, 2), { id: "w1", label: "Weekly review", icon: "session", paint: "home", fresh: true }]} />,
  "tabs-folder": () => <RowStill name="tabs-folder" tabs={[CANVAS, { id: "api", label: "api", icon: "folder", paint: "api", front: true }, { id: "web", label: "web", icon: "folder", paint: "web" }, { id: "n0", label: "Loose folder", icon: "folder" }]} />,
  "tabs-overflow": () => <RowStill name="tabs-overflow" tabs={OVERFLOW} />,
  "tabs-crumb": () => <RowStill name="tabs-crumb" tabs={[{ ...CANVAS, front: true, crumb: { label: "web", paint: "web" } }, ...ROW.slice(0, 1)]} />,
  "tabs-pill": () => <RowStill name="tabs-pill" tabs={[CANVAS, ...ROW.slice(0, 1), { id: "a1", label: "Deploy infra", icon: "session", paint: "infra", corner: "run", pill: "nightly" }]} />,
};
Object.assign(STATES, TABS_STATES);
// the canvas (#1879 step 4): a folder's case and the Diary's card, on the ground, as the frame drawing has them
function Canvas({ name, children, w = 680 }: { name: string; children: ReactNode; w?: number }) {
  return (
    <div data-still={name} data-face="next" style={{ width: w, background: "var(--ground)", display: "flex", gap: "var(--s6)", alignItems: "flex-start", padding: "var(--s6)", boxSizing: "border-box", fontFamily: "var(--family)" }}>{children}</div>
  );
}
const CASES = {
  api: <FolderCase name="api" paint="api" sub="Three sessions" count={3} next="Release Fri" />,
  web: <FolderCase name="web" paint="web" sub="Two sessions" count={2} next="2 PRs" />,
};
const DAY_ROWS: DiaryRow[] = [
  { id: "1", time: "06:12", title: "Main check stopped", detail: "The check broke on main. Revert a1b2c?", paint: "web" },
  { id: "2", time: "02:49", title: "Fix login asked you", detail: "Change ready, 40 files. Accept?", paint: "api" },
  { id: "3", time: "02:16", title: "Migrate db asked you", detail: "Allow npm run migrate?", paint: "api" },
  { id: "4", time: "01:44", title: "Fix login asked you", detail: "Fix login and Migrate db both edit session.ts. Fix login waits?", paint: "api" },
];
const DIARY = { date: "Wednesday, 25 November", day: 25, count: 18, waiting: "waiting for you: 11 asks, 7 from people", away: "While you were away · 00:40 to 07:38", headline: "Fix login changed 40 files in api overnight." };
const CANVAS_STATES: Record<string, () => ReactNode> = {
  "case-rest": () => <Canvas name="case-rest">{CASES.api}{CASES.web}</Canvas>,
  "case-peeled": () => <Canvas name="case-peeled"><FolderCase name="api" paint="api" sub="Three sessions" count={3} next="Release Fri" hover />{CASES.web}</Canvas>,
  "case-working": () => <Canvas name="case-working"><FolderCase name="infra" paint="infra" sub="Deploy infra, running" count={4} unit="of 9" next="~11:40" working="working" /></Canvas>,
  "case-quiet": () => <Canvas name="case-quiet"><FolderCase name="cli" paint="home" sub="3 PDFs opened once" count={0} /></Canvas>,
  "case-long": () => <Canvas name="case-long"><FolderCase name="Quarterly planning and the budget review for the whole company" paint="rose" sub="Twelve sessions, a very long line that has to end" count={12} next="Board meeting on Thursday afternoon" /></Canvas>,
  "case-no-deadline": () => <Canvas name="case-no-deadline"><FolderCase name="home" paint="citrus" sub="One session" count={1} /></Canvas>,
  "diary-rest": () => <Canvas name="diary-rest" w={440}><div style={{ width: "var(--dy-w)" }}><DiaryCard {...DIARY} rows={DAY_ROWS} more={12} onPrev={() => {}} /></div></Canvas>,
  "diary-quiet": () => <Canvas name="diary-quiet" w={440}><div style={{ width: "var(--dy-w)" }}><DiaryCard {...DIARY} count={0} waiting="Nothing needs you now." away={null} headline="A quiet start: nothing moved overnight." rows={[]} /></div></Canvas>,
};
Object.assign(STATES, CANVAS_STATES);

// the bar's tools (#1879 step 5): the row over a strip of the canvas, as drawn: at rest, a card open, Customize on, the zoom at One folder
function BarStill({ name, band = "All folders", pressed, customize }: { name: string; band?: string; pressed?: "where" | "arrange"; customize?: boolean }) {
  const no = () => {};
  return (
    <div data-still={name} data-face="next" style={{ width: 680, height: 140, background: "var(--ground)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--family)" }}>
      <ToolBar label="The canvas: where, zoom, arrange, add, customize">
        <Tool icon="where" label="Where" pressed={pressed === "where"} onClick={no} />
        <ToolZoom label={band} onOut={no} onIn={no} />
        <ToolSep />
        <Tool icon="arrange" label="Arrange" pressed={pressed === "arrange"} onClick={no} />
        <Tool solid icon="plus" label="Add" onClick={no} />
        <Tool icon="customize" label={customize ? "Done" : "Customize"} pressed={!!customize} onClick={no} />
      </ToolBar>
    </div>
  );
}
const BAR_STATES: Record<string, () => ReactNode> = {
  "bar-rest": () => <BarStill name="bar-rest" />,
  "bar-card": () => <BarStill name="bar-card" pressed="where" />,
  "bar-customize": () => <BarStill name="bar-customize" customize />,
  "bar-zoom": () => <BarStill name="bar-zoom" band="One folder" />,
};
Object.assign(STATES, BAR_STATES);
export const STILLS = Object.keys(STATES);

const asked = new URLSearchParams(location.search).get("state");
const show = asked && asked in STATES ? [asked] : STILLS;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div data-ready style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, alignItems: "flex-start" }}>{show.map((s) => <div key={s} data-state={s} style={{ display: "inline-flex" }}>{STATES[s]()}</div>)}</div>
  </StrictMode>,
);
