// Step 2 of the folder's agent, the pure parts: what a folder says about itself (about.ts), the calendar, the clock's new
// times, the guard's refusals, the messages (who belongs, who needs an answer, what is new), the readers' row parsers,
// the group chat's lines, the answers that need no Codex, the walk's in-place panels. No browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aboutOf, classIn, courseIn, peopleIn, codesOf, headerOf } from "../src/agent/about.ts";
import { parseCalendar, mergeCalendar, datesIn, examIn, keepCalendar } from "../src/agent/calendar.ts";
import { whenOf, dueNow, examOf, classDaysOf } from "../src/agent/sources/clock.ts";
import { refusal } from "../src/agent/guard.ts";
import { siteAt, signedInAt } from "../src/agent/sites.ts";
import { belongs, needsAnswer, newSince, whoOf, draftPath, type Message } from "../src/agent/sources/messages.ts";
import { outlookRows, gmailRows, inboxOf } from "../src/agent/sources/mail.ts";
import { chatsToOpen, newTeams, teamsMessages, rowSig } from "../src/agent/sources/teams.ts";
import { preOf, gcMessages, sinceLast, chatLine } from "../src/agent/sources/gc.ts";
import { latestDraft, quickAnswer, draftLink, signinsOf, siteOfRule } from "../src/agent/comms.ts";
import { clickable } from "../src/agent/panels.ts";
import { walk, blackboardMd, datesOfCourse } from "../src/agent/sources/blackboard.ts";
import { hasScreen } from "../src/agent/signin.ts";
import { parsePolicy } from "../src/agent/store.ts";
import { open, type Rule } from "../src/agent/harness.ts";

const LA_BRAIN = `# LA245 — Business Law\n\nSection A1 with Professor Dionne Lomax. Blackboard course \`_355037_1\`.\n- Marco is on Day in Court Team 3 with Leslie Garcia, Jiachen Xie, and Londyn Gray.\n- Prof. Lomax's address: dlomax@bu.edu\n`;
const IS_BRAIN = `# IS223\n\nSection A1, MWF at 10:10 a.m. Professor Wiles. Blackboard course \`_348751_1\`; combined MWF materials are in \`_401136_1\`.\n`;

test("about: the course is the rule's, then policy.md's course: line, then brain.md's first", () => {
  assert.equal(courseIn({ policy: "", brain: IS_BRAIN }), "_348751_1");
  assert.equal(courseIn({ policy: "course: _999999_1\n\n- [watch] blackboard: x", brain: IS_BRAIN }), "_999999_1");
  assert.equal(courseIn({ sentence: "walk _111111_1 at 03:00", policy: "course: _999999_1", brain: IS_BRAIN }), "_111111_1");
  assert.equal(courseIn({ policy: "- [watch] blackboard: x\ncourse: _999999_1", brain: "" }), null);   // only above the first rule
  assert.equal(headerOf("course: _348751_1\n# IS223\n- [watch] clock: 08:00", "course"), "_348751_1");
});

test("about: class days and time, people, course codes", () => {
  assert.deepEqual(classIn(IS_BRAIN), { days: [1, 3, 5], time: "10:10" });
  assert.deepEqual(classIn("class Mon/Wed/Fri 10:10"), { days: [1, 3, 5], time: "10:10" });
  assert.deepEqual(classIn("meets Tue/Thu at 9:40"), { days: [2, 4], time: "09:40" });
  assert.equal(classIn("no class here").days, null);
  const ppl = peopleIn(LA_BRAIN);
  assert.deepEqual(ppl.map((p) => p.name), ["Dionne Lomax", "Leslie Garcia", "Jiachen Xie", "Londyn Gray"]);
  assert.equal(ppl[0].role, "professor");
  assert.equal(ppl[0].email, "dlomax@bu.edu");
  assert.deepEqual(codesOf("la245", ""), ["LA245", "LA 245"]);
  const dir = mkdtempSync(join(tmpdir(), "sol-about-"));
  writeFileSync(join(dir, "brain.md"), LA_BRAIN);
  writeFileSync(join(dir, "policy.md"), "group: Day in Court Team 3\npeople: Sam Park <spark@bu.edu>\n\n- [watch] gc: read\n");
  const a = aboutOf(dir);
  assert.equal(a.group, "Day in Court Team 3");
  assert.ok(a.people.some((p) => p.email === "spark@bu.edu"));
  assert.equal(aboutOf(dir, 'read "Other group"').group, "Day in Court Team 3");   // policy.md's line wins
});

