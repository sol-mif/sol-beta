// The sounds of pieces (#1024): made in code (Web Audio), each under 40 ms and quiet, so the hand hears the fit. A seat
// is a bright short click with a little body (two hard plastics meeting); pulling apart is softer and lower; a push-off
// is a dull tap; a shake is a few tiny clicks, tumbling. Muted by its own row (build.snap.mute). On a Mac trackpad the
// shell gives a haptic tick (the Tauri command `haptic`, NSHapticFeedbackManager); anywhere else that is skipped quietly.
import { snapMuted } from "./fit.ts";

/** the sounds' numbers, tuned by ear: pitch of the body (Hz), of the snap's crack (bandpass, Hz), length (ms), level */
export const SOUND = {
  seat: { body: 1320, crack: 3400, ms: 26, level: 0.16 },
  part: { body: 620, crack: 1800, ms: 34, level: 0.09 },
  push: { body: 190, crack: 700, ms: 30, level: 0.1 },
  tick: { body: 2100, crack: 5200, ms: 9, level: 0.045 },
} as const;
export type Sound = keyof typeof SOUND;

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
const audio = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const A = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!A) return null;
  if (!ctx) {
    ctx = new A() as AudioContext;
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

/** one sound, now (or `delay` ms from now); `pitch` bends it (a heavier lump sounds a little lower) */
export function play(s: Sound, o: { pitch?: number; delay?: number; level?: number } = {}) {
  try { sound(s, o); } catch { /* no sound here: the hand goes on */ }
}
function sound(s: Sound, o: { pitch?: number; delay?: number; level?: number }) {
  if (snapMuted()) return;
  const c = audio(); if (!c || !noise) return;
  const p = SOUND[s], f = o.pitch ?? 1, t0 = c.currentTime + (o.delay ?? 0) / 1000, len = p.ms / 1000, lv = p.level * (o.level ?? 1);
  // the crack: a burst of noise through a narrow band, gone in a third of the length
  const n = c.createBufferSource(); n.buffer = noise;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = p.crack * f; bp.Q.value = 2.2;
  const ng = c.createGain(); ng.gain.setValueAtTime(lv, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + len * 0.35);
  n.connect(bp).connect(ng).connect(c.destination); n.start(t0); n.stop(t0 + len);
  // the body: a sine that drops a little in pitch as it dies (the plastic's ring)
  const o1 = c.createOscillator(); o1.type = "sine";
  o1.frequency.setValueAtTime(p.body * f, t0); o1.frequency.exponentialRampToValueAtTime(p.body * f * 0.72, t0 + len);
  const og = c.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(lv * 0.8, t0 + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o1.connect(og).connect(c.destination); o1.start(t0); o1.stop(t0 + len + 0.005);
}
/** a shake: a handful of tiny clicks scattered over 120 ms, as pieces knock together */
export function rattle(n = 6) { for (let i = 0; i < n; i++) play("tick", { delay: Math.random() * 120, pitch: 0.7 + Math.random() * 0.6, level: 0.6 + Math.random() * 0.6 }); }

/** the trackpad's tick, where the shell can give one (Sol.app on a Mac); nothing elsewhere, never an error */
export function haptic(kind: "align" | "level" | "generic" = "align") {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ ?? (window as any).__TAURI_INTERNALS__ : null;
  const inv = t?.core?.invoke ?? t?.invoke;
  if (typeof inv !== "function") return;
  try { void Promise.resolve(inv("haptic", { kind })).catch(() => {}); } catch { /* no shell */ }
}
/** the click of a seat: the sound and the tick together */
export function click(weight = 1) { play("seat", { pitch: Math.max(0.78, 1.08 - weight * 0.06) }); haptic("align"); }
