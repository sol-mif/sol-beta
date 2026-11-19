// node --test src/*.test.ts: Settings asked from the spine (#911). The spine's mark sends `sol:settings`; Build's page
// opens Settings on the drawer the event names, and a plain ask (no drawer) opens it too. From Home the window hops
// to Build first, and closing Settings goes back to Home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askedDrawer, spineAsk, settingsPlan, afterClose, afterLeave, FIRST_DRAWER, HOME_DRAWER } from "./spine/settings.ts";

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

test("from Social and Cowork the same: closing Settings returns to where it was asked (Cowork's own page is project settings)", () => {
  assert.equal(afterClose(settingsPlan("social").back, "build"), "social");
  assert.equal(settingsPlan("cowork").hop, "build");
  assert.equal(afterClose(settingsPlan("cowork").back, "build"), "cowork");
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

// #1029: Build's page under stage.whole is home/Home.tsx, whose sheet is Settings: leaving it must tell App, as WorkApp
// does, or Settings asked for from Home closes into Build; and a sheet asked for before the page mounted opens on mount
test("the whole stage's sheet tells App it was left, and opens when asked before it mounted (#1029)", async () => {
  const { readFileSync } = await import("node:fs");
  const home = readFileSync(new URL("./home/Home.tsx", import.meta.url), "utf8");
  assert.match(home, /dispatchEvent\(new CustomEvent<Leave>\("sol:settings-left", \{ detail: sheetHow\.current \}\)\)/);
  assert.match(home, /sessionStorage\.getItem\("sol\.work\.view"\) \?\? "null"\) === "settings"/);
  assert.match(home, /if \(sheet\) sheetHow\.current = "moved"/);
});

// #1124: in a Home made by the one onboarding (the default since #1223), Settings stays in Home on Home's own section; it never
// hops to Build, where it opened on folders and branches under the first-visit card
test("from a Home made by the one onboarding: Settings stays in Home, on Home's own section", () => {
  const p = settingsPlan("home", true);
  assert.equal(p.hop, null);
  assert.equal(p.back, null);
  assert.equal(p.here, HOME_DRAWER);
  assert.notEqual(p.here, FIRST_DRAWER);
});

test("the one onboarding's Home changes only Home: Build, Social and Cowork answer as before", () => {
  assert.deepEqual(settingsPlan("build", true), settingsPlan("build"));
  assert.deepEqual(settingsPlan("social", true), settingsPlan("social"));
  assert.deepEqual(settingsPlan("cowork", true), settingsPlan("cowork"));
  assert.equal(settingsPlan("home").here, undefined);   // switch off: the hop to Build, as before
});
