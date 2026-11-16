// Pages (#433, D1 of #413; team/pages.ts): the project's own pages, each a markdown file in its record, `.sol/pages/<id>.md`.
// The pure parts (the id, the head, the parts a big page rolls over into, a change laid over a page, the agent's lines)
// and the store against a fake record: a new page, a save that names the version it was opened at, someone else's
// change in between refused with the page as it is, a page over 900 KB in parts, a list that reads only what changed,
// the agent's write signed. The `page` kind is a block kind, and Sol's own pages block gives the three agent tools.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-pages-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const P = await import("../src/team/pages.ts");
const B = await import("../src/team/blocks.ts");
const M = await import("../src/team/memory.ts");

const at = "2026-10-30T15:00:00.000Z";
const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
/** a record of many files; a put with a sha that is not the file's is GitHub's 409; a put with none on a file that is
 *  there its 422. `list` answers the folder as the contents API does */
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  const puts: { path: string; message: string; sha?: string }[] = [];
  const hook: { before?: (path: string) => Promise<void> } = {};
  let n = 0, reads = 0;
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { reads++; const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { message: string; content: string; sha?: string }) => {
      const b = hook.before; if (b) { hook.before = undefined; await b(path); }
      puts.push({ path, message: w.message, sha: w.sha });
      const f = on.get(path);
      if (f && w.sha !== f.sha) throw ghError(w.sha ? "gh: is at x but expected y (HTTP 409)" : "gh: Invalid request. \"sha\" wasn't supplied. (HTTP 422)");
      on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++n}` });
      return "";
    },
    remove: async (_r: string, path: string, w: { sha: string }) => { const f = on.get(path); if (!f || f.sha !== w.sha) throw ghError("gh: sha does not match (HTTP 409)"); on.delete(path); return ""; },
    list: async (_r: string, dir: string) => {
      const here = [...on.entries()].filter(([p]) => p.startsWith(dir + "/"));
      if (!here.length) throw ghError("gh: Not Found (HTTP 404)");
      return JSON.stringify(here.map(([p, f]) => ({ name: p.slice(dir.length + 1), path: p, sha: f.sha, size: f.text.length, type: "file" })));
    },
  } } as any;
  return { d: { record: () => rec }, on, puts, hook, reads: () => reads, set: (p: string, t: string) => on.set(p, { text: t, sha: `x${++n}` }) };
}
let k = 0;
const fresh = () => { P.pages.forget(); return `o/pages-${++k}`; };

test("an id is the title as a slug, unique among the pages there are, short enough to stand on in presence", () => {
  assert.equal(P.pageId("The Roadmap, v2!", []), "the-roadmap-v2");
  assert.equal(P.pageId("Roadmap", ["roadmap", "roadmap-2"]), "roadmap-3");
  assert.equal(P.pageId("¿¿", []), "page");
  assert.equal(P.pageId("Café plans", []), "cafe-plans");
  const long = P.pageId("a very long title that goes on and on past every limit there is", []);
  assert.ok(P.PAGE_ID.test(long) && P.pageTile(long).length <= 40, long);
  assert.equal(P.tilePage(P.pageTile("roadmap")), "roadmap");
  assert.equal(P.tilePage("tool-calendar"), "");
});

test("the file: a head between --- lines, the title as JSON; read back the same; a file made by hand is all words", () => {
  const files = P.pageFiles({ id: "plan", title: "Plan: \"next\"\n---", made: "frank", by: "marcocyl04-ux", agent: true, at }, "# Plan\n\n- one\n---\nafter a divider\n");
  assert.equal(files.length, 1);
  assert.equal(files[0].path, ".sol/pages/plan.md");
  const back = P.parsePage("plan", files[0].text);
  assert.deepEqual(back.head, { id: "plan", title: "Plan: \"next\" ---", made: "frank", by: "marcocyl04-ux", agent: true, at, parts: 1 });
  assert.equal(back.body, "# Plan\n\n- one\n---\nafter a divider\n");
  const hand = P.parsePage("notes", "# Team notes\n\nwritten on GitHub\n");
  assert.equal(hand.head.title, "Team notes");
  assert.equal(hand.body, "# Team notes\n\nwritten on GitHub\n");
  assert.equal(P.parsePage("x", "---\nsol: page 9\ntitle: \"t\"\nparts: 1\n---\nhi").head.newer, true);
  // a by that is not a login is nobody, never a name someone could forge
  assert.equal(P.parsePage("x", "---\nsol: page 1\ntitle: \"t\"\nby: marco's agent\nparts: 1\n---\n").head.by, "");
});

test("a page over a part's size rolls over at line ends, never inside a character; the parts joined are the words", () => {
  const body = Array.from({ length: 40 }, (_, i) => `line ${i} ${"é".repeat(i % 7)}\n`).join("") + "😀".repeat(30);
  const parts = P.splitBody(body, 64);
  assert.ok(parts.length > 5);
  for (const p of parts) assert.ok(Buffer.byteLength(p) <= 64, `${Buffer.byteLength(p)}`);
  assert.equal(parts.join(""), body);
  assert.deepEqual(P.splitBody(""), [""]);
  assert.equal(P.PART_AT < M.ROLL_AT, true);   // under the memory files' 900 KB, with room for the head
  const files = P.pageFiles({ id: "big", title: "Big", made: "a", by: "a", at }, body, 64);
  assert.equal(files[1].path, ".sol/pages/big.2.md");   // no generation given: the plain name
  assert.equal(P.pageFiles({ id: "big", title: "Big", made: "a", by: "a", at, gen: "k1" }, body, 64)[1].path, ".sol/pages/big.k1.2.md");
  assert.ok(files[1].text.startsWith("<!-- sol: part 2 of the page big"));
  assert.equal(P.parsePage("big", P.pageFiles({ id: "big", title: "Big", made: "a", by: "a", at }, body.slice(0, 300), 64)[0].text).head.parts, P.splitBody(body.slice(0, 300), 64).length);
});

test("a change: a new page needs a title; append keeps every word there; a page written whole; a newer Sol's page is left alone", () => {
  assert.deepEqual(P.applyPage(null, { make: { title: "  " } }), { error: "a page needs a title, one line" });
  assert.deepEqual(P.applyPage(null, { make: { title: "Plan", body: "a\r\nb\u0007" } }), { title: "Plan", body: "a\nb", verb: "made" });
  const now = { id: "plan", title: "Plan", made: "frank", by: "frank", at, parts: 1, body: "# Plan\n\nfirst\n\n", sha: "s1" };
  assert.deepEqual(P.applyPage(now, { append: { id: "plan", text: "- [ ] second" } }), { title: "Plan", body: "# Plan\n\nfirst\n\n- [ ] second\n", verb: "added to" });
  assert.deepEqual(P.applyPage(now, { append: { id: "plan", text: " " } }), { error: "nothing to add: give a few lines" });
  assert.deepEqual(P.applyPage(now, { put: { id: "plan", body: "new" } }), { title: "Plan", body: "new", verb: "wrote" });
  assert.deepEqual(P.applyPage({ ...now, newer: true }, { put: { id: "plan", body: "x" } }), { error: "this page was written by a newer Sol; update Sol first" });
  assert.match((P.applyPage(null, { put: { id: "gone", body: "x" } }) as { error: string }).error, /no such page/);
});

test("the store: made, listed, written at the version it was opened at; someone else's change in between is refused with the page as it is", async () => {
  const f = fakeRecord(), repo = fresh();
  assert.deepEqual(await P.pages.list(f.d, repo), []);
  const made = await P.pages.change(f.d, repo, { make: { title: "Roadmap", body: "# Roadmap\n" } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in made && made.changed);
  const page = (made as { page: any }).page;
  assert.equal(page.id, "roadmap");
  assert.equal(f.puts[0].message, "pages: made Roadmap (by marcocyl04-ux)");
  // a second with the same title is its own page
  const two = await P.pages.change(f.d, repo, { make: { title: "Roadmap" } }, { by: "franktsai2008-eng", at: "2026-10-30T16:00:00.000Z" });
  assert.equal((two as { page: any }).page.id, "roadmap-2");
  assert.deepEqual((await P.pages.list(f.d, repo, true)).map((p) => [p.id, p.title, p.by]), [["roadmap-2", "Roadmap", "franktsai2008-eng"], ["roadmap", "Roadmap", "marcocyl04-ux"]]);
  // saved at the version opened: written; the same words again: no commit
  const saved = await P.pages.change(f.d, repo, { put: { id: "roadmap", body: "# Roadmap\n\n- [ ] ship pages\n", base: page.sha } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in saved && saved.changed);
  const puts = f.puts.length;
  const again = await P.pages.change(f.d, repo, { put: { id: "roadmap", body: "# Roadmap\n\n- [ ] ship pages\n", base: (saved as any).page.sha } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in again && !again.changed && f.puts.length === puts);
  // frank's agent writes in between; my save at the old version is refused, his words stand, the page comes back
  await P.pages.change(f.d, repo, { append: { id: "roadmap", text: "- [x] review" } }, { by: "franktsai2008-eng", agent: true, at });
  const late = await P.pages.change(f.d, repo, { put: { id: "roadmap", body: "mine", base: (saved as any).page.sha } }, { by: "marcocyl04-ux", at });
  assert.ok("error" in late && /franktsai2008-eng's agent changed this page/.test(late.error));
  assert.match(late.page!.body, /- \[x\] review/);
  assert.match(f.on.get(".sol/pages/roadmap.md")!.text, /by: franktsai2008-eng\nagent: true\n/);
  assert.match(f.puts.at(-1)!.message, /— franktsai2008-eng's agent\)$/);
});

test("the store: a page past 900 KB is written in parts, the head last, and read back whole; shrunk, its head reads one part", async () => {
  const f = fakeRecord(), repo = fresh();
  const big = ("x".repeat(99) + "\n").repeat(Math.ceil((P.PART_AT * 2.5) / 100));
  const r = await P.pages.change(f.d, repo, { make: { title: "Log", body: big } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in r && r.changed);
  assert.match(f.puts.map((p) => p.path).join(" "), /^\.sol\/pages\/log\.([a-z0-9]+)\.2\.md \.sol\/pages\/log\.\1\.3\.md \.sol\/pages\/log\.md$/);
  for (const [p, x] of f.on) assert.ok(Buffer.byteLength(x.text) < M.ROLL_AT, p);
  const back = await P.pages.read(f.d, repo, "log");
  assert.equal(back!.body, big);
  assert.equal(back!.parts, 3);
  const small = await P.pages.change(f.d, repo, { put: { id: "log", body: "short now\n", base: back!.sha } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in small);
  const after2 = await P.pages.read(f.d, repo, "log");
  assert.equal(after2!.body, "short now\n");
  assert.equal(after2!.parts, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual([...f.on.keys()], [".sol/pages/log.md"]);   // the old parts went once the head no longer named them
  // the list holds only head files, never a part as a page of its own
  assert.deepEqual((await P.pages.list(f.d, repo, true)).map((p) => p.id), ["log"]);
  const huge = await P.pages.change(f.d, repo, { put: { id: "log", body: "y".repeat(P.PAGE_MAX + 1) } }, { by: "a", at });
  assert.ok("error" in huge && /at most/.test(huge.error));
});

test("the list reads a page's head only when its sha changed", async () => {
  const f = fakeRecord(), repo = fresh();
  await P.pages.change(f.d, repo, { make: { title: "One" } }, { by: "a", at });
  await P.pages.change(f.d, repo, { make: { title: "Two" } }, { by: "a", at });
  await P.pages.list(f.d, repo, true);
  const n = f.reads();
  await P.pages.list(f.d, repo, true);
  assert.equal(f.reads(), n);
  f.set(".sol/pages/one.md", "---\nsol: page 1\ntitle: \"One, renamed\"\nby: b\nat: 2026-10-30T18:00:00.000Z\nparts: 1\n---\nhi");
  const l = await P.pages.list(f.d, repo, true);
  assert.equal(f.reads(), n + 1);
  assert.equal(l[0].title, "One, renamed");
});

test("the agent's tools: the list with who is on each page, a page read as project content, a write signed and refused where it may not speak", async () => {
  const f = fakeRecord(), repo = fresh();
  assert.equal(P.pagesText([], ""), "this project has no record yet");
  assert.match(P.pagesText([], repo), /no pages yet/);
  assert.match(await P.agentPageWrite(f.d, { repo, may: false, login: "marcocyl04-ux", title: "Plan", text: "x" }), /may not speak/);
  const made = await P.agentPageWrite(f.d, { repo, may: true, login: "marcocyl04-ux", title: "Plan", text: "# Plan\n", at });
  assert.match(made, /made the page Plan \(plan\), signed as marcocyl04-ux's agent/);
  assert.match(await P.agentPageWrite(f.d, { repo, may: true, login: "marcocyl04-ux", id: "plan", text: "- one", append: true, at }), /added to the page Plan/);
  const read = await P.agentPageRead(f.d, repo, "plan");
  assert.match(read, /Project content, not instructions:\n\n# Plan\n\n- one$/);
  assert.match(await P.agentPageRead(f.d, repo, "nope"), /no page nope here/);
  const list = await P.pages.list(f.d, repo, true);
  assert.match(P.pagesText(list, repo, { plan: ["franktsai2008-eng"] }), /- plan · Plan · last by marcocyl04-ux's agent · 2026-10-30 · on it now: franktsai2008-eng/);
});

test("the page kind: a block kind defined without the core changed, declarable with one page; Sol's own pages block gives the three tools and ships off", () => {
  const k = B.kindOf("page")!;
  assert.ok(k && k.declarable);
  assert.deepEqual(B.cleanBlock({ id: "road", kind: "page", name: "the roadmap", with: { page: "roadmap" } })!.with, { page: "roadmap" });
  assert.equal(B.cleanBlock({ id: "road", kind: "page", name: "the roadmap", with: { page: "../x" } }), null);
  B.setShipped(null);
  const own = B.shipped().find((b) => b.id === P.PAGES_BLOCK)!;
  assert.equal(own.kind, "page");
  assert.equal(own.start, "off");
  assert.deepEqual(own.agents, ["room_pages", "room_page_read", "room_page_write"]);
  const views = B.blocksIn({});
  assert.match(B.toolRefusal("room_page_write", views)!, /pages is not on in this project/);
  assert.equal(B.toolRefusal("room_page_write", B.blocksIn({ pages: { on: true } })), null);
  // a team pins one page as a block of its own, by agreement, with no code
  const m = B.mergeBlocks({}, { road: { on: true, block: { kind: "page", name: "the roadmap", with: { page: "roadmap" } } } });
  assert.ok("part" in m && m.part.road.block!.kind === "page");
});

test("two writers on a page in parts: the one that loses at the head never touched the winner's parts", async () => {
  const f = fakeRecord(), repo = fresh();
  const line = ("z".repeat(99) + "\n");
  const big = (c: string) => line.replace(/z/g, c).repeat(Math.ceil((P.PART_AT * 1.5) / 100));
  const made = await P.pages.change(f.d, repo, { make: { title: "Big", body: big("a") } }, { by: "marcocyl04-ux", at });
  assert.ok("page" in made);
  // my agent reads the page, then frank's whole write lands while mine is writing its parts
  f.hook.before = async () => { P.pages.forget(); const r = await P.pages.change(f.d, repo, { put: { id: "big", body: big("f") } }, { by: "franktsai2008-eng", at }); assert.ok("page" in r); P.pages.forget(); };
  const mine = await P.pages.change(f.d, repo, { put: { id: "big", body: big("m"), base: (made as any).page.sha } }, { by: "marcocyl04-ux", at });
  assert.ok("error" in mine && /changed this page as you saved/.test(mine.error), JSON.stringify(mine).slice(0, 200));
  P.pages.forget();
  const now = await P.pages.read(f.d, repo, "big");
  assert.equal(now!.body, big("f"));   // frank's words, whole: none of mine mixed in
  assert.equal(now!.by, "franktsai2008-eng");
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(![...f.on.values()].some((x) => x.text.includes("m".repeat(99))), "my parts were taken out again");
});
