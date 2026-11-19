import { OnboardRow } from "./onboard/OnboardRow";
import { useEffect, useState } from "react";
import { Fold, Turn } from "./MotionKit";
import { CFG } from "./motion";
import { ONE, FELL } from "./engine";
import { ENGINE, WHICH, LIVE, NEXT, FAR_NAME, pickEngine, sameEngine, keptMachines, type Effort, type EngineInfo, type Health, type Models, type Seat, type Settings as S, type GoBackPlan } from "./useEngine";
import { VOICES, VOICE_OFF, ELEVEN_VOICES, ELEVEN_DEFAULT, MAKERS } from "./voices";
import { ControlDrawers } from "./control/Control";
import { CellRange, Status } from "./creature/indicators";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRenovation } from "./renovation";
import { useSidePrefs, setSidePrefs, useKnown, folderEdit, type SidePrefs } from "./home/sidePrefs";
import { applyLook, BUBBLES, LOOK_DEFAULT, SKINS, SWATCHES } from "./look";
import { PinRows } from "./cowork/Pin";   // pin, and go back to a release of the last thirty days (#426)
import { AsidesRows } from "./cowork/Asides";   // what was set aside, and bring back (#425)
import { SettingsShell, ShellSection, Switch, useShell, type Scope } from "./settingsShell";
import { askEngine } from "./cowork/askEngine";
import { ReleasesMini } from "./cowork/Releases";   // only me: the release I run and whether I am behind (#1299)
import { SwitchRow } from "./cowork/v3/SwitchRow";   // fr-30 slice 8: the Cowork v3 switch, under me
import { OldRow } from "./cowork/whole/OldRow";   // Cowork, whole (#1173): "old Cowork", for one release
import { CleanRow, FrameRow } from "./home/CleanRow";
import { TryingRows } from "./TryingRows";   // MY SOL only: the night's build switches as rows
import { AgentsRow } from "./agents/Row";   // #1327: Agents mode's switch
import { ShownRow } from "./shown/ShownRow";
import { useShown } from "./shown/flag";
import { CrossRow } from "./cross/CrossRow";
import { ScreensRow } from "./screens/ScreensRow";   // #1090: Jelly across screens
import { useSaidRows } from "./cross/moving";   // #1031: Home and Build, one place
import { LENSES, LENS_NAMES } from "./stage/lens";
import { LENS_HINTS, oneLens, setUserLens, useUserLens } from "./stage/userLens";
import { KINDS as MOMENT_KINDS } from "./notify/moments";   // the one notification (#845): Settings' one list   // #589: the clean Home's switch, under me
import { SortedRow } from "./work/sorted";   // #1016: the sorted sidebar's switch, under me
import { OneRow } from "./one/OneRow";   // #1002: the one session's switch, under me
import { TeamRow } from "./one/TeamRow";   // #1002: the team size's switch, under the one session's
import { SnapRow } from "./snap/SnapRow";   // #1024: pieces that snap, under the team size's
import { YoursList, YoursRow } from "./yours/YoursSettings";
import { useBuildYours } from "./yours/live";   // #1089: Build becomes yours, its switch and its list
import { PiecesRow } from "./folderPieces/PiecesRow";   // #1092: pieces in Build's project folders
import { HomePiecesRow } from "./folderPieces/HomePiecesRow";   // #1092: pieces in Home's folders, in Settings › home (#1123)
import { LongRow } from "./one/LongRow";   // #1002: the long project's switch, under the one session's
import { WorldRow } from "./home/world3d/WorldRow";   // #1093: Home's world, in Home's own section
import { ConnectionsRow } from "./onboard/ConnectionsRow";   // #1229: what Sol reads, each way in with its state, in Home's own section
import { useTicketsOn, setTicketsOn } from "./one/tickets";   // build.tickets: an orchestration session routes to tickets
import { SpaceRow } from "./pieces/SpaceRow";   // build.space: Build as one space of pieces

// "Try the new Sol" (#1604, docs/port/switch.md): the switch ui.next, one row under me, a copy of Cowork v3's
// (cowork/v3/SwitchRow.tsx). It sends settings.set; the engine sends it back resolved (SOL_UI_NEXT wins) and App.tsx
// draws the new face. It reads the setting here, never from next/, so nothing outside next/ imports it but App.tsx
function NextRow({ s, off, onSet }: { s: unknown; off: boolean; onSet: (patch: object) => void }) {
  const sh = useShell();
  if (!sh || sh.sel !== "me") return null;
  const on = (s as { ui?: { next?: unknown } } | null)?.ui?.next === true;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>Try the new Sol</span>
          <small>Your places, sessions and AIs on one canvas, with what needs you in one list. Your things stay as they are, and you can come back here any time.</small></div>
        <Switch on={on} set={(v) => onSet({ ui: { next: v } })} disabled={off} label="Try the new Sol" />
      </div>
    </div>
  );
}

