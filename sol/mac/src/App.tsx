import { landOn } from "./land";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEngine, keptSession } from "./useEngine";
import { useOneSol } from "./oneSol";
import { type AppMode } from "./ModeSwitch";
import { WorkApp } from "./work/WorkApp";
import { CoworkApp } from "./cowork/CoworkApp";
import { usePings, useWorkWho } from "./work/pings";
import { setPaper } from "./creature/ring";
import { startPresence } from "./creature/state";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onOpenAsk, wireSend } from "./renovation";
import { migrate } from "./migrate";
import { applyLook } from "./look";
import { firstRunWanted } from "./firstrun/FirstRun";
import { JoinAsk } from "./cowork/JoinAsk";
import { CountsCard } from "./CountsCard";
import { cleanHome, useCleanHome } from "./home/flag";
import { poppedOf } from "./stage/pop";
import { Spine } from "./spine/Spine";
import { useFrameVars } from "./kit/Chrome";
import { HomeView, SocialView } from "./spine/Modes";
import { isView, useSpine, type View } from "./spine/flag";
import { afterLeave, settingsPlan, spineAsk, type Leave } from "./spine/settings";

// the clean Home (#589) behind its switch (home/flag.ts): loaded only when it is on
const CleanHome = lazy(() => import("./home/Home").then((m) => ({ default: m.Home })));

// the first run (#134, firstrun/FirstRun.tsx) lies over the app: a new person meets Sol inside the real window
const FirstRun = lazy(() => import("./firstrun/FirstRun"));

// The app has its modes, picked on the wheel at the top of the side: Home (#132: sessions in folders and chats, on
// Work's shell, work/WorkApp.tsx) and Cowork (Home with the team, Together #31: its own side). Social waits off the
// wheel until its first button. Each is its own tree on one engine socket.
// A window opened with ?work=<id> is one session popped out of the main window: that session only.
const SOLO = new URLSearchParams(location.search).get("work") || undefined;
// A window opened with ?block=<id>&session=<sid> is one block popped out of the stage (#701, stage/pop.ts): that block only.
const POP = poppedOf(location.search);
const Popped = lazy(() => import("./stage/Popped").then((m) => ({ default: m.Popped })));
// once, before the first draw: what Life and Work kept becomes Home's (migrate.ts)
const MODE0: AppMode = SOLO ? "home" : migrate(localStorage, keptSession);
const keep = (open: object) => localStorage.setItem("sol.home.open", JSON.stringify(open));
// the spine's views (spine/flag.ts, sol.spine, off by default): Build is today's Home, Cowork is Cowork; Home and Social
// are empty views for now. The mode the trees know (AppMode) follows the view; the view is kept apart in sol.view.
const viewOf = (m: AppMode, kept: string | null): View => (m === "cowork" ? "cowork" : isView(kept) && kept !== "cowork" ? kept : "build");
const modeOf = (v: View): AppMode => (v === "cowork" ? "cowork" : "home");

