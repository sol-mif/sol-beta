// Cowork v3 from a socket that is not Sol's own window (#1074): it reads, and writes nothing as me. index.ts sets
// fromSol from the socket on every team.v3.* message; team/wire.ts refuses a write without it. Every team.v3.* case the
// engine answers is read from its sources here and named a read or a write, so a new case or a typo shows up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const READS = [
  "team.v3.since", "team.v3.record", "team.v3.migrate.dry", "team.v3.on", "team.v3.cross.landed", "team.v3.front", "team.v3.needsme",
  "team.v3.places.read", "team.v3.places.reach", "team.v3.places.letin",
  "team.v3.talk.threads", "team.v3.talk.thread", "team.v3.talk.asks", "team.v3.setup.open", "team.v3.setup.answer", "team.v3.join.waiting", "team.v3.join.arrival",
  "team.v3.studio.list", "team.v3.studio.parse", "team.v3.studio.log",
  "team.v3.artifacts.list", "team.v3.artifacts.get", "team.v3.artifacts.export", "team.v3.search.query",
  "team.v3.way.read",
];

async function wire() {
  const d = mkdtempSync(join(tmpdir(), "sol-v3-from-window-"));
  writeFileSync(join(d, "team.json"), JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" } }));
  Object.assign(process.env, { SOL_TEAM_FILE: join(d, "team.json"), SOL_TEAM: join(d, "team.json"), SOL_STATE: join(d, "state", "work.json"), SOL_TEAM_OFFLINE: "1", SOL_COWORK_V3: "off" });
  return { W: await import("../src/team/wire.ts"), done: () => rmSync(d, { recursive: true, force: true }) };
}

test("every team.v3.* case the engine answers is a read or a write, and only the reads pass without the window", async () => {
  const { W, done } = await wire();
  const dir = join(SRC, "team", "v3");
  const cases = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts")))
    for (const x of readFileSync(join(dir, f), "utf8").matchAll(/(?:case|===) "(team\.v3\.[a-z.]+)"/g)) cases.add(x[1]);
  for (const r of READS) assert.ok(cases.has(r), `${r} is a case the engine answers`);
  for (const type of cases) {
    if (type === "team.v3.plan") continue;   // by op, below
    assert.equal(W.v3Reads({ type }), READS.includes(type), type);
  }
  for (const type of ["team.v3.append", "team.v3.people", "team.v3.window", "team.v3.running", "team.v3.floor.get", "team.v3.migrate.run", "team.v3.cross.send", "team.v3.places.grant", "team.v3.talk.say", "team.v3.join.letin", "team.v3.floor.key", "team.v3.floor.paired", "team.v3.studio.run", "team.v3.way.press", "team.v3.way.preview", "team.v3.way.propose", "team.v3.way.agree", "team.v3.way.apply", "team.v3.way.revert", "team.v3.nope"])
    assert.equal(W.v3Reads({ type }), false, `${type} writes`);
  done();
});

test("plan reads without an op and writes with one; people, window and running are the window's with or without", async () => {
  const { W, done } = await wire();
  for (const op of [undefined, "", "read"]) assert.equal(W.v3Reads({ type: "team.v3.plan", op }), true, `plan ${op}`);
  for (const op of ["drop", "toItem", "move", "undo", null]) assert.equal(W.v3Reads({ type: "team.v3.plan", op }), false, `plan ${op}`);
  // a first look seeds the project's members, signed as me (people.ts peopleOf): not a read
  for (const [type, op] of [["team.v3.people", undefined], ["team.v3.window", undefined], ["team.v3.running", undefined], ["team.v3.people", "role"], ["team.v3.people", "hand.send"], ["team.v3.window", "move"], ["team.v3.running", "review"]])
    assert.equal(W.v3Reads({ type, op }), false, `${type} ${op}`);
  done();
});

test("the gate is in the code: index.ts sets fromSol on every team.v3.* message, wire.ts refuses a write without it", () => {
  const index = readFileSync(join(SRC, "index.ts"), "utf8");
  assert.match(index, /if \([^\n]*msg\.type\.startsWith\("team\.v3\."\)\) \(msg as any\)\.fromSol = fromApp;/);   // one condition with the other window-only families (#1102)
  const wire = readFileSync(join(SRC, "team", "wire.ts"), "utf8");
  assert.match(wire, /if \(m\.fromSol !== true && !v3Reads\(m\)\) return w\.send\(\{ type: "team\.error", rid, message: "only Sol's own window" \}\);/);
});

test("with the switch on, a write without the window is refused before any v3 module answers it", async () => {
  const { W, done } = await wire();
  const got: any[] = [];
  const face = { send: (m: object) => got.push(m) };
  W.addTeamFace(face);
  process.env.SOL_COWORK_V3 = "on";
  for (const type of ["team.v3.append", "team.v3.cross.send", "team.v3.places.grant", "team.v3.migrate.run"])
    await W.handleTeam(face, { type, rid: type, project: "sol", kind: "member.role", item: "x", value: "owner" });
  await W.handleTeam(face, { type: "team.v3.people", op: "role", rid: "role", who: "x", role: "owner" });
  assert.deepEqual(got.map((m) => [m.type, m.rid, m.message]), [
    ...["team.v3.append", "team.v3.cross.send", "team.v3.places.grant", "team.v3.migrate.run"].map((t) => ["team.error", t, "only Sol's own window"]),
    ["team.error", "role", "only Sol's own window"],
  ]);
  W.removeTeamFace(face);
  process.env.SOL_COWORK_V3 = "off";
  done();
});
