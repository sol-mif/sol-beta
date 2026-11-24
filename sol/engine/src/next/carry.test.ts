// The move-in read (carry.ts; #1604, switch.md "3. What the move-in reads", slice 7b of #1615) is read only. Over a copy
// of a fixture home (the panel's people: Dev's code, Jayden's school folder, Denise's agent), node:fs itself is wrapped
// while it runs, so every path it opens or lists is recorded whatever function it uses: the set of opened paths is the
// set hashed (each one is in the tree hashed), the SHA-256 of each and of every file and folder under the copy is the same
// before and after, and nothing at all was written. Then what it read is checked against the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const { carry } = await import("./carry.js");
const { appsWhere, copiesOf } = await import("./carry-apps.js");
const tmp = fs.mkdtempSync(join(tmpdir(), "sol-next-carry-"));
const NOW = new Date(2026, 10, 19, 10, 0);

/** the fixture: a home, work.json beside it, the log outside it, and a project folder elsewhere */
function build(root: string) {
  const w = (p: string, text: string) => { fs.mkdirSync(join(root, p, ".."), { recursive: true }); fs.writeFileSync(join(root, p), text); };
  const home = "home";
  w(`${home}/School/stickies.md`, "# school · your stickies\n\n- [ ] Jayden: revise cells — chapter 4\n  - due: 2026-11-21\n- [x] Jayden: bio lab write-up\n");
  fs.mkdirSync(join(root, home, "School", "bio 201"), { recursive: true });
  w(`${home}/Code/app/.git/HEAD`, "ref: refs/heads/main\n");
  w(`${home}/Code/app/policy.md`, "- [watch] tests: Dev's app, run the tests each morning\n");
  fs.mkdirSync(join(root, home, "Family"), { recursive: true });
  fs.mkdirSync(join(root, home, ".cache"), { recursive: true });
  w(`${home}/track/2026-11-18.jsonl`, "{}\n");
  w(`${home}/items/it-aaaaaaaaaaaa/thing.json`, JSON.stringify({ id: "it-aaaaaaaaaaaa", words: "Sign Tomás's school trip form", folder: "family", state: "you", waitsOn: "you", at: 1, due: "2026-11-20" }));
  w(`${home}/items/it-bbbbbbbbbbbb/thing.json`, JSON.stringify({ id: "it-bbbbbbbbbbbb", words: "Book Min-ji's dentist", folder: "family", state: "done", waitsOn: "none", at: 2 }));
  w(`${home}/agents.json`, JSON.stringify({ v: 1, agents: [{ id: "ag-1", name: "School helper", job: "Keeps Jayden's school folder", rules: [{ folder: "School", rule: "stickies" }] }] }));
  w(`${home}/arrangement.json`, "{}\n");
  w("elsewhere/site/.git/HEAD", "ref: refs/heads/main\n");
  w("state/work.json", JSON.stringify({ marks: { "s-dev-1": { pinned: true }, "s-dev-2": { archived: true }, "s-sam-1": { done: true, group: "g1" } }, groups: [], folders: [join(root, "elsewhere", "site")], hidden: [], order: ["g:g1", join(root, "elsewhere", "site")] }));
  w("log/2026-11-18.jsonl", [{ seq: 1, at: 100, kind: "seat.turn", by: { person: "seat", agent: "claude" }, value: { words: "Denise's secret plan" } }, { seq: 2, at: 200, kind: "thing.done", by: { person: "you" }, item: "it-bbbbbbbbbbbb" }].map((e) => JSON.stringify(e)).join("\n") + "\n");
  w("log/2026-11-19.jsonl", JSON.stringify({ seq: 3, at: 300, kind: "seat.turn", by: {} }) + "\n");
}

/** every file and folder under root: a file by its bytes, a folder by its sorted names */
function tree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (p: string) => {
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      const names = fs.readdirSync(p).sort();
      out.set(p, createHash("sha256").update("dir\0" + names.join("\0")).digest("hex"));
      for (const n of names) walk(join(p, n));
    } else out.set(p, createHash("sha256").update(fs.readFileSync(p)).digest("hex"));
  };
  walk(root);
  return out;
}

