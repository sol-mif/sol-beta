// Copied from MR (origin/marco/mine-run fa6becaf) sol/mac/src/home/whole/ledger.ts l.35-67 (isWould, openWould, doneBy, quietLine, foldLine, whyLine, canUndo), l.89-101 (seedLedger: the would-haves w-slides and w-reply, the done e-prep) and sol/mac/src/home-ledger.test.ts l.11, l.26-70 (the values his tests expect); not imported: the engine never imports sol/mac.
// The ledger as his face reads it: his pure rules over Entry, run here on what the engine sends, so his tests' lines
// are replayed against the engine's home.ledger. The act names are his would-haves' words: a fake door's act is named
// by its caller (design §7.7), and naming it as his seed does makes his "let it" line come out word for word.
import type { Entry } from "../../../src/contract/home/ledger.ts";
import type { Rung } from "../../../src/contract/home/policy.ts";

const RUNGS = ["read", "propose", "draft", "act"] as const;
const rungAt = (r: Rung) => RUNGS.indexOf(r);

/** his evening (scene 11, home-ledger.test.ts l.11) and the times of his seed's entries (ledger.ts l.93-101) */
export const EVENING = new Date(2026, 10, 9, 21, 40).getTime();
export const at = (h: number, m: number) => new Date(2026, 10, 9, h, m).getTime();
/** his would-haves (ledger.ts l.100-101): what Sol would have done, the source, and the rung it needed */
export const SLIDES = { name: "saved lecture 11 slides into bio 201", source: "canvas", rung: "propose", at: at(11, 2) } as const;
export const REPLY = { name: "drafted your reply to prof. Ahmed, held for you", source: "mail", rung: "draft", at: at(11, 18) } as const;
/** his done of Sol's (ledger.ts l.99, "e-prep") */
export const PREP = { words: "Lab prep moved", at: at(20, 36) } as const;

// what his tests expect (home-ledger.test.ts)
export const QUIET_TWO = "Sol would have done 2 things today";                                                   // l.26
export const QUIET_ONE = "Sol would have done 1 thing today";                                                    // l.36
export const CANVAS_PROPOSE = "Read Canvas and suggest what to save.";                                           // l.33
export const CANVAS_READ = "Read Canvas for due dates.";                                                         // l.42
export const LET_LINE = "let it: Canvas at propose now · next time Sol has saved lecture 11 slides into bio 201"; // l.38
export const LET_WHY = "Canvas is at propose now · next time Sol does it";                                       // l.37
export const UNDONE_PREP = "undone: Lab prep moved";                                                             // l.67
export const DAY = "2026-11-9";                                                                                  // ledger.ts l.112 for his evening

// his pure rules (ledger.ts l.35-67)
export const isWould = (e: Entry) => e.wouldHave !== undefined;
export const openWould = (es: Entry[]) => es.filter((e) => isWould(e) && !e.state);
export const doneBy = (es: Entry[]) => {
  const did = es.filter((e) => e.did !== undefined && e.state !== "undone");
  return { you: did.filter((e) => e.actor === "you"), sol: did.filter((e) => e.actor === "sol"), all: did };
};
export function quietLine(es: Entry[]): string | null {
  const n = openWould(es).length;
  return n ? `Sol would have done ${n} ${n === 1 ? "thing" : "things"} today` : null;
}
const W = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const w = (n: number) => W[n] ?? String(n), lw = (n: number) => w(n).toLowerCase();
export function foldLine(es: Entry[]): [string, string] {
  const d = doneBy(es);
  if (!d.all.length) return ["Nothing off your day yet.", ""];
  const first = `${w(d.all.length)} ${d.all.length === 1 ? "thing" : "things"} off your day.`;
  const second = !d.sol.length ? "You did all of it." : !d.you.length ? "Sol did all of it." : `You did ${lw(d.you.length)}; Sol did ${lw(d.sol.length)}.`;
  return [first, second];
}
export function whyLine(e: Entry, name: string, now: Rung): string {
  if (e.state === "let" || rungAt(now) >= rungAt(e.rung)) return `${name} is at ${now} now · next time Sol does it`;
  if (e.state === "not") return `not this · Sol will not offer it again`;
  return `${name} is at ${now} · ${e.rung} ${e.sub}`;
}
export const canUndo = (e: Entry, now: number) => "kind" in e.undo && e.undo.until > now && e.state !== "undone";
