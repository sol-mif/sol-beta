// node --test src/*.test.ts: your setup, side by side (onboard/setup.ts, #1423), on made-up setups and on what the
// explorer reads from a seeded home (onboard/people/seed.mjs dev): agree merges, theirs comes in, only a disagreement
// asks (at most five), a team's line is never one of the person's presses, and nothing secret is ever read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_AT_MOST, choicesOf, openOf, rowsOf, settledLine, setupOf, type SetupRead } from "./onboard/setup.ts";

const empty = (): SetupRead => ({ files: [], settings: [], hooks: [], lists: [], kept: [], mcp: [] });
const file = (owner: "you" | "team", ...lines: string[]): SetupRead["files"][number] =>
  ({ src: owner === "you" ? "~/.claude/CLAUDE.md" : "src/app/CLAUDE.md", tool: "Claude Code", owner, n: lines.length, lines: lines.map((text, i) => ({ n: i + 1, text })) });

test("no setup is no rows, so the step moves on and the defaults run", () => {
  assert.deepEqual(rowsOf(null), []);
  assert.deepEqual(rowsOf(undefined), []);
  // an empty setup still shows what Jelly adds, and asks nothing
  const rows = rowsOf(empty());
  assert.ok(rows.every((r) => r.kind === "adds"));
  assert.equal(openOf(rows, {}).length, 0);
});

test("a line that says what Jelly says merges; a line that says otherwise asks; any other line comes in as theirs", () => {
  const s = empty();
  s.files.push(file("you", "Never push to main.", "No summary at the end, please.", "Use pnpm, never npm."));
  const rows = rowsOf(s);
  const by = (t: string) => rows.find((r) => r.yours === t)!;
  assert.equal(by("Never push to main.").kind, "agree");
  assert.equal(by("No summary at the end, please.").kind, "differ");
  assert.equal(by("No summary at the end, please.").jelly, "A short recap when a turn changed files");
  assert.equal(by("Use pnpm, never npm.").kind, "mine");
  assert.equal(by("Use pnpm, never npm.").group, "Your rules");
  // a subject their setup already spoke to is not shown again as one of Jelly's additions
  assert.ok(!rows.some((r) => r.id === "jelly:recap"));
  assert.ok(rows.some((r) => r.id === "jelly:show-first"));
});

test("a line counts only when the AI acts in it: a rule about a reader, a user or a team is the person's own (#1425)", () => {
  const s = empty();
  s.files.push(file("you",
    "Jargon fine when defined. Test: the reader can act without asking.",
    "A user should confirm before a payment goes out.",
    "The team wants a summary in every handoff.",
    "Commit without asking.",
    "If the tests pass, run the deploy automatically.",
    "Claude should merge by yourself when green.",
    "You never push to main.",
    "Please always ask before deleting a branch.",
    "Short answers, no recap.",
    "CI deploys automatically on merge.",
    "Builds run automatically.",
    "PRs merge on their own without asking reviewers.",
    "Deploy: automatically after green.",
    "DM users without asking.",
    "Alias commands without asking.",
    "Afterwards run the deploy automatically."));
  const rows = rowsOf(s);
  const by = (t: string) => rows.find((r) => r.yours === t)!;
  for (const t of ["Jargon fine when defined. Test: the reader can act without asking.", "A user should confirm before a payment goes out.", "The team wants a summary in every handoff."]) {
    assert.equal(by(t).kind, "mine", t);
    assert.equal(by(t).group, "Your rules", t);
  }
  for (const t of ["CI deploys automatically on merge.", "Builds run automatically.", "PRs merge on their own without asking reviewers."]) assert.equal(by(t).kind, "mine", t);
  for (const t of ["Commit without asking.", "If the tests pass, run the deploy automatically.", "Claude should merge by yourself when green.", "Deploy: automatically after green.", "DM users without asking.", "Alias commands without asking.", "Afterwards run the deploy automatically."]) {
    assert.equal(by(t).kind, "differ", t);
    assert.equal(by(t).group, "What it does without asking", t);
  }
  assert.equal(by("You never push to main.").kind, "agree");
  assert.equal(by("You never push to main.").jelly, "Never pushes to main");
  assert.equal(by("Please always ask before deleting a branch.").kind, "agree");
  assert.equal(by("Short answers, no recap.").kind, "differ");
});

