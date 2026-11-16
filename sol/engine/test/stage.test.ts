// The first-timer's stage (#485, #495's review): an engine with SOL_STAGE=1 refuses what reaches past the stage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stageRefusal } from "../src/stage.ts";

test("a stage refuses going back, Update, pinning, carrying, the stable offer and running commands; the rest goes on", () => {
  for (const t of ["goback", "goback.plan", "run", "run.stop", "team.update", "team.pin.set", "team.pin.back", "team.pin.clear", "team.carry.use", "team.carry.aside", "team.stable.get", "team.asides", "team.aside.back", "team.aside.drop", "team.aside.x.y"]) {
    assert.match(stageRefusal(t) ?? "", /first-timer's stage/, t);
  }
  for (const t of ["say", "hello", "team.tool", "team.page.write", "work.start", "browser.open", "team.updated", "gobacks", undefined, 3]) {
    assert.equal(stageRefusal(t), null, String(t));
  }
});
