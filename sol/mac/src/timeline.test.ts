// The timeline's face helpers (#424): the answer read, the words, the night's rhythm and what sits where on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { timelineOf, standing, wayOf, headline, personWords, sidesBy, sideLabel, ampm, minutesIn, nightOf, nightItems, zoneWords, whoTonight, type Timeline, type Release } from "./cowork/timelineWords.ts";

const R = (tag: string, at: string, more: Partial<Release> = {}): Release => ({ tag, sha: tag, at, kind: "dev", beta: false, changes: [], ...more });
const T = (more: Partial<Timeline> = {}): Timeline => ({ at: "", source: "dev", releases: [], sides: [], waiting: [], developer: true, me: "marco", people: [], ...more });

test("an answer from an older engine is not a timeline; one without waiting or night still is", () => {
  assert.equal(timelineOf({}), null);
  assert.equal(timelineOf({ error: "x" }), null);
  const t = timelineOf({ releases: [], sides: [], people: [], source: "dev" })!;
  assert.deepEqual(t.waiting, []);
  assert.equal(t.night, undefined);
});

test("words: a release's standing, a change's way, the headline and a person's words", () => {
  assert.equal(standing(R("dev-20261030", "2026-10-30T13:00:00Z", { beta: true })), "on beta");
  assert.equal(standing(R("dev-20261030", "2026-10-30T13:00:00Z", { held: true })), "held from beta");
  assert.equal(standing(R("main", "", { kind: "next" })), "in, not released yet");
  const way = wayOf({ number: 1, title: "x", folded: "2026-10-30T01:00:00Z", release: "dev-20261030", releaseAt: "2026-10-30T13:00:00Z" }, "dev");
  assert.deepEqual(way.map((s) => [s.step, s.done]), [["handed in", false], ["in", true], ["dev", true], ["beta", false]]);
  const t = T({ releases: [R("dev-20261029", "2026-10-29T13:00:00Z"), R("dev-20261030", "2026-10-30T13:00:00Z", { latest: true })], people: [{ login: "marco", you: true, on: "dev-20261029", mine: 3, behind: 1, line: "" }] });
  assert.equal(headline(t), "2 releases in 30 days · latest dev-20261030 · you are 1 behind");
  assert.equal(personWords(t.people[0]), "+3 of mine · 1 behind");
  const side = { kind: "severe" as const, from: "dev-20261029", at: "", title: "t", why: "", number: 9 };
  assert.deepEqual([...sidesBy(T({ sides: [side] })).keys()], ["dev-20261029"]);
  assert.equal(sideLabel(side), "#9 sent back");
});

test("the night: one turn of the clock from the hand-in, each step in its place, now in its stretch", () => {
  assert.deepEqual(["20:00", "21:30", "06:00", "09:00", "00:00", "12:00"].map(ampm), ["8pm", "9:30pm", "6am", "9am", "12am", "12pm"]);
  // 2026-10-30 is EDT (UTC-4): 01:30Z is 9:30pm in New York
  assert.equal(minutesIn(new Date("2026-10-31T01:30:00Z"), "America/New_York"), 21 * 60 + 30);
  const night = { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York" };
  const n = nightOf(night, new Date("2026-10-31T01:30:00Z"));
  assert.deepEqual(n.stops.map((s) => [s.key, s.time, +s.x.toFixed(2)]), [["handIn", "8pm", 0], ["review", "9pm", 0.22], ["until", "6am", 0.56], ["release", "9am", 0.76]]);
  assert.equal(n.now, "review");
  assert.equal(n.line, "the dev night is on: taken in or sent back, fixes until 6am");
  assert.equal(+n.nowX.toFixed(4), +(0.22 + (0.5 / 9) * 0.34).toFixed(4));   // half an hour into the nine-hour review stretch
  assert.equal(n.assumed, false);
  assert.equal(nightOf(night, new Date("2026-10-30T16:00:00Z")).now, "day");                    // noon
  assert.equal(nightOf(night, new Date("2026-10-30T11:00:00Z")).now, "release");                // 7am
  assert.equal(nightOf(night, new Date("2026-10-31T00:10:00Z")).line, "handed in: the review opens at 9pm");
  const d = nightOf(undefined, new Date());
  assert.equal(d.assumed, true);
  assert.equal(d.zone, "America/New_York");
  assert.equal(zoneWords("America/New_York"), "New York time");
  assert.equal(zoneWords(""), "");
});

test("who reviews tonight and who backs up (#478); an engine that does not say, nothing", () => {
  const night = { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York", dev: ["marco"], beta: ["frank"], devBackup: ["frank"], betaBackup: ["marco"], handover: "23:00" };
  assert.equal(whoTonight(night), "dev marco, backup frank from 11pm · beta frank, backup marco from 11pm");
  assert.equal(whoTonight({ ...night, devBackup: [], betaBackup: [] }), "dev marco · beta frank");
  assert.equal(whoTonight({ handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "" }), "");
  assert.equal(whoTonight(undefined), "");
});

test("what sits where on the night: waiting, in since the release, sent back in the last day, the latest and who runs it", () => {
  const now = new Date("2026-10-30T20:00:00Z");
  const t = T({
    releases: [R("dev-20261030", "2026-10-30T13:00:00Z", { latest: true }), R("main", "2026-10-30T19:00:00Z", { kind: "next", changes: [{ number: 5, title: "five", folded: "" }, { number: 6, title: "six", folded: "" }, { number: 7, title: "seven", folded: "" }] })],
    waiting: [{ number: 8, title: "eight" }],
    sides: [{ kind: "severe", from: "dev-20261030", at: "2026-10-30T02:00:00Z", title: "bad", why: "", number: 4 }, { kind: "severe", from: "dev-20261030", at: "2026-10-20T02:00:00Z", title: "old", why: "", number: 3 }],
    people: [{ login: "marco", you: true, on: "dev-20261030", mine: 0, behind: 0, line: "" }, { login: "frank", you: false, on: "dev-20261030", mine: 0, behind: 0, line: "" }],
  });
  const it = nightItems(t, now);
  assert.deepEqual(it.handIn, { count: "1 change waiting", names: ["#8 eight"] });
  assert.deepEqual(it.review, { count: "3 in since the release", names: ["#6 six", "#7 seven"] });
  assert.deepEqual(it.until, { count: "1 sent back severe", names: ["#4 bad"] });
  assert.equal(it.release.names[0], "runs it: you, frank");
  const empty = nightItems(T(), now);
  assert.deepEqual([empty.handIn.count, empty.review.count, empty.until.count, empty.release.count], ["no changes waiting", "nothing in since the release", "nothing sent back severe", "no release yet"]);
});
