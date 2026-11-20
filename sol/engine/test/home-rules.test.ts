// Home's rules are the person's (#1686, gate one q1–q4 of home.whole): nothing of anyone's life in the engine; the
// person's own rules in their order, then their record's areas, then their folders' names; changed by talking only on
// their own words this turn (home_rule); an empty Home starts by talking, never "broken".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rig, cleanup, SCHEMAS } from "./fixtures/home/rig.ts";
import { NOW } from "./fixtures/home/sentences.ts";
import { holds, ruleSet, ruleFor, recordRules, readOwn, addRule, dropRule } from "../src/home/rules.ts";
import { personFiler, ruleFiler } from "../src/home/filer.ts";
import { runHomeRuleTool } from "../src/home/tool.ts";
import { homeStartLine, HOME_START } from "../src/home/start.ts";

after(cleanup);

test("a word matches whole, case aside; Chinese or Japanese as a run anywhere", () => {
  assert.equal(holds("Swim gala on Friday", "gala"), true);
  assert.equal(holds("galaxy notes", "gala"), false);
  assert.equal(holds("週五游泳比賽", "游泳"), true);
  assert.equal(holds("anything", "  "), false);
});

test("the order: their own rules as they wrote them, then their record's areas, then their folders'; none: life", () => {
  const own = { file: [{ words: ["gala"], folder: "clubs › swim" }, { words: ["swim gala"], folder: "other" }] };
  const rec = { areas: [{ id: "clubs", name: "Clubs" }, { id: "clubs/chess", name: "Chess" }] };
  const rules = ruleSet(own, rec, ["work › reports"]);
  assert.equal(ruleFor("the swim gala", rules)!.folder, "clubs › swim", "their first rule wins, as they ranked them");
  assert.equal(ruleFor("chess on tuesday", rules)!.folder, "clubs › chess", "the record's area, by its crumb");
  assert.equal(ruleFor("the reports are due", rules)!.folder, "work › reports", "a folder's own name");
  assert.deepEqual(recordRules(null), []);
  const f = personFiler(own, rec);
  assert.deepEqual(f.file("dinner friday", []), { folder: "life", confidence: 0.3 });
  assert.equal(f.file("gala", ["clubs › swim › 2026"]).folder, "clubs › swim › 2026", "a folder of theirs that starts with the rule's wins");
});

test("the engine's own filer names nobody: no course, no person, no company", () => {
  for (const s of ["bio exam thursday", "call Sam about the offer", "stats survey with maya", "shopify interview"]) assert.equal(ruleFiler.file(s, []).folder, "life", s);
});

test("add and drop: the same words move, a rule with none left is gone", () => {
  let own = addRule({ file: [] }, ["gala"], "clubs › swim");
  own = addRule(own, ["meet"], "clubs › swim");
  assert.deepEqual(own, { file: [{ words: ["gala", "meet"], folder: "clubs › swim" }] });
  own = addRule(own, ["gala"], "school");
  assert.deepEqual(own.file.map((r) => [r.folder, r.words]), [["clubs › swim", ["meet"]], ["school", ["gala"]]]);
  assert.deepEqual(dropRule(own, ["meet"]).file.map((r) => r.folder), ["school"]);
});

test("home_rule changes their rules and the folders read only on their own words this turn", async () => {
  const r = rig({ now: NOW, schemas: SCHEMAS });
  const t = (said: string) => ({ said });
  let x = await runHomeRuleTool("home_rule", { words: ["gala"], folder: "Clubs›Swim", yes: "swim stuff" }, t("what is this?"), r.ctx);
  assert.equal(x.isError, true, "not their words this turn: nothing changes");
  assert.deepEqual(readOwn(r.home), { file: [] });
  x = await runHomeRuleTool("home_rule", { words: ["gala"], folder: "Clubs›Swim", yes: "anything about gala" }, t("put anything about gala in clubs swim"), r.ctx);
  assert.equal(x.isError, undefined, String(x.content[0].text));
  assert.deepEqual(readOwn(r.home), { file: [{ words: ["gala"], folder: "clubs › swim" }] });
  x = await runHomeRuleTool("home_rule", { words: ["gala"], remove: true, yes: "stop filing gala" }, t("stop filing gala there"), r.ctx);
  assert.deepEqual(readOwn(r.home), { file: [] });
  x = await runHomeRuleTool("home_rule", { read: ["~/Notes"], yes: "read my Notes" }, t("please read my Notes folder"), r.ctx);
  assert.equal(x.isError, undefined, String(x.content[0].text));
  assert.deepEqual(JSON.parse(readFileSync(join(r.home, "sources", "files.json"), "utf8")).reads, ["~/Notes"]);
});

test("an empty Home has its opening words; one with anything of the person's has none", () => {
  const home = mkdtempSync(join(tmpdir(), "sol-home-start-")), user = mkdtempSync(join(tmpdir(), "sol-user-"));
  assert.equal(homeStartLine(home, 0, user), HOME_START);
  assert.equal(homeStartLine(home, 1, user), undefined, "a folder it reads");
  mkdirSync(join(user, ".sol", "record"), { recursive: true });
  writeFileSync(join(user, ".sol", "record", "me.json"), JSON.stringify({ areas: [{ id: "clubs", name: "Clubs" }] }));
  assert.equal(homeStartLine(home, 0, user), undefined, "a record with a place");
  assert.ok(!existsSync(join(home, "home-rules.json")), "asking writes nothing");
});
