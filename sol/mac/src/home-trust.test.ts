// node --test src/*.test.ts (npm test here): site scopes, the money refusal, the page ledger (#806, plan Part C slice
// 43; home/whole/refusals.ts, shared.ts's C43 parts, Trust.tsx; the stub of #834). The Try line: Sol's hand on a bank URL:
// refused, the page never loads. And the rules under it: the list and Jev's money question at .45, in any hand; a
// site's rung never above a struck one; a sign-in lapses after 30 days; every visit is a ledger row, a refusal too, and
// a submit is always yours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAPSE_DAYS, MONEY_LINE, fieldsBy, lapsed, ledgerCounts, listed, moneyP, refusalOf, refusalWords, seedVisits, submitsAreYours } from "./home/whole/refusals.ts";
import { ceilingOf, stub, type BrowserMsg } from "./home/whole/shared.ts";

const NOW = new Date(2026, 10, 9, 21, 0).getTime();
const BANK = "https://www.chase.com/statement";
const last = (m: BrowserMsg) => m.tabs.at(-1)!;

test("Sol's hand on a bank URL: refused, the page never loads", () => {
  const ask = stub(() => NOW), before = ask({ type: "browser.sites" }).ledger.length;
  const m = ask({ type: "browser.spawn", url: BANK, hand: "sol", thingId: "l-chase" });
  const t = last(m);
  assert.equal(t.kind, "refused", "the tab shows the refusal, not a page");
  assert.equal(t.hand, "sol");
  assert.equal(t.signedIn, false);
  assert.equal(t.step, undefined, "Sol's hand did nothing there");
  assert.deepEqual(t.refused, { by: "list", kind: "a bank" });
  assert.equal(m.front, t.id, "you see it");
  assert.equal(m.done?.line, "Refused before it loaded: chase.com, on the never list (a bank) · nothing was fetched · in the ledger");
  const row = m.ledger.at(-1)!;
  assert.equal(m.ledger.length, before + 1, "the refusal is a ledger row");
  assert.deepEqual([row.hand, row.url, row.did, row.flow], ["sol", BANK, "refused before it loaded", "a link in a mail"]);
  // undo closes the refused tab; the ledger keeps the row (a record, never rewritten)
  const u = ask({ type: "home.undo", ledgerId: m.done!.ledgerId });
  assert.ok(!u.tabs.some((x) => x.id === t.id));
  assert.equal(u.ledger.length, before + 1);
});

test("the list, then Jev's money question at .45: in any hand", () => {
  assert.equal(listed(BANK), "a bank");
  assert.equal(listed("https://paypal.com/x"), "a payment");
  assert.equal(listed("https://myaccount.google.com"), "your account page");
  assert.equal(listed("https://github.com/sol-mif"), null);
  assert.equal(MONEY_LINE, 0.45);
  assert.deepEqual(refusalOf("https://riverside-cu.org/login/confirm"), { by: "jev", p: 0.72 }, "not on the list: Jev reads it as money");
  assert.equal(refusalWords({ by: "jev", p: 0.72 }), "Jev read it as a money site (.72, refused from .45)");
  for (const ok of ["https://github.com/sol-mif", "https://www.linkedin.com/in/sam-ortiz", "https://canvas.bu.edu/courses/bio201", "https://boards.greenhouse.io/shopify"])
    assert.ok(moneyP(ok) < MONEY_LINE && refusalOf(ok) === null, `${ok} is let through`);
  const ask = stub(() => NOW);
  const mine = last(ask({ type: "browser.spawn", url: BANK, hand: "you" }));
  assert.equal(mine.kind, "refused", "in your hand too: use your own browser for money");
  const rcu = ask({ type: "browser.spawn", url: "https://riverside-cu.org/login/confirm", hand: "sol" });
  assert.equal(last(rcu).kind, "refused");
  assert.match(rcu.done!.line, /Jev read it as a money site \(\.72, refused from \.45\)/);
});

