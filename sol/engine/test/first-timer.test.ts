// The first-timer (#485, dev cycle step 6): team/firsttimer.ts and the feature map it reads until #480 lands
// (team/featuremap.ts). The run is tried with a stand-in agent and a stand-in stage: no model, no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globTest, featureIn, readFeatures, folderOf } from "../src/team/featuremap.ts";
import * as FT from "../src/team/firsttimer.ts";

const EVAL = `# fr-02 · First message: evals

Status: Approved by marcocyl04-ux on 2026-10-30

## Ways to use it
- [E1] A Sol user types a question and presses Enter; the answer streams in · check: \`node sol/e2e/first-message.mjs\`
- [E2] A Sol user who has never seen Sol finds where to type · check: manual (parent)
- [E3] The answer can be copied · check: manual · persona: designer
- [E4] Something nobody judged · check: manual

## Ways it can fail
- [F1] The engine is down: Sol says so · check: manual (student)
`;

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "sol-ft-"));
  mkdirSync(join(root, "specs", "personas"), { recursive: true });
  writeFileSync(join(root, "specs", "personas", "README.md"), "# not a persona\n");
  writeFileSync(join(root, "specs", "personas", "student.md"), "# Lena, a student\n\nShe skims.\n");
  writeFileSync(join(root, "specs", "personas", "parent.md"), "# Maria, a parent\n\nShe is careful.\n");
  writeFileSync(join(root, "specs", "personas", "designer.md"), "# Joon, a designer\n\nHe looks.\n");
  writeFileSync(join(root, "specs", "features.json"), JSON.stringify({ version: 1, features: [
    { id: "fr-01", name: "Open Sol", slug: "open-sol", paths: ["sol/mac/src/app.ts", "sol/engine/**"] },
    { id: "fr-02", name: "First message", slug: "first-message", paths: ["sol/engine/src/talk*.ts"] },
    { id: "fr-03", name: "Nothing yet", slug: "nothing", paths: [] },
    { id: "nope", name: "not an id" },
  ] }));
  mkdirSync(join(root, "specs", "features", "fr-02-first-message"), { recursive: true });
  writeFileSync(join(root, "specs", "features", "fr-02-first-message", "eval.md"), EVAL);
  mkdirSync(join(root, "specs", "features", "fr-01-open-sol"), { recursive: true });
  writeFileSync(join(root, "specs", "features", "fr-01-open-sol", "eval.md"), "## Ways to use it\n- [E1] Sol opens · check: `true`\n");
  return root;
}

test("the feature map: globs, the most specific claim wins, a bad id is not a feature", () => {
  assert.equal(globTest("sol/engine/**")("sol/engine/src/a/b.ts"), true);
  assert.equal(globTest("sol/engine/src/*.ts")("sol/engine/src/a/b.ts"), false);
  assert.equal(globTest("sol/engine/src/*.ts")("sol/engine/src/b.ts"), true);
  assert.equal(globTest("sol/mac")("sol/mac/src/x.tsx"), true, "a folder with no wildcard is everything under it");
  assert.equal(globTest("sol/mac")("sol/macx/y"), false);
  const root = repo();
  const fs = readFeatures(root);
  assert.deepEqual(fs.map((f) => f.id), ["fr-01", "fr-02", "fr-03"]);
  assert.equal(featureIn(fs, "sol/engine/src/talk.ts")?.id, "fr-02", "talk*.ts says more than engine/**");
  assert.equal(featureIn(fs, "sol/engine/src/index.ts")?.id, "fr-01");
  assert.equal(featureIn(fs, "README.md"), null);
  assert.equal(folderOf(fs[1]), "specs/features/fr-02-first-message");
  assert.deepEqual(readFeatures(mkdtempSync(join(tmpdir(), "sol-ft-none-"))), [], "no map yet is no features, never a throw");
});

test("the personas: a file each, README is not one, the heading is who they are", () => {
  const ps = FT.readPersonas(repo());
  assert.deepEqual(ps.map((p) => p.name), ["designer", "parent", "student"]);
  assert.equal(ps[2].title, "Lena, a student");
  assert.equal(ps[2].body, "She skims.");
});

