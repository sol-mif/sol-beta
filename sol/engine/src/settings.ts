// Marco's settings, one small JSON file next to the engine (engine/settings.json, gitignored; SOL_SETTINGS overrides
// the path, for tests and a second engine).
// The face asks with settings.get and changes with settings.set { patch }; the engine merges, checks,
// writes and tells every face. Anything it does not recognise is dropped, so a bad patch cannot break a call.

import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, modeOf, onFor, stageOf, standsOn, WINDOW_SWITCHES, type Mode } from "./versions.js";

export type Seat = "codex" | "claude";
// what Claude may do without asking in a Work session, as Claude Code names it; the face's starting pick, and the pick of
// a session started by a card, a hand-off or a tool when its parent is no longer live (a live parent hands down its own mode)
export type WorkMode = "default" | "acceptEdits" | "plan" | "auto" | "bypassPermissions";
export const WORK_MODES: WorkMode[] = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
export type Settings = {
  voice: string;
  // who carries the call (src/call/): "auto" is ElevenLabs when its key is in .env, else Gemini Live (#24)
  voiceVendor: VoiceVendorPick;
  // the ElevenLabs voice (a voice id), used when ElevenLabs carries the call
  elevenVoice: string;
  patienceMs: number;
  language: "follow" | "english" | "cantonese" | "dutch";
  mic?: string;
  defaults: { seat: Seat; model: Record<Seat, string>; effort: Record<Seat, string>; mode: WorkMode };
  // the look (mine/look/SPEC.md): the window's base colour (#rrggbb), its opacity over the desktop (0.5–1), the blur
  // behind it (0–64 px), the style of the person's own bubble and the size of the chat's words (12–24 px, #268: the talk's
  // bubbles and a room's lines, nothing around them)
  look: { color: string; alpha: number; blur: number; bubble: Bubble; text: number; skin: Skin };
  // tracking (#356, src/track.ts): usage = how Sol is used, as counts, on by default and turned off only by hand here
  // (a tester asks in Discord); told = the one card on the first window was pressed (the face has no switch);
  // toldErrors = that card was pressed since it says the error counts too (#485), so a tester from before sees it once more
  track: { usage: boolean; told: boolean; toldErrors: boolean };
  // Cowork v3 (fr-30): the switch, me layer, off unless set; written only once someone sets it, so a settings file
  // and the face's settings message are today's while it is off. coworkV3() is the one reading of it (env first)
  cowork?: { v3: boolean };
  // the frame (#630, #633): the face's switch sol.frame, told to the engine so the kernel (kernel.ts) runs only with it
  // on; written only once someone turns it, like cowork.v3. frameOn() is the one reading of it (env first)
  frame?: boolean;
  // the whole stage (Build, #820 to #826): the engine's own switch stage.whole, on unless set false (#691), written only once
  // someone sets it, like cowork.v3. stageWhole() is the one reading of it (env first). The face keeps a switch of the
  // same name on its side and never tells the engine, so to try a slice both are on
  stage?: { whole?: boolean };
  // the lens (#824): GUI · TUI · CLI · IDE, one track in Settings for every stage (app is the GUI). Written only once
  // someone sets it (settings.set, or a work.stage.layout that names a lens with stage.whole on); unset is app. Heard by
  // the stage only with stage.whole on (getStage in work/blocks.ts); off, each session keeps its own lens in stage.json
  lens?: Lens;
  // Home's engine half (#790 and after): the one switch for the new Home, unset where versions.ts stands it (#691),
  // written only once someone sets it, like frame. homeWhole() is the one reading of it (env first); the face's sol.home.whole is its own switch
  home?: { whole?: boolean };
  // the one onboarding's reader (#1195, parts/onboard.ts): the person's sentences read by their own Claude, in any
  // language. Off unless set, written only once someone sets it. onboardReads() is the one reading of it (env first)
  onboarding?: { reads?: boolean };
  identity?: { supabase?: boolean };   // sign-in on Supabase in front of the cloud's own (#1607)
  // the log's narrow look (#691 step 3): GET /log takes kinds= and since=-1, and the kernel says a page or ask edited in
  // place (plugin.edited), so the face can read /things again only when they can have changed. Off unless set, written
  // only once someone sets it, like frame. logKinds() is the one reading of it (env first)
  log?: { kinds?: boolean };
  // one notification (#845, notify.ts): each moment on or off (absent is on). Written only once someone sets it
  notify?: { moments?: Partial<Record<MomentKind, boolean>> };
  // reach (#1166) behind two switches (#1276), each off unless set and written only once someone sets it: `tools`, the
  // tools that ask a teammate's agent or hand work over and the hand-over line a new session opens with; `room`, the
  // Agents' room (agents_room and its page). reachTools() and reachRoom() are the readings (env first). Answering an ask
  // is its own switch, reach.json's (team/reach.ts answering, #1224)
  reach?: { tools?: boolean; room?: boolean };
  // open for the person (#1521, openfor.ts): the seat's three tools that open a Settings drawer or a pane and change a
  // setting the person asked for in that turn. Off unless set, written only once someone sets it. openFor() is the reading (env first)
  open?: { for?: boolean };
  // the pause signal (#1597, pause.ts): the Mac's own pauses (typing stops, an app switch, a call's end) told to the
  // faces, and a question held for the next one. Off unless set, written only once someone sets it. pauseSignal() is the reading (env first)
  pause?: { signal?: boolean };
  // the version this Sol runs as (versions.ts): concept, complete or product, picked by hand. Written only once someone
  // picks; unset, the channel decides (beta: product, dev: concept). versionMode() is the one reading of it (env first)
  version?: Mode;
  // the morning's waits (#1128 step 8, parts/waits.ts): every wait on me older than a day as a block that asks at the top
  // of my first session after 05:00. Off unless set true (Marco, 2026-11-16 21:07 ET): versions.ts stands it at "hand",
  // and this one setting turns it on. Written only once someone sets it. morningWaits() is the one reading of it (env first)
  morning?: { waits?: boolean };
  // the context ring's live count (#683, #1519): the exact total at every step of a turn, the split recounted at most
  // every 10 s, and a part's breakdown when the card asks (work.context.part). Off, the count after each turn as before.
  // Written only once someone sets it. liveContext() is the one reading of it (env first)
  work?: { liveContext?: boolean };
  // pause updates (#1566, Settings › me, for a demo): a dev release is still fetched and built aside, but not swapped in
  // while it is on (team/ship.ts installDev). Off unless set, written only once someone sets it. updatesPaused() reads it
  updates?: { paused?: boolean };
};
// the lenses a stage is drawn in (#701); work/blocks.ts takes them from here, so settings.ts imports nothing of the stage
export const LENSES = ["app", "tui", "cli", "ide"] as const;
export type Lens = (typeof LENSES)[number];
export type MomentKind = "done" | "question" | "permission" | "failed" | "green" | "hand" | "stable" | "ping";
export const MOMENT_KINDS: MomentKind[] = ["done", "question", "permission", "failed", "green", "hand", "stable", "ping"];
export type Bubble = "slab" | "glass" | "edge" | "classic" | "outline" | "bare";
export const BUBBLES: Bubble[] = ["slab", "glass", "edge", "classic", "outline", "bare"];
// the clean Home's skin (#589, Marco 2026-11-02: a cosmetic pick): pearl, a sheen on what has you; ink, lines and words only
export type Skin = "pearl" | "ink";
export const SKINS: Skin[] = ["pearl", "ink"];

