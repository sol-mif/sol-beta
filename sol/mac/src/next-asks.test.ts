// node --test src/*.test.ts: the asks at rest (BR1's calm screen, #1615; next/diary/asks.ts): the one count and list the
// canvas's "N need you" line and the Diary's own count read, so both say the same; a folder's list holds only its asks.
// The morning's invented fixture only. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { D, above, load, open } from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { needsCount } from "./next/people/queue.ts";
import { askRegion, askSaid, askWords, needList } from "./next/diary/asks.ts";

test("everywhere: the badge's count, the Diary's sentence, every open ask first first", () => {
  load("dev-morning");
  const l = needList();
  assert.ok(open().length > 0, "the morning has asks");
  assert.equal(l.n, needsCount(), "the count is the badge's: the asks and what people sent");
  assert.match(l.say, /needs? you(, and \d+ from people)?\.$/, "the Diary's sentence");
  assert.deepEqual(l.asks.map((a) => a.id), open().map((a) => a.id), "every open ask, in the asks' order");
  assert.ok(above() >= l.asks.length);
  assert.doesNotMatch(l.after, /^\d|\b\d+ (things|asks) need you, and/, "after the drawn count the words say no total again");
  assert.match(l.after, /^waiting for you(: \d+ asks?, \d+ from people)?$/);
});

test("one folder: only its asks, counted alone, in the folder's words", () => {
  load("dev-morning");
  const rid = askRegion(open()[0])!;
  const l = needList(rid);
  assert.ok(l.asks.length > 0 && l.asks.every((a) => a.region === rid), "only the folder's asks");
  assert.equal(l.n, l.asks.length);
  assert.equal(l.say, "waiting for you in this folder");
  const none = needList("w:/no/such/folder");
  assert.deepEqual([none.n, none.asks.length, none.say], [0, 0, "Nothing here needs you now."]);
});

test("an ask as its row says it: who, its words without the asker's name, where", () => {
  load("dev-morning");
  const a = open()[0], s = askSaid(a);
  assert.equal(s.id, a.id);
  assert.ok(s.who.length > 0);
  assert.equal(s.words, askWords(a.text));
  assert.equal(askWords("Kite: may I merge?"), "may I merge?");
  assert.equal(askWords("may I merge?"), "may I merge?");
  assert.ok(D.pieces[a.piece] ? s.where.length > 0 : true);
});
