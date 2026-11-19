// People (#1297): fixture reads for the dev page (people.html) and the view's test. Logins a, b, c only: real logins
// come from the engine's read at runtime, never from a file (the leak check).
import type { PeopleRead, PersonRead } from "./peopleView";

export const STATES = ["full", "empty", "one-waits", "agent-busy"] as const;
export type FixtureState = (typeof STATES)[number];

const H = 3600_000;
const blank = (login: string, name: string): PersonRead => ({ login, name, holds: null, open: [], waits: [], agent: { inFlight: [] }, landed: [], minutes: { today: null, week: null } });
const U = "https://github.com/o/r";

/** one fixture read, as the engine gives it, at `now` (pure) */
export function fixtureRead(state: FixtureState, now: number): PeopleRead {
  const at = (h: number) => now - h * H;
  const a = blank("a", "Ada"), b = blank("b", "Bo"), c = blank("c", "Cy");
  if (state === "full" || state === "one-waits" || state === "agent-busy") {
    a.holds = { n: 12, title: "People: a card each, never a list", url: `${U}/issues/12`, kind: "feature", area: "cowork", since: at(30), now: true };
    a.open = [
      { n: 13, title: "the release word names its day", url: `${U}/issues/13`, kind: "bug", area: "base", since: at(80), now: true },
      { n: 14, title: "the stamp on a tried change", url: `${U}/issues/14`, kind: "feature", area: "cowork", since: at(120) },
    ];
    a.minutes = { today: 34, week: 125 };   // the reader's own: counted on this Sol
    b.holds = { n: 21, title: "the relay keeps its spool through a restart", url: `${U}/issues/21`, kind: "feature", area: "base", since: at(10), now: true };
    c.open = [{ n: 30, title: "the site's first page", url: `${U}/issues/30`, kind: "feature", area: "marketing", since: at(50) }];
  }
  if (state === "full") {
    a.waits = [
      { id: "hand000001", n: 21, title: "the relay's tail", url: `${U}/issues/21`, why: "hand", since: at(0.2), from: "b" },
      { n: 40, title: "the gate reads the records in the commit", url: `${U}/pull/40`, why: "review", since: at(2), from: "b" },
      { id: "ask0000001", title: "which release do you run?", why: "ask", since: at(0.5), from: "c" },
    ];
    b.waits = [{ n: 41, title: "People's engine read", url: `${U}/pull/41`, why: "review", since: at(1), from: "a" }];
    c.waits = [{ n: 20, title: "which price on the first page", url: `${U}/issues/20`, why: "decision", since: at(5), from: "" }];
    a.agent.inFlight = [
      { n: 41, title: "People's engine read", url: `${U}/pull/41`, state: "pr", since: at(1) },
      { title: "answering Cy: which release do you run?", state: "answering", since: at(0.5) },
    ];
    b.agent.inFlight = [{ n: 21, title: "the relay keeps its spool through a restart", url: `${U}/issues/21`, state: "building", since: at(10) }];
    a.landed = [{ pr: 38, title: "the gaps rule", url: `${U}/pull/38`, when: at(3) }];
    b.landed = [{ pr: 39, title: "my agent decides in a room of its own", url: `${U}/pull/39`, when: at(4) }, { n: 9, title: "the stamp", url: `${U}/issues/9`, when: at(6) }];
  }
  if (state === "one-waits") a.waits = [{ n: 40, title: "the gate reads the records in the commit", url: `${U}/pull/40`, why: "review", since: at(2), from: "b" }];
  if (state === "agent-busy") {
    a.agent.inFlight = [
      { n: 41, title: "People's engine read", url: `${U}/pull/41`, state: "pr", since: at(1) },
      { n: 42, title: "People's card face", url: `${U}/pull/42`, state: "pr", since: at(0.7) },
      { n: 12, title: "People: a card each, never a list", url: `${U}/issues/12`, state: "building", since: at(30) },
      { title: "answering Bo: is the relay's spool on main?", state: "answering", since: at(0.1) },
    ];
    a.waits = [{ id: "hand000002", n: 21, title: "the relay's tail", url: `${U}/issues/21`, why: "hand", since: at(0.2), from: "b" }];   // reach's tools off: its press names the switch
    b.agent.inFlight = [{ title: "answering Ada: which release do you run?", state: "answering", since: at(0.3) }];
  }
  return { at: now, me: "a", tools: state !== "agent-busy", repo: U, people: [a, b, c] };
}