test("calendar: found lines merge, his own line wins, the class line, the exam", () => {
  const ref = new Date(2026, 10, 9);
  const found = datesIn("Chapter 11 quiz closes Fri Nov 13 11:59 pm\nThe final exam is Tuesday, November 24, in class.", ref, "blackboard Calendar");
  assert.deepEqual(found.map((f) => [f.date, f.time ?? ""]), [["2026-11-13", "23:59"], ["2026-11-24", ""]]);
  assert.match(found[0].what, /Chapter 11 quiz closes/);
  let md = mergeCalendar("", found, { days: [1, 3, 5], time: "10:10", from: "brain.md" });
  assert.match(md, /^- class: Mon\/Wed\/Fri 10:10 · found: brain\.md$/m);
  assert.match(md, /^- 2026-11-13 23:59 · Chapter 11 quiz closes · found: blackboard Calendar$/m);
  let cal = parseCalendar(md);
  assert.deepEqual(cal.classDays, [1, 3, 5]);
  assert.equal(examIn(cal), "2026-11-24");
  // he writes his own exam line; a found exam with the same name is not written, and his wins
  md = md + "- 2026-11-27 · The final exam is Tuesday, in class\n";
  md = mergeCalendar(md, [{ date: "2026-11-25", what: "The final exam is Tuesday, in class", source: "mail" }]);
  cal = parseCalendar(md);
  assert.equal(cal.items.filter((i) => /final exam/.test(i.what)).length, 2);   // his, and the old found one
  assert.equal(examIn({ ...cal, items: cal.items.filter((i) => i.mine) }), "2026-11-27");
  // a found thing seen again with a new date moves
  md = mergeCalendar(md, [{ date: "2026-11-16", time: "23:59", what: "Chapter 11 quiz closes", source: "blackboard" }]);
  assert.match(md, /^- 2026-11-16 23:59 · Chapter 11 quiz closes/m);
  assert.doesNotMatch(md, /2026-11-13/);
  // his class line wins over a found one
  assert.deepEqual(parseCalendar("- class: Tue/Thu 9:40\n- class: Mon/Wed/Fri 10:10 · found: brain.md\n").classDays, [2, 4]);
  // dates in other shapes
  assert.equal(datesIn("Due 11/20 at 5 pm: Lab 6", ref, "x")[0].date, "2026-11-20");
  assert.equal(datesIn("Meeting 2026-12-02 for the paper", ref, "x")[0].date, "2026-12-02");
  assert.equal(datesIn("Jan 12 first class of spring", ref, "x")[0].date, "2027-01-12");   // a month far behind is next year's
  assert.deepEqual(datesIn("Slides posted Nov 6.", ref, "x"), []);   // a date in passing is not a dated thing
  assert.equal(datesIn("Nov 11 · Quiz 7 due 10:00 am", ref, "x")[0].time, "10:00");   // a time later in the line
  assert.equal(datesIn("Sat Nov 14 2pm Mugar library?", ref, "x")[0].time, "14:00");   // a date with an hour is a thing
});

