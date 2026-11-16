// node --test src/*.test.ts (npm test here): the applications and follow-ups flows (#808, plan Part C slice 45;
// home/whole/postings.ts, met.ts, outreachStore.ts, Applications.tsx, FollowUps.tsx; the stub of #836). The Try line: a
// matching posting arrives as a drafted application waiting on his yes. And the rules under it: fit .70 and ready .80,
// a maybe asks, under .45 held, one more pass under .80, submit his; a DM three days on, one nudge after seven, never two.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appsLine, cardOf, fitOf, looks, needsOf, nextLook, placeOf, readyOf, stationsOf, stub } from "./home/whole/postings.ts";
import * as met from "./home/whole/met.ts";

test("a matching posting arrives as a drafted application waiting on his yes", () => {
  const ask = stub(), before = ask({ type: "flow.apps", flowId: "f-apps" });
  assert.deepEqual(needsOf(before.postings).map((p) => p.id), ["p-stripe"], "before the look only Stripe's maybe asks");
  assert.deepEqual(appsLine(before.postings, true), ["One thing needs you here.", "Figma is being typed."]);
  const m = ask({ type: "flow.run.now", flowId: "f-apps" });
  const shop = m.postings.find((p) => p.company === "Shopify")!;
  assert.ok(shop, "the posting arrives");
  assert.equal(fitOf(shop.fit), "for_you", "Jev's fit clears .70");
  assert.equal(shop.state, "ready", "drafted, and Jev's ready clears .80");
  assert.equal(needsOf(m.postings)[0].id, "p-shopify", "in front, before the maybe");
  assert.deepEqual(appsLine(m.postings, true), ["Two things need you here.", "Figma is being typed."]);
  assert.equal(cardOf(shop).title, "Shopify's application is ready. Submit it?");
  assert.match(cardOf(shop).why, /Nothing is submitted\.$/, "waiting on his yes: nothing went");
  assert.deepEqual(cardOf(shop).answers, ["submit now", "let me read it"]);
  assert.match(m.done!.line, /^The 11:00 look: 6 read · Shopify for you \(\.84\), drafted, read ready \(\.88\)/);
  assert.deepEqual(stationsOf(m).at(-1)!.at.map((p) => p.id), ["p-shopify"], "its token at your yes");
  // submit is his: his press goes in only after its hold, and undo takes it back before
  const s = ask({ type: "home.answer", thingId: "p-shopify", answer: "submit" });
  assert.equal(s.postings.find((p) => p.id === "p-shopify")!.state, "going");
  const u = ask({ type: "home.undo", ledgerId: s.done!.ledgerId });
  assert.equal(u.postings.find((p) => p.id === "p-shopify")!.state, "ready", "undo: it waits on you again");
  ask({ type: "home.answer", thingId: "p-shopify", answer: "submit" });
  const g = ask.gone("p-shopify");
  assert.equal(g.postings.find((p) => p.id === "p-shopify")!.state, "in");
  assert.equal(g.done!.ledgerId, "", "in: no undo now");
});

test("the lines: fit .70 and ready .80; a maybe asks, under .45 held; under .80 one more pass, then a question", () => {
  assert.deepEqual([fitOf(0.7), fitOf(0.62), fitOf(0.44)], ["for_you", "maybe", "not"]);
  assert.deepEqual([readyOf(0.8, 1), readyOf(0.71, 1), readyOf(0.71, 2)], ["ready", "second", "missing"]);
  assert.deepEqual([placeOf(0.3), placeOf(0.6), placeOf(0.9), placeOf(0.9, 0.85), placeOf(0.9, 0.7, 2)], ["held", "asks", "typing", "ready", "missing"]);
  assert.deepEqual(looks(), [7, 9, 11, 13, 15, 17, 19, 21, 23], "every 2 h, 7:00–23:00");
  assert.equal(nextLook(9), "11:00");
  assert.equal(nextLook(23.5), "tomorrow 7:00");
  const ask = stub(), m = ask({ type: "flow.apps", flowId: "f-apps" });
  assert.equal(m.postings.find((p) => p.id === "p-linear")!.state, "second", "Linear .71: one more pass");
  const y = ask({ type: "home.answer", thingId: "p-stripe", answer: "yes, draft it" });
  assert.equal(y.postings.find((p) => p.id === "p-stripe")!.state, "typing", "his yes on a maybe: drafted");
  const n = ask({ type: "home.answer", thingId: "p-figma", answer: "submit" });
  assert.equal(n.postings.find((p) => p.id === "p-figma")!.state, "typing", "nothing not ready is ever submitted");
  assert.deepEqual(appsLine(m.postings, false), ["Applications is paused.", "Nothing is read until you turn it on."]);
});

