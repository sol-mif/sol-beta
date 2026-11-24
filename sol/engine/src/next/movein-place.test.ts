// Where the move-in puts each folder (BR1 item 7, #1615): judged from how the person lived in it against their own home,
// a parent only by the disk (inside, or a shared rules file), the shelf, one batch with one Back, and "same" by reading.
// Invented homes only: Dev's code folder and Denise's bakery, on an in-memory disk. Signed: marcocyl04-ux's agent (builder P).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Place, Reader } from "./carry.js";
import { backMoveIn, foldersOf, holdsAll, judge, keepPlaces, MIN_HOME, shelfNow, shelfPut, shelfTake } from "./movein-place.js";
import { knownNow, noteFix, placedNow, sameNow } from "./you-known.js";
import { recordHomeOf, type Where } from "./you.js";
import { folderId, keepMoveIn, keptFolders, markBatch, migOf, readMoveIn, setLead, unkeep } from "./movein.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-movein-place-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = Date.parse("2026-11-20T12:00:00Z"), DAY = 86_400_000;
const whereOf = (name: string): Where => { const sol = join(root, name); fs.mkdirSync(sol, { recursive: true }); return { sol, user: sol, rec: recordHomeOf(sol, sol) }; };

/** an invented disk: every file with its change time; folders come from the paths */
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
const at = (n: number) => NOW - n * DAY;
const pl = (path: string, o: Partial<Place> = {}): Place => ({ id: path, name: path.split("/").pop()!, path, from: "claude", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false }, ...o });

test("dev-nested: a parent is where the disk says, inside or a shared rules file, never a name", () => {
  const r = disk({
    "/u/dev/code/acme/CLAUDE.md": at(40),
    "/u/dev/code/acme/api/server.ts": at(1), "/u/dev/code/acme/api/db.ts": at(3),
    "/u/dev/code/acme/web/app.tsx": at(2),
    "/u/dev/code/notes/todo.md": at(5),
    "/u/dev/code/notes/old/a.md": at(30),
    "/u/dev/code/acme-copy/readme.md": at(9),
  });
  const places = [pl("/u/dev/code/acme/api", { rules: ["CLAUDE.md"] }), pl("/u/dev/code/acme/web"), pl("/u/dev/code/notes"), pl("/u/dev/code/notes/old"), pl("/u/dev/code/acme-copy"), pl("/u/dev", { sessions: { claude: 4 } })];
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/u/dev"] });
  const by = (p: string) => j.find((x) => x.path === p)!;
  assert.deepEqual(by("/u/dev/code/acme/api").parent, { folder: "w:/u/dev/code/acme", name: "acme", path: "/u/dev/code/acme", reading: "rules", file: "CLAUDE.md" });
  assert.equal(by("/u/dev/code/acme/web").parent?.folder, "w:/u/dev/code/acme");
  assert.equal(by("/u/dev/code/acme/web").why, "it reads CLAUDE.md in acme, as 1 other folder there does");
  assert.deepEqual(by("/u/dev/code/notes/old").parent, { folder: "w:/u/dev/code/notes", name: "notes", path: "/u/dev/code/notes", reading: "inside" });
  assert.equal(by("/u/dev/code/acme-copy").parent, null, "a name like acme's is no parent, nor the home a session opened in");
  assert.equal(by("/u/dev"), undefined, "the home a session opened in is never a folder");
  assert.ok(by("/u/dev/code/notes").lived.belongs.includes("it holds old"), "a folder holding one belongs");
  assert.equal(j.filter((x) => x.shelf).length, 0, `fewer than ${MIN_HOME} folders: nothing ranks, everything stays`);
});

