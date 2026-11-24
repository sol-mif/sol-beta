// A folder's parts (BR1 item 6, folder.html; look.ts): a part per fact Sol saw, never a kind; at most the face's four,
// ranked by the person's own presses there; plain with no fact; a hide here, on these or everywhere, each one fix line in
// what Sol knows, and a part brought back in one folder only. Against a temp SOL_HOME with invented people: Lucy (her
// classes), Dev (a garden app), Denise (a bakery). Signed: marcocyl04-ux's agent (builder P), BR1 item 6 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-look-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const L = await import("./look.js");
const F = await import("./folders.js");
const { knownNow } = await import("./you-known.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
const put = (dir: string, files: Record<string, string>) => { mkdirSync(dir, { recursive: true }); for (const [f, t] of Object.entries(files)) { mkdirSync(join(dir, f, ".."), { recursive: true }); if (f.endsWith("/")) mkdirSync(join(dir, f), { recursive: true }); else writeFileSync(join(dir, f), t); } };
/** opened after it came, never changed: its last open moved past its last change */
const opened = (p: string) => utimesSync(p, new Date(Date.now() + 3_600_000), statSync(p).mtime);
const NOW = new Date(2026, 10, 22, 9).getTime(); // a Sunday morning
const iso = (days: number) => { const d = new Date(NOW + days * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("dates ahead are read in a text's words, a day without a year this year's or next; past ones are not", () => {
  const got = L.datesIn(`Quiz 4 ${iso(2)}\nFinal exam Dec 9\nNew term: Jan 5\nOld due 2025-01-01`, NOW);
  assert.deepEqual(got.map((d) => d.words), ["Quiz 4", "Final exam", "New term"]);
  assert.equal(new Date(got[2].at).getFullYear(), 2027);
  assert.deepEqual(L.datesIn("nothing dated here, 42 of 100", NOW), []);
  assert.deepEqual(L.namesInMail("From: \"Denise Okafor\" <d@bakery.test>\nTo: Rui Costa <rui@x.test>, a@b.test\nSubject: x"), ["Denise Okafor", "Rui Costa"]);
});

test("a dated line is one clean title, said once: a program's line gives its quoted title; two ways of saying one day, or one line in two files, are one", () => {
  const got = L.datesIn(`needs { title "Today we do Chapter 11 quiz" line 4 due ${iso(2)} }\nThanksgiving 2026 is Thursday, November 26, 2026 (2026-11-26)`, NOW);
  assert.deepEqual(got.map((d) => d.words), ["Today we do Chapter 11 quiz", "Thanksgiving 2026 is Thursday"]);
  const h = home();
  put(join(h, "sol"), { "plan.md": "- Thanksgiving 2026 is Thursday, November 26, 2026", "notes.txt": "Thanksgiving 2026 is Thursday: November 26, 2026", "x.pdf": "x" });
  const coming = L.lookOf(h, "h:sol", NOW).seen.find((s) => s.part === "coming");
  assert.deepEqual(coming?.items.map((i) => i.what), ["Thanksgiving 2026 is Thursday"]);
});

test("Coming up is only a thing that happens on a day ahead: a quiz, a holiday, a deadline, a coffee on Sat; prose that only holds a date is none, and with none it says plainly nothing is coming (BR1 hold)", () => {
  // the event side: what happens is said (a kind of thing, its weekday or a time beside it, by/on/due before it, a name and its date)
  const yes = L.datesIn([`Chapter 11 quiz in class ${iso(2)}`, "Thanksgiving 2026 is Thursday, November 26", "Coffee with Dana Lee | Sat Nov 28 | Blue Bottle",
    "The landlord wants the form back by Dec 3", "Standup moved to Dec 4 at 10:00", "Essay draft: Dec 9", "Rent Jan 1"].join("\n"), NOW);
  assert.deepEqual(yes.map((d) => d.words), ["Chapter 11 quiz in class", "Thanksgiving 2026 is Thursday", "Coffee with Dana Lee Blue Bottle", "The landlord wants the form back", "Standup moved to", "Essay draft", "Rent"]);
  // the prose side: a date a rule starts from, a date in code, a report listing days, a sentence that only mentions one
  const prose = ["`approach.md` (from Nov 26: \"anywhere\") on public pages, signed out, lands as one line", "The switch is a date in code: since 2026-11-26 the rule looks anywhere",
    "noticed on its own that `EXAM=2026-11-27` is still unconfirmed", "the variants offer Sat Nov 28, Sun Nov 29, Mon Nov 30, then Fri Nov 27, and never the 26th",
    "Version 2 of the notes was written up and pasted in the shared folder 2026-11-30 with the other drafts"].join("\n");
  assert.deepEqual(L.datesIn(prose, NOW), []);
  const h = home();
  put(join(h, "notes"), { "report.md": prose, "x.pdf": "x" });
  const none = L.lookOf(h, "h:notes", NOW).seen.find((s) => s.part === "coming");
  assert.deepEqual(none && { k: none.k, words: none.words, items: none.items }, { k: "seen:h:notes:no-dates", words: "Nothing coming up", items: [] }, "no line qualifies: Coming up is there and says nothing is coming");
  assert.equal(none?.fact, "Sol found no dates ahead in the file names or notes in notes.");
  assert.equal(L.lookOf(h, "h:gone", NOW).seen.find((s) => s.part === "coming")?.words, "Nothing coming up", "a folder not on the disk (yet) says nothing is coming too");
  assert.equal(L.seenOf(h, "w:gone", NOW).seen.find((s) => s.part === "coming")?.fact, "gone lives in Sol only, so Sol has no files there to read dates from.", "a folder with no place on the disk says why");
  put(join(h, "school"), { "plan.md": `${prose}\nChapter 11 quiz ${iso(2)}` });
  assert.deepEqual(L.lookOf(h, "h:school", NOW).seen.find((s) => s.part === "coming")?.items.map((i) => i.what), ["Chapter 11 quiz"]);
});

test("a folder's Coming up reads its own files only, and only a real date ahead: never an inner kept folder's, a log line's stamp, a day just gone, a link row or a long paragraph; today says today (BR1 hold)", async () => {
  const { keepMoveIn } = await import("./movein.js");
  const h = home(), coming = (f: string) => L.lookOf(h, f, NOW).seen.find((s) => s.part === "coming");
  put(join(h, "life"), { "log.md": `- ${iso(0)} 08:05 · read: Lucy's clock moved, the form is due Dec 3\n- ${iso(-1)} 21:40 · wrote: rent Jan 1`, "school/plan.md": `Chapter 11 quiz ${iso(2)}` });
  assert.deepEqual(coming("h:life")?.items.map((i) => i.what), ["Chapter 11 quiz"], "a plain folder inside is read one level down");
  keepMoveIn(h, { keep: ["h:life", "h:life/school"] }, NOW);
  assert.deepEqual(coming("h:life") && { words: coming("h:life")!.words, items: coming("h:life")!.items }, { words: "Nothing coming up", items: [] }, "kept as its own, school's quiz is school's; the log's lines are stamps, not dates ahead");
  assert.deepEqual(coming("h:life/school")?.items.map((i) => i.what), ["Chapter 11 quiz"]);
  const none = ["Sign-ups closed Fri Nov 13; the exam is now Nov 24", "| Quiz 5 | [the notes](notes/quiz5.md) | Dec 2 |",
    "Dev and Denise agreed in the long Thursday meeting that the shared garden plan would be written over again, and",
    "the final review of it is due Dec 9, once everyone has read the notes and sent their thoughts back to Lucy."].join("\n");
  assert.deepEqual(L.datesIn(none, NOW), [], "a day just gone on the line, a link row, a hard-wrapped paragraph: none is a date ahead");
  assert.deepEqual(L.datesIn("- 2026-12-10 23:59 · Essay due", NOW).map((d) => new Date(d.at).getDate()), [10], "a stamp ahead still counts");
  put(join(h, "class"), { "plan.md": `Spanish quiz ${iso(0)}\nEssay draft ${iso(3)}` });
  const c = coming("h:class");
  assert.deepEqual([c?.words, c?.items.map((i) => i.at)], ["Next date: today", ["today", c?.items[1]?.at]]);
  assert.notEqual(c?.items[1]?.at, "today");
});

test("Coming up has one line per thing, titled by the thing: never a file's name, a found-in tail or a bare day heading (BR1 hold 2)", () => {
  const h = home(), coming = (f: string) => L.lookOf(h, f, NOW).seen.find((s) => s.part === "coming");
  const long = (n: number) => new Date(NOW + n * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const year = new Date(NOW).getFullYear();
  put(join(h, "biology"), {
    // the class's agent's list: a day that introduces its thing, a due line that names none, each with where it was found
    "calendar.md": `# Calendar\n- ${iso(18)} · Other dates to plan for: ${long(15)}: Lab report · found: portal Announcements\n- ${iso(18)} 23:59 · Due date: (EST) · found: portal Calendar › Due dates`,
    // the portal's calendar copied as it shows: the day alone on a line, the thing under it
    "portal.md": `Today\n - ${long(0)}, ${year}\nMonday\n - ${long(15)}, ${year}\nLab Report Submissions\nThursday\n - ${long(18)}, ${year}\nField Trip Permission Form\n`,
    "today.md": `# Today — Sunday, ${long(0)}, ${year}\n\nNothing due can be confirmed yet.`,
  });
  const c = coming("h:biology");
  assert.deepEqual(c?.items.map((i) => i.what), ["Lab Report Submissions", "Field Trip Permission Form"], JSON.stringify(c?.items));
  assert.ok(!c?.items.some((i) => /portal|calendar|found|^today/i.test(i.what)), "no file's name, no found-in tail, no bare day");
  assert.deepEqual(L.datesIn(`# Today — Sunday, ${long(0)}, ${year}`, NOW), [], "a day heading names no thing");
  assert.deepEqual(L.datesIn(`- ${iso(3)} 23:59 · Due date: (EST)`, NOW), [], "a due line that says no thing is no line");
});

test("a long line is cut after a whole word with …, never inside one", () => {
  assert.equal(L.upTo("Dentist checkup", 48), "Dentist checkup");
  assert.equal(L.upTo("Bring the signed lease and the deposit receipt as the landlord asked", 48), "Bring the signed lease and the deposit receipt…");
  assert.equal(L.upTo("Supercalifragilistic", 10), "Supercalif…", "one word longer than the room is cut there");
  const got = L.datesIn(`Bring the signed lease and the deposit receipt as the landlord asked, by ${iso(3)}`, NOW);
  assert.equal(got[0].words, "Bring the signed lease and the deposit receipt…");
});

test("a part per fact Sol saw, never a kind: dates, a history, an open session, names in mail, opened once, pictures; nothing seen: plain", () => {
  const h = home();
  put(join(h, "spanish"), { "syllabus.md": `Quiz 4 ${iso(2)}\nEssay due ${iso(5)}`, "Cap 7 lectura.pdf": "x", "Subjuntivo notes.pdf": "x", "essay-draft.docx": "x" });
  opened(join(h, "spanish", "Cap 7 lectura.pdf")); opened(join(h, "spanish", "Subjuntivo notes.pdf"));
  put(join(h, "garden"), { ".git/logs/HEAD": `0 1 Dev <dev@x.test> ${Math.floor(NOW / 1000) - 7200} +0000\tcommit: timer: skip rainy days\n1 2 Dev <dev@x.test> ${Math.floor(NOW / 1000) - 3600} +0000\tcheckout: moving from a to b\n`, "src/": "", "README.md": "garden" });
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(F.foldersFile(h), JSON.stringify({ v: 1, sessions: { "sess-dev-1": { folder: "h:garden", title: "fixing the watering timer", at: NOW, working: true, diaried: null, moved: null } }, backs: {} }));
  const mail = (from: string) => `From: ${from}\nTo: "Rui Costa" <rui@x.test>\nSubject: order\n\nHello`;
  put(join(h, "bakery"), { "a.eml": mail("Denise Okafor <d@x.test>"), "b.eml": mail("Denise Okafor <d@x.test>"), "orders.xlsx": "x" });
  put(join(h, "trip"), { "IMG_1.jpg": "x", "IMG_2.heic": "x", "IMG_3.png": "x", "map.txt": "x" });
  put(join(h, "stuff"), { "notes.txt": "a list", "untitled.pages": "x" });
  const looks = L.looksOf(h, ["h:spanish", "h:garden", "h:bakery", "h:trip", "h:stuff"], NOW);
  const parts = (f: string) => looks[f].seen.map((s) => s.part);
  // Coming up is in every folder (BR1 hold): with nothing dated it has no items and says so
  assert.deepEqual(parts("h:spanish"), ["coming", "read"]);
  assert.deepEqual(parts("h:garden"), ["working", "changed", "coming"]);
  assert.deepEqual(parts("h:bakery"), ["coming", "with"]);
  assert.deepEqual(parts("h:trip"), ["coming", "photos"]);
  assert.deepEqual(looks["h:stuff"].seen.map((s) => [s.part, s.words, s.items.length]), [["coming", "Nothing coming up", 0]], "nothing seen: plain, but for Coming up saying nothing is coming");
  for (const f of ["h:garden", "h:bakery", "h:trip"]) assert.deepEqual(looks[f].seen.find((s) => s.part === "coming")?.items, [], `${f}: nothing dated, no items`);
  assert.deepEqual(looks["h:stuff"].files.map((f) => f.what).sort(), ["notes.txt", "untitled.pages"], "Files is always there");
  // each fact says itself: its key (the because's), the sentence, 2 to 6 grey words, its items
  const coming = looks["h:spanish"].seen[0];
  assert.equal(coming.k, "seen:h:spanish:dates");
  assert.equal(coming.fact, "Sol saw dates ahead in syllabus.md.");
  assert.deepEqual(coming.items.map((i) => [i.what, i.at]), [["Quiz 4", "Tue"], ["Essay due", "Fri"]]);
  for (const f of Object.values(looks)) for (const s of f.seen) { const w = s.words.split(" ").length; assert.ok(w >= 2 && w <= 6, `${s.words}: 2-6 words`); }
  assert.equal(looks["h:spanish"].seen[1].words, "2 PDFs you opened once");
  // the corner says the fact a person would see (BR1 card check, Jev): the nearest date itself, saved changes, AI chats
  assert.equal(coming.words, "Next date: Tue");
  assert.equal(looks["h:garden"].seen[0].words, "An AI chat is open here");
  assert.equal(looks["h:garden"].seen[1].words, "Saved 1 change this week");
  assert.equal(looks["h:bakery"].seen[1].words, "People named in 2 emails");
  assert.deepEqual(looks["h:garden"].seen[1].items, [{ what: "timer: skip rainy days", at: "2 h" }], "commits only, from the history");
  assert.deepEqual(looks["h:garden"].seen[0].items, [{ what: "fixing the watering timer", at: "now" }]);
  assert.deepEqual(looks["h:bakery"].seen[1].items.map((i) => i.what), ["Denise Okafor", "Rui Costa"]);
  assert.match(looks["h:trip"].seen[1].fact, /pictures \(3 of 4\)/);
  // the same contents under another name: the same parts; a name says nothing
  put(join(h, "Spanish 201 final dates"), { "a.txt": "a", "b.txt": "b" });
  assert.deepEqual(L.lookOf(h, "h:Spanish 201 final dates", NOW).seen.map((s) => [s.part, s.items.length]), [["coming", 0]], "only Coming up saying nothing is coming");
});

test("ranked by the person's own presses in that folder; a hide here, on these, everywhere; back in one folder only; each a fix line", () => {
  const h = home(), w = { sol: h, user: h };
  put(join(h, "spanish"), { "syllabus.md": `Quiz 4 ${iso(2)}`, "lectura.pdf": "x" });
  opened(join(h, "spanish", "lectura.pdf"));
  put(join(h, "biology"), { "lab.md": `Lab report ${iso(3)}` });
  put(join(h, "bakery"), { "invoice-112.md": `Invoice 112 due ${iso(1)}` });
  put(join(h, "dates"), { "x.txt": "nothing here" });
  const all = ["h:spanish", "h:biology", "h:bakery", "h:dates"];
  assert.deepEqual(L.lookOf(h, "h:spanish", NOW).order.slice(0, 3), ["working", "coming", "changed"]);
  L.pressPart(h, { folder: "h:spanish", part: "read" }, NOW);
  const r = L.pressPart(h, { folder: "h:spanish", part: "read" }, NOW);
  assert.ok(r.ok && r.look.order[0] === "read", "pressed twice: first there");
  assert.equal(L.lookOf(h, "h:biology", NOW).order[0], "working", "another folder keeps its own order");
  assert.equal(L.pressPart(h, { folder: "h:spanish", part: "kinds" }).ok, false);
  // hide "coming up" here: one fix line, and "same for these?" by the reading (dates seen), never the folder named dates
  assert.equal(L.hidePart(w, { folder: "h:spanish", part: "files" }, NOW).ok, false, "Files can't be hidden");
  const here = L.hidePart(w, { folder: "h:spanish", part: "coming", folders: all }, NOW);
  assert.ok(here.ok);
  assert.deepEqual(here.look.hid, [{ part: "coming", reach: "here" }]);
  assert.deepEqual(here.same?.these.map((t) => t.place).sort(), ["h:bakery", "h:biology"]);
  assert.equal(here.same?.n, 2);
  assert.ok(knownNow(w, {}, NOW).facts.some((f) => f.fact === "You hid “Coming up” in spanish here" && f.place === "h:spanish" && f.by === "person"));
  assert.deepEqual(L.lookOf(h, "h:biology", NOW).hid, [], "here is here only");
  // these: the folders shown it for the same reason; one not shown it is left out
  const these = L.hidePart(w, { folder: "h:spanish", part: "coming", reach: "these", to: ["h:biology", "h:dates"], folders: all }, NOW);
  assert.ok(these.ok);
  assert.deepEqual(L.lookOf(h, "h:biology", NOW).hid, [{ part: "coming", reach: "these" }]);
  assert.deepEqual(L.lookOf(h, "h:bakery", NOW).hid, []);
  assert.ok(knownNow(w, {}, NOW).facts.some((f) => f.k === "rule:seen:h:spanish:dates:hide"), "a wider hide is a rule line");
  // back in biology only: spanish keeps its hide, and the bring-back is its own fix line
  const back = L.backPart(w, { folder: "h:biology", part: "coming" }, NOW);
  assert.ok(back.ok && back.look.hid.length === 0);
  assert.deepEqual(L.lookOf(h, "h:spanish", NOW).hid, [{ part: "coming", reach: "these" }]);
  assert.ok(knownNow(w, {}, NOW).facts.some((f) => f.fact === "You brought “Coming up” in biology back here" && f.place === "h:biology"));
  assert.equal(L.backPart(w, { folder: "h:biology", part: "coming" }, NOW).ok, false, "not hidden there any more");
  // everywhere: every folder shown it, later ones too
  assert.ok(L.hidePart(w, { folder: "h:spanish", part: "coming", reach: "everywhere", folders: all }, NOW).ok);
  put(join(h, "later"), { "plan.md": `Opening day ${iso(4)}` });
  assert.deepEqual(L.lookOf(h, "h:later", NOW).hid, [{ part: "coming", reach: "everywhere" }]);
  assert.deepEqual(L.lookOf(h, "h:bakery", NOW).hid, [{ part: "coming", reach: "everywhere" }]);
  assert.equal(L.hidePart(w, { folder: "h:dates", part: "photos" }, NOW).ok, false, "a part not shown there can't be hidden");
});
