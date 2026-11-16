// Cowork v3 (fr-30): the seams between the nine slices, on slice 0's real trail. One project id (a room's cloud code,
// else its id's slug) whatever slice writes; a crossing lands as an item that the Plan folds and Undo takes back; Talk's
// loose thing is in the Space; People's members are the members joining and the record read. Nothing leaves the machine.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-seams-"));
after(() => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_COWORK_V3 = "on";
const ME = "marcocyl04-ux";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({
  me: { login: ME, name: "Marco" },
  rooms: [
    { id: "lab", name: "Physics Lab", provider: "github", org: "sol-mif", repos: [] },
    { id: "study", name: "Study", provider: "cloud", code: "BKQ2CL", hub: "wss://cloud.matterfold.tech/relay" },
  ],
}));

const { Trail, Keys, fold } = await import("../src/team/v3/index.ts");
const { door } = await import("../src/team/v3/door.ts");
const { projectOf, projectFor, roomFor } = await import("../src/team/v3/project-id.ts");
const X = await import("../src/team/v3/crossing.ts");
const P = await import("../src/team/v3/plan.ts");
const People = await import("../src/team/v3/people.ts");
const F5 = await import("../src/team/v3/port5.ts");

const keys = new Keys(join(dir, "keys"));
const trail = new Trail({ file: ":memory:", keys });
const d = door({ trail, keys });

test("one project id: the cloud code, else the slug of the room id; the slices keep speaking room ids", () => {
  assert.equal(projectOf({ id: "study", code: "BKQ2CL" }), "BKQ2CL");
  assert.equal(projectOf({ id: "Physics Lab" }), "physics-lab");
  assert.equal(projectOf({ id: "lab" }), "lab");
  assert.equal(projectFor("study"), "BKQ2CL");
  assert.equal(projectFor("BKQ2CL"), "BKQ2CL", "a project id is itself");
  assert.equal(roomFor("BKQ2CL"), "study");
  const e = d.append({ project: "study", by: { person: ME }, kind: "loose", item: "l-1", value: { title: "notes", kind: "note" } });
  assert.equal(e.project, "study", "the door answers with the room id");
  assert.equal(trail.since("BKQ2CL", 0).length, 1, "the trail holds the project id");
  assert.ok(e.sig && e.by.machine === keys.machineName, "signed on this machine");
});

test("a crossing lands as an item the Plan folds and the record holds; Undo takes it back from both", async () => {
  const cross = X.crossingOf({ trail: X.doorTrail(async () => d) });
  const plan = P.doorTrail(async () => d);
  const p = cross.propose("s1", "lab sheet for Frank by Nov 5", { project: { id: "lab", name: "Physics Lab" }, people: [{ login: "franktsai2008-eng", name: "Frank Tsai" }], me: ME, today: "2026-11-01" })!;
  assert.equal(p.kind, "item");
  const sent = await cross.send(p, { who: ME });
  const again = await cross.send(p, { who: ME });
  assert.equal(again.event.id, sent.event.id, "Send pressed twice: one event (F4)");
  let rec = P.foldPlan(await plan.since(0));
  const it = rec.items.find((i) => i.project === "lab");
  assert.ok(it, JSON.stringify(rec));
  assert.equal(it!.whose, "franktsai2008-eng");
  assert.equal(it!.date, "2026-11-05");
  assert.equal(P.needsMe(rec, "franktsai2008-eng"), 1, "handed to Frank: in his one count");
  assert.deepEqual(trail.check("lab").bad, [], "each project's chain is whole on its own (one chain per writer per project)");
  assert.ok(fold(trail.check("lab").ok).items[it!.id], "slice 0's record holds it");
  assert.equal((await cross.landed("lab")).length, 1);
  const u = await cross.undo(sent.token, { who: ME });
  assert.ok(u.ok);
  rec = P.foldPlan(await plan.since(0));
  assert.equal(rec.items.filter((i) => i.project === "lab").length, 0, "Undo: gone from the Plan (E4)");
  assert.equal((await cross.landed("lab")).length, 0);
});

test("Talk's loose thing is in the Space; slice 2's own drop writes slice 0's kind", async () => {
  F5._setPort({ append: (x) => d.append(x), since: (pr, seq = 0) => d.since(pr, seq) });
  const port = await F5.portNow();
  port.append({ project: "study", by: { person: ME }, kind: "loose", item: "l-talk", value: { kind: "note", title: "from Talk", whose: ME, place: "record", from: "talk:general" } });
  const plan = P.doorTrail(async () => d);
  await plan.append({ project: "study", actor: { who: ME }, kind: "loose.dropped", item: "l-drop", where: "record", data: { kind: "link", title: "a link", place: "record", whose: ME } });
  const rec = P.foldPlan(await plan.since(0));
  assert.deepEqual(rec.loose.filter((l) => l.project === "study").map((l) => l.title).sort(), ["a link", "from Talk", "notes"]);
  assert.ok(trail.since("BKQ2CL", 0).every((e) => e.kind === "loose"), "on the trail, slice 0's kind");
  F5._setPort(null);
});

test("People's members are slice 0's members: joining sees them, People sees who joined", () => {
  People.useTrail(People.doorPort(d));
  People.peopleOf("lab", { owners: [ME], editors: [], by: ME });
  assert.equal(F5.roleOf(F5.recordOf(d.since("lab")), ME), "owner", "slice 5 reads slice 3's owner");
  d.append({ project: "lab", by: { person: ME }, kind: "member", item: "franktsai2008-eng", value: { role: "editor", in: true, letInBy: ME } });
  const ps = People.peopleOf("lab");
  assert.equal(ps.members.get("franktsai2008-eng")?.role, "editor", "slice 3 reads slice 5's join");
  People.setLayer("lab", { who: ME }, "team", "read", "for big changes");
  assert.equal(fold(trail.check("lab").ok).settings.team.read, "for big changes", "a layer is slice 0's setting");
  People.useTrail(null);
});
