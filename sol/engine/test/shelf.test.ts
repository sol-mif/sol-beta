// The shelf (#200): its pure parts (the name, the index read, the sweep's choice, a png's size), and the shelf in a
// throwaway home (add, a row kept from before, the sweep). Grab and its tray went with the notch (#1584); a talk's
// export (talks.ts) is what lands here now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shelf = await import("../src/shelf.ts");
type Row = import("../src/shelf.ts").Row;

const NOW = new Date("2026-10-24T15:30:12.345Z");
const DAY = 24 * 60 * 60_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const row = (id: string, at: string, kept = false): Row => ({ id, kind: "shot", name: `${id}.png`, mime: "image/png", at, kept, file: `${id}.png` });
// a 3 x 2 png header (enough for pngSize)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0])]);

test("a shelf file's name: the stamp, the safe name, a clash numbered", () => {
  assert.equal(shelf.stampOf(NOW), "20261024-153012");
  assert.equal(shelf.shelfName("my shot.png", NOW), "20261024-153012-my shot.png");
  assert.equal(shelf.shelfName("../../etc/passwd", NOW), "20261024-153012-passwd");
  assert.equal(shelf.shelfName("a/b:c?.png", NOW), "20261024-153012-b_c_.png");
  assert.equal(shelf.shelfName("", NOW), "20261024-153012-file");
  const taken = new Set(["20261024-153012-x.png", "20261024-153012-x-2.png"]);
  assert.equal(shelf.shelfName("x.png", NOW, (n) => taken.has(n)), "20261024-153012-x-3.png");
});

test("the index reads its valid rows newest first; anything broken is an empty shelf", () => {
  assert.deepEqual(shelf.parseIndex("not json"), []);
  assert.deepEqual(shelf.parseIndex('{"id":"a"}'), []);
  const rows = shelf.parseIndex(JSON.stringify([
    row("old", ago(3)), row("new", ago(0), true),
    { id: "nofile", at: ago(1) }, { id: "bad-at", file: "x", at: "yesterday" },
    { ...row("escape", ago(1)), file: "../index.json" }, { ...row("hidden", ago(1)), file: ".x" },
    { id: "odd", file: "odd.bin", at: ago(2), kind: "weird", kept: "yes" },
  ]));
  assert.deepEqual(rows.map((r) => r.id), ["new", "odd", "old"]);
  assert.equal(rows[0].kept, true);
  assert.equal(rows[1].kind, "file");
  assert.equal(rows[1].kept, false);
  assert.equal(rows[1].mime, "application/octet-stream");
});

test("the sweep: older than seven days and not kept goes; kept stays however old", () => {
  const rows = [row("fresh", ago(1)), row("edge", ago(7)), row("old", ago(8)), row("kept", ago(30), true)];
  const { stay, go } = shelf.sweepChoice(rows, NOW);
  assert.deepEqual(go.map((r) => r.id), ["old"]);
  assert.deepEqual(stay.map((r) => r.id), ["fresh", "edge", "kept"]);
  assert.deepEqual(shelf.sweepChoice(rows, NOW, 2).go.map((r) => r.id), ["edge", "old"]);
});

test("a png's size from its header", () => {
  assert.deepEqual(shelf.pngSize(PNG), { w: 3, h: 2 });
  assert.equal(shelf.pngSize(Buffer.from("plain text, not a picture")), null);
});

test("the shelf in a home: add, a row kept from before stays, the sweep takes the rest", () => {
  const home = mkdtempSync(join(tmpdir(), "sol-shelf-"));
  shelf.setShelfHome(home, (abs) => `http://127.0.0.1:7777/file?path=${encodeURIComponent(abs)}`);
  try {
    const a = shelf.addToShelf([{ buf: PNG, name: "a.png", mime: "image/png" }], "shot", new Date(NOW.getTime() - 9 * DAY));
    assert.equal(a.fresh[0].kind, "shot");
    assert.equal(a.fresh[0].w, 3);
    assert.match(a.fresh[0].url, /^http:\/\/127\.0\.0\.1:7777\/file\?path=.*shelf.*20261015-153012-a\.png$/);
    assert.equal("file" in a.fresh[0], false);

    const b = shelf.addToShelf([{ buf: Buffer.from("# a talk"), name: "talk.md", mime: "text/markdown" }], "file", NOW);
    assert.deepEqual(b.items.map((i) => i.name), ["talk.md", "a.png"]);   // the new one first
    assert.equal(b.items[0].kind, "file");

    // a row kept from before (the Grab tray's Keep): it never leaves
    const index = join(home, "shelf", "index.json");
    const rows = JSON.parse(readFileSync(index, "utf8")) as Row[];
    writeFileSync(join(home, "shelf", "kept.png"), PNG);
    writeFileSync(index, JSON.stringify([...rows, row("kept", ago(30), true)]));

    assert.equal(shelf.sweepShelf(NOW), 1);   // a.png, nine days old and not kept: file and row
    assert.deepEqual((JSON.parse(readFileSync(index, "utf8")) as Row[]).map((r) => r.name), ["talk.md", "kept.png"]);
    assert.deepEqual(readdirSync(join(home, "shelf")).sort(), ["20261024-153012-talk.md", "index.json", "kept.png"]);

    assert.throws(() => shelf.addToShelf([], "file", NOW), /nothing to put on the shelf/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