test("an eval's ways: only under Ways to use it, the check kept, a manual check names its persona", () => {
  const w = FT.waysOf(EVAL);
  assert.deepEqual(w.map((x) => x.id), ["E1", "E2", "E3", "E4"], "F1 is a way it can fail, not a way to use it");
  assert.equal(w[0].check, "node sol/e2e/first-message.mjs");
  assert.equal(w[0].persona, undefined);
  assert.equal(w[1].persona, "parent");
  assert.equal(w[2].persona, "designer");
  assert.equal(w[3].persona, undefined);
  assert.equal(FT.manualPersona("manual: student"), "student");
  assert.equal(FT.manualPersona("`manual` (student)"), "student");
  assert.equal(FT.manualPersona("manual"), null);
  assert.equal(FT.manualPersona("npm test"), null);
});

test("the plan: manual lines to the persona they name, the rest to whoever's turn it is, a nameless manual line said", () => {
  const ps = FT.readPersonas(repo());
  const ways = { "fr-02": FT.waysOf(EVAL), "fr-01": [{ id: "E1", text: "Sol opens", check: "true" }] };
  const feats = [{ id: "fr-01", name: "Open Sol" }, { id: "fr-02", name: "First message" }, { id: "fr-03", name: "Nothing yet" }];
  const { plan, skipped } = FT.planOf(feats, ways, ps);
  // fr-01 goes to the first persona's turn (designer); fr-02's E2 to parent, E3 to designer, and its E1 to the next
  // turn (parent), joining parent's run on the same feature
  const got = plan.map((p) => `${p.feature.id}:${p.persona.name}:${p.ways.map((w) => w.id).join("")}`);
  assert.deepEqual(got, ["fr-01:designer:E1", "fr-02:parent:E2E1", "fr-02:designer:E3"]);
  assert.ok(skipped.some((s) => s.includes("E4") && s.includes("names no persona")));
  assert.ok(skipped.some((s) => s.startsWith("fr-03")));
  const one = FT.planOf(feats, ways, ps, "student");
  assert.deepEqual(one.plan.map((p) => `${p.feature.id}:${p.persona.name}`), ["fr-01:student", "fr-02:student"], "--persona student: the unnamed lines only");
  assert.ok(FT.planOf(feats, ways, ps, "ghost").skipped[0].includes("no persona called ghost"));
  assert.ok(FT.planOf(feats, ways, []).skipped[0].includes("no personas"));
});

test("the answer: TRIED, FOUND and SUMMARY read, an unknown way and a 'none' dropped, words kept to one line", () => {
  const a = FT.parseAnswer([
    "Some thinking first.",
    "TRIED E1: ok — the box was at the bottom",
    "- **TRIED [E2]**: stuck — I could not find where to type",
    "TRIED E9: ok — not a way it was given",
    "FOUND E2: the box looks like a label,\u0007 not a box",
    "FOUND E1: none",
    "SUMMARY: Pretty, but I got lost at the start.",
  ].join("\n"), ["E1", "E2"]);
  assert.deepEqual(a.tried, [{ way: "E1", result: "ok", line: "the box was at the bottom" }, { way: "E2", result: "stuck", line: "I could not find where to type" }]);
  assert.deepEqual(a.findings, [{ way: "E2", what: "the box looks like a label, not a box" }]);
  assert.equal(a.summary, "Pretty, but I got lost at the start.");
});

