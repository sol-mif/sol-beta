// node --test src/social.test.ts: Social's model (fr-31, specs/features/fr-31-social/eval.md E2–E11, F1–F5, N1, N4).
// Test names carry the eval's words so each eval line's --test-name-pattern finds its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  JELLIES, styleOf, pickJelly, uploadJelly, addFriend, parseInvite, inviteLink, setCircle, setGrant, granted, answerAsk, receive,
  freeBusy, proposeTime, makeInvite, calendarUrl, accept, decline, shareOnAccept, notchButton, openRequests, receiveHelp, takeOn,
  sendBack, xpOf, levelOf, badgesOf, buy, install, uninstall, suggest, isClass, emptyState, shareWord, noteTold, type State, type Request,
} from "./social/model.ts";
import { pretendState, BUILDS, ME, nextDay } from "./social/pretend.ts";
import { socialOn, pretendFriends, useEverythingOn, socialViewKind, spineShows } from "./social/flag.ts";
import { readNotch, writeNotch, NOTCH_KEY, answersNotch, askRequests, takeOpenAsk, openOn, peekOpenAsk } from "./social/notch.ts";
import { startSocial, stopSocial, forgetSocial } from "./social/store.ts";

const NOW = new Date(2026, 10, 12, 21, 40).getTime();   // Thursday 12 Nov 2026, 9:40pm
const H = 3_600_000;
const S0 = (): State => pretendState(NOW);
const friend = (s: State, sol: string) => s.friends.find((f) => f.sol === sol)!;

test("jelly: a preset, an upload and the default each give a picture, and the style is the same wherever it is drawn", () => {
  const me = emptyState(ME).me;
  assert.deepEqual(pickJelly({ preset: 0 }, 3), { preset: 3 });
  assert.deepEqual(pickJelly({ preset: 2, img: "data:image/png;base64,x" }, 4), { preset: 4 }, "a preset drops the upload");
  assert.equal(uploadJelly({ preset: 2 }, "data:image/png;base64,x").img, "data:image/png;base64,x");
  assert.equal(uploadJelly({ preset: 2 }, "javascript:alert(1)").img, undefined, "only an image");
  assert.deepEqual(pickJelly({ preset: 1 }, 99), { preset: 1 });
  assert.deepEqual(styleOf({ jelly: { preset: 0 } }), { a: JELLIES[0].a, b: JELLIES[0].b, pace: JELLIES[0].pace });
  assert.deepEqual(styleOf(me), styleOf({ jelly: me.jelly }), "one style per person: the friend card and the agent's box read the same");
  assert.deepEqual(styleOf({ jelly: { preset: 42 } }), styleOf({ jelly: { preset: 0 } }), "an unknown preset is the default jelly");
});

test("friend: add by Sol name or invite link makes one outgoing request", () => {
  let s = S0();
  const a = addFriend(s, "lena-v"); assert.equal(a.error, undefined); s = a.s;
  assert.deepEqual(s.outgoing, ["lena-v"]);
  assert.match(addFriend(s, "lena-v").error ?? "", /already asked/);
  const link = inviteLink("bo-chen", "7f3a");
  assert.deepEqual(parseInvite(link), { sol: "bo-chen", k: "7f3a" });
  assert.deepEqual(addFriend(s, link).s.outgoing, ["lena-v", "bo-chen"]);
  assert.ok(addFriend(s, "X!").error);
  assert.ok(addFriend(s, ME.sol).error);
  assert.ok(addFriend(s, "marco").error, "already a friend");
});

test("friend: accepted makes a friend with the three commonly shared grants on; declined makes nothing", () => {
  const s = S0();
  const a = accept(s, "p-friend", NOW).s;
  const lena = friend(a, "lena-v");
  assert.equal(lena.circle, "friend");
  assert.deepEqual(lena.grants, { freebusy: true, profile: true, working: true });
  const d = decline(s, "p-friend").s;
  assert.equal(d.friends.some((f) => f.sol === "lena-v"), false);
  assert.equal(d.requests.find((r) => r.id === "p-friend")!.state, "declined");
  // a switch turned off on the accept card is not shared
  const off = accept(shareOnAccept(s, "p-friend", "working", false), "p-friend", NOW).s;
  assert.equal(friend(off, "lena-v").grants.working, false);
});

