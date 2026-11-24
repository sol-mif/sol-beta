// node --test src/*.test.ts: the archived folders (BR1 item 7, #1615; next/shelf/model.ts, Sessions › Archived in
// holders/Holders.tsx): the awake ones first, who put each there and why, Bring back (live by next.shelf.take, its answer
// redraws), and the engine asked again after a move-in's keep or Back. Invented folders only (Denise's bakery, Dev's code).
// Signed: marcocyl04-ux's agent (builder P; the Archive words builder HO), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FIXTURE, attach, heard, inOrder, lineOf, reset, shelfNow, shelvedOf, takeBack } from "./next/shelf/model.ts";
import { isOff } from "./next/plane/layout.ts";
import { bindLine, type Line } from "./next/bar/undo.ts";

type Sent = Record<string, unknown>;
const fakeEngine = (sent: Sent[], subs: ((m: Sent) => void)[]) => ({ send: (m: Sent) => { sent.push(m); return true; }, subscribe: (f: (m: Sent) => void) => { subs.push(f); return () => {}; } }) as never;

test("fixture: the awake one first, each says who put it there and why, Bring back takes it out of Archived here", () => {
  reset(); CV.setMode("fixture");
  const s = shelfNow();
  assert.equal(s.n, FIXTURE.length);
  assert.equal(inOrder(s.shelf)[0].name, "hackathon-demo", "changed since: proposed back, first");
  assert.match(lineOf(s.shelf[0]), /^Changed since it was archived, .*Bring it back\?$/);
  assert.match(lineOf(FIXTURE[1]), /^You put it here/);
  assert.match(lineOf(FIXTURE[2]), /^Sol put it here.*: it was changed on one day only/);
  takeBack("h:flyer-draft");
  assert.equal(shelfNow().n, FIXTURE.length - 1);
  assert.ok(!shelfNow().shelf.some((x) => x.folder === "h:flyer-draft"));
  reset();
});

test("live: the engine's next.shelf is what is archived; Bring back sends next.shelf.take; a keep or a Back asks again", () => {
  reset(); CV.setMode("live");
  const sent: Sent[] = [], subs: ((m: Sent) => void)[] = [];
  const off = attach(fakeEngine(sent, subs));
  try {
    assert.deepEqual(sent, [{ type: "next.shelf" }], "asked once on attach");
    assert.equal(shelfNow().n, 0, "nothing heard yet: nothing archived, never the fixture's");
    const denise = { folder: "w:/Users/you/bakery/xmas-2024", name: "xmas-2024", by: "sol", why: "it was changed on one day only", at: "2026-11-20T09:00:00.000Z", batch: "movein-d1" };
    subs.forEach((f) => f({ type: "next.shelf", shelf: [denise, { nope: 1 }], n: 2, awake: [] }));
    assert.equal(shelfNow().n, 1, "a malformed entry is not an archived folder");
    takeBack(denise.folder);
    assert.deepEqual(sent.at(-1), { type: "next.shelf.take", folder: denise.folder });
    assert.equal(shelfNow().n, 0, "live, out of Archived at once (BR1 hold H1); the engine's answer confirms it");
    subs.forEach((f) => f({ type: "next.shelf", shelf: [], n: 0, awake: [] }));
    assert.equal(shelfNow().n, 0);
    sent.length = 0;
    subs.forEach((f) => f({ type: "next.movein.kept", ok: true, batch: "movein-d1", undone: [] }));
    assert.deepEqual(sent, [{ type: "next.shelf" }]);
    assert.equal(heard({ type: "next.placed" }), false);
  } finally { off(); CV.setMode("fixture"); reset(); }
});

// BR1 order 2: Archive does what its line says, at once and after a reload
test("live: ⋯ Archive puts a folder in Archived (next.shelf.put), off the canvas while it is archived; Undo brings it back", () => {
  reset(); CV.setMode("fixture"); CV.load("denise");
  const r = CV.D.regions.find((x) => !CV.parentOf(x.id))!;
  CV.setMode("live");
  const sent: Sent[] = [], subs: ((m: Sent) => void)[] = [];
  const off = attach(fakeEngine(sent, subs));
  try {
    const done = CV.M.offCanvas(r.id) as { ok: boolean; undo?: () => void };
    assert.ok(done.ok);
    assert.deepEqual(sent.at(-1), { type: "next.shelf.put", folder: r.id, name: r.name });
    assert.ok(isOff(r.id), "off at once");
    // the engine's answer, as on a reload: it is archived, so it stays off though this session's off is forgotten
    subs.forEach((f) => f({ type: "next.shelf", shelf: [{ folder: r.id, name: r.name, by: "person", why: "you put it there", at: "2026-11-22T07:00:00.000Z" }], n: 1, awake: [] }));
    assert.equal(shelfNow().n, 1, "Archived counts it");
    assert.ok(isOff(r.id), "archived: not on the canvas");
    done.undo!();
    assert.deepEqual(sent.at(-1), { type: "next.shelf.take", folder: r.id });
    assert.ok(!isOff(r.id), "undone: drawn at once, before the engine answers");
    subs.forEach((f) => f({ type: "next.shelf", shelf: [], n: 0, awake: [] }));
    assert.ok(!isOff(r.id), "taken back: drawn at once, no reload");
  } finally { off(); CV.setMode("fixture"); reset(); }
});