test("the prompt: who they are, no code, the one tool, the ways, the lines to answer with", () => {
  const [p] = FT.readPersonas(repo());
  const s = FT.promptOf(p, { id: "fr-02", name: "First message" }, FT.waysOf(EVAL).slice(0, 2), "bash /x/sol/first-timer browse");
  assert.match(s, /^You are Joon, a designer\./);
  assert.match(s, /never used Sol before/);
  assert.match(s, /`bash \/x\/sol\/first-timer browse <verb>`/);
  assert.match(s, /cannot read Sol's code/);
  assert.match(s, /- \[E2\] A Sol user who has never seen Sol finds where to type/);
  assert.doesNotMatch(s, /check:/, "the agent never sees the checks");
  assert.match(s, /TRIED <id>/);
});

test("a run with a stand-in agent and stage: one session a persona a feature, the report beside the gate's result", async () => {
  const root = repo();
  const prompts: string[] = [], said: string[] = [];
  let stopped = 0;
  const r = await FT.firstTimer({
    root, sha: async () => "abc123", browse: "bash sol/first-timer browse", say: (l) => said.push(l),
    now: () => new Date("2026-10-31T09:30:00Z"),
    stage: async () => ({ url: "http://127.0.0.1:5555", env: { SOL_FT_STATE: "/tmp/x" }, stop: async () => { stopped++; } }),
    agent: async ({ prompt, env }) => {
      assert.equal(env.SOL_FT_STATE, "/tmp/x");
      prompts.push(prompt);
      return prompt.includes("[E2]") ? "TRIED E2: stuck — where?\nFOUND E2: no box\nSUMMARY: lost" : "TRIED E1: ok — fine\nSUMMARY: fine";
    },
  }, { features: ["fr-02", "fr-77"] });
  assert.equal(stopped, 1, "one stage for the whole run, stopped at the end");
  assert.equal(prompts.length, 2);
  assert.equal(r.sha, "abc123");
  assert.equal(r.url, "http://127.0.0.1:5555");
  assert.equal(r.findings, 1);
  assert.ok(r.skipped.some((s) => s.startsWith("fr-77 is not in specs/features.json")));
  assert.equal(r.file, join(root, ".sol-gate", "abc123.first-timer.json"));
  const back = FT.readReport(r.file!)!;
  assert.equal(back.runs.length, 2);
  assert.equal(back.runs[0].persona, "parent");
  assert.ok(said.some((l) => l.includes("fr-02 First message · parent · ")));
});

test("a run whose stage could not be made, or whose agent fails, still writes its report and never throws", async () => {
  const root = repo();
  const r = await FT.firstTimer({
    root, sha: async () => "def456", browse: "b", stage: async () => ({ error: "the face is not built" }),
    agent: async () => { throw new Error("unused"); },
  }, { features: ["fr-01"] });
  assert.equal(r.runs.length, 1);
  assert.match(r.runs[0].error!, /no stage: the face is not built/);
  assert.ok(FT.readReport(r.file!));
  const r2 = await FT.firstTimer({
    root, sha: async () => "def457", browse: "b",
    stage: async () => ({ url: "u", env: {}, stop: async () => {} }),
    agent: async ({ prompt }) => { if (prompt.includes("Open Sol")) throw new Error("claude ended with 1"); return "nothing useful"; },
  }, { features: ["fr-01", "fr-02"] });
  assert.match(r2.runs[0].error!, /claude ended with 1/);
  assert.ok(r2.runs.slice(1).every((x) => /no TRIED or SUMMARY/.test(x.error!)));
  assert.equal(FT.runLine(r2.runs[0]).includes("not run"), true);
});

test("the stage's engine: its own home, state and team, nothing counted, nothing sent, the face let through its door", () => {
  const env = FT.stageEnv({ PATH: "/bin", HOME: "/h", ANTHROPIC_API_KEY: "secret", SOL_HOME: "/real/home" }, "/run", 4000, "http://127.0.0.1:4001", "/d");
  assert.equal(env.ANTHROPIC_API_KEY, undefined, "only an allowlist of the shell's env");
  assert.equal(env.SOL_HOME, "/run/home");
  assert.equal(env.SOL_STATE, "/run/state/work.json");
  assert.equal(env.SOL_TEAM, "/run/team.json");
  assert.equal(env.SOL_FACE, "http://127.0.0.1:4001");
  for (const k of ["SOL_TRACK", "SOL_TRACK_URL", "SOL_HUB"]) assert.equal(env[k], "off");
  assert.equal(env.SOL_NO_RENEW, "1");
  assert.equal(env.SOL_PORT, "4000");
  // #495's review: nothing of the person reaches the stage
  assert.equal(env.HOME, "/run/os-home", "an empty HOME of the run's: no ~/.claude, ~/.codex, gh or keys");
  assert.equal(env.PATH, "/run/bin:/usr/bin:/bin", "a trimmed PATH: the run's own bin (node alone), /usr/bin, /bin");
  assert.ok(!env.PATH.split(":").some((d) => /homebrew|\.local|\.sol\/gh|usr\/local/.test(d)), "never the person's own bins (gh)");
  assert.equal(env.SOL_STAGE, "1", "the engine refuses what reaches past the stage (src/stage.ts)");
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined, "no seat unless the runner names one");
  for (const k of ["GH_TOKEN", "GITHUB_TOKEN", "SHELL", "USER"]) assert.equal(env[k], undefined, k);
  const seat = FT.stageEnv({ SOL_STAGE_CLAUDE_TOKEN: "tok", GH_TOKEN: "gh", CLAUDE_CODE_OAUTH_TOKEN: "the person's" }, "/run", 4000, "f", "/d");
  assert.equal(seat.CLAUDE_CODE_OAUTH_TOKEN, "tok", "the one sign-in the runner named for the stage, never the person's own");
  assert.equal(seat.GH_TOKEN, undefined);
});

