// node --test src/*.test.ts (npm test here): who meets the one onboarding and when Home is drawn (#1088, #1223,
// onboard/which.ts). Since #1223 the one onboarding is the default: no switch, no first run, no folders' Home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isNew, homeShown, landKeys, DONE_KEY } from "./onboard/which.ts";

const kv = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

test("a new person meets the one onboarding; after the landing a reload is Home, not a second run", () => {
  const s = kv();
  assert.equal(isNew(s, ""), true);
  landKeys(s, "2026-11-15T09:00:00.000Z");
  assert.equal(s.getItem(DONE_KEY), "2026-11-15T09:00:00.000Z");
  assert.equal(isNew(s, ""), false);
  assert.equal(isNew(s, "?onboard=again"), true, "shown again on asking");
});

test("someone who used Sol before is not met by it again; the app with no code yet always is; a pop-out never", () => {
  for (const k of ["sol.firstrun", "sol.mode", "sol.home.open"]) { const s = kv(); s.setItem(k, "x"); assert.equal(isNew(s, ""), false, k); }
  const s = kv(); s.setItem("sol.mode", "home");
  assert.equal(isNew(s, "?firstrun=1"), true, "lib.rs's page with no code yet: the onboarding runs the install");
  assert.equal(isNew(kv(), "?work=s-1"), false);
});

test("Home is drawn always, except under the onboarding's stage before the landing", () => {
  assert.equal(homeShown({ onboarding: false, landing: false }), true);
  assert.equal(homeShown({ onboarding: true, landing: false }), false);
  assert.equal(homeShown({ onboarding: true, landing: true }), true);
});

test("#1277's mark of his own window stays (useEngine markMine); nothing draws a Home of his constant folders any more", async () => {
  const { isMine, MINE_KEY } = await import("./flag.ts");
  const s = kv();
  assert.equal(isMine(s), false);                  // a new window is nobody's
  s.setItem(MINE_KEY, "1"); assert.equal(isMine(s), true);
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /FolderHome|HomeStart/);
});
