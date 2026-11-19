// Sources and the policy paragraph (#828; face #796): the shapes the engine sends and takes, as Zod schemas, each with
// its type. Every name and field is Marco's, read from his face (origin/marco/mine-run 54e4f636,
// sol/mac/src/home/whole/policy.ts l.13-42; specs/face-wire.md §3.3), none is the engine's pick. What the engine sends
// parses with the strict schemas (no field beyond these); an ask may carry more (a rid, say) and is read for its own
// fields only.
import { z } from "zod";

export const RUNGS = ["read", "propose", "draft", "act"] as const;
export const Rung = z.enum(RUNGS);
export const SOURCE_IDS = ["calendar", "mail", "files", "github", "canvas"] as const;
export const SourceId = z.enum(SOURCE_IDS);
export const Health = z.object({ state: z.enum(["ok", "stale", "broken"]), lastRead: z.number(), why: z.string().optional() }).strict();
export const Scope = z.object({ reads: z.array(z.string()), never: z.array(z.string()) }).strict();
/** a source: its health, its scope, its rung on the ladder read · propose · draft · act, and the record-only count of
 *  what Sol would have done today a rung up */
export const Source = z.object({ id: SourceId, name: z.string(), kind: z.string(), health: Health, scope: Scope, rung: Rung, would: z.number() }).strict();
/** a sentence of the policy: what it sets (a source or a folder) and the rung, or null (it names one but no rung); one
 *  that names neither is a rule of yours */
export const Sentence = z.object({ span: z.string(), source: SourceId.optional(), folder: z.string().optional(), rung: Rung.nullable(), rule: z.literal(true).optional() }).strict();
export const Policy = z.object({ text: z.string(), sentences: z.array(Sentence) }).strict();
/** a folder carries its own rung, never above its source's */
export const Folder = z.object({ name: z.string(), source: SourceId, rung: Rung, asked: Rung }).strict();
export const LearnedLine = z.object({ id: z.string(), text: z.string(), seen: z.number(), sentence: z.string() }).strict();
export const SourcesDone = z.object({ ledgerId: z.string(), line: z.string() }).strict();
export const SourcesMsg = z.object({
  type: z.literal("home.sources"), sources: z.array(Source), policy: Policy, folders: z.array(Folder), learned: z.array(LearnedLine),
  done: SourcesDone.nullable(),
}).strict();

// the asks (face to engine)
const ID = z.string().min(1).max(200);
export const SourcesAsk = z.object({ type: z.literal("home.sources") });
export const SourceSetAsk = z.object({ type: z.literal("home.source.set"), id: SourceId, rung: Rung });
export const PolicyWriteAsk = z.object({ type: z.literal("home.policy.write"), text: z.string().max(20_000) });
export const RepairAsk = z.object({ type: z.literal("home.source.repair"), id: SourceId });
export const LearnedKeepAsk = z.object({ type: z.literal("home.learned.keep"), id: ID });
export const LearnedDropAsk = z.object({ type: z.literal("home.learned.drop"), id: ID });
export const SourcesUndoAsk = z.object({ type: z.literal("home.sources.undo"), ledgerId: ID });

export type Rung = z.infer<typeof Rung>;
export type SourceId = z.infer<typeof SourceId>;
export type Health = z.infer<typeof Health>;
export type Scope = z.infer<typeof Scope>;
export type Source = z.infer<typeof Source>;
export type Sentence = z.infer<typeof Sentence>;
export type Policy = z.infer<typeof Policy>;
export type Folder = z.infer<typeof Folder>;
export type LearnedLine = z.infer<typeof LearnedLine>;
export type SourcesDone = z.infer<typeof SourcesDone>;
export type SourcesMsg = z.infer<typeof SourcesMsg>;
