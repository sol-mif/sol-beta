// The asks at rest (BR1's calm screen, #1615): what needs the person, in the Diary's own words, for the one line that
// counts them on the canvas (the plane's "N need you", E's) and for the Diary's own count and rows, so both say the same.
//   needList   how many need you (the asks, and what people sent when unscoped), the sentence, the words after a drawn count, the asks in order
//   askSaid    one ask as its row says it: who asks, its words, where (the folder · the thing)
//   answerHere one ask's Answer: in place under the talk when it can be, else where it is asked
// Reads the store; answerHere presses. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { D, M, S, above, needWords, open, regionOf, render, type Ask } from "../cv/index.ts";
import { needsCount } from "../people/queue.ts";
import * as B from "./book.ts";

const bare = (n: unknown) => String(n || "").replace(/ \(.*\)$/, "");
/** an ask's words without its asker's name before them ("Kite: may I…" → "may I…") */
export const askWords = (t: string) => String(t || "").replace(/^[A-Z][\w-]*(?: \([^)]*\))?: /, "");
/** the folder an ask is in: its thing's, else its part's */
export const askRegion = (a: Ask) => B.regionOfThing(a.piece) ?? (a.part ? B.regionOfThing(String(a.part)) : null);

export type AskSaid = { id: string; who: string; words: string; where: string; at: number | null; region: string | null };
export function askSaid(a: Ask): AskSaid {
  const p = D.pieces[a.piece], at = typeof a.at === "number" ? a.at : null;
  const who = p?.kind === "session" ? B.taskOf(p) : String(p?.ai || a.by || String(a.source || "").split(" · ")[0] || B.VOICE);
  const where = [bare(regionOf(p?.region)?.name), p ? String(p.kind === "session" ? p.copy || p.name : p.name) : ""].filter(Boolean).join(" · ");
  return { id: a.id, who, words: askWords(a.text), where, at, region: askRegion(a) };
}

/** what needs you, everywhere (scope null: the asks and what people sent) or in one folder (its asks): the count, the
 *  sentence the Diary says it in, and the asks, first first */
export function needList(scope: string | null = null): { n: number; say: string; after: string; asks: AskSaid[] } {
  const asks = open().filter((a) => B.within(askRegion(a), scope)).map(askSaid);
  if (scope) { const say = asks.length ? "waiting for you in this folder" : "Nothing here needs you now."; return { n: asks.length, say, after: say, asks }; }
  const n = above(), c = needsCount();   // above(): the asks with the ones outside the canvas, as every count says it
  const say = n ? `${needWords(n)}.` : c ? `${c === 1 ? "One thing from people needs" : c + " things from people need"} you.` : "Nothing needs you now.";
  // after: the words that follow the count where the count is drawn beside them, so no total is said twice
  // ("18 waiting for you: 11 asks, 7 from people"; Jev 0.56 against 0.98 for "18 11 asks need you, and 7 from people.")
  const p = Math.max(0, c - n), after = n ? (p ? `waiting for you: ${n} ask${n === 1 ? "" : "s"}, ${p} from people` : "waiting for you")
    : c ? "waiting for you, from people" : say;
  return { n: n || c ? c : 0, say, after, asks };
}

/** Answer: an ask that is answered in place comes to the line under the talk; any other opens where it is asked (M.next's way) */
export function answerHere(a: Pick<Ask, "id" | "piece" | "how" | "serious">) {
  if (a.how === "inplace" && !a.serious) { S.askLine = a.id; render(); return; }
  if (M.goto(a.piece).ok) { S.askHere = a.id; render(); }
}
