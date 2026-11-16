// Marco's settings, one small JSON file next to the engine (engine/settings.json, gitignored).
// The face asks with settings.get and changes with settings.set { patch }; the engine merges, checks,
// writes and tells every face. Anything it does not recognise is dropped, so a bad patch cannot break a call.

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  // bubbles and a room's lines, nothing around them); the face and, later, the notch read the same recipe
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
};
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
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "settings.json");

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
function clean(raw: unknown): Settings {
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
  current = clean(merge(base, p));
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(current, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, FILE); // never a half-written file
  noteCoworkV3();
  return current;
}

// Cowork v3's switch turned while the engine runs (fr-30): who must hear it (the agent's tools, the team's sync and
// the notch) hears it once per change, whether the setting changed or SOL_COWORK_V3 did (a test, a developer's run)
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
 *  setting cowork.v3, off by default. Read on every message, so the setting needs no restart */
export function coworkV3(): boolean {
  const env = coworkV3Env();
  return env ? env === "on" : getSettings().cowork?.v3 === true;
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
  return getSettings().frame === true;
}

export function languageLine(l: Settings["language"]): string {
  return l === "english" ? "Answer in English." : l === "cantonese" ? "Answer in Cantonese." : l === "dutch" ? "Answer in Dutch." : "Answer in the language Marco speaks.";
}