test("friend: close friends are a second list; leaving it turns close-only grants off", () => {
  let s = S0();
  s = setCircle(s, "frank", "close");
  assert.equal(friend(s, "frank").circle, "close");
  s = setGrant(s, "frank", "calendar", true).s;
  s = setGrant(s, "frank", "location", true, NOW + H).s;
  s = setCircle(s, "frank", "friend");
  assert.equal(friend(s, "frank").grants.calendar, undefined);
  assert.equal(friend(s, "frank").grants.location, undefined);
  assert.equal(friend(s, "frank").grants.freebusy, true);
});

test("grant: the commonly shared three for a friend, calendar/projects/location only for a close friend, location ends itself", () => {
  let s = S0();
  assert.equal(granted(friend(s, "frank"), "freebusy", NOW), true);
  assert.match(setGrant(s, "frank", "calendar", true).error ?? "", /close friend/);
  s = setGrant(s, "marco", "projects", true).s;
  assert.equal(granted(friend(s, "marco"), "projects", NOW), true);
  assert.ok(setGrant(s, "marco", "location", true).error, "location needs an end");
  s = setGrant(s, "marco", "location", true, NOW + H).s;
  assert.equal(granted(friend(s, "marco"), "location", NOW + H - 1), true);
  assert.equal(granted(friend(s, "marco"), "location", NOW + H), false, "turned itself off");
});

test("a2a: a granted ask is answered from what was shared; free/busy gives blocks and never names", () => {
  const s = S0();
  const thu = nextDay(NOW, 4);
  const a = answerAsk(s, "marco", { what: "freebusy", from: thu, to: thu + 24 * H }, NOW);
  assert.ok("answer" in a);
  const fb = (a as { answer: { freebusy: { start: number; end: number }[] } }).answer.freebusy;
  assert.equal(fb.length, 3);
  assert.equal(JSON.stringify(fb).includes("CHEM"), false, "no titles in free/busy");
  const w = answerAsk(s, "frank", { what: "working", from: 0, to: 0 }, NOW);
  assert.ok("answer" in w);
  assert.deepEqual((w as { answer: unknown }).answer, { working: ME.working });
});

test("a2a: anything not granted becomes a request to the person, never an answer", () => {
  const s = S0();
  const a = answerAsk(s, "jev", { what: "working", from: 0, to: 0, why: "what's Isaac up to" }, NOW);
  assert.ok("request" in a);
  const r = (a as { request: Request }).request;
  assert.equal(r.kind, "data"); assert.equal(r.ask, "working"); assert.equal(r.state, "open");
  const s2 = receive(receive(s, r), r);
  assert.equal(s2.requests.filter((x) => x.id === r.id).length, 1, "lands once");
  assert.deepEqual(answerAsk(s, "stranger", { what: "profile", from: 0, to: 0 }, NOW), { refused: "not a friend" });
});

test("a2a not close: a friend's agent asking for location gets a request, and granting location to a non-close friend is refused", () => {
  const s = S0();
  const a = answerAsk(s, "frank", { what: "location", from: 0, to: 0 }, NOW);
  assert.ok("request" in a);
  const s2 = receive(s, (a as { request: Request }).request);
  const id = s2.requests[0].id;
  const r = accept(s2, id, NOW);
  assert.match(r.told ?? "", /close friend/);
  assert.equal(granted(friend(r.s, "frank"), "location", NOW), false);
});

test("a2a asks first: with your agent on asks first, even a granted ask comes to you, its yes one press", () => {
  const s = { ...S0(), me: { ...S0().me, agent: 0 as const } };
  const a = answerAsk(s, "marco", { what: "freebusy", from: 0, to: NOW * 2 }, NOW);
  assert.ok("request" in a);
  assert.match((a as { request: Request }).request.full, /asks first/);
});

test("a2a not close, the yes: a close-only ask from a friend not close has no Share; location says how long", () => {
  const s = S0();
  const loc = (who: string) => receive(s, (answerAsk(s, who, { what: "location", from: 0, to: 0 }, NOW) as { request: Request }).request);
  const f = loc("frank"); assert.equal(shareWord(f, f.requests[0]), null);
  const m = loc("marco"); assert.equal(shareWord(m, m.requests[0]), "Share for 1 hour");
});

