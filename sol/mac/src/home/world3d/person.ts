// Home's world (#1093): a made-up person to draw and try the world on, modelled on how Marco's Home is laid out
// (memory: home-is-folders-that-do-work; school by class, jobs as automations, projects in Build, two teammates).
// Remy, 21, business + CS, builds an AI product with two friends. Each folder's stickies.md is written in the real
// format (stickies.ts): `- [ ]` open, `- [x]` done, "← now" the folder's agent is on it, a "needs you" note wants him.
// A test engine's home is seeded from here (the PR's "What to try"); with no home at all, the world draws it in memory.
import type { Mate, Project } from "./model.ts";

export type PersonFolder = { id: string; name: string; part: string; rel: string; stickies: string };
const S = (...lines: string[]) => `# Stickies\n\nMade by you in Home, one per line.\n\n${lines.join("\n")}\n`;

export const PERSON = {
  who: "Remy",
  parts: [
    { id: "school", name: "school" },
    { id: "jobs", name: "jobs" },
    { id: "life", name: "life" },
  ],
  folders: [
    { id: "bl240", name: "BL240 law", part: "school", rel: "school/bl240", stickies: S("- [ ] Exam prep ch 9-12 — a one-page sheet per chapter ← now", "- [ ] Case brief: Hadley — facts, issue, rule", "- [x] Quiz 4") },
    { id: "is210", name: "IS210", part: "school", rel: "school/is210", stickies: S("- [ ] ERD draft for the group — tables and keys", "  - needs you: which of the two schemas the group picked", "- [ ] Reading week 11") },
    { id: "ds470", name: "DS470", part: "school", rel: "school/ds470", stickies: S("- [ ] Notebook 6 — clean, plot, one paragraph ← now", "- [x] Group call notes") },
    { id: "fe450", name: "FE450", part: "school", rel: "school/fe450", stickies: S("- [ ] DCF problem set — 4 problems, show the work") },
    { id: "apply", name: "applications", part: "jobs", rel: "jobs/applications", stickies: S("- [ ] Three new roles this week — find, score, draft ← now", "- [ ] Cover letter: Ramp — from the last two", "  - needs you: send it or change the opening line", "- [x] Notion: applied") },
    { id: "outreach", name: "SF outreach", part: "jobs", rel: "jobs/sf-outreach", stickies: S("- [ ] Follow up with four — a short note each", "- [x] Thank-you: Dana") },
    { id: "network", name: "networking", part: "jobs", rel: "jobs/networking", stickies: S("- [ ] Coffee chat Thursday — three questions to ask") },
    { id: "money", name: "money", part: "life", rel: "life/money", stickies: S("- [ ] Rent due on the 1st — remind me the 29th") },
    { id: "gym", name: "gym", part: "life", rel: "life/gym", stickies: S("- [x] Push day") },
  ] as PersonFolder[],
  /** drawn only when the engine lists no sessions (a fresh test engine): the projects a builder like Remy keeps */
  projects: [
    { id: "jelly", name: "Jelly", path: "~/projects/jelly", health: "ok", jelly: true, sessions: [
      { id: "j1", title: "the world in Home", busy: true, waiting: false, failed: false },
      { id: "j2", title: "tickets, routed", busy: true, waiting: false, failed: false },
      { id: "j3", title: "onboarding pass 6", busy: false, waiting: true, failed: false },
    ] },
    { id: "pathfinder", name: "Pathfinder", path: "~/projects/pathfinder", health: "ok", sessions: [{ id: "p1", title: "score new roles", busy: true, waiting: false, failed: false }] },
    { id: "atlas", name: "Atlas", path: "~/projects/atlas", health: "broken", sessions: [{ id: "a1", title: "map export", busy: false, waiting: false, failed: true }] },
    { id: "cafe", name: "café site", path: "~/projects/cafe-site", health: "idle", sessions: [{ id: "c1", title: "menu page", busy: false, waiting: false, failed: false }] },
  ] as Project[],
  mates: [{ name: "Frank", on: true }, { name: "Isaac", on: false }] as Mate[],
  social: 5,
};

/** the Jelly project's standing loops, drawn on its block as small lights, until part 5's registry (sol/systems) is read:
 *  the fourteen counted on 12 Nov (build-world memory), the two that fail in silence among them */
export const JELLY_LOOPS: { name: string; ok: boolean }[] = [
  "the release", "the review", "the hand-in", "the morning run", "the catch-up test", "the words pass", "CI", "the relay",
  "the list keeper", "the clash finder", "the night job", "sol-mine-merge", "the stamp", "the watchman",
].map((name) => ({ name, ok: name !== "the night job" && name !== "sol-mine-merge" }));
