// node --test src/*.test.ts: the people's rules (slices 8+9, #1615; merge/people.js): each person's setups (P4), the one
// queue (P3: the canvas's asks + the Cowork waits that count + the Social cards, once each, ⌘J in one order), one answer
// lowers the count by one and writes one diary line, "later" goes last, the 13 moves map to their functions (P5), live
// Social answers "not yet", and today's team.v3 front reads as a setup. Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FN, answer, cardsAll, circle, count, crumbOf, diaryLines, items, needsCount, notHere, onPeople, pagesOf, sortedGroups, st, team, use, waitsAll, live } from "./next/people/queue.ts";
import { attach as attachPeople, groupLink, invited, teamOf } from "./next/cv/wire/people.ts";
import { EXTRA } from "./next/people/extra.ts";
import { LINK_UNREAD, attach, circleOf, codeIn, isYes, looksLikeLink, setupsOf, social, withRooms, type Room } from "./next/cv/wire/social.ts";
import { cardSize, fitWords, partLine, partsOf, toggle, tookLine } from "./next/social/setup.ts";
import type { Engine } from "./next/cv/wire/types.ts";
import { madeFrom, stampFrom, type Made, type Plan } from "./next/cv/moves/workspace.ts";
import { emptyState } from "./social/model.ts";
import { pretendState } from "./social/pretend.ts";
import { openRequests } from "./social/model.ts";
import { forgetSocial, socialNow, startSocial } from "./social/store.ts";
// slice 6b (docs/port/requests/seats.md): this file counts the people's own queue, so the slices' registered extra askers (Seats' blocked AI) step aside
EXTRA.splice(0);

test("each person has their own setups (P4), and the address reaches any", () => {
  const want: Record<string, [string, string]> = { "dev-morning": ["T5", "F2"], jayden: ["T2", "F8"], denise: ["T4c", "F7"], minji: ["T4", "F5"], p1: ["T8", "F6"], fresh: ["T1", "F0"], stress: ["T3", "F3"] };
  for (const [who, [s, f]] of Object.entries(want)) { CV.load(who); assert.deepEqual([st().s, st().f], [s, f], who); }
  CV.load("dev-morning"); use({ s: "T7", f: "F3" });
  assert.equal(team().label, "Many groups"); assert.equal(circle().label, "Eighty");
  assert.equal(sortedGroups(team()).length, 5, "T7: the quiet four are left out of the ranking");
});

test("the one queue: Cowork's waits that count, then Social's cards, each once; the badge adds the canvas's asks", () => {
  CV.load("dev-morning");
  assert.deepEqual(waitsAll().map((x) => x.w.kind), ["ask", "join", "hand"], "T5: the 'more' row and nothing else is left out");
  assert.deepEqual(cardsAll().map((c) => c.id), ["c:F2:0", "c:F2:1", "c:F2:2", "c:F2:3"], "F2: needed first, then close, a request last");
  assert.equal(count(), 7);
  assert.equal(needsCount(), CV.open().length + 7);
  use({ f: "F3" });
  const folded = cardsAll().filter((c) => c.fold).map((c) => c.k).sort();
  assert.deepEqual(folded, ["beyond", "help", "invite", "request"], "three of a kind (two requests) fold into one card");
  CV.load("denise");
  assert.deepEqual(waitsAll().map((x) => x.w.kind), ["approve"], "T4c: a client sees only what needs their yes");
  use({ s: "T3" });
  assert.ok(!waitsAll().some((x) => x.w.kind === "ai"), "an AI's own wait doesn't count in Needs you");
});

