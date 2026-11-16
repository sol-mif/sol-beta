// The morning run (#485, dev cycle step 6): team/morning.ts. git, GitHub, the gate and the first-timer are stand-ins:
// no network, no model, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as M from "../src/team/morning.ts";
import type { Report } from "../src/team/firsttimer.ts";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "sol-morning-"));
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "features.json"), JSON.stringify({ version: 1, features: [
    { id: "fr-01", name: "Open Sol", slug: "open-sol", paths: ["sol/mac/src/app.ts", "sol/engine/**"] },
    { id: "fr-02", name: "First message", slug: "first-message", paths: ["sol/engine/src/talk*.ts"] },
  ] }));
  return root;
}
const A = "a".repeat(40), B = "b".repeat(40);
const TAGS = `dev-20261031\t\t${A}\ndev-20261030\t\t${B}\n`;
type Call = string[];

const GREEN: M.Gate = { here: true, green: true, failed: [], evalsFailed: [] };
function deps(root: string, o: { gate?: M.Gate; gateHere?: boolean; head?: string; digest?: { number: number; title: string }[]; dry?: boolean } = {}) {
  const calls: Call[] = [], said: string[] = [], ft: string[][] = [];
  const d: M.MorningDeps = {
    root, now: () => new Date("2026-10-31T13:30:00Z"), dryRun: !!o.dry, say: (l) => said.push(l),
    git: async (args) => {
      calls.push(["git", ...args]);
      if (args[0] === "for-each-ref") return { code: 0, out: TAGS };
      if (args[0] === "rev-parse") return { code: 0, out: `${o.head ?? A}\n` };
      if (args[0] === "diff") return { code: 0, out: "sol/engine/src/talk.ts\nsol/engine/src/index.ts\nsol/engine/src/talkx.ts\nREADME.md\n" };
      return { code: 0, out: "" };
    },
    gh: async (args) => {
      calls.push(["gh", ...args]);
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify(o.digest ?? [{ number: 7, title: "Night digest" }]);
      return "";
    },
    gate: async () => o.gate ?? GREEN,
    gateHere: () => o.gateHere ?? true,
    firstTimer: async (features) => {
      ft.push(features);
      return {
        sha: A, at: "x", url: "u", findings: 2, skipped: ["fr-01 has no \"Ways to use it\" yet (its eval.md)"],
        runs: [{ feature: "fr-02", name: "First message", persona: "parent", ways: ["E1", "E2"], tried: [{ way: "E1", result: "ok", line: "fine" }, { way: "E2", result: "stuck", line: "where is it" }],
          findings: [{ way: "E2", what: "Marco's secret plan" }, { way: "E1", what: "slow" }], summary: "lost at first", ok: true }],
      } as Report & { skipped: string[] };
    },
  };
  return { d, calls, said, ft };
}

test("the calendar: the release hour + 30 minutes, in the rhythm's zone, past midnight when it must", () => {
  assert.equal(M.morningCalendar({ release: "09:00", zone: "America/New_York" }), "*-*-* 09:30:00 America/New_York");
  assert.equal(M.morningCalendar({ release: "23:45", zone: "" }), "*-*-* 00:15:00");
});

test("the gate's answer: green only with exit 0 and green true; failed steps and evals kept, words cleaned", () => {
  const out = 'lint ok\n{"sha":"x","green":true,"steps":[{"name":"lint","ok":true,"ms":1,"failed":[]}],"evals":[]}';
  assert.deepEqual(M.gateOf(0, out), { here: true, green: true, failed: [], evalsFailed: [] });
  assert.equal((M.gateOf(1, out) as any).green, false, "a non-zero exit is never green");
  const red = M.gateOf(1, JSON.stringify({ green: false, steps: [{ name: "e2e<script>", ok: false }], evals: [{ feature: "fr-02", id: "E3", ok: false }, { feature: "bad", id: "E1", ok: false }] }));
  assert.deepEqual(red, { here: true, green: false, failed: ["e2escript"], evalsFailed: [{ feature: "fr-02", id: "E3" }] });
  assert.match((M.gateOf(2, "boom") as any).error, /no result \(exit 2\)/);
});

test("the touched features: each file to the feature that claims it most closely, the rest counted", () => {
  const t = M.touched([
    { id: "fr-01", name: "Open Sol", paths: ["sol/engine/**"] } as any,
    { id: "fr-02", name: "First message", paths: ["sol/engine/src/talk*.ts"] } as any,
  ], ["sol/engine/src/talk.ts", "sol/engine/src/talkx.ts", "sol/engine/src/index.ts", "README.md"]);
  assert.deepEqual(t, { features: [{ id: "fr-01", name: "Open Sol", files: 1 }, { id: "fr-02", name: "First message", files: 2 }], unmapped: 1 });
});

