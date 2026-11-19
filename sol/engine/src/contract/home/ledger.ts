// The ledger, "done today" (#829; face #797): the shapes the engine sends and takes, as Zod schemas, each with its type.
// Every name and field is Marco's, read from his face (origin/marco/mine-run, sol/mac/src/home/whole/ledger.ts
// l.17-30; specs/face-wire.md §3.4), none is the engine's pick. What the engine sends parses with the strict schemas (no
// field beyond these); an ask may carry more (a rid, say) and is read for its own fields only. The ledger's undo is
// Today's `home.undo { ledgerId }` (contract/home/today.ts UndoAsk), routed by the act's kind.
import { z } from "zod";
import { Rung, SourceId } from "./policy.js";

/** an entry: signed by who did it (`actor`, `at`); `did` what was done, or `wouldHave` what Sol would have done on
 *  `rung` and did not; `undo` real until a time, or none with why; `sub` the line under it; `state` what became of it */
export const Entry = z.object({
  id: z.string(), at: z.number(), actor: z.enum(["you", "sol"]), thingId: z.string().optional(), source: SourceId.optional(),
  did: z.string().optional(), wouldHave: z.string().optional(), rung: Rung, sub: z.string(),
  undo: z.union([z.object({ kind: z.literal("real"), until: z.number() }).strict(), z.object({ none: z.literal(true), why: z.string() }).strict()]),
  state: z.enum(["undone", "let", "not"]).optional(),
}).strict();
export const LedgerDone = z.object({ ledgerId: z.string(), line: z.string(), entryId: z.string() }).strict();
/** the one message after every ask: today's entries (`day` the local date "YYYY-M-D", unpadded), and the receipt */
export const LedgerMsg = z.object({ type: z.literal("home.ledger"), day: z.string(), entries: z.array(Entry), done: LedgerDone.nullable() }).strict();

// the asks (face to engine)
const ID = z.string().min(1).max(200);
export const LedgerAsk = z.object({ type: z.literal("home.ledger") });
export const LedgerLetAsk = z.object({ type: z.literal("home.ledger.let"), id: ID });
export const LedgerNotAsk = z.object({ type: z.literal("home.ledger.not"), id: ID });

export type Entry = z.infer<typeof Entry>;
export type LedgerDone = z.infer<typeof LedgerDone>;
export type LedgerMsg = z.infer<typeof LedgerMsg>;
