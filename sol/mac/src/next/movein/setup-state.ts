// The first run on the new face (#94, Sol ticket #96). A downloaded Sol.app with no root installs itself: the shell runs the
// bundled install at launch (welcome.rs first_run) and, once it ends with a root written and the engine up, loads "/" on
// its own (what welcome_done did). The face never waits on the engine for it: it asks the shell (first_run_state) and,
// while the shell is setting up, draws one line, its progress, and the reason when it stops (Setup.tsx). After that the
// new face's own start-up and welcome card take over (Google there, Claude and Codex on the card). Plain, so the test
// reads it (next-firstrun.test.ts); the view is Setup.tsx, and when it is drawn is flag.ts (firstScreen, watchFirstRun),
// which App.tsx reads before anything under next/ loads.

import type { FirstRun } from "../flag.ts";
export type { FirstRun };

// where each step of sol/install starts on the line (the old onboarding's reading, onboard/install.ts, kept to the line)
const MARKS: [RegExp, number][] = [
  [/^(install|setup): cloning Sol/, 0.04], [/^ {2}ok {4}Sol is (in|already)/, 0.22], [/^(install|setup): fetching Node/, 0.22],
  [/^ {2}ok {4}Node v[\d.]+ in /, 0.42], [/^install: bash sol\/setup/, 0.42], [/^ {2}ok {4}(sol\/setup done|the engine answers on )/, 0.94],
  [/^install: .*Claude Code/, 0.94],
];
/** how far the install is, 0 to 1, from its lines so far; 1 once the shell has stopped saying it is active */
export function progressOf(lines: readonly string[]): number {
  let f = 0.02;
  for (const l of lines) for (const [re, at] of MARKS) if (re.test(l) && at > f) f = at;
  return f;
}

/** the one thing the install waits on the person for (a clean Mac: Apple's developer tools, git needs them), while it waits */
export function askOf(lines: readonly string[]): string | null {
  let i = -1;
  lines.forEach((l, k) => { if (/^install: .*developer tools.*this waits/.test(l)) i = k; });
  if (i < 0 || lines.slice(i + 1).some((l) => /^ {2}ok {4}Apple's developer tools/.test(l))) return null;
  return "Apple 開了一個視窗，請按「安裝」。裝好以後這裡會自己繼續。";
}