test("clock: every 30 min in a window; the night before class and class days from calendar.md; the exam from it", () => {
  const w = whenOf("every 30 min 08:00–23:00 read the group")!;
  assert.deepEqual(w.every, { mins: 30, from: 480, to: 1380 });
  assert.deepEqual(w.times, []);
  const r: Rule = { id: "gc-1", sentence: "every 30 min 08:00–23:00 read the group", source: "gc", mode: "watch", rung: "draft" };
  assert.deepEqual(dueNow(r, new Date(2026, 10, 9, 8, 44), []), ["gc-1@2026-11-09 08:30"]);
  assert.deepEqual(dueNow(r, new Date(2026, 10, 9, 8, 44), ["gc-1@2026-11-09 08:30"]), []);
  assert.deepEqual(dueNow(r, new Date(2026, 10, 9, 7, 59), []), []);
  assert.deepEqual(dueNow(r, new Date(2026, 10, 9, 23, 10), []), []);
  const nb: Rule = { id: "clock-3", sentence: "the night before class: what class covers", source: "clock", mode: "watch", rung: "read" };
  assert.deepEqual(whenOf(nb.sentence, [1, 3, 5])?.days, [0, 2, 4]);   // MWF: Sun, Tue, Thu at 21:00
  assert.deepEqual(dueNow(nb, new Date(2026, 10, 10, 21, 5), [], null, [1, 3, 5]), ["clock-3@2026-11-10 21:00"]);   // Tue night
  assert.deepEqual(dueNow(nb, new Date(2026, 10, 11, 21, 5), [], null, [1, 3, 5]), []);   // Wed night: no class Thu
  const cd: Rule = { ...nb, id: "clock-4", sentence: "09:00 on a class day: the notes" };
  assert.deepEqual(dueNow(cd, new Date(2026, 10, 11, 9, 5), [], null, [1, 3, 5]), ["clock-4@2026-11-11 09:00"]);
  assert.deepEqual(dueNow(cd, new Date(2026, 10, 12, 9, 5), [], null, [1, 3, 5]), []);
  const dir = mkdtempSync(join(tmpdir(), "sol-clock-"));
  mkdirSync(join(dir, "exam"));
  writeFileSync(join(dir, "exam", "schedule.md"), "EXAM=2026-11-27\n");
  writeFileSync(join(dir, "calendar.md"), "# Calendar\n- class: Tue/Thu 9:40 · found: brain.md\n- 2026-11-24 · Final exam · found: blackboard Calendar\n");
  assert.equal(examOf(dir), "2026-11-27");   // schedule.md beats a found exam
  writeFileSync(join(dir, "calendar.md"), "# Calendar\n- class: Tue/Thu 9:40 · found: brain.md\n- 2026-11-24 · Final exam · found: blackboard Calendar\n- 2026-11-20 · final exam (moved, Lomax said in class)\n");
  assert.equal(examOf(dir), "2026-11-20");   // his own line beats both
  assert.deepEqual(classDaysOf(dir), [2, 4]);
});

test("guard: mail and Teams take no click and no typing; WhatsApp takes a click in the chat list only, never typing", () => {
  const list = { inList: true, inFooter: false, editable: false, label: "Day in Court Team 3" };
  for (const s of ["outlook", "gmail", "teams"] as const) {
    assert.ok(refusal(s, "browser_click", { target: list }), s);
    assert.ok(refusal(s, "browser_type"), s);
    assert.equal(refusal(s, "browser_read"), null);
  }
  assert.ok(refusal("outlook", "browser_open", { url: "https://outlook.office.com/mail/deeplink/compose" }));
  assert.ok(refusal("gmail", "browser_open", { url: "https://mail.google.com/mail/u/0/#inbox?compose=new" }));
  assert.equal(refusal("gmail", "browser_open", { url: "https://mail.google.com/mail/u/0/#inbox/18c2" }), null);
  assert.equal(refusal("whatsapp", "browser_click", { target: list }), null);
  assert.ok(refusal("whatsapp", "browser_type"));
  assert.ok(refusal("whatsapp", "browser_click", { target: { ...list, label: "Send" } }));
  assert.ok(refusal("whatsapp", "browser_click", { target: { inList: false, inFooter: true, editable: false, label: "" } }));
  assert.ok(refusal("whatsapp", "browser_click", { target: { inList: false, inFooter: false, editable: true, label: "Type a message" } }));
  assert.ok(refusal("whatsapp", "browser_click", { target: { inList: false, inFooter: false, editable: false, label: "Leslie Garcia" } }));   // outside the list
  assert.ok(refusal("whatsapp", "browser_click", { target: null }));   // unseen: not clicked
  assert.equal(refusal("blackboard", "browser_click"), null);
  assert.equal(refusal(null, "browser_type"), null);
  assert.equal(siteAt("https://web.whatsapp.com/"), "whatsapp");
  assert.equal(siteAt("https://outlook.office365.com/mail/"), "outlook");
  assert.equal(siteAt("https://example.org/"), null);
  assert.ok(signedInAt("whatsapp", "https://web.whatsapp.com/", "Chats\nDay in Court Team 3"));
  assert.ok(!signedInAt("whatsapp", "https://web.whatsapp.com/", "Scan the QR code\nLink with phone number"));
  assert.ok(!signedInAt("blackboard", "https://shib.bu.edu/idp", "Kerberos password"));
});

