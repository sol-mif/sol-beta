import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEngine, keptSession } from "./useEngine";
import { useOneSol } from "./oneSol";
import { type AppMode } from "./ModeSwitch";
import { WorkApp } from "./work/WorkApp";
import { Cowork } from "./cowork/whole/Cowork";
import { BackToCowork, useAwayFromCowork } from "./cowork/whole/Away";   // a session opened from Cowork, and the chip back (#1416)   // Cowork, whole (#1173): the new shell; the old CoworkApp behind "old Cowork" for one release
import { setPaper } from "./creature/ring";
import { startPresence } from "./creature/state";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { wireSend } from "./renovation";
import { migrate } from "./migrate";
import { applyLook } from "./look";
import { oneWanted } from "./onboard/flag";
import { homeShown } from "./onboard/which";
import "./shown/flag";   // show, don't say (#1020): writes data-shown on <html>
import "./shown/shown.css";
import { JoinAsk } from "./cowork/JoinAsk";
import { WakeAskCard } from "./WakeAskCard";   // may my teammates wake my agent (#1313)
import { CountsCard } from "./CountsCard";
import { cleanHome, useCleanHome } from "./home/flag";
import { useTellFrame } from "./home/frameFlag";
import { poppedOf } from "./stage/pop";
import { Spine } from "./spine/Spine";
import { afterLeave, settingsPlan, type Leave } from "./spine/settings";   // #911/#1029: Settings asked from Home closes back to Home
import { looking, openForOf, openPlan } from "./spine/openFor";   // #1521
import { useFrameVars } from "./kit/Chrome";
import { Marks } from "./spine/Marks";
import { SocialView } from "./spine/Modes";
import { useCross } from "./cross/flag";   // #1031: Home and Build, one place
import { onHop } from "./cross/hand";
import { CrossLayer } from "./cross/CrossLayer";
import { Seams } from "./screens/Seam";
import { useRole } from "./screens/store";   // #1090: two windows of one Jelly; draws nothing with screens.two off
import "./cross/cross.css";
import { isView, spineOn, useSpine, type View } from "./spine/flag";
import { shownView, useViews } from "./spine/views";   // #1637: a tester's Sol is Build only until each card reaches product
import { FIND_ASK, findHop, windowFinds } from "./spine/find";   // the spine's find and ⌘K, from every view
import { useBuildRuns } from "./flag";
import { RunsDoor } from "./runs/Door";
import { useDoorDot } from "./runs/doorDot";
import { VersionSwitch } from "./VersionSwitch";   // #1295: concept, complete, product, at the top of the team's window
import { invoke } from "@tauri-apps/api/core";   // the shell's first run (#96)
import { demoFirstRun, firstScreen, nextOn, noteBuild, waitsFirst, watchFirstRun, type FirstRun } from "./next/flag";   // #1604: the new face behind ui.next; nothing else under next/ loads while it is off

// the new face (#1604, docs/port/switch.md): loaded only when ui.next is on
const Next = lazy(() => import("./next/Next"));

// the runs view (#889) behind build.runs: loaded only when it opens; `?runs=open` opens it at load (the shots)
const RunsView = lazy(() => import("./runs/Runs").then((m) => ({ default: m.RunsView })));
const RUNS0 = new URLSearchParams(location.search).get("runs") === "open";

// the clean Home (#589) behind its switch (home/flag.ts): loaded only when it is on
const CleanHome = lazy(() => import("./home/Home").then((m) => ({ default: m.Home })));
// no view waits on the person yet: the spine draws a view's "waits on you" once something asks from it
const NO_WAITS = new Set<View>();