test("a2a revoke: a grant turned off is honoured at the very next ask", () => {
  let s = S0();
  assert.ok("answer" in answerAsk(s, "frank", { what: "freebusy", from: 0, to: NOW * 2 }, NOW));
  s = setGrant(s, "frank", "freebusy", false).s;
  assert.ok("request" in answerAsk(s, "frank", { what: "freebusy", from: 0, to: NOW * 2 }, NOW));
});

test("dinner: Marco's agent reads Isaac's free/busy for Thursday, proposes 7:30 at the place Marco typed; Accept makes the calendar link", () => {
  let s = S0();
  const thu = nextDay(NOW, 4);
  const a = answerAsk(s, "marco", { what: "freebusy", from: thu, to: thu + 24 * H }, NOW) as { answer: { freebusy: { start: number; end: number }[] } };
  const t = proposeTime(a.answer.freebusy, thu, 1.5 * H)!;
  assert.equal(new Date(t.start).getHours(), 19); assert.equal(new Date(t.start).getMinutes(), 30);
  const marco = friend(s, "marco");
  const inv = makeInvite(marco, { title: "Dinner", place: "The Grotto", start: t.start, end: t.end }, "my treat", NOW);
  assert.match(inv.summary, /Marco invites you to dinner at The Grotto, 7:30pm/);
  s = receive(s, inv);
  assert.equal(notchButton(s).count, 4);
  const r = accept(s, inv.id, NOW);
  assert.ok(r.calendar?.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&text=Dinner&location=The%20Grotto&dates="));
  assert.equal(r.s.requests.find((x) => x.id === inv.id)!.state, "accepted");
  assert.equal(r.s.calendar.filter((e) => e.title === "Dinner").length, 1);
  assert.equal(calendarUrl({ title: "a b", place: "c", start: Date.UTC(2026, 10, 19, 0, 30), end: Date.UTC(2026, 10, 19, 2) }).endsWith("dates=20261119T003000Z/20261119T020000Z"), true);
  // a day with the evening full proposes nothing
  assert.equal(proposeTime([{ start: thu + 18 * H, end: thu + 23 * H }], thu, H), null);
});

test("twice: Accept pressed twice settles once (one calendar entry, one friend)", () => {
  let s = S0();
  const thu = nextDay(NOW, 4);
  const inv = makeInvite(friend(s, "marco"), { title: "Dinner", place: "The Grotto", start: thu + 19.5 * H, end: thu + 21 * H }, undefined, NOW);
  s = receive(s, inv);
  const once = accept(s, inv.id, NOW).s; const twice = accept(once, inv.id, NOW);
  assert.equal(twice.s.calendar.filter((e) => e.title === "Dinner").length, 1);
  assert.equal(twice.calendar, undefined, "no second calendar page");
  const f1 = accept(s, "p-friend", NOW).s; const f2 = accept(f1, "p-friend", NOW).s;
  assert.equal(f2.friends.filter((f) => f.sol === "lena-v").length, 1);
});

test("request: every kind is one list with a count for the notch's green button; Accept and Decline each settle it once", () => {
  let s = S0();
  assert.deepEqual(s.requests.map((r) => r.kind).sort(), ["data", "friend", "help"]);
  assert.equal(notchButton(s).count, 3);
  assert.deepEqual(notchButton(s).top, { preset: 3 });
  s = accept(s, "p-data", NOW).s;
  assert.equal(granted(friend(s, "ana-k"), "projects", NOW), true);
  s = decline(s, "p-friend").s;
  assert.equal(decline(s, "p-friend").s, s, "declined once");
  assert.equal(notchButton(s).count, 1);
  assert.equal(notchButton({ requests: [] }).count, 0);
});

test("help: an ask reaches the helper and nothing runs; Take it on gives the prompt for their own session; Send back counts one friend helped", () => {
  let s = S0();
  const r0 = s.requests.find((r) => r.kind === "help")!;
  const t = takeOn(s, r0.id);
  assert.match(t.prompt ?? "", /^Read sol\/hub/);
  // context travels with the prompt, after it
  const withCtx = receiveHelp({ ...S0(), favour: { perWeek: 5, from: "friends" } }, "marco", { summary: "a look", prompt: "read my essay", context: "it's in ~/essays/final.md", size: "about a 5-minute job" }, NOW);
  assert.match(takeOn(withCtx.s, withCtx.s.requests[0].id).prompt ?? "", /^read my essay\n\nContext:\nit's in ~\/essays\/final\.md/);
  assert.match(t.prompt ?? "", /A favour for Frank/);
  s = t.s;
  assert.equal(s.requests.find((r) => r.id === r0.id)!.state, "taken");
  assert.equal(openRequests(s).some((r) => r.id === r0.id), true, "still open until sent back");
  assert.equal(notchButton(s).count, 2, "taken is no longer waiting on the notch");
  assert.ok(sendBack(s, r0.id, "  ").error);
  const b = sendBack(s, r0.id, "done: PR #1");
  assert.equal(b.to, "frank");
  assert.equal(b.s.me.published.helped, ME.published.helped + 1);
  assert.equal(sendBack(b.s, r0.id, "again").s, b.s, "sent once");
});

test("help limit: over the favour limit, or from someone the limit leaves out, it never reaches the helper and the asker hears why", () => {
  let s = { ...S0(), favour: { perWeek: 2, from: "close" as const } };
  const ask = { summary: "a look at my essay", prompt: "read it", size: "about a 5-minute job" };
  const fromFrank = receiveHelp(s, "frank", ask, NOW);
  assert.match(fromFrank.refused ?? "", /close friends only/);
  assert.equal(fromFrank.s, s);
  s = receiveHelp(s, "marco", ask, NOW).s;
  s = receiveHelp(s, "ana-k", ask, NOW).s;
  const third = receiveHelp(s, "marco", ask, NOW);
  assert.match(third.refused ?? "", /used up this week/);
  assert.equal(third.s.requests.filter((r) => r.kind === "help" && r.state === "open").length, 3);
  // a new week, a new count
  assert.equal(receiveHelp(s, "marco", ask, NOW + 7 * 24 * H).refused, undefined);
  const all = { ...s, favour: { perWeek: 5, from: "friends" as const } };
  assert.equal(receiveHelp(all, "frank", ask, NOW).refused, undefined);
});

test("level: XP only from builds posted, downloads, challenges won and friends helped; the bar follows", () => {
  assert.equal(xpOf({ builds: 1, downloads: 0, wins: 0, helped: 0 }), 100);
  assert.equal(xpOf({ builds: 0, downloads: 10, wins: 1, helped: 2 }), 50 + 500 + 100);
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 100 });
  assert.deepEqual(levelOf(100), { level: 2, into: 0, need: 115 });
  assert.equal(levelOf(xpOf(ME.published)).level > 1, true);
  assert.deepEqual(badgesOf({ builds: 0, downloads: 0, wins: 0, helped: 0 }, false), []);
  assert.equal(badgesOf(ME.published, true).length, 5);
});

