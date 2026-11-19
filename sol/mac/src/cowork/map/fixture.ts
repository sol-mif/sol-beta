// A map spec to draw without an engine (#1433): three people a, b, c, two outcomes, a layer of ten that folds, one
// change by hand and one by an agent, a PR and a call. The face's tests read it, and the gate's Cowork path answers
// team.map with it on the stub engine (sol/test/e2e/cowork-nav.mjs).
import type { MapSpec, Place } from "./spec";

const place = (id: string, parent: string | null, kids: string[], x: Partial<Place> = {}): Place =>
  ({ id, parent, name: id, kids, parts: 1, broken: 0, prs: [], calls: [], clash: 0, pairs: {}, prClash: 0, prPairs: {}, alone: 0, ...x });
const leaves = Array.from({ length: 10 }, (_, i) => `face/k${i}`);
const P: Record<string, Place> = {
  root: place("root", null, ["o:one", "o:two"], { parts: 16 }),
  "o:one": place("o:one", "root", ["face"], { name: "The first", parts: 11, holder: "a" }),
  face: place("face", "o:one", leaves, { parts: 11 }),
  "o:two": place("o:two", "root", ["engine"], { name: "The second", parts: 5, holder: "b", calls: [7] }),
  engine: place("engine", "o:two", ["engine/team"], { parts: 5, calls: [7] }),
  "engine/team": place("engine/team", "engine", [], { parts: 1, calls: [7], prs: [3] }),
};
leaves.forEach((id, i) => (P[id] = place(id, "face", [], { parts: 1 + i })));
export const mapFixture: MapSpec = {
  what: "", made_by: "", now: 0, window: 72, repo: "o/r",
  people: [{ id: "a", kind: "person", name: "A", set: 1, logins: ["a-gh"] }, { id: "b", kind: "person", name: "B", set: 2, logins: ["b-gh"] }, { id: "c", kind: "person", name: "C", set: 5 }],
  places: P,
  types: [{ id: "outcomes", name: "Outcomes", hint: "", roots: ["o:one", "o:two"] }, { id: "folders", name: "Folders", hint: "", roots: ["face", "engine"] }],
  layout: { "o:one": [250, 270], "o:two": [600, 200] },
  changes: [
    { h: "1", ago: 60, by: "a", how: "agent", s: "kit", parts: ["face/k3"] },
    { h: "2", ago: 600, by: "a", how: "hand", s: "team", parts: ["engine/team"] },
  ],
  prs: [{ n: 3, t: "a PR", by: "b", draft: false, idle: 1, parts: ["engine/team"] }],
  calls: [{ n: 7, t: "a call", who: "a", idle: 9, untouched: true, home: "engine/team" }],
  pairs: [],
  views: [{ id: "change", name: "Change", kind: "change", default: true, question: "?" }, { id: "calls", name: "Calls", kind: "calls", question: "?" }],
  view_order: { a: ["change", "calls"], b: ["calls", "change"] },
  toggles: [{ id: "live", name: "Live", what: "" }, { id: "time", name: "Time", what: "" }],
  surface: {
    a: { default_view: "change", top: [{ says: "1 call yours", at: ["o:two"], view: "calls", press: "Open #7", short: "1 call", why: "", act: { issue: 7 } },
      { says: "2 into B's", at: ["o:two"], view: "change", press: "Review", short: "2 into B's", why: "", count: { by: "a", under: "o:two" } }] },
    b: { default_view: "calls", top: [] }, c: { default_view: "change", top: [] },
  },
  room: { lines: [] },
};
