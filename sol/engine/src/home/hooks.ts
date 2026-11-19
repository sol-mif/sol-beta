// The two calls between Home units (specs home-plan §4.3), so no unit edits another's file:
//   onAnswer(prefix, f)  home.answer on a Thing whose links hold "block:<project>/<id>" (Home 2) or "rung:<event id>"
//                        (Home 5) goes to that unit's f first; f answers true when it handled the answer
//   onStage(f)           told of every change on the stage (Home 2, Home 7), through homeStage
//   homeStage(m)         what work/wire.ts calls with each change of the stage bus; nothing while Home is off
import type { Change } from "../work/blocks.js";
import type { Ctx } from "./unit.js";
import type { Thing } from "./items.js";

/** `more.opened`: the answer said the face showed the whole of a card's cut values (home.answer's `opened`, Home 5) */
export type AnswerHook = (ctx: Ctx, thing: Thing, answer: string, more?: { opened?: boolean }) => Promise<boolean>;
const answers = new Map<"block:" | "rung:", AnswerHook>();
const stage = new Set<(ctx: Ctx, m: Change) => void>();
/** the live Home, given by wire.ts: null while Home is off */
let live: () => Ctx | null = () => null;
export const setLive = (f: () => Ctx | null): void => { live = f; };

/** one hook a prefix: a second call puts its own in place (a unit may set it again at each start). The answer is how
 *  to take it away (tests) */
export function onAnswer(prefix: "block:" | "rung:", f: AnswerHook): () => void {
  answers.set(prefix, f);
  return () => { if (answers.get(prefix) === f) answers.delete(prefix); };
}
/** the hook a Thing's answer goes to first: the first of its links with a prefix that has one */
export function answerHook(t: Thing): AnswerHook | null {
  for (const l of t.links) for (const [p, f] of answers) if (l.startsWith(p)) return f;
  return null;
}
export function onStage(f: (ctx: Ctx, m: Change) => void): () => void { stage.add(f); return () => { stage.delete(f); }; }
export function homeStage(m: Change): void {
  if (!stage.size) return;
  const ctx = live();
  if (!ctx) return;
  for (const f of stage) { try { f(ctx, m); } catch (err) { console.error("home: the stage:", err instanceof Error ? err.message : String(err)); } }
}
