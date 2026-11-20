// Open a table for me (#1676, src/team/table-tools.ts): open_table is offered while Cowork stands on in this Sol's
// version and refused while it does not; it makes a table only on the person's own words this turn, with the name they
// gave, and says the code back. The table's making is handed in, so nothing reaches a cloud here.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-table-tools-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
process.env.SOL_VERSION = "concept";
after(() => { delete process.env.SOL_VERSION; rmSync(DIR, { recursive: true, force: true }); });

const TT = await import("../src/team/table-tools.ts");
const T = await import("../src/tools.ts");
const V = await import("../src/versions.ts");

const made: string[] = [];
const make = async (name: string) => { made.push(name); return { room: { id: "r1", name, code: "K7QD2M" } }; };
const txt = (r: { content: { type: string; text?: string }[] }) => String(r.content[0]?.text ?? "");

test("on in concept: offered, and made on the person's own words with the code said back", async () => {
  assert.ok(T.solToolsNow().some((t) => t.name === "open_table"));
  const r = await TT.runTableTool("open_table", { name: "sf trip", yes: "start a table for our trip" }, { said: "can you start a table for our trip, call it sf trip" }, make);
  assert.equal(r.isError, undefined);
  assert.deepEqual(made, ["sf trip"]);
  assert.match(txt(r), /K7QD2M/);
});

test("words not said this turn, or none at all: nothing is made", async () => {
  made.length = 0;
  const guess = await TT.runTableTool("open_table", { name: "sf trip", yes: "start a table" }, { said: "what is cowork for?" }, make);
  assert.equal(guess.isError, true);
  const none = await TT.runTableTool("open_table", { name: "sf trip", yes: "start a table" }, {}, make);
  assert.equal(none.isError, true);
  assert.deepEqual(made, []);
});

test("the cloud's refusal is said, not hidden", async () => {
  const r = await TT.runTableTool("open_table", { name: "sf trip", yes: "start a table" }, { said: "start a table" }, async () => ({ error: "sign in to Sol first" }));
  assert.equal(r.isError, true);
  assert.match(txt(r), /sign in to Sol first/);
});

test("on in product: Cowork's card stands at product (#1718), so a tester's Sol offers it too", () => {
  process.env.SOL_VERSION = "product";
  try {
    assert.equal(TT.coworkOn(), true);
    assert.ok(T.solToolsNow().some((t) => t.name === "open_table"));
  } finally { process.env.SOL_VERSION = "concept"; }
});

test("off where Cowork has not reached this version (its card short of product, on a tester's Sol): not offered, refused", async () => {
  const stages = V.STAGES as Record<string, string>, was = stages["view.cowork"];
  stages["view.cowork"] = "concept";
  process.env.SOL_VERSION = "product";
  try {
    assert.equal(TT.coworkOn(), false);
    assert.ok(!T.solToolsNow().some((t) => t.name === "open_table"));
    made.length = 0;
    const r = await TT.runTableTool("open_table", { name: "sf trip", yes: "start a table" }, { said: "start a table" }, make);
    assert.equal(r.isError, true);
    assert.deepEqual(made, []);
  } finally { process.env.SOL_VERSION = "concept"; stages["view.cowork"] = was; }
});
