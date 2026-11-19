// The gate (#481): eval.md read as CONTRACTS.md writes it, the baseline excusing what was already broken and nothing
// else, the lint's three checks, the evals run from a temp repo (Approved run, drafts listed, manual listed), and
// gateGreen as the hand-in card (#476) will call it. The build and the e2e paths are run by `bash sol/gate` itself.
// Fixtures that a lint rule looks for are written in pieces, so this file never trips the gate it tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEval, baselineIds, baselineAdded, baseOf, excusable, judge, lintFiles, sameNameTwice, gooFindings, GOO_LEGACY, layoutValues, lookValues, LOOK_FILES, gateGreen, resultPath, evalFiles, evalStep, ranNoTest, runGate, summary, slug, e2eCapMs, E2E_FLOOR_MS, E2E_FALLBACK_MS, RESULT_DIR, type GateResult, type Step } from "../src/team/gate.ts";

const EVAL = (status: string, body = "") => `# fr-12 · Open Sol: evals

Status: ${status}
<!-- Only the Sol developer's press changes the line above to "Status: Approved by <login> on YYYY-MM-DD".
     An agent never writes it (P5's "eval sealed" lock refuses it). -->

## Ways to use it
- [E1] a Sol user opens Sol and sees the composer · check: \`true\`
- [E2] the first message gets an answer · check: \`exit 3\`
${body}
## Ways it can fail
- [F1] the engine is down, Sol says so · check: manual (first-timer: Nell)
- [F2] a line with no check at all

## Must not break
- [N1] fr-03 the sidebar still lists sessions · check: \`test -d .\`

## Releases
- [R1] not a check · check: \`false\`
- dev-20261031 · 9/10 pass · F1 fails: one line · verifier: opus
`;

test("eval.md: the Status line decides; each [ID] of the three sections with its check, manual or none", () => {
  const d = parseEval(EVAL("draft"));
  assert.equal(d.approved, false);
  assert.equal(d.status, "draft");
  assert.deepEqual(d.lines.map((l) => [l.id, l.check, l.manual]), [
    ["E1", "true", false], ["E2", "exit 3", false], ["F1", null, true], ["F2", null, false], ["N1", "test -d .", false],
  ], "the Releases section is never read as checks");
  assert.equal(d.lines[0].what, "a Sol user opens Sol and sees the composer");
  assert.equal(parseEval(EVAL("Approved by marcocyl04-ux on 2026-10-31")).approved, true);
  // only the press's own line counts (a login and a day), never the bare word, and only as the file's FIRST Status line
  assert.equal(parseEval(EVAL("Approved")).approved, false, "the bare word is not the press's line");
  assert.equal(parseEval(EVAL("approved by marcocyl04-ux on 2026-10-31")).approved, false);
  assert.equal(parseEval(EVAL("Approved by marcocyl04-ux")).approved, false, "no day");
  assert.equal(parseEval(EVAL("not Approved")).approved, false);
  assert.equal(parseEval("# no status\n## Ways to use it\n- [E1] x · check: `true`\n").approved, false, "no Status line is a draft");
  assert.equal(parseEval(EVAL("draft") + "\nStatus: Approved by marcocyl04-ux on 2026-10-31\n").approved, false, "the press's line further down does not count");
  assert.equal(parseEval(EVAL("Approved by marcocyl04-ux on 2026-10-31 (and more)")).approved, false, "nothing else on the line");
  assert.deepEqual(d.bad, []);
  const off = parseEval("Status: draft\n\n## Ways to use it (2)\n- [E1] x · check: `true`\n## Must not break\n- [N-1] y · check: `true`\n- [N2] z · check: `true`\n");
  assert.deepEqual(off.lines.map((l) => l.id), ["N2"], "an almost-section is not read, nor an id that is not letters then digits");
  assert.deepEqual(off.bad, ['heading "## Ways to use it (2)"', 'line "- [N-1] y · check: `true`"']);
  const tick = parseEval(EVAL("draft", "- [E3] a check with a pipe · check: `grep -q a <<< 'a' | cat`\n"));
  assert.equal(tick.lines.find((l) => l.id === "E3")?.check, "grep -q a <<< 'a' | cat");
});

