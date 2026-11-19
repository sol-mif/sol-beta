// The three document checks (step 0e of the v2 backend plan; src/team/docs-check.ts): a relative link points at a file
// that is in the repository and at a heading of it, a decision record has its sections (what was considered and not
// chosen among them), an upgrade guide stays within 500 words. Temp folders and plain text; nothing reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";

const { checkLinks, checkSections, checkLength, checkDoc, linksOf, anchorsOf, slug, wordCount, typeOf, treeOf, say, DOC_TYPES } = await import("../src/team/docs-check.ts");

const SCRIPT = resolve(import.meta.dirname, "../src/team/docs-check.ts");
const TEMPLATE = ".github/ISSUE_TEMPLATE/decision.md";
const DECISION = DOC_TYPES.find((t) => t.name === "decision")!, GUIDE = DOC_TYPES.find((t) => t.name === "upgrade-guide")!;

/** a temp folder holding these files; the caller removes it */
function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "docs-check-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
/** the same files held in memory, and every path the check asked about */
function held(files: Record<string, string>) {
  const asked: string[] = [];
  const has = (p: string) => p === "" || p in files || Object.keys(files).some((f) => f.startsWith(p + "/"));
  return { asked, tree: { has: (p: string) => { asked.push(p); return has(p); }, read: (p: string) => { asked.push(p); return files[p] ?? null; } } };
}
const links = (file: string, files: Record<string, string>) => checkLinks(file, files[file], held(files).tree).map(say);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const record = (sections: string[]) => sections.map((s) => `## ${s}\n\nSomething about it.\n`).join("\n");