test("lucy-home: her home, Sol's home, an app's storage and a sync root are never a folder and never a parent (first-timer P 3)", () => {
  const H = "/Users/you", SOL = "/Users/you/sol/home";
  const r = disk({
    [`${SOL}/law-project/brief.md`]: at(2), [`${SOL}/jobs/cv.md`]: at(4),
    [`${H}/Library/Application Support/Notes/db`]: at(1), [`${H}/.config/app/x.json`]: at(1),
    [`${H}/Library/Mobile Documents/com~apple~CloudDocs/essay/draft.md`]: at(3),
    [`${H}/Dropbox/thesis/ch1.md`]: at(5), [`${H}/Google Drive/a.txt`]: at(6),
  });
  const places = [pl(SOL, { sessions: { claude: 12 } }), pl(`${SOL}/law-project`), pl(`${SOL}/jobs`), pl(H, { sessions: { claude: 3 } }),
    pl(`${H}/Library/Application Support/Notes`), pl(`${H}/.config/app`), pl(`${H}/Library/Mobile Documents/com~apple~CloudDocs`),
    pl(`${H}/Library/Mobile Documents/com~apple~CloudDocs/essay`), pl(`${H}/Dropbox`), pl(`${H}/Dropbox/thesis`), pl(`${H}/Google Drive`)];
  const homes = [H, SOL], j = judge({ places, order: [] }, r, { now: NOW, stop: homes });
  assert.deepEqual(j.map((x) => x.path).sort(), [`${H}/Dropbox/thesis`, `${SOL}/jobs`, `${SOL}/law-project`].sort(), "only her own folders are folders");
  assert.ok(j.every((x) => x.parent === null), "law-project and jobs sit at the top, not inside Sol's home; thesis not inside Dropbox");
  assert.deepEqual(foldersOf({ places }, homes).places.map((p) => p.path), j.map((x) => x.path), "the read the face hears holds the same folders");
  for (const p of [H, SOL, `${H}/Library`, `${H}/AppData/Roaming/x`, `${H}/.claude`, `${H}/OneDrive - Bakery`, `${H}/iCloud Drive`, "/Users", "/"]) assert.ok(holdsAll(p, homes), p);
  for (const p of [`${H}/Dropbox/thesis`, `${H}/code/api`, `${SOL}/jobs`, `${H}/code/api/.claude/worktrees/x`]) assert.ok(!holdsAll(p, homes), p);
});

/** Denise's bakery: ten folders, two of them used on one day long ago and tied to nothing */
function bakery(extra: [string, number[]][] = []) {
  const files: Record<string, number> = {}, places: Place[] = [];
  const add = (name: string, days: number[], o: Partial<Place> = {}) => {
    const path = `/u/denise/${name}`;
    days.forEach((d, i) => { files[`${path}/f${i}.txt`] = at(d); });
    places.push(pl(path, o));
  };
  for (const [n, days] of [["orders", [1, 2, 3, 8]], ["cakes", [2, 4, 9]], ["suppliers", [5, 6, 20]], ["staff", [3, 12]], ["accounts", [1, 30, 60]], ["menu", [7, 14]], ["recipes", [4, 40, 80]], ["events", [10, 11]]] as const) add(n, [...days]);
  add("flyer-spring", [200, 200]);
  add("tax-2024", [300]);
  for (const [n, days] of extra) add(n, days);
  return { r: disk(files), places };
}

test("denise-shelf: used on one day, tied to nothing, quieter than three in four of her folders", () => {
  const { r, places } = bakery();
  const j = judge({ places, order: [] }, r, { now: NOW });
  assert.deepEqual(j.filter((x) => x.shelf).map((x) => x.name).sort(), ["flyer-spring", "tax-2024"]);
  const f = j.find((x) => x.name === "tax-2024")!;
  assert.equal(f.reading, "one-day");
  assert.match(f.why!, /^it was changed on one day only, 2026-01-24, and three in four of your folders were used more$/);
  // put in her side by hand: it belongs, so it stays
  const kept = judge({ places, order: ["/u/denise/tax-2024"] }, r, { now: NOW });
  assert.equal(kept.find((x) => x.name === "tax-2024")!.shelf, false);
  assert.deepEqual(kept.find((x) => x.name === "tax-2024")!.lived.belongs, ["you put it in your side"]);
  // made yesterday, one day of changes: too new to have been come back to, so it stays
  const fresh = bakery([["wedding-order", [1]]]);
  const jf = judge({ places: fresh.places, order: [] }, fresh.r, { now: NOW });
  assert.equal(jf.find((x) => x.name === "wedding-order")!.lived.days, 1);
  assert.equal(jf.find((x) => x.name === "wedding-order")!.shelf, false);
  assert.ok(jf.find((x) => x.name === "tax-2024")!.shelf);
});

