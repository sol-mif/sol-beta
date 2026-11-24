// A raise's outcome, live (BR1 quiet canvas, #1615; mine/look/br1/quiet.html §3 step 4): an answer, a Later or a pass
// is a correction, one scoped line in next.known (next.known.fix how "answer" | "later" | "pass", its place the folder,
// its reason the ask's key, its because the ask's own keys). The judging side (builder P) reads them for the next raise.
// Sent only once the engine holds next.known (wire/because.ts knownEngine): an older engine refuses the message.
// Signed: marcocyl04-ux's agent (builder Q), BR1 (#1615).
import { asker } from "../../../agents/model.ts";
import { knownEngine } from "./because.ts";
import type { Engine } from "./types.ts";

type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;
let ask: Ask | null = null;

/** one outcome line: what the raise named, in the folder, for the ask's key; `now` the answer's words */
export type Outcome = { how: "answer" | "later" | "pass" | "open"; what: string; place: string; reason: string; was?: string; now?: string; because?: string[] };

export function sendOutcome(o: Outcome): boolean {
  const a = ask;
  if (!a || !knownEngine()) return false;
  void a({ type: "next.known.fix", ...o }, 8000);
  return true;
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-raise" });
  ask = a.ask;
  return () => { ask = null; a.close(); };
}
