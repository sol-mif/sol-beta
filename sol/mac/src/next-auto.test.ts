// node --test src/*.test.ts: an automation is a piece (BR1 item 2, #1615; next/auto/model.ts, the wire cv/wire/work.ts):
// it sits in the folder it was made in, else the deepest folder it works in, else on the Work page only; the wire puts,
// moves and removes its piece with the list and the folders; its runs are read by the allowlist and said in words.
// Invented folders and paths only. Signed: marcocyl04-ux's agent (builder F), BR1 item 2 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAutos, sayLast, sayFiles, type Work } from "./next/work/read.ts";
import { canWatch, pieceId, sayRan, sayRun, stateOf, sync, TABLE, where } from "./next/auto/model.ts";
import { collect } from "./next/collection-state.ts";
import { add, WHEN } from "./next/auto/fixture.ts";
import { D, M, load, setMode } from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { attach } from "./next/cv/wire/work.ts";
import type { Piece, Region } from "./next/cv/types.ts";

const regions: Region[] = [
  { id: "w:/v/projects/kite", name: "kite", kind: "code", path: "/v/projects/kite" },
  { id: "w:/v/projects/kite/docs", name: "docs", kind: "code", path: "/v/projects/kite/docs" },
  { id: "h:garden", name: "garden", kind: "life" },
];
const auto = (id: string, more: Record<string, unknown> = {}) => ({ id, name: `Auto ${id}`, does: "do it", when: "every day at 08:00", on: true, made: 1, model: null, runs: 0, next: "today at 08:00", ...more });

test("an automation sits where it was made, else in the deepest folder it works in, else nowhere by guess", () => {
  assert.equal(where({ region: "h:garden", cwd: "/v/projects/kite" }, regions), "h:garden", "made in a folder: there");
  assert.equal(where({ region: null, cwd: "/v/projects/kite/docs/drafts" }, regions), "w:/v/projects/kite/docs", "the deepest folder it works in");
  assert.equal(where({ region: null, cwd: "/v/projects/kite" }, regions), "w:/v/projects/kite");
  assert.equal(where({ region: null, cwd: "/v/projects/kiteboard" }, regions), null, "a name that only starts the same is not inside");
  assert.equal(where({ region: "h:gone", cwd: null }, regions), null, "a folder no longer there, and nowhere it works: the Work page only");
});

test("the pieces follow the list: put in its folder, moved when it moves, removed when it goes, others untouched", () => {
  const d = { regions, pieces: { s1: { id: "s1", region: "h:garden", kind: "session", name: "a session", from: "work" } } as Record<string, Piece> };
  const [a, b, c] = cleanAutos({ autos: [auto("a1", { region: "h:garden" }), auto("a2", { cwd: "/v/projects/kite/src" }), auto("a3")] });
  assert.ok(sync(d, [a, b, c]));
  assert.equal(d.pieces[pieceId("a1")].region, "h:garden");
  assert.equal(d.pieces[pieceId("a1")].kind, "row", "the plane's kind for an automation");
  assert.equal(d.pieces[pieceId("a2")].region, "w:/v/projects/kite");
  assert.equal(d.pieces[pieceId("a3")], undefined, "no folder: no piece");
  assert.equal(sync(d, [a, b, c]), false, "nothing changed");
  assert.ok(sync(d, [{ ...a, region: "w:/v/projects/kite/docs" }]));
  assert.equal(d.pieces[pieceId("a1")].region, "w:/v/projects/kite/docs");
  assert.equal(d.pieces[pieceId("a2")], undefined, "gone from the list: its piece goes");
  assert.ok(d.pieces.s1, "a session's piece is the plane's, never touched");
});

test("the session's first words give the time: the drawing's sentence, a clock, an event; a word that only starts like one is not", () => {
  const at = (s: string) => WHEN.exec(s)?.[0].trim() ?? null;
  assert.equal(at("check every menu's prices each Monday"), "each Monday");
  assert.equal(at("look at the test runs every 30 min"), "every 30 min");
  assert.equal(at("sum up the week on Friday at 17:00"), "on Friday at 17:00");
  assert.equal(at("sort the file when a new file comes into inbox/"), "when a new file comes into inbox/");
  assert.equal(at("tidy every folder"), null, "no time: the session asks");
});

