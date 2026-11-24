// A folder's setup read from what it holds (setup-read.ts, BR1 setup.html; #1615). Against a temp SOL_HOME with invented
// people: Ana (sites for clients), Ben (a course), Cy (pictures). Three lines with their because, never a named kind, the
// same under any name; ✦ until kept; × takes a line out; a folder with almost nothing gets no guess.
// Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-setup-read-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const S = await import("./setup.js");
const F = await import("./folders.js");
const { personSet } = await import("./fits.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
const files = (dir: string, names: string[], text: Record<string, string> = {}) => {
  mkdirSync(dir, { recursive: true });
  for (const f of names) { const p = join(dir, f); if (f.endsWith("/")) mkdirSync(p, { recursive: true }); else { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, text[f] ?? "x"); } }
};
const chats = (h: string, folder: string, titles: string[]) => {
  const sessions = Object.fromEntries(titles.map((t, i) => [`sess-${i}`, { folder, title: t, at: i, working: false, diaried: null, moved: null }]));
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(F.foldersFile(h), JSON.stringify({ v: 1, sessions, backs: {} }));
};

test("a folder of subfolders with a rules file and chats reads three lines, each with its because, ✦ until kept", () => {
  const h = home();
  files(join(h, "ana"), ["bistro/index.html", "trattoria/index.html", "noodles/index.html", "CLAUDE.md"], { "CLAUDE.md": "# Ana's sites\n\n- Previews before a client sees a page\n" });
  chats(h, "h:ana", ["Bistro menu pages", "Trattoria menu update", "Noodle bar pages", "Lunch menu"]);
  const s = S.setupOf(h, "h:ana");
  assert.equal(s.read.empty, false);
  assert.equal(s.read.sol, true);
  assert.deepEqual(s.read.lines.map((l) => [l.key, l.field, l.n, l.by]), [["for", "job", "For", "sol"], ["organized", "order", "Organized", "sol"], ["looks", "look", "Looks", "sol"]]);
  const [f, o, l] = s.read.lines;
  assert.equal(f.line, "Work on menu and pages");
  assert.match(f.because, /^its 4 chats are mostly about menu/);
  assert.equal(o.line, "One folder for each thing it holds; previews before a client sees a page");
  assert.match(o.because, /3 subfolders \(bistro, noodles and trattoria\), each with its own files, and line 3 of its CLAUDE\.md$/);
  assert.equal(l.line, "Each subfolder as a card");
  assert.equal(s.read.line, "menu and pages · one folder each · shown as cards");
  assert.deepEqual(s.read.lines.map((x) => x.k), ["setup:h:ana:for", "setup:h:ana:organized", "setup:h:ana:looks"]);
  // kept: the ✦ goes, the lines stay
  const k = S.keepSetup(h, { folder: "h:ana" });
  assert.ok(k.ok);
  assert.equal(k.ok && k.setup.read.sol, false);
});

test("never a named kind: the same holdings under another name read the same lines; a course by week reads by week", () => {
  const h = home();
  const week = ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf", "Week 4.md"];
  files(join(h, "ben-course"), week);
  files(join(h, "zz"), week);
  const a = S.setupOf(h, "h:ben-course").read, b = S.setupOf(h, "h:zz").read;
  assert.deepEqual(a.lines.map((x) => [x.line, x.because]), b.lines.map((x) => [x.line, x.because]));
  assert.equal(a.lines.find((x) => x.key === "organized")!.line, "By week, as the files are named");
  assert.equal(a.lines.find((x) => x.key === "for")!.line, "Documents to read and keep");
  for (const x of a.lines) assert.doesNotMatch(`${x.line} ${x.because}`, /\b(repo|class|client|project|course)\b/i);
});

test("pictures read as pictures, first and in a grid", () => {
  const h = home();
  files(join(h, "cy"), ["IMG_1.jpg", "IMG_2.heic", "IMG_3.png", "list.txt"]);
  const r = S.setupOf(h, "h:cy").read;
  assert.equal(r.lines.find((x) => x.key === "for")!.line, "Pictures to keep and look through");
  assert.equal(r.lines.find((x) => x.key === "looks")!.line, "Pictures first, as a grid");
  assert.match(r.lines.find((x) => x.key === "looks")!.because, /^3 of its 4 files are pictures$/);
});