export default function App() {
  const e = useEngine();
  const [mode, setMode] = useState<AppMode>(MODE0);
  const spine = useSpine() && !SOLO;
  const [view, setView] = useState<View>(() => viewOf(MODE0, localStorage.getItem("sol.view")));
  const [first, setFirst] = useState(firstRunWanted);
  const clean = useCleanHome();
  const pick = (m: AppMode) => { localStorage.setItem("sol.mode", m); setMode(m); setView((v) => (modeOf(v) === m ? v : m === "cowork" ? "cowork" : "build")); };
  const hop = (v: View) => { localStorage.setItem("sol.view", v); setView(v); const m = modeOf(v); if (m !== mode) { localStorage.setItem("sol.mode", m); setMode(m); } };
  // Settings from the spine's mark or ⌘, outside Build (#911): Settings is Build's page, so the ask hops to Build with
  // the page already on Settings; closing it goes back to the view it was asked from (spine/settings.ts)
  const back = useRef<View | null>(null);
  const viewNow = useRef(view); viewNow.current = view;
  const openSettings = () => {
    const p = settingsPlan(viewNow.current);
    back.current = p.back;
    if (!p.hop) { window.dispatchEvent(new CustomEvent("sol:settings", { detail: spineAsk() })); return; }
    try { sessionStorage.setItem("sol.work.view", JSON.stringify("settings")); } catch { /* private: the event below still asks */ }
    hop(p.hop);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:settings", { detail: spineAsk() })), 60);
  };
  const openRef = useRef(openSettings); openRef.current = openSettings;
  const hopRef = useRef(hop); hopRef.current = hop;
  useEffect(() => {
    if (!spine) return;
    // leaving Settings: a real close goes back; any other way out forgets the way back (spine/settings.ts afterLeave)
    const left = (ev: Event) => { const r = afterLeave(back.current, viewNow.current, (ev as CustomEvent<Leave>).detail); back.current = r.back; if (r.to) hopRef.current(r.to); };
    // ⌘, while Home or Social shows (Build's page keeps its own key, WorkApp)
    const key = (ev: KeyboardEvent) => { if (ev.metaKey && ev.key === "," && (viewNow.current === "home" || viewNow.current === "social")) { ev.preventDefault(); openRef.current(); } };
    window.addEventListener("sol:settings-left", left);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("sol:settings-left", left); window.removeEventListener("keydown", key); };
  }, [spine]);
  useFrameVars(spine);
  useLayoutEffect(() => { document.documentElement.dataset.spine = spine ? "on" : "off"; document.documentElement.dataset.view = view; }, [spine, view]);
  useLayoutEffect(() => { document.documentElement.dataset.mode = mode; setPaper(mode === "home" ? "home" : "work"); }, [mode]);   // Cowork is on Work's paper
  useLayoutEffect(() => { if (e.settings) applyLook(e.settings.look); }, [e.settings]);   // the look, whenever settings arrive (look.ts)
  // ctrl+cmd+M: pressed, it flips Home and Cowork; held 350 ms, it opens the wheel (ModeWheel.tsx). Not with the clean
  // Home on (#589, Marco 2026-11-02): there a click on home | cowork is the one way.
  // WebKit sends no keyup for M while cmd is down, so letting go of cmd or ctrl counts as letting go of the keys.
  useEffect(() => {
    let t: number | undefined, wheel = false;
    const down = (ev: KeyboardEvent) => {
      if (SOLO || cleanHome() || !(ev.metaKey && ev.ctrlKey && ev.key.toLowerCase() === "m")) return;
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
  // a ping clicked in the notch: its talk opens in Home (a session, or a chat), kept first so a Home that mounts now opens it
  useEffect(() => onOpenAsk((m) => {
    if (SOLO || !m.sessionId) return;
    landOn(m);   // Open from the notch lands on the item it showed (land.ts)
    if (m.seat === "work") {
      keep({ kind: "session", id: m.sessionId });
      pick("home"); window.dispatchEvent(new CustomEvent("sol:open-work", { detail: m.sessionId }));
    } else {
      const seat = m.seat === "claude" ? "claude" : "codex";
      keep({ kind: "chat", id: m.sessionId, seat });
      pick("home"); window.dispatchEvent(new CustomEvent("sol:open-chat", { detail: { seat, sessionId: m.sessionId, title: "", updatedAt: 0 } }));
    }
    import("@tauri-apps/api/window").then((w) => w.getCurrentWindow().requestUserAttention(2)).catch(() => {});
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // the creature: this window tells the engine its focus and the Mac's idle (the main window only, not a pop-out)
  useEffect(() => {
    let label = "main";
    try { label = getCurrentWindow().label; } catch { /* a plain browser: report anyway */ }
    return label === "main" ? startPresence(wireSend) : undefined;
  }, []);
  // the sessions' pings live here, above the mode, so a permission asked while Cowork shows still reaches Marco (#16 blocker 7)
  usePings(e, useWorkWho(e, mode === "home"), SOLO);
  useOneSol();   // One Sol (#62): the main window watches the NucBox, whatever the mode shows
  if (POP) return <Suspense fallback={null}><Popped e={e} id={POP.id} session={POP.session} /></Suspense>;
  if (SOLO) return <WorkApp e={e} onMode={() => {}} solo={SOLO} />;
  return (
    <>
      {spine && <Spine view={view} onPick={(v) => { back.current = null; hop(v); }} waits={new Set<View>()} onFind={() => window.dispatchEvent(new CustomEvent("sol:find"))} onSettings={openSettings} onJelly={() => {}} />}
      {spine && view === "home" ? <HomeView /> : spine && view === "social" ? <SocialView />
        : mode === "cowork" ? <CoworkApp e={e} onMode={pick} /> : clean ? <Suspense fallback={null}><CleanHome e={e} onMode={pick} /></Suspense> : <WorkApp e={e} onMode={pick} />}
      {/* a group's link opened in the app (#327): it asks over either mode, and opens Cowork only once joined; signed out
          (#342), its "sign in" opens Settings in Home on that drawer, once Home has mounted */}
      <JoinAsk onJoined={() => { try { sessionStorage.setItem("sol.cowork.stage", JSON.stringify({ k: "dashboard" })); } catch { /* private */ } pick("cowork"); window.dispatchEvent(new Event("sol:cowork-group")); }}
        onSignIn={(drawer) => { pick("home"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:settings", { detail: drawer })), 60); }} />
      {/* the one card about counting (#356): once, on the first window after the first run; the press is the whole face of it */}
      {!first && e.settings?.track && (!e.settings.track.told || (e.settings.errorCounts === true && e.settings.track.toldErrors === false)) &&
        <CountsCard errors={e.settings.errorCounts === true} onOk={() => e.setSettings({ track: { told: true, ...(e.settings?.errorCounts ? { toldErrors: true } : {}) } })} />}
      {first && <Suspense fallback={null}><FirstRun e={e} onDone={() => setFirst(false)} /></Suspense>}
    </>
  );
}