test("one answer lowers the count by one and writes one diary line; later goes last, still counted", () => {
  CV.load("dev-morning");
  const n = count(), l = diaryLines(), first = items()[0].id, second = items()[1].id;
  assert.ok(answer(first, "Later"));
  assert.equal(count(), n); assert.equal(items().at(-1)!.id, first); assert.equal(items()[0].id, second); assert.equal(diaryLines(), l);
  assert.ok(answer(second, "Make"));
  assert.equal(count(), n - 1); assert.equal(diaryLines(), l + 1);
  assert.ok(!answer(second, "Make"), "answered once");
  const fold = (use({ f: "F3" }), cardsAll().find((c) => c.fold)!), before = count();
  assert.ok(answer(fold.id, "No to all"));
  assert.equal(count(), before - 1, "a card answered whole answers its rows");
  CV.load("dev-morning");
  assert.equal(count(), 7, "a load starts clean");
});

test("⌘J walks the canvas's asks first, then each people item once, on its page", () => {
  CV.load("jayden");
  const ids = items().map((x) => x.id);
  let guard = 0;
  while (CV.open().length && guard++ < 60) { const a = CV.open()[0]; if (!CV.answer(a.id)) { CV.M.next(); if (!CV.answer(a.id)) { CV.M.beside(); CV.answer(a.id); CV.M.beside(); } } }
  assert.equal(CV.open().length, 0);
  const seen: string[] = [];
  for (let i = 0; i < ids.length; i++) { const r = CV.M.next(); assert.ok(r.ok); seen.push(st().focus!); assert.ok(onPeople(CV.S.page), String(CV.S.page)); }
  assert.deepEqual([...new Set(seen)].sort(), [...ids].sort());
});

test("the 13 moves exist and name their functions; pages and crumbs", () => {
  assert.equal(Object.keys(FN).length, 13);
  for (const m of Object.keys(FN)) assert.equal(typeof CV.M[m], "function", m);
  CV.load("jayden");
  const r = CV.M.open_group("bio");
  assert.ok(r.ok); assert.equal(CV.S.page, "group:bio");
  assert.deepEqual(crumbOf(CV.S.page).map((s) => s.label), ["Cowork", "Bio lab report"]);
  r.undo(); assert.equal(CV.S.page, null);
  assert.ok(CV.M.open_friend("Maya").ok); assert.deepEqual(crumbOf(CV.S.page).map((s) => s.label), ["Social", "Maya"]);
  assert.deepEqual(crumbOf("asfriend:Maya").map((s) => s.label), ["Social", "Maya", "As a friend sees you"]);
  assert.ok(pagesOf().includes("first:bio") && pagesOf().includes("link"));
  assert.equal(CV.M.leave_group("bio").ok, false, "leave_group draws but does nothing (carried)");
  const c = CV.M.make_close("Leo"); assert.ok(st().close.has("Leo")); c.undo(); assert.ok(!st().close.has("Leo"));
  assert.ok(CV.say("cowork")?.ok); assert.equal(CV.S.page, "cowork");
});

test("live: Social answers not yet and draws nothing; Cowork reads today's team.v3 front", () => {
  CV.load("dev-morning");
  CV.setMode("live");
  try {
    for (const m of ["see_social", "open_friend", "see_as_friend", "make_link", "pick_face", "answer_card", "make_close"]) assert.deepEqual({ ...CV.M[m](), undo: 0 }, { ok: false, why: "not yet", undo: 0 }, m);
    assert.equal(circle().friends.length, 0);
    live.team = teamOf([{ project: "p1", name: "Parcel", count: 1, next: { label: "pricing waits" }, quiet: false, faces: ["Ana"] }, { project: "p2", name: "Old", count: 0, next: null, quiet: true, faces: [] }],
      [{ kind: "ask", id: "a1", project: "p1", from: "Ana", line: "Ship it?" }, { kind: "yes", id: "y1", project: "p1", from: "Ana", line: "Approve?" }]);
    assert.deepEqual(team().groups.map((g) => g.name), ["Parcel", "Old"]);
    assert.deepEqual(waitsAll().map((x) => x.w.kind), ["ask", "approve"]);
    assert.equal(count(), 2);
    assert.ok(CV.M.see_groups().ok);
  } finally { live.team = null; CV.setMode("fixture"); }
});

