// node --test src/*.test.ts: what was made (#1490, home/folders/madeLines.ts). A made thing is a did: line under a sticky,
// read as a card; clipped under its sticky while the sticky is open; new for two days until opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actOf, allMade, askedAt, byDay, cardOf, isNew, madeIn, madeWhen, waitingOf } from "./home/folders/madeLines.ts";

const NOW = new Date(2026, 10, 18, 10, 0).getTime();   // Wed Nov 18, 10:00
const st = (t: string, done: boolean, ...notes: string[]) => ({ done, t, notes });

test("an asked line's time: no year, so one ahead of now is last year's", () => {
  assert.equal(askedAt("asked Nov 13 18:10", NOW), new Date(2026, 10, 13, 18, 10).getTime());
  assert.equal(askedAt("asked Dec 30 09:00", NOW), new Date(2025, 11, 30, 9, 0).getTime());
  assert.equal(askedAt("asked Nov 18 09:12 ← now", NOW), new Date(2026, 10, 18, 9, 12).getTime());
  assert.equal(askedAt("did: something", NOW), null);
});

test("a did: line as a card: the file's name leads, the run's bookkeeping is left out", () => {
  assert.deepEqual(cardOf("did: 9 bakes counted into made/sat-bake.md · 6 boxes set aside · read: pre-orders.csv · 25 min"),
    { t: "sat-bake.md", line: "9 bakes counted · 6 boxes set aside", file: "made/sat-bake.md" });
  assert.deepEqual(cardOf("did: made/2026-11-10-offer.md, one page"), { t: "offer.md", line: "one page", file: "made/2026-11-10-offer.md" });
  assert.deepEqual(cardOf("did: 3 dates into our calendar · bag list · read: school · 15 min"), { t: "3 dates into our calendar", line: "bag list" });
  assert.deepEqual(cardOf("did: `made/week.md`"), { t: "week.md", line: "", file: "made/week.md" });
});

test("a place's made things: one per did: line, timed by the asked line before it, newest first; open while its sticky is", () => {
  const l = madeIn("kids", [
    st("Ana's letter", true, "asked Nov 13 18:10", "did: 3 dates into our calendar · bag list"),
    st("Ana's week", false, "asked Nov 17 20:00", "did: made/2026-11-17-week.md, 4 dates", "asked Nov 18 08:30", "did: made/2026-11-18-week.md, 5 dates"),
    st("Book the dentist", false),
  ], NOW);
  assert.deepEqual(l.map((x) => [x.sticky, x.t, x.open]), [["Ana's week", "week.md", true], ["Ana's week", "week.md", true], ["Ana's letter", "3 dates into our calendar", false]]);
  assert.equal(l[0].at, new Date(2026, 10, 18, 8, 30).getTime());
  assert.notEqual(l[0].key, l[1].key);
});

test("every place's, newest first; grouped today, yesterday, earlier", () => {
  const all = allMade([
    { place: "a", items: [st("x", false, "asked Nov 18 08:00", "did: one")] },
    { place: "b", items: [st("y", true, "asked Nov 17 08:00", "did: two"), st("z", true, "did: three")] },
    { place: "c", items: [st("w", true, "asked Nov 10 08:00", "did: four")] },
  ], NOW);
  assert.deepEqual(all.map((x) => x.t), ["one", "two", "four", "three"]);
  assert.deepEqual(byDay(all, NOW).map((g) => [g.day, g.items.map((x) => x.t)]), [["today", ["one"]], ["yesterday", ["two"]], ["earlier", ["four", "three"]]]);
});

test("new: made within two days and not opened; one with no time never is", () => {
  const [a, b, c] = allMade([{ place: "p", items: [st("x", false, "asked Nov 18 08:00", "did: one", "asked Nov 14 08:00", "did: old"), st("y", false, "did: no time")] }], NOW);
  assert.equal(isNew(a, new Set(), NOW), true);
  assert.equal(isNew(a, new Set([a.key]), NOW), false);
  assert.equal(isNew(b, new Set(), NOW), false);
  assert.equal(isNew(c, new Set(), NOW), false);
});

test("the card's small time", () => {
  assert.equal(madeWhen(new Date(2026, 10, 18, 8, 5).getTime(), NOW), "08:05");
  assert.equal(madeWhen(new Date(2026, 10, 17, 22, 0).getTime(), NOW), "yesterday");
  assert.equal(madeWhen(new Date(2026, 10, 13, 18, 0).getTime(), NOW), "Nov 13");
  assert.equal(madeWhen(null, NOW), "");
});

test("the trust gate: a draft or an ask waits on the person while it is the newest made for an open sticky; its act is one word", () => {
  const l = madeIn("house", [
    st("Reply to the landlord", false, "asked Nov 18 08:00 · drafts: …", "did: draft: reply in made/reply.md, two lines"),
    st("Pay the term's fees", false, "asked Nov 18 08:10 · asks: …", "did: ask: £120 by card, the form in made/fees.md"),
    st("Tell the club", false, "asked Nov 17 08:00", "did: draft: made/club.md", "asked Nov 17 09:00", "did: made/club-2.md"),
    st("Email the school", true, "asked Nov 17 08:00", "did: draft: made/school.md"),
  ], NOW);
  const by = (f: string) => l.find((x) => x.file === f)!;
  assert.deepEqual([by("made/reply.md").t, by("made/reply.md").line], ["reply.md", "reply, two lines"]);   // "draft:" is not the card's words
  assert.equal(cardOf("did: sent made/reply.md, two lines").line, "sent, two lines");   // no space left where the file was
  assert.deepEqual([by("made/reply.md").waits, by("made/reply.md").act, by("made/reply.md").waiting], ["draft", "Send", true]);
  assert.deepEqual([by("made/fees.md").waits, by("made/fees.md").act, by("made/fees.md").waiting], ["ask", "Pay", true]);
  assert.equal(by("made/club.md").waiting, false);    // a newer one was made since
  assert.equal(by("made/school.md").waiting, false);  // its sticky is done
  assert.deepEqual(waitingOf(l).map((x) => x.sticky).sort(), ["Pay the term's fees", "Reply to the landlord"]);
  assert.equal(actOf("draft", "Book the dentist"), "Book");
  assert.equal(actOf("ask", "Cancel the gym"), "Delete");
  assert.equal(actOf("ask", "Submit the claim"), "Submit");
});
