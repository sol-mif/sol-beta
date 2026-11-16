// node --test src/*.test.ts (npm test here): templates and agents as members (#435, D3 of #413), the face's pure parts:
// the slash menu's "from a template" (cowork/pages/templates.ts), shown only when the project has templates, its blanks
// filled as the engine fills them; and the people strip's agent beside its human (cowork/agents.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { slashEntries } from "./cowork/pages/slash.ts";
import { fillBlanks, titleFor, today } from "./cowork/pages/templates.ts";
import { agentFor, agentWord } from "./cowork/agents.ts";

test("templates: the slash entry shows only with templates, offers each, and fills {{date}} and {{me}}", () => {
  assert.equal(slashEntries({}).some((e) => e.id === "template"), false);
  const ctx = { me: "frank", templates: [{ id: "weekly-sync", name: "weekly sync", body: "# sync {{date}}\n- [ ] {{ me }} reads {{title}} {{other}}\n\n" }] };
  const e = slashEntries(ctx).find((x) => x.id === "template");
  assert.ok(e, "offered when the project has templates");
  assert.deepEqual(e.choices?.(ctx), [{ id: "weekly-sync", word: "weekly sync" }]);
  const r = e.apply("weekly-sync", ctx) as { lines: string };
  assert.equal(r.lines, `# sync ${today()}\n- [ ] frank reads {{title}} {{other}}`);
  assert.equal((e.apply("gone", ctx) as { lines: string }).lines, "");
});

test("templates: blanks and the new page's title", () => {
  assert.equal(fillBlanks("{{TODAY}} {{title}} {{me}}", { day: "2026-10-30", me: "isaac", title: "Release" }), "2026-10-30 Release isaac");
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(titleFor({ title: "weekly sync" }, "2026-10-30"), "weekly sync 2026-10-30");
});

test("agents as members: found by its human, case-blind; one word for what it is doing", () => {
  const list = [{ name: "frank's agent", of: "frank", working: true }, { name: "isaac's agent", of: "isaac", working: false }];
  assert.equal(agentFor(list, "Frank")?.name, "frank's agent");
  assert.equal(agentFor(list, "marco"), undefined);
  assert.equal(agentFor(undefined, "frank"), undefined);
  assert.equal(agentWord(list[0]), "at work");
  assert.equal(agentWord(list[1]), "ready");
});