test("market: a look installs for real as a look patch and Undo restores the old look", () => {
  let s = S0();
  const night = BUILDS.find((b) => b.id === "night")!;
  const old = { color: "#000000", alpha: 0.78 };
  const i = install(s, night, old);
  assert.deepEqual(i.patch, night.look);
  s = i.s;
  const u = uninstall(s, night);
  assert.equal(u.s.installed.includes("night"), false);
  assert.deepEqual(u.patch, old, "Undo puts back the look Night Shift replaced, whatever else is installed");
  // two looks: Undo on the second puts the first back
  let t = install(S0(), night, old).s;
  const peach = BUILDS.find((b) => b.id === "peach")!;
  t = buy(t, peach).s;
  const ip = install(t, peach, night.look);
  assert.deepEqual(uninstall(ip.s, peach).patch, night.look);
});

test("market: a button's install is refused as pretend; buying lowers the balance and a rivalrous build's stock, and is refused without enough", () => {
  let s = S0();
  const canvas = BUILDS.find((b) => b.id === "canvas")!, gold = BUILDS.find((b) => b.id === "gold")!;
  assert.match(install(s, canvas, {}).error ?? "", /buy it first/);
  s = buy(s, canvas).s;
  assert.equal(s.credits, 1000);
  assert.match(install(s, canvas, {}).error ?? "", /pretend until builds are reviewed/);
  const rail = BUILDS.find((b) => b.id === "rail")!;
  assert.match(install(buy(s, rail).s, rail, {}).error ?? "", /rail arrangements are pretend/);
  s = buy(s, gold).s;
  assert.equal(s.credits, 100); assert.equal(s.stock.gold, 8);
  assert.match(buy(s, BUILDS.find((b) => b.id === "peach")!).error ?? "", /not enough/);
  assert.equal(buy({ ...S0(), stock: { gold: 0 } }, gold).error, "all gone");
});