const msg = (o: Partial<Message>): Message => ({ id: "1", site: "outlook", from: "", text: "", at: "", ...o });
test("messages: who belongs, who needs an answer, what is new, where the draft goes", () => {
  const about = { people: peopleIn(LA_BRAIN), codes: codesOf("la245", "") };
  assert.equal(belongs(msg({ from: "Lomax, Dionne", address: "dlomax@bu.edu", subject: "Quiz" }), about), "yes");
  assert.equal(belongs(msg({ from: "Leslie Garcia", subject: "court notes" }), about), "yes");
  assert.equal(belongs(msg({ from: "BU Registrar", subject: "LA 245 final exam room" }), about), "yes");
  assert.equal(belongs(msg({ from: "Leslie", subject: "hi" }), about), "unclear");
  assert.equal(belongs(msg({ from: "Dean's office", text: "Professor Lomax asked us to share" }), about), "unclear");
  assert.equal(belongs(msg({ from: "Spotify", subject: "Your Wrapped" }), about), "no");
  assert.ok(needsAnswer(msg({ from: "Dionne Lomax", text: "Can you confirm your team's courtroom by Friday?" })));
  assert.ok(!needsAnswer(msg({ from: "no-reply@bu.edu", text: "Can you rate this?" })));
  assert.ok(!needsAnswer(msg({ from: "Dionne Lomax", text: "Slides are posted." })));
  assert.ok(!needsAnswer(msg({ from: "Marco", text: "can you?", mine: true })));
  assert.ok(needsAnswer(msg({ from: "Leslie Garcia", text: "fyi", kind: "mention" })));
  assert.deepEqual(newSince(null, [msg({ id: "a" })]), []);
  assert.deepEqual(newSince(["a"], [msg({ id: "a" }), msg({ id: "b" })]).map((m) => m.id), ["b"]);
  assert.equal(whoOf(msg({ from: "Lomax, Dionne", address: "dlomax@bu.edu" }), about), "Prof. Lomax");
  assert.equal(whoOf(msg({ from: "Leslie Garcia" }), about), "Leslie");
  assert.equal(draftPath("2026-11-09", "Prof. Lomax"), "drafts/2026-11-09-lomax.md");
});

