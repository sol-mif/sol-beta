// Copied from MR (origin/marco/mine-run 54e4f636, unchanged at fa6becaf) sol/mac/src/home-question.test.ts l.82-85 (a job's question), sol/mac/src/home/whole/today.ts l.183, l.192-193 (an answer to it) and sol/mac/src/home-whole.test.ts l.42 (the first scene's line); not imported: the engine never imports sol/mac.
// What the face reads a block's question as, and what it expects an answer to do to it. A job's question is a Thing with
// read "job", state "asks", waitsOn "you" (his question test's `th`); the face's question card is only one of those with a
// card (q0, asked without a card, is passed over), so a block's Thing, which has none, is counted on the list but never
// drawn as the notch's question. Any answer to a question lets the job go on at once: state "moving", waitsOn "agent".
// A Thing not waiting on you is answered with the list alone (l.183).

/** his question's Thing, without its card (home-question.test.ts l.82, q0) */
export const QUESTION = { read: "job", state: "asks", waitsOn: "you" } as const;
/** what any answer to a question makes of it (today.ts l.192-193: `goes = t.state === "asks" || …`) */
export const ANSWERED = { state: "moving", waitsOn: "agent" } as const;
/** his first scene's line before (home-whole.test.ts l.42), and the count, today.needs.length, the notch reads */
export const BEFORE = { line: "Three things need you. Two are moving on their own.", count: 3 };