test("the test browser goes to the stage's face only, and the agent session has the one tool", () => {
  const o = "http://127.0.0.1:4001";
  assert.equal(FT.goTarget(o, "/"), `${o}/`);
  assert.equal(FT.goTarget(o, "/?mode=work"), `${o}/?mode=work`);
  for (const bad of ["https://evil.example/", "//evil.example/x", "file:///etc/passwd", "javascript:alert(1)", "settings"]) assert.equal(FT.goTarget(o, bad), null, bad);
  const args = FT.claudeArgs("bash /r/sol/first-timer browse", { "sol-first-timer": { description: "d", prompt: "p" } });
  assert.deepEqual(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2), ["--tools", "Bash"]);
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Bash(bash /r/sol/first-timer browse:*)");
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(args.includes("--strict-mcp-config"), "no MCP servers: Sol's own tools would be a way around the seal");
  assert.equal(args[args.indexOf("--setting-sources") + 1], "project", "never the person's ~/.claude settings (their Bash(*)) or CLAUDE.md");
  const env = FT.agentEnv({ HOME: "/Users/frank", PATH: "/opt/homebrew/bin:/usr/bin", GH_TOKEN: "gh", CLAUDE_CODE_OAUTH_TOKEN: "tok", OPENAI_API_KEY: "k", LANG: "en" }, "/tmp/ft-1", { SOL_FT_STATE: "/s" });
  assert.equal(env.HOME, "/tmp/ft-1/home", "a scratch HOME");
  assert.equal(env.CLAUDE_CONFIG_DIR, "/tmp/ft-1/claude", "a scratch Claude config: its session files go away with the folder");
  assert.equal(env.PATH, "/tmp/ft-1/bin:/usr/bin:/bin");
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, "tok", "the one sign-in");
  for (const k of ["GH_TOKEN", "OPENAI_API_KEY"]) assert.equal(env[k], undefined, k);
  assert.equal(env.SOL_ROLE, "first-timer");
  assert.equal(env.SOL_FT_STATE, "/s");
  const d = mkdtempSync(join(tmpdir(), "sol-ft-bin-"));
  assert.deepEqual(readdirSync(FT.nodeBin(d)), ["node"], "the run's bin holds node and nothing else");
  assert.deepEqual(FT.agentJson("---\nname: sol-first-timer\ndescription: \"A newcomer\"\ntools: Bash, Read\n---\nYou are new.\n"), { "sol-first-timer": { description: "A newcomer", prompt: "You are new." } });
  assert.equal(FT.agentJson(null), null);
});