test("mail and Teams: the readers' rows as messages; which inbox; which chats to open; what is new", () => {
  const o = outlookRows([{ id: "AAQk1", lines: ["Dionne Lomax", "Courtroom for Team 3", "10:42 AM", "Can you confirm by Friday?"], address: "DLomax@bu.edu", name: "Dionne Lomax" }]);
  assert.deepEqual(o[0], { id: "AAQk1", site: "outlook", from: "Dionne Lomax", address: "dlomax@bu.edu", subject: "Courtroom for Team 3", text: "Can you confirm by Friday?", at: "10:42 AM", kind: "mail" });
  const g = gmailRows([{ id: "18c2", lines: [], name: "Leslie Garcia", address: "lgarcia@bu.edu", subject: "notes", preview: " - can you send yours", time: "Nov 9, 2026, 9:14 PM" }]);
  assert.equal(g[0].text, "can you send yours");
  assert.equal(inboxOf("read my Gmail at 08:00"), "gmail");
  assert.equal(inboxOf("read BU mail at 08:00"), "outlook");
  const rows = [{ chat: "c1", lines: ["Leslie Garcia", "9:14 PM", "ok"] }, { chat: "c2", lines: ["IS223 group", "8:00 PM", "hi"] }];
  assert.deepEqual(chatsToOpen(rows, null), ["c1", "c2"]);
  const last = { rows: { c1: rowSig(rows[0]), c2: "old" }, ids: ["c1:m1"], opened: ["c1"] };
  assert.deepEqual(chatsToOpen(rows, last), ["c2"]);
  const ms = teamsMessages([{ chat: "c1", mid: "m1", author: "Leslie", time: "t", text: "a" }, { chat: "c1", mid: "m2", author: "Leslie", time: "t", text: "b?" }, { chat: "c2", mid: "x1", author: "A", time: "t", text: "1" }, { chat: "c2", mid: "x2", author: "A", time: "t", text: "2" }, { chat: "c2", mid: "x3", author: "A", time: "t", text: "3" }, { chat: "c2", mid: "x4", author: "A", time: "t", text: "4" }]);
  assert.deepEqual(newTeams(last, ms).map((m) => m.id), ["c1:m2", "c2:x2", "c2:x3", "c2:x4"]);   // c2 never opened: its last 3
  assert.deepEqual(newTeams(null, ms), []);
});

test("group chat: WhatsApp's lines, the same key look to look, what came since the last one", () => {
  assert.deepEqual(preOf("[10:42, 11/9/2026] Leslie Garcia: "), { at: "2026-11-09 10:42", who: "Leslie Garcia" });
  assert.deepEqual(preOf("[9:05 PM, 11/9/26] Jiachen Xie: "), { at: "2026-11-09 21:05", who: "Jiachen Xie" });
  assert.equal(preOf("not a line"), null);
  const raw = [
    { pre: "[10:40, 11/9/2026] Leslie Garcia: ", text: "who has the rubric?", out: false },
    { pre: "[10:41, 11/9/2026] Marco: ", text: "me, sending tonight", out: true },
    { pre: "[10:42, 11/9/2026] Londyn Gray: ", text: "ok", out: false },
    { pre: "[10:42, 11/9/2026] Londyn Gray: ", text: "ok", out: false },
  ];
  const ms = gcMessages(raw);
  assert.equal(ms.length, 4);
  assert.equal(new Set(ms.map((m) => m.id)).size, 4);
  assert.equal(ms[1].mine, true);
  assert.equal(ms[1].from, "Marco");
  assert.deepEqual(gcMessages(raw).map((m) => m.id), ms.map((m) => m.id));   // stable
  assert.deepEqual(sinceLast(ms, { last: ms[1].id, keys: [] }).map((m) => m.text), ["ok", "ok"]);
  assert.equal(sinceLast(ms, null).length, 4);
  assert.deepEqual(sinceLast(ms, { last: "gone", keys: [ms[0].id, ms[1].id] }).length, 2);
  assert.equal(chatLine(ms[0]), "- 2026-11-09 10:40 · Leslie Garcia · who has the rubric?");
});

