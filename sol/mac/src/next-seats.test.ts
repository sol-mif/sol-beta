// node --test src/*.test.ts: Seats and sign-ins (slice 6b, #1615; merge/seats.js, NOTES.md "Round 6"): what is coming up
// within a week (each one Diary line, written on load), the AI a lapsed sign-in blocks (the first ask of Needs you, and
// only when it blocks an AI on this canvas), a sign-in drawn as its own page then done (one Diary line, the ask gone, ⌘Z
// puts it back), the snooze, the main page's row, live's "not yet" and home.connections' rows as accounts.
// Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { PEOPLE, ahead, blocked, freshBook, livePerson, rowSub, soon, type Ctx } from "./next/settings/seats/model.ts";
import { blockedNow, book, ctx } from "./next/cv/moves/seats.ts";
import { items } from "./next/people/queue.ts";
import { allLines } from "./next/diary/book.ts";

const clean = (): Ctx => ({ b: freshBook() });
const seatLines = () => allLines().filter((l) => !l.removed && l.kind === "seat");

test("coming up: a seat or account that ends within a week, or lapsed; snoozed lines wait for the day before", () => {
  assert.deepEqual(ahead(clean(), PEOPLE.Dev).map((x) => x.id), ["cx", "aws"]);
  assert.deepEqual(ahead(clean(), PEOPLE["Min-ji"]).map((x) => x.id), ["drive"]);
  assert.deepEqual(ahead(clean(), PEOPLE.Jayden), [], "a school that blocks outside apps is not a lapse");
  assert.deepEqual(ahead(clean(), PEOPLE.Sam), []);
  const c = clean(); c.b.snooze.cx = 1;
  assert.deepEqual(ahead(c, PEOPLE.Dev).map((x) => x.id), ["aws"]);
  c.b.acct.aws = "wait";
  assert.deepEqual(soon(c, PEOPLE.Dev).map((x) => [x.id, x.g ?? "open"]), [["aws", "wait"]]);
  c.b.acct.aws = "done";
  assert.equal(soon(c, PEOPLE.Dev)[0].t, "Your AWS sign-in: signed in again.");
});

test("a lapsed sign-in blocks an AI only when that AI is on the canvas", () => {
  assert.deepEqual(blocked(clean(), PEOPLE.Dev, "Dev", new Set(["Mo"])).map((x) => x.id), ["seat:Dev:aws"]);
  assert.deepEqual(blocked(clean(), PEOPLE.Dev, "Dev", new Set(["Ada"])), []);
  assert.deepEqual(blocked(clean(), PEOPLE["Min-ji"], "Min-ji", new Set(["Sy"])), [], "an account that ends Monday blocks nobody yet");
  const c = clean(); c.b.acct.aws = "done";
  assert.deepEqual(blocked(c, PEOPLE.Dev, "Dev", new Set(["Mo"])), []);
  assert.equal(rowSub(clean(), PEOPLE.Dev), "3 AIs ready to use · 2 plans end this week");
  assert.equal(rowSub(clean(), PEOPLE.Sam), "2 AIs ready to use · nothing ends this week");
  assert.equal(rowSub(clean(), livePerson([{ id: "claude-account", name: "Claude account", state: "connected" }])), "", "live, no seat is read yet: never \"0 AIs ready to use\" (BR1 lane G)");
});

test("on load: each coming-up item is one Diary line; the blocked AI is the first ask of Needs you", () => {
  CV.load("dev-morning");
  assert.deepEqual(seatLines().map((l) => l.key), ["seat:dev-morning:cx", "seat:dev-morning:aws"]);
  CV.load("dev-morning");
  assert.equal(seatLines().length, 2, "a load starts clean: no line twice");
  const b = blockedNow();
  assert.equal(b.length, 1);
  assert.equal(items()[0].id, b[0].id);
  assert.equal(CV.above(), CV.open().length + 1, "the one count holds the blocked AI");
  CV.load("minji");
  assert.equal(blockedNow().length, 0);
  assert.equal(CV.above(), CV.open().length, "a sign-in that blocks no AI adds nothing to Needs you");
});

test("sign in: its own page, then done; one Diary line, the ask gone; undo puts it back", () => {
  CV.load("dev-morning");
  const n0 = allLines().length, a0 = CV.above();
  assert.equal(CV.M.sign_in("aws", "wait").ok, true);
  assert.equal(book().acct.aws, "wait");
  assert.equal(allLines().length, n0, "waiting for its page writes nothing");
  assert.equal(CV.above(), a0 - 1, "while its page is open the AI waits on the person, not on Needs you");
  const d = CV.M.sign_in("aws", "done");
  assert.equal(allLines().length, n0 + 1);
  assert.match(allLines().find((l) => l.key?.startsWith("seat-did:aws:done"))!.what,/^Your AWS sign-in: signed in again\. Mo picks up/);
  assert.equal(blockedNow().length, 0);
  d.undo();
  assert.equal(book().acct.aws, "wait");
  assert.equal(CV.M.sign_in("nope", "done").ok, false);
  const r = CV.M.remind_later("cx");
  assert.deepEqual(ahead(ctx(), PEOPLE.Dev).map((x) => x.id), []);
  r.undo();
  assert.deepEqual(ahead(ctx(), PEOPLE.Dev).map((x) => x.id), ["cx"]);
});

test("see_seats opens Settings at Seats, at a row; live: sign-in answers not yet; accounts are home.connections' rows", () => {
  CV.load("dev-morning");
  const r = CV.M.see_seats("aws");
  assert.equal(r.ok, true);
  assert.equal(CV.S.page, "settings");
  assert.equal((CV.S.st as { page: string }).page, "seats");
  assert.equal((CV.S as { seatRow?: string }).seatRow, "aws");
  const p = livePerson([{ id: "tool:gh", name: "GitHub", from: "mac-tool", state: "connected" }, { id: "claude:gmail", name: "Gmail", from: "claude-account", state: "lapsed", since: "yesterday" }]);
  assert.deepEqual(p.accts.map((a) => [a.id, a.st]), [["tool:gh", "on"], ["claude:gmail", "lapsed"]]);
  assert.deepEqual(p.seats, []);
  CV.setMode("live");
  try {
    assert.deepEqual({ ok: CV.M.sign_in("aws", "wait").ok, why: CV.M.sign_in("aws", "wait").why }, { ok: false, why: "not yet" });
    assert.equal(CV.M.remind_later("cx").why, "not yet");
  } finally { CV.setMode("fixture"); }
});