test("denise-batch: one move-in, one batch; one Back until her first own change, then Read again", () => {
  const w = whereOf("denise-batch"), { r, places } = bakery();
  const j = judge({ places, order: [] }, r, { now: NOW });
  const keep = j.map((x) => x.folder);
  const { batch, placed } = keepPlaces(w, j, keep, NOW);
  assert.match(batch, /^movein-/);
  assert.deepEqual(placed.map((p) => [p.name, p.to, p.batch]).sort(), [["flyer-spring", "shelf", batch], ["tax-2024", "shelf", batch]]);
  assert.ok(knownNow(w, {}, NOW).facts.some((f) => f.k === "placed:w:/u/denise/tax-2024" && f.fact.startsWith("Sol archived tax-2024 because it was changed on one day only")));
  // similar by reading, read only (F's): the other shelved one, never by name
  const same = sameNow(w, { reason: "placed:w:/u/denise/tax-2024", place: "w:/u/denise/tax-2024" }, NOW);
  assert.ok(same.ok && same.same?.n === 1 && same.same.these[0].k === "placed:w:/u/denise/flyer-spring");
  assert.equal(sameNow(w, {}, NOW).ok, false);
  // a move inside the move-in carries its batch and leaves the whole Back
  noteFix(w, { how: "drag", what: "cakes", place: "w:/u/denise/cakes", reason: "placed:w:/u/denise/cakes", batch }, NOW + 1);
  const back = backMoveIn(w, { batch }, NOW + 2);
  assert.ok(back.ok && back.undone.length === 2);
  assert.equal(placedNow(w).placed.length, 0);
  assert.ok(knownNow(w, {}, NOW + 2).facts.some((f) => f.fact === "You said no to the move-in's 2 placements"));
  // again, then a change of her own: Back turns into Read again
  const two = keepPlaces(w, j, keep, NOW + 10);
  noteFix(w, { how: "hide", what: "menu", place: "w:/u/denise/menu", reason: "placed:w:/u/denise/menu" }, NOW + 11);
  const no = backMoveIn(w, { batch: two.batch }, NOW + 12);
  assert.ok(!no.ok && "again" in no && no.again === true);
  assert.equal(backMoveIn(w, { batch: "nothing" }).ok, false);
});

test("denise-unkeep: the one Back puts the answers back as they were before that keep, the lead kept", () => {
  const home = join(root, "denise-unkeep");
  fs.mkdirSync(home, { recursive: true });
  keepMoveIn(home, { keep: ["w:/u/denise/orders"], drop: ["w:/u/denise/old"] }, NOW);
  const before = readMoveIn(home);
  keepMoveIn(home, { keep: ["w:/u/denise/cakes", "w:/u/denise/old"] }, NOW + 1);
  markBatch(home, "movein-b2", before);
  setLead(home, { lead: "work" }, NOW + 2);
  assert.equal(readMoveIn(home)!.batch, "movein-b2");
  assert.equal(unkeep(home, "movein-other", NOW + 3)!.keep.length, 3, "another batch puts nothing back");
  const back = unkeep(home, "movein-b2", NOW + 3)!;
  assert.deepEqual([back.keep, back.drop, back.lead, back.batch], [["w:/u/denise/orders"], ["w:/u/denise/old"], "work", undefined]);
  // the first move-in's Back: not moved in yet
  const first = join(root, "denise-first");
  fs.mkdirSync(first, { recursive: true });
  keepMoveIn(first, { keep: ["w:/u/denise/orders"] }, NOW);
  markBatch(first, "movein-b1", null);
  assert.deepEqual(unkeep(first, "movein-b1", NOW + 1)!.keep, []);
});