test("site scopes: a rung per site, never above a struck one", () => {
  const ask = stub(() => NOW);
  const li = ask({ type: "browser.site.set", siteId: "linkedin", rung: "propose" });
  assert.equal(li.sites.find((s) => s.id === "linkedin")!.rung, "propose");
  assert.equal(li.done?.line, "LinkedIn: Sol's hand at propose now");
  const portals = li.sites.find((s) => s.id === "portals")!;
  assert.equal(ceilingOf(portals), 3, "act is struck on the job portals");
  const no = ask({ type: "browser.site.set", siteId: "portals", rung: "act" });
  assert.equal(no.sites.find((s) => s.id === "portals")!.rung, "draft", "never at act: submit is yours");
  assert.equal(no.done?.line, "Job portals can never be at act: never presses submit");
  assert.equal(ask({ type: "browser.site.set", siteId: "money", rung: "read" }).sites.find((s) => s.id === "money")!.never, true);
  const back = ask({ type: "home.undo", ledgerId: li.done!.ledgerId });
  assert.equal(back.sites.find((s) => s.id === "linkedin")!.rung, "draft");
});

test("a sign-in is kept 30 days after it was last used", () => {
  assert.equal(LAPSE_DAYS, 30);
  assert.equal(lapsed({ keptUntil: NOW - 1 }, NOW), true);
  assert.equal(lapsed({ keptUntil: NOW + 864e5 }, NOW), false);
  assert.equal(lapsed(null, NOW), false);
});

test("the page ledger: every visit, by whom; a submit is always yours", () => {
  const vs = seedVisits(NOW);
  assert.equal(vs.length, 7, "scene 5's day");
  assert.deepEqual(ledgerCounts(vs), { sol: 4, you: 2, refused: 1, submits: 1 });
  assert.ok(submitsAreYours(vs));
  assert.equal(vs.find((v) => v.id === "v2")!.fields!.length, 7, "every field typed, signed");
  assert.equal(submitsAreYours([...vs, { ...vs[1], id: "x", submit: true }]), false, "a submit in Sol's hand would break the rule");
  assert.equal(seedVisits(new Date(2026, 10, 9, 9, 5).getTime()).length, 2, "only what happened by now");
});

test("the seams: the trust is a place under your browser, behind browser.shared; marked", () => {
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "trust" && browserOn \? <TrustView \/> \/\* C43 \*\//);
  const sb = readFileSync(new URL("./home/whole/SharedBrowser.tsx", import.meta.url), "utf8");
  assert.match(sb, /C43[\s\S]*goTo\("trust"\)/);
  const shared = readFileSync(new URL("./home/whole/shared.ts", import.meta.url), "utf8");
  assert.match(shared, /\/\/ C43 \(#806\): refused before the page loads, in any hand/);
});

test("a refused tab says so under it, in whichever hand", async () => {
  const { tabFoot } = await import("./home/whole/shared.ts");
  const ask = stub(() => NOW), t = last(ask({ type: "browser.spawn", url: BANK, hand: "sol" }));
  assert.equal(tabFoot(t, undefined), "Sol's hand · refused before the page loaded; nothing was fetched");
});

test("review fixes: fields signed by whose hand; a sign-in kept from its last use, and lapsed past it, through the stub (R2, R4)", () => {
  assert.equal(fieldsBy([{ name: "name", by: "sol" }]), "Sol");
  assert.equal(fieldsBy([{ name: "name", by: "you" }]), "you", "a row you typed alone never carries Sol's name");
  assert.equal(fieldsBy([{ name: "name", by: "you" }, { name: "email", by: "sol" }]), "you and Sol");
  let t = NOW;
  const ask = stub(() => t);
  const until = (m: BrowserMsg) => m.sites.find((s) => s.id === "github")!.signedIn?.keptUntil ?? null;
  const before = until(ask({ type: "browser.sites" }))!;
  t = NOW + 10 * 864e5;
  const used = ask({ type: "browser.spawn", url: "https://github.com/sol-mif", hand: "you" });
  assert.equal(until(used), t + LAPSE_DAYS * 864e5, "using it keeps it LAPSE_DAYS from now");
  assert.ok(until(used)! > before);
  t = until(used)! + 1;
  const late = ask({ type: "browser.spawn", url: "https://github.com/sol-mif/x", hand: "you" });
  assert.equal(until(late), null, "past its day it lapses, and is not kept again");
  assert.ok(!late.jar.sites.includes("github"));
});
