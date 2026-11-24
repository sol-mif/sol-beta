// node --test src/*.test.ts: the sidebar's Folders never stands over nothing (H4, BR1 #1615). When the sidebar would
// scroll, the folders keep the first whole rows of the canvas's order that fit and a "+N more" row that opens All folders;
// only when not even one fits do they fold, their heading with them. The rows are the canvas's one list (core.ts
// folderOrder), never a second one. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mostThatFit, setSideFolded, sideFolded } from "./next/side.ts";

test("the most rows that fit: the same k as trying each in turn, at least one", () => {
  for (const n of [2, 3, 7, 20, 64]) for (let room = 0; room <= n + 1; room++) {
    const over = (k: number) => k > room;
    let want = 1;
    for (let k = n - 1; k >= 1; k--) if (!over(k)) { want = k; break; }
    assert.equal(mostThatFit(n, over), want, `n ${n}, room ${room}`);
  }
});

test("the folders fit before they fold, and their heading folds with them", () => {
  const side = readFileSync(new URL("./next/side.ts", import.meta.url), "utf8");
  assert.match(side, /if \(fmore && over\(\) && folders\.length > 1\) keep\(folders[^\n]*, fmore, over\);\n\s*if \(over\(\)\) sd\.classList\.add\("fold-regions"\);/, "kept rows first, the fold last");
  assert.match(side, /#sideregions \.nx-reg\[data-region\]/, "the rows drawn from the canvas's list, in its order");
  const next = readFileSync(new URL("./next/Next.tsx", import.meta.url), "utf8");
  assert.match(next, /fs = folderOrder\(\),/,
    "the sidebar's folders are the canvas's one list, nothing hidden: one on the Shelf or off the canvas is listed too, marked (walk note item 8)");
  assert.match(next, /nx-off/, "an off one is marked so");
  assert.match(next, /className=\{`nx-row nx-reg nx-regmore[^>]*data-regmore hidden\s+onClick=\{toggle\}/, "+N more is pressed for its list");
  assert.match(next, /#sideregions \.nx-reg\[data-region\]\[hidden\]/, "its list is the rows the sidebar had no room for");
  assert.match(next, /const go = \(id: string\) => \{ setIds\(null\); act\(`folder_open:\$\{id\}`\); \}/, "each opens its folder as its row does");
  assert.match(next, /data-act=\{`folder_open:\$\{id\}`\} data-region=\{id\}/, "a folder's row opens it, never only pans the canvas to it (H3)");
  assert.doesNotMatch(next, /data-regmore[^>]*data-act=/, "never a press that only goes where you already are");
  const css = readFileSync(new URL("./next/people/people.css", import.meta.url), "utf8");
  assert.match(css, /\.nx-side\.fold-regions #sideregions \[data-folders-head\] \{ display: none; \}/, "no heading over nothing");
});

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

test("Working now and Folders fold on their heading and stay folded across loads, each on its own (Look 1 A1)", () => {
  const kept = new Map<string, string>(), was = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) } });
  try {
    assert.equal(sideFolded("ais"), false, "open at first");
    setSideFolded("regions", true);
    assert.equal(sideFolded("regions"), true);
    assert.equal(sideFolded("ais"), false, "the other list stays open");
    setSideFolded("ais", true); setSideFolded("regions", false);
    assert.deepEqual([sideFolded("ais"), sideFolded("regions")], [true, false]);
    kept.set("sol.side.fold", "not json");
    assert.equal(sideFolded("ais"), false, "a spoiled store reads as open");
  } finally { if (was) Object.defineProperty(globalThis, "localStorage", was); else delete (globalThis as { localStorage?: unknown }).localStorage; }
  const next = readFileSync(new URL("./next/Next.tsx", import.meta.url), "utf8");
  for (const k of ["ais", "regions"]) assert.match(next, new RegExp(`data-fold="${k}" aria-expanded=\\{!`), `${k}: its heading says open or folded`);
  assert.match(next, /\{folded \? null : rows\.length/, "a folded Working now draws no rows, so the fit never unhides them");
  assert.match(next, /\{fFolded \? null : <>/, "a folded Folders draws no rows");
});

test("at Middle a folder's press opens it; the ground of the folder you are in still starts a session", () => {
  const plane = readFileSync(new URL("./next/plane/index.tsx", import.meta.url), "utf8");
  assert.match(plane, /if \(ar\?\.dataset\.area && \(ar\.dataset\.area !== S\.region \|\| t\.closest\("\.pl-lab"\)\) && M\.folder_open\(ar\.dataset\.area\)\.ok\) return;\n\s*if \(ar\?\.dataset\.area && S\.dist === "middle" && M\.start\)/);
});