test("suggest: ranked from popularity and what is installed; the use-everything signal changes the order only when it is on", () => {
  const s = S0();
  const off = suggest(BUILDS, s, null).map((b) => b.id);
  assert.equal(off.includes("canvas"), false, "code is never suggested");
  assert.equal(off.includes("focus"), false, "installed is not suggested");
  assert.deepEqual(off, ["night", "peach", "gold"]);
  const on = suggest(BUILDS, s, ["warm", "study"]).map((b) => b.id);
  assert.deepEqual(on, ["peach", "night", "gold"]);
  assert.deepEqual(suggest(BUILDS, { ...s, skipped: ["night"] }, null).map((b) => b.id), ["peach", "gold"]);
});

test("classes are picked out of a calendar by name", () => {
  assert.equal(isClass({ title: "CHEM 241 lecture", start: 0, end: 1 }), true);
  assert.equal(isClass({ title: "Gym", start: 0, end: 1 }), false);
  assert.deepEqual(freeBusy([{ title: "a", start: 1, end: 5 }, { title: "b", start: 4, end: 8 }, { title: "c", start: 10, end: 12 }], 0, 11), [{ start: 1, end: 8 }, { start: 10, end: 11 }]);
});

test("off: the switch is off unless the engine says on; ?dev=social only in a dev build", () => {
  assert.equal(socialOn(null, "", false), false);
  assert.equal(socialOn({}, "", true), false);
  assert.equal(socialOn({ social: { on: true, useEverything: false } }, "", false), true);
  assert.equal(socialOn({ social: { on: false } }, "?dev=social", false), false, "a stray link in Sol.app does nothing");
  assert.equal(socialOn({}, "?dev=social", true), true);
  assert.equal(pretendFriends("?dev=social", false), false);
  // a build with Social baked on (VITE_SOCIAL), and the normal build with nothing baked
  assert.equal(socialOn({}, "", false, "pretend"), true);
  assert.equal(pretendFriends("", false, "pretend"), true);
  assert.equal(socialOn({}, "", false, "on"), true);
  assert.equal(pretendFriends("", false, "on"), false);
  assert.equal(socialOn({}, "", false, ""), false);
  assert.equal(useEverythingOn({ social: { on: true } }), false);
  // the drawn view and the spine: off, the empty view as it was and the spine on its own switch only
  assert.equal(socialViewKind(false, true), "empty");
  assert.equal(socialViewKind(true, false), "empty", "no engine, no Social");
  assert.equal(socialViewKind(true, true), "social");
  assert.equal(spineShows(false, false, false), false);
  assert.equal(spineShows(false, true, false), true, "Social on shows the spine, its place");
  assert.equal(spineShows(true, false, false), true);
  assert.equal(spineShows(true, true, true), false, "never in a popped-out window");
});

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };
test("off: the notch shows no request button once Social is off, and the key carries only a count and a preset", () => {
  const st = mem();
  const s = S0();
  writeNotch(st, notchButton(s));
  assert.deepEqual(readNotch(st), { count: 3, top: { preset: 3 } });
  assert.equal(st.m.get(NOTCH_KEY)!.includes("Lena"), false, "no names cross to the notch");
  writeNotch(st, { count: 2, top: { preset: 1, img: "data:image/png;base64,xx" } });
  assert.equal(st.m.get(NOTCH_KEY)!.includes("data:"), false, "no picture crosses either");
  writeNotch(st, null);
  assert.deepEqual(readNotch(st), { count: 0 });
  assert.equal(st.m.has(NOTCH_KEY), false);
  st.setItem(NOTCH_KEY, "{bad");
  assert.deepEqual(readNotch(st), { count: 0 });
  st.setItem(NOTCH_KEY, JSON.stringify({ count: -2 }));
  assert.deepEqual(readNotch(st), { count: 0 });
  assert.deepEqual(readNotch(null), { count: 0 });
  // the main window answers the notch's press only with Social on, read as it is now
  assert.equal(answersNotch("social", false), false);
  assert.equal(answersNotch("social", true), true);
  assert.equal(answersNotch("work", true), false);
  // the press's page is queued for a Social not mounted yet, and read once
  const ss = mem();
  assert.equal(takeOpenAsk(ss), null);
  askRequests(ss);
  assert.equal(takeOpenAsk(ss), "requests");
  assert.equal(takeOpenAsk(ss), null, "read once");
  // before the jelly step is done the ask waits, untouched; Done takes it
  askRequests(ss);
  assert.equal(openOn(false, ss), null);
  assert.equal(peekOpenAsk(ss), "requests", "still queued");
  assert.equal(openOn(true, ss), "requests");
  assert.equal(peekOpenAsk(ss), null);
});