export type VoiceVendorPick = "auto" | "gemini" | "elevenlabs";
export const VOICE_VENDORS: VoiceVendorPick[] = ["auto", "gemini", "elevenlabs"];
// ElevenLabs' premade voices offered in Settings (any voice id of the account works in the file); Sarah by default
export const ELEVEN_VOICES: [string, string][] = [
  ["EXAVITQu4vr4xnSDxMaL", "Sarah"], ["cgSgspJ2msm6clMCkdW9", "Jessica"], ["SAz9YHcvj6GT2YYXdXww", "River"],
  ["Xb7hH8MSUJpSbSDYk0k2", "Alice"], ["pFZP5JQG7iQjIQuC4Bku", "Lily"], ["CwhRBWXzGAHq8TQ4Fs17", "Roger"],
  ["cjVigY5qzO86Huf0OWal", "Eric"], ["iP95p4xoKVk53GoZ742B", "Chris"], ["bIHbv24MWmeRgasZH58o", "Will"], ["JBFqnCBsd6RMkjVDRZzb", "George"],
];

// Gemini Live's prebuilt voices. "off" is also a valid voice: Sol listens and writes, it does not talk (no call starts).
export const VOICE_OFF = "off";
export const VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];
const LANGS = ["follow", "english", "cantonese", "dutch"];
const EFFORTS = ["low", "medium", "high", "max"];
const FILE = process.env.SOL_SETTINGS || join(dirname(fileURLToPath(import.meta.url)), "..", "settings.json");