test("denise-shelf-own: what she shelves is hers; a shelved folder that changes again is awake", () => {
  const w = whereOf("denise-own"), { r, places } = bakery();
  keepPlaces(w, judge({ places, order: [] }, r, { now: NOW }), places.map((p) => "w:" + p.path), NOW);
  assert.ok(shelfPut(w, { folder: "w:/u/denise/events", name: "events" }, NOW + 1).ok);
  const s = shelfNow(w, "/u/denise", r);
  assert.equal(s.n, 3);
  assert.deepEqual([s.shelf[0].name, s.shelf[0].by], ["events", "person"], "newest first");
  assert.deepEqual(s.shelf.slice(1).map((x) => [x.name, x.by]).sort(), [["flyer-spring", "sol"], ["tax-2024", "sol"]]);
  assert.ok(knownNow(w, {}, NOW + 1).facts.some((f) => f.k === "placed:w:/u/denise/events" && f.fact === "You archived events" && f.by === "person"));
  assert.ok(!placedNow(w).placed.some((p) => p.folder === "w:/u/denise/events"), "hers, so nothing unseen");
  // Sol never moves what she put
  const again = keepPlaces(w, [{ folder: "w:/u/denise/events", name: "events", path: "/u/denise/events", lived: { days: 1, last: 0, grew: 0, belongs: [] }, score: 0, shelf: true, parent: null, why: "x", reading: "one-day" }], ["w:/u/denise/events"], NOW + 2);
  assert.equal(again.placed.length, 0);
  // awake: a file in the flyer folder changed after it was shelved
  const woke = disk({ "/u/denise/flyer-spring/f0.txt": NOW + 5 * DAY });
  assert.ok(shelfNow(w, "/u/denise", woke, NOW + 6 * DAY).awake.includes("w:/u/denise/flyer-spring"));
  assert.deepEqual(shelfNow(w, "/u/denise", r, NOW + 6 * DAY).awake, [], "nothing changed since: nothing awake");
  assert.ok(shelfTake(w, { folder: "w:/u/denise/flyer-spring" }, NOW + 3).ok);
  assert.equal(shelfNow(w, "/u/denise", r).n, 2);
  assert.ok(knownNow(w, {}, NOW + 3).facts.some((f) => f.fact === "You brought flyer-spring from Archived back here"));
  assert.equal(shelfTake(w, { folder: "w:/u/denise/flyer-spring" }).ok, false);
});

test("denise-removed: a folder she removes at the move-in goes on the shelf as hers, in the batch, once (first-timer P 4)", () => {
  const w = whereOf("denise-removed"), { r, places } = bakery();
  const j = judge({ places, order: [] }, r, { now: NOW });
  const all = places.map((p) => "w:" + p.path);
  const { batch, placed } = keepPlaces(w, j, all.filter((f) => f !== "w:/u/denise/menu"), NOW, ["w:/u/denise/menu", "s-chat", "Ada"]);
  const menu = placed.find((p) => p.folder === "w:/u/denise/menu")!;
  assert.deepEqual([menu.name, menu.to, menu.by, menu.batch, menu.why], ["menu", "shelf", "person", batch, "you removed it when moving in"]);
  assert.ok(!placed.some((p) => p.folder === "s-chat" || p.folder === "Ada"), "a chat or an AI is never on the shelf");
  const s = shelfNow(w, "/u/denise", r);
  assert.deepEqual(s.shelf.find((x) => x.folder === "w:/u/denise/menu")?.by, "person");
  // removed again in a second keep: it stays one line
  keepPlaces(w, j, [], NOW + 1, ["w:/u/denise/menu"]);
  assert.equal(shelfNow(w, "/u/denise", r).shelf.filter((x) => x.folder === "w:/u/denise/menu").length, 1);
  // the move-in's Back takes it off with the rest of the first batch
  const back = backMoveIn(w, { batch }, NOW + 2);
  assert.ok(back.ok && back.undone.includes("w:/u/denise/flyer-spring"));
});