test("off then on: the notch's key goes with Social off and comes back with it on", () => {
  const st = mem();
  forgetSocial();
  st.setItem("sol.social.pretend", JSON.stringify(S0()));
  startSocial(true, st);
  assert.equal(readNotch(st).count, 3);
  stopSocial(st);
  assert.equal(readNotch(st).count, 0);
  startSocial(true, st);
  assert.equal(readNotch(st).count, 3, "on again: the button is back, requests still waiting");
  forgetSocial();
});

test("market: a look under a later look is undone after it, never wiping the one still on", () => {
  const night = BUILDS.find((b) => b.id === "night")!, peach = BUILDS.find((b) => b.id === "peach")!;
  let s = install(S0(), night, { color: "#000000" }).s;
  s = install(buy(s, peach).s, peach, night.look).s;
  assert.match(uninstall(s, night, BUILDS).error ?? "", /undo Peach Fuzz first/);
  const u = uninstall(s, peach, BUILDS);
  assert.deepEqual(u.patch, night.look);
  assert.deepEqual(uninstall(u.s, night, BUILDS).patch, { color: "#000000" });
  // a preset writes the look too, so it stacks the same way
  const focus = BUILDS.find((b) => b.id === "focus")!;
  let p = uninstall(S0(), focus, BUILDS).s;
  p = install(p, night, { color: "#000000", bubble: "edge" }).s;
  p = install(p, focus, night.look).s;
  assert.match(uninstall(p, night, BUILDS).error ?? "", /undo Focus preset first/);
});

test("a2a does, then tells: a granted ask is answered and leaves you a line; does leaves none", () => {
  const s1 = S0();   // Isaac's agent: does, then tells
  const a = answerAsk(s1, "marco", { what: "freebusy", from: 0, to: NOW * 2, why: "dinner?" }, NOW);
  assert.ok("answer" in a && a.told?.startsWith("Marco's agent read your free / busy"));
  const told = noteTold(s1, a, NOW);
  assert.equal(told.told?.length, 1);
  const s2 = { ...S0(), me: { ...S0().me, agent: 2 as const } };
  const b = answerAsk(s2, "marco", { what: "freebusy", from: 0, to: NOW * 2 }, NOW);
  assert.ok("answer" in b && b.told === undefined);
  assert.equal(noteTold(s2, b, NOW).told, undefined);
});

const socialFiles = () => readdirSync(new URL("./social/", import.meta.url)).map((f) => readFileSync(new URL(`./social/${f}`, import.meta.url), "utf8"));
test("words: no word in Social's code or page says borrow, lend, token budget or proxy", () => {
  const page = readFileSync(new URL("../../design/social/index.html", import.meta.url), "utf8");
  for (const t of [...socialFiles(), page]) assert.doesNotMatch(t, /\bborrow|\blend(ing|s)?\b|\btoken budget|\bproxy\b/i);
});

test("tracking: Social's files import nothing from track", () => {
  for (const t of socialFiles()) assert.doesNotMatch(t, /from ["'][^"']*track/);
});
