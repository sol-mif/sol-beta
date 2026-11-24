// Your own pieces, the rules (round 6 · M3, #1615; merge/pieces.js, ported as it is): each person's pieces and what
// became of them (a piece outlives a canvas load, as a setting does), the proposal said into the talk pill, the update's
// line, "Set all my pieces aside" with its exact undo, and Find's "something's off". The rules take their state as an
// argument, so next-pieces.test.ts reads them without a page; the store's moves (cv/moves/pieces.ts) change it.
// Fixture only: a real Sol has no pieces yet (map.md: no engine rows), so `me()` is null there and nothing is drawn.
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { MODE, SCEN, SCN } from "../cv/core.ts";
import { PEOPLE, UPDATE, type Ask, type Person, type Piece } from "./data.ts";

export { PEOPLE, UPDATE };
export type { Ask, Person, Piece };

/** a piece's state now: in (yours in use) · remade · aside (set aside by the update) · last (your last version) · sols (Sol's in use, yours kept) */
export type PcState = "in" | "remade" | "aside" | "last" | "sols";
export type Prop = { state: "proposed" | "used" | "dropped"; alt: boolean };
/** one person's: each piece's state, what was added, the proposal, the snapshot "set all aside" keeps for undo, the update, Sol's version */
export type St = {
  pc: Record<string, PcState | undefined>; added: Piece[]; prop: Prop | null; all: Record<string, PcState | undefined> | null;
  update: boolean; ver: "2.4" | "2.3"; verConf: boolean;
};
export const freshSt = (): St => ({ pc: {}, added: [], prop: null, all: null, update: false, ver: "2.4", verConf: false });

// ---------------------------------------------------------------- pure on a person and their state

export const listOf = (p: Person | null, s: St): Piece[] => (p ? p.pieces.concat(s.added) : []);
export const stateOf = (x: Piece, s: St): PcState => s.pc[x.id] ?? x.st;
/** in use: the canvas draws it, marked "yours" */
export const isDrawn = (x: Piece, s: St): boolean => ["in", "remade", "last"].includes(stateOf(x, s));
/** a failing proposal is never added: it can be used only on the way that passes */
export const canUse = (a: Ask, alt: boolean): boolean => alt || a.checks.every((c) => c[0]);
/** the update's line: how many came along, set aside, remade */
export function updateLine(p: Person | null, s: St): string {
  const xs = listOf(p, s).filter((x) => !s.added.includes(x)), as = xs.filter((x) => x.st === "aside").length, rm = xs.filter((x) => x.st === "remade").length, n = xs.length;
  return n ? `${n - as - rm} of your ${n} piece${n > 1 ? "s" : ""} came along as they were${as ? `, ${as} set aside` : ""}${rm ? `, ${rm} remade` : ""}.` : "Nothing of yours to carry.";
}
/** every piece to Sol's at once; the snapshot keeps each one's own state (none when it had none) */
export function asideAll(xs: Piece[], s: St): boolean {
  if (!xs.length || s.all) return false;
  s.all = {};
  for (const x of xs) { s.all[x.id] = s.pc[x.id]; s.pc[x.id] = "sols"; }
  return true;
}
/** the undo: each piece back exactly as it was */
export function undoAll(s: St): boolean {
  if (!s.all) return false;
  for (const [id, v] of Object.entries(s.all)) { if (v === undefined) delete s.pc[id]; else s.pc[id] = v; }
  s.all = null;
  return true;
}
/** the words Find (⌘P) takes as "something's off" */
export const OFF = /off|wrong|broke|weird|strange|diagnos|my pieces|aside|not right/i;
/** the words Settings' find takes as Your own pieces (build.mjs's place for it) */
export const PLACE_WORDS = "my pieces own piece custom customize customise made mine keys commands remade off wrong broken diagnose aside back sol version update";
export type Hit = { g: string; l: string; s: string; row: string; r6?: "off" };
/** Find's rows for these words: "Something's off? Set all my pieces aside" first when the person has pieces */
export function hitsFor(q: string, has: boolean, n: number): Hit[] {
  const out: Hit[] = [], t = String(q || "").toLowerCase().replace(/[’']/g, "'");
  if (has && n && OFF.test(t)) out.push({ g: "Settings", l: "Something’s off? Set all my pieces aside", s: "Settings › Your own pieces · one press, with undo", row: "all", r6: "off" });
  const w = t.split(/[^a-z']+/).filter((x) => x.length > 2), place = new Set(PLACE_WORDS.split(" "));
  if (has && w.some((x) => place.has(x)) && !out.length) out.push({ g: "Settings", l: "Your own pieces", s: "What you remade, and a way back to Sol’s", row: "" });
  return out;
}

// ---------------------------------------------------------------- the store's: per person, kept across loads

const ST: Record<string, St> = {};
/** the person of the scenario loaded (fixture only); "" in a real Sol */
export const who = (): string => (MODE === "fixture" && SCEN[SCN] ? SCEN[SCN].label.split(" · ")[0] : "");
export const me = (): Person | null => PEOPLE[who()] ?? null;
export const st = (): St => (ST[who()] ??= freshSt());
export const list = (): Piece[] => listOf(me(), st());
export const pcSt = (x: Piece): PcState => stateOf(x, st());
export const drawn = (x: Piece): boolean => isDrawn(x, st());
export const asideOf = (): Piece[] => list().filter((x) => x.st === "aside");
export const remadeOf = (): Piece[] => list().filter((x) => x.st === "remade");
/** the pieces of yours the canvas draws in one folder */
export const yoursIn = (rid: string): Piece[] => list().filter((x) => x.at === rid && drawn(x));
/** Find's rows for these words, for the person now */
export const hits = (q: string): Hit[] => hitsFor(q, !!me(), list().length);
/** everyone's state forgotten (the count starts each person clean) */
export function clear(): void { for (const k of Object.keys(ST)) delete ST[k]; ui.open = false; ui.hl = null; }

/** the Settings page's own: open, and the row it was opened at (ringed) */
export const ui: { open: boolean; hl: string | null } = { open: false, hl: null };
export const forShort = (x: Piece): string => x.for.split(",")[0];
