// node --test src/*.test.ts (npm test here): three calendars as one (#807, plan Part C slice 44; home/whole/cal.ts,
// calStore.ts, ThreeCalendars.tsx; the stub of #835). The Try line: "G2 call with Frank and Isaac this week, half an
// hour": a slot everyone has free. And the rules under it: code finds the clash, Jev's pick is the warm answer, keeping it
// moves your hand-in and clears the clash, each with its undo; the load band; the sentence's parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askOf, calLine, clashesOf, loadAt, seedCal, slotOf, stub, RHYTHM, type CalMsg } from "./home/whole/cal.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();   // Monday 9 November, the scenes' morning
const WED = (h: number, m = 0) => new Date(2026, 10, 11, h, m).getTime();
const TRY = "G2 call with Frank and Isaac this week, half an hour";
const placed = (m: CalMsg) => m.events.filter((e) => e.id.startsWith("c-placed"));

test("“G2 call with Frank and Isaac this week, half an hour”: a slot everyone has free", () => {
  const ask = stub(() => NOW), before = ask({ type: "cal.layers" });
  const m = ask({ type: "cal.place", sentence: TRY });
  const [g2] = placed(m);
  assert.ok(g2, "placed");
  assert.deepEqual([g2.at, g2.end], [WED(17, 30), WED(18)], "Wednesday 17:30, half an hour (flows.md: Wed 17:30)");
  assert.equal(g2.layer, "cowork", "on the room's calendar, the cowork layer");
  assert.equal(g2.title, "G2 call · 17:30");
  for (const p of before.team) assert.ok(p.windows.some((w) => w.at <= g2.at && w.end >= g2.end!), `${p.who} is free then`);
  for (const e of before.events.filter((x) => x.end !== undefined && x.layer !== "cowork")) assert.ok(g2.end! <= e.at || g2.at >= e.end!, `you are free then (not in ${e.title})`);
  assert.equal(m.done?.line, "↳ a date · cowork · Wed 17:30, the first half hour you, Frank and Isaac are all free · on the room's calendar");
  // what did I just do, and undo it
  assert.equal(placed(ask({ type: "home.undo", ledgerId: m.done!.ledgerId })).length, 0, "undo takes it off the room's calendar");
});

test("the first free half hour is the first one: nothing earlier fits all three", () => {
  const { events, team } = seedCal(NOW), a = askOf(TRY, team.map((m) => m.who), NOW);
  for (let t = NOW; t < WED(17, 30); t += 30 * 6e4) assert.equal(slotOf({ ...a, from: t, to: t + 30 * 6e4 }, events, team), null, `not ${new Date(t).toString().slice(0, 21)}`);
});

test("code finds the clash; Jev's pick is the warm answer; keeping it clears the clash, with its undo", () => {
  const ask = stub(() => NOW), m = ask({ type: "cal.layers" });
  assert.equal(m.conflicts.length, 1);
  const c = m.conflicts[0];
  assert.deepEqual([c.a, c.b], ["c-chem", "c-handin"], "the team's hand-in (cowork, .sol/rhythm.json) inside chem set 6 (school)");
  assert.equal(RHYTHM.handIn, "20:00");
  assert.deepEqual(c.fixes.map((f) => [f.label, f.p]), [["hand in at 18:30", 0.81], ["move chem set 6", 0.12], ["ask for late", 0.07]]);
  assert.equal(c.picked, "early", "Jev picked the most likely");
  assert.equal(c.title, "Your hand-in falls in your chem evening. Hand in at 18:30?");
  assert.deepEqual(calLine(m.conflicts), ["One day, three calendars.", "One clash."]);
  const k = ask({ type: "cal.fix.keep", conflictId: c.id, fix: "early" });
  assert.deepEqual(calLine(k.conflicts), ["One day, three calendars.", "No clash."]);
  assert.equal(k.done?.line, "Your hand-in moved to 18:30; your Sol block ends at 18:15 · the team's 20:00 stays");
  // the slot still lands where everyone is free: your hand-in now holds 18:30, so not tonight
  assert.equal(placed(ask({ type: "cal.place", sentence: TRY }))[0].at, WED(17, 30));
  const u = ask({ type: "home.undo", ledgerId: k.done!.ledgerId });
  assert.equal(u.conflicts.length, 1, "undo: the clash is back as it was");
});

test("a sentence's parts: who, how long, which days", () => {
  const team = ["Frank", "Isaac"];
  assert.deepEqual(askOf(TRY, team, NOW).who, ["Frank", "Isaac"]);
  assert.equal(askOf(TRY, team, NOW).minutes, 30);
  assert.equal(askOf("planning with Frank tomorrow, an hour", team, NOW).minutes, 60);
  assert.equal(new Date(askOf("planning with Frank tomorrow, an hour", team, NOW).from).getDate(), 10);
  assert.equal(new Date(askOf(TRY, team, NOW).to).getDay(), 0, "this week runs to Sunday");
  assert.equal(askOf(TRY, team, NOW).title, "G2 call");
  const ask = stub(() => NOW);
  assert.equal(ask({ type: "cal.place", sentence: "a call this week" }).done?.line, "Name who it is with: Frank, Isaac");
});

test("the load band is wider where the day is fuller", () => {
  const { events } = seedCal(NOW), at = (h: number) => new Date(2026, 10, 9, h).getTime();
  assert.ok(loadAt(at(19.5), events) > loadAt(at(8), events), "the chem evening is fuller than the early morning");
  assert.equal(clashesOf(events.filter((e) => new Date(e.at).getDate() === 9)).length, 1);
});

test("the seams: “the week” in the side opens three calendars; marked; the switch's", () => {
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "week" \? <WeekView \/> \/\* C44 \*\//);
  const side = readFileSync(new URL("./home/whole/WholeSide.tsx", import.meta.url), "utf8");
  assert.match(side, /row\("week", "the week", place === "week", \(\) => goTo\("week"\) \/\* C44/);
});

test("the Try on a Tuesday lands on Wednesday 17:30 too; on a Saturday this week has no Wednesday left (#878 R1, R2)", () => {
  const TUE = new Date(2026, 10, 10, 8, 40).getTime();
  const m = stub(() => TUE)({ type: "cal.place", sentence: TRY });
  const [g2] = placed(m);
  assert.ok(g2, "placed on a Tuesday");
  assert.deepEqual([g2.at, g2.end], [WED(17, 30), WED(18)], "still Wednesday 17:30, not today + 2");
  const SAT = new Date(2026, 10, 14, 8, 40).getTime(), cal = seedCal(SAT);
  const stats = cal.events.find((e) => e.id === "c-stats")!;
  assert.equal(new Date(stats.at).getDay(), 3, "the stats group stays on a Wednesday");
  assert.ok(stats.at > SAT, "next week's, once this week's has passed");
  assert.equal(slotOf(askOf(TRY, ["Frank", "Isaac"], SAT), cal.events, cal.team), null, "no half hour this week when all three are free: said, not invented");
});

test("the clash card's meta names the clash's own two layers (#878 R4)", () => {
  const src = readFileSync(new URL("./home/whole/ThreeCalendars.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /building × cowork/);
  assert.match(src, /\[c\.a, c\.b\]\.map\(\(id\) => v\.events\.find\(\(e\) => e\.id === id\)\?\.layer/);
});