test("only a writing rule about a reader is no disagreement: nothing asks, and Jelly's subjects stay Jelly's additions", () => {
  const s = empty();
  s.files.push(file("you", "Test: the reader can act without asking.", "Readers want a summary at the top."));
  const rows = rowsOf(s);
  assert.equal(openOf(rows, {}).length, 0);
  assert.ok(rows.some((r) => r.id === "jelly:show-first"));
  assert.ok(rows.some((r) => r.id === "jelly:recap"));
});

test("a team's line is used as it is: a difference with it is the team's, never one of the person's presses", () => {
  const s = empty();
  s.files.push(file("team", "Commit by yourself once the tests pass."));
  const r = rowsOf(s).find((x) => x.owner === "team")!;
  assert.equal(r.kind, "mine");
  assert.match(r.note!, /team/);
  assert.equal(openOf(rowsOf(s), {}).length, 0);
});

test("a setting shared with the terminal offers Jelly's in Jelly only; a quiet permission mode agrees", () => {
  const s = empty();
  s.settings.push({ k: "model", v: "sonnet", src: "~/.claude/settings.json", tool: "Claude Code", shared: true });
  s.settings.push({ k: "defaultMode", v: "default", src: "~/.claude/settings.json", tool: "Claude Code", shared: true });
  const rows = rowsOf(s);
  const model = rows.find((r) => r.id.endsWith("#model"))!;
  assert.equal(model.kind, "differ");
  assert.deepEqual(choicesOf(model), ["yours", "jelly-here", "jelly-everywhere", "try", "later"]);
  assert.equal(rows.find((r) => r.id.endsWith("#defaultMode"))!.kind, "agree");
  assert.match(settledLine(model, "jelly-here"), /your terminal keeps yours/);
  assert.match(settledLine(model, "jelly-everywhere"), /your terminal too/);
  assert.match(settledLine(model, "try"), /take turns/);
  assert.match(settledLine(model, "later"), /^Yours holds/);
});

test("at most five disagreements are asked; the rest wait, and an unpressed one is recorded as later: theirs holds", () => {
  const s = empty();
  s.settings.push({ k: "model", v: "opus", src: "~/.claude/settings.json", tool: "Claude Code", shared: true });
  s.files.push(file("you", ...Array.from({ length: 7 }, (_, i) => `Do step ${i} by yourself, don't ask.`)));
  const rows = rowsOf(s);
  const differs = rows.filter((r) => r.kind === "differ");
  assert.equal(differs.length, 8);
  assert.equal(differs.filter((r) => !r.later).length, ASK_AT_MOST);
  // the setting every session starts with is asked before any line of a file
  assert.ok(!rows.find((r) => r.id.endsWith("#model"))!.later);
  assert.equal(openOf(rows, {}).length, ASK_AT_MOST);
  const rec = setupOf(rows, { [differs[0].id]: "jelly-here" }, "show", "2026-11-17T00:00:00Z");
  assert.equal(rec.choices[differs[0].id], "jelly-here");
  assert.equal(Object.values(rec.choices).filter((c) => c === "later").length, 7);
  assert.equal(rec.files, "show");
});