test("a folder with almost nothing in it gets no guessed setup: too early, a calm state", () => {
  const h = home();
  files(join(h, "new"), ["one.txt"]);
  files(join(h, "none"), []);
  const one = S.setupOf(h, "h:new").read, none = S.setupOf(h, "h:none").read;
  assert.deepEqual(one, { empty: true, line: "Too early to say what this folder is for", sol: false, lines: [], why: "it holds 1 thing so far" });
  assert.equal(none.empty, true);
  assert.equal(none.why, "it holds nothing yet");
});

test("× takes a line out and it stays out; a field the person set is said as they set it", () => {
  const h = home();
  files(join(h, "ana"), ["a/x.html", "b/y.html", "c/z.html"]);
  assert.deepEqual(S.dropLine(h, { folder: "h:ana", line: "nope" }), { ok: false, why: "a setup's line is for, organized or looks" });
  const d = S.dropLine(h, { folder: "h:ana", line: "looks" });
  assert.ok(d.ok);
  assert.deepEqual(d.ok && d.setup.read.lines.map((x) => x.key), ["organized"]);
  assert.deepEqual(S.setupOf(h, "h:ana").read.lines.map((x) => x.key), ["organized"]);
  personSet(h, { knob: "folder.look", scope: "home/ana", take: "gallery", reason: "test" });
  const back = S.setupOf(h, "h:ana").read.lines.find((x) => x.key === "looks")!;
  assert.deepEqual([back.line, back.because, back.by], ["Gallery: pictures first", "you set it", "person"]);
});

test("each setup act the person makes is one fix line: the folder its place, what Sol showed its reason, the facts it rests on its because", async () => {
  const { readStore } = await import("./you-known.js");
  const { recordHomeOf } = await import("./you.js");
  const h = home();
  files(join(h, "ana"), [".git/", "a/x.html", "b/y.html", "c/z.html"]);
  const fixes = () => readStore(h).fixes.map((f) => [f.how, f.what, f.place, f.reason]);
  // ×
  assert.ok(S.dropLine(h, { folder: "h:ana", line: "looks" }).ok);
  assert.ok(S.dropLine(h, { folder: "h:ana", line: "looks" }).ok, "a second × is the same ×");
  assert.deepEqual(fixes(), [["hide", "“Its latest changes on the front”", "h:ana", "setup:h:ana:looks"]]);
  // Keep, once
  S.keepSetup(h, { folder: "h:ana" });
  S.keepSetup(h, { folder: "h:ana" });
  assert.deepEqual(fixes().slice(1), [["keep", "“ana's setup”", "h:ana", "setup:h:ana"]]);
  assert.deepEqual(readStore(h).fixes[1].because, ["seen:h:ana:history"], "because: the facts the setup rests on");
  // a field kept, then taken back
  const w = { sol: h, user: h, rec: recordHomeOf(h, h) };
  const pre = S.setField(w, { folder: "h:ana", field: "look", take: "gallery" }) as { ok: true; preview: { token: string } };
  assert.ok(pre.ok);
  assert.equal(readStore(h).fixes.length, 2, "a preview is no fix");
  assert.ok(S.setField(w, { folder: "h:ana", token: pre.preview.token, keep: true }).ok);
  assert.deepEqual(fixes()[2], ["keep", "“How it looks: Gallery: pictures first”", "h:ana", "setup:h:ana:looks"]);
  assert.ok(S.setField(w, { folder: "h:ana", token: pre.preview.token, back: true }).ok);
  assert.deepEqual(fixes().slice(3), [["back", "“gallery”", "home/ana", "fit:folder.look"]], "one line a press: fit mode's Back says it");
});

test("a sort taken back is one put-back line: what went back, where to, because of that sort", async () => {
  const { readStore } = await import("./you-known.js");
  const h = home();
  files(join(h, "dee", "orders"), []);
  S.keepSetup(h, { folder: "h:dee" });
  chats(h, "h:dee", ["Weekend orders list"]);
  const r = S.sortRun(h, "h:dee", "person");
  assert.ok(r.ok && r.run);
  const b = S.sortBack(h, { run: r.run!.id });
  assert.ok(b.ok);
  const f = readStore(h).fixes.at(-1)!;
  assert.deepEqual([f.how, f.what, f.was, f.place, f.reason], ["put-back", "“Weekend orders list”", "dee", "h:dee", `sort:${r.run!.id}`]);
});
