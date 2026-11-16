// Cowork v3 (fr-30, gap 2 of #574): a crossing that hands something to a person (People's hand, people.ts handSend)
// makes it theirs and raises their "needs you" count, until its sender takes it back.
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("../src/team/v3/plan.ts");

async function world() {
  const t = P.memoryTrail();
  const l = (await P.drop(t, { project: "sol", actor: { who: "frank" }, title: "icons" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: { who: "frank" }, loose: l.loose, today: "2026-11-01" })) as { item: { id: string } };
  return { t, item: r.item.id };
}

test("a hand to Marco counts in his needs-you, and is his", async () => {
  const { t, item } = await world();
  assert.equal(P.needsMe(P.foldPlan(t.all), "marco"), 0);
  await t.append({ project: "sol", actor: { who: "frank" }, kind: "crossing.sent", item, where: "record", data: { kind: "hand", to: "marco", title: "icons", undo: "u-1" } });
  const rec = P.foldPlan(t.all);
  assert.equal(P.needsMe(rec, "marco"), 1, "the hand raises his count");
  assert.equal(rec.items.find((i) => i.id === item)!.whose, "marco");
  assert.equal(P.needsList(rec, "marco")[0].kind, "hand");
});

test("a hand taken back by its sender counts nothing; one taken back by someone else still counts", async () => {
  const { t, item } = await world();
  await t.append({ project: "sol", actor: { who: "frank" }, kind: "crossing.sent", item, where: "record", data: { kind: "hand", to: "marco", title: "icons", undo: "u-2" } });
  await t.append({ project: "sol", actor: { who: "anna" }, kind: "crossing.undone", item, data: { undo: "u-2" } });
  assert.equal(P.needsMe(P.foldPlan(t.all), "marco"), 1, "only the sender takes it back");
  await t.append({ project: "sol", actor: { who: "frank" }, kind: "crossing.undone", item, data: { undo: "u-2" } });
  assert.equal(P.needsMe(P.foldPlan(t.all), "marco"), 0);
});
