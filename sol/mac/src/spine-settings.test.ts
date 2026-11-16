// node --test src/*.test.ts: Settings asked from the spine (#911). The spine's mark sends `sol:settings`; Build's page
// opens Settings on the drawer the event names, and a plain ask (no drawer) opens it too. From Home the window hops
// to Build first, and closing Settings goes back to Home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askedDrawer, spineAsk, settingsPlan, afterClose, afterLeave, FIRST_DRAWER } from "./spine/settings.ts";

test("the event the spine sends opens Settings on its first drawer", () => {
  assert.equal(askedDrawer(spineAsk()), FIRST_DRAWER);
});

test("an ask with no detail opens Settings too (the spine's old event, #911)", () => {
  assert.equal(askedDrawer(new CustomEvent("sol:settings").detail), FIRST_DRAWER);
});

test("a named drawer opens on that drawer; a detail that is not a drawer is no ask", () => {
  assert.equal(askedDrawer("me"), "me");
  assert.equal(askedDrawer({ x: 1 }), null);
  assert.equal(askedDrawer(""), null);
});

test("from Build: Settings opens in place, and closing it stays in Build", () => {
  assert.deepEqual(settingsPlan("build"), { hop: null, back: null });
  assert.equal(afterClose(null, "build"), null);
});

test("from Home: the window hops to Build, and closing Settings returns to Home", () => {
  const p = settingsPlan("home");
  assert.equal(p.hop, "build");
  assert.equal(afterClose(p.back, "build"), "home");
});

test("from Social the same; from Cowork closing stays in Build (Cowork is another mode)", () => {
  assert.equal(afterClose(settingsPlan("social").back, "build"), "social");
  assert.equal(settingsPlan("cowork").back, null);
});

test("a person who moved on while Settings showed is not pulled back", () => {
  assert.equal(afterClose("home", "cowork"), null);
});

// #916 review: only a real close (the x, Esc, ⌘, again, the side's button off) takes the person back; any other way
// out of Settings (a session picked in the side, a new session, the conversations list) stays, and forgets the way back
test("opening a session from Settings stays in Build (asked from Home)", () => {
  const back = settingsPlan("home").back;
  assert.deepEqual(afterLeave(back, "build", "moved"), { to: null, back: null });
  assert.deepEqual(afterLeave(back, "build", "closed"), { to: "home", back: null });
});

test("leaving to conversations forgets the way back: a later Settings in Build closes in Build", () => {
  let back = settingsPlan("home").back;
  back = afterLeave(back, "build", "moved").back;                  // Home → Settings → ⌘; conversations
  // later: Settings from Build's own ⌘, (WorkApp's key, which never touches the way back), then Esc
  assert.equal(afterLeave(back, "build", "closed").to, null);      // Esc stays in Build
});