test("live Cowork (BR1): a group's page from team.v3: its talk and Agents' room as one room, an AI's run folded, Shared, People", () => {
  const NOW = new Date(2026, 10, 21, 18, 0).getTime(), m = 60_000;
  const g = teamOf([{ project: "p1", name: "Parcel", count: 0, next: null, quiet: false, faces: ["ana"] }], [], {
    p1: {
      lines: [{ id: "l1", from: "ana", at: NOW - 50 * m, text: "Pricing first?", asks: ["sam"] }, { id: "l2", from: "ana", agent: "claude", at: NOW - 40 * m, text: "Drafted the table" }],
      decided: [{ at: NOW - 30 * m, what: "pressed", why: "tidy", line: "Sorted the list", from: "ana" }, { at: NOW - 20 * m, what: "mine", why: "a price is a person's call", from: "sam" },
        { at: NOW - 10 * m, what: "woke", why: "" }],
      arts: [{ id: "a1", kind: "table", title: "Prices", whose: "ana", version: 3 }],
      people: [{ who: "ana", role: "owner", you: false, here: "here", agent: { busy: true } }, { who: "sam", role: "guest", you: true, here: "here", agent: null }],
    },
  }, "sam", NOW).groups[0];
  assert.deepEqual(g.lines.map((l) => l.fold ?? l.t), ["Pricing first?", "ana’s AI · 2 updates", "Left to you: a price is a person's call"]);
  assert.equal(g.lines[0].you, 1, "a line that names you says so"); assert.equal(g.lines[0].time, "5:10pm");
  assert.deepEqual(g.shared, [{ k: "table", n: "Prices", s: "v3 · ana", c: g.shared![0].c }]);
  assert.deepEqual(g.people.map((p) => [p.n, p.role, p.ai]), [["You", "reads", null], ["ana", "makes", "working now"]]);
  assert.equal(teamOf([{ project: "p2", name: "Old", count: 0, next: null, quiet: true, faces: [] }], []).groups[0].shared, undefined, "nothing read, no Shared");
});

test("live Social (BR1): #1072's State draws as the Circle, and a card answered settles its own request once", () => {
  const NOW = new Date(2026, 10, 12, 21, 40).getTime(), s = pretendState(NOW), c = circleOf(s, NOW);
  assert.deepEqual(c.friends.filter((f) => !f.waiting).map((f) => f.n), s.friends.map((f) => f.name));
  assert.deepEqual(c.inbox.map((x) => x.rid).sort(), openRequests(s).filter((r) => r.state === "open").map((r) => r.id).sort());
  assert.equal(c.me.busy?.length, 12); assert.equal(c.first, undefined); assert.equal(circleOf({ ...s, friends: [] }, NOW).first, 1);
  for (const w of ["Accept", "Run it", "Allow once", "Accept all"]) assert.ok(isYes(w), w);
  for (const w of ["Decline", "No", "Not this time", "No to all"]) assert.ok(!isYes(w), w);
  forgetSocial(); startSocial(true);
  CV.load("dev-morning"); CV.setMode("live");
  try {
    live.circle = circleOf(socialNow(), NOW); live.social = social;
    assert.ok(cardsAll().every((k) => k.id.startsWith("c:live:")));
    assert.ok(CV.M.see_social().ok, "the moves run once the wire is attached");
    assert.ok(CV.M.answer_card("c:live:p-friend", "Accept").ok);
    assert.equal(socialNow().friends.filter((f) => f.sol === "lena-v").length, 1, "accepted in #1072's own State");
    assert.equal(circle().inbox.some((x) => x.rid === "p-friend"), false, "and gone from the drawing");
  } finally { live.circle = null; live.social = null; CV.setMode("fixture"); forgetSocial(); }
});

