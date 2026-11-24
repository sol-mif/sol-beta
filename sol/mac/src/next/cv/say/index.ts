// The talk pill's chain (#1604; engine.js say, desk.js voice). Slice 5 owns this file: the chain's order and the one voice.
//   chain(words)        the words tried phrase by phrase: the slices' first, in the mockup's order (each round file
//                       wrapped CV.say, so the last loaded was tried first: shell.js's folders, the diary and life, the
//                       runs), then the shared ones (engine.js say); the first that answers makes its move
//   voice(words, from)  the one voice (desk.js I1): the pill inside and the island outside say the same words and call the
//                       same move; "yes" / "later" answer the ask here; it records which move the words called
//   say(words)          the pill's: voice(words, "pill"), answered as the move's Done
// One phrases file per slice, so no two builders touch one file. Signed: marcocyl04-ux's agent, the port's prep and
// slice 5 of the port (#1615).
import { M, answer, done, findByWords, hooks, lineAsk, type Done, type Phrase } from "../core.ts";
import plane from "./plane.ts";
import needs from "./needs.ts";
import near from "./near.ts";
import life from "./life.ts";
import ais from "./ais.ts";
import settings from "./settings.ts";
import engine from "./engine.ts";
import people from "./people.ts";
import movein from "./movein.ts";
import pieces from "./pieces.ts";
import seats from "./seats.ts";
import lead from "./lead.ts";   // slice R7 (#1615)

const one = (words: string[], f: () => Done | null | undefined): Phrase => ({ hears: new RegExp(`^(?:${words.join("|")})$`), run: () => f() });
/** the plane's zoom step (engine.js ZSTEP) for "closer" and "further"; the zoom itself is slice 1's M.zoom */
const ZSTEP = 1.25;
/** the shared phrases (engine.js say), each a move every slice shares */
export const SHARED: Phrase[] = [
  one(["next ask", "next"], () => M.next()), one(["back"], () => M.back()), one(["forward"], () => M.fwd()),
  one(["out", "zoom out"], () => M.out()), one(["in", "dive"], () => M.dive()), one(["map"], () => M.map()),
  one(["recent"], () => M.recent(1)), one(["beside", "pull beside"], () => M.beside()), one(["follow"], () => M.follow()),
  { hears: /^follow (.+)$/, run: (m) => M.follow(m[1]) },
  one(["needs", "needs you", "waiting on you"], () => M.needs()),
  one(["closer", "zoom closer"], () => (M.zoom ? M.zoom(ZSTEP) : null)), one(["further", "zoom further"], () => (M.zoom ? M.zoom(1 / ZSTEP) : null)),
  one(["undo the fix"], () => M.undoFix()),
  one(["too much", "this is a lot"], () => M.tooMuch()),
  { hears: /^set mark (\d)$/, run: (m) => M.markSet(+m[1]) }, { hears: /^mark (\d)$/, run: (m) => M.markGo(+m[1]) },
  { hears: /^go to (.+)$/, run: (m) => { const id = findByWords(m[1]); return id ? M.goto(id) : null; } },
  { hears: /^yes$/, run: () => { const id = lineAsk(); return id ? done(answer(id), id) : null; } },
];
export const CHAIN: Phrase[] = [...pieces, ...plane, ...settings, ...life, ...near, ...needs, ...ais, ...engine, ...people, ...movein, ...seats, ...lead, ...SHARED];
import fits from "./fits.ts"; CHAIN.splice(CHAIN.length - SHARED.length, 0, ...fits);   // slice R8 (#1615): before the shared ones

/** the chain: the first phrase that hears the words (lower case) makes its move; null when none does */
export function chain(words: string): Done | null {
  const t = String(words).toLowerCase().trim();
  if (!t) return null;
  for (const p of CHAIN) {
    const m = t.match(p.hears);
    if (!m) continue;
    const r = p.run(m, t);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------- the one voice (desk.js I1)

/** what one utterance did: where it came from, its words, the move it called and that move's arguments as JSON */
export type Heard = { from: string; words: string; fn: string | null; args: string; done: Done | null };
let capture: Heard | null = null;
const wrapped = new WeakSet<object>();
/** every move in M tells the voice which was called first (desk.js wrapMoves); wrapped once, kept as it answers */
function wrapMoves(): void {
  for (const k of Object.keys(M)) {
    const f = M[k];
    if (typeof f !== "function" || wrapped.has(f)) continue;
    const g = (...a: unknown[]) => { if (capture && !capture.fn) { capture.fn = k; capture.args = JSON.stringify(a); } return f(...a); };
    wrapped.add(g); M[k] = g;
  }
}
/** the ask the words answer: the one on the line (the island's own ask is night 2's, with the island) */
const askHere = (): string | null => lineAsk();
/** the utterances heard, the last one last (the counts read it) */
export const heard: Heard[] = [];
export function voice(words: string, from: "pill" | "island" | string = "pill"): Heard | null {
  const t = String(words || "").trim();
  if (!t) return null;
  const l = t.toLowerCase().replace(/[.!]$/, "");
  wrapMoves();
  capture = { from, words: t, fn: null, args: "", done: null };
  try {
    const id = askHere();
    if (/^(yes|allow|allow it|ok|do it|keep it)$/.test(l) && id) { capture.fn = "answer"; capture.args = JSON.stringify([id]); capture.done = done(answer(id), id); }
    else if (/^(later|not now)$/.test(l) && id) { capture.fn = "answer"; capture.args = JSON.stringify([id, "later"]); capture.done = done(answer(id, "later"), id); }
    else capture.done = chain(t);
  } finally { const c = capture!; capture = null; heard.push(c); if (heard.length > 50) heard.shift(); }
  return heard[heard.length - 1];
}
/** the pill's words: one voice, answered as the move's Done (null when no move took them) */
export function say(words: string): Done | null {
  const h = voice(words, "pill");
  return h?.done ?? (h?.fn ? done(true) : null);
}
/** the counts' handle on the voice (dev page): hooks.voice, as the mockup's CV.voice */
(hooks as unknown as { voice: unknown }).voice = Object.assign(voice, { heard, chain });
import scope from "./scope.ts"; CHAIN.splice(CHAIN.length - SHARED.length, 0, ...scope);   // slice R9 (#1615): before the shared ones
import customize from "./customize.ts"; CHAIN.unshift(...customize);   // BR1 people (#1615): Customize hears its words first
import tidy from "./tidy.ts"; CHAIN.splice(CHAIN.length - SHARED.length, 0, ...tidy);   // BR1 tidy (#1615): "tidy my folders", before the shared ones
