// Agents (#1327), the calm pass tidied after a first try in a real window (2026-11-17), on made-up homes only:
//   a shelf that holds a blocked agent opens with the blocked ones first and at most seven cards, the rest "N more";
//   a change written before changes had a cause reads with its cause (so it groups, one line per cause) and names the
//   agent, never a rule id; and that cause is what the first open's intro reads, so its pauses are said with one undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Agents } from "../src/agent/index.ts";
import { changeRead, ensure, list, loadAgents, saveAgents, type Change } from "../src/agent/agents.ts";
import { shelvesOf } from "../src/agent/meta/asks.ts";
import { CAST } from "../src/agent/meta/numbers.ts";
import { make, NOW, type Spec } from "./agents-fixtures.ts";

const policy = (...rules: string[]) => `# policy\n\n${rules.map((r) => `- ${r}\n`).join("")}`;

test("a shelf with a blocked agent: the blocked ones first, at most seven cards standing", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `g${i}`);
  const agents = [...ids.map((id) => ({ id, part: "garden" })), ...["k0", "k1"].map((id) => ({ id, part: "kitchen" }))];
  const s = shelvesOf(agents, new Set(["g4", "g9"]))!;
  const garden = s.find((x) => x.part === "garden")!;
  assert.deepEqual(garden.agents.slice(0, 2), ["g4", "g9"], "blocked first");
  assert.equal(garden.agents.length, 11, "every agent stays on its shelf");
  assert.equal(garden.open, true);
  assert.equal(garden.shown, CAST, "at most seven stand; the rest are N more");
  const kitchen = s.find((x) => x.part === "kitchen")!;
  assert.deepEqual([kitchen.open, kitchen.shown], [false, 2]);
  // more blocked than seven: every blocked one stands
  const many = shelvesOf(agents, new Set(ids.slice(0, 9)))!.find((x) => x.part === "garden")!;
  assert.equal(many.shown, 9);
});

const old = (kind: Change["kind"], line: string, rule = "clock-3"): Change =>
  ({ id: `c-${kind}-${rule}`, at: new Date(NOW - 3_600_000).toISOString(), kind, agent: "a1", line, rules: [{ folder: "yard", rule }], undo: { unhold: [{ folder: "yard", rule }] }, undone: false });

test("a change written before causes: its cause from what it says, the agent named, never the rule id", () => {
  const cases: [Change, string, string | undefined][] = [
    [old("held", "Pond Log: web-2 stopped at the Tide site sign-in 3 times in a row; Sol holds it until you sign in.", "web-2"), "Pond Log stopped at the Tide site sign-in 3 times in a row; Sol holds it until you sign in.", "sign-in"],
    [old("rested", "Leaf Count: clock-3 made nothing in its last 7 runs over 7 days; Sol rests it for 7 days."), "Leaf Count made nothing in its last 7 runs over 7 days; Sol rests it for 7 days.", "idle"],
    [old("woke", "Leaf Count: clock-3's rest is over; it runs on its clock again."), "Leaf Count's rest is over; it runs on its clock again.", "idle"],
    [old("woke", "Pond Log: web-2 got through, so Sol let it run again.", "web-2"), "Pond Log got through, so Sol let it run again.", "through"],
    [old("woke", "Pond Log: signed in to Tide site, so web-2 runs again.", "web-2"), "Pond Log runs again: you signed in to Tide site.", "through"],
    // the person's own presses keep no cause: one line each
    [old("rested", "Leaf Count rests until you wake it."), "Leaf Count rests until you wake it.", undefined],
    [old("trust", "Leaf Count: how far, looks → drafts."), "Leaf Count: how far, looks → drafts.", undefined],
  ];
  for (const [c, line, cause] of cases) {
    const r = changeRead(c);
    assert.equal(r.line, line);
    assert.equal(r.cause, cause, c.line);
  }
  // a cause already written is kept as it is
  assert.equal(changeRead({ ...cases[0][0], cause: "idle" }).cause, "idle");
});

test("an agents.json from before causes: its pauses group by cause, and the first open's intro says them", () => {
  const spec: Spec = {
    "yard/policy.md": policy("[watch] web: every hour from 08:00 to 18:00 the tide table into tides.md", "[watch] clock: 07:00 the bird count into birds.md"),
    "shed/policy.md": policy("[watch] web: every hour from 08:00 to 18:00 the seed shop's stock into seeds.md"),
    "yard/tides.md": "# tides", "yard/birds.md": "# birds", "shed/seeds.md": "# seeds",
  };
  const home = make(spec);
  const a = new Agents({ home, now: () => NOW, ask: async () => null });
  ensure(a);
  const f = loadAgents(home)!;
  assert.equal(f.met, undefined, "not visited yet");
  // what an older keeper wrote: two pauses at sign-ins, no cause, the rule id in the line
  f.held.push({ folder: "yard", rule: "web-1", why: "stuck", site: "Tide site", since: new Date(NOW - 3_600_000).toISOString(), until: "signed-in" },
    { folder: "shed", rule: "web-1", why: "stuck", site: "Seed shop", since: new Date(NOW - 3_600_000).toISOString(), until: "signed-in" });
  const at = new Date(NOW - 3_600_000).toISOString();
  f.changes.push(
    { id: "c-old-1", at, kind: "held", agent: "", line: "Yard: web-1 stopped at the Tide site sign-in 3 times in a row; Sol holds it until you sign in.", rules: [{ folder: "yard", rule: "web-1" }], undo: { unhold: [{ folder: "yard", rule: "web-1" }] }, undone: false },
    { id: "c-old-2", at, kind: "held", agent: "", line: "Shed: web-1 stopped at the Seed shop sign-in 3 times in a row; Sol holds it until you sign in.", rules: [{ folder: "shed", rule: "web-1" }], undo: { unhold: [{ folder: "shed", rule: "web-1" }] }, undone: false });
  saveAgents(home, f);
  const l = list(a);
  assert.deepEqual(l.intro?.ids.sort(), ["c-old-1", "c-old-2"], "the intro reads the pauses an older keeper made");
  assert.deepEqual(l.intro?.sites.sort(), ["Seed shop", "Tide site"]);
  const held = l.changes.filter((c: Change) => c.kind === "held");
  assert.ok(held.every((c: Change) => c.cause === "sign-in"), "one cause: the face draws them as one line");
  assert.ok(held.every((c: Change) => !/web-1/.test(c.line)), "no rule id in what the person reads");
});