// the one onboarding (#1088, onboard/One.tsx), the default since #1223: a new person meets Sol inside the real window,
// and Home is the record it writes (OneHome); the first run, the walk and the folders' Home went with it
const One = lazy(() => import("./onboard/One"));
// the first run (#94, Sol ticket #96): with no root the shell installs Sol itself and this draws its one line (next/flag.ts
// firstScreen); a download never draws the old face, its onboarding included (next/flag.ts noteBuild)
const Setup = lazy(() => import("./next/movein/Setup"));
const IN_APP = "__TAURI_INTERNALS__" in window;
const DEMO_SETUP = !IN_APP && new URLSearchParams(location.search).get("firstrun") === "setup";
const Visit = lazy(() => import("./onboard/Visit").then((m) => ({ default: m.Visit })));   // Build's and Cowork's first visit, one card each
// #1637: where Home is not on (a tester's Sol), a small start takes the onboarding's place: set up, sign in, Build
const Start = lazy(() => import("./onboard/Start"));
const OneHome = lazy(() => import("./onboard/OneHome").then((m) => ({ default: m.OneHome })));
// #1124: Settings over that Home, on Home's own section (spine/settings.ts settingsPlan's `here`)
const HomeSettings = lazy(() => import("./onboard/HomeSettings").then((m) => ({ default: m.HomeSettings })));

// The app has its modes, picked on the wheel at the top of the side: Home (#132: sessions in folders and chats, on
// Work's shell, work/WorkApp.tsx) and Cowork (Home with the team, Together #31: its own side). Social waits off the
// wheel until its first button. Each is its own tree on one engine socket.
// A window opened with ?work=<id> is one session popped out of the main window: that session only.
const SOLO = new URLSearchParams(location.search).get("work") || undefined;
// A window opened with ?block=<id>&session=<sid> is one block popped out of the stage (#701, stage/pop.ts): that block only.
const POP = poppedOf(location.search);
const Popped = lazy(() => import("./stage/Popped").then((m) => ({ default: m.Popped })));
// who meets the one onboarding is read before migrate.ts writes its first marks (a new profile gets sol.mode below)
const ONE0 = oneWanted();
// once, before the first draw: what Life and Work kept becomes Home's (migrate.ts)
const MODE0: AppMode = SOLO ? "home" : migrate(localStorage, keptSession);
// the spine's views (spine/flag.ts): Home is Home's folders, Build is today's Home, Cowork is Cowork; Social is an empty
// view for now.
// The mode the trees know (AppMode) follows the view; the view is kept apart in sol.view.
const viewOf = (m: AppMode, kept: string | null): View => (m === "cowork" ? "cowork" : isView(kept) && kept !== "cowork" ? kept : "build");
const modeOf = (v: View): AppMode => (v === "cowork" ? "cowork" : "home");