test("the baseline: ids in backticks at the start of a list line, nothing else", () => {
  const ids = baselineIds(["# Already broken", "", "Prose with `lint:x:y` inside is not a line.",
    "- `e2e:open-session` · the kept session does not open · see: `node sol/test/e2e/run.mjs --only open-session`",
    "* `eval:fr-03:N2` · the sidebar · see: `bash sol/gate --feature fr-03`", "- no id here", "- `notanid` · x",
    "```", "- `e2e:the-example` · a line's shape, shown in a fence · see: `x`", "```"].join("\n"));
  assert.deepEqual([...ids].sort(), ["e2e:open-session", "eval:fr-03:N2"]);
});

const step = (name: string, failed: string[] = []): Step => ({ name, ok: !failed.length, ms: 1, failed });

const OLD = "e2e:open-session:" + slug('timed out waiting for "an old answer kept by the stub" on screen');

test("judge: green only when every failure was already broken and excusable; a baseline item that passed is fixed", () => {
  const base = new Set([OLD, "eval:fr-03:N2"]);
  const old = judge([step("lint"), step("build"), step("e2e", [OLD]), step("evals")], base);
  assert.equal(old.green, true, "already broken does not block a change that did not cause it");
  assert.deepEqual(old.known, [OLD]);
  assert.equal(old.steps.find((s) => s.name === "e2e")?.ok, true);
  assert.deepEqual(old.steps.find((s) => s.name === "e2e")?.failed, [OLD], "still listed as failed");
  assert.deepEqual(old.fixed, ["eval:fr-03:N2"]);
  const fresh = judge([step("lint", ["lint:only-skip:sol/engine/test/a.test.ts"]), step("build"), step("e2e", [OLD]), step("evals")], base);
  assert.equal(fresh.green, false);
  assert.equal(fresh.steps.find((s) => s.name === "lint")?.ok, false);
  assert.deepEqual(judge([step("lint"), step("e2e")], base).fixed, [OLD], "a step that did not run fixes nothing");
  // the same path failing at another point is a new failure, not the listed one
  assert.equal(judge([step("e2e", ["e2e:open-session:" + slug("timed out waiting for the composer")])], base).green, false);
});

test("excusable: only one path's failure point or one eval line; never a lint finding, a build part or a whole kind", () => {
  for (const id of [OLD, "eval:fr-12:E1", "eval:fr-03:N2"]) assert.equal(excusable(id), true, id);
  for (const id of ["lint:private:sol/home/k", "lint:only-skip:sol/engine/test/a.test.ts", "lint:node-modules:sol/mac", "lint:baseline-added:eval:fr-12:E1",
    "build:face-typecheck", "build:engine-typecheck", "e2e:open-session", "e2e:did-not-run", "e2e:exit-code", "e2e:face-build-missing",
    "eval:fr-12:no-checks", "eval:fr-12:unreadable", "eval:fr-99:no-eval"]) assert.equal(excusable(id), false, id);
  const all = new Set(["lint:private:sol/home/k", "build:face-typecheck"]);
  assert.equal(judge([step("lint", ["lint:private:sol/home/k"]), step("build", ["build:face-typecheck"])], all).green, false, "listed, still red");
  assert.deepEqual(judge([step("lint"), step("build")], all).fixed, [], "never said to be fixed either");
});

test("the baseline a change may not add to: lines it adds are found, lines it removes are fine", () => {
  const head = "# Already broken\n```\n- `e2e:example:x` · shape\n```\n";
  const was = head + "- `eval:fr-03:N2` · old\n";
  assert.deepEqual(baselineAdded(was, head), [], "removing a line (it was fixed) is fine");
  assert.deepEqual(baselineAdded(was, was + "- `eval:fr-12:E1` · a probe\n"), ["eval:fr-12:E1"]);
  assert.deepEqual(baselineAdded("", head + "- `eval:fr-12:E1` · x\n"), ["eval:fr-12:E1"], "a base with no file lists nothing");
});