const READS = ["readFileSync", "readdirSync", "statSync", "lstatSync", "existsSync", "openSync", "opendirSync", "realpathSync", "accessSync", "createReadStream"] as const;
const WRITES = ["writeFileSync", "appendFileSync", "renameSync", "mkdirSync", "rmSync", "rmdirSync", "unlinkSync", "copyFileSync", "cpSync", "symlinkSync", "truncateSync", "utimesSync", "chmodSync", "mkdtempSync", "createWriteStream"] as const;

/** run f with node:fs wrapped: each path handed to a read or a write function recorded */
function watched<T>(f: () => T): { out: T; opened: Set<string>; wrote: string[] } {
  const opened = new Set<string>(), wrote: string[] = [];
  const kept = new Map<string, unknown>();
  const anyFs = fs as unknown as Record<string, (...a: unknown[]) => unknown>;
  const wrap = (name: string, into: (p: string) => void) => {
    const was = anyFs[name];
    if (typeof was !== "function") return;
    kept.set(name, was);
    anyFs[name] = function (this: unknown, ...a: unknown[]) { if (typeof a[0] === "string" || a[0] instanceof URL) into(String(a[0] instanceof URL ? a[0].pathname : a[0])); return was.apply(this, a); };
  };
  for (const n of READS) wrap(n, (p) => opened.add(p));
  for (const n of WRITES) wrap(n, (p) => wrote.push(`${n} ${p}`));
  syncBuiltinESMExports();
  try { return { out: f(), opened, wrote }; }
  finally { for (const [n, v] of kept) anyFs[n] = v as never; syncBuiltinESMExports(); }
}

test("over a copy of a home: every path it opens is hashed, unchanged after, and nothing is written", () => {
  const orig = join(tmp, "fixture"), copy = join(tmp, "copy");
  build(orig);
  fs.cpSync(orig, copy, { recursive: true });
  // the copy's work.json names the copy's own project folder, as the person's names their own
  const wj = join(copy, "state", "work.json");
  fs.writeFileSync(wj, fs.readFileSync(wj, "utf8").split(orig).join(copy));

  const before = tree(copy);
  const { out, opened, wrote } = watched(() => carry({ home: join(copy, "home"), state: wj, logDir: join(copy, "log"), settings: { look: { text: 15 } }, now: NOW }));
  const after = tree(copy);

  assert.deepEqual(wrote, [], "carry writes nothing");
  assert.ok(opened.size > 5, "the wrap saw carry's reads");
  const outside = [...opened].filter((p) => !before.has(p));
  assert.deepEqual(outside, [], "every path carry opened is one of those hashed (under the copy, there before it ran)");
  for (const p of opened) assert.equal(after.get(p), before.get(p), `${relative(copy, p)} unchanged`);
  assert.deepEqual([...after.entries()], [...before.entries()], "every file and folder under the copy unchanged");
  assert.deepEqual([...tree(orig).keys()].length, before.size, "the copy is the whole fixture");

  // what it read
  const kinds = Object.fromEntries(out.places.map((p) => [p.id.startsWith("/") ? relative(copy, p.id) : p.id, p.kind]));
  assert.deepEqual(kinds, { Code: null, "Code/app": "build", Family: "life", School: "life", "School/bio 201": null, "elsewhere/site": "build" });
  assert.equal(out.places.find((p) => p.id === "Code/app")?.parent, "Code");
  assert.deepEqual(out.stickies.map((s) => [s.place, s.items.map((i) => i.t)]), [["School", ["Jayden: revise cells", "Jayden: bio lab write-up"]]]);
  assert.deepEqual(out.things.map((t) => t.id), ["it-aaaaaaaaaaaa"]);
  assert.deepEqual(out.asks.map((a) => a.words), ["Sign Tomás's school trip form"]);
  assert.deepEqual(out.sessions.map((s) => s.id).sort(), ["s-dev-1", "s-sam-1"]);
  assert.deepEqual(out.ais.map((a) => [a.name, a.folders]), [["School helper", ["School"]]]);
  assert.equal(out.order[0], "g:g1");
  assert.deepEqual(out.settings, { look: { text: 15 } });
  assert.equal(out.yesterday?.day, "2026-11-18");
  assert.deepEqual(out.yesterday?.events.map((e) => e.kind), ["seat.turn", "thing.done"]);
  assert.ok(!JSON.stringify(out.yesterday).includes("secret"), "yesterday carries no words");
});