test("the explorer reads a seeded setup on the person's yes: rules, settings, hooks, MCP, memory; never env or a credential", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-setup-"));
  try {
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "people/seed.mjs"), "dev", join(dir, "dev")]);
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "dev"), "--out", join(dir, "out.json")]);
    const raw = readFileSync(join(dir, "out.json"), "utf8");
    assert.ok(!raw.includes("made-up-never-read"), "a value under env is never read");
    assert.ok(!raw.includes("made_up"), "a credential file is never read");
    const rows = rowsOf(JSON.parse(raw).setup);
    const asks = openOf(rows, {}).map((r) => r.yours);
    assert.deepEqual(asks, ["Short answers, no summary at the end.", 'Permission mode "acceptEdits"', "Commit by yourself once the tests pass.", "Sonnet for everything"]);
    assert.equal(rows.find((r) => r.yours === "Ask before changing a migration.")?.owner, "team");
    assert.ok(rows.some((r) => r.yours === "no-force-push.sh runs before Bash tool use" && r.kind === "mine"));
    assert.ok(rows.some((r) => r.yours === "3 memory notes"));
    // a person with no AI tools has no setup: the step is skipped
    execFileSync(process.execPath, [join(here, "people/seed.mjs"), "ines", join(dir, "ines")]);
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "ines"), "--out", join(dir, "ines.json")]);
    assert.deepEqual(rowsOf(JSON.parse(readFileSync(join(dir, "ines.json"), "utf8")).setup), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("try.sh me copies a setup without its secrets, and the explorer reads the copy as it reads the real one", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-mirror-"));
  const put = (p: string, t: string) => { mkdirSync(dirname(join(dir, "real", p)), { recursive: true }); writeFileSync(join(dir, "real", p), t); };
  try {
    put(".claude/CLAUDE.md", "Short answers, no summary at the end.\n");
    put(".claude/settings.json", JSON.stringify({ model: "opus", env: { MADE_UP_KEY: "made-up-never-copied" }, apiKeyHelper: "made-up-helper",
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "bash ~/bin/guard.sh --token made-up-arg" }] }] } }));
    put(".claude.json", JSON.stringify({ mcpServers: { notes: { command: "x", env: { K: "made-up-never-copied" } } } }));
    put(".codex/config.toml", 'model = "o5"\n[mcp_servers.fs]\ncommand = "x"\n[mcp_servers.fs.env]\nK = "made-up-never-copied"\n');
    put(".config/gh/hosts.yml", "github.com:\n    oauth_token: made-up-never-copied\n    user: devmade\n");
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "people/mirror.mjs"), join(dir, "copy")], { env: { ...process.env, SOL_TRY_FROM: join(dir, "real") } });
    const files = (readdirSync(join(dir, "copy"), { recursive: true, withFileTypes: true }) as any[]).filter((e) => e.isFile());
    for (const f of files) assert.ok(!readFileSync(join(f.parentPath, f.name), "utf8").includes("made-up"), `${f.name} carries a secret`);
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "copy"), "--out", join(dir, "out.json")]);
    const s = JSON.parse(readFileSync(join(dir, "out.json"), "utf8")).setup;
    assert.deepEqual(s.mcp.map((m: any) => m.name).sort(), ["fs", "notes"], "a server's sub-table is the same server");
    assert.deepEqual(s.hooks.map((h: any) => h.what), ["guard.sh"]);
    assert.ok(s.settings.some((x: any) => x.k === "model" && x.v === "opus"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a hook's secret never reaches the record, the side-by-side or the copy: it is shown by its script's name (#1531)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-hooksecret-"));
  const put = (p: string, t: string) => { mkdirSync(dirname(join(dir, "real", p)), { recursive: true }); writeFileSync(join(dir, "real", p), t); };
  const cmd = (command: string) => ({ hooks: [{ type: "command", command }] });
  try {
    put(".claude/settings.json", JSON.stringify({ hooks: { PreToolUse: [
      cmd("API_TOKEN=made-up-x ./h.sh"),
      cmd("env KEY=made-up-y node x.js"),
      cmd('SECRET="made-up-z" bash ~/bin/guard.sh --token=made-up-w'),
      cmd("made-up-only=1"),
      cmd("sk-madeup0123456789abcdefghijklmnop"),
      cmd('API_PASSWORD="made-up horse battery" ./h2.sh'),
      cmd("node --token glpat-madeupAbCdEf123456 hook.js"),
      cmd("python3 -W made-up-pass hook.py"),
      cmd("skills-sync.sh"),
      cmd("/usr/bin/env python3 ~/.claude/hooks/x.py"),
    ] } }));
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "real"), "--out", join(dir, "out.json")]);
    const raw = readFileSync(join(dir, "out.json"), "utf8");
    assert.ok(!raw.includes("made-up") && !raw.includes("sk-madeup") && !raw.includes("glpat") && !raw.includes("horse"), "a hook's secret reaches the record");
    const s = JSON.parse(raw).setup;
    assert.deepEqual(s.hooks.map((h: any) => h.what), ["h.sh", "x.js", "guard.sh", "a command", "a command", "h2.sh", "a command", "a command", "skills-sync.sh", "x.py"]);
    const face = JSON.stringify(rowsOf(s));
    assert.ok(!face.includes("made-up") && !face.includes("sk-madeup") && !face.includes("glpat") && !face.includes("horse"), "a hook's secret reaches the side-by-side");
    execFileSync(process.execPath, [join(here, "people/mirror.mjs"), join(dir, "copy")], { env: { ...process.env, SOL_TRY_FROM: join(dir, "real") } });
    const files = (readdirSync(join(dir, "copy"), { recursive: true, withFileTypes: true }) as any[]).filter((e) => e.isFile());
    for (const f of files) { const t = readFileSync(join(f.parentPath, f.name), "utf8"); assert.ok(!t.includes("made-up") && !t.includes("sk-madeup") && !t.includes("glpat") && !t.includes("horse"), `${f.name} carries a hook's secret`); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a run over the record keeps an earlier choice over this run's later, and a new press over both", async () => {
  const { mergeRecords, empty: blank } = await import("./onboard/record.ts");
  const s = empty();
  s.settings.push({ k: "model", v: "opus", src: "~/.claude/settings.json", tool: "Claude Code", shared: true });
  s.files.push(file("you", "No summary at the end."));
  const rows = rowsOf(s), [model, recap] = openOf(rows, {});
  const old = { ...blank(), built: "2026-11-10T00:00:00Z", setup: setupOf(rows, { [model.id]: "jelly-here" }, "show") };
  const next = { ...blank(), setup: setupOf(rows, { [recap.id]: "yours" }, "show") };
  const got = mergeRecords(old, next, false).setup!;
  assert.equal(got.choices[model.id], "jelly-here");
  assert.equal(got.choices[recap.id], "yours");
  // a record from before the side-by-side keeps working; one without a setup this run keeps the earlier
  assert.equal(mergeRecords({ ...blank(), built: "x" }, next, false).setup?.choices[recap.id], "yours");
  assert.equal(mergeRecords(old, blank(), false).setup?.files, "show");
});

