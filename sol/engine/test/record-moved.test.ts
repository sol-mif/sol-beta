// #543: the project's night refused its first write. The room's record was named by the repository's old name
// (marcocyl04-ux/ecosystem, now sol-mif/sol-dev): GitHub answers a read by the old name, but a write with a 307 that gh
// does not follow ("gh: HTTP 307"), so the walk flashed "couldn't keep that". A write turned away so goes to the
// repository's name now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGithubRecord } from "../src/team/record.js";
import { onboarded } from "../src/team/onboard.js";

const OLD = "marcocyl04-ux/ecosystem", NOW = "sol-mif/sol-dev";
/** gh as GitHub answers a moved repository: reads follow the move, a PUT by the old name is a 307 */
function fakeGh() {
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const url = args.find((a) => a.startsWith("repos/")) ?? "";
    if (args.includes("PUT")) {
      if (url.startsWith(`repos/${OLD}/`)) throw Object.assign(new Error("gh: HTTP 307"), { full: "gh: HTTP 307" });
      return JSON.stringify({ content: { sha: "new" } });
    }
    if (url === `repos/${OLD}` && args.includes(".full_name")) return NOW + "\n";
    if (url === `repos/${OLD}` || url === `repos/${NOW}`) return "main\n";
    if (url.includes("/contents/")) throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { full: "gh: Not Found (HTTP 404)" });
    throw new Error("unexpected " + args.join(" "));
  };
  return { gh, calls };
}

test("a step of the walk written to a record named by its old name lands under its name now", async () => {
  const { gh, calls } = fakeGh();
  const rec = makeGithubRecord(gh, { input: (args) => gh(args) });
  const r = await onboarded.change({ record: () => rec }, OLD, { step: { by: "franktsai2008-eng", id: "night", how: "done", at: "2026-10-31T17:00:00.000Z" } });
  assert.ok(!("error" in r), JSON.stringify(r));
  const puts = calls.filter((a) => a.includes("PUT")).map((a) => a.find((x) => x.startsWith("repos/")));
  assert.deepEqual(puts, [`repos/${OLD}/contents/.sol/onboarded.json`, `repos/${NOW}/contents/.sol/onboarded.json`]);
});

test("the name now is asked once: the next write goes there at once", async () => {
  const { gh, calls } = fakeGh();
  const rec = makeGithubRecord(gh, { input: (args) => gh(args) });
  const w = { message: "m", branch: "main", content: "eA==" };
  await rec.files.putBody(OLD, "a.json", w);
  await rec.files.putBody(OLD, "b.json", w);
  assert.equal(calls.filter((a) => a.includes(".full_name")).length, 1);
  assert.equal(calls.filter((a) => a.includes("PUT") && a.some((x) => x.startsWith(`repos/${OLD}/`))).length, 1);
});

test("a write refused for another reason is not retried", async () => {
  const calls: string[][] = [];
  const rec = makeGithubRecord(async (args) => { calls.push(args); throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { full: "gh: Not Found (HTTP 404)" }); }, { input: async (args) => { calls.push(args); throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { full: "gh: Not Found (HTTP 404)" }); } });
  await assert.rejects(rec.files.putBody(OLD, "a.json", { message: "m", branch: "main", content: "eA==" }), /404/);
  assert.equal(calls.length, 1);
});
