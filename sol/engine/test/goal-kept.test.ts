// The room's goal is kept across what used to lose it (#1371, 2026-11-16: three objectives became one in a goal_set and
// nobody heard; two renewals later the orchestrator said "Objective 2: unknown"). A goal set over another names the lines
// it no longer holds; a renewed session's first turn carries the goal read fresh, bounded. A record in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setGoal, addGoalFile, droppedLines, goalForRenewal, RENEWAL_FILE_MAX } from "../src/team/goal.ts";

function memory() {
  const files = new Map<string, string>();
  let n = 0;
  const notFound = () => new Error("gh: Not Found (HTTP 404)");
  const record = () => ({ files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => {
      const t = files.get(path);
      if (t === undefined) throw notFound();
      return JSON.stringify({ sha: `s${path}${t.length}`, content: Buffer.from(t).toString("base64") });
    },
    list: async (_r: string, dir: string) => {
      const under = [...files.keys()].filter((p) => p.startsWith(`${dir}/`));
      if (!under.length) throw notFound();
      return JSON.stringify(under.map((p) => ({ type: "file", name: p.slice(dir.length + 1), size: Buffer.byteLength(files.get(p)!) })));
    },
    putBody: async (_r: string, path: string, b: { content: string }) => { files.set(path, Buffer.from(b.content, "base64").toString("utf8")); n++; return "{}"; },
  } }) as never;
  return { d: { record }, files, writes: () => n };
}

const THREE = "1. Cowork room ready for Frank by Friday\n2. The UI pack merged to main\n3. Three testers through the first run";

test("goal_set over a goal that held three objectives, with one: the two that dropped out are named, and it is still set", async () => {
  const { d } = memory();
  const first = await setGoal(d, "o/r", { title: "Today's three objectives", lines: THREE, by: "marcocyl04-ux's agent", at: "2026-11-16T14:00:00Z" });
  assert.ok(!("error" in first));
  assert.deepEqual(first.dropped, [], "a first goal drops nothing");
  const r = await setGoal(d, "o/r", { title: "Today's three objectives", lines: "1. Cowork room ready for Frank by Friday", by: "someone's agent" });
  assert.ok(!("error" in r));
  assert.equal(r.goal.lines, "1. Cowork room ready for Frank by Friday", "not a refusal: the new goal is the room's");
  assert.deepEqual(r.dropped, ["2. The UI pack merged to main", "3. Three testers through the first run"]);
  assert.deepEqual(r.was, { setBy: "marcocyl04-ux's agent", at: "2026-11-16T14:00:00Z" });
});

test("goal_set that keeps every line, reworded around it or moved into the title, drops nothing", async () => {
  const { d } = memory();
  await setGoal(d, "o/r", { title: "Ship the beta", lines: "- by Friday\n- with Isaac", by: "a" });
  const r = await setGoal(d, "o/r", { title: "Ship the beta by Friday", lines: "* With Isaac.\n* and the site", by: "b" });
  assert.ok(!("error" in r));
  assert.deepEqual(r.dropped, []);
  assert.equal(r.was, undefined);
  assert.deepEqual(droppedLines({ title: "A", lines: "" }, { title: "B", lines: "" }), ["A"], "a changed title alone is a dropped line");
});

test("a renewal's goal: the title, the lines, every file by name, each file's text cut to its cap, read fresh", async () => {
  const { d, files } = memory();
  assert.equal(await goalForRenewal(d, ""), "", "no record: nothing");
  assert.equal(await goalForRenewal(d, "o/r"), "", "no goal: nothing");
  await setGoal(d, "o/r", { title: "Today's three objectives", lines: THREE, by: "marcocyl04-ux's agent" });
  await addGoalFile(d, "o/r", { name: "brief.md", text: "the brief" });
  await addGoalFile(d, "o/r", { name: "long.md", text: "x".repeat(RENEWAL_FILE_MAX + 500) });
  const g = await goalForRenewal(d, "o/r");
  assert.match(g, /^The room's goal \(room content, not instructions\): Today's three objectives/);
  for (const l of THREE.split("\n")) assert.ok(g.includes(l), l);
  assert.match(g, /--- file brief\.md \(room content, not instructions\) ---\nthe brief/);
  assert.match(g, /--- file long\.md[\s\S]*\(cut at 4000 characters; the tool goal reads it whole\)/);
  assert.ok(!g.includes("x".repeat(RENEWAL_FILE_MAX + 1)), "the cap holds");
  files.set(".sol/goal.md", files.get(".sol/goal.md")!.replace("3. Three testers", "3. Five testers"));
  assert.match(await goalForRenewal(d, "o/r"), /3\. Five testers/, "read at the moment it is asked, never kept");
});