export const DEFAULTS: Settings = {
  voice: "Kore",
  voiceVendor: "auto",
  elevenVoice: "EXAVITQu4vr4xnSDxMaL",
  patienceMs: 600,
  language: "follow",
  defaults: {
    seat: "codex",
    model: { codex: "gpt-6.1-sol", claude: "claude-opus-5-5" },
    effort: { codex: "medium", claude: "medium" },
    mode: "default",
  },
  look: { color: "#000000", alpha: 0.78, blur: 48, bubble: "edge", text: 15, skin: "pearl" },
  track: { usage: true, told: false, toldErrors: false },
};
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);

// Whatever is on disk or in a patch, made into a valid Settings.
/** a settings file's content as the engine keeps it (pure): what it does not recognise is dropped */
export function clean(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const d = isObj(r.defaults) ? r.defaults : {};
  const dm = isObj(d.model) ? d.model : {};
  const de = isObj(d.effort) ? d.effort : {};
  const effort = (v: unknown, k: string) => (typeof v === "string" && EFFORTS.includes(v) ? v : DEFAULTS.defaults.effort[k as Seat]);
  const lk = isObj(r.look) ? r.look : {};
  const tk = isObj(r.track) ? r.track : {};
  const out: Settings = {
    voice: typeof r.voice === "string" && (r.voice === VOICE_OFF || VOICES.includes(r.voice)) ? r.voice : DEFAULTS.voice,
    voiceVendor: VOICE_VENDORS.includes(r.voiceVendor as VoiceVendorPick) ? (r.voiceVendor as VoiceVendorPick) : DEFAULTS.voiceVendor,
    elevenVoice: typeof r.elevenVoice === "string" && /^[A-Za-z0-9]{8,40}$/.test(r.elevenVoice) ? r.elevenVoice : DEFAULTS.elevenVoice,
    patienceMs: typeof r.patienceMs === "number" && isFinite(r.patienceMs) ? Math.min(1500, Math.max(200, Math.round(r.patienceMs))) : DEFAULTS.patienceMs,
    language: typeof r.language === "string" && LANGS.includes(r.language) ? (r.language as Settings["language"]) : "follow",
    defaults: {
      seat: d.seat === "claude" ? "claude" : "codex",
      model: { codex: str(dm.codex, DEFAULTS.defaults.model.codex), claude: str(dm.claude, DEFAULTS.defaults.model.claude) },
      effort: { codex: effort(de.codex, "codex"), claude: effort(de.claude, "claude") },
      mode: WORK_MODES.includes(d.mode as WorkMode) ? (d.mode as WorkMode) : DEFAULTS.defaults.mode,
    },
    look: {
      color: typeof lk.color === "string" && /^#[0-9a-fA-F]{6}$/.test(lk.color) ? lk.color.toLowerCase() : DEFAULTS.look.color,
      alpha: Math.round(num(lk.alpha, 0.5, 1, DEFAULTS.look.alpha) * 100) / 100,
      blur: Math.round(num(lk.blur, 0, 64, DEFAULTS.look.blur)),
      bubble: BUBBLES.includes(lk.bubble as Bubble) ? (lk.bubble as Bubble) : DEFAULTS.look.bubble,
      text: Math.round(num(lk.text, 12, 24, DEFAULTS.look.text)),
      skin: SKINS.includes(lk.skin as Skin) ? (lk.skin as Skin) : DEFAULTS.look.skin,
    },
    track: { usage: tk.usage !== false, told: tk.told === true, toldErrors: tk.toldErrors === true },
  };
  if (typeof r.mic === "string" && r.mic) out.mic = r.mic;
  if (isObj(r.cowork) && typeof r.cowork.v3 === "boolean") out.cowork = { v3: r.cowork.v3 };
  if (typeof r.frame === "boolean") out.frame = r.frame;
  // each key under stage is kept on its own line, so a patch of one (merged, then cleaned here) never drops another
  if (isObj(r.stage)) {
    const stage: NonNullable<Settings["stage"]> = {};
    if (typeof r.stage.whole === "boolean") stage.whole = r.stage.whole;
    if (Object.keys(stage).length) out.stage = stage;
  }
  if (LENSES.includes(r.lens as Lens)) out.lens = r.lens as Lens;
  if (isObj(r.home) && typeof r.home.whole === "boolean") out.home = { whole: r.home.whole };
  if (isObj(r.reach)) {
    const reach: NonNullable<Settings["reach"]> = {};
    if (typeof r.reach.tools === "boolean") reach.tools = r.reach.tools;
    if (typeof r.reach.room === "boolean") reach.room = r.reach.room;
    if (Object.keys(reach).length) out.reach = reach;
  }
  if (isObj(r.open) && typeof r.open.for === "boolean") out.open = { for: r.open.for };
  if (isObj(r.pause) && typeof r.pause.signal === "boolean") out.pause = { signal: r.pause.signal };
  if (isObj(r.onboarding) && typeof r.onboarding.reads === "boolean") out.onboarding = { reads: r.onboarding.reads };
  if (isObj(r.log) && typeof r.log.kinds === "boolean") out.log = { kinds: r.log.kinds };
  if (isObj(r.work) && typeof r.work.liveContext === "boolean") out.work = { liveContext: r.work.liveContext };
  if (isObj(r.notify)) {
    const n = r.notify, mo = isObj(n.moments) ? n.moments : {};
    const moments: Partial<Record<MomentKind, boolean>> = {};
    for (const k of MOMENT_KINDS) if (typeof mo[k] === "boolean") moments[k] = mo[k] as boolean;
    out.notify = Object.keys(moments).length ? { moments } : {};
  }
  if (MODES.includes(r.version as Mode)) out.version = r.version as Mode;
  if (isObj(r.morning) && typeof r.morning.waits === "boolean") out.morning = { waits: r.morning.waits };
  if (isObj(r.updates) && typeof r.updates.paused === "boolean") out.updates = { paused: r.updates.paused };
  return out;
}