test("a home with nothing in it reads as empty, and still writes nothing", () => {
  const h = join(tmp, "empty");
  fs.mkdirSync(h);
  const before = tree(h);
  const { out, wrote } = watched(() => carry({ home: h, state: join(h, "no-work.json"), logDir: join(h, "no-log"), now: NOW }));
  assert.deepEqual(wrote, []);
  assert.deepEqual(tree(h), before);
  assert.deepEqual([out.places, out.sessions, out.things, out.yesterday], [[], [], [], null]);
});

test("a home folder holding only Sol's stores for a project (sessions/, blocks/) is Sol's own, never a place; one with anything else is", () => {
  const h = join(tmp, "stores"), w = (p: string, text: string) => { fs.mkdirSync(join(h, p, ".."), { recursive: true }); fs.writeFileSync(join(h, p), text); };
  w("sol/sessions/s-1/stage.json", "{}\n");
  fs.mkdirSync(join(h, "sol", "blocks"), { recursive: true });
  w("sol/.DS_Store", "");
  w("cli/sessions/s-2/stage.json", "{}\n");
  w("World Building/CLAUDE.md", "# World Building\n");
  w("Notes/sessions/s-3/stage.json", "{}\n");
  w("Notes/ideas.md", "- one\n");
  fs.mkdirSync(join(h, "Empty"), { recursive: true });
  const { out, wrote } = watched(() => carry({ home: h, state: join(h, "no-work.json"), logDir: join(h, "no-log"), now: NOW }));
  assert.deepEqual(wrote, []);
  assert.deepEqual(out.places.map((p) => p.id).sort(), ["Empty", "Notes", "Notes/sessions", "World Building"], "sol and cli hold only Sol's stores; Notes holds a file of the person's");
  // a folder no session ran in still names its rules files, so its empty card says "Has CLAUDE.md" (face known.ts ofFound)
  assert.deepEqual(out.places.find((p) => p.id === "World Building")?.rules, ["CLAUDE.md"]);
  assert.equal(out.places.find((p) => p.id === "Empty")?.rules, undefined);
});

test("carry.ts and carry-apps.ts import no write from node:fs: a file is opened for reading only", () => {
  const src = fs.readFileSync(new URL("./carry.ts", import.meta.url), "utf8");
  const fromFs = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:fs"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
  assert.deepEqual(fromFs.sort(), ["closeSync", "openSync", "readFileSync", "readSync", "readdirSync", "statSync"]);
  assert.deepEqual([...src.matchAll(/openSync\(([^)]*)\)/g)].map((m) => m[1]), ['p, "r"'], "the one open is read only");
  assert.ok(!/node:fs\/promises|from "\.\/file\.js"|from "\.\/(pos|zones|diary|movein)\.js"/.test(src));
  const apps = fs.readFileSync(new URL("./carry-apps.ts", import.meta.url), "utf8");
  assert.ok(!/from "node:fs|from "fs|node:child_process|from "\.\/file\.js"/.test(apps), "carry-apps touches the disk only through the Reader");
});

