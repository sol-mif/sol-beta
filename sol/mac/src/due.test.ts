// node --test src/*.test.ts: when a sticky is due (Today, #1487, home/folders/due.ts). The due comes from a phrase at the
// end of the words, is kept as a line the engine and a hand both write, and Today holds what is due within a day either side.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueIn, dueOf, dueText, dueWord, late, placeOrder, soon, todayOf, tomorrowOf } from "./home/folders/due.ts";

const NOW = new Date(2026, 10, 18, 10, 0).getTime();   // a Wednesday, 10:00
const st = (t: string, ...notes: string[]) => ({ done: false, t, notes });

test("the due is read from a phrase at the end of the words, and taken off them", () => {
  assert.deepEqual(dueIn("Swim gala kit by Friday", NOW), { t: "Swim gala kit", due: "2026-11-20 18:00" });
  assert.deepEqual(dueIn("Call the bank today", NOW), { t: "Call the bank", due: "2026-11-18 18:00" });
  assert.deepEqual(dueIn("Pack the bag tonight", NOW), { t: "Pack the bag", due: "2026-11-18 20:00" });
  assert.deepEqual(dueIn("Book the dentist, tomorrow", NOW), { t: "Book the dentist", due: "2026-11-19 18:00" });
  assert.deepEqual(dueIn("Forms back on Wednesday", NOW), { t: "Forms back", due: "2026-11-18 18:00" }, "today's own day is today");
  assert.deepEqual(dueIn("Bake sale by Mon", NOW), { t: "Bake sale", due: "2026-11-23 18:00" });
  assert.deepEqual(dueIn("Trip money due Dec 3", NOW), { t: "Trip money", due: "2026-12-03 18:00" });
  assert.deepEqual(dueIn("Renew the passport 4th January", NOW), { t: "Renew the passport", due: "2027-01-04 18:00" }, "a date long past is next year's");
});

test("words that only look like a day stay words", () => {
  for (const w of ["Plan the wedding", "Hat for the sun", "Friday club fees", "Saturday market stall", "tomorrow", "Sell at the market 3"]) assert.equal(dueIn(w, NOW), null, w);
});

test("the line under a sticky is read back; Today is within a day on either side; older late ones wait in their place", () => {
  assert.equal(dueOf(["asked Nov 10 19:40", "due: 2026-11-19 09:30"]), new Date(2026, 10, 19, 9, 30).getTime());
  assert.equal(dueOf(["did: x"]), null);
  assert.equal(dueText(new Date(2026, 0, 4, 7, 5).getTime()), "2026-01-04 07:05");
  const at = (d: number, h: number) => new Date(2026, 10, 18 + d, h).getTime();
  assert.ok(soon(at(0, 18), NOW) && soon(at(1, 9), NOW) && soon(at(-1, 11), NOW));
  assert.ok(!soon(at(1, 11), NOW) && !soon(at(-1, 9), NOW) && !soon(null, NOW));
  assert.ok(late(at(-4, 18), NOW) && !late(at(-1, 11), NOW));
  assert.equal(tomorrowOf(NOW), at(1, 0));
});

test("the chip's words", () => {
  const at = (d: number, h: number) => new Date(2026, 10, 18 + d, h).getTime();
  assert.equal(dueWord(at(0, 18), NOW), "today 18:00");
  assert.equal(dueWord(at(1, 9), NOW), "tomorrow 09:00");
  assert.equal(dueWord(at(-1, 18), NOW), "yesterday 18:00");
  assert.equal(dueWord(at(-4, 18), NOW), "4 days late");
  assert.equal(dueWord(at(2, 18), NOW), "Fri");
  assert.equal(dueWord(at(15, 18), NOW), "Dec 3");
});

test("Today's row from every place, nearest first; a place draws its older late ones first", () => {
  const kids = [st("Forms back", "due: 2026-11-18 18:00"), st("Book the dentist"), { ...st("Old", "due: 2026-11-18 12:00"), done: true }];
  const clubs = [st("Swim kit", "due: 2026-11-19 07:30"), st("Fees", "due: 2026-11-14 18:00"), st("Next week", "due: 2026-11-25 18:00")];
  assert.deepEqual(todayOf([{ place: "kids", items: kids }, { place: "clubs/swim", items: clubs }], NOW).map((x) => `${x.place}:${x.m.t}`), ["kids:Forms back", "clubs/swim:Swim kit"]);
  assert.deepEqual(placeOrder(clubs, NOW).map((m) => m.t), ["Fees", "Swim kit", "Next week"]);
});