function merge(a: unknown, b: unknown): unknown {
  if (!isObj(a) || !isObj(b)) return b;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
}

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  try { current = clean(JSON.parse(readFileSync(FILE, "utf8"))); } catch { current = clean({}); }
  return current;
}

// A null mic in a patch means "back to the system default".
export function patchSettings(patch: unknown): Settings {
  const p = isObj(patch) ? { ...patch } : {};
  const base = { ...getSettings() } as Record<string, unknown>;
  if ("mic" in p && !p.mic) { delete base.mic; delete p.mic; }
  // stage.whole and home.whole can read on unset (#691, versions.ts): a stage or home patch that is not
  // { whole: boolean } is dropped, so a bad one never takes a false away and turns it on
  if ("stage" in p && !(isObj(p.stage) && typeof p.stage.whole === "boolean")) delete p.stage;
  if ("home" in p && !(isObj(p.home) && typeof p.home.whole === "boolean")) delete p.home;
  if ("morning" in p && !(isObj(p.morning) && typeof p.morning.waits === "boolean")) delete p.morning;   // off unset too (#1128)
  if ("updates" in p && !(isObj(p.updates) && typeof p.updates.paused === "boolean")) delete p.updates;   // #1566
  // reach, onboarding.reads and log.kinds read on unset for the team (#1406): a key that is not a boolean is dropped from
  // the patch, so it never takes a person's false away
  for (const [k, keys] of [["reach", ["tools", "room"]], ["onboarding", ["reads"]], ["log", ["kinds"]], ["work", ["liveContext"]], ["open", ["for"]], ["pause", ["signal"]]] as const) {
    if (!(k in p)) continue;
    const v = p[k];
    const kept = isObj(v) ? Object.fromEntries(keys.filter((x) => typeof v[x] === "boolean").map((x) => [x, v[x]])) : {};
    if (Object.keys(kept).length) p[k] = kept; else delete p[k];
  }
  // a null lens is "back to app" (#824); a lens the engine does not know leaves the one before
  if ("lens" in p && p.lens === null) { delete base.lens; delete p.lens; }
  else if ("lens" in p && !LENSES.includes(p.lens as Lens)) delete p.lens;
  // a null version is "back to what the channel says"; a word that is not a version leaves the one before
  if ("version" in p && p.version === null) { delete base.version; delete p.version; }
  else if ("version" in p && !MODES.includes(p.version as Mode)) delete p.version;
  const next = clean(merge(base, p));
  const tmp = FILE + ".tmp";
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, FILE); // never a half-written file
  } catch (e) { try { unlinkSync(tmp); } catch { /* none was made */ } throw e; }
  current = next; // only once it is on disk: a write the disk refused leaves the engine's memory as the file is (#824)
  noteCoworkV3();
  noteStageWhole();
  noteFrame();
  noteHomeWhole();
  for (const f of patchHearers) { try { f(); } catch { /* one hearer's trouble is never the setting's */ } }
  return current;
}

