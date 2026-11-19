// node --test src/*.test.ts: find asked from the spine (2026-11-11). The spine's find mark, and ⌘K where the view has
// none of its own, open Build's find; from another view the window hops to Build first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findHop, windowFinds, takeFindAsk } from "./spine/find.ts";

test("from Build: find opens in place", () => {
  assert.equal(findHop("build"), null);
});

test("from Home, Cowork and Social: the window hops to Build first", () => {
  for (const v of ["home", "cowork", "social"] as const) assert.equal(findHop(v), "build");
});

test("⌘K is the window's only where the view has no ⌘K of its own", () => {
  assert.equal(windowFinds("build", false), false);   // Build's clean Home has the Jump; the older Build leaves it be
  assert.equal(windowFinds("home", false), true);
  assert.equal(windowFinds("cowork", false), true);
  assert.equal(windowFinds("social", false), true);
  assert.equal(windowFinds("home", true), false);     // the clean Home's board drawn in the Home view (stage links)
});

test("an ask left with no sessionStorage (a plain node, private mode) is no ask", () => {
  assert.equal(takeFindAsk(), false);
});

// the rail's mark and the pages that answer it: the clean Home opens its Jump, the older side focuses its search, and
// both read the ask left for them as they mount
test("Build's two pages hear sol:find and the ask left before they mounted", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["./home/Home.tsx", "./work/WorkSidebar.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /addEventListener\("sol:find", find\)/, f);
    assert.match(src, /if \(takeFindAsk\(\)\) find\(\)/, f);
  }
});
