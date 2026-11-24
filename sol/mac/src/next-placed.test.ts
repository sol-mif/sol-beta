// Where Sol put a folder, on the canvas (next/plane/placed.ts; BR1 item 4, #1615): which card a placement names, the dot
// only while unseen, the caption's line from what Sol knows or else from next.placed's row, and the wire asking again
// after a change. Invented people only. Signed: marcocyl04-ux's agent (builder E).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRegion, lineOf, placementOf, setUnseen, unseenNow, unseenOk, type Unseen } from "./next/plane/placed.ts";
import { attach } from "./next/cv/wire/placed.ts";
import type { Known } from "./next/known.ts";

const kite: Unseen = { folder: "w:/srv/dev/kite", name: "kite", to: "Projects", from: "w:/srv/dev/Downloads", why: "it holds its own repo", k: "placed:w:/srv/dev/kite", fact: "Sol put kite from Downloads in Projects because it holds its own repo" };
const sol = (folder: string, by: Known["by"] = "sol"): Known => ({ k: `placed:${folder}`, fact: `Sol put ${folder}`, source: "where Sol put it", by, place: folder });

test("a placement names a card by its id, its id without the w:, or its path", () => {
  assert.equal(isRegion("w:/srv/dev/kite", { id: "w:/srv/dev/kite" }), true);
  assert.equal(isRegion("w:/srv/dev/kite", { id: "/srv/dev/kite" }), true);
  assert.equal(isRegion("w:/srv/dev/kite", { id: "kite", path: "/srv/dev/kite" }), true);
  assert.equal(isRegion("w:/srv/dev/kite", { id: "kite" }), false, "a name is never a place");
  assert.equal(isRegion("w:/srv/dev/kite", { id: "k2", path: "" }), false);
});

test("the dot: only while next.placed still lists it; the caption says Sol's line, seen or not", () => {
  const r = { id: "w:/srv/dev/kite" };
  const unseen = placementOf(r, [sol(kite.folder)], [kite]);
  assert.deepEqual(unseen, { k: kite.k, all: null, dot: true, from: "w:/srv/dev/Downloads" });
  const seen = placementOf(r, [sol(kite.folder)], []);
  assert.deepEqual(seen, { k: kite.k, all: null, dot: false, from: null }, "seen: the caption stays, the dot goes");
  assert.equal(placementOf(r, [sol(kite.folder, "person")], []), null, "one the person put there says nothing");
  assert.equal(placementOf({ id: "w:/srv/dev/thesis" }, [sol(kite.folder)], [kite]), null, "another folder's placement is not this card's");
});

test("before next.known says it, the caption reads the row's own line", () => {
  const x = placementOf({ id: "w:/srv/dev/kite" }, [], [kite]);
  assert.equal(x?.k, kite.k);
  assert.deepEqual(x?.all, [lineOf(kite)]);
  assert.deepEqual(lineOf(kite), { k: kite.k, fact: kite.fact, source: "where Sol put it", by: "sol", place: kite.folder });
});

test("the engine's rows only as the dot can say them", () => {
  assert.deepEqual(unseenOk(null), []);
  assert.deepEqual(unseenOk([{ folder: "" , fact: "x" }, { folder: "w:/a" }, 3]), [], "no folder or no fact: dropped");
  assert.deepEqual(unseenOk([{ folder: "w:/srv/dev/a", fact: "Sol put a", from: 7 }]), [{ folder: "w:/srv/dev/a", name: "w:/srv/dev/a", to: "", from: null, why: "", k: "placed:w:/srv/dev/a", fact: "Sol put a" }]);
});

test("the wire asks next.placed after next.known and a kept move-in, and keeps the answer", () => {
  const sent: { type: string }[] = [];
  let hear: (m: unknown) => void = () => {};
  const off = attach({ send: (m: { type: string }) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  hear({ type: "next.known", ok: true, facts: [] });
  hear({ type: "next.movein.kept" });
  hear({ type: "next.known", ok: false });
  assert.deepEqual(sent.map((m) => m.type), ["next.placed", "next.placed"], "a refused next.known asks nothing");
  hear({ type: "next.placed", ok: true, placed: [kite] });
  assert.deepEqual(unseenNow(), [kite]);
  off();
  assert.deepEqual(unseenNow(), [], "detached: no dots from a gone engine");
  setUnseen([]);
});
