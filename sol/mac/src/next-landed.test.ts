// ✦ landing (BR1, #1615; mine/look/br1/inside.html moment 3): what a session made is tied to it by `from`, and the hand
// on it lights that session wherever it shows. Signed: marcocyl04-ux's agent (builder P9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { landedData } from "./next/cv/fixture.ts";
import { lightOff, lightOn, litNow, litRules, madeBy, tintAt } from "./next/plane/landed-state.ts";
import type { Piece } from "./next/cv/types.ts";

test("a piece is a session's only when its `from` names a session: a friend's name, a source or itself are no one's", () => {
  const s: Piece = { id: "s-1", region: "api", kind: "session", name: "Fix login" };
  const pieces: Record<string, Piece> = { "s-1": s, "doc-1": { id: "doc-1", region: "api", kind: "doc", name: "a note" } };
  const at = (from: unknown, id = "n") => madeBy({ id, region: "api", kind: "doc", name: "n", from }, pieces);
  assert.equal(at("s-1")?.id, "s-1");
  assert.equal(at("Maya"), null, "a friend's name on a sticky (workspace.ts stampFrom)");
  assert.equal(at("work"), null, "a session's own source");
  assert.equal(at("doc-1"), null, "a piece that is not a session made nothing");
  assert.equal(at(undefined), null);
  assert.equal(madeBy({ ...s, from: "s-1" }, pieces), null, "a session never made itself");
});

test("the fixture's scene: Fix login's note in api, tied to it, the only piece a session made", () => {
  const d = landedData();
  const made = Object.values(d.pieces).filter((p) => madeBy(p, d.pieces));
  assert.deepEqual(made.map((p) => [p.id, p.region, madeBy(p, d.pieces)!.id]), [["ada-note", "api", "s-Ada"]]);
  assert.equal(d.pieces["s-Ada"].region, "api");
});

test("pointing lights its session everywhere it shows: its card, its folder far off, its pane, its tab, the bar's To", () => {
  const css = litRules("s-Ada", "api", tintAt(1));
  for (const sel of ['#pl [data-piece="s-Ada"]', '#pl .pl-card[data-region="api"]', '.kp[data-kept="s-Ada"]', '.tb-tab[data-tab="s-Ada"]', '.nx-to[data-to="s-Ada"]']) assert.ok(css.includes(sel), sel);
  assert.match(css, /outline: 2\.5px solid var\(--a2\)/);
  assert.ok(litRules('a"b', "w:/x y", "red").includes('[data-piece="a\\"b"]'), "an id is quoted, never breaks the rule");
  assert.equal(tintAt(-1), "var(--a1)"); assert.equal(tintAt(7), "var(--ink4)");
});

test("one light at a time: leaving a piece puts out only its own session's", () => {
  lightOn("s-Ada"); assert.equal(litNow(), "s-Ada");
  lightOn("s-Rex"); lightOff("s-Ada"); assert.equal(litNow(), "s-Rex", "the hand moved on to Rex's piece first");
  lightOff("s-Rex"); assert.equal(litNow(), null);
});