test("an automation made in a session lives on that session's table, never loose on the canvas (birth.html row 5)", () => {
  const d = { regions, pieces: {} as Record<string, Piece> };
  const [a] = cleanAutos({ autos: [auto("a1", { region: "h:garden" })] });
  assert.equal(a.in, undefined, "made on its own: no session");
  assert.equal(cleanAutos({ autos: [auto("a2", { in: "5f0c-sid" })] })[0].in, "5f0c-sid", "the engine's in is kept");
  assert.ok(sync(d, [a]));
  assert.ok(sync(d, [{ ...a, in: "st-1" }]), "made in a session: its canvas piece goes");
  assert.equal(d.pieces[pieceId("a1")], undefined);
});

test("its runs are read by the allowlist and said: when, how it went, why it ran", () => {
  const now = new Date(2026, 10, 21, 12, 0).getTime(), at = new Date(2026, 10, 21, 10, 42).getTime(), y = new Date(2026, 10, 20, 8, 0).getTime();
  const [a] = cleanAutos({ autos: [auto("a1", {
    when: "when a new file comes into inbox/", region: "h:garden", cwd: "relative/not/a/path", seen: ["x"],
    last: { at, sessionId: "run-1", state: "working", how: "event", files: ["inbox/seed-order.pdf"] },
    ran: [{ at, sessionId: "run-1", state: "working", how: "event", files: ["inbox/seed-order.pdf"] }, { at: y, sessionId: "run-0", state: "done", how: "now" }, { at: "bad" }],
  })] });
  assert.equal(a.cwd, null, "a path that is not one is dropped");
  assert.equal((a as unknown as Record<string, unknown>).seen, undefined);
  assert.equal(a.ran.length, 2, "a run without its time is not read");
  assert.equal(sayRun(a.ran[0], now), "10:42 · Working · seed-order.pdf came in");
  assert.equal(sayRun(a.ran[1], now), "Yesterday 08:00 · Done · you pressed Run now");
  assert.equal(stateOf(a).say, "Working now");
  assert.match(sayLast(a), /when seed-order\.pdf came in · Working$/);
  assert.equal(sayFiles(["a/one.txt", "b/two.txt", "c.txt"]), "3 new files");
  const [p] = cleanAutos({ autos: [auto("a2", { on: false })] });
  assert.equal(stateOf(p).say, "Paused");
  const [e] = cleanAutos({ autos: [auto("a3", { when: "when a new file comes in" })] });
  assert.equal(stateOf(e).say, "Watching for new files");
  const [o] = cleanAutos({ autos: [auto("a4", { last: { at, sessionId: "run-9", state: "done", how: "clock" } })] });
  assert.equal(o.ran.length, 1, "an engine without `ran` still shows its last run");
});

