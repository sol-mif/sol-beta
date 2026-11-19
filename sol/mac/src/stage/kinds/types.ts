// What a kind is given (#696): its block, its body as the kind reads it, and one way to change it: a patch of the body
// (or the state) with the ledger's line. The frame around it is the stage's; a kind draws only its inside.
import type { Block, State } from "../model";

export type Act = (patch: { body?: unknown; state?: State }, line: string) => void;
export type KindProps<B> = { b: Block; body: B; act: Act; moving?: boolean; /** the stage's session: a program's kind asks the engine for it (#699) */ session?: string };

/** `base`: where the page's own images, styles and scripts are, a path on the engine (#744) */
export type PageBody = { html?: string; text?: string; src?: string; path?: string; note?: string; n?: number; base?: string };
export type Step = { t: string; st: "done" | "half" | "wait" | ""; note?: string; proof?: string; ok?: boolean };
export type ListBody = { steps: Step[] };
export type Pick = "keep" | "cut" | "later";
export type Still = { name: string; src?: string; pick?: Pick };
/** `ask`: the question the stills are shown for, under them (v4 §4) */
export type StillsBody = { stills: Still[]; ask?: string };
/** ok false: it waits on you; wrong: it went wrong (the meaning channel) */
export type CardBody = { big: string; sub?: string; ok?: boolean; wrong?: boolean };
export type TableBody = { cols: string[]; rows: string[][] };
export type DiffLine = { k: "+" | "-" | " "; t: string };
/** `file`: the file the lines are of, for its pill (else the block's source) */
export type DiffBody = { lines?: DiffLine[]; text?: string; file?: string };
/** a session under an orchestrator (step 4, engine work/children.ts): the engine keeps it current; the face draws it */
export type SessionBody = {
  sessionId: string; title?: string;
  row?: { running?: boolean; failed?: boolean; unread?: boolean; done?: boolean };
  run?: { busy: boolean; waiting: number; tasks?: number; failed?: boolean };
  where?: { folder: string; branch?: string; pr?: { n: number; state: string } };
  last?: string;
  ask?: { question: string; actions?: { label: string }[] };
};
