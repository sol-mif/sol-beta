// A Sol tester never sees the system block (#1091): their checkout (the sol-beta export) has no sol/systems/records, so
// the compose tool does not name the kind and a compose of it is refused.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-systems-offer-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-systems-offer-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SYSTEMS_RECORDS = join(REPO, "no-registry-here");   // a tester's checkout

const S = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");
after(() => { S.disarmAll(); delete process.env.SOL_SYSTEMS_RECORDS; });

test("without the registry the compose tool names no system kind, and a compose of one is refused", () => {
  const compose = tools.WORK_TOOLS.find((t) => t.name === "compose")!;
  assert.doesNotMatch(compose.description, /system: json/);
  const kind = (compose.shape as { kind: { options: string[] } }).kind;
  assert.ok(kind.options.includes("card") && !kind.options.includes("system"));
  const who = { project: S.projectOf(REPO), sessionId: "sess-offer01", by: "tester's agent", cwd: REPO };
  assert.throws(() => S.compose(who, { kind: "system", title: "Systems", body: JSON.stringify({ area: "design" }) }), /needs the systems registry/);
});
