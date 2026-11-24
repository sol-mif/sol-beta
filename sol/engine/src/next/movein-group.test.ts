// The move-in's new signals (BR1 C-2, #1615): who made a folder, an AI's quick tries gathered into Experiments, and
// folders the person's words name with one shape grouped. Invented homes only (Rosa's sites and Dev's code), on an
// in-memory disk. Signed: marcocyl04-ux's agent (builder P9).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Place, Reader } from "./carry.js";
import { backMoveIn, judge, keepPlaces } from "./movein-place.js";
import { madeOf, shapeOf } from "./movein-group.js";
import { readStore } from "./you-known.js";
import { recordHomeOf, type Where } from "./you.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-movein-group-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = Date.parse("2026-11-20T12:00:00Z"), DAY = 86_400_000;
const at = (n: number) => NOW - n * DAY;

function disk(files: Record<string, number>): Reader {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) for (let d = dirname(f); d !== "/"; d = dirname(d)) dirs.add(d);
  return {
    text: () => null, head: () => null,
    time: (p) => files[p] ?? null,
    list: (p) => {
      if (!dirs.has(p)) return null;
      const out = new Map<string, boolean>();
      for (const x of [...Object.keys(files), ...dirs]) if (dirname(x) === p) out.set(x.slice(p.length + 1), dirs.has(x));
      return [...out].map(([name, dir]) => ({ name, dir }));
    },
  };
}
const pl = (path: string, o: Partial<Place> = {}): Place => ({ id: path, name: path.split("/").pop()!, path, from: "claude", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false }, ...o });
const site = (dir: string, n: number) => ({ [`${dir}/index.html`]: at(n), [`${dir}/menu/lunch.html`]: at(n + 1), [`${dir}/photos/front.jpg`]: at(n + 2), [`${dir}/style.css`]: at(n) });

test("made: an AI made a folder when none of its files is older than its first session; else it is the person's", () => {
  assert.equal(madeOf({ first: at(5) }, at(5) + 1000), "ai");
  assert.equal(madeOf({ first: at(5) }, at(9)), "you", "a file from before the first session");
  assert.equal(madeOf({}, at(9)), "you", "no session at all");
  assert.equal(madeOf({ first: at(5) }, 0), "you", "no file to go by");
});

test("rosa-tries: two quick tries her AIs made, tied to nothing of hers, go into a suggested Experiments; hers stay", () => {
  const r = disk({
    "/u/rosa/tries/demo-a/main.py": at(20), "/u/rosa/tries/demo-b/app.js": at(12), "/u/rosa/tries/demo-c/x.js": at(11),
    "/u/rosa/work/studio/prices.csv": at(60), "/u/rosa/work/studio/site.html": at(2),
  });
  const places = [
    pl("/u/rosa/tries/demo-a", { sessions: { claude: 1 }, first: at(20) - 3_600_000 }),
    pl("/u/rosa/tries/demo-b", { sessions: { codex: 2 }, first: at(12) - 60_000 }),
    pl("/u/rosa/tries/demo-c", { sessions: { claude: 1 }, first: at(11) - 60_000, said: ["demos"] }),
    pl("/u/rosa/work/studio", { sessions: { claude: 9 }, first: at(30) }),
  ];
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/u/rosa"] }), by = (p: string) => j.find((x) => x.path === p)!;
  assert.equal(by("/u/rosa/tries/demo-a").made, "ai");
  assert.equal(by("/u/rosa/work/studio").made, "you", "her prices are older than its first session");
  assert.deepEqual(by("/u/rosa/tries/demo-a").parent, { folder: "h:Experiments", name: "Experiments", path: "", reading: "tries", fresh: true });
  assert.equal(by("/u/rosa/tries/demo-b").parent?.folder, "h:Experiments");
  assert.equal(by("/u/rosa/tries/demo-a").reading, "tries");
  assert.equal(by("/u/rosa/tries/demo-c").parent, null, "one she named in her own words is hers to say");
  assert.equal(by("/u/rosa/work/studio").parent, null);

  // one quick try alone is no group: no empty or single groups
  const one = judge({ places: places.slice(0, 1).concat(places[3]), order: [] }, r, { now: NOW, stop: ["/u/rosa"] });
  assert.equal(one.filter((x) => x.parent).length, 0);
  // one in her side is hers
  const side = judge({ places, order: ["/u/rosa/tries/demo-b"] }, r, { now: NOW, stop: ["/u/rosa"] });
  assert.equal(side.filter((x) => x.reading === "tries").length, 0, "with one left, nothing is gathered");
});

