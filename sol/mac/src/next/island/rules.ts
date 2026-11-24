// owned by slice 10 (the island), docs/port/slices.md "Night 2"
// The island's and the glance's pure rules (round 4, I1–I4; merge/desk.js as round 9 passed it, islands.html's ladder and
// grid): which ask may open the island, the glance's order, the words a card says, the words an answer from outside
// writes in the diary, and the island's size in each of its states. They read only what they are given, never the store,
// so next-island.test.ts runs them on plain data. Signed: marcocyl04-ux's agent, port slice 10 (#1615).
import type { Ask } from "../cv/types.ts";

/** islands.html's ladder, read off the ask's reason (needs/rank.ts reason().rung): spends or leaves (or can't be undone)
 *  → holds an AI → broke → done → the rest that ask */
export function step(rung: string): number {
  return /Spends|undone/.test(rung) ? 0 : /^Holds/.test(rung) ? 1 : rung === "Broke" ? 2 : /kept/.test(rung) ? 3 : 4;
}
/** it opens by itself for two things only: a yes that spends, leaves or deletes, and a yes that holds an AI up */
export const opensIsland = (rung: string) => step(rung) <= 1;

export type Card = { rid: string; ask: string; step: number; rank: number; n: number };
/** the glance's order: one card a folder, by the ladder then the rank; a folder with no ask is quiet (one line for all) */
export function glanceOrder(regions: { id: string }[], asks: Ask[], regionOfAsk: (a: Ask) => string | null | undefined, rungOf: (a: Ask) => string): { cards: Card[]; quiet: string[] } {
  const cards: Card[] = [], quiet: string[] = [];
  for (const r of regions) {
    const as = asks.filter((a) => regionOfAsk(a) === r.id).sort((x, y) => step(rungOf(x)) - step(rungOf(y)) || x.rank - y.rank), a = as[0];
    if (!a) { quiet.push(r.id); continue; }
    cards.push({ rid: r.id, ask: a.id, step: step(rungOf(a)), rank: a.rank, n: as.length });
  }
  cards.sort((x, y) => x.step - y.step || x.rank - y.rank);
  return { cards, quiet };
}
export const orderIds = (g: { cards: Card[]; quiet: string[] }) => [...g.cards.map((c) => c.rid), ...g.quiet];

const lc = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** what a glance card (and the chip's order) says on its right, and whether it says it strongly */
export function whyOf(c: Card, rung: string, here: "island" | "window" | null): [string, boolean] {
  if (here === "island") return ["on the island", true];
  if (here === "window") return ["ask in the window", false];
  return [c.step === 2 ? "broke · one press" : c.step === 3 ? "done · to keep" : lc(rung), c.step <= 1];
}

/** the diary's words for an answer from outside (I3): "Allowed running the tests for Bo", "Kept Ada’s change, 40 files" */
export function didWords(a: Pick<Ask, "source" | "text">, how: string | undefined, yes: string): string {
  const who = String(a.source || "").split(" · ")[0];
  let t = String(a.text).replace(/^[A-Z][\w-]*(?: \([^)]*\))?: /, "").trim(), m: RegExpMatchArray | null;
  if (how === "keep" || /change ready/i.test(t)) { m = t.match(/change ready,?\s*([^.?]*)/i); return `Kept ${who}’s change${m && m[1] ? ", " + m[1].trim() : ""}`; }
  if ((m = t.match(/^allow (.+?)\??$/i))) return `Allowed ${m[1]} for ${who}`;
  if ((m = t.match(/needs? (the [^.?]+)[.?]?\s*Allow\?$/i))) return `Allowed ${m[1]} for ${who}`;
  t = t.replace(/\s*(Allow|Confirm|Accept)\?$/, "").replace(/[?.]$/, "");
  return `Said “${yes}” to ${who}: ${t}`;
}

/** the screen's twelve columns (islands.html "One grid for the screen"): 16 at the edges, 12 between */
export const GUT = 12, MAR = 16, TOP = 48;
export function grid(W: number, H: number) {
  const C = (W - 2 * MAR - 11 * GUT) / 12;
  return { W, H, C, cols: (n: number) => n * C + (n - 1) * GUT, colX: (i: number) => MAR + i * (C + GUT) };
}
/** the window on the screen: n columns from the left, under the menu bar */
export function winRect(W: number, H: number, cols: number) { const g = grid(W, H); return { x: g.colX(0), y: TOP, w: g.cols(cols), h: H - TOP - MAR }; }

export type Kind = "rest" | "ears" | "ask" | "talk" | "peak";
/** the island's size in each state (desk.js drawIsland): at rest the notch's 200 × 32; the ears wider; an ask five
 *  columns (taller when its words take two lines); talking six; the reward five and a little */
export function size(k: Kind, C: number, words = ""): { w: number; h: number } {
  const cols = (n: number) => n * C + (n - 1) * GUT;
  if (k === "talk") return { w: cols(6), h: 132 };
  if (k === "peak") return { w: cols(5) + 40, h: 186 };
  if (k === "ask") { const w = cols(5) + 20; return { w, h: words.length * 8.7 > w - 44 ? 194 : 170 }; }
  if (k === "ears") return { w: 200 + 2 * Math.round(C * 0.8), h: 32 };
  return { w: 200, h: 32 };
}
/** a glance card's height in columns' units: 1 for a card that only names where an ask is, 1.5 for one you answer there */
export const cardUnits = (here: boolean, st: number) => (here ? 1 : st <= 1 || st === 3 ? 1.5 : 1);
export const unitH = (u: number, C: number) => Math.round(u * C + Math.max(0, Math.ceil(u) - 1) * GUT);