test("follow-ups: a met person gets a drafted DM after 3 days, one nudge after 7 if no reply, never a second", () => {
  const { stateOn, noteOf, peopleLine, needsOf: due, TODAY } = met;
  const ask = met.stub(), m = ask({ type: "flow.people", flowId: "f-follow" });
  assert.deepEqual(peopleLine(m.people, TODAY), ["Priya, three days on.", "The message is drafted."], "scene 3-2's line");
  assert.deepEqual(due(m.people, TODAY).map((p) => p.id), ["m-priya", "m-alex"]);
  const p = noteOf("met Priya Shah at the Stripe info session, she runs payments infra, said to ping her about new grad", "x", 0)!;
  assert.deepEqual([p.name, p.org, p.keep], ["Priya Shah", "Stripe", 0.88]);
  assert.deepEqual([0, 1, 2, 3].map((d) => stateOn(p, d)), ["waits", "waits", "waits", "drafted"], "a DM three days on");
  const sent = { ...p, state: "sent" as const, dm: { text: "hi", drafted: 3, sent: 3, reply: "none" as const } };
  assert.equal(stateOn(sent, 9), "sent", "six days: no nudge yet");
  assert.equal(stateOn(sent, 10), "nudge", "seven days and no reply: one nudge");
  assert.equal(stateOn({ ...sent, dm: { ...sent.dm, reply: "thanks" } }, 10), "done", "a reply: no nudge");
  assert.equal(stateOn({ ...sent, dm: { ...sent.dm, nudge: { text: "", sent: 10 } } }, 30), "done", "never a second");
  assert.equal(stateOn(noteOf("met Tom K. at the career fair, small talk, no need", "t", 0)!, 5), "held", "under .70: held");
  // the trigger, sending on his yes, and undo
  const n = ask({ type: "people.note", text: "met Jordan Park at the Notion meetup, offered an intro to the infra team" });
  assert.match(n.done!.line, /yes, \.88 · the follow-ups flow drafts a message Sun 15 9:00, sent only on your yes$/);
  const s = ask({ type: "home.answer", thingId: "m-priya", answer: "send" });
  assert.equal(s.people.find((x) => x.id === "m-priya")!.dm!.sent, TODAY);
  const u = ask({ type: "home.undo", ledgerId: s.done!.ledgerId });
  assert.equal(u.people.find((x) => x.id === "m-priya")!.dm!.sent, undefined);
  const g = ask({ type: "home.answer", thingId: "m-alex", answer: "send the nudge" });
  assert.equal(stateOn(g.people.find((x) => x.id === "m-alex")!, 40), "done", "the nudge went: nothing more");
});

test("the seams: jobs shows the applications flow, people the follow-ups; the flow's own switch; marked", () => {
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /folder === "jobs" \|\| folder === "applications" \? <AppsView \/> \/\* C45 \*\//);
  assert.match(modes, /import\("\.\.\/home\/whole\/FollowUps"\)[^\n]*C45/);
  const store = readFileSync(new URL("./home/whole/outreachStore.ts", import.meta.url), "utf8");
  assert.match(store, /if \(q\.type === "flow\.run\.now" && !flowOn\("f-apps"\)\) return;/, "paused: no look");
  const side = readFileSync(new URL("./home/whole/WholeSide.tsx", import.meta.url), "utf8");
  assert.match(side, /r\.id === "jobs" && jobsWait \/\* C45 \*\//);
});

test("each submit holds its own 10 s; an undo takes back only its own (C45-1, C45-5)", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const S = await import("./home/whole/outreachStore.ts");
    const { HOLD_MS } = await import("./home/whole/postings.ts");
    const state = (id: string) => S.appsNow()!.postings.find((p) => p.id === id)!.state;
    S.ask({ type: "flow.apps", flowId: "f-apps" });
    S.lookNow();
    S.answerPosting("p-shopify", "submit");
    assert.equal(state("p-shopify"), "going");
    const shopLedger = S.appsNow()!.done!.ledgerId;
    // a no on Stripe, then its undo: Shopify's hold keeps running
    S.answerPosting("p-stripe", "no");
    S.undoPosting(S.appsNow()!.done!.ledgerId);
    mock.timers.tick(HOLD_MS);
    assert.equal(state("p-shopify"), "in", "another receipt's undo never stops Shopify going in");
    assert.notEqual(shopLedger, "");
    // its own undo inside the 10 s takes it back, and nothing goes in after
    S.lookNow();
    const again = S.appsNow()!.postings.find((p) => p.state === "ready");
    assert.ok(again, "the next look brings another ready application");
    S.answerPosting(again.id, "submit");
    S.undoPosting(S.appsNow()!.done!.ledgerId);
    mock.timers.tick(HOLD_MS);
    assert.notEqual(state(again.id), "in", "its own undo stops it");
  } finally { mock.timers.reset(); }
});
