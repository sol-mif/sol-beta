// Mark up (BR1, #1615; next/markup.ts): each mark is a thing and the person's words, read into the message a session
// gets with what Sol knows of that thing, a piece by its folder; nothing written. Invented homes only: Denise's bakery,
// Dev's code. Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_KNOWS, MAX_MARKS, markOf, marksOf, textOf } from "./markup.js";
import { noteFix, place, readStore } from "./you-known.js";
import { recordHomeOf, type Where } from "./you.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-markup-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = Date.parse("2026-11-22T10:00:00Z");
const whereOf = (name: string): Where => { const sol = join(root, name); fs.mkdirSync(sol, { recursive: true }); return { sol, user: sol, rec: recordHomeOf(sol, sol) }; };

test("denise-marks: a folder's mark carries its words and the store's lines there, a piece's its folder's, never the person-wide ones", () => {
  const w = whereOf("denise");
  place(w, { folder: "w:/Users/you/bakery/orders", name: "orders", to: "w:/Users/you/bakery", why: "it sits inside bakery on disk", reading: "inside" }, NOW - 3600_000);
  noteFix(w, { how: "drag", what: "invoices into orders", place: "w:/Users/you/bakery/orders", reason: "placed:w:/Users/you/bakery/orders" }, NOW - 1800_000);
  noteFix(w, { how: "hide", what: "the weather everywhere", place: "everywhere", reason: "seen:you:weather" }, NOW - 1200_000);
  const before = JSON.stringify(readStore(w.sol));
  const r = marksOf(w, { text: "sort these out", marks: [
    { thing: "w:/Users/you/bakery/orders", words: "  too many   in here ", kind: "folder", name: "orders" },
    { thing: "p-cake", words: "this goes first", kind: "piece", name: "Wedding cake order", in: "w:/Users/you/bakery/orders" },
    { words: "no thing" },
  ] }, NOW);
  assert.ok(r.ok);
  assert.equal(r.marks.length, 2, "a mark on no thing is not a mark");
  const [f, p] = r.marks;
  assert.equal(f.words, "too many in here", "the words as said, spaces tidied");
  assert.ok(f.knows.some((k) => /orders/.test(k)), "what Sol knows there: its placement and the person's fix");
  assert.ok(!f.knows.some((k) => /weather/.test(k)), "a person-wide line is not about this folder");
  assert.deepEqual(p.knows, f.knows, "a piece is known by its folder");
  assert.equal(p.in, "w:/Users/you/bakery/orders");
  assert.match(r.text, /^sort these out\nI marked 2 things in Sol/);
  assert.match(r.text, /1\. On the folder “orders” \(w:\/Users\/you\/bakery\/orders\): “too many in here”\./);
  assert.match(r.text, /2\. On the piece “Wedding cake order” \(p-cake, in orders\): “this goes first”\. Sol knows of orders: /);
  assert.equal(JSON.stringify(readStore(w.sol)), before, "read only: the store is as it was");
});

test("dev-session: a session's mark names its session id; nothing known says nothing; no marks is refused; caps hold", () => {
  const w = whereOf("dev");
  const r = marksOf(w, { marks: [{ thing: "s-fix", kind: "session", session: "4b1c-dev", name: "Fix login", in: "w:/Users/you/code/api", words: "" }] }, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.marks[0].knows, []);
  assert.equal(r.text, "I marked one thing in Sol; each mark is on the thing itself:\n1. On the session “Fix login” (session 4b1c-dev, in api).");
  assert.equal(marksOf(w, { marks: [] }).ok, false);
  assert.equal(marksOf(w, {}).ok, false);
  const many = marksOf(w, { marks: Array.from({ length: 20 }, (_, i) => ({ thing: `h:f${i}`, words: "x" })) }, NOW);
  assert.ok(many.ok && many.marks.length === MAX_MARKS);
  assert.equal(markOf({ thing: "h:notes" })!.name, "notes", "a folder with no name sent is named by its last part");
  assert.equal(markOf({ thing: "h:notes", kind: "folder", in: "w:/x" })!.in, null, "a folder is no thing's piece");
  const knows = Array.from({ length: 9 }, (_, i) => `fact ${i}`);
  assert.ok(textOf("", [{ thing: "h:a", kind: "folder", name: "a", words: "", in: null, knows: knows.slice(0, MAX_KNOWS) }]).endsWith("Sol knows: fact 0; fact 1; fact 2; fact 3."));
});
