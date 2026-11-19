// node --test src/*.test.ts: Home and Build, one place, on HIS Home (#1045). With `cross` off nothing in his folders
// changes: no row of his Home is liftable, no "made in Build" is drawn, the board's stickies are only their presses. With
// it on, a thing of a class or a job carries its folder's path and what the folder knows, and the shelf by the spine
// offers his own folders (school and its classes, jobs and each job).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
test("the shelf and a seat read his folders", async () => {
  const { foldersOf, pathIn, knowsIn, liftIn } = await import("./cross/folderList.ts");
  // his lists, as la245.ts has them (shortened)
  const classes = [{ id: "la245", name: "LA245", who: "Business Law · Lomax", read: [] }, { id: "is223", name: "IS223", who: "Information Systems · Wiles", read: ["Prof. Wiles · Blackboard, October"] }];
  const jobs = [{ name: "SF trip", said: "a trip to SF for Thanksgiving", ask: "Which days?" }];
  const list = foldersOf(classes, jobs);
  assert.deepEqual(list.map((f) => f.id), ["school", "la245", "is223", "jobs", "jobs.SF trip"]);
  assert.equal(pathIn(list, "la245"), "school › LA245");
  assert.equal(pathIn(list, "jobs.SF trip"), "jobs › SF trip");
  assert.deepEqual(knowsIn(classes, jobs, "is223").map((k) => k.label), ["Information Systems · Wiles", "Prof. Wiles · Blackboard, October"]);
  assert.deepEqual(knowsIn(classes, jobs, "jobs.SF trip").map((k) => k.kind), ["you said", "asks"]);
  assert.equal(liftIn(false, "school › IS223", [], "is223", "Prof. Wiles", "fact"), undefined);
  const l = liftIn(true, "school › IS223", knowsIn(classes, jobs, "is223"), "is223", "Prof. Wiles · Blackboard, October", "fact");
  assert.deepEqual([l?.thing.place, l?.thing.path, l?.thing.knows?.length, l?.mark], ["is223", "school › IS223", 2, "fact"]);
  // #1223: bound to the record's areas (told by the record's Home), never a constant list, and the shelf draws them
  assert.doesNotMatch(read("./cross/folders.ts"), /from "\.\.\/home\/folders\/la245"|HIS_LISTS =/);
  assert.match(read("./onboard/OneHome.tsx"), /setHomeFolders\(rec\.areas\)/);
  assert.match(read("./cross/CrossLayer.tsx"), /const list = useHomeFolders\(\);[\s\S]*return <ShelfOf list=\{list\} \/>/);
});

test("his Build takes it too: his stage's drag meets the shelf, his box takes a piece, a session row's drag seats", async () => {
  const stage = read("./stage/Stage.tsx"), composer = read("./work/Composer.tsx"), shelf = read("./cross/shelf.ts");
  // #1090: at a seam toward another window the throw wins; with screens off there is no seam (seams() is []), so the
  // folder on the shelf is asked first exactly as before
  assert.match(stage, /row = nearSeam\(ev\.clientX, ev\.clientY\) \? null : folderAt\(\{ x: ev\.clientX, y: ev\.clientY \}, \{ id: b\.id, title: b\.title \}\) \?\? rowAt/);
  // the seam rests on seams() alone, and seams() is [] while the switch is off (off by default; throw.ts's bare
  // "./flag" import keeps node from loading it, so its guard is read as the screens test reads it)
  const thrown = read("./screens/throw.ts");
  assert.match(thrown, /export function seams\(\): SeamAt\[\] \{\s*if \(!screensOn\(\)\) return \[\];/);
  assert.match(thrown, /export function nearSeam\([^)]*\): boolean \{[^}]*return !!edge && seams\(\)\.some\(/);
  assert.equal((await import("./screens/flag.ts")).screensOn(), false);
  assert.match(stage, /isHomeRow\(row\)\) \{[\s\S]{0,200}seat\(\{ id: b\.id, title: b\.title \}, session/);
  assert.match(composer, /const crossBox = crossOn && !clean;/);
  assert.match(composer, /\.\.\.\(crossBox \? \{ "data-cross-drop": "talk" \} : \{\}\)/);
  // the session's drag is the side's own; the shelf only hears it while cross is on
  assert.match(shelf, /if \(!crossOn\(\) \|\| !carriesSession\(ev\.dataTransfer\)\) return;/);
  assert.match(shelf, /if \(!held \|\| !crossOn\(\)\) return;/);
});

// #1502: a window that opens in Build never mounts OneHome, which tells the shelf its folders; with cross on, the layer
// over every view reads the record itself once, so the shelf has the person's folders without a visit to Home
test("defect: with cross on, a window that opens in Build has the record's folders on the shelf", async () => {
  (globalThis as { window?: unknown }).window ??= globalThis;
  const { shelfFromRecord, homeFolders, folderName } = await import("./cross/folders.ts");
  
  assert.equal(homeFolders().length, 0);
  const rec = { built: true, areas: [{ id: "school", name: "school", part: "work" }, { id: "rent", name: "rent", part: "home", said: "the flat" }] };
  const subs = new Set<(m: unknown) => void>();
  const asked: { type?: string; path?: string }[] = [];
  const wire = { up: true, subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => { subs.delete(f); }; },
    send: (o: object) => { const q = o as { rid: string; type?: string; path?: string }; asked.push(q); queueMicrotask(() => subs.forEach((f) => f({ rid: q.rid, text: JSON.stringify(rec) }))); return true; } };
  await shelfFromRecord(wire);
  assert.deepEqual([asked[0]?.type, asked[0]?.path], ["work.read", ".sol/record/me.json"]);
  assert.deepEqual(homeFolders().map((f) => f.id), ["school", "rent"]);
  assert.equal(folderName("rent"), "rent");
  assert.match(read("./App.tsx"), /\{cross && <CrossLayer e=\{e\} \/>\}/, "App does not give the layer the engine");
});
