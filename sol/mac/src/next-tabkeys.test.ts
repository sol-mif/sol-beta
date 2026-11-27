// node --test src/*.test.ts: ⌘1–⌘9 belong to the tabs alone (#1879 step 2; decisions.md 2026-11-25): ⌘1 fronts the
// Canvas, ⌘2 the first tab, and the canvas's saved spots are gone, so no code of them is left. A folder kept as a tab
// opens the folder's page form. Invented people only (the dev-morning fixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { TB, folderTabShown, tabShown } from "./next/cv/moves/tabs.ts";

const sessions = () => Object.values(CV.D.pieces).filter((p) => p.kind === "session").slice(0, 2).map((p) => p.id);

test("⌘2 fronts the first tab, ⌘3 the second, ⌘1 the Canvas, and a number with no tab does nothing", () => {
  CV.load("dev-morning");
  const [a, b] = sessions();
  CV.M.tabOpen(a, false); CV.M.tabOpen(b, false);
  assert.equal(CV.M.tabKey(2).ok, true);
  assert.equal(TB().front, a); assert.equal(tabShown(), a);
  assert.equal(CV.M.tabKey(3).ok, true);
  assert.equal(TB().front, b);
  assert.equal(CV.M.tabKey(1).ok, true);
  assert.equal(TB().front, null); assert.equal(tabShown(), null);
  assert.equal(CV.M.tabKey(9).ok, false);
  assert.equal(TB().front, null);
});

test("a folder kept as a tab fronts as the folder's page, and closing it goes back to the Canvas", () => {
  CV.load("dev-morning");
  const rid = CV.D.regions[0].id, id = `folder:${rid}`;
  assert.equal(CV.M.tabOpen(id, true).ok, true);
  assert.equal(TB().tabs.find((x) => x.id === id)?.kind, "folder");
  assert.equal(folderTabShown(), id);
  assert.equal(CV.S.page, "folder"); assert.equal(CV.S.folderAs, "page");
  assert.equal(CV.M.tabOpen("folder:nowhere", true).ok, false);
  CV.M.tabKey(1);
  assert.equal(folderTabShown(), null); assert.equal(CV.S.page, null);
  CV.M.tabKey(2);
  assert.equal(folderTabShown(), id);
  assert.equal(CV.M.tabClose(id).ok, true);
  assert.equal(CV.S.page, null);
});

test("the canvas's saved spots are gone: no markSet or markGo left in the face, and the digit keys go to tabKey", () => {
  const r = spawnSync("git", ["grep", "-n", "-e", "markSet", "-e", "markGo", "--", "sol/mac/src", ":!sol/mac/src/next-tabkeys.test.ts"], { cwd: new URL("../../..", import.meta.url), encoding: "utf8" });
  assert.equal(r.status, 1, `git grep found:\n${r.stdout}`);   // 1: no match
  assert.match(readFileSync(new URL("./next/Next.tsx", import.meta.url), "utf8"), /Digit\[1-9\]\$\/\.test\(c\) && !sh \? \(\) => M\.tabKey\(/);
});