test("the wire puts the engine's automations on the plane, in their folders, and again when the folders come", async () => {
  load("dev-morning");
  setMode("live");
  let hear: (m: unknown) => void = () => {};
  const off = attach({ send: () => true, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    const [r0, r1] = D.regions.map((r) => r.id);
    hear({ type: "next.autos", autos: [auto("auto-1", { region: r0 }), auto("auto-2", { region: "w:/later/folder" })] });
    assert.equal(D.pieces[pieceId("auto-1")]?.region, r0);
    assert.equal(D.pieces[pieceId("auto-2")], undefined, "its folder is not here yet");
    D.regions.push({ id: "w:/later/folder", name: "folder", kind: "code", path: "/later/folder" });
    hear({ type: "work.sessions", sessions: [], projects: [] });
    await new Promise((r) => queueMicrotask(() => r(null)));
    assert.equal(D.pieces[pieceId("auto-2")]?.region, "w:/later/folder", "the folder came: its automation is put in it");
    hear({ type: "next.autos", autos: [auto("auto-1", { region: r1 })] });
    assert.equal(D.pieces[pieceId("auto-1")]?.region, r1);
    assert.equal(D.pieces[pieceId("auto-2")], undefined);
    assert.equal((D.work as Work).autos.length, 1);
  } finally { if (typeof off === "function") off(); setMode("fixture"); }
});

test("Add's maker (BR1 item 3): an event watches only a folder on the disk; one made is paused, named from its words, and sits where it was made", () => {
  assert.ok(canWatch(regions[0]), "a folder with a path can be watched");
  assert.ok(canWatch({ id: "w:/v/projects/kite", name: "kite", kind: "code" }), "its path read from its id");
  assert.equal(canWatch(regions[2]), false, "a life place has no folder on the disk");
  assert.equal(canWatch(null), false);
  load("dev-morning");
  const rid = D.regions[0].id;
  assert.equal(add({ does: "", when: "every day at 08:00", region: rid }), false, "nothing to do: nothing made");
  assert.ok(add({ does: "Read each new file. Then file it.", when: "when a new file comes in", region: rid }));
  const made = (D.work as Work).autos.at(-1)!;
  assert.equal(made.on, false, "made paused");
  assert.equal(made.name, "Read each new file", "named from its first words, as the engine names it");
  assert.equal(D.pieces[pieceId(made.id)]?.region, rid, "its piece is in the folder it was made in");
});

test("Add's Automation (birth.html row 5): a session, not a form; its first words make it, paused, on that session's table", () => {
  load("dev-morning");
  const rid = D.regions[0].id, had = ((D.work as Work | undefined)?.autos ?? []).length;
  const s = M.start({ region: rid, purpose: "automation", now: false });
  const p = D.pieces[s.id!];
  assert.equal(p.kind, "starter");
  assert.equal(p.purpose, "automation", "the starter knows what it is for");
  p.words = "check every menu's prices each Monday";
  M.start(s.id!, { force: true });
  const autos = (D.work as Work).autos, made = autos.at(-1)!;
  assert.equal(autos.length, had + 1, "one made");
  assert.equal(made.in, s.id, "it lives in the session it was made in");
  assert.equal(made.when, "each Monday");
  assert.equal(made.on, false, "made paused");
  assert.equal(D.pieces[pieceId(made.id)], undefined, "on its table, not loose on the canvas");
  assert.match(String(D.pieces[s.id!].talk?.at(-1)), /paused/, "the session says it made it, paused");
});

test("a session's table is the one list: on or never turned on is drawn, newest first; paused after it ran is counted", () => {
  const a = (id: string, made: number, on: boolean, runs: number) => ({ id, name: id, does: id, when: "each Monday", on, made, model: null, last: runs ? { at: made + 1, sessionId: "s", state: "done" as const, how: "clock" as const, files: [] } : null, runs, next: "", region: null, cwd: null, ran: [], in: "s" });
  const c = collect([a("old", 1, true, 4), a("new", 3, false, 0), a("stopped", 2, false, 5)], TABLE, 10);
  assert.deepEqual(c.drawn.map((x) => x.id), ["new", "old"], "the just-made one waiting for Turn on comes first, then the one that is on");
  assert.deepEqual(c.rest.map((x) => x.id), ["stopped"], "paused after it ran: in the count line");
});

test("its runs' head says when it last ran, then how many in all (BR1 item 2)", () => {
  const now = new Date(2026, 0, 14, 12, 0).getTime(), last = (h: number, d = 14) => ({ at: new Date(2026, 0, d, h, 5).getTime() }) as never;
  assert.equal(sayRan({ runs: 14, last: last(9) }, now), "This automation last ran at 09:05 · 14 runs in all");
  assert.equal(sayRan({ runs: 1, last: last(9, 13) }, now), "This automation last ran yesterday at 09:05 · 1 run in all");
  assert.match(sayRan({ runs: 2, last: last(9, 10) }, now), /^This automation last ran [A-Z][a-z]{2} at 09:05 · 2 runs in all$/, "earlier: its weekday");
  assert.equal(sayRan({ runs: 3, last: null }, now), "This automation ran 3 times", "no last run read: the count alone");
});
