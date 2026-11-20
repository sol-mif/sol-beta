// Pieces that snap (#1024, behind `build.snap`): the rules of fit, pure, so the tests read them without a window.
// A piece is one real thing the one session can run (a session doing a job, a source it reads, a check, a time, your
// hand). Each has typed ends: what it takes on its left, what it gives on its right. A piece seats on a section's last
// piece when that piece gives what it takes. Your hand takes anything and gives what it took: it fits everywhere.
import { buildSwitch, type SwitchEnv } from "../flag.ts";
import { useSyncExternalStore } from "react";

export const BUILD_SNAP = "build.snap";
export const makeSnapSwitch = (env?: SwitchEnv) => buildSwitch(BUILD_SNAP, env);
const sw = makeSnapSwitch();
export const buildSnap = () => sw.get();
export const setBuildSnap = (v: boolean) => sw.set(v);
export const useBuildSnap = () => useSyncExternalStore(sw.sub, sw.get);
export const subBuildSnap = (f: () => void) => sw.sub(f);
/** the click's mute: its own row under the switch */
export const SNAP_MUTE = "build.snap.mute";
const mw = buildSwitch(SNAP_MUTE);
export const snapMuted = () => mw.get();
export const setSnapMuted = (v: boolean) => mw.set(v);
export const useSnapMuted = () => useSyncExternalStore(mw.sub, mw.get);

/** what flows along a row: a start (go), material to read (stuff), done work (work), a verdict (proof) */
export type Flow = "go" | "stuff" | "work" | "proof";
export type Kind = "when" | "source" | "job" | "check" | "hand";
export type Brick = {
  id: string; kind: Kind; label: string;
  /** what it is in the engine: a session id, a folder, a check's name, a time's name */
  ref: string;
  /** a word on hover: what it is, plainly */
  hint?: string;
  /** a hand: proposed by the agent (with its six words why), or put there by the person */
  hand?: "proposed" | "mine"; why?: string;
};
export const TAKES: Record<Kind, Flow[] | "any" | "none"> = {
  when: "none",                              // a time starts a row; nothing comes before it
  source: ["go", "stuff"],                   // read when the time comes (or first in a row); things read together stack
  job: ["go", "stuff", "work", "proof"],     // a job takes a start, a thing to read, work before it, or a verdict to act on
  check: ["work"],                           // a check reads done work, nothing else
  hand: "any",                               // your hand passes on what it was given
};
export const GIVES: Record<Exclude<Kind, "hand">, Flow> = { when: "go", source: "stuff", job: "work", check: "proof" };

/** what a row gives at its end: its last piece's give; a hand gives what came into it */
export function givesOf(row: Brick[]): Flow | "any" {
  for (let i = row.length - 1; i >= 0; i--) { const k = row[i].kind; if (k !== "hand") return GIVES[k]; }
  return "any";
}
/** what a row takes at its head: its first piece's take; a hand at the head passes on what the next one takes */
export function takesOf(row: Brick[]): Flow[] | "any" | "none" {
  for (const b of row) if (b.kind !== "hand") return TAKES[b.kind];
  return "any";
}
/** does a lump seat on the end of a row: the row's give is in the lump's take */
export function fits(row: Brick[], lump: Brick[]): boolean {
  if (!row.length || !lump.length) return false;
  const g = givesOf(row), t = takesOf(lump);
  if (t === "none") return false;
  if (t === "any" || g === "any") return true;
  return t.includes(g);
}
/** two hands side by side mean nothing more than one: a hand never seats on a hand */
export function seats(row: Brick[], lump: Brick[]): boolean {
  if (row[row.length - 1]?.kind === "hand" && lump[0]?.kind === "hand") return false;
  return fits(row, lump);
}

// ---- the table: sections (built rows, a loose piece is a section of one) at places
export type Section = { id: string; x: number; y: number; bricks: Brick[]; name?: string; runs?: number; ranAt?: number; madeAt?: number; by?: "me" | "one"; free?: string[]; asked?: number };

/** pull a section apart at piece i: the piece and everything downstream go as one lump; the rest stays */
export function pullApart(s: Section, i: number): { stays: Section | null; lump: Brick[] } {
  if (i <= 0) return { stays: null, lump: s.bricks };
  return { stays: { ...s, bricks: s.bricks.slice(0, i) }, lump: s.bricks.slice(i) };
}
/** the geometry: a piece's width by kind (a job is the biggest, a hand the smallest), the overlap where ends meet */
export const W: Record<Kind, number> = { when: 92, source: 112, job: 136, check: 104, hand: 72 };
export const H = 64, TAB = 12;
export const rowWidth = (b: Brick[]) => b.reduce((w, x) => w + W[x.kind], 0);
/** a lump's weight: the sum of its pieces (a job weighs most): heavier lags more */
export const WEIGHT: Record<Kind, number> = { when: 0.8, source: 1, job: 1.4, check: 0.9, hand: 0.6 };
export const weightOf = (b: Brick[]) => b.reduce((w, x) => w + WEIGHT[x.kind], 0);

/** the feel's numbers (tuned by hand, mine: the pull's reach, how far the last pixels pull, the seat, the push-back) */
export const FEEL = {
  reach: 34,       // within this of a fitting end (px), the piece starts to be pulled
  grab: 0.55,      // at the end itself, how much of the way the pull has taken it (0..1, eased in the last pixels)
  seat: 2,         // the seat: it lands this far down, and comes back up
  push: 30,        // an end that does not fit pushes the piece this far off
  tear: 16,        // pulling apart: the resistance holds until the hand is this far away
  shake: 2.2,      // a drag on the bin quicker than this (px/ms) tumbles it again
} as const;

