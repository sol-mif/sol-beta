// state.ts folderMoved / sessions.ts relocated: "a folder renamed or moved keeps its sessions ... An older move that ended
// in the old place now ends in the new one (chains collapse)". The collapse only rewrites a move that ended exactly at
// (or under) the folder now moving. Move a repo (/a -> /b), then a folder inside it (/b/c -> /x): a session recorded in
// /a/c is sent to /b/c, which is gone; it shows marked gone and cannot be resumed ("its folder is gone").
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "n10-moved-")), "work.json");
const S = await import("../src/work/state.ts");
const { relocated } = await import("../src/work/sessions.ts");

test("a session in a folder inside a moved folder follows a later move of that inner folder", () => {
  S.folderMoved("/home/m/code/sol", "/home/m/code/sol2");            // the repo renamed
  assert.equal(relocated("/home/m/code/sol/engine"), "/home/m/code/sol2/engine");
  S.folderMoved("/home/m/code/sol2/engine", "/home/m/engine");        // then a folder in it moved out
  assert.equal(relocated("/home/m/code/sol2/engine/src"), "/home/m/engine/src");
  // a transcript recorded before both moves still says the first place
  assert.equal(relocated("/home/m/code/sol/engine/src"), "/home/m/engine/src", `moved map: ${JSON.stringify(S.moved())}`);
});