// The seal, judged by its effect (#485, from the review of #482's checkpoint refusal): whatever the command looked like,
// a run that changes a file under specs/features/ fails and is named; and the run writes only under .sol-gate/, where
// the file really is, without case (macOS), never through a hard link.
const STAGE = async () => ({ url: "u", env: {}, stop: async () => {} });
test("the seal: a run that adds Approved to an eval.md by a staged write (a script, base64, a copy from /tmp) fails, and says which file", async () => {
  for (const how of ["script", "base64", "copy", "case"]) {
    const root = repo();
    const evalFile = join(root, "specs", "features", "fr-02-first-message", "eval.md");
    const said: string[] = [];
    const r = await FT.firstTimer({
      root, sha: async () => `seal-${how}`, browse: "b", stage: STAGE, say: (l) => said.push(l),
      agent: async () => {
        // the words of the command never say eval.md or Approved; only the effect does
        const tmp = mkdtempSync(join(tmpdir(), "sol-ft-x-"));
        if (how === "script") { writeFileSync(join(tmp, "s.sh"), `printf '\\n**Status:** %s\\n' "$(echo QXBwcm92ZWQ= | base64 -d)" >> "$1"\n`); execFileSync("bash", [join(tmp, "s.sh"), evalFile]); }
        else if (how === "base64") writeFileSync(evalFile, readFileSync(evalFile, "utf8") + Buffer.from("KipTdGF0dXM6KiogQXBwcm92ZWQK", "base64").toString());
        else if (how === "copy") { writeFileSync(join(tmp, "e"), "**Status:** Scoped\n"); writeFileSync(evalFile, readFileSync(join(tmp, "e"))); }
        else { mkdirSync(join(root, "specs", "features", "fr-09-new"), { recursive: true }); writeFileSync(join(root, "specs", "features", "fr-09-new", "EVAL.md"), "Approved\n"); }
        return "TRIED E1: ok — fine\nSUMMARY: fine";
      },
    }, { features: ["fr-02"] });
    assert.ok(r.sealBroken?.length, `${how}: the change is seen`);
    assert.ok(r.sealBroken!.every((p) => p.startsWith("specs/features/")), how);
    if (how === "case") assert.deepEqual(r.sealBroken, ["specs/features/fr-09-new/", "specs/features/fr-09-new/EVAL.md"], "a new folder and an EVAL.md: both seen");
    else assert.deepEqual(r.sealBroken, ["specs/features/fr-02-first-message/eval.md"]);
    assert.ok(r.runs.every((x) => !x.ok), `${how}: the run fails`);
    assert.ok(said.some((l) => l.startsWith("first-timer: REFUSED: the run changed specs/features/")));
  }
  // a run that touches nothing there: no seal broken
  const root = repo();
  const ok = await FT.firstTimer({ root, sha: async () => "clean", browse: "b", stage: STAGE, agent: async () => "TRIED E1: ok — fine\nSUMMARY: fine" }, { features: ["fr-02"] });
  assert.equal(ok.sealBroken, undefined);
});

test("the seal on a folder spelled another way: Specs/Features is hashed, and a sibling spelled another way that appears breaks it", () => {
  const root = mkdtempSync(join(tmpdir(), "sol-ft-case-"));
  mkdirSync(join(root, "Specs", "Features", "fr-01-x"), { recursive: true });
  writeFileSync(join(root, "Specs", "Features", "fr-01-x", "Eval.md"), "a\n");
  const before = FT.featuresSnapshot(root);
  assert.deepEqual([...before.keys()], ["Specs/Features/", "Specs/Features/fr-01-x/", "Specs/Features/fr-01-x/Eval.md"]);
  writeFileSync(join(root, "Specs", "Features", "fr-01-x", "Eval.md"), "a\nApproved\n");
  assert.deepEqual(FT.sealBroken(before, FT.featuresSnapshot(root)), ["Specs/Features/fr-01-x/Eval.md"]);
  assert.deepEqual(FT.sealBroken(before, new Map()), ["Specs/Features/", "Specs/Features/fr-01-x/", "Specs/Features/fr-01-x/Eval.md"], "a file taken away counts too");
  // a disk that keeps case (Linux; a Mac formatted so): specs/ beside Specs/, the canonical one the readers use included
  const caseSensitive = !existsSync(join(root, "specs"));
  if (caseSensitive) {
    const b2 = FT.featuresSnapshot(root);
    mkdirSync(join(root, "specs", "features", "fr-01-x"), { recursive: true });
    writeFileSync(join(root, "specs", "features", "fr-01-x", "eval.md"), "Approved\n");
    assert.deepEqual(FT.sealBroken(b2, FT.featuresSnapshot(root)), ["specs/features/", "specs/features/fr-01-x/", "specs/features/fr-01-x/eval.md"], "the variant that appeared is a broken seal");
    mkdirSync(join(root, "specs", "FEATURES"));
    assert.ok(FT.featuresSnapshot(root).has("specs/FEATURES/"), "every variant at the second level too");
  }
  // a features folder swapped for a link is seen as the link, never followed
  const r2 = mkdtempSync(join(tmpdir(), "sol-ft-link-"));
  mkdirSync(join(r2, "specs", "features"), { recursive: true });
  const b3 = FT.featuresSnapshot(r2);
  rmSync(join(r2, "specs", "features"), { recursive: true });
  symlinkSync(mkdtempSync(join(tmpdir(), "sol-ft-else-")), join(r2, "specs", "features"));
  assert.deepEqual(FT.sealBroken(b3, FT.featuresSnapshot(r2)), ["specs/features/"]);
});

