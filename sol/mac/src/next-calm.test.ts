// node --test src/*.test.ts: the calm screen (BR1 item 3, #1615). A piece's small type reads at least 11px on screen at
// Middle's zoom (layout.ts textFloor), and two folders with one name are told apart by the nearest parent that differs
// (place.ts apartFrom, apartOf). Invented people only (Dev, Denise, Lucy). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { textFloor } from "./next/plane/layout.ts";
import { apartFrom, apartOf } from "./next/place.ts";
import { GATHER_AT, gatherOf, gathers, gatherWords } from "./next/plane/calm.ts";

test("textFloor: at zoom 1 or more nothing changes; under it every small step reads 11px on screen, lines with it", () => {
  assert.equal(textFloor(1), undefined);
  assert.equal(textFloor(1.4), undefined);
  assert.equal(textFloor(0), undefined, "no zoom: no style");
  assert.equal(textFloor(0.3), undefined, "zoomed out past Middle: an overview, its type as drawn");
  const z = 0.77, f = textFloor(z)!;
  for (const k of ["label", "pill", "head", "code", "body"]) {
    const size = parseFloat(f[`--t-${k}`]);
    assert.ok(size * z >= 10.99, `--t-${k} reads ${size * z}px`);
    assert.ok(parseFloat(f[`--t-${k}-line`]) > size, `--t-${k}-line holds its text`);
  }
  assert.equal(f["--t-read"], undefined, "reading type (15px) is not a small step");
  const g = textFloor(0.9)!;
  assert.equal(g["--t-body"], undefined, "13px at 0.9 is 11.7px: left as it is");
  assert.ok(parseFloat(g["--t-label"]) * 0.9 >= 10.99);
});

test("apartFrom: Dev's two api folders show the parent that differs; a name nobody shares shows none", () => {
  const m = apartFrom([
    { id: "w:/srv/dev/work/api", name: "api", up: ["work", "dev", "srv"] },
    { id: "w:/srv/dev/play/api", name: "api", up: ["play", "dev", "srv"] },
    { id: "w:/srv/dev/web", name: "web", up: ["dev", "srv"] },
  ]);
  assert.equal(m.get("w:/srv/dev/work/api"), "work");
  assert.equal(m.get("w:/srv/dev/play/api"), "play");
  assert.equal(m.has("w:/srv/dev/web"), false);
});

test("apartFrom: the nearest parent that differs, past the ones they share; names match whatever their case", () => {
  const m = apartFrom([
    { id: "a", name: "Notes", up: ["school", "denise"] },
    { id: "b", name: "notes", up: ["school", "lucy"] },
  ]);
  assert.equal(m.get("a"), "denise");
  assert.equal(m.get("b"), "lucy");
});

test("apartFrom: of three with one name, each shows the parent no other shares; one with no parents shows none", () => {
  const m = apartFrom([
    { id: "a", name: "kids", up: ["house", "denise"] },
    { id: "b", name: "kids", up: ["house", "lucy"] },
    { id: "c", name: "kids", up: ["school", "lucy"] },
    { id: "d", name: "kids", up: [] },
  ]);
  assert.equal(m.get("a"), "denise");
  assert.equal(m.get("b"), "house", "house is shared with a, lucy with c: the first that differs from one of them");
  assert.equal(m.get("c"), "school");
  assert.equal(m.has("d"), false);
});

test("apartOf on the store: two folders named api under different paths each carry their own parent", () => {
  CV.load("denise");
  CV.D.regions.push({ id: "w:/srv/dev/work/api", name: "api", kind: "code" } as never, { id: "w:/srv/dev/play/api", name: "api", kind: "code" } as never);
  CV.render();
  assert.equal(apartOf("w:/srv/dev/work/api"), "work");
  assert.equal(apartOf("w:/srv/dev/play/api"), "play");
  const lone = CV.D.regions.find((r) => !r.id.includes("/api"))!;
  assert.equal(apartOf(lone.id), null);
});

test("gathers: up to three asks on screen keep their own presses; a fourth gathers them all into one line", () => {
  assert.equal(GATHER_AT, 3);
  const asks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }) as never);
  assert.equal(gathers([]), null);
  assert.equal(gathers(asks(3)), null);
  assert.equal(gathers(asks(4))!.length, 4);
  assert.equal(gathers(asks(7))!.length, 7, "every ask on screen gathers, not only those past the cap");
});

test("gatherWords: the line reads as Middle's count (count 30 sums \"N things here\" with outside and people)", () => {
  assert.equal(gatherWords(7), "7 things here need you");
  assert.equal(gatherWords(1), "One thing here needs you");
  assert.match(gatherWords(12), /^(\d+) things here/);
});

test("gatherOf: the asks on the faces given, none of a piece folded or off the canvas, in the asks' order", () => {
  CV.load("dev-morning");
  CV.render();
  const asked = [...new Set(CV.open().map((a) => a.piece))].map((id) => CV.D.pieces[id]).filter(Boolean);
  assert.ok(asked.length >= 2, "the dev morning has asks on more than one piece");
  const all = gatherOf(asked);
  assert.deepEqual(all.map((a) => a.id), CV.open().filter((a) => asked.some((p) => p.id === a.piece)).map((a) => a.id));
  assert.deepEqual(gatherOf([]), []);
  const one = asked[0], pos = CV.D.pos![one.id];
  assert.ok(pos, "the piece has a place");
  pos.folded = true;
  assert.ok(gatherOf(asked).every((a) => a.piece !== one.id), "a folded piece's asks are not on screen");
  delete pos.folded;
});
