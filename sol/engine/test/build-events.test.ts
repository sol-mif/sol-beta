// Build's sessions under sessions, counted (#1454, docs/analytics/tracking.md "build"): a sub session started, a session
// folded under an orchestration session or let loose, each by how, both sessions as salted hashes and never a title.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-build-events-"));
const REPO = join(dir, "repo"); mkdirSync(join(REPO, ".git"), { recursive: true });
writeFileSync(join(dir, "team.json"), JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_STATE = join(dir, "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_TEAM_OFFLINE = "1";

const T = await import("../src/track.ts");
const S = await import("../src/work/blocks.ts");
const C = await import("../src/work/children.ts");
const { mark, workState } = await import("../src/work/state.ts");
S.setStageBus(() => {});
S.setStageFinder(async () => ({ cwd: REPO, by: "tester's agent" }));

const now = new Date(2026, 10, 18, 9, 0, 0);
let home = "";
beforeEach(() => {
  home = mkdtempSync(join(dir, "track-"));
  T.setTrackHome(home, { version: "abc1234", now: () => now });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null });
});
const lines = () => (existsSync(T.dayFile(now)) ? readFileSync(T.dayFile(now), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []).filter((l) => l.name.startsWith("build."));

test("a sub session started, folded by hand or by the promote, and let loose: one event each, by how", async () => {
  mark("orch-b", { kind: "orchestration" });
  await C.started("orch-b", "kid-1");
  await C.moved("kid-2", "orch-b", undefined);
  await C.promoted("orch-b", ["kid-3"]);
  await C.moved("kid-2", null, "orch-b");
  await C.archived("kid-1");
  await C.demoted("orch-b", ["kid-3"]);
  assert.deepEqual(lines().map((l) => [l.name, l.props.how, l.mode]), [
    ["build.session.start", "start", "work"],
    ["build.session.fold", "hand", "work"],
    ["build.session.fold", "promote", "work"],
    ["build.session.unfold", "hand", "work"],
    ["build.session.unfold", "archived", "work"],
    ["build.session.unfold", "demote", "work"],
  ]);
  const [first] = lines();
  assert.deepEqual(first.props, { orch: T.hashOf("orch-b"), sess: T.hashOf("kid-1"), how: "start" });
  assert.doesNotMatch(readFileSync(T.dayFile(now), "utf8"), /orch-b|kid-1/, "the ids never as they are");
});

test("a normal session's start is no sub session, and a private session is never counted", async () => {
  assert.equal(await C.started("plain", "kid-4"), false);
  mark("orch-c", { kind: "orchestration" });
  T.setPrivate("kid-5", true);
  await C.started("orch-c", "kid-5");
  assert.deepEqual(lines(), []);
});