// Mutable mode (lib.rs, hot.rs): the app's windows load Vite's dev pages, so edits to sol/mac/src appear in place.
// Only inside Sol.app; in a plain browser there is no shell to ask.
type Face = { hot: boolean; state: string };
const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
function useFace(): [Face | null, (hot: boolean) => void] {
  const [face, setFace] = useState<Face | null>(null);
  useEffect(() => {
    if (!inApp) return;
    let alive = true;
    const ask = () => invoke<Face>("face_state").then((f) => { if (alive) setFace(f); }).catch(() => {});
    void ask();
    const un = listen<Face>("face-state", (e) => setFace(e.payload));
    const t = window.setInterval(ask, 2000);
    return () => { alive = false; window.clearInterval(t); void un.then((f) => f()); };
  }, []);
  const set = (hot: boolean) => { setFace((f) => (f ? { ...f, hot, state: hot ? "starting" : "bundled" } : f)); void invoke<Face>("face_mode", { hot }).catch(() => {}); };
  return [face, set];
}

// Takes the place of the talk and the box. One drawer open at a time; the height animates with a grid row.
// build.tickets (off by default): an orchestration session hands each piece of work to its own session; Build's own, so it lives here
function TicketsRow() {
  const sh = useShell();
  const on = useTicketsOn();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>tickets</span><small>an orchestration session hands each piece of work to its own session and keeps only a summary</small></div>
        <Switch on={on} set={setTicketsOn} label="tickets" />
      </div>
    </div>
  );
}

