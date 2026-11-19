// What a renew ends (#1566, work/cut.ts): the runs with background work are written down just before the exit, and the
// next engine tells each of those sessions, once, what was ended. A temp state dir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-cut-"));
process.env.SOL_STATE = join(dir, "work.json");
const { recordCut, takeCut, cutLine, resumeCut } = await import("../src/work/cut.ts");

const run = (id: string, tasks: string[]) => ({ id, model: "claude-opus-5-5", effort: "high", mode: "auto", fast: false, tasks: tasks.map((description) => ({ description })) });

test("only runs with background work are written down; read once, then gone", () => {
  assert.equal(recordCut([run("a", []), run("b", ["Wait for face builder's done file on NucBox", ""])], 1000, dir), 1);
  const cut = takeCut(2000, dir);
  assert.deepEqual(cut, [{ sessionId: "b", model: "claude-opus-5-5", effort: "high", mode: "auto", fast: false, tasks: ["Wait for face builder's done file on NucBox", "a background task"], at: 1000 }]);
  assert.deepEqual(takeCut(2000, dir), [], "told once: the file is gone");
  assert.equal(recordCut([run("a", [])], 1000, dir), 0);
  assert.equal(existsSync(join(dir, "cut-by-renew.json")), false, "no background work: no file");
});

test("a record older than an hour is not acted on; a broken file is no record", () => {
  recordCut([run("old", ["a Monitor"])], 0, dir);
  assert.deepEqual(takeCut(61 * 60_000, dir), []);
  writeFileSync(join(dir, "cut-by-renew.json"), "{nope");
  assert.deepEqual(takeCut(0, dir), []);
});

test("the next engine says it to each session, signed by Sol, naming each task", async () => {
  recordCut([run("s1", ["Wait for CI on #1566"]), run("s2", ["Monitor the night run", "an Explore agent"])], Date.now(), dir);
  const said: [string, string][] = [];
  resumeCut(async (c, text) => { said.push([c.sessionId, text]); }, 5, dir);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(said.map(([id]) => id), ["s1", "s2"]);
  assert.match(said[1][1], /^<a word from Sol>\n/);
  assert.match(said[1][1], /- Monitor the night run\n- an Explore agent\n/);
  assert.match(said[1][1], /Start again whatever of it still matters/);
  assert.equal(cutLine({ sessionId: "x", model: "", effort: "", mode: "", fast: false, tasks: ["a\nb"], at: 0 }).includes("- a b\n"), true, "one line per task");
});

test("two renews within seconds: the unread record is kept beside the new one, never written over", () => {
  recordCut([run("s1", ["Wait for CI"])], 1000, dir);
  recordCut([run("s1", ["a Monitor"]), run("s2", ["an agent"])], 2000, dir);
  const cut = takeCut(3000, dir);
  assert.deepEqual(cut.map((c) => [c.sessionId, c.tasks]), [["s1", ["Wait for CI", "a Monitor"]], ["s2", ["an agent"]]]);
});
