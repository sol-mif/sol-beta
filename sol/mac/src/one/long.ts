// The long project (#1002), behind its own switch `build.one.long` (off by default; Settings › me › "one session, over
// the long run", shown while the one session is on). Pure: what the face draws from the engine's long view (engine
// work/oneLong.ts): his own answers, grouped by the kind of question, each kind a dial he drags between "ask me" and
// "you decide"; and "since you were here" for the project, the one place his hand is worth most first.
export const LONG_FLAG = "build.one.long";
export type Mode = "early" | "ask" | "decide";
export type Dial = Mode | "auto";
export type KindView = { kind: string; mode: Mode; dial: Dial; lean: number; decidable: boolean; decided: number;
  answers: { at: number; agreed: boolean; took: number; title: string; answer?: string; would?: string }[] };
export type Since = { from: number; days: number; decided: number; worth?: { id: string; title: string; goal?: string; kind?: string; why: string };
  goals: { goal: string; waits: string[]; moved: { at: number; words: string; kind: string }[]; count: number }[] };
export type LongView = { dials: KindView[]; since: Since; seen: number | null };

/** the dial's three stops, left to right, and where each sits on the track (0 to 1) */
export const STOPS: { mode: Mode; at: number; words: string }[] = [
  { mode: "early", at: 0, words: "ask me first" }, { mode: "ask", at: 0.5, words: "ask me" }, { mode: "decide", at: 1, words: "you decide" }];
/** a drag's place on the track → the stop it snaps to; a kind that is never decided stops at "ask me" (pure) */
export function snap(x: number, decidable: boolean): Mode {
  const c = Math.max(0, Math.min(1, x));
  const m = c < 0.25 ? "early" : c < 0.75 ? "ask" : "decide";
  return m === "decide" && !decidable ? "ask" : m;
}
export const atOf = (m: Mode) => STOPS.find((s) => s.mode === m)!.at;
/** a key on the dial: left and right move one stop (pure) */
export function stepDial(m: Mode, dir: -1 | 1, decidable: boolean): Mode {
  const i = Math.max(0, Math.min(STOPS.length - 1, STOPS.findIndex((s) => s.mode === m) + dir));
  return snap(STOPS[i].at, decidable);
}
/** how long he took, as a person says it */
export function tookWords(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86_400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} d`;
}
/** why a dial sits where it does, in one short line: his answers, or his own hand (pure) */
export function whyOf(k: KindView): string {
  const a = k.answers.filter((x) => x.agreed).length, c = k.answers.length - a;
  if (k.dial !== "auto") return `you set it${k.decided ? ` · I decided ${k.decided}` : ""}`;
  if (k.mode === "decide") return `you agreed ${Math.min(a, 5)} times running${k.decided ? ` · I decided ${k.decided}` : ""}`;
  if (k.mode === "early") return `your answer changed it ${c} time${c > 1 ? "s" : ""}`;
  return !k.answers.length ? "no answers yet" : `${a} agreed · ${c} changed`;
}
/** "since you were here" is worth showing: away a day or more, or something moved and he was away 8 hours (pure) */
export const showSince = (s: Since | undefined, now: number) => !!s && s.from > 0 && (now - s.from >= 86_400_000 || (now - s.from >= 8 * 3_600_000 && s.goals.some((g) => g.count || g.waits.length)));
export const awayWords = (from: number, now: number) => { const h = Math.round((now - from) / 3_600_000); return h >= 36 ? `${Math.round(h / 24)} days` : `${h} hours`; };