/** a person's Claude Code and Codex, with secrets where secrets live (that must never be carried) */
const SECRETS = ["sk-SECRET-ENV", "SECRET-ARG", "Bearer SECRET-HEADER", "SECRET-ENV2", "SECRET-ARG2", "npx-secret-command", "tok-AUTH", "RULES-WORDS"];
const GIT = ".g" + "it";
function buildApps(root: string) {
  const u = join(root, "user");
  const w = (p: string, text: string) => { fs.mkdirSync(join(u, p, ".."), { recursive: true }); fs.writeFileSync(join(u, p), text); };
  const line = (cwd: string) => JSON.stringify({ type: "user", cwd, sessionId: "x", message: { role: "user", content: "hi" } }) + "\n";
  const api = join(u, "code", "api"), site = join(u, "code", "site"), notes = join(u, "notes");
  // the folders themselves
  w(`code/api/${GIT}/HEAD`, "ref: refs/heads/main\n");
  w("code/api/package.json", "{}\n");
  w("code/api/CLAUDE.md", "RULES-WORDS: never say these\n");
  w(`code/api/.claude/worktrees/w1/${GIT}`, `gitdir: ${api}/${GIT}/worktrees/w1\n`);
  w("code/site/index.ts", "export {};\n");
  w("code/site/AGENTS.md", "RULES-WORDS\n");
  w("notes/plan.md", "# plan\n");
  w("notes/.claude/CLAUDE.md", "RULES-WORDS\n");
  w("sol-home/.keep", "");
  // Claude Code: projects/<dir>/<uuid>.jsonl, the cwd in each transcript's head (the folder names are never decoded)
  w(".claude/projects/-not-a-path-a/a1.jsonl", JSON.stringify({ type: "summary", summary: "x" }) + "\n" + line(api));
  w(".claude/projects/-not-a-path-a/a2.jsonl", line(api));
  w(".claude/projects/-not-a-path-a/a3.jsonl", line(api));
  w(".claude/projects/-wt/w.jsonl", line(join(api, ".claude", "worktrees", "w1")));
  w(".claude/projects/-notes/n1.jsonl", line(notes));
  w(".claude/projects/-gone/g1.jsonl", line(join(u, "gone")));
  w(".claude/projects/-home/h1.jsonl", line(u));
  w("tmp/scratch-x/.keep", "");   // a temporary folder: the test names it as one (the machine's own may hold this whole tree)
  w(".claude/projects/-tmp/t1.jsonl", line(join(u, "tmp", "scratch-x")));
  w(".claude/projects/-sol/s1.jsonl", line(join(u, "sol-home", "agent")));
  w(".claude/skills/review/SKILL.md", "---\nname: review\n---\n");
  w(".claude/skills/ship/SKILL.md", "---\nname: ship\n---\n");
  w(".claude/plugins/cache/p/1.0/skills/tdd/SKILL.md", "x");
  w(".claude/plugins/cache/p/1.0/skills/writing/outline/SKILL.md", "x");   // a plugin's category holds its skills
  w(".claude/skills/synced/bucket-1/notes/SKILL.md", "x");                // a synced bucket, two levels down
  w(".claude/plugins/cache/q/1.0/skills/off/SKILL.md", "x");
  w(".claude/plugins/installed_plugins.json", JSON.stringify({ version: 2, plugins: { "p@m": [{ scope: "user", installPath: join(u, ".claude/plugins/cache/p/1.0") }], "q@m": [{ scope: "user", installPath: join(u, ".claude/plugins/cache/q/1.0") }] } }));
  w(".claude/settings.json", JSON.stringify({ permissions: { defaultMode: "acceptEdits", allow: ["Bash(npx-secret-command)"] }, enabledPlugins: { "p@m": true, "q@m": false }, mcpServers: { linear: { command: "npx-secret-command", args: ["SECRET-ARG"], env: { LINEAR_TOKEN: "sk-SECRET-ENV" } } }, env: { API_KEY: "sk-SECRET-ENV" } }));
  w(".claude/.claude.json", JSON.stringify({ userID: "tok-AUTH", mcpServers: { github: { type: "http", url: "https://example.invalid", headers: { Authorization: "Bearer SECRET-HEADER" } } }, projects: { [api]: { mcpServers: {} } } }));
  // Codex: sessions/YYYY/MM/DD/rollout-*.jsonl, the cwd and originator in the first line
  const meta = (cwd: string, originator: string, id: string) => JSON.stringify({ timestamp: "2026-11-20T10:00:00Z", type: "session_meta", payload: { id, cwd, originator, base_instructions: { text: "x".repeat(6000) } } }) + "\n" + JSON.stringify({ type: "response_item" }) + "\n";
  w(".codex/sessions/2026/11/20/rollout-2026-11-20T10-00-00-c1.jsonl", meta(site, "codex_cli_rs", "c1"));
  w(".codex/sessions/2026/11/20/rollout-2026-11-20T11-00-00-c2.jsonl", meta(site, "codex_sdk_ts", "c2"));
  w(".codex/sessions/2026/11/19/rollout-2026-11-19T10-00-00-c3.jsonl", meta(api, "codex_cli_rs", "c3"));
  w(".codex/sessions/2026/11/19/rollout-2026-11-19T11-00-00-c4.jsonl", meta(site, "codex_exec", "c4"));
  w(".codex/sessions/2026/11/19/rollout-2026-11-19T12-00-00-c5.jsonl", meta(join(u, ".codex", "x"), "codex_cli_rs", "c5"));
  w(".codex/config.toml", 'model = "x"\napproval_policy = "on-request"\n\n[projects."/a"]\ntrust_level = "trusted"\n\n[mcp_servers.figma]\ncommand = "npx-secret-command"\nargs = ["SECRET-ARG2"]\n\n[mcp_servers.figma.env]\nFIGMA_KEY = "SECRET-ENV2"\n\n[mcp_servers."my tools"]\nurl = "https://example.invalid"\n');
  w(".codex/auth.json", JSON.stringify({ tokens: { access_token: "tok-AUTH" } }));
  w(".codex/skills/deploy/SKILL.md", "x");
  // the times: api the newest, notes the oldest
  const at = (p: string, d: Date) => fs.utimesSync(join(u, p), d, d);
  at(".claude/projects/-not-a-path-a/a3.jsonl", new Date(2026, 10, 21, 9));
  at(".claude/projects/-notes/n1.jsonl", new Date(2026, 9, 1));
  return { u, api, site, notes };
}

