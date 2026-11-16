// Core pins (#892): changing.ts and machine.ts. changing promises: every real edit, mutate or undo in Sol's own files is
// told to the windows as it starts and ends (nothing invented, nothing outside sol/ told), a result is matched to its call
// once, a turn's end closes what it left open; a part that broke with no recent edit behind it is left alone, and one that
// mends in time takes nothing back. machine promises: the keep-awake hold only when asked, a banner only on macOS, and
// the output styles read (never written) from ~/.claude/output-styles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const H = mkdtempSync(join(tmpdir(), "sol-core-chg-"));
Object.assign(process.env, { HOME: H, SOL_STATE: join(H, "work.json") });
const { Changing, lastSentence, resultText } = await import("../src/changing.ts");
const M = await import("../src/work/machine.ts");

function sol() {
  const root = mkdtempSync(join(tmpdir(), "sol-core-chg-sol-"));
  const s = join(root, "sol");
  mkdirSync(join(s, "mac", "src"), { recursive: true }); mkdirSync(join(s, "home"), { recursive: true });
  writeFileSync(join(s, "mac", "src", "A.tsx"), "a\n");
  const told: any[] = [];
  return { s, told, c: new Changing(join(s, "home"), (m) => told.push(m)) };
}

test("an edit in the face is told at its start and its end, once; a result with no call, or twice, tells nothing more", async () => {
  const { s, told, c } = sol();
  c.tool("work", "s1", "t1", "Edit", { file_path: join(s, "mac", "src", "A.tsx") }, s, "I'll fix the sidebar. Now the header:");
  assert.deepEqual(told.map((m) => [m.kind, m.file, m.line, m.done]), [["edit", "mac/src/A.tsx", "Now the header:", false]]);
  await c.result("t1", true); await c.result("t1", true); await c.result("never-called", false);
  assert.deepEqual(told.map((m) => [m.kind, m.done, m.ok]), [["edit", false, undefined], ["edit", true, true]]);
});

test("nothing outside sol/, no path, and other tools are never told", () => {
  const { s, told, c } = sol();
  c.tool("work", "s1", "t1", "Edit", { file_path: "/etc/hosts" }, s);
  c.tool("work", "s1", "t2", "Write", {}, s);
  c.tool("work", "s1", "t3", "Read", { file_path: join(s, "mac", "src", "A.tsx") }, s);
  c.tool("work", "s1", "t4", "Bash", { command: "ls; ../mutate x" }, s);
  c.tool("work", "s1", "t5", "Bash", { command: "/usr/bin/mutate x" }, s);
  c.tool("work", "s1", "t6", "Edit", null, s);
  assert.deepEqual(told, []);
});

test("a mutate is told with its words; its end with no commit to read says not ok", async () => {
  const { s, told, c } = sol();
  c.tool("work", "s1", "m1", "Bash", { command: `${join(s, "mutate")} "the header, bolder"` }, s);
  assert.deepEqual([told[0].kind, told[0].line], ["mutate", "the header, bolder"]);
  await c.result("m1", true, "no hash here");
  assert.deepEqual([told[1].kind, told[1].done, told[1].ok], ["mutate", true, false]);
});

test("a turn's end closes its own open steps only, and says so once", async () => {
  const { s, told, c } = sol();
  c.tool("work", "s1", "t1", "Edit", { file_path: join(s, "design", "x.md") }, s);
  c.tool("work", "s2", "t2", "Edit", { file_path: join(s, "design", "y.md") }, s);
  c.turn("work", "s1");
  await c.result("t1", true);   // its result after the turn ended: nothing
  await c.result("t2", true);   // the other session's still ends
  assert.deepEqual(told.filter((m) => m.done).map((m) => [m.kind, m.sessionId]), [["turn", "s1"], ["edit", "s2"]]);
});

test("a part that breaks with no recent edit is left alone; one that mends takes nothing back; broke twice is one wait", async () => {
  const { s, told, c } = sol();
  c.broke("sidebar", "TypeError");
  c.mended("sidebar");
  c.tool("work", "s1", "t1", "Edit", { file_path: join(s, "mac", "src", "A.tsx") }, s);
  told.length = 0;
  c.broke("sidebar", "TypeError"); c.broke("sidebar", "again");
  c.mended("sidebar");
  c.broke("", "no site");
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(told, []);
});

test("lastSentence and resultText take any shape", () => {
  assert.equal(lastSentence(""), "");
  assert.equal(lastSentence("One. Two!\nThree:"), "Three:");
  assert.equal(lastSentence("x".repeat(300)).length, 90);
  assert.equal(resultText(undefined), "");
  assert.equal(resultText([{ text: "a" }, { nope: 1 }, null, { text: "b" }]), "a\n\n\nb");
});

test("machine: no hold while the pref is off; a banner is macOS only; output styles read by name, a file with none by its file name", async () => {
  M.keepAwake(true);
  assert.equal(M.awake(), false, "the awake pref is off by default");
  M.keepAwake(false);
  if (process.platform !== "darwin") assert.equal(await M.banner("t", "b"), false);
  assert.deepEqual(M.styles().custom, [], "no folder yet: none");
  const dir = join(H, ".claude", "output-styles"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "terse.md"), "---\nname: Terse and plain\n---\nbody");
  writeFileSync(join(dir, "loose.md"), "no front matter");
  writeFileSync(join(dir, "notes.txt"), "not a style");
  assert.deepEqual(M.styles().custom.sort(), ["Terse and plain", "loose"]);
  assert.deepEqual(M.styles().builtIn, ["Explanatory", "Learning"]);
});
