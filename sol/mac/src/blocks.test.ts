// node --test src/*.test.ts (npm test here): team blocks' pure parts (#429, cowork/blocks/live.ts) and the one file
// they are declared in (cowork/blocks/blocks.json). Until the engine says, every block Sol shipped before blocks is on,
// so Cowork looks as it did; the engine's word wins; a fixed block is always on; the patch asks for one block only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveIds, ofKind, blockPatch, type Block, type BlockLive } from "./cowork/blocks/live.ts";
import { patchOf } from "./cowork/projectView.ts";

const OWN: Block[] = JSON.parse(readFileSync(new URL("./cowork/blocks/blocks.json", import.meta.url), "utf8")).blocks;

test("blocks.json: the four tools, the three tiles and the action, in the order Cowork drew them, all on; the team tools, pages and tables after them, off", () => {
  assert.deepEqual(ofKind(OWN, "tool").map((b) => b.id), ["calendar", "decisions", "polls", "settings", "folds", "analytics", "features", "live"]);
  assert.deepEqual(ofKind(OWN, "tile").map((b) => b.name), ["who's on", "eyes wanted", "who leads what"]);
  assert.deepEqual(ofKind(OWN, "action").map((b) => b.name), ["copy the link"]);
  assert.deepEqual([...liveIds(OWN)], OWN.filter((b) => !["folds", "analytics", "features", "live", "pages", "templates", "tables"].includes(b.id)).map((b) => b.id));   // this week's folds (#436), analytics (#437), the Features page (#480), live (#485), pages (#433), templates (#435) and tables (#434) start off
  // pages (#433): one block of kind "page", off as Sol ships it, on in a project by agreement
  assert.deepEqual(ofKind(OWN, "page").map((b) => [b.id, b.start]), [["pages", "off"]]);
  // templates (#435): one block of kind "template", off too
  assert.deepEqual(ofKind(OWN, "template").map((b) => [b.id, b.start]), [["templates", "off"]]);
  // tables (#434): one block of kind "table", off too, its three agent tools
  assert.deepEqual(ofKind(OWN, "table").map((b) => [b.id, b.start, b.agents]), [["tables", "off", ["room_tables", "room_table_read", "room_table_write"]]]);
  // the tool tiles' words, as Tools.tsx had them
  assert.equal(OWN.find((b) => b.id === "calendar")!.shows, "what is due when, and for whom. Each person's Sol reminds them ten minutes before, or at nine on the day");
  assert.equal(OWN.find((b) => b.id === "polls")!.glyph, "poll");
  for (const b of OWN) assert.match(b.id, /^[a-z0-9][a-z0-9-]{0,39}$/);
});

test("live: the engine's word over the start, a block it did not name as it starts, a fixed one always", () => {
  const heard = OWN.map((b) => ({ ...b, live: b.id !== "eyes" && b.id !== "settings", from: "code", known: true })) as BlockLive[];
  const live = liveIds(OWN, heard.filter((b) => b.id !== "leads"));
  assert.equal(live.has("eyes"), false);
  assert.equal(live.has("settings"), true);   // fixed
  assert.equal(live.has("leads"), true);      // not named: as it starts
  assert.equal(liveIds([{ ...OWN[0], id: "later", start: "off" }]).has("later"), false);
});

test("the patch: one block, on or off, from the settings page's form", () => {
  assert.deepEqual(blockPatch("eyes", false), { blocks: { eyes: { on: false } } });
  assert.deepEqual(patchOf({ part: "blocks", id: "copy-link", on: true, why: "" }), { blocks: { "copy-link": { on: true } } });
});
