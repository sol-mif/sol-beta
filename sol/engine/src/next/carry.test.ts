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

test("carry.ts imports no write from node:fs", () => {
  const src = fs.readFileSync(new URL("./carry.ts", import.meta.url), "utf8");
  const fromFs = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:fs"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
  assert.deepEqual(fromFs.sort(), ["readFileSync", "readdirSync"]);
  assert.ok(!/node:fs\/promises|from "\.\/file\.js"|from "\.\/(pos|zones|diary|movein)\.js"/.test(src));
});
