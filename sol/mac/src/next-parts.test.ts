// node --test src/*.test.ts: a folder's parts (BR1 override 4, #1615; next/folder/parts/model.ts, mine/look/br1/folder.html).
// On invented folders only (fixture.ts): a part per fact Sol saw, never a kind; files always; at most four, in the
// engine's order; plain with no fact; a part the person hid is an absence that says their fix, and a press brings it
// back in that folder alone; a hide on "these" reaches the folders shown the part for the same reason. No word for a
// kind of folder in any word a person reads. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOST, PART_W, backIn, cardOf, goneW, hidIn, hidesOf, inOrder, knownOf, sameAs, shownOf, type Hide, type Look } from "./next/folder/parts/model.ts";
import { LOOKS } from "./next/folder/parts/fixture.ts";

test("parts: at most four in the engine's order, files always among them, the fifth fact left out", () => {
  const api = LOOKS.api, s = shownOf(api, []);
  assert.equal(api.seen.length, 4, "api has four facts, so with files five parts could show");
  assert.deepEqual(inOrder(api, s), ["working", "changed", "coming", "files"], "three facts by the engine's order, then files where it put it");
  assert.equal(inOrder(api, s).length, MOST);
  const first: Look = { ...api, order: ["files", "coming", "working", "changed", "with"] };
  assert.deepEqual(inOrder(first, shownOf(first, [])), ["files", "coming", "working", "changed"], "files goes where the engine ranks it");
  const none: Look = { ...api, order: [] };
  assert.deepEqual(inOrder(none, shownOf(none, [])).at(-1), "files", "unranked, files is last");
});

test("parts: a folder with no fact is plain, its files only", () => {
  const s = shownOf(LOOKS.infra, []);
  assert.deepEqual(inOrder(LOOKS.infra, s), ["files"]);
  assert.equal(s.plain, true);
  assert.equal(shownOf(LOOKS.cli, []).plain, false, "one fact is enough to leave plain");
});

test("parts: a hidden part leaves an absence that names the person's fix; a press brings it back in that folder only", () => {
  let hides = hidesOf(LOOKS);
  const web = () => shownOf(LOOKS.web, hidIn("web", hides));
  assert.deepEqual(web().parts, ["changed"], "web's Coming up was hidden by the person");
  assert.deepEqual(web().gone, [{ part: "coming", reach: "here" }]);
  assert.equal(goneW(web().gone[0]), "You hid it here.");
  hides = backIn("web", "coming", hides);
  assert.deepEqual(web().parts, ["changed", "coming"], "brought back");
  assert.deepEqual(web().gone, []);
});

test("parts: \"these\" reaches the folders shown the part for the same reason, and bringing it back in one leaves the rest", () => {
  const these = sameAs(LOOKS, "home", "coming").sort();
  assert.deepEqual(these, ["api", "health", "money", "web"], "every other folder Sol saw dates in, never one that only shares a name");
  let hides: Hide[] = [{ rid: "home", part: "coming", reach: "these", to: these }];
  for (const r of ["home", ...these]) assert.ok(hidIn(r, hides).some((h) => h.part === "coming"), `${r}: hidden`);
  assert.equal(goneW(hidIn("money", hides)[0]), "You hid it on folders like this.");
  assert.ok(!hidIn("cli", hides).length, "a folder with no dates is not touched");
  hides = backIn("money", "coming", hides);
  assert.ok(!hidIn("money", hides).length, "money has it back");
  assert.ok(hidIn("health", hides).length, "health is as the person left it");
  const every: Hide[] = [{ rid: "api", part: "with", reach: "everywhere", to: [] }];
  assert.equal(goneW(hidIn("home", every)[0]), "You hid it everywhere.");
});

test("parts: each part's fact reads as what Sol knows, in this folder, with 2 to 6 grey words", () => {
  for (const [rid, l] of Object.entries(LOOKS)) for (const s of l.seen) {
    const n = s.words.trim().split(/\s+/).length;
    assert.ok(n >= 2 && n <= 6, `${rid} ${s.part}: "${s.words}" is ${n} words`);
    const k = knownOf(rid, s);
    assert.equal(k.place, rid); assert.equal(k.k, s.k); assert.equal(k.fact, s.fact);
  }
});

test("parts: no word for a kind of folder in anything a person reads", () => {
  const words = [...Object.values(PART_W), ...Object.values(LOOKS).flatMap((l) => [...l.seen.flatMap((s) => [s.fact, s.words, ...s.items.map((i) => i.what)]), ...l.files.map((f) => f.what)])];
  for (const w of words) assert.doesNotMatch(w, /\b(repo|repository|class|course|client|project)\b/i, w);
});

test("parts: Coming up is always among them unless hidden, even past four facts; with nothing dated the folder still reads plain (BR1 hold)", () => {
  const api = LOOKS.api, late: Look = { ...api, order: ["working", "changed", "with", "read", "photos", "coming", "files"],
    seen: [...api.seen, { part: "read", k: "seen:api:opened-once", fact: "You opened spec.pdf and never changed it.", words: "1 file you opened once", items: [{ what: "spec", at: "Mon" }] }] };
  const s = shownOf(late, []);
  assert.ok(s.parts.includes("coming"), "ranked last, Coming up still shows");
  assert.equal(inOrder(late, s).length, MOST, "still at most four: the others share what's left");
  assert.deepEqual(s.parts, ["working", "changed", "coming"], "in the engine's order, the lowest other left out");
  assert.equal(shownOf(late, [{ part: "coming", reach: "here" }]).parts.includes("coming"), false, "the person's own hide wins");
  const none: Look = { order: ["coming", "files"], files: [], seen: [{ part: "coming", k: "seen:h:x:no-dates", fact: "Sol found no dates ahead in x's file names or notes.", words: "Nothing coming up", items: [] }] };
  const n = shownOf(none, []);
  assert.deepEqual(inOrder(none, n), ["coming", "files"], "nothing dated: Coming up is there to say so");
  assert.equal(n.plain, true, "only an empty Coming up: plain");
});

test("parts on the card (BR1 conform #21): the first part that lists something is the card's second line; due today is a badge", () => {
  assert.equal(cardOf(LOOKS.api).line, "2 AI chats open now", "a chat open: its own words");
  assert.equal(cardOf(LOOKS.home).line, "Rent · Mon", "coming up: the first thing and its day");
  assert.equal(cardOf(LOOKS.web).line, "nav: one row on phones · Tue", "coming up hidden here: what changed");
  assert.equal(cardOf(LOOKS.health).line, "Most new files are pictures");
  assert.deepEqual(cardOf(LOOKS.infra), { line: "", due: false }, "no fact: no second line");
  assert.deepEqual(cardOf(undefined), { line: "", due: false }, "no look yet: nothing");
  const today: Look = { order: ["coming", "files"], files: [], seen: [{ part: "coming", k: "seen:t:dates", fact: "Sol saw a date in rent.txt.", words: "Next date: today", items: [{ what: "Reply to the landlord", at: "today" }] }] };
  assert.deepEqual(cardOf(today), { line: "Reply to the landlord · today", due: true });
  assert.equal(cardOf({ ...today, hid: [{ part: "coming", reach: "here" }] }).due, false, "the person hid Coming up: no badge for it");
});