test("Claude Code and Codex on this Mac: places, kinds, rules and AIs by name, read only, and no secret carried", () => {
  const root = join(tmp, "apps");
  const { u, api, site, notes } = buildApps(root);
  const before = tree(root);
  const apps = appsWhere(u, { CLAUDE_CONFIG_DIR: join(u, ".claude"), CODEX_HOME: join(u, ".codex") }, [join(u, "sol-home")]);
  const { out, opened, wrote } = watched(() => carry({ home: join(u, "sol-home"), now: NOW, apps: { ...apps, temp: [join(u, "tmp")] } }));
  const after = tree(root);

  // read only: nothing written, every path opened was there before (but the one folder that is gone), all unchanged
  assert.deepEqual(wrote, []);
  const sol = join(u, "sol-home") + "/";
  assert.deepEqual([...opened].filter((p) => !before.has(p) && !p.startsWith(sol)), [join(u, "gone")], "only the gone folder (and Sol's own empty stores) looked for and not found");
  for (const p of opened) assert.equal(after.get(p), before.get(p), `${relative(root, p)} unchanged`);
  assert.deepEqual([...after.entries()], [...before.entries()], "every file and folder under ~ unchanged");
  assert.ok(![...opened].some((p) => p.endsWith("auth.json")), "Codex's sign-in is never opened");
  assert.ok(![...opened].some((p) => /CLAUDE\.md$|AGENTS\.md$/.test(p)), "a rules file is seen in its folder's list, never opened");
  assert.ok([...opened].some((p) => p.endsWith("a3.jsonl")), "the transcripts were read through the wrap");

  // places: one per folder still on disk, newest first; the worktree is its repo; home, /tmp, Sol's own and gone left out
  const mine = out.places.filter((p) => p.from === "claude" || p.from === "codex");
  assert.deepEqual(mine.map((p) => p.path), [api, site, notes]);
  const by = Object.fromEntries(mine.map((p) => [p.name, p]));
  assert.deepEqual(by.api.sessions, { claude: 4, codex: 1 }, "three transcripts, one in its worktree, one Codex talk");
  assert.deepEqual(by.site.sessions, { codex: 2 }, "codex exec is not a talk");
  assert.equal(by.site.from, "codex");
  assert.deepEqual([by.api.kind, by.site.kind, by.notes.kind], ["build", "build", null], "a repo, code, notes: unsure");
  assert.deepEqual([by.api.holds.repo, by.site.holds.repo, by.site.holds.code], [true, false, true]);
  assert.deepEqual([by.api.rules, by.site.rules, by.notes.rules], [["CLAUDE.md"], ["AGENTS.md"], [".claude/CLAUDE.md"]]);
  assert.equal(by.api.label, "~/code/api");
  assert.equal(by.api.id, api, "a new place's id is its path");

  // the AIs, by name only
  const cl = out.ais.find((a) => a.id === "app:claude")!, cx = out.ais.find((a) => a.id === "app:codex")!;
  assert.deepEqual([cl.name, cl.skills, cl.tools, cl.mode], ["Claude Code", ["notes", "outline", "review", "ship", "tdd"], ["github", "linear"], "edits without asking"]);
  assert.deepEqual([cx.name, cx.skills, cx.tools, cx.mode], ["Codex", ["deploy"], ["figma", "my tools"], "asks when it needs to"]);
  assert.deepEqual(out.apps, [{ app: "claude", projects: 2, sessions: 5 }, { app: "codex", projects: 2, sessions: 3 }]);

  // no secret, and no field that holds one, anywhere in what it says
  const said = JSON.stringify(out);
  for (const x of SECRETS) assert.ok(!said.includes(x), `"${x}" is not carried`);
  const keys = new Set<string>();
  const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  walk(out);
  for (const k of ["env", "headers", "args", "command", "token", "tokens", "url", "access_token", "Authorization"]) assert.ok(!keys.has(k), `no "${k}" field`);
});