test("live Social friends over Cowork's cloud (BR1): a pasted link's code, whoever my friend rooms hold as friends, one who left let go", () => {
  assert.equal(codeIn("https://cloud.matterfold.tech/relay/j/SNNM8L"), "SNNM8L");
  assert.equal(codeIn("look: https://x/relay/j/snnm8l?x=1"), "SNNM8L");
  assert.equal(codeIn("sol://join?code=W4J6VV"), "W4J6VV");
  assert.equal(codeIn("w4j6vv"), "W4J6VV");
  assert.equal(codeIn("isaacw"), "", "six letters with no digit is a name, not a code");
  assert.equal(codeIn("ana"), "");
  // what a pasted link carries around it (Marco's try, 2026-11-21 20:30: a period after the link read as no link)
  const L = "https://cloud.matterfold.tech/relay/j/CL69LK";
  for (const pasted of [`${L}.`, `${L},`, `(${L})`, `[${L}]`, `"${L}"`, `'${L}'`, `“${L}”`, `${L} `, `${L}\n`, `<${L}>`, `here: ${L}. see you`, "CL69LK.", "(cl69lk)"])
    assert.equal(codeIn(pasted), "CL69LK", JSON.stringify(pasted));
  assert.equal(codeIn(`${L}7`), "", "seven letters after /j/ is not a code");
  assert.ok(looksLikeLink(`${L}7`) && looksLikeLink("https://cloud.matterfold.tech/relay/") && !looksLikeLink("Denise"));
  const room = (o: Partial<Room>): Room => ({ code: "SNNM8L", name: "Friend · ana · r0x", mine: false, people: [], link: "", ...o });
  const s0 = { ...emptyState({ sol: "ben", name: "Ben", jelly: { preset: 0 }, presence: "online", agent: 0, published: { builds: 0, downloads: 0, wins: 0, helped: 0 }, premium: false }), outgoing: ["ana"] };
  const s1 = withRooms(s0, [room({ people: ["ana"] }), room({ code: "W4J6VV", mine: true })]);
  assert.deepEqual(s1.friends.map((f) => [f.sol, f.circle, f.grants.profile]), [["ana", "friend", true]], "met in the room: a friend, with the usual shares");
  assert.deepEqual(s1.outgoing, [], "and no longer asked by name");
  assert.equal(withRooms(s1, [room({ people: ["ana"] })], ["ana"]), s1, "nothing new: the same State");
  const c = circleOf(s1, Date.UTC(2026, 10, 21, 18), [room({ people: ["ana"] }), room({ code: "W4J6VV", mine: true })]);
  const ana = c.friends.find((f) => f.n === "ana")!;
  assert.deepEqual([ana.pres, ana.via], [null, "your link"], "where they are is not carried yet, so not said");
  assert.deepEqual(c.friends.filter((f) => f.waiting).map((f) => [f.n, f.waiting]), [["Your friend link", "for whoever opens it"]]);
  assert.equal(withRooms(s1, [room({ unknown: true })], ["ana"]), s1, "the cloud did not answer: nobody is let go");
  assert.deepEqual(withRooms(s1, [room({ gone: true })], ["ana"]).friends, [], "their room went: a friend no more");
  assert.deepEqual(withRooms({ ...s1, friends: [...s1.friends, { ...s1.friends[0], sol: "lena-v", name: "Lena" }] }, [], ["ana"]).friends.map((f) => f.sol), ["lena-v"],
    "a friend made here by #1072's own moves stays");
});

