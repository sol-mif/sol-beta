// node --test src/*.test.ts: carry and start on the face (#700): what a session row says beside the stage, a carried
// line with the session named, the local store's carry (the same block in both, one ledger), and a new session's
// opening read from the engine's stage.json. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowWord, named, setNames, nameOf, rowAt } from "./stage/carry.ts";
import { LocalStore } from "./stage/store.ts";
import { fromEngine } from "./stage/engineStore.ts";
import type { Block } from "./stage/model.ts";

const blk = (id: string, sessions: string[], state: Block["state"] = "live"): Block => ({ id, kind: "list", title: id, state, versions: [], sessions, body: { steps: [] } });

test("a row's word: this session's blocks, carry here while a head is over it, n carried, else nothing", () => {
  const here = [blk("a", ["s1", "s2"]), blk("b", ["s1"]), blk("c", ["s1", "s2", "s3"]), blk("d", ["s1", "s2"], "dead")];
  assert.equal(rowWord("s1", "s1", here, null), "3 blocks");
  assert.equal(rowWord("s1", "s1", [here[0]], null), "1 block");
  assert.equal(rowWord("s2", "s1", here, null), "2 carried", "a closed block is not counted");
  assert.equal(rowWord("s3", "s1", here, null), "1 carried");
  assert.equal(rowWord("s3", "s1", here, "s3"), "carry here");
  assert.equal(rowWord("s4", "s1", here, null), null);
  assert.equal(rowWord("s1", "s1", [], null), null);
});

test("a carried line names the session as the side does; other lines stay as they were", () => {
  setNames([{ id: "0f3a9c2e-1111-2222-3333-444455556666", title: "spine + settings" }]);
  assert.equal(named("carried · to 0f3a9c2e-1111-2222-3333-444455556666"), 'carried · to "spine + settings"');
  assert.equal(named("carried · to 9999aaaa-unknown"), 'carried · to "9999aaaa"');
  assert.equal(named("ran · back to something-long-here"), "ran · back to something-long-here");
  assert.equal(nameOf("0f3a9c2e-1111-2222-3333-444455556666"), "spine + settings");
  assert.equal(rowAt(1, 1, "s1"), null, "no DOM, no row");
});

test("the local store's carry: the same block in both sessions, one ledger line, this stage keeps it", () => {
  const kv = new Map<string, string>();
  const st = new LocalStore("t.", { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) });
  st.compose("s1", blk("list", ["s1"]), { x: 12, y: 12, w: 300, h: 200, z: 1 });
  st.carry("s1", "list", "s2", "you");
  const a = st.read("s1"), b = st.read("s2");
  assert.deepEqual(a.blocks[0].sessions, ["s1", "s2"]);
  assert.ok(a.stage.blocks.some((p) => p.id === "list"), "still on the first stage");
  assert.deepEqual(b.blocks.map((x) => x.id), ["list"]);
  assert.equal(a.ledger.list.at(-1)?.what, "carried · to s2");
  st.carry("s1", "list", "s2", "you");
  assert.equal(st.read("s2").blocks.length, 1, "carried twice is still one");
  st.carry("s1", "list", "s1", "you");
  assert.deepEqual(st.read("s1").blocks[0].sessions, ["s1", "s2"], "never to itself");
});

test("a new session's opening comes through from the engine's stage.json", () => {
  const start = { from: "sess-aaaa0001", at: 5, lines: [{ at: 1, by: "agent", ev: "composed", note: 'card "the gate"', title: "the gate" }] };
  const seen = fromEngine({ stage: { lens: "app", tiled: false, blocks: [{ id: "g", x: 12, y: 12, w: 260, h: 140, z: 1, folded: true }], start }, blocks: [] });
  assert.deepEqual(seen.stage.start, start);
  assert.equal(fromEngine({ stage: { lens: "app", tiled: false, blocks: [] } }).stage.start, undefined);
});