test("lint: a test left focused or switched off, committed node_modules, and nothing private in what Sol testers get", () => {
  const ONLY = "test" + ".only(", SKIP = "describe" + ".skip(", OPT = "{ sk" + "ip: true }";
  const MAIL = "someone@gm" + "ail.com", KEY = ["-----BEGIN", "OPENSSH PRIVATE", "KEY-----"].join(" ");
  const files: Record<string, string> = {
    "sol/engine/test/a.test.ts": `import { test } from "node:test";\n${ONLY}"x", () => {});\n`,
    "sol/mac/src/b.test.ts": `${SKIP}"x", () => {});\n`,
    "sol/engine/test/c.test.ts": `test("x", ${OPT}, () => {});\n`,
    "sol/engine/test/d.test.ts": `test("x", { skip: devOnly("sol/hub") }, () => {});\nshell.only("tab");\ntest("y", { sk` + `ip: !hasGit }, () => {});\n`,
    "sol/engine/test/e.test.ts": `test("x", {\n  timeout: 5,\n  sk` + `ip: "later",\n}, () => {});\n`,
    "sol/engine/test/f.test.ts": `test("x", (t) => { t` + `.skip(); });\n`,
    "sol/engine/test/g.test.ts": `test` + `.todo("x");\n`,
    "sol/engine/test/h.test.ts": `test("x", { to` + `do: true }, () => {});\n`,
    "sol/engine/test/i.test.ts": `test("x", { on` + `ly: 1 }, () => {});\n`,
    "sol/engine/test/j.test.ts": `describe("x", () => { it` + `.only("y", () => {}); });\n`,
    "sol/test/e2e/run.mjs": `it` + `.only("y")\n`,
    "sol/mac/src/Join.tsx": `shell.only(TAB); test` + `.only( // not a test file\n`,
    "sol/mac/node_modules/react/index.js": "x", "sol/mac/node_modules/react/package.json": "{}",
    "sol/engine/src/a.ts": `// write to ${MAIL}\n`,
    "docs/people/x.md": `${MAIL}\n`,
    "sol/home/k": `${KEY}\n`,
  };
  const kept = (f: string) => f.startsWith("sol/engine") || f.startsWith("sol/mac") || f.startsWith("sol/home");
  const offence = (f: string, b: Buffer) => (b.toString().includes("@gm" + "ail.com") ? `${f}:1: a personal address` : b.toString().includes("PRIVATE KEY") ? `${f}:1: a private key` : null);
  const found = lintFiles(Object.keys(files), (f) => Buffer.from(files[f]), kept, offence);
  assert.deepEqual(found.map((x) => x.id), [
    "lint:only-skip:sol/engine/test/a.test.ts", "lint:only-skip:sol/mac/src/b.test.ts", "lint:only-skip:sol/engine/test/c.test.ts",
    "lint:only-skip:sol/engine/test/e.test.ts", "lint:only-skip:sol/engine/test/f.test.ts", "lint:only-skip:sol/engine/test/g.test.ts",
    "lint:only-skip:sol/engine/test/h.test.ts", "lint:only-skip:sol/engine/test/i.test.ts", "lint:only-skip:sol/engine/test/j.test.ts",
    "lint:only-skip:sol/test/e2e/run.mjs", "lint:node-modules:sol/mac", "lint:private:sol/engine/src/a.ts", "lint:private:sol/home/k",
  ], "a skip with a reason computed at run time stays allowed; a non-test file's .only is not a test; docs are not exported");
  assert.match(found.find((x) => x.id.endsWith("e.test.ts"))!.line, /e\.test\.ts:3:/, "the multi-line option's own line");
  assert.match(found[0].line, /a\.test\.ts:2: a test left focused or switched off/);
  assert.match(found.find((x) => x.id === "lint:private:sol/home/k")!.line, /a private key \(in what Sol testers get\)/);
});

