// Releases (#1299): a made-up morning for the dev page (releases.html) and the tests, every kind of thing on it.
// Logins are a, b, c (the leak check: no team name in a fixture); the real ones come only from the engine's read.
import type { ReleasesRead } from "./releasesWords";

const at = (daysAgo: number, h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() - daysAgo); return d.toISOString(); };
const tag = (daysAgo: number) => { const d = new Date(at(daysAgo, 9)); return `dev-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; };

export type State = "line" | "open" | "behind" | "decision" | "press";
export const STATES: State[] = ["line", "open", "behind", "decision", "press"];

/** the read for a state of the dev page: `press` has the newest release waiting on the beta pass; the others don't */
export function fixture(state: State): ReleasesRead {
  const behind = [
    { login: "a", name: "Ann", releases: state === "behind" ? 3 : 0, on: state === "behind" ? tag(2) : tag(0), prs: [{ n: 1320, title: "Releases: the line and the card" }] },
    { login: "b", name: "Bo", releases: 1, on: tag(1), prs: [] },
    { login: "c", name: "Cy", releases: null, on: null, prs: [{ n: 1318, title: "The room asks the setting again" }, { n: 1319, title: "Room: who is in it" }] },
  ];
  return {
    at: new Date().toISOString(), me: "a",
    releases: [
      { tag: "main", when: at(0, 13), by: "", channel: "dev", next: true, behind: [], waits: state === "line" || state === "open" ? undefined : { held: true },
        prs: [{ n: 1316, title: "Agents' room: a hand-over shows who holds it", issue: 1298, by: "c", agentOf: "c" }],
        knots: state === "line" || state === "open" ? [] : [{ what: "the engine stops at start when the room file is empty", where: "#1316 sol/engine/src/team/room-start.ts:88", severity: "critical" }] },
      { tag: tag(0), when: at(0, 9), by: "the release timer", channel: "dev", latest: true, behind,
        waits: state === "press" ? { press: "beta", who: ["b"] } : undefined,
        prs: [
          { n: 1312, title: "My agent decides, in a room of its own", issue: 1311, by: "b", agentOf: "b" },
          { n: 1310, title: "The room asks the setting again at each press", issue: 1309, by: "b", agentOf: "b" },
          { n: 1301, title: "The gaps rule: records travel with code", issue: 1296, by: "a", agentOf: "a" },
          { n: 1305, title: "Sign-in copy for the first run", issue: 1290, by: "c" },
        ],
        knots: [{ what: "a row's key is its index, so a press can land on the wrong release", where: "#1301 sol/mac/src/cowork/whole/tabs.tsx:158", severity: "major" }] },
      { tag: tag(1), when: at(1, 9), by: "the release timer", channel: "beta", behind: [],
        prs: [
          { n: 1290, title: "Who has what reads the owners file", issue: 1288, by: "a", agentOf: "a" },
          { n: 1293, title: "A quiet Sol pushes nothing", issue: 1293, by: "b" },
        ], knots: [] },
      { tag: `${tag(2)}-1716`, when: at(2, 17, 16), by: "a", channel: "beta", behind: [],
        prs: [{ n: 1280, title: "Urgent: the window opens blank after an update", issue: 1279, by: "a", agentOf: "a" }], knots: [] },
      { tag: tag(2), when: at(2, 9), by: "the release timer", channel: "beta", behind: [],
        prs: [{ n: 1270, title: "Drift names the iteration", issue: 1153, by: "b", agentOf: "b" }, { n: 1272, title: "Guardrails, said for a person", issue: 1173, by: "a", agentOf: "a" }], knots: [] },
    ],
    decisions: state === "decision" || state === "line" || state === "press" ? [
      { issue: 1299, title: "Releases and the decision card", when: at(0, 11, 40), saidBy: "a", signedBy: "a", agent: true, session: "3f2a9c1b",
        words: "A's call on the decision card's form: a card in the Room, mirrored as a comment. The card is the thing; the comment on the issue is its proof, posted the moment the card is settled.",
        proof: { url: "https://github.com/o/r/issues/1299#issuecomment-1" } },
      { issue: 1244, title: "The two gates", when: at(1, 15, 5), saidBy: "b", signedBy: "c", agent: true,
        words: "Decision, a change short of gate one goes to its area's lead whole; the agent says where and does not patch it to pass.",
        proof: { url: "https://github.com/o/r/issues/1244#issuecomment-2" } },
    ] : [],
  };
}