// The version this Sol runs as (versions.ts). The channel is Ship's to read (team/ship.ts, which tells it here), so
// this file imports nothing of the team; until it is told, the channel is not known and versionMode() may be null
let channel: "dev" | "beta" | null = null;
/** the version this Sol runs as: env SOL_VERSION first, else the setting `version`, else by its channel; null while
 *  the channel is not known and nobody picked. Read each time, as the switches are */
export function versionMode(): Mode | null {
  return modeOf(process.env.SOL_VERSION, getSettings().version, channel);
}
/** Ship learned this Sol's channel, or saw it change: a switch whose reading turns with the version tells its hearers */
export function noteChannel(c: "dev" | "beta" | null): void {
  channel = c === "dev" || c === "beta" ? c : null;
  noteCoworkV3();
  noteStageWhole();
  noteFrame();
  noteHomeWhole();
}

// Cowork v3's switch turned while the engine runs (fr-30): who must hear it (the agent's tools and the team's sync)
// hears it once per change, whether the setting changed or SOL_COWORK_V3 did (a test, a developer's run)
const v3Hearers: ((on: boolean) => void)[] = [];
let v3Was: boolean | null = null;
export function onCoworkV3(f: (on: boolean) => void): void { v3Hearers.push(f); if (v3Was === null) v3Was = coworkV3(); }
/** read the switch again and tell its hearers when it changed (patchSettings calls it; so may anyone who changed the env) */
export function noteCoworkV3(): void {
  const on = coworkV3();
  if (v3Was === on) return;
  v3Was = on;
  for (const f of v3Hearers) { try { f(on); } catch { /* one hearer's trouble is never the setting's */ } }
}