// BR1 hold H1 (try 4's first-timer): ⋯ → Archive → Bring back left the folder off the canvas until a reload, and the
// "… is archived · Undo" line up. Archived's own Bring back brings it where it was, and the line goes
test("live: Archived's Bring back brings the folder back where it was at once, and the Undo line about it goes", () => {
  reset(); CV.setMode("fixture"); CV.load("denise");
  const r = CV.D.regions.find((x) => !CV.parentOf(x.id))!, at = { ...CV.D.pos![r.id] };
  CV.setMode("live");
  const sent: Sent[] = [], subs: ((m: Sent) => void)[] = [], lines: (Line | null)[] = [];
  const off = attach(fakeEngine(sent, subs));
  bindLine((l) => lines.push(l));
  try {
    assert.ok((CV.M.offCanvas(r.id) as { ok: boolean }).ok);
    assert.ok(isOff(r.id), "off at once, before the engine answers");
    assert.match(lines.at(-1)?.words ?? "", /is archived\. It’s in Sessions › Archived; nothing was deleted$/);
    subs.forEach((f) => f({ type: "next.shelf", shelf: [{ folder: r.id, name: r.name, by: "person", why: "you put it there", at: "2026-11-22T07:00:00.000Z" }], n: 1, awake: [] }));
    takeBack(r.id);   // Archived's row, not the Undo
    assert.ok(!isOff(r.id), "back on the canvas at once, no reload");
    assert.deepEqual({ x: CV.D.pos![r.id].x, y: CV.D.pos![r.id].y }, { x: at.x, y: at.y }, "where it was");
    assert.equal(lines.at(-1), null, "the archived line goes with it");
    assert.deepEqual(sent.at(-1), { type: "next.shelf.take", folder: r.id });
    subs.forEach((f) => f({ type: "next.shelf", shelf: [], n: 0, awake: [] }));
    assert.ok(!isOff(r.id));
  } finally { bindLine(null); off(); CV.setMode("fixture"); reset(); }
});

test("fixture: ⋯ Archive on a folder lands it in Archived as the person's", () => {
  reset(); CV.setMode("fixture"); CV.load("denise");
  const r = CV.D.regions.find((x) => !CV.parentOf(x.id))!, n = shelfNow().n;
  assert.ok((CV.M.offCanvas(r.id) as { ok: boolean }).ok);
  assert.equal(shelfNow().n, n + 1);
  assert.equal(shelfNow().shelf[0].folder, r.id);
  assert.match(lineOf(shelfNow().shelf[0]), /^You put it here/);
  takeBack(r.id);
  assert.ok(!isOff(r.id), "taken back: on the canvas at once");
  reset();
});

test("a Diary move-in line has Bring back while its folder is archived, and only then (BR1 first-timer 4, builder F)", () => {
  const shelf = [...FIXTURE], f = FIXTURE[0].folder;
  assert.equal(shelvedOf(`movein:Ada:${f}`, shelf), f);
  assert.equal(shelvedOf(`movein:Ada:${f}`, shelf.filter((x) => x.folder !== f)), null);
  assert.equal(shelvedOf("movein:Ada", shelf), null);
  assert.equal(shelvedOf(`ask:${f}`, shelf), null);
  assert.equal(shelvedOf(null, shelf), null);
});

test("archive has one word (BR1 1b, holders.html): a folder's ⋯ says Archive, as its line does; the empty Archived never says hide", () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  const menu = src("./next/plane/Pieces.tsx"), holders = src("./next/holders/Holders.tsx"), line = src("./next/cv/moves/plane.ts");
  assert.match(menu, /\{r \? "Archive" : "Take off the canvas"\}/, "a folder's menu item; a piece still leaves the canvas only");
  assert.match(line, /`\$\{name\} is archived\. It’s in Sessions › Archived; nothing was deleted`/);
  const empty = /(?:className="hd-none">|none\(")(Nothing archived[^<"]*)/.exec(holders)?.[1] ?? "";
  assert.match(empty, /Archive on a session or a folder puts it here/);
  assert.doesNotMatch(empty, /hid/i);
  // the word "Shelf" is gone from what a person reads: the sidebar's row with it (holders.html: no Archived row, no Shelf)
  for (const f of ["./next/plane/Pieces.tsx", "./next/cv/moves/plane.ts", "./next/movein/index.tsx", "./next/movein/data.ts", "./next/Next.tsx", "./next/holders/Holders.tsx",
    "./next/shelf/model.ts", "./next/because/dev.tsx", "./next/because/fixture.ts", "./next/because/place.ts", "./next/diary/index.tsx"]) {
    const said = [...src(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, "").matchAll(/"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g)].map((m) => m[0]).join("\n");
    assert.doesNotMatch(said, /\bShelf\b|\b(on|from|off) the shelf\b/, `${f} says Shelf`);
  }
});
