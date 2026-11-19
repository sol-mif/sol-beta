// state.ts beside #896 and #897 (the two cases as filed are n10-state-corrupt-overwritten and n10-state-write-fails-crashes):
// what is put aside and what is not, and that a write which failed is made by the next change. state.ts reads
// SOL_STATE once, when it loads, so each case runs in a process of its own.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "work-state-kept-"));
after(() => rmSync(ROOT, { recursive: true, force: true }));
const dir = (name: string) => { const d = join(ROOT, name); mkdirSync(d); return d; };
const wait = "const wait = (ms) => new Promise((r) => setTimeout(r, ms));";
/** run a script against a state.ts of its own: what it printed, and what state.ts said (its lines go to stderr, so
 *  a tool that prints its answer on stdout stays clean) */
function run(file: string, script: string) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `${wait}\nconst S = await import("./src/work/state.ts");\n${script}`], {
    cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", timeout: 30_000, env: { ...process.env, SOL_STATE: file },
  });
  assert.equal(r.status, 0, `the process ended with ${r.status}: ${r.stderr.slice(-400)}`);
  assert.ok(!/^work:/m.test(r.stdout), `a line of state.ts on stdout: ${r.stdout}`);
  return [...r.stdout.split("\n"), ...r.stderr.split("\n")].filter(Boolean);
}
const said = (out: string[], re: RegExp) => out.filter((l) => re.test(l));

test("no file yet: nothing is put aside, nothing is said, and the folder holds work.json alone", () => {
  const D = dir("none"), F = join(D, "work.json");
  const out = run(F, `S.mark("s1", { pinned: true }); await wait(300);`);
  assert.deepEqual(readdirSync(D), ["work.json"]);
  assert.deepEqual(JSON.parse(readFileSync(F, "utf8")).marks, { s1: { pinned: true } });
  assert.deepEqual(said(out, /^work:/), []);
});

test("a work.json that reads is left as it is: nothing aside, its marks kept beside the new one", () => {
  const D = dir("good"), F = join(D, "work.json");
  writeFileSync(F, JSON.stringify({ marks: { a: { pinned: true } }, groups: [{ id: "g1", name: "launch", at: 1 }] }));
  const out = run(F, `S.mark("c", { done: true }); await wait(300);`);
  assert.deepEqual(readdirSync(D), ["work.json"]);
  const v = JSON.parse(readFileSync(F, "utf8"));
  assert.deepEqual(v.marks, { a: { pinned: true }, c: { done: true } });
  assert.equal(v.groups[0].name, "launch");
  assert.deepEqual(said(out, /^work:/), []);
});

for (const [name, text] of [["torn", '{ "marks": { "a": { "pinned": tr'], ["a list", '[{ "launch": 1 }]'], ["empty", ""]] as const) {
  test(`a work.json that is ${name} is put aside whole, under a name of its own, and one line says so`, () => {
    const D = dir(`bad-${name.replace(/\W/g, "")}`), F = join(D, "work.json");
    writeFileSync(F, text);
    const out = run(F, `S.mark("c", { done: true }); S.mark("d", { done: true }); await wait(300);`);
    const aside = readdirSync(D).filter((f) => f !== "work.json");
    assert.equal(aside.length, 1, `one file aside, got ${JSON.stringify(readdirSync(D))}`);
    assert.match(aside[0], /^work\.bad-[\dTZ-]+\.json$/);
    assert.equal(readFileSync(join(D, aside[0]), "utf8"), text, "the file aside is the unreadable one, byte for byte");
    assert.deepEqual(JSON.parse(readFileSync(F, "utf8")).marks, { c: { done: true }, d: { done: true } });
    const lines = said(out, /^work:/);
    assert.equal(lines.length, 1, lines.join(" | "));
    assert.ok(lines[0].includes(aside[0]), lines[0]);
    assert.ok(!lines[0].includes("launch") && !lines[0].includes("pinned"), "the line does not quote the file");
  });
}

test("a write that failed is made by the next change, with every mark since; a run of failures says one line", () => {
  const D = dir("retry"), F = join(D, "sub", "work.json");
  writeFileSync(join(D, "sub"), "");   // a file where the folder should be: the write cannot happen
  const out = run(F, `
    const { rmSync } = await import("node:fs");
    S.mark("s1", { pinned: true }); await wait(300);
    S.mark("s2", { pinned: true }); await wait(300);
    console.log("in memory:", Object.keys(S.workState().marks).join(","));
    rmSync(${JSON.stringify(join(D, "sub"))});   // room on the disk again
    S.mark("s3", { pinned: true }); await wait(300);`);
  assert.deepEqual(said(out, /^in memory:/), ["in memory: s1,s2"]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(F, "utf8")).marks), ["s1", "s2", "s3"]);
  assert.deepEqual(readdirSync(join(D, "sub")), ["work.json"], "no temp file left");
  assert.equal(said(out, /^work: .*was not written/).length, 1, out.join(" | "));
  assert.equal(said(out, /^work: .*is written again/).length, 1, out.join(" | "));
});

test("a write that fails after the temp file is written leaves no temp file behind", () => {
  const D = dir("torn-write"), F = join(D, "work.json");
  const out = run(F, `
    const { mkdirSync, readdirSync, rmSync, writeFileSync } = await import("node:fs");
    S.workState();                                   // read while there is no file: nothing to put aside
    mkdirSync(${JSON.stringify(F)}); writeFileSync(${JSON.stringify(join(F, "x"))}, "");   // the temp file is written, the rename over a full folder is not
    S.mark("s1", { pinned: true }); await wait(300);
    console.log("after:", JSON.stringify(readdirSync(${JSON.stringify(D)})));
    rmSync(${JSON.stringify(F)}, { recursive: true });
    S.mark("s2", { pinned: true }); await wait(300);`);
  assert.deepEqual(said(out, /^after:/), ['after: ["work.json"]'], out.join(" | "));
  assert.equal(said(out, /^work: .*was not written/).length, 1, out.join(" | "));
  assert.deepEqual(readdirSync(D), ["work.json"]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(F, "utf8")).marks), ["s1", "s2"]);
});

test("an unreadable work.json that cannot be put aside is not written over; once it can be, it is kept and the marks are written", { skip: process.getuid?.() === 0 && "root writes anywhere" }, () => {
  const D = dir("held"), F = join(D, "work.json"), text = '{ "groups": [{ "name": "launch",, }] }';
  writeFileSync(F, text);
  chmodSync(D, 0o555);   // the folder takes no rename and no new file
  let out: string[] = [];
  try {
    out = run(F, `
      const { chmodSync, readFileSync, readdirSync } = await import("node:fs");
      S.mark("s1", { pinned: true }); await wait(300);
      console.log("held:", JSON.stringify(readdirSync(${JSON.stringify(D)})), readFileSync(${JSON.stringify(F)}, "utf8") === ${JSON.stringify(text)});
      chmodSync(${JSON.stringify(D)}, 0o755);
      S.mark("s2", { pinned: true }); await wait(300);`);
  } finally { chmodSync(D, 0o755); }
  assert.deepEqual(said(out, /^held:/), ['held: ["work.json"] true']);
  assert.equal(said(out, /^work: .*could not be put aside/).length, 1, out.join(" | "));
  const aside = readdirSync(D).filter((f) => f !== "work.json");
  assert.equal(aside.length, 1);
  assert.equal(readFileSync(join(D, aside[0]), "utf8"), text);
  assert.ok(said(out, /^work: .*kept aside as/).some((l) => l.includes(aside[0])), out.join(" | "));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(F, "utf8")).marks), ["s1", "s2"]);
});
