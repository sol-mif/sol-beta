// Scoped and Approve (#482, engine team/checkpoint.ts): what the card in a session says, pure, for the card and its
// test. The engine decides; the card only says what the engine sent and carries the press.
export type Checkpoint = {
  id: string; press: "scoped" | "approve"; feature: string; folder: string; title: string;
  why: string | null; state?: "busy" | "done"; by?: string; on?: string; error?: string;
};

/** the card's words for its state (pure) */
export function checkpointWords(c: Checkpoint): { head: string; ask: string; button: string; done: string; blocked: string } {
  const scoped = c.press === "scoped";
  return {
    head: `${scoped ? "scoped" : "evals"} · ${c.feature}`,
    ask: scoped
      ? `Is ${c.title || c.feature} scoped? The PRD has every section and no open question.`
      : `Approve the evals of ${c.title || c.feature}? Building starts once they are approved.`,
    button: c.state === "busy" ? "…" : scoped ? "Scoped" : "Approve",
    done: c.state === "done" ? `${scoped ? "Scoped" : "Approved"} by ${c.by} on ${c.on}` : "",
    blocked: c.why ? `Sol refuses it until: ${c.why}` : "",
  };
}