test("comms: the latest draft, the answers that need no Codex, the sign-in buttons", () => {
  assert.equal(latestDraft("# Drafts\n\n## 2026-11-09 — replying to Leslie\n> yep, rubric tonight\n> and court notes fri\n\n## 2026-11-08 — Jon\n> old\n"), "yep, rubric tonight\nand court notes fri");
  const rule: Rule = { id: "mail-1", sentence: "read BU mail", source: "mail", mode: "watch", rung: "draft" };
  const t = open({ id: "t-20261109-dddd", folder: "la245", rule, policyVersion: "v", trigger: { id: "m1", at: 1, source: "mail", kind: "message", thread: "mail:x", data: { draft: "drafts/2026-11-09-lomax.md", draftAt: "/h/school/la245/drafts/2026-11-09-lomax.md" } } });
  assert.equal(quickAnswer(t, "open the draft")?.report, "ready");
  assert.equal(quickAnswer(t, "copied")?.report, "ready");
  assert.equal(quickAnswer(t, "redo it"), null);
  const answered = { ...t, triggers: [...t.triggers, { id: "a", at: 2, source: "you", kind: "answer", thread: `ticket:${t.id}`, data: { choice: "open the draft" } }] };
  assert.equal(draftLink({ ticket: answered }), "/file?path=%2Fh%2Fschool%2Fla245%2Fdrafts%2F2026-11-09-lomax.md");
  assert.equal(draftLink({ ticket: t }), null);
  const rules = parsePolicy("- [watch] blackboard: 03:00\n- [watch, draft] mail: BU mail at 08:00\n- [watch, draft] mail: Gmail too\n- [off] teams: x\n- [watch] clock: 08:00\n");
  assert.deepEqual(signinsOf(rules).map((s) => s.label), ["sign in to Blackboard", "sign in to BU mail", "sign in to Gmail"]);
  assert.equal(siteOfRule(rules[2]), "gmail");
  assert.equal(hasScreen({}, "darwin"), true);
  assert.equal(hasScreen({}, "linux"), false);
  assert.equal(hasScreen({ WAYLAND_DISPLAY: "wayland-1" }, "linux"), true);
  assert.equal(hasScreen({ DISPLAY: ":0", SOL_SIGNIN_SCREEN: "off" }, "linux"), false);
});

test("blackboard: a panel opened in place is a page of its own, with its click path; never a risky control", async () => {
  assert.ok(clickable("Chapter 11 quiz · Due Nov 13 · 1 attempt"));
  assert.ok(clickable("Week 10"));
  assert.ok(!clickable("Start attempt"));
  assert.ok(!clickable("Submit"));
  assert.ok(!clickable("Mark as reviewed"));
  assert.ok(!clickable(""));
  const site: Record<string, { text: string; links: string[]; panels?: { label: string; text: string }[] }> = {
    "/ultra/courses/C/outline": { text: "Outline C", links: [], panels: [{ label: "Lab 6", text: "Lab 6 · Due 11/20 at 5 pm · 2 attempts · PDF upload" }] },
    "/ultra/courses/C/announcements": { text: "News C", links: [] },
    "/ultra/courses/C/calendar": { text: "Due C", links: [] },
  };
  const read = async (url: string) => { const p = new URL(url).pathname; const s = site[p]!; return { url, title: p, text: s.text, links: [], panels: (s.panels ?? []).map((x) => ({ ...x, links: [] })) }; };
  const got = await walk(read, "https://bb.test", "C");
  assert.equal(got.signedOut, false);
  if (got.signedOut) return;
  const panel = Object.entries(got.snapshot.pages).find(([k]) => k.includes("#"))!;
  assert.equal(panel[0], "/ultra/courses/C/outline#lab-6");
  assert.equal(panel[1].path, "Course Content › Lab 6");
  assert.equal(panel[1].panel, true);
  assert.match(blackboardMd(got.snapshot, "is223"), /## Course Content › Lab 6\n\ncontent, opened in place/);
  assert.equal(datesOfCourse(got.snapshot, new Date(2026, 10, 9))[0].date, "2026-11-20");
  const dir = mkdtempSync(join(tmpdir(), "sol-cal-"));
  writeFileSync(join(dir, "brain.md"), IS_BRAIN);
  assert.equal(keepCalendar(dir, datesOfCourse(got.snapshot, new Date(2026, 10, 9)), { ...classIn(IS_BRAIN), from: "brain.md" }), 2);
  assert.match(readFileSync(join(dir, "calendar.md"), "utf8"), /found: blackboard Course Content › Lab 6/);
});