test("lint: same name twice (#641): two face or engine files a Mac's disk cannot tell apart are refused; a .css beside a .tsx is not", () => {
  const found = sameNameTwice([
    "sol/mac/src/home/Side.tsx", "sol/mac/src/home/side.ts",
    "sol/mac/src/home/Home.tsx", "sol/mac/src/home/home.css",
    "sol/engine/src/a/Foo.md", "sol/engine/src/a/foo.md",
    "sol/mac/src/home/sideRows.ts", "sol/mac/src/grab/frame.ts", "sol/mac/src/home/Frame.tsx",
    "docs/A.ts", "docs/a.ts",
  ]);
  assert.deepEqual(found.map((x) => x.id), ["lint:same-name:sol/mac/src/home/side.ts", "lint:same-name:sol/engine/src/a/foo.md"]);
  assert.match(found[0].line, /side\.ts: the same name as sol\/mac\/src\/home\/Side\.tsx/);
});

test("lint: the layout scale: a typed space, size, height or corner in the rebuilt face's css is refused, a variable is not", () => {
  const css = [
    "/* padding: 13px in a comment is fine */",
    ".a { padding: var(--s2) var(--s3); gap: var(--s2, 8px); border: 1px solid var(--hair); width: 264px; }",
    ".b { margin: 0 0 6px; }",
    ".c { font-size: 12.5px; line-height: 1; }",
    ".d { height: calc(100% - var(--h-row)); inset: 0; border-radius: var(--r-row); }",
    ".e { line-height: 1.4; }",
    ".f { top: 1px; left: -2px; }",
  ].join("\n");
  assert.deepEqual(layoutValues(css).map((x) => x.line), [3, 4, 6, 7], "the comment, a variable with a fallback, a hairline, a width and 0 are allowed");
  const found = lintFiles(["sol/mac/src/home/home.css", "sol/mac/src/face.css"], () => Buffer.from(css), () => false, () => null);
  assert.deepEqual(found.map((x) => x.id), ["lint:layout-value:sol/mac/src/home/home.css"], "only the rebuilt face's css, one finding per file");
  assert.match(found[0].line, /home\.css:3: a typed number where the scale goes \(margin: 0 0 6px\), and 3 more/);
});

