// The read of a sentence (#827; face #792): the shapes the engine sends and takes, as Zod schemas, each with its type.
// Every name and field below the line "Marco's" is his, read from his face (origin/marco/mine-run fa6becaf, same as
// 54e4f636 for this file, sol/mac/src/home/whole/reads.ts l.13-25; specs/face-wire.md §3.2), except the ask
// `home.say {text}`, which no code of his sends yet: its name is the one #827 and his comments (reads.ts l.20, l.129)
// give. What the engine sends parses with the strict schemas; an ask may carry more and is read for its own fields.
// The names that are the engine's own pick, not his, are kept together at the end (OURS), so he can rename each in one
// edit.
import { createHash } from "node:crypto";
import { z } from "zod";
import { Read as ReadOfToday } from "./today.js";

// ── Marco's ──
/** the five, in the track's order (MR reads.ts l.13; the same enum as Thing.read) */
export const READS = ["note", "date", "you", "job", "make"] as const;
export const Read = ReadOfToday;
export type Read = z.infer<typeof Read>;
const P = z.object({ note: z.number(), date: z.number(), you: z.number(), job: z.number(), make: z.number() }).strict();
/** a part as the engine reads it: its words, the read with the probability of each of the five, the folder, when it
 *  lands (ms since the epoch) and after what, and the week's mark it found (a date that adds nothing) */
export const Part = z.object({
  text: z.string(), read: Read, p: P, folder: z.string(),
  at: z.number().optional(), after: z.string().optional(), found: z.string().optional(),
}).strict();
/** the engine's answer to home.say */
export const ReadMsg = z.object({ type: z.literal("home.read"), text: z.string(), ms: z.number(), parts: z.array(Part) }).strict();
/** what Enter sends: each part with the read it goes as (the person's, where they pressed another: `was` is the
 *  engine's) */
const SAID = z.string().max(4000).refine((s) => s.trim().length > 0, "words, not only spaces");
/** a time a part lands on: ms since the epoch that a Date can hold */
const AT = z.number().min(0).max(8.64e15);
export const Filed = z.object({
  text: SAID, read: Read, folder: z.string().max(400),
  at: AT.optional(), after: z.string().max(400).optional(), found: z.string().max(200).optional(), was: Read.optional(),
});
/** an override, kept as a learned line */
export const Learned = z.object({ text: SAID, from: Read, to: Read });

// the asks (face to engine)
export const SayAsk = z.object({ type: z.literal("home.say"), text: z.string().max(4000) });
export const FileAsk = z.object({ type: z.literal("home.file"), parts: z.array(Filed).min(1).max(50) });
export const LearnAsk = z.object({ type: z.literal("home.learn"), learned: Learned });

export type Part = z.infer<typeof Part>;
export type ReadMsg = z.infer<typeof ReadMsg>;
export type Filed = z.infer<typeof Filed>;
export type Learned = z.infer<typeof Learned>;

// ── OURS: names between face and engine that are the engine's pick, in one place ──
const WORD: Record<Read, string> = { note: "a note", date: "a date", you: "for you", job: "a job", make: "a thing to make" };
/** the id of the learned line an override makes: one id for the same sentence read the same other way, so a second
 *  time is counted on the same line ("seen"). Home 4 lists it in home.sources `learned` and takes it in
 *  home.learned.keep / home.learned.drop */
export const learnedId = (l: Learned): string =>
  `ln-${createHash("sha256").update(JSON.stringify([l.from, l.to, l.text.trim().toLowerCase().replace(/\s+/g, " ")])).digest("hex").slice(0, 12)}`;
/** the learned line's words (plain text: the sentence form is Marco's to write; his pill words for the reads) */
export const learnedText = (l: Learned): string => `Read “${l.text.trim()}” as ${WORD[l.to]}, not ${WORD[l.from]}.`;