/** whether Cowork v3 is on (fr-30): env SOL_COWORK_V3=on or off decides for a Sol developer's own run, else the
 *  setting cowork.v3, else where the switch stands in this Sol's version (versions.ts; off today). Read on every
 *  message, so the setting needs no restart */
export function coworkV3(): boolean {
  const env = coworkV3Env();
  return env ? env === "on" : onFor("cowork.v3", versionMode(), getSettings().cowork?.v3);
}
/** what SOL_COWORK_V3 says, or "" when it says nothing (then the setting decides) */
export function coworkV3Env(): "on" | "off" | "" {
  const env = (process.env.SOL_COWORK_V3 ?? "").trim().toLowerCase();
  return env === "on" || env === "1" || env === "true" ? "on" : env === "off" || env === "0" || env === "false" ? "off" : "";
}

/** whether the frame is on for this engine (#633): env SOL_FRAME=on or off decides for a Sol developer's own run or a
 *  test engine, else the setting `frame`, which the face's switch sends (frameFlag.ts); off by default */
export function frameOn(): boolean {
  const env = (process.env.SOL_FRAME ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("frame", versionMode(), getSettings().frame);
}

/** whether the log's narrow look is on for this engine (#691 step 3): env SOL_LOG_KINDS=on or off decides for a Sol
 *  developer's own run or a test, else the setting log.kinds, else where versions.ts stands it (the team: on, #1406). Read each time, so it needs no restart */
export function logKinds(): boolean {
  const env = (process.env.SOL_LOG_KINDS ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("log.kinds", versionMode(), getSettings().log?.kinds);
}

/** whether the whole stage is on for this engine (Build, #820 to #826): env SOL_STAGE_WHOLE=on or off decides for a Sol
 *  developer's own run or a test, else the setting stage.whole; on unless set false (#691). Read each time, so it needs no restart */
export function stageWhole(): boolean {
  const env = (process.env.SOL_STAGE_WHOLE ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("stage.whole", versionMode(), getSettings().stage?.whole);
}
// the whole stage's switch turned while the engine runs (#822): the agent's tools that come with it (tools.ts, reopen)
// hear it once per change, as Cowork v3's do; what is read each time (stageWhole) needs no hearing
const wholeHearers: ((on: boolean) => void)[] = [];
let wholeWas: boolean | null = null;
export function onStageWhole(f: (on: boolean) => void): void { wholeHearers.push(f); if (wholeWas === null) wholeWas = stageWhole(); }
/** read the switch again and tell its hearers when it changed (patchSettings calls it; so may anyone who changed the env) */
export function noteStageWhole(): void {
  const on = stageWhole();
  if (wholeWas === on) return;
  wholeWas = on;
  for (const f of wholeHearers) { try { f(on); } catch { /* one hearer's trouble is never the setting's */ } }
}

// the frame's and Home's switches turned while the engine runs (versions.ts): the kernel follows the frame (kernel.ts
// kernelFollows) and Home starts when its switch comes on (home/wire.ts), once per change, as the two above. Before the
// version, only a settings.set could turn them, and index.ts synced the kernel there; a channel learned late turns them too
// any settings.set at all (kernel.ts kernelFollows: a kernel that failed to start is tried again, as index.ts did before)
const patchHearers: (() => void)[] = [];
export function onPatch(f: () => void): void { patchHearers.push(f); }
const frameHearers: ((on: boolean) => void)[] = [];
let frameWas: boolean | null = null;
export function onFrame(f: (on: boolean) => void): void { frameHearers.push(f); if (frameWas === null) frameWas = frameOn(); }
export function noteFrame(): void {
  const on = frameOn();
  if (frameWas === on) return;
  frameWas = on;
  for (const f of frameHearers) { try { f(on); } catch { /* one hearer's trouble is never the setting's */ } }
}
const homeHearers: ((on: boolean) => void)[] = [];
let homeWas: boolean | null = null;
export function onHomeWhole(f: (on: boolean) => void): void { homeHearers.push(f); if (homeWas === null) homeWas = homeWhole(); }
export function noteHomeWhole(): void {
  const on = homeWhole();
  if (homeWas === on) return;
  homeWas = on;
  for (const f of homeHearers) { try { f(on); } catch { /* one hearer's trouble is never the setting's */ } }
}

/** what a face is sent for the switches (index.ts settingsMsg): the engine's reading wherever it differs from the bare
 *  setting (an env, or a station in this version), so the face shows a switch as the engine runs it. Where they agree
 *  nothing is added. Not the frame: its switch is the window's own (frameFlag.ts), and Home writes it back when the
 *  setting differs (Home.tsx), so a reading sent there would be written as a person's choice. Moving the frame's station
 *  starts in the face. And `window` (#1551), always: for each switch the window reads (a card's side window), whether its
 *  station stands on in this mode when nobody set it, so the window keeps no list of its own; what a person set in the
 *  window still wins there. Never written: the settings file keeps only the keys it knows (clean) */
export function readings(): Partial<Settings> & { window: Record<string, boolean> } {
  const s = getSettings(), out: Partial<Settings> = {};
  if (coworkV3() !== (s.cowork?.v3 === true)) out.cowork = { ...s.cowork, v3: coworkV3() };
  if (stageWhole() !== (s.stage?.whole === true)) out.stage = { ...s.stage, whole: stageWhole() };
  if (homeWhole() !== (s.home?.whole === true)) out.home = { ...s.home, whole: homeWhole() };
  const mode = versionMode();
  return { ...out, window: Object.fromEntries(WINDOW_SWITCHES.map((n) => [n, standsOn(stageOf(n), mode)])) };
}

/** the person's one lens (#824): the setting, app while unset. Only the stage with stage.whole on asks it */
export function userLens(): Lens {
  return getSettings().lens ?? "app";
}
// a lens changed from a stage (a work.stage.layout that names one, with stage.whole on): every face hears the settings
// again (index.ts), as after a settings.set, so each session's stage redraws in it. A settings.set is told by its own path
const lensHearers: ((l: Lens) => void)[] = [];
export function onLens(f: (l: Lens) => void): void { lensHearers.push(f); }
// a setting a seat changed for the person (#1521, openfor.ts set_setting): every face hears the settings again (index.ts)
const seatHearers: (() => void)[] = [];
export function onSeatSet(f: () => void): void { seatHearers.push(f); }
/** the person's settings patched by a seat on their word; its hearers told */
export function seatSet(patch: unknown): Settings {
  const s = patchSettings(patch);
  for (const f of seatHearers) { try { f(); } catch { /* one hearer's trouble is never the setting's */ } }
  return s;
}
/** set the person's lens from a stage; true when it changed (then its hearers were told). An unknown lens changes nothing */
export function setUserLens(l: unknown): boolean {
  if (!LENSES.includes(l as Lens) || l === userLens()) return false;
  patchSettings({ lens: l });
  for (const f of lensHearers) { try { f(l as Lens); } catch { /* one hearer's trouble is never the setting's */ } }
  return true;
}

/** whether Home's engine half runs (#790 and after; home/wire.ts): env SOL_HOME_WHOLE=on or off decides for a Sol
 *  developer's own run or a test engine (not SOL_HOME, which is the home folder), else the setting home.whole, else where
 *  versions.ts stands it in this version (#691). Read on every message, so the setting needs no restart */
export function homeWhole(): boolean {
  const env = (process.env.SOL_HOME_WHOLE ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("home.whole", versionMode(), getSettings().home?.whole);
}

/** whether the one onboarding's reader answers (#1195; parts/onboard.ts): env SOL_ONBOARD_READS=on or off decides for a
 *  Sol developer's own run or a test engine, else the setting onboarding.reads, else where versions.ts stands it (the team: on, #1406). Read on every message, so
 *  the setting needs no restart. Off, onboard.read answers "none" and the face's own rules read the sentences, as before */
export function onboardReads(): boolean {
  const env = (process.env.SOL_ONBOARD_READS ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("onboarding.reads", versionMode(), getSettings().onboarding?.reads);
}

/** a switch read env first: on/1/true or off/0/false in `env` decides, else `set`, else where versions.ts stands `name` */
const envOr = (env: string | undefined, name: string, set: boolean | undefined): boolean => {
  const e = (env ?? "").trim().toLowerCase();
  if (e === "on" || e === "1" || e === "true") return true;
  if (e === "off" || e === "0" || e === "false") return false;
  return onFor(name, versionMode(), set);
};
/** whether sign-in on Supabase stands in front of the cloud's own (#1607, decision #1606): the setting identity.supabase,
 *  else where versions.ts stands it (the card engine/sign-in: product, so a tester's Sol signs in there). SOL_IDENTITY
 *  (seams/identity.ts identityOf) is read before this, for a developer's own run and the tests. Read once, when the
 *  identity is first asked: a sign-in backend does not change under a running engine */
export function identitySupabase(): boolean {
  return onFor("identity.supabase", versionMode(), getSettings().identity?.supabase);
}
/** whether a seat is offered the tools that ask a teammate's agent or hand work over (#1276): env SOL_REACH_TOOLS, else
 *  the setting reach.tools, else where versions.ts stands it (the team: on, #1406). Read at each turn's start, so it needs no restart */
export const reachTools = (): boolean => envOr(process.env.SOL_REACH_TOOLS, "reach.tools", getSettings().reach?.tools);
/** whether the Agents' room is offered (#1276): env SOL_REACH_ROOM, else the setting reach.room, else where versions.ts stands it (the team: on, #1406) */
export const reachRoom = (): boolean => envOr(process.env.SOL_REACH_ROOM, "reach.room", getSettings().reach?.room);
/** whether the context ring is live (#683, #1519): env SOL_LIVE_CONTEXT, else the setting work.liveContext, else where
 *  versions.ts stands it (the team: on). Read at each step, so it needs no restart */
export const liveContext = (): boolean => envOr(process.env.SOL_LIVE_CONTEXT, "work.liveContext", getSettings().work?.liveContext);
/** whether a seat is offered open_settings, open_pane and set_setting (#1521): env SOL_OPEN_FOR, else the setting
 *  open.for, else where versions.ts stands it. Read at each turn's start and at each call, so it needs no restart */
export const openFor = (): boolean => envOr(process.env.SOL_OPEN_FOR, "open.for", getSettings().open?.for);
/** whether the pause signal runs (#1597, pause.ts): env SOL_PAUSE, else the setting pause.signal, else where versions.ts
 *  stands it (no card station: off until set). Read at each sense, so it needs no restart */
export const pauseSignal = (): boolean => envOr(process.env.SOL_PAUSE, "pause.signal", getSettings().pause?.signal);

/** whether the morning brings every wait on me older than a day to my first session after 05:00 (#1128 step 8,
 *  parts/waits.ts): env SOL_MORNING_WAITS=on or off decides for a Sol developer's own run or a test, else the setting
 *  morning.waits, else where versions.ts stands it (hand: off). Turned on in one place: { "morning": { "waits": true } }
 *  in settings.json. Read at each session's start, so it needs no restart */
export function morningWaits(): boolean {
  const env = (process.env.SOL_MORNING_WAITS ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return onFor("morning.waits", versionMode(), getSettings().morning?.waits);
}

/** whether updates are paused (#1566, team/ship.ts): a dev release is prepared aside but not swapped in while the setting
 *  updates.paused is true. Not a version switch: off unless the person sets it. Read at each try, so it needs no restart */
export const updatesPaused = (): boolean => getSettings().updates?.paused === true;

export function languageLine(l: Settings["language"]): string {
  return l === "english" ? "Answer in English." : l === "cantonese" ? "Answer in Cantonese." : l === "dutch" ? "Answer in Dutch." : "Answer in the language Marco speaks.";
}