test("lint: the material: a typed colour, shadow, duration or curve in the rebuilt face is refused, a token is not (#597)", () => {
  const css = [
    "/* color: #fff in a comment is fine */",
    ".a { color: var(--c-pearl); background: var(--sheen-pearl); box-shadow: var(--shadow-float); white-space: nowrap; }",
    ".b { background: #0a0a0b; }",
    ".c { box-shadow: 0 20px 60px var(--shade); }",
    ".d { box-shadow: inset 0 0 0 1px var(--hc-line); animation: in var(--d-turn) var(--e-arrive) forwards; }",
    ".e { transition: rotate 0.15s; }",
    ".f { animation: in var(--d-turn) ease-out; }",
    ".g { --hc-line: rgb(from var(--on) r g b / 0.10); --hc-pearl: var(--c-pearl); }",
    ".h { -webkit-mask: linear-gradient(#000 0 0) content-box; color: transparent; content: \"#fff 2s\"; }",
    ".i { border-color: white; }",
  ].join("\n");
  assert.deepEqual(lookValues(css).map((x) => x.line), [3, 4, 6, 7, 8, 10], "tokens, a hairline ring, a mask, transparent and a string are allowed");
  const tsx = [
    "// a comment: setTimeout(f, 160) and #fff",
    "const t = setTimeout(() => { go(); }, MOTION.turn);",
    "const u = setTimeout(() => {",
    "  go();",
    "}, 160);",
    "const s = { color: \"#e6e1d8\" };",
    "el.animate([], { duration: 200 });",
    "const link = \"https://x.dev/#top\"; const label = \"red\"; const n = list.slice(0, 400);",
    "const st = { transition: \"opacity 0.2s ease\" };",
    "setTimeout(f, 0);",
  ].join("\n");
  assert.deepEqual(lookValues(tsx, true).map((x) => x.line), [5, 6, 7, 9], "a token, a link, a word, a slice and a 0 delay are allowed");
  assert.ok(LOOK_FILES.test("sol/mac/src/home/Home.tsx") && LOOK_FILES.test("sol/mac/src/home/home.css") && !LOOK_FILES.test("sol/mac/src/face.css"));
  const found = lintFiles(["sol/mac/src/home/home.css", "sol/mac/src/face.css"], () => Buffer.from(css), () => false, () => null);
  assert.deepEqual(found.map((x) => x.id), ["lint:look-value:sol/mac/src/home/home.css"], "only the rebuilt face, one finding per file");
  assert.match(found[0].line, /home\.css:3: a typed colour, shadow, duration or curve where a token goes \(background: #0a0a0b\), and 5 more; values only from sol\/design\/system\/tokens\.json/);
});

const repo = () => mkdtempSync(join(tmpdir(), "sol-gate-"));
const put = (root: string, f: string, body: string) => { mkdirSync(join(root, f, ".."), { recursive: true }); writeFileSync(join(root, f), body); };

test("evals: an Approved eval's checks run from the repo root; a draft is listed, never run; manual is listed; --feature narrows", async () => {
  const root = repo();
  put(root, "specs/features/fr-12-open-sol/eval.md", EVAL("Approved by marcocyl04-ux on 2026-10-31"));
  // a draft whose check would write a file if it ran
  put(root, "specs/features/fr-03-sidebar/eval.md", "# fr-03\n\nStatus: draft\n\n## Ways to use it\n- [E1] x · check: `touch ran`\n");
  put(root, "specs/features/fr-07-notes/prd.md", "no eval yet\n");
  const said: string[] = [];
  const r = await evalStep(root, null, (s) => said.push(s));
  assert.deepEqual(r.evals, [
    { feature: "fr-12", id: "E1", ok: true }, { feature: "fr-12", id: "E2", ok: false }, { feature: "fr-12", id: "F2", ok: false }, { feature: "fr-12", id: "N1", ok: true },
  ]);
  assert.deepEqual(r.step.failed, ["eval:fr-12:E2", "eval:fr-12:F2"]);
  assert.deepEqual(r.drafts, ["fr-03"]);
  assert.deepEqual(r.manual, ["fr-12:F1"]);
  assert.ok(said.some((s) => /F2 has no check an agent can run/.test(s)));
  assert.equal(existsSync(join(root, "ran")), false, "a draft's check never runs");
  const one = await evalStep(root, "fr-03", () => {});
  assert.deepEqual([one.evals, one.drafts], [[], ["fr-03"]]);
  assert.deepEqual(evalFiles(root, "fr-99"), []);
  const none = await evalStep(root, "fr-99", () => {});
  assert.deepEqual(none.step.failed, ["eval:fr-99:no-eval"], "narrowed to a feature with no eval.md is red, never green");
  // the map, when it is there, decides the folder (specs/features.json, #480)
  put(root, "specs/features/fr-12-renamed/eval.md", EVAL("draft"));
  const feat = (id: string, slug: string, more = {}) => ({ id, slug, name: slug, type: "product", label: "base", paths: ["sol/mac/src/"], ...more });
  put(root, "specs/features.json", JSON.stringify({ version: 1, features: [feat("fr-12", "open-sol"), feat("fr-03", "sidebar-renamed", { paths: [] })] }));
  assert.deepEqual(evalFiles(root, "fr-12").map((e) => e.path.split("/").slice(-2)[0]), ["fr-12-open-sol"], "the map's folder, not every fr-12 folder");
  // an entry #480's reader would not count (no paths) is no feature: the folder's name decides, as with no map
  assert.deepEqual(evalFiles(root, "fr-03").map((e) => e.feature), ["fr-03"]);
});

const ALL = ["lint", "build", "e2e", "evals"].map((n) => step(n));
const result = (o: Partial<GateResult>): GateResult => ({ sha: "a".repeat(40), green: true, steps: ALL, evals: [], dirty: false, feature: null, at: "", known: [], fixed: [], drafts: [], manual: [], base: null, ...o });
const write = (root: string, r: GateResult) => { mkdirSync(join(root, RESULT_DIR), { recursive: true }); writeFileSync(resultPath(root, r.sha), JSON.stringify(r)); };

test("gateGreen(root, sha): the last result for that commit, green and on a clean tree; anything else is not green", () => {
  const root = repo(), A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
  assert.equal(gateGreen(root, A), false, "no result yet");
  write(root, result({ sha: A }));
  assert.equal(gateGreen(root, A), true);
  write(root, result({ sha: B, green: false }));
  assert.equal(gateGreen(root, B), false, "red");
  write(root, result({ sha: C, dirty: true }));
  assert.equal(gateGreen(root, C), false, "run with uncommitted changes: it is not that commit's");
  writeFileSync(resultPath(root, D), JSON.stringify(result({ sha: A })));
  assert.equal(gateGreen(root, D), false, "a file that names another commit");
  writeFileSync(resultPath(root, "e".repeat(40)), "{ not json");
  assert.equal(gateGreen(root, "e".repeat(40)), false);
  assert.equal(gateGreen(root, "../" + A), false, "only a commit id is read");
  const F = "f".repeat(40), G = "1".repeat(40);
  write(root, result({ sha: F, feature: "fr-12" }));
  assert.equal(gateGreen(root, F), false, "a run narrowed to one feature is never the commit's");
  write(root, result({ sha: G, steps: ALL.slice(0, 2) }));
  assert.equal(gateGreen(root, G), false, "a result without all four steps");
});

test("the summary: green or red in one line, what was already broken said apart, drafts and manual named", () => {
  const s = summary(result({ green: true, dirty: true, steps: [step("lint"), { ...step("e2e", ["e2e:open-session"]), ok: true }], known: ["e2e:open-session"], drafts: ["fr-03"], manual: ["fr-12:F1"], evals: [{ feature: "fr-12", id: "E1", ok: true }] }));
  assert.match(s, /^GREEN on aaaaaaaa \(with uncommitted changes/);
  assert.match(s, /e2e .*· 1 already broken/);
  assert.match(s, /1\/1 pass · not run \(draft\): fr-03 · manual \(the first-timer's\): fr-12:F1/);
  assert.match(s, /already broken before this change \(specs\/baseline\.md\), not counted: e2e:open-session/);
  assert.match(summary(result({ green: false, steps: [step("build", ["build:face-build"])] })), /^RED[^\n]*\n {2}RED {2}build \([^)]*\): build:face-build/);
});

test(".sol-gate/ stays on the Sol developer's machine: git ignores it and the beta export never keeps it", async () => {
  const { BETA_KEEP } = await import("../src/team/ship.ts");
  const p = `${RESULT_DIR}/${"a".repeat(40)}.json`;
  assert.equal(BETA_KEEP.some((k) => p === k || p.startsWith(k + "/")), false, "not on the beta list");
  const { execFileSync } = await import("node:child_process");
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  for (const f of [p, `${RESULT_DIR}/face/index.html`]) execFileSync("git", ["check-ignore", "-q", "--no-index", f], { cwd: top });   // throws when not ignored
});

test("an approved eval with nothing to run or list is red, and so is one with a line that cannot be read", async () => {
  const root = repo();
  const A = "Status: Approved by marcocyl04-ux on 2026-10-31\n\n";
  put(root, "specs/features/fr-20-empty/eval.md", A + "## Ways to use it\n\n(nothing yet)\n");
  put(root, "specs/features/fr-21-off/eval.md", A + "## Ways to use it (2)\n- [E1] x · check: `true`\n");
  put(root, "specs/features/fr-22-dash/eval.md", A + "## Ways to use it\n- [E-1] x · check: `true`\n- [E2] y · check: manual\n");
  const r = await evalStep(root, null, () => {});
  assert.deepEqual(r.step.failed, ["eval:fr-20:no-checks", "eval:fr-21:unreadable", "eval:fr-21:no-checks", "eval:fr-22:unreadable"]);
  assert.equal(r.step.ok, false);
});

test("an eval check that ran no test is red (#1540): a name pattern that matches nothing exits 0 but checks nothing", async () => {
  assert.equal(ranNoTest("✔ x (1ms)\nℹ tests 1\nℹ pass 1\n"), false);
  assert.equal(ranNoTest("ℹ tests 0\nℹ pass 0\n"), true);
  assert.equal(ranNoTest("1..0\n# tests 0\n# pass 0\n"), true);
  assert.equal(ranNoTest("ℹ tests 10\n"), false, "ten is not zero");
  assert.equal(ranNoTest("✔ test/x.test.ts (40ms)\nℹ tests 1\nℹ pass 1\n"), true, "the file counted as its own one test");
  assert.equal(ranNoTest("✔ the one asked for (1ms)\nℹ tests 1\n✔ test/x.test.ts (40ms)\nℹ tests 1\n"), true, "one run of two ran nothing");
  const root = repo();
  put(root, "t.test.mjs", 'import { test } from "node:test";\ntest("a cowork session is in its fold", () => {});\n');
  // the gate's own test runner hands its children NODE_TEST_CONTEXT; a real gate run has none
  const run = (pattern: string) => `env -u NODE_TEST_CONTEXT "${process.execPath}" --test --test-name-pattern '${pattern}' t.test.mjs`;
  put(root, "specs/features/fr-30-folds/eval.md", `Status: Approved by marcocyl04-ux on 2026-11-18\n\n## Ways to use it\n- [E1] named right · check: \`${run("a cowork session is in its fold")}\`\n- [E2] named wrong · check: \`${run("no test has this name")}\`\n`);
  const said: string[] = [];
  const r = await evalStep(root, null, (s) => said.push(s));
  assert.deepEqual(r.evals, [{ feature: "fr-30", id: "E1", ok: true }, { feature: "fr-30", id: "E2", ok: false }]);
  assert.deepEqual(r.step.failed, ["eval:fr-30:E2"]);
  assert.ok(said.includes("    the check ran no test"));
});

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } }).trim();
const gitRepo = () => {
  const root = repo();
  sh(root, "init", "-q", "-b", "main");
  put(root, "specs/baseline.md", "# Already broken\n");
  put(root, ".gitignore", ".sol-gate/\n");
  sh(root, "add", "-A"); sh(root, "commit", "-qm", "main");
  sh(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return { root, main: sh(root, "rev-parse", "HEAD") };
};

test("baseOf: SOL_GATE_BASE when set, else where the commit leaves main; never the tree", () => {
  const { root, main } = gitRepo();
  put(root, "x", "1"); sh(root, "add", "x"); sh(root, "commit", "-qm", "work");
  assert.equal(baseOf(root, {}), main);
  assert.equal(baseOf(root, { SOL_GATE_BASE: "HEAD" }), sh(root, "rev-parse", "HEAD"));
  assert.equal(baseOf(root, { SOL_GATE_BASE: "no-such-ref" }), null);
  sh(root, "update-ref", "-d", "refs/remotes/origin/main");
  assert.equal(baseOf(root, {}), null, "no main known: no base (and so nothing is excused)");
});

// a whole run in a throwaway repo: no packages there, so the build and the paths fail fast, which is enough to see what
// is written and what the baseline excuses
test("runGate: a PR's own baseline line excuses nothing and is red; a run narrowed to a feature writes no result", async () => {
  const { root } = gitRepo();
  const id = "eval:fr-12:E1";
  put(root, "specs/features/fr-12-open-sol/eval.md", "Status: Approved by marcocyl04-ux on 2026-10-31\n\n## Ways to use it\n- [E1] x · check: `false`\n");
  put(root, "specs/baseline.md", `# Already broken\n- \`${id}\` · a probe\n`);
  sh(root, "add", "-A"); sh(root, "commit", "-qm", "a change that lists its own red");
  const sha = sh(root, "rev-parse", "HEAD");
  const said: string[] = [];
  const r = await runGate(root, { say: (s) => said.push(s) });
  assert.equal(r.green, false);
  assert.ok(r.steps.find((s) => s.name === "lint")!.failed.includes(`lint:baseline-added:${id}`));
  assert.ok(r.steps.find((s) => s.name === "evals")!.failed.includes(id));
  assert.deepEqual(r.known, [], "the change's own line is not read: the baseline comes from main");
  assert.equal(r.dirty, false);
  assert.equal(r.feature, null);
  assert.ok(existsSync(resultPath(root, sha)));
  const before = readFileSync(resultPath(root, sha), "utf8");
  const narrowed = await runGate(root, { feature: "fr-99", say: () => {} });
  assert.equal(narrowed.green, false, "a feature with no eval.md is red");
  assert.equal(readFileSync(resultPath(root, sha), "utf8"), before, "a narrowed run never replaces the commit's result");
  assert.ok(said.some((s) => /baseline: specs\/baseline\.md as of/.test(s)));
});

test("the old goo kit: refused outside the legacy list, words in comments and strings let through, the list only shrinks", () => {
  const goo = "creature/" + "goo", J = "JO" + "BS";
  const src: Record<string, string> = {
    "sol/mac/src/kit/New.tsx": `import { Droplet } from "../${goo}";\n`,
    "sol/mac/src/kit/Deep.tsx": `const x = 1;\nimport("../../src/${goo}.tsx");\n`,
    "sol/mac/src/kit/Word.tsx": `const a = 1;\nconst b = ${J}.brand;\n`,
    "sol/mac/src/kit/Said.tsx": `// ${J} and Bands were the old kit\nconst s = "budPath";\n`,
    "sol/mac/src/kit/Other.tsx": `import { Body } from "../firstrun/goo";\n`,
    "sol/mac/src/Old.tsx": `import { Bands } from "./${goo}";\n`,
    "sol/mac/src/Clean.tsx": `export const ok = 1;\n`,
  };
  const read = (f: string) => (src[f] == null ? null : Buffer.from(src[f]));
  const ids = gooFindings(Object.keys(src), read, ["sol/mac/src/Old.tsx", "sol/mac/src/Clean.tsx", "sol/mac/src/Gone.tsx"]).map((x) => x.id).sort();
  assert.deepEqual(ids, [
    "lint:goo-legacy-gone:sol/mac/src/Clean.tsx",
    "lint:goo-legacy-gone:sol/mac/src/Gone.tsx",
    "lint:goo:sol/mac/src/kit/Deep.tsx",
    "lint:goo:sol/mac/src/kit/New.tsx",
    "lint:goo:sol/mac/src/kit/Word.tsx",
  ]);
  assert.ok(GOO_LEGACY.includes("sol/mac/src/creature/goo.tsx"), "the old kit itself is on the list");
});

test("the e2e cap grows with the suite: 15 s a path, never under 15 minutes, 25 minutes when the count is unknown (#1583)", () => {
  assert.equal(e2eCapMs(10), E2E_FLOOR_MS);
  assert.equal(e2eCapMs(60), E2E_FLOOR_MS);
  assert.equal(e2eCapMs(107), 1_605_000);   // the suite that ran 1064 s on nucbox and hit the old flat 900 s
  assert.ok(e2eCapMs(107) > 1064_000 * 1.5);
  assert.equal(e2eCapMs(null), E2E_FALLBACK_MS);
  assert.equal(e2eCapMs(0), E2E_FALLBACK_MS);
  // run.mjs counts its paths without a browser, and the count is what the gate caps by
  const run = join(import.meta.dirname, "../../test/e2e/run.mjs");
  const all = JSON.parse(execFileSync(process.execPath, [run, "--count"], { encoding: "utf8" }).trim()).count;
  assert.ok(Number.isInteger(all) && all > 50, `run.mjs --count said ${all}`);
  assert.equal(JSON.parse(execFileSync(process.execPath, [run, "--count", "--only", "open-sol"], { encoding: "utf8" }).trim()).count, 1);
});