export default function App() {
  const e = useEngine();
  // the shell's first run, asked before anything is drawn (undefined: not answered yet; null: no shell, a browser)
  const [first, setFirst] = useState<FirstRun | null | undefined>(IN_APP || DEMO_SETUP ? undefined : null);
  useEffect(() => (IN_APP || DEMO_SETUP) && !SOLO && !POP
    ? watchFirstRun(DEMO_SETUP ? demoFirstRun(new URLSearchParams(location.search).has("fail")) : () => invoke<FirstRun>("first_run_state"),
      (f) => { if (f) noteBuild(f.download); setFirst(f); })
    : undefined, []);
  const views = useViews(e.settings);   // the views this Sol shows (#1637): Build always; Home, Cowork, Social by their cards
  const viewsNow = useRef(views); viewsNow.current = views;
  const [started, setStarted] = useState(false);   // the start (#1637) ended in this load: signed in, or no cloud
  const [mode, setMode] = useState<AppMode>(MODE0);
  const spine = useSpine() && !SOLO;
  const [view, setView] = useState<View>(() => viewOf(MODE0, localStorage.getItem("sol.view")));
  const [one, setOne] = useState(ONE0);
  // the hand-over (onboard/handover.ts): the real Home mounts under the onboarding's stage, then its folders glide onto Home's
  const [landing, setLanding] = useState(false);
  const oneHome = homeShown({ onboarding: one, landing });   // one rule for when Home is drawn (onboard/which.ts)
  const clean = useCleanHome();
  const runsOn = useBuildRuns() && spine;
  const [runsOpen, setRunsOpen] = useState(RUNS0);
  const runsShown = runsOn && runsOpen && view === "build";
  const runsDot = useDoorDot(!!runsOn && !runsShown);   // #906: the board read every 60 s while the view is closed
  const pick = (m: AppMode) => { if (m === "cowork" && !viewsNow.current.has("cowork")) return; localStorage.setItem("sol.mode", m); setMode(m); setView((v) => (modeOf(v) === m ? v : m === "cowork" ? "cowork" : "build")); };
  const hop = (to: View) => { const v = shownView(to, viewsNow.current); localStorage.setItem("sol.view", v); setView(v); const m = modeOf(v); if (m !== mode) { localStorage.setItem("sol.mode", m); setMode(m); } };
  // #911/#1029 (main's App, fitted to yours): Settings asked from Home or Social hops to Build and opens there; a real
  // close goes back where it was asked from, any other way out forgets the way back (spine/settings.ts afterLeave)
  const back = useRef<View | null>(null);
  const viewNow = useRef(view); viewNow.current = view;
  const hopRef = useRef(hop); hopRef.current = hop;
  // #1124: in a Home made by the one onboarding, Settings stays in Home (the drawer it opens on; null: not up)
  const [homeSet, setHomeSet] = useState<string | null>(null);
  useEffect(() => { if (view !== "home" || !oneHome) setHomeSet(null); }, [view, oneHome]);
  const openSettings = () => {
    const p = settingsPlan(viewNow.current, oneHome);
    back.current = p.back;
    if (p.here) { const at = p.here; setHomeSet((o) => (o ? null : at)); return; }   // the mark again closes it, as ⌘, does in Build
    if (!p.hop) { window.dispatchEvent(new CustomEvent("sol:settings")); return; }
    try { sessionStorage.setItem("sol.work.view", JSON.stringify("settings")); } catch { /* private: the event below still asks */ }
    hop(p.hop);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:settings")), 60);
  };
  // #1521: the seat opens a Settings drawer or a pane for the person (spine/openFor.ts), in the window they look at
  useEffect(() => {
    if (SOLO || POP) return;
    const go = (ev: Event) => {
      const o = openForOf((ev as CustomEvent).detail);
      if (!o || !looking(document)) return;
      const p = openPlan(viewNow.current, o);
      if (o.what === "settings") back.current = p.back;
      if (p.hop) {
        if (o.what === "settings") try { sessionStorage.setItem("sol.work.view", JSON.stringify("settings")); } catch { /* private: the event below still asks */ }
        hopRef.current(p.hop);
      }
      window.setTimeout(() => window.dispatchEvent(new CustomEvent(p.event, { detail: p.detail })), p.hop ? 60 : 0);
    };
    window.addEventListener("sol:open-for", go);
    return () => window.removeEventListener("sol:open-for", go);
  }, []);
  useEffect(() => {
    if (!spine) return;
    const left = (ev: Event) => { const r = afterLeave(back.current, viewNow.current, (ev as CustomEvent<Leave>).detail); back.current = r.back; if (r.to) hopRef.current(r.to); };
    window.addEventListener("sol:settings-left", left);
    return () => window.removeEventListener("sol:settings-left", left);
  }, [spine]);
  // #1031: the hand held over a spine letter turns the window to that view (cross/hand.ts); Home's needs light its letter
  const cross = useCross() && spine;
  useEffect(() => (cross ? onHop((v) => { if (isView(v)) { back.current = null; hopRef.current(v); } }) : undefined), [cross]);
  // the spine's find (2026-11-11, spine/find.ts): find is Build's, so from another view the window hops there first
  const openFind = () => {
    const to = findHop(viewNow.current);
    if (!to) { window.dispatchEvent(new CustomEvent("sol:find")); return; }
    try { sessionStorage.setItem(FIND_ASK, "1"); } catch { /* private: the event below still asks */ }
    hop(to);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:find")), 60);
  };
  const findRef = useRef(openFind); findRef.current = openFind;
  // ⌘K from a view with no ⌘K of its own (Home's folders, Cowork, Social) is the spine's find; Build's clean Home keeps
  // its own key (the Jump)
  const ownFind = view === "build";
  const ownFindRef = useRef(ownFind); ownFindRef.current = ownFind;
  useEffect(() => {
    if (!spine) return;
    const down = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || !ev.metaKey || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.key.toLowerCase() !== "k") return;
      if (!windowFinds(viewNow.current, ownFindRef.current)) return;
      ev.preventDefault(); findRef.current();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [spine]);
  // #1416: a session opened from Cowork opens where sessions open (Build with the spine, Home without), with a chip back
  const away = useAwayFromCowork(mode === "cowork", () => (spine ? hopRef.current("build") : pick("home")), () => (spine ? hopRef.current("cowork") : pick("cowork")));
  // #1637: a view the engine turned off after the load is left for Build, and Cowork's mode with it (nothing written:
  // the view kept in storage comes back the day its card reaches product)
  useEffect(() => {
    if (!views.has(view)) setView("build");
    if (mode === "cowork" && !views.has("cowork")) setMode("home");
  }, [views]);   // eslint-disable-line react-hooks/exhaustive-deps -- turned by the views alone
  const vw = shownView(view, views), cw = mode === "cowork" && views.has("cowork");
  // #1090: one jelly, one spine: a window of Jelly on another screen that holds no side (a wall, a stage) draws no rail
  const screenRole = useRole();
  const railed = spine && screenRole !== "wall" && screenRole !== "stage";
  useFrameVars(railed);
  useLayoutEffect(() => { document.documentElement.dataset.spine = railed ? "on" : "off"; document.documentElement.dataset.view = view; }, [railed, view]);
  useLayoutEffect(() => { document.documentElement.dataset.mode = mode; setPaper(mode === "home" ? "home" : "work"); }, [mode]);   // Cowork is on Work's paper
  useLayoutEffect(() => { if (e.settings) applyLook(e.settings.look); }, [e.settings]);   // the look, whenever settings arrive (look.ts)
  // ctrl+cmd+M: pressed, it flips Home and Cowork; held 350 ms, it opens the wheel (ModeWheel.tsx). Not with the clean
  // Home on (#589, Marco 2026-11-02): there a click on home | cowork is the one way. Nor with the spine on (2026-11-11):
  // the spine's marks and ⌘1–⌘4 are the way.
  // WebKit sends no keyup for M while cmd is down, so letting go of cmd or ctrl counts as letting go of the keys.
  useEffect(() => {
    let t: number | undefined, wheel = false;
    const down = (ev: KeyboardEvent) => {
      if (SOLO || cleanHome() || spineOn() || !(ev.metaKey && ev.ctrlKey && ev.key.toLowerCase() === "m")) return;
      ev.preventDefault();
      if (ev.repeat || t !== undefined || wheel) return;
      t = window.setTimeout(() => { t = undefined; wheel = true; window.dispatchEvent(new Event("sol:mode-wheel")); }, 350);
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() !== "m" && ev.key !== "Meta" && ev.key !== "Control") return;
      if (t !== undefined) { window.clearTimeout(t); t = undefined; pick(document.documentElement.dataset.mode === "cowork" ? "home" : "cowork"); }
      if (ev.key === "Meta" || ev.key === "Control") wheel = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.clearTimeout(t); };
  }, []);
  // the creature: this window tells the engine its focus and the Mac's idle (the main window only, not a pop-out)
  useEffect(() => {
    let label = "main";
    try { label = getCurrentWindow().label; } catch { /* a plain browser: report anyway */ }
    return label === "main" ? startPresence(wireSend) : undefined;
  }, []);
  useOneSol();   // One Sol (#62): the main window watches the NucBox, whatever the mode shows
  useTellFrame(e.subscribe, e.setSettings);   // the frame's switch (#630): every window tells the engine its own turn, not only the clean Home (#1108, #1846)
  if (POP) return <Suspense fallback={null}><Popped e={e} id={POP.id} session={POP.session} /></Suspense>;
  if (SOLO) return <WorkApp e={e} onMode={() => {}} solo={SOLO} />;
  // until the engine's settings come the window is the first frame (index.html's paper), never the old face: only an
  // answer of off draws it (next/flag.ts waitsFirst, BR1 #1615)
  const firstNow = firstScreen(first);
  if (firstNow === "wait") return <div className="first-frame" data-first-frame aria-busy="true" />;
  if (firstNow === "setup" && first) return <Suspense fallback={<div className="first-frame" data-first-frame aria-busy="true" />}><Setup f={first} onAgain={() => { void invoke("first_run_again").catch(() => {}); }} /></Suspense>;
  if (waitsFirst(e.settings)) return <div className="first-frame" data-first-frame aria-busy="true" />;
  if (nextOn(e.settings)) return <Suspense fallback={null}><Next e={e} /></Suspense>;
  return (
    <>
      {railed && <Spine view={vw} shown={views} onPick={(v) => { back.current = null; hop(v); }} waits={NO_WAITS} onFind={openFind} onSettings={openSettings} onJelly={() => {}}
        extra={runsOn || away.away ? <>{runsOn && <RunsDoor open={runsShown} dot={runsDot} onPress={() => { if (view !== "build") hop("build"); setRunsOpen((o) => view !== "build" || !o); }} />}
          {away.away && <BackToCowork inSpine onPress={() => { back.current = null; away.back(); }} />}</> : undefined} />}
      {!railed && away.away && <BackToCowork inSpine={false} onPress={away.back} />}
      {runsShown && <Suspense fallback={null}><RunsView e={e} onClose={() => setRunsOpen(false)} /></Suspense>}
      {railed && <Marks send={e.send} />}
      {!spine && <div className="f-lights" data-tauri-drag-region aria-hidden />}
      <VersionSwitch setSettings={e.setSettings} />
      {spine && vw === "home" ? <Suspense fallback={null}>{oneHome && <OneHome e={e} />}</Suspense> : spine && vw === "social" ? <SocialView />
        : cw ? <Cowork e={e} onMode={pick} />
        : clean ? <Suspense fallback={null}><CleanHome e={e} onMode={pick} /></Suspense> : <WorkApp e={e} onMode={pick} />}
      {spine && vw === "home" && oneHome && homeSet && <Suspense fallback={null}><HomeSettings e={e} first={homeSet} onClose={() => setHomeSet(null)} /></Suspense>}
      {cross && <CrossLayer e={e} />}
      {!POP && <Seams />}
      {/* a group's link opened in the app (#327): it asks over either mode, and opens Cowork only once joined; signed out
          (#342), its "sign in" opens Settings in Home on that drawer, once Home has mounted */}
      {views.has("cowork") && <JoinAsk onJoined={() => { try { sessionStorage.setItem("sol.cowork.stage", JSON.stringify({ k: "dashboard" })); } catch { /* private */ } pick("cowork"); window.dispatchEvent(new Event("sol:cowork-group")); }}
        onSignIn={(drawer) => { pick("home"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:settings", { detail: drawer })), 60); }} />}
      {/* the one card about counting (#356): once, on the first window after the onboarding; the press is the whole face of it */}
      {!one && e.settings?.track && (!e.settings.track.told || (e.settings.errorCounts === true && e.settings.track.toldErrors === false)) &&
        <CountsCard errors={e.settings.errorCounts === true} onOk={() => e.setSettings({ track: { told: true, ...(e.settings?.errorCounts ? { toldErrors: true } : {}) } })} />}
      {/* the one question about waking (#1313): once, after the onboarding, in the counting card's spot when that one is not up */}
      {!one && !POP && views.has("cowork") && !(e.settings?.track && (!e.settings.track.told || (e.settings.errorCounts === true && e.settings.track.toldErrors === false))) && <WakeAskCard />}
      {!views.has("home") && !started ? <Suspense fallback={null}><Start e={e} onDone={() => { setStarted(true); setOne(false); hop("build"); }} /></Suspense>
        : one && views.has("home") ? <Suspense fallback={null}><One e={e} onLanding={() => { setLanding(true); hop("home"); }} onDone={(home) => { setOne(false); setLanding(false); if (!home) return; try { localStorage.setItem("sol.firstrun", "done"); } catch { /* private */ } hop("home"); }} /></Suspense> : null}
      {!one && <Suspense fallback={null}><Visit e={e} where={cw ? "cowork" : vw === "build" ? "build" : null} /></Suspense>}
    </>
  );
}