/** the end of a section where a lump would seat: its right edge, at its row's height */
export const endOf = (s: Section) => ({ x: s.x + rowWidth(s.bricks), y: s.y });
/** where a lump carried at (x, y) is pulled: the nearest end within reach that it fits, and how near (0 far … 1 there);
 *  a near end that does not fit is said too, so the drop can push off */
export function nearest(sections: Section[], lump: Brick[], x: number, y: number, skip?: string): { to?: Section; fit: boolean; d: number } {
  let best: { to?: Section; fit: boolean; d: number } = { fit: false, d: Infinity };
  for (const s of sections) {
    if (s.id === skip) continue;
    const e = endOf(s), d = Math.hypot(x - e.x, y - e.y);
    if (d < FEEL.reach && d < best.d) best = { to: s, fit: seats(s.bricks, lump), d };
  }
  return best;
}
/** the pull: how far toward the end the piece is drawn, eased so it is the last few pixels that pull hardest */
export function pull(d: number): number {
  if (d >= FEEL.reach) return 0;
  const t = 1 - d / FEEL.reach;
  return Math.min(1, t * t * (FEEL.grab + (1 - FEEL.grab) * t));
}
/** a lump seated on a section: one section */
export function seat(s: Section, lump: Brick[]): Section { return { ...s, bricks: [...s.bricks, ...lump] }; }

// ---- your hand: where the agent proposes it, in six words why. A taste call, a merge, money, a thing only you know.
const RULES: { re: RegExp; why: string }[] = [
  { re: /\b(merge|release|ship|deploy|publish|promote|land)\b/i, why: "a merge: yours to say yes" },
  { re: /\b(pay|buy|spend|price|invoice|bill|order)\b/i, why: "money leaves here: you say when" },
  { re: /\b(design|look|style|colour|color|copy|words|wording|name|brand|feel|tone|greeting|friendlier|warmer)\b/i, why: "a taste call: your eye decides" },
  { re: /\b(send|email|post|reply|message|tell|invite)\b/i, why: "it speaks for you: your words" },
];
/** where a hand is worth most in a row: after a piece whose words match a rule, and before a check's red goes on to
 *  a job (a fix someone must want). Never where the person pulled one out (free), never twice in a place. */
export function proposeHands(row: Brick[], free: string[] = []): { after: number; why: string }[] {
  const out: { after: number; why: string }[] = [];
  row.forEach((b, i) => {
    if (b.kind === "hand" || row[i + 1]?.kind === "hand" || free.includes(b.id)) return;
    const r = RULES.find((x) => x.re.test(b.label));
    if (r && b.kind === "job") { out.push({ after: i, why: r.why }); return; }
    if (b.kind === "check" && row[i + 1]?.kind === "job" && /read|review/i.test(b.label)) out.push({ after: i, why: "a second read: you weigh it" });
  });
  return out;
}
/** a row with the agent's hands put in (proposed), at the places proposeHands says */
export function withHands(row: Brick[], free: string[] = [], id = (i: number) => `hand-${i}`): Brick[] {
  const ps = proposeHands(row, free); if (!ps.length) return row;
  const out: Brick[] = [];
  row.forEach((b, i) => { out.push(b); const p = ps.find((x) => x.after === i); if (p) out.push({ id: id(i), kind: "hand", label: "your hand", ref: "hand", hand: "proposed", why: p.why }); });
  return out;
}

/** how worn a section looks: never run is fresh (0), forty runs is worn in (1) */
export const wear = (runs = 0) => Math.min(1, Math.log1p(runs) / Math.log1p(40));

// ---- joints: a lump may seat at a row's end, or between two of its pieces when it fits both sides (your hand always
// does: it passes on what it is given). The rest of the row makes room.
export type Joint = { to?: Section; at: number; fit: boolean; d: number };
/** what a lump gives at its end, against what the rest of a row takes at its head */
export const fitsBefore = (lump: Brick[], rest: Brick[]) => !rest.length || fits([...lump], rest) || (givesOf(lump) === "any");
export function nearestJoint(sections: Section[], lump: Brick[], x: number, y: number, skip?: string): Joint {
  let best: Joint = { at: -1, fit: false, d: Infinity };
  for (const s of sections) {
    if (s.id === skip) continue;
    for (let i = 1; i <= s.bricks.length; i++) {
      const jx = s.x + rowWidth(s.bricks.slice(0, i)), d = Math.hypot(x - jx, y - s.y);
      if (d >= FEEL.reach || d >= best.d) continue;
      const head = s.bricks.slice(0, i), rest = s.bricks.slice(i);
      best = { to: s, at: i, fit: seats(head, lump) && fitsBefore(lump, rest) && !(rest[0]?.kind === "hand" && lump[lump.length - 1]?.kind === "hand"), d };
    }
  }
  return best;
}
export const jointOf = (s: Section, at: number) => ({ x: s.x + rowWidth(s.bricks.slice(0, at)), y: s.y });
/** a lump put in at a joint */
export const insert = (s: Section, at: number, lump: Brick[]): Section => ({ ...s, bricks: [...s.bricks.slice(0, at), ...lump, ...s.bricks.slice(at)] });
/** a hand pulled out of a row comes alone (it is a gate, not a part of the build): the row closes up behind it. A hand
 *  the agent proposed and the person pulled out marks the place free: the agent decides alone there from now on */
export function pullHand(s: Section, i: number): { stays: Section; hand: Brick } {
  const hand = s.bricks[i], before = s.bricks[i - 1];
  const free = hand.hand === "proposed" && before ? [...new Set([...(s.free ?? []), before.id])] : s.free ?? [];
  return { stays: { ...s, bricks: s.bricks.filter((_, k) => k !== i), free }, hand: { ...hand, hand: "mine", why: undefined } };
}