test("a morning: the newest release since the one before, the gate, the first-timer over what it touched, one comment with counts only", async () => {
  const root = repo();
  const { d, calls, ft } = deps(root);
  const r = await M.morning(d, { repo: "sol-mif/sol-dev" });
  assert.ok("ok" in r && r.ok);
  const m = (r as any).morning as M.Morning;
  assert.equal(m.tag, "dev-20261031");
  assert.equal(m.prev, "dev-20261030");
  assert.ok(calls.some((c) => c.join(" ") === `git diff --name-only ${B}..${A}`));
  assert.deepEqual(ft, [["fr-01", "fr-02"]]);
  assert.equal(m.unmapped, 1);
  assert.equal(m.firstTimer?.findings, 2);
  assert.equal(m.firstTimer?.stuck, 1);
  assert.equal((r as any).posted, 7);
  const comment = calls.find((c) => c[0] === "gh" && c[2] === "comment")!;
  const body = comment[comment.indexOf("--body") + 1];
  assert.match(body, /^\*\*Morning run\*\*, dev-20261031: gate green · first-timer 1 run, 2 findings, stuck 1 time · 2 features touched/);
  assert.match(body, /\| fr-02 First message \| 2 \| 1 run, 2 findings, 1 stuck \| none \|/);
  assert.doesNotMatch(body, /secret|lost at first|slow|parent/, "never the first-timer's words or persona on GitHub");
  const md = readFileSync(M.morningFile(root, "dev-20261031", "md"), "utf8");
  assert.match(md, /found \(E2\): Marco's secret plan/, "the words stay in the summary on the machine");
  assert.ok(existsSync(M.morningFile(root, "dev-20261031", "json")));
  // once a release: the second run says so and runs nothing
  const again = deps(root);
  const r2 = await M.morning(again.d, { repo: "sol-mif/sol-dev" });
  assert.equal((r2 as any).already, true);
  assert.equal(again.ft.length, 0);
  assert.ok(!again.calls.some((c) => c[2] === "comment"));
});

test("a dry run posts and keeps nothing; a checkout off the release is said; no digest is no post; a bad tag refused", async () => {
  const root = repo();
  const dry = deps(root, { dry: true, head: "c".repeat(40), gate: { here: true, green: true, failed: [], evalsFailed: [] } });
  const r = await M.morning(dry.d, { repo: "sol-mif/sol-dev" });
  assert.ok(!dry.calls.some((c) => c[2] === "comment"));
  assert.ok(!existsSync(M.morningFile(root, "dev-20261031", "json")));
  assert.match((r as any).morning.note, /not at the release/);
  assert.ok(dry.said.some((l) => l.startsWith("morning: would post on #7")));
  const none = deps(root, { digest: [] });
  await M.morning(none.d, { repo: "sol-mif/sol-dev" });
  assert.ok(none.said.some((l) => l.includes('no open "Night digest" issue')));
  assert.ok(!none.calls.some((c) => c[2] === "comment"));
  assert.match((await M.morning(deps(root).d, { repo: "sol-mif/sol-dev", tag: "stable" }) as any).error, /not a dev release/);
  const older = deps(root);
  const r3 = await M.morning(older.d, { repo: "sol-mif/sol-dev", tag: "dev-20261030" });
  assert.equal((r3 as any).morning.prev, "", "the oldest release has none before it");
});

test("no gate here (#481 not in yet): the run stops with one clear line, before it tries, keeps or posts anything", async () => {
  const root = repo();
  for (const o of [{ gateHere: false }, { gate: { here: false } as M.Gate }]) {
    const { d, calls, ft } = deps(root, o);
    const r = await M.morning(d, { repo: "sol-mif/sol-dev" });
    assert.equal((r as any).error, M.NO_GATE);
    assert.match(M.NO_GATE, /#481/);
    assert.ok(!calls.some((c) => c[0] === "gh"), "nothing asked of or posted to GitHub");
    assert.equal(ft.length, 0, "the first-timer did not run");
    assert.ok(!existsSync(M.morningFile(root, "dev-20261031", "json")), "nothing kept");
  }
  const red = deps(root, { gate: { here: true, green: false, failed: ["e2e"], evalsFailed: [{ feature: "fr-02", id: "E3" }] } });
  const r = await M.morning(red.d, { repo: "sol-mif/sol-dev" });
  assert.match(commentBody(red.calls), /gate red \(e2e\), 1 eval failing/);
  assert.ok("ok" in r);
});
const commentBody = (calls: string[][]) => { const c = calls.find((x) => x[0] === "gh" && x[2] === "comment")!; return c[c.indexOf("--body") + 1]; };

test("reading it back: the newest Morning run comment, its gate and findings", () => {
  const seen = M.morningOf([
    { body: "**Night digest**, 2026-10-30", createdAt: "2026-10-30T01:00:00Z" },
    { body: "**Morning run**, dev-20261030: gate red (e2e) · first-timer 2 runs, 0 findings · 1 feature touched\n\n| x |", createdAt: "2026-10-30T13:30:00Z", url: "https://github.com/sol-mif/sol-dev/issues/7#c1" },
    { body: "**Morning run**, dev-20261031: gate green · first-timer 1 run, 3 findings · 2 features touched", createdAt: "2026-10-31T13:30:00Z", url: "javascript:x", author: { login: "sol-release-runner" } },
  ]);
  assert.deepEqual(seen, { head: "Morning run, dev-20261031: gate green · first-timer 1 run, 3 findings · 2 features touched", tag: "dev-20261031", at: "2026-10-31T13:30:00Z", by: "sol-release-runner", green: true, findings: 3 });
  assert.equal(M.morningOf([{ body: "**Morning run**, dev-20261031: gate not here yet (#481) · first-timer: nothing to try · 0 features touched" }])?.green, null);
  assert.equal(M.morningOf([]), null);
});

test("the runner and its timer are written, never run: the hour from the rhythm, the unit filled by hand", () => {
  const sol = join(import.meta.dirname, "..", "..");
  const script = readFileSync(join(sol, "morning"), "utf8");
  assert.match(script, /--install-timer/);
  assert.match(script, /never run by an agent/);
  const timer = readFileSync(join(sol, "engine", "systemd", "user", "sol-morning.timer"), "utf8");
  assert.match(timer, /^OnCalendar=@CALENDAR@$/m);
  assert.match(timer, /^Persistent=true$/m);
  const service = readFileSync(join(sol, "engine", "systemd", "user", "sol-morning.service"), "utf8");
  assert.match(service, /^ExecStart=\/usr\/bin\/env bash @ROOT@\/sol\/morning$/m);
});

test("the seal (#485): a morning whose first-timer changed specs/features/ posts nothing and says which file", async () => {
  const root = repo();
  mkdirSync(join(root, "specs", "features", "fr-02-first-message"), { recursive: true });
  const evalFile = join(root, "specs", "features", "fr-02-first-message", "eval.md");
  writeFileSync(evalFile, "## Ways to use it\n");
  const { d, calls } = deps(root);
  const inner = d.firstTimer;
  d.firstTimer = async (f) => { writeFileSync(evalFile, Buffer.from("KipTdGF0dXM6KiogQXBwcm92ZWQK", "base64")); return inner(f); };
  const r = await M.morning(d, { repo: "sol-mif/sol-dev" });
  assert.match((r as any).error, /changed specs\/features\/fr-02-first-message\/eval\.md: the features' files are sealed, so nothing was posted/);
  assert.ok(!calls.some((c) => c[0] === "gh" && c[2] === "comment"));
  assert.ok(!existsSync(M.morningFile(root, "dev-20261031", "json")));
  // the first-timer's own report saying so is enough
  const again = deps(root);
  const inner2 = again.d.firstTimer;
  again.d.firstTimer = async (f) => ({ ...(await inner2(f)), sealBroken: ["specs/features/fr-01-open-sol/eval.md"] });
  assert.match((await M.morning(again.d, { repo: "sol-mif/sol-dev" }) as any).error, /fr-01-open-sol\/eval\.md/);
});

test("the seal's first look comes before the gate: a gate that changes specs/features/ fails the run too", async () => {
  const root = repo();
  mkdirSync(join(root, "specs", "features", "fr-01-open-sol"), { recursive: true });
  const { d, calls } = deps(root);
  d.gate = async () => { writeFileSync(join(root, "specs", "features", "fr-01-open-sol", "eval.md"), "Approved\n"); return GREEN; };
  const r = await M.morning(d, { repo: "sol-mif/sol-dev" });
  assert.match((r as any).error, /changed specs\/features\/fr-01-open-sol\/eval\.md/);
  assert.ok(!calls.some((c) => c[0] === "gh" && c[2] === "comment"));
});
