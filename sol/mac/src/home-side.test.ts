// node --test src/*.test.ts (npm test here): the side (#799, plan Part C slice 36; home/whole/places.ts,
// placesStore.ts, WholeSide.tsx, Place.tsx). The Try line: the side shows your real Canvas courses, not example folders:
// its places are what `home.places` sends (your Canvas courses and your folders, each saying where from), never the
// empty view's example rows; with the switch off those example rows stay as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inPlace, peopleLine, placeLine, seedPlaces, todayCount, treeOf } from "./home/whole/places.ts";
import { stub as listStub, type TodayMsg } from "./home/whole/today.ts";
import { stub as sourcesStub } from "./home/whole/policy.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();
const day = () => { const m = listStub(() => NOW)({ type: "home.today" })[0] as TodayMsg; return { needs: m.today.needs, things: m.things }; };

test("the side shows your Canvas courses, from Canvas, not example folders", () => {
  const { places } = seedPlaces(), { needs, things } = day();
  const rows = treeOf(places, things, needs);
  const canvas = rows.filter((r) => r.from === "canvas").map((r) => r.name);
  assert.deepEqual(canvas, ["bio 201", "chem 110", "stats 140"], "the courses come from Canvas");
  for (const r of rows.filter((x) => x.from === "canvas")) assert.equal(r.depth, 1, `${r.name} sits under school`);
  assert.equal(places.find((p) => p.id === "bio-201")!.from.label, "Canvas · BIO 201 · Fall 2026", "each says where it comes from");
  assert.equal(places.find((p) => p.id === "school")!.from.label, "~/School", "school is your folder on disk");
  // the same courses Sources' Canvas row reads (one source of truth across Home)
  const canvasScope = sourcesStub(() => NOW)({ type: "home.sources" }).sources.find((s) => s.id === "canvas")!.scope.reads[0];
  for (const c of canvas) assert.ok(canvasScope.includes(c), `Sources' Canvas reads ${c}`);
  // none of the empty view's example rows
  const names = rows.map((r) => r.name);
  for (const ex of ["your areas", "pinned tools", "calendar", "browser", "whiteboard"]) assert.ok(!names.includes(ex), `no example row "${ex}"`);
});

test("a dot where something waits on you, the count beside today, moving per place", () => {
  const { places } = seedPlaces(), { needs, things } = day();
  const rows = Object.fromEntries(treeOf(places, things, needs).map((r) => [r.id, r]));
  assert.equal(rows["chem-110"].waits, 1, "chem set 6 waits in chem 110");
  assert.equal(rows["school"].waits, 1, "and so school, above it");
  assert.equal(rows["stats-group"].waits, 1, "Maya's ask");
  assert.equal(rows["applications"].waits, 1, "the Shopify application");
  assert.equal(rows["bio-201"].waits, 0); assert.equal(rows["bio-201"].moving, 1, "bio notes moving");
  assert.equal(rows["life"].waits, 0);
  assert.equal(todayCount(needs.length), "3 need you"); assert.equal(todayCount(0), "");
  const bio = places.find((p) => p.id === "bio-201")!;
  assert.deepEqual(placeLine(bio, things, needs), ["Bio 201.", "1 moving."]);
  assert.deepEqual(inPlace(places.find((p) => p.id === "school")!, things).map((t) => t.id).sort(), ["t-bio-notes", "t-chem-set6", "t-lab-prep"]);
  assert.deepEqual(peopleLine(seedPlaces().people, needs), ["Three people.", "Maya waits on you."]);
});

test("what it knows, and from where (whole.md pain 10)", () => {
  const bio = seedPlaces().places.find((p) => p.id === "bio-201")!;
  assert.deepEqual(bio.knows.map((k) => [k.label, k.from]).slice(0, 3), [["12 lectures", "Canvas, synced"], ["syllabus", "Canvas"], ["textbook ch 1–8", "~/School"]]);
});

test("the store and where you are", async () => {
  const P = await import("./home/whole/placesStore.ts");
  P.send();
  assert.equal(P.whereWord("folder", P.placesNow(), "chem-110"), "chem 110", "the head names the folder");
  assert.equal(P.whereWord("done", P.placesNow(), null), "done today");
  P.openFolder("bio-201");
  assert.equal(P.folderNow(), "bio-201", "a press on a place opens it");
});

test("the seams: the side is the switch's; off, the empty view's rows as they were; marked", () => {
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /useHomeWhole\(\) \? \{[^}]*sideNode: <Suspense fallback=\{null\}><WholeSide \/><\/Suspense> \/\* C36 \*\//);
  assert.match(modes, /side=\{sideNode \?\? <div className="ev-side">/, "without it, the empty view's own side");
  assert.match(modes, /rows: \["school", "work", "life"\]/, "the example rows stay for the switch off");
  const side = readFileSync(new URL("./home/whole/WholeSide.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(side, /your areas|pinned tools|"school", "work", "life"/, "the side draws no example folders");
  assert.match(side, /treeOf\(places\.places/);
});

test("what you just did, and undo it, on the side's places too; the front outlives Today (#875 C36-1, C36-3)", () => {
  const place = readFileSync(new URL("./home/whole/Place.tsx", import.meta.url), "utf8");
  assert.equal(place.match(/<Receipt \/>/g)?.length, 2, "a folder and people both show the receipt with its undo");
  assert.match(place, /bringForward\(t\.id\); goTo\("today"\)/, "a row that needs you brings its own card forward");
  const first = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(first, /useState<FrontState>/, "the front is not Today's own state, so it is not lost on leaving");
  assert.match(first, /export function Receipt\(\)[\s\S]*inField\(ev\.target\)[\s\S]*back\(done\.ledgerId\)/, "the receipt's ⌘Z, outside a field");
  assert.match(first, /done && !\(done\.ledgerId in fsNow\.kept\)/, "back on Today, a receipt already kept keeps its card");
});
