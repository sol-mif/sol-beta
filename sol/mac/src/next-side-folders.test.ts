// node --test src/*.test.ts: the canvas's folders keep one order (core.ts folderOrder), and a press on a folder opens it.
// The sidebar's folder list left with #1879 step 1: the canvas is the folders. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the folders inside a folder keep one order, whichever order the lists came in", async () => {
  const CV = await import("./next/cv/index.ts");
  await import("./next/cv/fixture.ts");
  CV.load("denise");   // house, kids, work
  const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;
  R("kids").parent = "house"; R("work").parent = "house";
  const once = CV.childrenOf("house");
  CV.D.regions.reverse();
  assert.deepEqual(CV.childrenOf("house"), once, "the same after the list's order changed");
  assert.deepEqual(once.map((id) => R(id).name), [...once.map((id) => R(id).name)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })), "by name");
  const f = CV.folderOrder(), at = f.indexOf("house");
  assert.deepEqual(f.slice(at + 1, at + 3), once, "the sidebar lists them in that order under their folder");
  delete R("kids").parent; delete R("work").parent;
});

test("at Middle a folder's press opens it; the ground of the folder you are in still starts a session", () => {
  const plane = readFileSync(new URL("./next/plane/index.tsx", import.meta.url), "utf8");
  assert.match(plane, /if \(ar\?\.dataset\.area && \(ar\.dataset\.area !== S\.region \|\| t\.closest\("\.pl-lab"\)\) && M\.folder_open\(ar\.dataset\.area\)\.ok\) return;\n\s*if \(ar\?\.dataset\.area && S\.dist === "middle" && M\.start\)/);
});