test("the one place it writes: under .sol-gate/ where the file really is, without case, never through a link to an eval.md", () => {
  const root = repo();
  const evalFile = join(root, "specs", "features", "fr-02-first-message", "eval.md");
  const was = readFileSync(evalFile, "utf8");
  FT.writeInGate(root, join(root, ".sol-gate", "ok.json"), "{}");
  assert.equal(readFileSync(join(root, ".sol-gate", "ok.json"), "utf8"), "{}");
  assert.throws(() => FT.writeInGate(root, evalFile, "Approved"), /not under \.sol-gate/);
  assert.throws(() => FT.writeInGate(root, join(root, ".sol-gate", "..", "specs", "features", "fr-02-first-message", "eval.md"), "Approved"), /not under \.sol-gate/);
  linkSync(evalFile, join(root, ".sol-gate", "hard.json"));
  assert.throws(() => FT.writeInGate(root, join(root, ".sol-gate", "hard.json"), "Approved"), /linked elsewhere/, "a hard link to an eval.md");
  symlinkSync(evalFile, join(root, ".sol-gate", "soft.json"));
  assert.throws(() => FT.writeInGate(root, join(root, ".sol-gate", "soft.json"), "Approved"), /linked elsewhere/);
  symlinkSync(join(root, "specs", "features"), join(root, ".sol-gate", "into"));
  assert.throws(() => FT.writeInGate(root, join(root, ".sol-gate", "into", "fr-02-first-message", "eval.md"), "Approved"), /not under \.sol-gate|is a link/, "a folder link out of .sol-gate");
  // .sol-gate itself a link elsewhere: refused before anything is made there
  const r3 = mkdtempSync(join(tmpdir(), "sol-ft-gl-")), away = mkdtempSync(join(tmpdir(), "sol-ft-away-"));
  symlinkSync(away, join(r3, ".sol-gate"));
  assert.throws(() => FT.writeInGate(r3, join(r3, ".sol-gate", "morning", "x.md"), "x"), /is a link/);
  assert.ok(!existsSync(join(away, "morning")), "no folder made where the link points");
  symlinkSync(join(root, "nowhere", "eval.md"), join(root, ".sol-gate", "dangling.json"));
  assert.throws(() => FT.writeInGate(root, join(root, ".sol-gate", "dangling.json"), "Approved"), /linked elsewhere/, "a dangling link too");
  assert.ok(!existsSync(join(root, "nowhere")), "nothing written where it pointed");
  // written by a temp file renamed into place: no temp left, the old text replaced whole
  FT.writeInGate(root, join(root, ".sol-gate", "ok.json"), "{\"b\":1}");
  assert.equal(readFileSync(join(root, ".sol-gate", "ok.json"), "utf8"), "{\"b\":1}");
  assert.deepEqual(readdirSync(join(root, ".sol-gate")).filter((n) => n.endsWith(".tmp")), []);
  assert.equal(readFileSync(evalFile, "utf8"), was, "the eval.md is as it was");
  assert.ok(!existsSync(join(root, ".sol-gate", "x")));
});

test("a background process the agent left behind is killed with its group before the seal is looked at", async () => {
  const root = repo();
  const evalFile = join(root, "specs", "features", "fr-02-first-message", "eval.md");
  const was = readFileSync(evalFile, "utf8");
  const agent = FT.commandAgent(`(sleep 1; printf 'Approved\\n' >> "${evalFile}") & echo "TRIED E1: ok — fine"; echo "SUMMARY: fine"`);
  const r = await FT.firstTimer({ root, sha: async () => "bg", browse: "b", stage: STAGE, agent }, { features: ["fr-02"] });
  await new Promise((ok) => setTimeout(ok, 1500));
  assert.equal(readFileSync(evalFile, "utf8"), was, "the process it left running was gone before it could write");
  assert.equal(r.sealBroken, undefined);
  assert.equal(r.runs[0].summary, "fine", "the answer still read whole");
});

test("the seal covers the map and the personas too: specs/features.json and specs/personas/", () => {
  const root = repo();
  const before = FT.featuresSnapshot(root);
  assert.ok(before.has("specs/features.json") && before.has("specs/personas/student.md"));
  writeFileSync(join(root, "specs", "personas", "student.md"), "# Lena\n\nShe approves everything.\n");
  writeFileSync(join(root, "specs", "features.json"), "{}");
  assert.deepEqual(FT.sealBroken(before, FT.featuresSnapshot(root)), ["specs/features.json", "specs/personas/student.md"]);
});
