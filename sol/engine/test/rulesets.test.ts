// sol/rulesets (#439): the rulesets in .github/rulesets against GitHub's. Runs the real script against a fake `gh` on
// PATH that answers from a state file and writes down every call, so a test sees exactly what would reach GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");

const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const st = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, "utf8"));
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(a) + "\\n");
if (a[0] !== "api") process.exit(1);
const i = a.indexOf("-X"); const method = i >= 0 ? a[i + 1] : "GET";
const path = a.filter((x, k) => k > 0 && x !== "-X" && a[k - 1] !== "-X" && x !== "--input" && a[k - 1] !== "--input")[0].split("?")[0];
if (method !== "GET") { const n = a.indexOf("--input"); fs.appendFileSync(process.env.FAKE_LOG, "BODY " + fs.readFileSync(a[n + 1], "utf8") + "\\n"); console.log(JSON.stringify({ id: 99 })); process.exit(0); }
if (!(path in st)) { console.error("gh: Not Found (HTTP 404)"); process.exit(1); }
console.log(JSON.stringify(st[path]));
`;

const R = "repos/o/r";
function fixture(state: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "sol-rulesets-test-"));
  mkdirSync(join(root, "sol"));
  copyFileSync(join(ROOT, "sol", "rulesets"), join(root, "sol", "rulesets"));
  cpSync(join(ROOT, ".github", "rulesets"), join(root, ".github", "rulesets"), { recursive: true });
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "gh"), FAKE_GH); chmodSync(join(root, "bin", "gh"), 0o755);
  writeFileSync(join(root, "state.json"), JSON.stringify(state));
  writeFileSync(join(root, "log"), "");
  return root;
}
function run(root: string, ...args: string[]) {
  const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, FAKE_STATE: join(root, "state.json"), FAKE_LOG: join(root, "log") };
  let code = 0, out = "";
  try { out = execFileSync("bash", [join(root, "sol", "rulesets"), "--repo", "o/r", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e: any) { code = e.status; out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const calls = readFileSync(join(root, "log"), "utf8").split("\n").filter(Boolean);
  return { code, out, writes: calls.filter((c) => c.startsWith("BODY ") || /"-X"/.test(c)) };
}
const file = (n: string) => JSON.parse(readFileSync(join(ROOT, ".github", "rulesets", n), "utf8"));
// GitHub's answer for a file: ids, its own defaults added, the order shuffled, as the API returns them
function asGitHub(n: string, id: number) {
  const f = file(n); delete f._why;
  return {
    ...f, id, source_type: "Repository", source: "o/r", node_id: "x", _links: {}, created_at: "t", current_user_can_bypass: "never",
    bypass_actors: f.bypass_actors.map((b: any) => ({ ...b, actor_id: b.actor_type === "DeployKey" ? null : b.actor_id })),
    rules: [...f.rules].reverse().map((r: any) => r.type === "pull_request" ? { ...r, parameters: { ...r.parameters, required_reviewers: [], automatic_copilot_code_review_enabled: false } } : r.type === "required_status_checks" ? { ...r, parameters: { ...r.parameters, required_status_checks: [...r.parameters.required_status_checks].reverse() } } : r),
  };
}
const CHECKS = ["engine tests and build", "face build", "the gate", "leak check", "apart"];
const ready = (extra: Record<string, unknown> = {}) => ({
  [`${R}/rulesets`]: [],
  [`${R}/commits/main/check-runs`]: { check_runs: CHECKS.slice(0, 2).map((name) => ({ name, conclusion: "success" })) },
  [`${R}/pulls`]: [{ number: 7, merged_at: "t", head: { sha: "abc" } }],
  [`${R}/commits/abc/check-runs`]: { check_runs: CHECKS.map((name) => ({ name, conclusion: "success" })) },
  [`${R}/keys`]: [{ id: 1, title: "sol release runner (nucbox)", read_only: false }],
  ...extra,
});

test("the files: main needs a PR and the five checks with no approvals and no bypass; dev, stable and the tags only by the deploy key", () => {
  const main = file("main.json");
  assert.deepEqual(main.bypass_actors, []);
  assert.equal(main.rules.find((r: any) => r.type === "pull_request").parameters.required_approving_review_count, 0);
  assert.deepEqual(main.rules.find((r: any) => r.type === "required_status_checks").parameters.required_status_checks.map((c: any) => c.context), CHECKS);
  for (const t of ["deletion", "non_fast_forward"]) assert.ok(main.rules.some((r: any) => r.type === t), t);
  for (const n of ["dev-and-stable.json", "release-tags.json"]) {
    const f = file(n);
    assert.deepEqual(f.bypass_actors, [{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }], n);
    assert.deepEqual(f.rules.map((r: any) => r.type).sort(), ["creation", "deletion", "non_fast_forward", "update"], n);
  }
  assert.deepEqual(file("dev-and-stable.json").conditions.ref_name.include, ["refs/heads/dev", "refs/heads/stable"]);
});

test("read-only by default: new ones are described, nothing is written", () => {
  const r = run(fixture(ready()));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /main \(main\.json\): new/);
  assert.match(r.out, /dev and stable \(dev-and-stable\.json\): new/);
  assert.match(r.out, /approvals needed: 0/);
  assert.match(r.out, /3 to change; nothing was changed/);
  assert.deepEqual(r.writes, []);
});

test("same as GitHub when GitHub's answer differs only by its own defaults and order; one there without a file is left alone", () => {
  const st = ready({
    [`${R}/rulesets`]: [{ id: 1, name: "main" }, { id: 2, name: "dev and stable" }, { id: 3, name: "release tags" }, { id: 4, name: "someone's" }],
    [`${R}/rulesets/1`]: asGitHub("main.json", 1), [`${R}/rulesets/2`]: asGitHub("dev-and-stable.json", 2), [`${R}/rulesets/3`]: asGitHub("release-tags.json", 3),
  });
  const r = run(fixture(st), "--apply");
  assert.equal(r.code, 0, r.out);
  assert.equal((r.out.match(/same as GitHub/g) ?? []).length, 3, r.out);
  assert.match(r.out, /someone's: on GitHub only .* left alone/);
  assert.match(r.out, /nothing to change/);
  assert.deepEqual(r.writes, []);
});

test("a difference is shown line by line, and --apply sends a PUT of the file without its notes", () => {
  const gh = asGitHub("main.json", 1);
  gh.rules = gh.rules.filter((x: any) => x.type !== "non_fast_forward");
  const root = fixture(ready({ [`${R}/rulesets`]: [{ id: 1, name: "main" }], [`${R}/rulesets/1`]: gh }));
  let r = run(root);
  assert.match(r.out, /main \(main\.json\): differs from GitHub's \(ruleset 1\)/);
  assert.match(r.out, /^\+\s+"type": "non_fast_forward"/m);
  assert.deepEqual(r.writes, []);
  r = run(root, "--apply");
  assert.equal(r.code, 0, r.out);
  assert.ok(r.writes.some((w) => w.includes('"PUT"') && w.includes("repos/o/r/rulesets/1")), r.writes.join("\n"));
  assert.ok(r.writes.filter((w) => w.includes('"POST"')).length === 2, "the two missing ones are made");
  const bodies = r.writes.filter((w) => w.startsWith("BODY ")).map((w) => JSON.parse(w.slice(5)));
  assert.ok(bodies.every((b) => !("_why" in b)));
  assert.ok(bodies.some((b) => b.name === "main" && b.rules.some((x: any) => x.type === "non_fast_forward")));
});

test("--apply is refused while a required check has not passed, or the runner has no key; --force goes through", () => {
  const st = ready({ [`${R}/commits/abc/check-runs`]: { check_runs: [] }, [`${R}/keys`]: [] });
  const root = fixture(st);
  let r = run(root, "--apply");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /"the gate" has not passed/);
  assert.doesNotMatch(r.out, /"face build" has not passed/);
  assert.match(r.out, /no deploy key that can write/);
  assert.deepEqual(r.writes, []);
  r = run(root, "--apply", "--force");
  assert.equal(r.code, 0, r.out);
  assert.equal(r.writes.filter((w) => w.includes('"POST"')).length, 3);
  assert.ok(existsSync(root));
});

test("--force alone and unknown options are refused before GitHub is asked", () => {
  const root = fixture(ready());
  for (const a of [["--force"], ["--nope"]]) {
    const r = run(root, ...a);
    assert.equal(r.code, 2, r.out);
    assert.equal(readFileSync(join(root, "log"), "utf8"), "");
  }
});