test("denise-migration: a move she changed back leaves its folders where they are; one she folded in goes inside, as hers (migration.html C)", () => {
  const w = whereOf("denise-migration"), { r, places } = bakery();
  const j = judge({ places, order: [] }, r, { now: NOW }), all = places.map((p) => "w:" + p.path);
  const { batch, placed } = keepPlaces(w, j, all, NOW, [], { apart: ["w:/u/denise/flyer-spring"], into: { "w:/u/denise/events": "w:/u/denise/orders", "w:/u/denise/x": "w:/u/denise/x", "nope": "w:/u/denise/orders" } });
  assert.ok(!placed.some((p) => p.folder === "w:/u/denise/flyer-spring"), "left as it was: not on the shelf");
  assert.deepEqual(placed.find((p) => p.folder === "w:/u/denise/tax-2024")?.to, "shelf", "the rest of Sol's calls stand");
  const ev = placed.find((p) => p.folder === "w:/u/denise/events")!;
  assert.deepEqual([ev.to, ev.by, ev.batch, ev.why], ["w:/u/denise/orders", "person", batch, "you folded it into orders when moving in"]);
  assert.ok(!placed.some((p) => p.folder === "w:/u/denise/x" || p.folder === "nope"), "into itself or from a non-folder places nothing");
  // folded in and removed at once: removed wins, on the shelf as hers
  const w2 = whereOf("denise-migration-2"), two = keepPlaces(w2, j, all, NOW, ["w:/u/denise/events"], { into: { "w:/u/denise/events": "w:/u/denise/orders" } });
  assert.deepEqual(two.placed.filter((p) => p.folder === "w:/u/denise/events").map((p) => p.to), ["shelf"]);
  // the message's fields in one form, anything else dropped
  assert.deepEqual(migOf({ apart: ["/u/denise/menu", 3, ""], into: { "/u/denise/events": "/u/denise/orders", "w:/u/denise/staff": 7 } }), { apart: ["w:/u/denise/menu"], into: { "w:/u/denise/events": "w:/u/denise/orders" } });
  assert.deepEqual(migOf(null), { apart: [], into: {} });
});

// BR1 order 1: one folder list from the move-in to the canvas. The You read's apply kept bare paths, the move-in's
// rows "w:" ids: both are one id now, and keptFolders is the one list next.state carries
test("lucy-one-list: a bare path and its w: id are one folder; a removed one stays out after a reload", () => {
  const w = whereOf("lucy-one-list");
  assert.equal(folderId("/u/lucy/mac"), "w:/u/lucy/mac");
  assert.equal(folderId("w:/u/lucy/mac"), "w:/u/lucy/mac");
  assert.equal(folderId("h:health"), "h:health");
  keepMoveIn(w.sol, { keep: ["w:/u/lucy/api", "h:health", "/u/lucy/mac"], fix: { "/u/lucy/api": { name: "API" } }, drop: [] });
  // the You flow's Remove on mac, by its bare path
  keepMoveIn(w.sol, { drop: ["/u/lucy/mac"] });
  const m = readMoveIn(w.sol)!;   // read from disk: what a reload reads
  assert.deepEqual(m.keep, ["w:/u/lucy/api", "h:health"]);
  assert.deepEqual(m.drop, ["w:/u/lucy/mac"]);
  assert.deepEqual(keptFolders(m), [
    { id: "w:/u/lucy/api", name: "API", path: "/u/lucy/api" },
    { id: "h:health", name: "health" },
  ]);
  // kept again: back in the list
  keepMoveIn(w.sol, { keep: ["w:/u/lucy/mac"], drop: [] });
  assert.ok(keptFolders(readMoveIn(w.sol)).some((f) => f.id === "w:/u/lucy/mac" && f.name === "mac"));
  assert.deepEqual(keptFolders(null), []);
});