export function Drawer({ name, open, onToggle, children }: { name: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  if (useShell()) return <ShellSection name={name}>{children}</ShellSection>;   // in Settings: one section of the rail, drawn when picked
  return (
    <section className={`drawer ${open ? "open" : ""}`}>
      <button className="drawer-h" onClick={onToggle} aria-expanded={open}>
        <span>{name}</span>
        <Turn to={open ? 180 : 0} cfg={CFG.settle}><svg className="chev" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true"><path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1" /></svg></Turn>
      </button>
      <Fold open={open} from={{ y: 14 }} gap={40}>{children}</Fold>
    </section>
  );
}

export function Pick({ value, options, onChange, disabled }: { value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <span className="pick">
      <select value={value} disabled={disabled} onChange={(ev) => onChange(ev.target.value)}>
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      <svg className="chev" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true"><path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
    </span>
  );
}

const LANGS: [string, string][] = [["follow", "follow Marco"], ["english", "English"], ["cantonese", "Cantonese"], ["dutch", "Dutch"]];

function uptime(since?: string, now = Date.now()) {
  const t = since ? Date.parse(since) : NaN;
  if (!isFinite(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  return m < 1 ? "just started" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

// What the engine starts with (engine/src/settings.ts DEFAULTS), for an engine too old to send its own:
// shown read-only, so the page is honest about what is in force without pretending a change would land.
// the Work modes' names, as the composer says them (#94)
const MODE_NAMES: [string, string][] = [["auto", "auto"], ["default", "manual: ask for each"], ["acceptEdits", "accept edits"], ["plan", "plan"], ["bypassPermissions", "bypass permissions"]];
export const FALLBACK: S = {
  voice: "Kore", patienceMs: 600, language: "follow",
  defaults: { seat: "codex", model: { codex: "gpt-6.1-sol", claude: "claude-opus-5-5" }, effort: { codex: "medium", claude: "medium" }, mode: "default" },
  look: LOOK_DEFAULT,
};

// The look (mine/look/SPEC.md): the base colour, how much of the desktop shows through, the blur behind, and his bubble.
// A slider shows live while it drags (applyLook on the root) and tells the engine once, at the end, like patience.
export function LookDrawer({ s, off, onSet, open, onToggle }: { s: S; off: boolean; onSet: (patch: object) => void; open: boolean; onToggle: () => void }) {
  const look = s.look ?? LOOK_DEFAULT;
  const shownOn = useShown();
  const [live, setLive] = useState<{ alpha?: number; blur?: number; text?: number }>({});
  const alpha = live.alpha ?? look.alpha, blur = live.blur ?? look.blur, text = live.text ?? look.text ?? LOOK_DEFAULT.text;
  const drag = (k: "alpha" | "blur" | "text", v: number) => { setLive((l) => ({ ...l, [k]: v })); applyLook({ ...look, ...live, [k]: v }); };
  const drop = (k: "alpha" | "blur" | "text") => { if (live[k] !== undefined) { onSet({ look: { [k]: live[k] } }); setLive((l) => ({ ...l, [k]: undefined })); } };
  const custom = !SWATCHES.some(([c]) => c === look.color);
  // #1031, say it and Settings moves: the rows a sentence moved light up, and a slider glides from where it was
  const lit = useSaidRows((k, v) => setLive((l) => ({ ...l, [k]: v })));
  const mv = (row: string) => (lit.has(row) ? { "data-cross-moving": "1" } : {});
  return (
    <Drawer name="look" open={open} onToggle={onToggle}>
      <div {...mv("base")} className="field-r">
        <div className="lab"><span>base</span><small>the window's colour, over the desktop</small></div>
        <div className="swatches">
          {SWATCHES.map(([c, name]) => (
            <button key={c} className={`swatch ${look.color === c ? "on" : ""}`} style={{ background: c }} title={name} aria-label={name} disabled={off}
              onClick={() => onSet({ look: { color: c } })} />
          ))}
          <label className={`swatch any ${custom ? "on" : ""}`} title="any colour" style={custom ? { background: look.color } : undefined}>
            <input type="color" value={look.color} disabled={off} onChange={(ev) => onSet({ look: { color: ev.target.value } })} />
          </label>
        </div>
      </div>
      <div {...mv("opacity")} className="field-r">
        <div className="lab"><span>opacity</span><small>how much of the desktop shows through</small></div>
        <div className="range">
          <CellRange min={50} max={100} step={1} value={Math.round(alpha * 100)} aria-label="opacity" disabled={off}
            onChange={(ev) => drag("alpha", Number(ev.target.value) / 100)} onPointerUp={() => drop("alpha")} onKeyUp={() => drop("alpha")} />
          <span className="val">{alpha.toFixed(2)}</span>
        </div>
      </div>
      <div {...mv("blur")} className="field-r">
        <div className="lab"><span>blur</span><small>of the desktop behind</small></div>
        <div className="range">
          <CellRange min={0} max={64} step={1} value={blur} aria-label="blur" disabled={off}
            onChange={(ev) => drag("blur", Number(ev.target.value))} onPointerUp={() => drop("blur")} onKeyUp={() => drop("blur")} />
          <span className="val">{blur} px</span>
        </div>
      </div>
      <div {...mv("text")} className="field-r">
        <div className="lab"><span>text</span><small>the chat's words alone; nothing around them grows</small></div>
        <div className="range">
          <CellRange min={12} max={24} step={1} value={text} aria-label="text size" disabled={off}
            onChange={(ev) => drag("text", Number(ev.target.value))} onPointerUp={() => drop("text")} onKeyUp={() => drop("text")} />
          <span className="val">{text} px</span>
        </div>
      </div>
      <div {...mv("skin")} className="field-r bubbles">
        <div className="lab"><span>home's skin</span><small>{SKINS.find(([k]) => k === (look.skin ?? LOOK_DEFAULT.skin))?.[2]}</small></div>
        <div className="pair">
          {SKINS.map(([k, name]) => (
            <button key={k} className={`bpill ${(look.skin ?? LOOK_DEFAULT.skin) === k ? "on" : ""}`} title={name} aria-label={name} disabled={off} onClick={() => onSet({ look: { skin: k } })}>{shownOn ? <span className={`sh-skin ${k}`} aria-hidden="true" /> : name}</button>
          ))}
        </div>
      </div>
      <div {...mv("bubble")} className="field-r bubbles">
        <div className="lab"><span>your bubble</span><small>a cosmetic pick; the seat's colour stays the one hue</small></div>
        <div className="pair">
          {BUBBLES.map(([k, name]) => (
            <button key={k} className={`bpill ${look.bubble === k ? "on" : ""}`} title={name} aria-label={name} disabled={off} onClick={() => onSet({ look: { bubble: k } })}>{shownOn ? <span className="sh-bub" data-bubble={k} aria-hidden="true"><span className="msg me" /></span> : name}</button>
          ))}
        </div>
      </div>
      <div className="bpreview" data-bubble={look.bubble}>
        <div className="me-row"><div className="msg me">this is how your words will look.</div></div>
      </div>
    </Drawer>
  );
}

// The call's maker and ElevenLabs voice (#24), and the maker that carries a call now ("auto" resolved, the engine's
// read-only voiceNow); absent on an older engine. Read here, not added to useEngine's Settings (on the fence).
type Voiced = S & { voiceVendor?: "auto" | "gemini" | "elevenlabs"; elevenVoice?: string; voiceNow?: "gemini" | "elevenlabs" };

// The way out, where every pane closes: the top right, under the bar. Escape is the same door: both apps' window
// listeners already close a view that is not the chat, after a menu or a pane's own key has had its turn.
function Shut({ onClose }: { onClose: () => void }) {
  return <button className="barbtn settings-x" onClick={onClose} title="close (esc)" aria-label="close settings">×</button>;
}
// #954, stage.whole (whole.html scene 11): how work is drawn, one setting for you, read by Home, Build and Cowork; the
// per-session lens pill is gone
function LensDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const lens = useUserLens();
  return (
    <Drawer name="how work is drawn" open={open} onToggle={onToggle}>
      <p className="hint-line top">one pick for all of Build: the same sessions and artifacts, drawn four ways</p>
      <div className="lens-pick" role="radiogroup" aria-label="how work is drawn">
        {LENSES.map((l) => (
          <button key={l} role="radio" aria-checked={lens === l} className={lens === l ? "on" : ""} onClick={() => setUserLens(l)}>
            <b>{LENS_NAMES[l]}</b><span>{LENS_HINTS[l]}</span>
          </button>
        ))}
      </div>
    </Drawer>
  );
}


// Build's side, set by the person (home/sidePrefs.ts, 2026-11-11): the sort, how long quiet work stays, motion
function SideDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const p = useSidePrefs();
  const known = useKnown(), keys = known.map((k) => k.key);   // the side's folders in its order, hidden ones too (Side.tsx tells them)
  const step = (i: number, by: -1 | 1) => { const to = i + by; if (to < 0 || to >= keys.length) return; folderEdit.move(keys, keys[i], by < 0 ? keys[to] : keys[to + 1] ?? null); };
  return (
    <Drawer name="sidebar" open={open} onToggle={onToggle}>
      <p className="hint-line top">Sol sorts the list for you; here you say how. Pins are on the rows: point at one, press its pin</p>
      <div className="field-r">
        <div className="lab"><span>sorted</span><small>{p.sort === "needs" ? "what waits on you first, then pinned, running, each folder's recent work, and earlier" : "each folder with its sessions, newest first"}</small></div>
        <Pick value={p.sort} options={[["needs", "by what needs you"], ["folder", "by folder"]]} onChange={(v) => setSidePrefs({ sort: v as SidePrefs["sort"] })} />
      </div>
      <div className="field-r">
        <div className="lab"><span>quiet work stays</span><small>how long a session you have not touched keeps its place before it folds into earlier</small></div>
        <Pick value={String(p.stay)} disabled={p.sort !== "needs"} options={[["1", "a day"], ["3", "three days"], ["7", "a week"]]} onChange={(v) => setSidePrefs({ stay: Number(v) as SidePrefs["stay"] })} />
      </div>
      <div className="field-r">
        <div className="lab"><span>rows move</span><small>a session that changes place is seen travelling there</small></div>
        <Switch on={p.motion} label="rows move" set={(v) => setSidePrefs({ motion: v })} />
      </div>
      <p className="hint-line">folders: the same list as the side's edit. Name one your way, move it up or down, or keep it off the side; its sessions that need you still show</p>
      {known.map((k, i) => (
        <div className="field-r" key={k.key} data-folder-row={k.key}>
          <div className="lab">
            <input className="side-fname" defaultValue={k.name} key={k.name} aria-label={`the name of ${k.name}`} spellCheck={false}
              onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} onBlur={(ev) => { if (ev.currentTarget.value.trim() !== k.name) folderEdit.name(k.key, ev.currentTarget.value); }} />
            <small title={k.key}>{k.key.replace(/^\/Users\/[^/]+/, "~")} · {k.n} {k.n === 1 ? "session" : "sessions"}</small>
          </div>
          <span className="side-fmove">
            <button type="button" disabled={i === 0} aria-label={`move ${k.name} up`} onClick={() => step(i, -1)}>↑</button>
            <button type="button" disabled={i === known.length - 1} aria-label={`move ${k.name} down`} onClick={() => step(i, 1)}>↓</button>
          </span>
          <Switch on={!p.hidden.includes(k.key)} label={`${k.name} on the side`} set={(v) => folderEdit.hide(k.key, !v)} />
        </div>
      ))}
      {!known.length && <p className="hint-line">the folders show here once Build's side is open, sorted by what needs you</p>}
    </Drawer>
  );
}

export function Settings({ s: real, stale, info, up, health = null, goBack = null, send, subscribe, models, efforts, sampling, onSet, onHear, first = "voice", more, scope, onScope, onClose }: {
  s: S | null; stale: boolean; info: EngineInfo | null; up: boolean; health?: Health | null; models: Models; efforts: Effort[]; sampling: boolean;
  goBack?: GoBackPlan | null; send?: (o: object) => void;   // the Go back row (#18): what a click would do, and the wire to ask
  subscribe?: (fn: (m: any) => void) => () => void;   // the wire's answers: Settings › home's ways in ask the engine (#1229)
  onSet: (patch: object) => void; onHear: (voice: string) => void;
  first?: string;   // the drawer open at first
  more?: (open: string, toggle: (n: string) => void) => React.ReactNode;   // Work's own drawers, after the shared ones
  scope?: Scope; onScope?: (to: Scope) => void;   // the half shown (Sol's or Build's), and the way across (settingsShell.tsx)
  onClose: () => void;   // back to the chat
}) {
  const [open, setOpen] = useState(up ? first : "engine");
  const yoursOn = useBuildYours();   // #1089: off, only its switch's row shows (no "yours" section)
  const note = useRenovation().note;   // a compile or page error with no part to show it in (issue #15)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [patience, setPatience] = useState<number | null>(null); // while dragging, so the engine is told once
  const [face, setFace] = useFace();

  const look = () => navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === "audioinput"))).catch(() => {});
  useEffect(() => {
    void look();
    navigator.mediaDevices?.addEventListener("devicechange", look);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", look);
  }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  // names only show once the window has had the microphone; ask once, let go at once
  const allow = async () => {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch { /* denied: the list stays as it is */ }
    void look();
  };

  // in the shell a section is picked, never closed: toggle is the drawers' old word for "open this one"
  const toggle = (n: string) => setOpen(n);
  // a drawer asked for by name (#342, sol:settings: the join card's "sign in" opens "me")
  useEffect(() => {
    const named = (ev: Event) => { const d = (ev as CustomEvent).detail; if (typeof d === "string") setOpen(d); };
    window.addEventListener("sol:settings", named);
    return () => window.removeEventListener("sol:settings", named);
  }, []);
  // the Go back row asks the engine what one step back would do, each time the drawer opens with the engine up
  useEffect(() => { if (open === "engine" && up && send) send({ type: "goback.plan" }); }, [open, up, send]);
  const [sure, setSure] = useState(false);   // go back asks once more: it ends what is running
  useEffect(() => { if (!sure) return; const t = window.setTimeout(() => setSure(false), 8000); return () => window.clearTimeout(t); }, [sure]);
  // which Sol: my machines (Control, the copy this window keeps), or the old two when the list is empty
  // one Sol (#62) comes first: the NucBox, this Mac when it does not answer; the rest are pins
  const which = (() => {
    const ONE_OPT: [string, string] = ["one", FELL ? `one Sol (on this Mac until ${FAR_NAME} answers)` : `one Sol: ${FAR_NAME}, this Mac as backup`];
    const list = keptMachines() ?? [];
    if (!list.length) return { value: ONE ? "one" : WHICH as string, options: [ONE_OPT, ["next", "this Mac only"], ["live", `${FAR_NAME} only`]] as [string, string][] };
    const options = list.map((m): [string, string] => [m.url, m.name]);
    const at = list.find((m) => sameEngine(m.url, ENGINE));
    if (!at) options.unshift([ENGINE, sameEngine(ENGINE, NEXT) ? "next, this Mac" : sameEngine(ENGINE, LIVE) ? `live, ${FAR_NAME}` : ENGINE]);
    options.unshift(ONE_OPT);
    return { value: ONE ? "one" : at?.url ?? ENGINE, options };
  })();
  // the line HELP.md gives: ~/Sol is where the install puts a tester's Sol; a Sol cloned by hand lives where it was put
  const BACK_LINE = "bash ~/Sol/sol/back";
  const [copied, setCopied] = useState(false);
  const copyBack = () => { void navigator.clipboard?.writeText(BACK_LINE).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }); };
  // the engine drawer, the one part that must work with the engine down (#16 blocker 6): status, which engine, the
  // face, the address, the last error; the controls that need the engine wait for it
  const engineDrawer = (
    <Drawer name="engine" open={open === "engine"} onToggle={() => toggle("engine")}>
      <dl className="facts">
        <dt>status</dt><dd><Status up={up} />{up ? "up" : "down"}{up && info?.since ? `, ${uptime(info.since, now)}` : ""}{!up && health?.reverted?.what === "engine" ? `; went back to its last good build at ${new Date(health.reverted.at).toLocaleTimeString()}` : ""}</dd>
        <dt>which</dt><dd><Pick value={which.value} options={which.options} onChange={(v) => pickEngine(v)} /></dd>
        {face && <><dt>face</dt><dd><Pick value={face.hot ? "hot" : "bundled"} options={[["bundled", "bundled"], ["hot", "hot, edits appear live"]]} onChange={(v) => setFace(v === "hot")} /></dd>
          <dt /><dd className={`face-state ${face.state === "hot" ? "hot" : face.state === "dev server down" ? "down" : ""}`}>{face.state}</dd></>}
        <dt>address</dt><dd className="mono">{ENGINE}</dd>
        {up && <><dt>release</dt><dd><ReleasesMini ask={askEngine} /></dd></>}
        <PinRows up={up} />
        {health && <><dt>kept</dt><dd>{health.kept ? "by its keeper" : "not by its keeper"}{health.build ? `; build watcher ${health.build.alive ? "alive" : "dead"}${health.build.errors ? `, ${health.build.errors} error${health.build.errors > 1 ? "s" : ""}` : ""}` : ""}</dd></>}
        {up && send && <><dt>go back</dt><dd className="goback">
          {!sure
            ? <button className="stop" disabled={!goBack || (!goBack.engine && !goBack.face)} onClick={() => setSure(true)}>go back</button>
            : <button className="stop sure" onClick={() => { setSure(false); send({ type: "goback" }); }}>yes, go back now</button>}
          <span className="goback-line">{goBack ? goBack.line : "…"}</span></dd></>}
        <AsidesRows up={up} />
        {!up && <><dt>if it stays down</dt><dd><ol className="help-steps">
          <li>wait a minute: the keeper restarts it, and after three bad starts puts the last good build back by itself</li>
          <li>or pick the other engine above and keep working there</li>
          <li>still down after two minutes: press Cmd-Space, type Terminal, and paste this line
            <code className="mono">{BACK_LINE}</code>
            <button className="link" onClick={copyBack}>{copied ? "copied" : "copy"}</button>
            <span>it puts the last good build back, takes back the face's last change, starts the engine again, and says what it did (~/Sol is where the install put Sol; a Sol you cloned yourself: that folder instead)</span></li>
          <li>Sol.app itself will not open: the same line, then open Sol again</li>
          <li>none of it helps: say so in the beta testers' Discord (Tell us… in the menu bar) with the end of ~/Library/Logs/sol-engine.log; or Claude Code in Sol's folder, "Sol is down, read sol/HELP.md"</li>
        </ol></dd></>}
        {health?.reverted && <><dt>last take-back</dt><dd title={health.reverted.line}>{health.reverted.what === "engine" ? "the engine's last good build" : "a face edit"}, {new Date(health.reverted.at).toLocaleTimeString()}{health.reverted.line ? `: ${health.reverted.line}` : ""}</dd></>}
        <dt>voice key</dt><dd>{info ? `${(real as Voiced | null)?.voiceNow === "elevenlabs" ? "ElevenLabs" : "Gemini"}, ${info.haveVoiceKey ? "set" : "not set"}` : "–"}</dd>
        <dt>dictation</dt><dd>{info?.dictationModel || "–"}</dd>
        {note && <><dt>last error</dt><dd className="mono" title={note}>{note}</dd></>}
      </dl>
    </Drawer>
  );
  if (!up || (!real && !stale)) {
    return (
      <SettingsShell open="engine" setOpen={setOpen} scope={scope} onScope={onScope} peek={{ engine: <i className={`sdot ${up ? "up" : "down"}`} /> }}
        top={<><Shut onClose={onClose} /><p className="hint-line top stale">{up ? "loading…" : "the engine is down; it comes back by itself under its keeper, or pick the other one"}</p></>}>
        {engineDrawer}
      </SettingsShell>
    );
  }
  // no settings from this engine: its defaults, every control disabled until real ones arrive
  const off = !real;
  const seatDefault = (k: Seat) => models.seats.find((x) => x.seat === k)?.default;
  const s: S = real ?? { ...FALLBACK, defaults: { ...FALLBACK.defaults,
    model: { codex: seatDefault("codex") ?? FALLBACK.defaults.model.codex, claude: seatDefault("claude") ?? FALLBACK.defaults.model.claude } } };
  const named = mics.some((m) => m.label);
  const seatModels = (k: Seat) => models.seats.find((x) => x.seat === k)?.models ?? [];
  const patience_ = patience ?? s.patienceMs;
  // ElevenLabs carries the call (#24): its voices stand in for Gemini's; "off" stays first
  const sv = s as Voiced;
  const eleven = sv.voiceNow === "elevenlabs";
  const elevenNow = sv.elevenVoice ?? ELEVEN_DEFAULT;
  const cards: [string, string, string][] = eleven
    ? [[VOICE_OFF, VOICE_OFF, VOICES[0][1]], ...ELEVEN_VOICES]
    : VOICES.map(([name, word]): [string, string, string] => [name, name, word]);
  const cardOn = (id: string) => eleven ? (id === VOICE_OFF ? s.voice === VOICE_OFF : s.voice !== VOICE_OFF && elevenNow === id) : s.voice === id;
  const pickCard = (id: string) => onSet(!eleven || id === VOICE_OFF ? { voice: id }
    : { elevenVoice: id, ...(s.voice === VOICE_OFF ? { voice: FALLBACK.voice } : {}) });

  // what each section is set to now, as a word or a mark beside it in the rail
  const seatNow = s.defaults.seat ?? "codex";
  const micNow = s.mic ? mics.find((m) => m.deviceId === s.mic)?.label : "";
  const peek: Record<string, React.ReactNode> = {
    voice: s.voice === VOICE_OFF ? "off" : eleven ? (ELEVEN_VOICES.find((v) => v[0] === elevenNow)?.[1] ?? "eleven").toLowerCase() : s.voice.toLowerCase(),
    microphone: micNow ? micNow.replace(/\s*\(.*\)$/, "").slice(0, 14) : "default",
    defaults: (s.defaults.model[seatNow] ?? "").replace(/^claude-/, "").replace(/^gpt-/, "gpt "),
    look: <i className="sdot swatch-peek" style={{ background: s.look?.color ?? LOOK_DEFAULT.color }} />,
    engine: <i className={`sdot ${up ? "up" : "down"}`} />,
  };

  return (
    <SettingsShell open={open} setOpen={setOpen} peek={peek} scope={scope} onScope={onScope}
      top={<><Shut onClose={onClose} />{off && <p className="hint-line top stale">the engine is older than this window; restart it to change these</p>}</>}>
      <div className={off ? "settings-off" : ""} style={{ display: "contents" }}>
        <ControlDrawers open={open} toggle={toggle} onSet={onSet} />
        <SwitchRow s={real} off={off} onSet={onSet} />
        <NextRow s={real} off={off} onSet={onSet} />
        <OldRow />
        <CleanRow />
        <CrossRow />
        <ScreensRow />
        <FrameRow />
        <OnboardRow />
        {/* Marco, 2026-11-12: a switch dedicated to one mode lives in that mode's own settings; Build's are here */}
        <Drawer name="switches" open={open === "switches"} onToggle={() => toggle("switches")}>
          <TryingRows />
          <AgentsRow />
          <SortedRow />
          <OneRow />
          <TeamRow />
          <LongRow />
          <SnapRow />
          <YoursRow />
          <PiecesRow />
          <TicketsRow />
          <SpaceRow />
        </Drawer>
        {yoursOn && <Drawer name="yours" open={open === "yours"} onToggle={() => toggle("yours")}><YoursList /></Drawer>}
        <Drawer name="home" open={open === "home"} onToggle={() => toggle("home")}>
          <ConnectionsRow wire={up && send && subscribe ? { send, subscribe } : undefined} />
          <WorldRow />
          <HomePiecesRow />
        </Drawer>
        <Drawer name="voice" open={open === "voice"} onToggle={() => toggle("voice")}>
          <div className="field-r">
            <div className="lab"><span>maker</span><small>who hears and talks on a call</small></div>
            <Pick value={sv.voiceVendor ?? "auto"} options={MAKERS} disabled={off || !sv.voiceVendor} onChange={(v) => onSet({ voiceVendor: v })} />
          </div>
          <div className="voices">
            {cards.map(([id, name, word]) => {
              const on = cardOn(id);
              return (
                <div key={id} className={`vcard ${on ? "on" : ""}`} role="button" tabIndex={off ? -1 : 0} aria-disabled={off}
                  onClick={() => { if (!off) pickCard(id); }}
                  onKeyDown={(ev) => { if (!off && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); pickCard(id); } }}>
                  <b>{name.toLowerCase()}</b>
                  <span>{word}</span>
                  {on && name !== VOICE_OFF && (
                    <button className={`hear ${sampling ? "playing" : ""}`} disabled={off || sampling || !up} onClick={(ev) => { ev.stopPropagation(); onHear(eleven ? id : name); }}
                      title="a real sample in this voice">{sampling ? "playing…" : "hear it"}</button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="field-r">
            <div className="lab"><span>patience</span><small>how long a pause before it answers</small></div>
            <div className="range">
              <CellRange min={200} max={1500} step={50} value={patience_} aria-label="patience" disabled={off}
                onChange={(ev) => setPatience(Number(ev.target.value))}
                onPointerUp={() => { if (patience !== null) { onSet({ patienceMs: patience }); setPatience(null); } }}
                onKeyUp={() => { if (patience !== null) { onSet({ patienceMs: patience }); setPatience(null); } }} />
              <span className="val">{patience_} ms</span>
            </div>
          </div>
          <div className="field-r">
            <div className="lab"><span>language</span></div>
            <Pick value={s.language} options={LANGS} disabled={off} onChange={(v) => onSet({ language: v })} />
          </div>
        </Drawer>

        <Drawer name="microphone" open={open === "microphone"} onToggle={() => toggle("microphone")}>
          <div className="field-r">
            <div className="lab"><span>input</span></div>
            <Pick value={s.mic && mics.some((m) => m.deviceId === s.mic) ? s.mic : ""}
              options={[["", "system default"], ...mics.filter((m) => m.deviceId && m.deviceId !== "default").map((m, i): [string, string] => [m.deviceId, m.label || `microphone ${i + 1}`])]}
              onChange={(v) => onSet({ mic: v || null })} disabled={off} />
          </div>
          {!named && mics.length > 0 && <p className="hint-line">names appear once Sol is allowed the microphone. <button className="link" onClick={allow}>allow</button></p>}
          <p className="hint-line">hold the mic to talk, tap to toggle</p>
        </Drawer>

        <Drawer name="defaults" open={open === "defaults"} onToggle={() => toggle("defaults")}>
          <p className="hint-line top">for new conversations only; an open one keeps its own. Who answers a new chat is in my accounts</p>
          {(["codex", "claude"] as Seat[]).map((k) => (
            <div className="field-r" key={k}>
              <div className="lab"><span>{k}</span></div>
              <div className="pair">
                <Pick value={s.defaults.model[k]} options={(seatModels(k).length ? seatModels(k) : [s.defaults.model[k]]).map((m): [string, string] => [m, m])}
                  onChange={(v) => onSet({ defaults: { model: { [k]: v } } })} disabled={off} />
                <Pick value={s.defaults.effort[k]} options={efforts.map((e): [string, string] => [e, e])}
                  onChange={(v) => onSet({ defaults: { effort: { [k]: v } } })} disabled={off} />
              </div>
            </div>
          ))}
          <div className="field-r">
            <div className="lab"><span>work may</span></div>
            <Pick value={s.defaults.mode} options={MODE_NAMES}
              onChange={(v) => onSet({ defaults: { mode: v } })} disabled={off} />
          </div>
          <p className="hint-line">what Claude does without asking in a session, and in every session a card starts</p>
        </Drawer>

        <Drawer name="notifications" open={open === "notifications"} onToggle={() => toggle("notifications")}>
          <p className="hint-line top">one moment, one place: in this window while Sol is on your screen, one banner from the Mac while it is not</p>
          {MOMENT_KINDS.map(([k, label]) => (
            <div className="field-r" key={k}>
              <div className="lab"><span>{label}</span></div>
              <Switch on={s.notify?.moments?.[k] !== false} disabled={off} label={label}
                set={(v) => onSet({ notify: { ...s.notify, moments: { ...s.notify?.moments, [k]: v } } })} />
            </div>
          ))}
        </Drawer>

        {oneLens() && <LensDrawer open={open === "drawn"} onToggle={() => toggle("drawn")} />}
        <SideDrawer open={open === "sidebar"} onToggle={() => toggle("sidebar")} />

        <LookDrawer s={s} off={off} onSet={onSet} open={open === "look"} onToggle={() => toggle("look")} />
        <ShownRow />
        {engineDrawer}
        {more?.(open, toggle)}
      </div>
    </SettingsShell>
  );
}