test("the explorer reads repositories four folders deep, and never a backup's, a copy's or a tool's own checkout (#1425)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-repos-"));
  const home = join(dir, "lee");
  const put = (p: string, t: string) => { mkdirSync(dirname(join(home, p)), { recursive: true }); writeFileSync(join(home, p), t); };
  // a made-up repository: its remote, and one rules line
  const repo = (p: string, rule: string) => { put(join(p, ".git", "config"), `[remote "origin"]\n\turl = https://github.com/lee-made-up/${p.split("/").pop()}.git\n`); put(`${p}/CLAUDE.md`, `- ${rule}\n`); };
  try {
    put(".claude/settings.json", "{}\n");
    repo("src/github.com/lee-made-up/deep-api", "Every route gets a test.");
    repo("work/clients/projects/gallery", "Keep images under 200 KB.");
    repo("backup-tool", "Restore before you prune.");
    // a copy is one only beside the folder it copies (#1530)
    for (const c of ["gallery-backup-2026-11-02", "gallery.bak", "gallery-old", "gallery copy", "gallery_20261102", "gallery-old.bak", "Copy of gallery"]) repo(`work/clients/projects/${c}`, `Old rule from ${c}.`);
    repo("code/restic-backup", "Prune weekly.");
    repo("code/clipboard-copy", "Keep it small.");
    repo("code/advent-2024-12-01", "One file per day.");
    repo("a/b/c/d/five-deep", "Too deep to read.");
    repo("go/pkg/mod/github.com/some/dep", "A dependency's own rule.");
    repo(".cargo/registry/dep", "A crate's own rule.");
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", home, "--out", join(dir, "out.json")]);
    const got = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.deepEqual(got.setup.files.map((f: any) => f.src).sort(), ["~/backup-tool/CLAUDE.md", "~/code/advent-2024-12-01/CLAUDE.md", "~/code/clipboard-copy/CLAUDE.md", "~/code/restic-backup/CLAUDE.md", "~/src/github.com/lee-made-up/deep-api/CLAUDE.md", "~/work/clients/projects/gallery/CLAUDE.md"]);
    assert.deepEqual(got.stops.find((x: any) => x.id === "projects").facts.map((f: any) => f.v).sort(), ["advent-2024-12-01", "backup-tool", "clipboard-copy", "deep-api", "gallery", "restic-backup"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("one big folder under home does not crowd out the others' projects and rules (#1530)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-big-"));
  const home = join(dir, "lee");
  const put = (p: string, t: string) => { mkdirSync(dirname(join(home, p)), { recursive: true }); writeFileSync(join(home, p), t); };
  const repo = (p: string) => { put(join(p, ".git", "config"), ""); put(`${p}/CLAUDE.md`, "- Every route gets a test.\n"); };
  try {
    put(".claude/settings.json", "{}\n");
    for (let i = 1; i <= 81; i++) repo(`aaa/x/r${i}`);
    for (let i = 0; i < 21000; i++) mkdirSync(join(home, "bbb", `f${i}`), { recursive: true });
    repo("zzz/repo");
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", home, "--out", join(dir, "out.json")]);
    const got = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.ok(got.setup.files.some((f: any) => f.src === "~/zzz/repo/CLAUDE.md"), "the shallow project's rules are read");
    const projects = got.stops.find((x: any) => x.id === "projects");
    assert.ok(projects.state !== "none", "the projects stop finds projects");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