test("links: a link to a file that is there passes, on the disk too", () => {
  const files = { "a.md": "# A\n\nRead [the other page](b.md), [the one below](docs/c.md) and [the folder](docs/).\n", "b.md": "# B\n", "docs/c.md": "Back to [a](../a.md) and [b](/b.md).\n" };
  assert.deepEqual(links("a.md", files), []);
  assert.deepEqual(links("docs/c.md", files), [], "a path from the file's own folder, and one from the root");
  const root = folder(files);
  try {
    for (const f of Object.keys(files)) assert.deepEqual(checkLinks(f, files[f], treeOf(root)), [], f);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("links: a link to a file that is missing fails, and names the file and the line", () => {
  const files = { "a.md": "# A\n\nFirst line.\nRead [the other page](b.md) here.\n" };
  const miss = checkLinks("a.md", files["a.md"], held(files).tree);
  assert.equal(miss.length, 1);
  assert.deepEqual({ check: miss[0].check, file: miss[0].file, line: miss[0].line }, { check: "links", file: "a.md", line: 4 });
  assert.match(say(miss[0]), /^a\.md:4: .*b\.md/);
  const root = folder(files);
  try {
    assert.equal(checkLinks("a.md", files["a.md"], treeOf(root)).length, 1, "on the disk");
    // a Mac's disk cannot tell B.md from b.md; GitHub can, so the letter case must be the file's own
    writeFileSync(join(root, "B.md"), "# B\n");
    assert.equal(checkLinks("a.md", files["a.md"], treeOf(root)).length, 1, "B.md is not b.md");
    assert.equal(checkLinks("a.md", files["a.md"], treeOf(root, ["a.md", "B.md"])).length, 1, "nor in git's list, the way CI reads it");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("links: every way Markdown writes a link is read, and code is not", () => {
  const text = [
    "An ![image](pic.png \"its title\"), a [link in <angles>](<my file.md>) and [![a badge](badge.svg)](there.md).",   // 1
    "A [reference][ref] and `[not a link](in-code.md)`.",                                                             // 2
    "",
    "[ref]: ref.md \"a title\"",                                                                                      // 4
    "[^1]: a footnote, not a link",
    "```",
    "[inside a code block](block.md)",
    "```",
    "<!-- [in a comment](comment.md) -->",
    "A file with [brackets](notes(1).md) and [a space](my%20file.md?plain=1).",                                       // 10
    "The body ends `**Shown**: commits: [`<short>`](<commit url>)",   // the "[" is inside code: no link (sol/PROTOCOL.md says this)
  ].join("\n");
  assert.deepEqual(linksOf(text), [
    { to: "pic.png", line: 1 }, { to: "my file.md", line: 1 }, { to: "badge.svg", line: 1 }, { to: "there.md", line: 1 },
    { to: "ref.md", line: 4 }, { to: "notes(1).md", line: 10 }, { to: "my%20file.md?plain=1", line: 10 },
  ]);
  const files = { "a.md": text, "my file.md": "x" };
  assert.deepEqual(links("a.md", files).map((l) => l.replace(/^a\.md:(\d+):.*?"([^"]+)".*$/, "$1 $2")), ["1 pic.png", "1 badge.svg", "1 there.md", "4 ref.md", "10 notes(1).md"]);
});

test("links: a link that leaves the repository fails", () => {
  const files = { "docs/a.md": "See [the neighbour](../../other/README.md) and [the root](../README.md).\n", "README.md": "# Home\n" };
  const out = links("docs/a.md", files);
  assert.equal(out.length, 1);
  assert.match(out[0], /^docs\/a\.md:1: .*outside the repository/);
});

test("links: a link to a heading that is missing fails; one that is there passes", () => {
  const b = "# The plan\n\n## What we do first\n\n## `sol/take` and the *brief*, twice!\n\n## What we do first\n\n<a id=\"by-hand\"></a>\n\nSetext title\n============\n\n```\n## not a heading\n```\n";
  assert.deepEqual([...anchorsOf(b)], ["the-plan", "what-we-do-first", "soltake-and-the-brief-twice", "what-we-do-first-1", "setext-title", "by-hand"]);
  assert.equal(slug("Step 2: the **gate** (CI)"), "step-2-the-gate-ci");
  assert.equal(slug("a  b"), "a--b", "each space is a \"-\", as GitHub writes it");
  assert.deepEqual([...anchorsOf("## a  b\n\nSetext  two\n---\n")], ["a--b", "setext--two"]);
  assert.deepEqual([...anchorsOf("---\nname: Decision\nlabels: decision\n---\n# One\n")], ["one"], "the front matter is no heading");
  assert.deepEqual([...anchorsOf("Write `<!--` to open a comment.\n\n## Still read\n\n<!-- a real one\n## Not read\n-->\n## Read again\n")], ["still-read", "read-again"], "a comment mark inside code opens nothing");
  const ok = { "a.md": "# A\n\n[one](b.md#what-we-do-first) [two](b.md#what-we-do-first-1) [three](b.md#by-hand) [mine](#a) [a line of code](x.ts#L12) [caps](b.md#The-Plan)\n", "b.md": b, "x.ts": "" };
  assert.deepEqual(links("a.md", ok), []);
  const bad = { "a.md": "# A\n\nSee [the heading](b.md#heading).\nAnd [here](#nowhere), and [the fenced one](b.md#not-a-heading).\n", "b.md": b };
  const out = links("a.md", bad);
  assert.equal(out.length, 3);
  assert.match(out[0], /^a\.md:3: .*b\.md.*#heading/);
  assert.match(out[1], /^a\.md:4: .*#nowhere/);
  assert.match(out[2], /^a\.md:4: .*#not-a-heading/);
});

test("a page written with Windows line ends reads the same as one written with \\n", () => {
  const unix = "# Title\n\n## Two words\n\nSee [it](#two-words) and [there](b.md#b).\n\n**The question** what\n";
  const dos = unix.replace(/\n/g, "\r\n"), files = { "a.md": dos, "b.md": "# B\r\n" };
  assert.deepEqual([...anchorsOf(dos)], [...anchorsOf(unix)]);
  assert.deepEqual([...anchorsOf(dos)], ["title", "two-words"]);
  assert.deepEqual(links("a.md", files), []);
  assert.deepEqual(linksOf(dos), linksOf(unix));
  assert.equal(wordCount(dos), wordCount(unix));
  const sections = record(["The question", "The options", "Considered and not chosen", "Decided"]).replace(/\n/g, "\r\n");
  assert.deepEqual(checkSections("d.md", sections, DECISION), []);
});

test("links: a web link is skipped, and nothing can fetch it", async () => {
  const files = { "a.md": "[the site](https://example.com/x.md#top) [plain](http://example.com) [mail](mailto:a@b.c) [no scheme](//example.com/y.md) <https://example.com/z>\n" };
  const { tree, asked } = held(files);
  const before = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (() => { fetched++; throw new Error("the check reached for the network"); }) as typeof fetch;
  try { assert.deepEqual(checkLinks("a.md", files["a.md"], tree), []); } finally { globalThis.fetch = before; }
  assert.equal(fetched, 0);
  assert.deepEqual(asked, [], "a web link is not even looked for on the disk");
  // the function is handed the file, its text and the repository's files, and nothing that reaches a network; and the
  // script imports nothing that could: node's own disk, path and process modules only
  assert.equal(checkLinks.length, 3);
  const imports = [...readFileSync(SCRIPT, "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["node:child_process", "node:fs", "node:path", "node:url"]);
  assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /\bfetch\(|node:https?|node:net|node:dns|import\(/);
});

test("sections: a decision record with every required section passes", () => {
  assert.deepEqual(DECISION.sections, ["The question", "The options", "Considered and not chosen", "Decided"]);
  assert.deepEqual(checkSections("d.md", record(DECISION.sections!), DECISION), []);
  // the issue template writes them as bold leads with a hint after; a record may say more, in any order and any case
  const bold = "**The question** (one sentence)\n\n**The options** (two to four)\n\n**Considered and not chosen:** each\n\n**Proposed**\n\n**Decided** (the line)\n";
  assert.deepEqual(checkSections("d.md", bold, DECISION), []);
  assert.deepEqual(checkSections("d.md", "# Decided\n\n### the QUESTION\n\n## The options (three)\n\n## Considered and not chosen: why\n", DECISION), []);
});

test("sections: a decision record without \"Considered and not chosen\" fails, and names the section", () => {
  const miss = checkSections("docs/decisions/0041-the-log.md", record(["The question", "The options", "Decided"]), DECISION);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].check, "sections");
  assert.match(say(miss[0]), /^docs\/decisions\/0041-the-log\.md: .*"Considered and not chosen"/);
  // the words in a sentence or in a code block are not the section
  const said = "## The question\n\n## The options\n\nConsidered and not chosen: nothing.\n\n```\n## Considered and not chosen\n```\n\n## Decided\n";
  assert.equal(checkSections("d.md", said, DECISION).length, 1);
  assert.equal(checkSections("d.md", record(["The question", "The options", "Considered and not chosen", "Decidedly open"]), DECISION).length, 1, "a longer word is another section");
  assert.equal(checkSections("d.md", "", DECISION).length, 4, "an empty record misses all four");
  assert.deepEqual(checkSections("d.md", "", GUIDE), [], "a type with no required sections asks for none");
});

test("length: an upgrade guide of 501 words fails; 500 passes", () => {
  assert.equal(GUIDE.words, 500);
  assert.deepEqual(checkLength("UPGRADE.md", `# ${words(500)}\n`, GUIDE), []);
  const miss = checkLength("UPGRADE.md", `# ${words(501)}\n`, GUIDE);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].check, "length");
  assert.match(say(miss[0]), /^UPGRADE\.md: 501 words.*500/);
  assert.deepEqual(checkLength("d.md", words(5000), DECISION), [], "a type with no limit has none");
});

test("length: what counts as a word", () => {
  assert.equal(wordCount("One, two; three. Four-five (six) 7 | — ---\n"), 6);
  assert.equal(wordCount("---\nname: x\nabout: not the page\n---\nTwo words\n"), 2, "the front matter is not the page");
  assert.equal(wordCount("Run it:\n\n```sh\nnpm run build && npm test\n```\n\nThen `npm start` works.\n"), 6, "a code block is not prose, a word of code in a sentence is");
  assert.equal(wordCount("See [the page](docs/a/very/long/path.md) <!-- a note to ourselves -->\n"), 3, "a link is its text");
  assert.equal(wordCount("升級指南 two"), 5, "a character of Chinese is a word");
});

test("which file is which type is said by its path, in one table", () => {
  assert.equal(typeOf(TEMPLATE)?.name, "decision");
  assert.equal(typeOf("docs/decisions/0041-the-log.md")?.name, "decision");
  assert.equal(typeOf("docs/decisions/README.md"), null, "the folder's own page is not a record");
  for (const f of ["UPGRADE.md", "docs/UPGRADING.md", "docs/beta/upgrade-0.9.md"]) assert.equal(typeOf(f)?.name, "upgrade-guide", f);
  for (const f of ["README.md", "docs/PLAN.md", "sol/engine/src/team/decisions.ts", ".github/ISSUE_TEMPLATE/bug.md"]) assert.equal(typeOf(f), null, f);
  // all three checks on one file: the links of any page, the sections and the limit of its type
  const files = { "docs/decisions/0041-the-log.md": `${record(["The question", "The options", "Decided"])}\nSee [the plan](../PLAN.md).\n`, "UPGRADE.md": `${words(501)} [back](README.md)\n`, "README.md": "# Home\n" };
  const { tree } = held(files);
  assert.deepEqual(checkDoc("docs/decisions/0041-the-log.md", files["docs/decisions/0041-the-log.md"], tree).map((m) => m.check), ["links", "sections"]);
  assert.deepEqual(checkDoc("UPGRADE.md", files["UPGRADE.md"], tree).map((m) => m.check), ["length"]);
  assert.deepEqual(checkDoc("README.md", files["README.md"], tree), []);
  assert.deepEqual(checkDoc("README.md", files["README.md"], tree, DECISION).length, 4, "a type given by hand wins over the path");
});

// a tester's copy has no .github/ISSUE_TEMPLATE: the dev's (#300)
test("the repository's own decision template has the required sections", { skip: devOnly(TEMPLATE) }, () => {
  const text = readFileSync(join(ROOT, TEMPLATE), "utf8");
  assert.deepEqual(checkDoc(TEMPLATE, text, treeOf(ROOT)).map(say), []);
  assert.match(text, /^\*\*Considered and not chosen\*\*/m);
  assert.ok(text.indexOf("**The options**") < text.indexOf("**Considered and not chosen**") && text.indexOf("**Considered and not chosen**") < text.indexOf("**Proposed**"), "after the options, before what is proposed");
  assert.match(text, /^---\nname: Decision\nabout: The team must choose\nlabels: decision\n---\n/, "the template's head is as it was");
});

test("the check runs on plain node: exit 0 when all is well, 1 with each miss on its own line, 2 when it cannot read", () => {
  const root = folder({
    "a.md": "# A\n\n[b](b.md)\n", "b.md": "# B\n\n[gone](gone.md)\n", "notes.txt": "[not Markdown](gone.md)\n",
    "docs/decisions/0001-x.md": record(["The question", "The options", "Decided"]), "UPGRADE.md": words(501),
    "node_modules/pkg/README.md": "[theirs](gone.md)\n", "draft.md": record(["The question"]),
  });
  const run = (...args: string[]) => { const r = spawnSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } }); return { code: r.status, out: r.stdout + r.stderr }; };
  try {
    assert.deepEqual(run("a.md").code, 0);
    assert.match(run("a.md").out, /docs: 1 file reads well/);
    const one = run("a.md", "b.md");
    assert.equal(one.code, 1);
    assert.match(one.out, /^docs: b\.md:3: .*gone\.md/m);
    // no file named: every Markdown file under the root, but what is not ours (node_modules, .git)
    const all = run();
    assert.equal(all.code, 1);
    assert.match(all.out, /^docs: b\.md:3: /m);
    assert.match(all.out, /^docs: docs\/decisions\/0001-x\.md: .*"Considered and not chosen"/m);
    assert.match(all.out, /^docs: UPGRADE\.md: 501 words/m);
    assert.doesNotMatch(all.out, /node_modules|notes\.txt/);
    assert.match(all.out, /3 things to fix in 5 files/);
    // a file whose path names no type, checked as one
    assert.equal(run("draft.md").code, 0);
    const typed = run("--type", "decision", "draft.md");
    assert.equal(typed.code, 1);
    assert.equal(typed.out.match(/^docs: draft\.md: no section/gm)?.length, 3);
    assert.equal(run("--type", "poem", "draft.md").code, 2);
    assert.equal(run("nowhere.md").code, 2);
    assert.equal(run("../outside.md").code, 2);
    assert.equal(run("--help").code, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("in a checkout the repository is what git holds: an ignored file on the disk is not in it, a new page is", () => {
  const root = folder({
    ".gitignore": "private/\n", "a.md": "# A\n\n[mine only](private/notes.md)\n", "private/notes.md": "# Notes\n",
    "docs/new.md": "[a](../a.md) and [its heading](../a.md#a)\n", "gone.md": "[nothing](nowhere.md)\n",
  });
  const env = { ...process.env, GITHUB_ACTIONS: "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  const git = (...a: string[]) => { const r = spawnSync("git", a, { cwd: root, env, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  const run = (cwd: string, ...args: string[]) => { const r = spawnSync("node", [SCRIPT, ...args], { cwd, env, encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
  try {
    git("init", "-q", "-b", "main"); git("add", "a.md", ".gitignore", "gone.md"); git("commit", "-qm", "the pages");
    rmSync(join(root, "gone.md"));   // taken off the disk, not yet committed: no longer a page to check
    const all = run(root);
    assert.equal(all.code, 1, all.out);
    assert.match(all.out, /^docs: a\.md:3: .*private\/notes\.md, which is not in the repository/m);
    assert.match(all.out, /1 thing to fix in 2 files/, "a.md and the new docs/new.md; not private/notes.md, not gone.md");
    // a file named by hand is read from where the command runs
    assert.equal(run(join(root, "docs"), "new.md").code, 0);
    assert.equal(run(join(root, "docs"), "../a.md").code, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("in GitHub Actions each miss is also an annotation on its line", () => {
  const root = folder({ "b.md": "# B\n\n[gone](gone.md)\n" });
  try {
    const r = spawnSync("node", [SCRIPT, "--root", root], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^::error file=b\.md,line=3::/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
