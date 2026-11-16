// Cowork v3 slice 3 (fr-30 F5, F8, #556): roles and leaving. A guest sees no composer, no presses and no agent, and the
// engine refuses their writes (not only the face). Someone leaving: one card lists their places, the files on their
// machine and their agent key; after they go, the rest of the project keeps working.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as P from "../src/team/v3/people.ts";
import { nowLine, devFace } from "../src/team/v3/running.ts";

let t: ReturnType<typeof P.memoryTrail>;
const pid = "class4b";
beforeEach(() => {
  t = P.memoryTrail(); P.useTrail(t);
  P.peopleOf(pid, { owners: ["ines", "marco"], editors: ["sami"], by: "ines" });
  P.setRole(pid, { who: "ines" }, "jonas", "guest");
});

test("roles: owners (many), an editor and a guest; an agent beside each member but the guest", () => {
  const a = P.people(pid, "ines");
  assert.deepEqual(a.roles, { owner: ["ines", "marco"], editor: ["sami"], guest: ["jonas"] });
  assert.deepEqual(a.agents.sort(), ["ines", "marco", "sami"]);
  const all = a.groups.flatMap((g) => g.people);
  assert.equal(all.find((s) => s.who === "jonas")!.agent, null);
  assert.equal(all.find((s) => s.who === "sami")!.agent!.whose, "sami");
});

test("guest: no composer, no presses, and their agent is not offered", () => {
  const a = P.people(pid, "jonas");
  assert.equal(a.role, "guest");
  assert.deepEqual(a.can, { composer: false, presses: false, agent: false });
  assert.ok(!a.agents.includes("jonas"));
  assert.deepEqual(P.abilities("editor"), { composer: true, presses: true, agent: true });
});

test("guest: the engine refuses every write of theirs, and writes nothing", () => {
  const n = t.all.length;
  const g = { who: "jonas" };
  assert.ok("error" in P.moveChip(pid, g, "how", "workFacts"));
  assert.ok("error" in P.setLayer(pid, g, "me", "pings", "reds only"));
  assert.ok("error" in P.hand(pid, g, { id: "i1", title: "x" }, "ines"));
  assert.ok("error" in P.setRole(pid, g, "jonas", "owner"));
  assert.equal(P.window(pid, "jonas", "jonas").can.move, false);
  assert.equal(t.all.length, n);
});

test("guest: Running shows the line with no presses; the dev face carries none either", () => {
  const line = nowLine({ reds: [{ title: "Drive", whose: "ines", place: "drive", line: "sign-in expired" }], runs: [], rhythm: null, now: new Date(), role: "guest" });
  assert.equal(line.red[0].press, null);
  const dev = devFace({ repo: "sol-mif/sol-dev", me: "jonas", role: "guest", rhythm: { dev: ["jonas"] }, reviewOpen: "s1",
    prs: [{ repo: "sol-mif/sol-dev", number: 1, title: "a", draft: true, state: "open", author: "x", url: "u" }], waiting: [{ number: 2, title: "b" }], releases: [], people: [] });
  assert.ok(dev.drafts.every((c) => c.presses.length === 0));
  assert.ok(dev.reads.every((c) => c.presses.length === 0));
  assert.deepEqual(dev.night.presses, []);
  assert.equal(dev.reviewer, false);
});

test("guest: nobody hands a guest an item", () => {
  assert.ok("error" in P.hand(pid, { who: "ines" }, { id: "i1", title: "x" }, "jonas"));
});

test("layers: set at the lowest layer, inherited down, overridden below, pulled back with null", () => {
  P.setLayer(pid, { who: "ines" }, "team", "read", "for big changes");
  let row = P.layersOf(P.peopleOf(pid), "sami").find((r) => r.k === "read")!;
  assert.deepEqual([row.value, row.from], ["for big changes", "team"]);
  P.setLayer(pid, { who: "sami" }, "project", "read", "never");
  P.setLayer(pid, { who: "sami" }, "me", "read", "always");
  row = P.layersOf(P.peopleOf(pid), "sami").find((r) => r.k === "read")!;
  assert.deepEqual([row.team, row.project, row.me, row.value, row.from], ["for big changes", "never", "always", "always", "me"]);
  assert.equal(P.settingOf(P.peopleOf(pid), "ines", "read"), "never", "my own layer is mine alone");
  P.setLayer(pid, { who: "sami" }, "me", "read", null);
  assert.equal(P.settingOf(P.peopleOf(pid), "sami", "read"), "never");
  assert.ok("error" in P.setLayer(pid, { who: "sami" }, "team", "read", "never"), "the team default is an owner's");
  assert.ok("error" in P.setLayer(pid, { who: "ines", agent: true }, "me", "read", "never"), "never an agent's");
});

// the card of what leaving leaves behind is slice 7's (floor.ts leaves, v3-artifacts.test.ts); this slice keeps the press
// that lets someone go, and People draws that card with no presses for a guest
test("leaves: after they go, the rest of the project keeps working", () => {
  P.moveChip(pid, { who: "ines" }, "how", "workFacts");
  P.setLayer(pid, { who: "marco" }, "me", "pings", "reds only");
  assert.ok("ok" in P.leave(pid, { who: "sami" }, "sami"));
  const a = P.people(pid, "ines");
  assert.deepEqual(a.roles.editor, []);
  assert.deepEqual(a.roles.owner, ["ines", "marco"]);
  // their windows, layers and writes go on
  assert.equal(P.window(pid, "ines", "ines").rings.workFacts.some((c) => c.id === "how"), true);
  assert.equal(P.settingOf(P.peopleOf(pid), "marco", "pings"), "reds only");
  assert.ok("ok" in P.moveChip(pid, { who: "marco" }, "say", "workFacts"));
  assert.ok("ok" in P.handSend(P.hand(pid, { who: "ines" }, { id: "x", title: "t" }, "marco") as P.HandCard, { who: "ines" }));
  // and the one who left writes nothing more
  assert.ok("error" in P.moveChip(pid, { who: "sami" }, "say", "workFacts"));
  assert.equal(t.verify!(pid).ok, true);
});

test("leaves: the last owner cannot leave without naming another; only an owner lets someone else go", () => {
  P.setRole(pid, { who: "ines" }, "marco", "editor");
  assert.ok("error" in P.leave(pid, { who: "ines" }, "ines"));
  assert.ok("error" in P.leave(pid, { who: "sami" }, "marco"));
});