test("a friend's link pasted: it goes to the engine, a link that does not read says so, and the engine's why stays under the box", () => {
  forgetSocial();
  const sent: Record<string, unknown>[] = []; let hear: (m: unknown) => void = () => {};
  const off = attach({ send: (m: Record<string, unknown>) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as unknown as Engine);
  try {
    assert.equal(social.addLine(), "", "nothing said before an add");
    social.add("https://cloud.matterfold.tech/relay/j/CL69LK.");
    assert.deepEqual(sent.at(-1), { type: "next.social.friend.add", text: "https://cloud.matterfold.tech/relay/j/CL69LK." }, "the period did not stop it");
    assert.equal(social.add("https://cloud.matterfold.tech/relay/j/CL69"), LINK_UNREAD);
    assert.equal(social.addLine(), LINK_UNREAD, "a link that did not read is a line, never the name path");
    assert.equal(sent.filter((m) => m.type === "next.social.friend.add").length, 1, "and nothing went to the engine for it");
    hear({ type: "next.social.friend.add", ok: false, why: "someone opened that link already: ask them for a new one" });
    assert.equal(social.addLine(), "someone opened that link already: ask them for a new one", "the engine's why reaches the window as the line");
    // a friend link opened from the browser's join page: Sol hears sol://join?code=…, peeks, and asks before anything joins
    assert.equal(social.opened("https://example.org/nothing"), false, "no code, no ask");
    assert.equal(social.opened("sol://join?code=cl69lk"), true);
    assert.deepEqual(sent.at(-1), { type: "next.social.friend.peek", rid: "link:CL69LK", text: "CL69LK" }, "only a peek: nothing joined");
    hear({ type: "next.social.friend.peek", rid: "link:CL69LK", ok: true, code: "CL69LK", who: "denise", name: "Friend · denise · ab12" });
    assert.deepEqual(social.asking(), { code: "CL69LK", who: "denise" }, "Add denise as a friend?");
    assert.equal(social.answerLink(false), null);
    assert.equal(social.asking(), null, "Not now: the ask goes, nothing sent");
    assert.equal(sent.at(-1)!.type, "next.social.friend.peek");
    social.opened("sol://join?code=CL69LK");
    hear({ type: "next.social.friend.peek", rid: "link:CL69LK", ok: true, code: "CL69LK", who: "denise", name: "Friend · denise · ab12" });
    assert.equal(social.answerLink(true), "Asked: opening their link…");
    assert.deepEqual(sent.at(-1), { type: "next.social.friend.add", text: "CL69LK" }, "Yes adds the friend as a pasted link would");
    social.opened("sol://join?code=GRUPP2");
    hear({ type: "next.social.friend.peek", rid: "link:GRUPP2", ok: false, why: "that link is a group's (Study group): join it in Cowork" });
    assert.equal(social.asking(), null);
    assert.match(social.addLine(), /a group's \(Study group\)/, "a group's link says why on Social, under the box");
  } finally { off?.(); forgetSocial(); }
});

test("share a setup, the face (BR1 meta part 5): a card in words, a give rides our friend room, a take is kept with its Back", () => {
  const studio = { id: "p:Studio", kind: "place", name: "Studio", pieces: ["Who paid", "Book the kiln"] }, calm = { id: "f:diary.look", kind: "fit", knob: "diary.look", take: "calm" };
  assert.deepEqual(partsOf([studio, { kind: "fit", knob: "x" }, null, calm]), [studio, calm], "only the two shapes are read");
  assert.equal(fitWords("diary.look", "calm"), "Diary · calm");
  assert.equal(partLine(partsOf([studio])[0]), "a place, with 2 stickies");
  assert.equal(cardSize(partsOf([studio, calm])), "1 place and 1 setting");
  assert.deepEqual([toggle(["a"], "a"), toggle([], "b")], [[], ["b"]]);
  assert.equal(tookLine({ made: 1, from: "Denise" }), "1 piece from Denise");
  assert.ok(onPeople("share:Dev") && onPeople("setup:SNNM8L"));
  assert.deepEqual(crumbOf("share:Dev").map((x) => x.label), ["Social", "Dev", "How you work"]);
  assert.deepEqual(setupsOf([{ code: "SNNM8L", sha: "s1", from: "denise", at: 5, parts: [studio] }, { code: 1 }]).map((c) => c.code), ["SNNM8L"]);
  // live: a stand-in engine that keeps what the face sends and lets the test say the engine's answers
  forgetSocial();
  const sent: Record<string, unknown>[] = []; let hear: (m: unknown) => void = () => {};
  const off = attach({ send: (m: Record<string, unknown>) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as unknown as Engine);
  try {
    assert.ok(sent.some((m) => m.type === "next.social.setup.cards"), "the cards friends gave are asked at once, with the friends");
    assert.match(social.give("lucy", ["p:Studio"]).said, /met through a link/, "a friend asked by name has no room to give into");
    hear({ type: "next.social.friends", friends: [{ code: "SNNM8L", name: "Friend · ben · ab12", mine: true, people: ["denise"], link: "" }] });
    assert.deepEqual(social.give("Denise", []), { ok: false, said: "Pick at least one part to give" });
    assert.ok(social.give("Denise", ["p:Studio"]).ok);
    assert.deepEqual(sent.at(-1), { type: "next.social.setup.send", code: "SNNM8L", picks: ["p:Studio"] }, "our friend room, found by her login");
    hear({ type: "next.social.setup.cards", ok: true, cards: [{ code: "SNNM8L", sha: "s1", from: "denise", at: 5, parts: [studio, calm] }] });
    assert.equal(social.setupFrom("Denise")?.code, "SNNM8L");
    assert.equal(social.take("SNNM8L", ["p:Studio"]), null);
    assert.deepEqual(sent.at(-1), { type: "next.social.setup.take", code: "SNNM8L", sha: "s1", picks: ["p:Studio"] }, "the version read is the version taken");
    hear({ type: "next.social.setup.take", ok: true, plan: "w1", fits: [], made: 2, from: "denise" });
    assert.deepEqual(social.took(), { code: "SNNM8L", sha: "s1", plan: "w1", fits: [], made: 2, from: "denise", parts: ["p:Studio"] });
    assert.equal(social.back(), null);
    assert.deepEqual(sent.at(-1), { type: "next.social.setup.back", plan: "w1", fits: [] });
    hear({ type: "next.social.setup.back", ok: true });
    assert.equal(social.took(), null, "Back took it away");
  } finally { off?.(); forgetSocial(); }
});

test("Cowork live: a group's Invite copies a real link, a group's link opened or pasted asks in, and a pretend line says it is not here yet", () => {
  const url = "sol://join?project=studio-1&t=abcDEF123_-xyz";
  assert.equal(groupLink(url), url);
  assert.equal(groupLink(`${url}.`), url, "the period around a pasted link is not part of it");
  assert.equal(groupLink("sol://join?code=CL69LK"), "", "a friend's link is Social's");
  assert.equal(groupLink("https://example.org/join?project=a&t=b"), "", "only a link Sol wrote");
  assert.equal(invited("editor", 7 * 864e5, 0), "Invite link copied. One person opens it and asks in as someone who makes; you let them in. It works for 7 days.");
  assert.equal(invited("guest", undefined), "Invite link copied. One person opens it and asks in as someone who reads; you let them in.");
  assert.equal(notHere("Block "), "Not here yet: “Block” comes in a later Sol");
  forgetSocial();
  const sent: Record<string, unknown>[] = [], hears: ((m: unknown) => void)[] = [], flashes: string[] = [];
  const e = { send: (m: Record<string, unknown>) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hears.push(f); return () => {}; } } as unknown as Engine;
  const was = CV.hooks.flash;
  CV.hooks.flash = (t: string) => { flashes.push(t); };
  const offP = attachPeople(e), offS = attach(e);
  const hear = (m: unknown) => hears.forEach((f) => f(m));
  try {
    assert.equal(live.invite?.("../x"), false, "not a project id: nothing sent");
    assert.equal(live.invite?.("studio-1"), true);
    assert.deepEqual(sent.at(-1), { type: "team.v3.join.link", project: "studio-1", role: "editor", rid: "br1:invite:studio-1" });
    hear({ type: "work.v3.join.link", rid: "br1:invite:studio-1", error: "only an owner makes the join link" });
    assert.equal(flashes.at(-1), "Only an owner makes the join link", "the engine's why, as the frame's line");
    hear({ type: "work.v3.join.link", rid: "br1:invite:studio-1", ok: true, url, until: Date.now() + 7 * 864e5, role: "editor" });
    assert.match(flashes.at(-1)!, /^Invite link copied\. .* It works for 7 days\.$/);
    // opened from the browser: Social's ear hands a group's link to Cowork, never a friend peek
    assert.equal(social.opened(url), true);
    assert.deepEqual(sent.at(-1), { type: "team.v3.join.open", url, rid: "br1:join" });
    hear({ type: "work.v3.join.open", rid: "br1:join", ok: true, asked: true, project: "studio-1", role: "editor", name: "Studio" });
    assert.equal(flashes.at(-1), "You asked to join Studio. Whoever runs it lets you in; it shows here then.");
    // pasted in Social's box
    assert.match(social.add(`${url}.`) ?? "", /a group’s link/);
    assert.deepEqual(sent.at(-1), { type: "team.v3.join.open", url, rid: "br1:join" });
    hear({ type: "work.v3.join.open", rid: "br1:join", error: "this link has expired: ask Dev for a new one" });
    assert.equal(flashes.at(-1), "This link has expired: ask Dev for a new one");
    assert.equal(sent.filter((m) => m.type === "next.social.friend.peek").length, 0, "no group link went to the friend peek");
  } finally { offS?.(); offP?.(); CV.hooks.flash = was; forgetSocial(); }
  assert.equal(live.invite, null, "detached: nothing to send to");
});

test("a sticky a friend's setup made says whose (piece.from); one of mine, or of a change taken back, says nothing", () => {
  const plan = (id: string, source: string, status: Plan["status"], made: Made[], keptAt = 1): Plan =>
    ({ id, title: "", reason: "", source, created: 0, revision: 1, status, evidence: [], operations: [], keptAt, applied: { made } });
  const plans = [
    plan("w1", "from Denise", "kept", [{ kind: "home-folder", folder: "Mornings" }, { kind: "sticky", folder: "Mornings", sticky: { t: "Stretch ← now" } }]),
    plan("w2", "from Dev", "undone", [{ kind: "sticky", folder: "Mornings", sticky: { t: "Run" } }]),
    plan("w3", "Sol", "kept", [{ kind: "sticky", folder: "Mornings", sticky: { t: "Read" } }]),
    plan("w4", "from Lucy", "kept", [{ kind: "sticky", folder: "school", sticky: { t: "Flashcards" } }], 2),
  ];
  const m = madeFrom(plans);
  assert.deepEqual([...m.folders], [["mornings", "Denise"]]);
  assert.deepEqual([...m.stickies].map(([k, v]) => [k.replace("\0", " | "), v]), [["mornings | stretch", "Denise"], ["school | flashcards", "Lucy"]], "undone and Sol's own give nothing");
  const sticky = (id: string, region: string, key: string) => ({ id, region, kind: "sticky", name: key, key });
  const d = {
    regions: [{ id: "h:mornings", name: "mornings" }, { id: "h:school", name: "School" }],
    pieces: { a: sticky("a", "h:mornings", "Stretch"), b: sticky("b", "h:mornings", "Run"), c: { ...sticky("c", "h:school", "Flashcards"), from: "old" }, e: { ...sticky("e", "h:school", "Essay"), from: "Lucy" }, s: { id: "s", region: "w:/r", kind: "session", name: "x", from: "work" } },
    workspace: { plans },
  } as Parameters<typeof stampFrom>[0];
  stampFrom(d);
  assert.deepEqual(Object.fromEntries(Object.values(d.pieces).map((p) => [p.id, p.from ?? null])), { a: "Denise", b: null, c: "Lucy", e: null, s: "work" }, "a session's own from is left alone");
});
