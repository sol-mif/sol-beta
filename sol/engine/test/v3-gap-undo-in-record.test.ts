// Cowork v3 (fr-30, gap 1 of #574): Undo lives in the record's own fold. An undo is an event on the trail; the record
// (record.ts fold) reads every event as if the undone one never happened, so the Plan, the floor and every room that
// reads the record see it gone. Only the writer of an event undoes it; an undo of an undo counts nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-gap-undo-"));
const { Trail, Keys, fold } = await import("../src/team/v3/index.ts");
const t = new Trail({ file: ":memory:", keys: new Keys(join(dir, "me"), "macbook") });
const ft = new Trail({ file: ":memory:", keys: new Keys(join(dir, "frank"), "frank-mac") });
const me = { person: "marcocyl04-ux", machine: "macbook" };
const frank = { person: "franktsai2008-eng", machine: "frank-mac" };

test("an undone item is gone from the record, and its undo is on the trail", () => {
  const a = t.append({ project: "u1", by: me, kind: "item", item: "i-1", value: { title: "Logo", whose: "marcocyl04-ux", state: "open" } });
  t.append({ project: "u1", by: me, kind: "item", item: "i-2", value: { title: "Icons", whose: "marcocyl04-ux", state: "open" } });
  assert.ok(fold(t.check("u1").ok).items["i-1"], "there before the undo");
  t.append({ project: "u1", by: me, kind: "undo", value: { of: a.id } });
  const r = fold(t.check("u1").ok);
  assert.equal(r.items["i-1"], undefined, "the undone item is gone from the record");
  assert.ok(r.items["i-2"], "the rest stays");
  assert.equal(r.count, 3, "the undo and the undone are still on the trail");
});

test("undoing an edit in the middle restores the one before it, with no conflict", () => {
  t.append({ project: "u2", by: me, kind: "item", item: "i-1", field: "title", value: "one" });
  const two = t.append({ project: "u2", by: me, kind: "item", item: "i-1", field: "title", value: "two" });
  assert.equal(fold(t.check("u2").ok).items["i-1"].fields.title, "two");
  t.append({ project: "u2", by: me, kind: "undo", value: { of: two.id } });
  const r = fold(t.check("u2").ok);
  assert.equal(r.items["i-1"].fields.title, "one");
  assert.deepEqual(r.conflicts, []);
});

test("only the writer undoes; an undo of an undo counts nothing", () => {
  const a = t.append({ project: "u3", by: me, kind: "item", item: "i-1", value: { title: "Mine" } });
  t.merge([ft.append({ project: "u3", by: frank, kind: "undo", value: { of: a.id } })]);
  assert.ok(fold(t.check("u3").ok).items["i-1"], "Frank cannot undo what I wrote");
  const u = t.append({ project: "u3", by: me, kind: "undo", value: { of: a.id } });
  t.append({ project: "u3", by: me, kind: "undo", value: { of: u.id } });
  assert.equal(fold(t.check("u3").ok).items["i-1"], undefined, "an undo of an undo does not bring it back");
});
