// Cowork v3 (fr-30, gap 8 of #574): an automation made from Home crosses into the studio as an automation: the studio's
// own event (name, words, the flow drawn from them, owner, on, spend), so the Automations room lists it, owned and paid
// by its sender. Undo takes it back from the studio too.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-gap-auto-"));
after(() => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_COWORK_V3 = "on";
const ME = "marcocyl04-ux";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: ME, name: "Marco" }, rooms: [{ id: "lab", name: "Physics Lab", provider: "github", org: "sol-mif", repos: [] }] }));

const { Trail, Keys } = await import("../src/team/v3/index.ts");
const { door } = await import("../src/team/v3/door.ts");
const X = await import("../src/team/v3/crossing.ts");
const { studioOf } = await import("../src/team/v3/studio.ts");
const { fromV3 } = await import("../src/team/v3/studio-trail.ts");
const keys = new Keys(join(dir, "keys"));
const trail = new Trail({ file: ":memory:", keys });
const d = door({ trail, keys });

test("an automation sent from Home is in the studio as an automation; Undo takes it out", async () => {
  const cross = X.crossingOf({ trail: X.doorTrail(async () => d) });
  const studio = studioOf({ trail: fromV3(d) });
  const ctx = { project: { id: "lab", name: "Physics Lab" }, people: [], me: ME, today: "2026-11-01" };
  const p = cross.propose("s1", "every friday summarize what landed in Talk", ctx)!;
  assert.equal(p.kind, "automation");
  const sent = await cross.send(p, { who: ME });
  const list = studio.list("lab");
  assert.equal(list.length, 1, "the studio lists it");
  const au = list[0];
  assert.match(au.id, /^au-/);
  assert.equal(au.owner, ME);
  assert.equal(au.spend.who, ME, "paid by its sender");
  assert.equal(au.on, true);
  assert.ok(au.flow.length > 0, "its flow drawn from its words");
  assert.ok(au.name);
  assert.equal(trail.since("lab", 0).at(-1)?.kind, "automation", "on the trail, the studio's kind");
  assert.equal((await cross.landed("lab")).length, 1, "the crossing still reads it as landed");
  const u = await cross.undo(sent.token, { who: ME });
  assert.ok(u.ok);
  assert.equal(studio.list("lab").length, 0, "Undo: gone from the studio");
  assert.equal((await cross.landed("lab")).length, 0);
});
