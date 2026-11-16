// Cowork v3 (fr-30, gap 4 of #574): the leaving card lists the automations the person owns in the studio, each with
// one press to hand it over (whose it is and who pays move together) and one to switch it off. Nothing changes until
// a press; the studio reads the same events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3gl-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3gl-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3gl-home-");
process.env.SOL_COWORK_V3 = "off";

const F = await import("../src/team/v3/floor.ts");
const { standIn } = await import("../src/team/v3/trailport.ts");
const me = { person: "marcocyl04-ux", machine: "macbook" };
const frank = { person: "franktsai2008-eng", machine: "frank-mac" };
const seeded = () => {
  let t = 1_000_000;
  const p = standIn({ machine: "macbook", now: () => (t += 1000) });
  p.append({ project: "sol", by: me, kind: "member", item: "marcocyl04-ux", value: { role: "owner" } });
  p.append({ project: "sol", by: frank, kind: "member", item: "franktsai2008-eng", value: { role: "editor" } });
  p.append({ project: "sol", by: frank, kind: "automation", item: "au-friday", value: { what: "made it", name: "Friday summary", words: "every Friday, sum up the week",
    flow: { when: "every Friday", does: [] }, owner: "franktsai2008-eng", on: true, spend: { who: "franktsai2008-eng", limit: 2 } } });
  p.append({ project: "sol", by: frank, kind: "automation", item: "au-old", value: { what: "made it", name: "Old one", owner: "franktsai2008-eng", on: false, spend: { who: "franktsai2008-eng", limit: 2 } } });
  p.append({ project: "sol", by: me, kind: "automation", item: "au-mine", value: { what: "made it", name: "Mine", owner: "marcocyl04-ux", on: true, spend: { who: "marcocyl04-ux", limit: 2 } } });
  return p;
};

test("his automations that are on are on his leaving card, with hand-over and switch-off", () => {
  const p = seeded();
  const card = F.leaves(p.record("sol"), p.events("sol"), "franktsai2008-eng", "marcocyl04-ux");
  const au = card.lines.filter((l) => l.kind === "automation");
  assert.deepEqual(au.map((l) => l.id), ["au-friday"], "his, and on; not the one already off, not mine");
  assert.equal(au[0].title, "Friday summary");
  assert.equal(au[0].press, "Hand to you");
  assert.deepEqual(au[0].alt, { act: "off", press: "Switch off" });
  assert.match(au[0].line, /subscription/);
});

test("hand it over: one event, the owner and the payer move together; switch off: one event, it stops", () => {
  const p = seeded();
  const n = p.events("sol").length;
  F.pressLeave(p, "sol", me, "franktsai2008-eng", { act: "hand", kind: "automation", id: "au-friday" });
  assert.equal(p.events("sol").length, n + 1);
  const after = F.automationsOf(p.events("sol")).find((a) => a.id === "au-friday")!;
  assert.equal(after.owner, "marcocyl04-ux");
  assert.equal(after.payer, "marcocyl04-ux");
  assert.equal(after.on, true);
  assert.equal(F.leaves(p.record("sol"), p.events("sol"), "franktsai2008-eng", "marcocyl04-ux").lines.filter((l) => l.kind === "automation").length, 0);
  const q = seeded();
  F.pressLeave(q, "sol", me, "franktsai2008-eng", { act: "off", kind: "automation", id: "au-friday" });
  const off = F.automationsOf(q.events("sol")).find((a) => a.id === "au-friday")!;
  assert.equal(off.on, false);
  assert.equal(off.owner, "franktsai2008-eng", "switching off hands nothing over");
  assert.throws(() => F.pressLeave(q, "sol", me, "franktsai2008-eng", { act: "hand", kind: "automation", id: "au-mine" }), /owns that one/);
});