test("with no apps asked for, nothing of ~/.claude or ~/.codex is read (next.state's read); none found reads as none", () => {
  const u = join(tmp, "apps", "user");
  const { opened } = watched(() => carry({ home: join(u, "sol-home"), now: NOW }));
  assert.ok(![...opened].some((p) => p.includes("/.claude") || p.includes("/.codex")));
  const bare = join(tmp, "bare");
  fs.mkdirSync(join(bare, "sol-home"), { recursive: true });
  const out = carry({ home: join(bare, "sol-home"), now: NOW, apps: appsWhere(bare, {}) });
  assert.deepEqual([out.places, out.ais, out.apps], [[], [], []]);
});

test("a folder inside a project is its own place when it has its own rules or .claude/; else its sessions go to the innermost one", () => {
  // Denise's studio: a repo; the zine inside it has its own CLAUDE.md, the shop its own .claude/; assets and drafts are plain
  const u = join(tmp, "nested", "user");
  const w = (p: string, text: string) => { fs.mkdirSync(join(u, p, ".."), { recursive: true }); fs.writeFileSync(join(u, p), text); };
  const studio = join(u, "studio");
  const line = (cwd: string) => JSON.stringify({ type: "user", cwd, sessionId: "x" }) + "\n";
  w(`studio/${GIT}/HEAD`, "ref: refs/heads/main\n");
  w("studio/zine/CLAUDE.md", "x");
  w("studio/zine/drafts/one.md", "x");
  w("studio/shop/.claude/settings.local.json", "{}");
  w("studio/assets/a.png", "x");
  const at = (dir: string, cwd: string, n: number) => { for (let i = 0; i < n; i++) w(`.claude/projects/${dir}/s${i}.jsonl`, line(cwd)); };
  at("-studio", studio, 3);
  at("-zine", join(studio, "zine"), 2);
  at("-drafts", join(studio, "zine", "drafts"), 1);
  at("-shop", join(studio, "shop"), 1);
  at("-assets", join(studio, "assets"), 4);
  // Sol's own home has its own rules file (Sol's, not hers): its root and its plain folders are never a place; her Home
  // folder in it ("pottery", its own AGENTS.md) is, with the sessions of a plain folder inside it
  w("sol-home/CLAUDE.md", "x");
  w("sol-home/next/you.json", "{}");
  w("sol-home/pottery/AGENTS.md", "x");
  w("sol-home/pottery/glazes/list.md", "x");
  at("-solhome", join(u, "sol-home"), 5);
  at("-solnext", join(u, "sol-home", "next"), 2);
  at("-pottery", join(u, "sol-home", "pottery"), 2);
  at("-glazes", join(u, "sol-home", "pottery", "glazes"), 1);
  const apps = appsWhere(u, { CLAUDE_CONFIG_DIR: join(u, ".claude"), CODEX_HOME: join(u, ".codex") }, [join(u, "sol-home")]);
  const out = carry({ home: join(u, "sol-home"), now: NOW, apps: { ...apps, temp: [join(u, "tmp")] } });   // the fixture is itself in a temp folder
  // pottery is a Home folder Sol already holds: it gains the sessions and keeps where it came from
  const by = Object.fromEntries(out.places.filter((p) => p.sessions?.claude).map((p) => [p.name, p.sessions!.claude]));
  assert.deepEqual(by, { studio: 7, zine: 3, shop: 1, pottery: 3 });
});