test("rosa-shape: her word names three sites with one shape: a suggested group named by her word; words alone sort nothing", () => {
  const r = disk({
    ...site("/u/rosa/sites/bistro", 3), ...site("/u/rosa/sites/noodle-bar", 5), ...site("/u/rosa/sites/taqueria", 8),
    "/u/rosa/admin/restaurant-tax/2025.pdf": at(40), "/u/rosa/admin/restaurant-tax/notes.txt": at(40),
  });
  const said = { said: ["restaurants"] };
  const places = [pl("/u/rosa/sites/bistro", said), pl("/u/rosa/sites/noodle-bar", said), pl("/u/rosa/sites/taqueria", said), pl("/u/rosa/admin/restaurant-tax", said)];
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/u/rosa"] }), by = (p: string) => j.find((x) => x.path === p)!;
  const g = by("/u/rosa/sites/bistro").parent!;
  assert.equal(g.folder, "h:Restaurants");
  assert.equal(g.reading, "shape");
  assert.ok("shape" in g && g.shape!.join(", ") === "menu, photos, pages", `the shape in her terms: ${"shape" in g ? g.shape : ""}`);
  assert.equal(by("/u/rosa/sites/taqueria").parent?.folder, "h:Restaurants");
  assert.equal(by("/u/rosa/sites/bistro").why, "you called them “restaurants”, and they hold the same shape: menu, photos, pages");
  assert.equal(by("/u/rosa/admin/restaurant-tax").parent, null, "her word names it too, but it holds another shape");

  // the same sites with no words of hers: nothing groups
  const blind = judge({ places: places.map((p) => ({ ...p, said: undefined })), order: [] }, r, { now: NOW, stop: ["/u/rosa"] });
  assert.equal(blind.filter((x) => x.parent).length, 0, "shape alone is not a group");
  // her words on folders of different shapes: nothing groups
  const odd = judge({ places: [places[0], places[3]], order: [] }, r, { now: NOW, stop: ["/u/rosa"] });
  assert.equal(odd.filter((x) => x.parent).length, 0, "words alone never sort");
  assert.deepEqual([...shapeOf(r, "/u/rosa/sites/bistro")].sort(), ["d:menu", "d:photos", "k:pages", "k:pictures"]);
});

test("rosa-home: a group Sol's home already has is that folder; a Sol-home folder is never gathered", () => {
  const r = disk({ ...site("/u/rosa/sites/bistro", 3), ...site("/u/rosa/sites/taqueria", 8), "/s/sol/Restaurants/a.md": at(50), ...site("/s/sol/pizzeria", 4) });
  const said = { said: ["Restaurants"] };
  const places = [pl("/u/rosa/sites/bistro", said), pl("/u/rosa/sites/taqueria", said), pl("/s/sol/Restaurants", { id: "Restaurants", from: "home" }), pl("/s/sol/pizzeria", { id: "pizzeria", from: "home", ...said })];
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/u/rosa", "/s/sol"] });
  const g = j.find((x) => x.path === "/u/rosa/sites/bistro")!.parent!;
  assert.deepEqual([g.folder, "fresh" in g && g.fresh], ["h:Restaurants", false]);
  assert.equal(j.find((x) => x.path === "/s/sol/pizzeria")!.parent, null);
});

test("rosa-keep: moving in makes the suggested group a folder of Sol's home; the move-in's Back takes it out while empty", () => {
  const sol = join(root, "rosa"); fs.mkdirSync(sol, { recursive: true });
  const w: Where = { sol, user: sol, rec: recordHomeOf(sol, sol) };
  const r = disk({ "/u/rosa/tries/demo-a/main.py": at(20), "/u/rosa/tries/demo-b/app.js": at(12) });
  const places = [pl("/u/rosa/tries/demo-a", { sessions: { claude: 1 }, first: at(21) }), pl("/u/rosa/tries/demo-b", { sessions: { codex: 1 }, first: at(13) })];
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/u/rosa"] });
  assert.equal(fs.existsSync(join(sol, "Experiments")), false, "a suggestion is not a folder before moving in");
  const k = keepPlaces(w, j, j.map((x) => x.folder));
  assert.equal(k.placed.length, 2);
  assert.ok(fs.statSync(join(sol, "Experiments")).isDirectory(), "moved in: Experiments is a folder of Sol's home");
  assert.deepEqual(readStore(sol).placed.map((p) => [p.folder, p.to, p.reading]), [["w:/u/rosa/tries/demo-a", "h:Experiments", "tries"], ["w:/u/rosa/tries/demo-b", "h:Experiments", "tries"]]);
  const b = backMoveIn(w, { batch: k.batch });
  assert.equal(b.ok, true);
  assert.equal(fs.existsSync(join(sol, "Experiments")), false, "the Back takes the empty folder it made");
  // a group folder the person filled since stays
  const k2 = keepPlaces(w, j, j.map((x) => x.folder));
  fs.writeFileSync(join(sol, "Experiments", "mine.md"), "x");
  backMoveIn(w, { batch: k2.batch });
  assert.ok(fs.existsSync(join(sol, "Experiments", "mine.md")));
});
