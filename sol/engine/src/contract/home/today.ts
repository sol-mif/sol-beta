// Today, the one list (#790; face #791): the shapes the engine sends and takes, as Zod schemas, each with its type.
// Every name and field is Marco's, read from his face (origin/marco/mine-run 54e4f636, sol/mac/src/home/whole/today.ts
// l.13-59; specs/face-wire.md §3.1), none is the engine's pick but a card's `ask` (Home 5's ask card, below). What the
// engine sends parses with the strict schemas (no field beyond these); an ask may carry more (a rid, say) and is read
// for its own fields only.
import { z } from "zod";

export const Source = z.enum(["canvas", "mail", "calendar", "files", "people", "github", "sol"]);
export const Chip = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), ext: z.string(), label: z.string() }).strict(),
  z.object({ kind: z.literal("person"), label: z.string() }).strict(),
  z.object({ kind: z.literal("slot"), label: z.string() }).strict(),
]);
export const Touch = z.object({ source: Source, title: z.string(), note: z.string() }).strict();
export const Read = z.enum(["note", "date", "you", "job", "make"]);
export const State = z.enum(["read", "moving", "asks", "you", "proposed", "done"]);
export const WaitsOn = z.enum(["you", "agent", "none"]);
/** an ask's card's call (Home 5, the engine's pick, not Marco's: his face has no such part yet): the act and each field
 *  of the call as its own part, so nothing a seat writes can pose as the engine's words. `whole` is where a field cut
 *  at 200 characters is kept whole (`value:<hash>`); `hidden` names the free text left off; `cut` names the fields too
 *  long to show whole, a target or not (their start and end shown): a press on such a card must carry `opened: true`
 *  (AnswerAsk) */
export const AskCard = z.object({
  tool: z.string(),
  fields: z.array(z.object({ key: z.string(), value: z.string(), whole: z.string().optional() }).strict()),
  hidden: z.array(z.string()),
  cut: z.array(z.string()).optional(),
}).strict();
export const Card = z.object({
  source: Source, title: z.string(), why: z.string(), chips: z.array(Chip),
  answers: z.tuple([z.string(), z.string()]),   // the warm one first, then the plain one
  touches: z.array(Touch).max(3), edge: z.string(),
  ask: AskCard.optional(),   // only on an ask's card (Home 5)
}).strict();
/** the Thing as the face has it: one id for Home's card, the ribbon mark, Build's block and the folder rows */
export const Thing = z.object({
  id: z.string(), read: Read, folder: z.string(), words: z.string(), state: State, waitsOn: WaitsOn,
  due: z.number().optional(), at: z.number(), blocks: z.boolean().optional(),
  links: z.array(z.string()), made: z.array(z.string()), card: Card.optional(),
}).strict();
export const Mark = z.object({
  id: z.string(), kind: z.enum(["event", "big", "proposal", "kept", "you", "due", "thread"]), at: z.number(),
  end: z.number().optional(), from: z.number().optional(), label: z.string(), thingId: z.string().optional(), yours: z.boolean().optional(),
}).strict();
export const Today = z.object({ needs: z.array(z.string()), moving: z.array(z.string()), week: z.array(Mark), line: z.string() }).strict();
export const TodayMsg = z.object({ type: z.literal("home.today"), today: Today, things: z.array(Thing) }).strict();
export const DoneMsg = z.object({
  type: z.literal("home.done"), ledgerId: z.string(), thingId: z.string(), did: z.enum(["answer", "later", "file"]),
  answer: z.string().optional(), thingIds: z.array(z.string()).optional(), line: z.string().optional(),
}).strict();
/** the answer to any of Home's messages from a connection that is not one of Sol's own windows (index.ts fromSol):
 *  nothing was read or written. The type and `why` are the engine's pick, not Marco's (his face is always a Sol window) */
export const RefusedMsg = z.object({ type: z.literal("home.refused"), why: z.string() }).strict();

// the asks (face to engine)
const ID = z.string().min(1).max(200);
export const TodayAsk = z.object({ type: z.literal("home.today") });
/** `opened`: the face showed the whole of every value its ask's card lists in `cut` (Home 5; without it such a press is refused) */
export const AnswerAsk = z.object({ type: z.literal("home.answer"), thingId: ID, answer: z.string().max(4000), opened: z.boolean().optional() });
export const LaterAsk = z.object({ type: z.literal("home.later"), thingId: ID });
export const UndoAsk = z.object({ type: z.literal("home.undo"), ledgerId: ID });

export type Thing = z.infer<typeof Thing>;
export type Mark = z.infer<typeof Mark>;
export type Today = z.infer<typeof Today>;
export type TodayMsg = z.infer<typeof TodayMsg>;
export type DoneMsg = z.infer<typeof DoneMsg>;
