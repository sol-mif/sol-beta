// The first-timer's stage (#485, team/firsttimer.ts makeStage): an engine started with SOL_STAGE=1 is a stage, a Sol
// a test agent plays with through the test browser. Its home, state and team are its own, and its HOME is an empty
// folder, but it still runs from a real checkout. So whatever reaches past the stage is refused here, whoever asks:
// going back a release (sol/back swaps the build of the Sol that runs), Update, carrying changes over and every
// message about set-aside changes (team.aside.back carries them onto the real checkout's HEAD), pinning, and running a
// code block. Each answers one plain line.
export const STAGE = process.env.SOL_STAGE === "1";

const REFUSED = /^(goback|goback\.plan|run|run\.stop|team\.update|team\.carry\.[a-z.]+|team\.aside\.[a-z.]+|team\.asides|team\.pin\.[a-z.]+|team\.stable\.[a-z.]+)$/;
/** why a stage refuses a message of this type (pure), or null when it may go on */
export function stageRefusal(type: unknown): string | null {
  return typeof type === "string" && REFUSED.test(type) ? "this is the first-timer's stage: it does not go back, update, pin, carry changes or run commands" : null;
}
