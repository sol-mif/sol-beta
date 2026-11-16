// node --test src/*.test.ts (npm test here): one shared browser (#805, plan Part C slice 42; home/whole/shared.ts,
// browserStore.ts, SharedBrowser.tsx; the stub of #833). The Try line: sign in to LinkedIn once; Sol's tab is signed in
// too. And the rules under it: one jar, sealed with the Keychain; a tab is signed in by the jar whoever's hand it is in;
// Sol's hand stops before submit and can be taken over; banks and money never, in any hand; the switch is its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginOf, refused, seedSites, signedInAt, siteOf, stub, tabFoot, type BrowserMsg } from "./home/whole/shared.ts";
import { BROWSER_SHARED, readSwitch } from "./flag.ts";

const NOW = new Date(2026, 10, 9, 21, 0).getTime();
const tab = (m: BrowserMsg, id: string) => m.tabs.find((t) => t.id === id)!;
const site = (m: BrowserMsg, id: string) => m.sites.find((s) => s.id === id)!;

test("sign in to LinkedIn once; Sol's tab is signed in too", () => {
  const ask = stub(() => NOW), m0 = ask({ type: "browser.sites" });
  assert.equal(site(m0, "linkedin").signedIn, null, "not signed in to LinkedIn yet");
  const sam = tab(m0, "t-sam");
  assert.deepEqual([sam.hand, sam.site, sam.signedIn], ["sol", "linkedin", false], "Sol's tab on LinkedIn waits");
  assert.equal(tabFoot(sam, site(m0, "linkedin")), "Sol's hand · waits: LinkedIn is not signed in; sign in once, in your hand");
  // sign in once, in your hand: "sign in ›" opens LinkedIn's sign-in in a tab of yours
  const m1 = ask({ type: "browser.spawn", url: loginOf("linkedin")!, hand: "you" });
  const mine = m1.tabs.find((t) => t.hand === "you" && t.kind === "login")!;
  assert.equal(m1.front, mine.id);
  assert.match(tabFoot(mine, site(m1, "linkedin")), /Sol never types a password/);
  // you finish signing in (the engine sees the cookies arrive; the stub stands in for it)
  const m2 = ask({ type: "browser.stub.signedin", tabId: mine.id });
  assert.ok(m2.jar.sites.includes("linkedin"), "LinkedIn's cookies are in the one jar");
  assert.equal(tab(m2, "t-sam").signedIn, true, "and Sol's tab is signed in too");
  assert.equal(tab(m2, mine.id).signedIn, true);
  assert.equal(m2.front, "t-sam", "back to Sol's tab, now signed in");
  assert.equal(tabFoot(tab(m2, "t-sam"), site(m2, "linkedin")), "Sol's hand · reading Sam Ortiz's profile for the follow-up");
  assert.match(m2.done!.line, /^You signed in to LinkedIn once; Sol's tab is signed in too · kept until Dec 9$/);
  // what did I just do, and undo it
  const m3 = ask({ type: "home.undo", ledgerId: m2.done!.ledgerId });
  assert.equal(tab(m3, "t-sam").signedIn, false);
  assert.ok(!m3.jar.sites.includes("linkedin"));
  assert.equal(m3.front, "t-sam", "undo leaves Sol's tab in front, waiting again (R5)");
});

test("a press that does nothing keeps the receipt; every site a tab waits on can be signed in to (R1, R2)", () => {
  const ask = stub(() => NOW);
  const t = ask({ type: "browser.take", tabId: "t-figma" });
  assert.equal(ask({ type: "browser.take", tabId: "t-figma" }).done?.ledgerId, t.done!.ledgerId, "taking a tab already yours");
  assert.equal(ask({ type: "browser.signout", siteId: "linkedin" }).done?.ledgerId, t.done!.ledgerId, "signing out of a site not signed in");
  assert.equal(ask({ type: "browser.stub.signedin", tabId: "t-sam" }).done?.ledgerId, t.done!.ledgerId, "a sign-in on Sol's tab");
  const m = ask({ type: "browser.sites" });
  for (const s of m.sites.filter((x) => !x.never)) {
    assert.ok(loginOf(s.id), `${s.id} has a sign-in`);
    assert.equal(siteOf(loginOf(s.id)!, m.sites)?.id, s.id, `${s.id}'s sign-in is on its own site`);
  }
});

test("one jar, sealed with the Keychain: a tab is signed in by its site, whoever's hand it is in", () => {
  const m = stub(() => NOW)({ type: "browser.sites" });
  assert.deepEqual([m.jar.sealed, m.jar.profile], ["keychain", "home/browser-profile"], "the engine's one profile (browser.ts on main)");
  for (const hand of ["you", "sol"] as const) assert.equal(signedInAt({ site: "portals" }, m.jar.sites), true, `${hand}'s tab on a signed-in site`);
  assert.equal(tab(m, "t-figma").signedIn, true);
  assert.equal(siteOf("https://boards.greenhouse.io/figma/jobs/5123", m.sites)?.id, "portals");
  assert.equal(siteOf("https://www.linkedin.com/in/x", m.sites)?.id, "linkedin");
});

test("Sol's hand stops before submit, and you can take over", () => {
  const ask = stub(() => NOW), m = ask({ type: "browser.sites" });
  assert.equal(tabFoot(tab(m, "t-figma"), site(m, "portals")), "Sol's hand · field 4 of 7 · stops before submit");
  assert.ok(site(m, "portals").struck.includes("act"), "the job portals can never be at act: submit is yours");
  const t = ask({ type: "browser.take", tabId: "t-figma" });
  assert.equal(tab(t, "t-figma").hand, "you");
  assert.equal(t.done?.line, "You took over Figma · Greenhouse; Sol's hand stopped");
  assert.equal(tab(ask({ type: "home.undo", ledgerId: t.done!.ledgerId }), "t-figma").hand, "sol");
});

test("banks and money: never, in any hand", () => {
  const sites = seedSites(NOW), ask = stub(() => NOW);
  assert.equal(refused("https://www.chase.com/statement", sites), true);
  assert.equal(refused("https://github.com/sol-mif", sites), false);
  for (const hand of ["you", "sol"] as const) {
    const m = ask({ type: "browser.spawn", url: "https://www.chase.com/statement", hand });
    // C43 (#806): the tab shows the refusal and its page never loads (it was "no tab" before)
    assert.ok(m.tabs.filter((x) => x.url.includes("chase")).every((x) => x.kind === "refused"), `refused, in ${hand}r hand`);
    assert.match(m.done!.line, /^Refused before it loaded: chase\.com, on the never list/);
  }
});

test("spawn, one press from a thing: open in your hand, run in Sol's", () => {
  const ask = stub(() => NOW), url = "https://canvas.bu.edu/courses/bio201/files/lecture-12";
  const o = ask({ type: "browser.spawn", url, hand: "you", thingId: "t-slides" }), mine = o.tabs.at(-1)!;
  assert.deepEqual([mine.hand, mine.signedIn, mine.thingId], ["you", true, "t-slides"], "your hand, already signed in");
  const r = ask({ type: "browser.spawn", url, hand: "sol", thingId: "t-slides" });
  assert.equal(r.tabs.at(-1)!.hand, "sol");
  assert.equal(r.done?.line, "Sol's hand is running it; watch it here, take over any time");
});

test("the switch is its own (browser.shared, off by default) and the seams are marked", () => {
  assert.equal(BROWSER_SHARED, "browser.shared");
  assert.equal(readSwitch(BROWSER_SHARED, "", null), false);
  assert.equal(readSwitch(BROWSER_SHARED, "?browser.shared=on", null), true);
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "browser" && browserOn \? <BrowserView \/> \/\* C42 \*\//);
  const sources = readFileSync(new URL("./home/whole/Sources.tsx", import.meta.url), "utf8");
  assert.match(sources, /C42[\s\S]*\{browserOn && <>[\s\S]*goTo\("browser"\)/);
});

test("choosing a tab is not an act: the last receipt stays, with its undo", () => {
  const ask = stub(() => NOW);
  const t = ask({ type: "browser.take", tabId: "t-figma" });
  const f = ask({ type: "browser.front", tabId: "t-sam" });
  assert.equal(f.front, "t-sam");
  assert.equal(f.done?.ledgerId, t.done!.ledgerId, "still there to undo");
});