test("a second checkout of a listed repo stands inside its folder as another copy (BR1 order 4e): a worktree's folder, a clone with its remote; never the repo's own folder, never another repo", () => {
  // Lucy's Mac, in memory: sol is her repo; br1-face is a worktree of it (she worked in its mac folder); old-sol a clone
  // of the same remote written another way; sol/app a folder of the repo itself; shop another repo
  const L = "/Users/lucy";
  const files: Record<string, string> = {
    [`${L}/code/sol/${GIT}/config`]: '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:lucy/sol.git\n',
    [`${L}/scratch/br1-face/${GIT}`]: `gitdir: ${L}/code/sol/${GIT}/worktrees/br1-face\n`,
    [`${L}/code/sol/${GIT}/worktrees/br1-face/commondir`]: "../..\n",
    [`${L}/old/old-sol/${GIT}/config`]: '[remote "origin"]\n\turl = https://github.com/Lucy/sol\n',
    [`${L}/code/shop/${GIT}/config`]: '[remote "origin"]\n\turl = git@github.com:lucy/shop.git\n',
  };
  const dirs: Record<string, string[]> = {
    [`${L}/code/sol`]: [`${GIT}/`, "app/", "package.json"], [`${L}/code/sol/app`]: ["index.ts"],
    [`${L}/code/sol/${GIT}`]: ["config", "worktrees/"], [`${L}/code/sol/${GIT}/worktrees/br1-face`]: ["commondir"],
    [`${L}/old/old-sol/${GIT}`]: ["config"], [`${L}/code/shop/${GIT}`]: ["config"],
    [`${L}/scratch/br1-face`]: [GIT, "sol/"], [`${L}/scratch/br1-face/sol`]: ["mac/"], [`${L}/scratch/br1-face/sol/mac`]: ["CLAUDE.md"],
    [`${L}/old/old-sol`]: [`${GIT}/`], [`${L}/code/shop`]: [`${GIT}/`],
  };
  const r = {
    text: (p: string) => files[p] ?? null, head: () => null, time: () => null,
    list: (p: string) => dirs[p]?.map((n) => ({ name: n.replace(/\/$/, ""), dir: n.endsWith("/") })) ?? null,
  };
  const at = (path: string, claude: number) => ({ path, sessions: { claude } });
  const places = [at(`${L}/code/sol`, 40), at(`${L}/scratch/br1-face/sol/mac`, 6), at(`${L}/old/old-sol`, 2), at(`${L}/code/sol/app`, 3), at(`${L}/code/shop`, 9)];
  assert.deepEqual(Object.fromEntries(copiesOf(r, places, L)), {
    [`${L}/scratch/br1-face/sol/mac`]: `${L}/code/sol`,   // inside a worktree of sol
    [`${L}/old/old-sol`]: `${L}/code/sol`,                // the same remote, written another way
  }, "sol/app is the repo itself and shop another repo: neither is a copy");
  // with sol itself not listed, old-sol, its own checkout, is the repo then: br1-face's mac and sol's app folder sit in
  // other checkouts of it
  assert.deepEqual(Object.fromEntries(copiesOf(r, places.filter((p) => p.path !== `${L}/code/sol`), L)), {
    [`${L}/scratch/br1-face/sol/mac`]: `${L}/old/old-sol`, [`${L}/code/sol/app`]: `${L}/old/old-sol`,
  });
  assert.deepEqual(Object.fromEntries(copiesOf(r, [places[1], places[4]], L)), {}, "a worktree alone, with no checkout of its repo listed, stays at the top");
});
