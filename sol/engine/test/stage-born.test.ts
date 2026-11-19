// Born at the content's size (#821; work/blocks.ts): with the engine's switch stage.whole on, a block is not sized by
// its kind (SIZES). It is placed on the stage the face reported (`room`, written with work.stage.layout; 900×520 until
// then), in its band (`measure` or `wide`, a rule by kind until the judge is in, the face's own: sol/mac/src/stage/
// born.ts), at one starting height, marked `auto` so the face lays it out at its content's size and writes it back. The
// band survives the face's layout writes. With the switch off, every place is today's. All in a home and a settings
// file of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "sol-born-"));
const HOME = join(TMP, "home"), REPO = join(TMP, "repo");
mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(TMP, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SETTINGS = join(TMP, "settings.json");
delete process.env.SOL_STAGE_WHOLE;

const S = await import("../src/work/blocks.ts");

S.setStageBus(() => {});
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const whole = (v?: string) => { if (v === undefined) delete process.env.SOL_STAGE_WHOLE; else process.env.SOL_STAGE_WHOLE = v; };
const placeOf = (sid: string, id: string) => S.getStage(project, sid).blocks.find((p) => p.id === id)!;
const onDisk = (sid: string) => JSON.parse(readFileSync(join(HOME, project, "sessions", sid, "stage.json"), "utf8"));
const compose = (sid: string, kind: any, title = kind) => S.compose(who(sid), { kind, title, body: "{}", waits: true });
/** the face's layout write as Stage.tsx sends it: the whole stage it holds, its places as it laid them out (no band) */
const faceWrites = (sid: string, patch: Record<string, unknown> = {}, blocks?: any[]) => {
  const st = S.getStage(project, sid);
  return S.layout(project, sid, { ...st, ...patch, blocks: blocks ?? st.blocks.map(({ band: _b, auto: _a, ...p }: any) => p) } as any);
};
after(() => { S.disarmAll(); S.setStageBus(null); whole(undefined); rmSync(TMP, { recursive: true, force: true }); });

test("off: today's places, sized by kind on 900×520, no band, and a layout's room is not kept", () => {
  whole("off");
  try {
    const sid = "sess-born0001";
    faceWrites(sid, { room: { w: 1400, h: 800 } });
    assert.equal("room" in onDisk(sid), false, "the room is not written with the switch off");
    const t = compose(sid, "terminal");
    const p = placeOf(sid, t.id);
    assert.deepEqual([p.w, p.h, p.auto], [...S.SIZES.terminal, true]);
    assert.equal("band" in p, false);
    // the pins of today: no spot for what is too big; a slot on the nominal stage; a full stage tiles itself
    assert.equal(S.freeSpot(10_000, 10, []), null);
    assert.deepEqual(S.slotRect("full"), { x: S.PAD, y: S.PAD, w: S.STAGE_W - 2 * S.PAD, h: S.STAGE_H - 2 * S.PAD });
    const full = "sess-born0002";
    for (let i = 0; i < 6; i++) compose(full, "browser", `b${i}`);
    assert.equal(S.getStage(project, full).tiled, true);
  } finally { whole(undefined); }
});

test("on, with no room reported yet: placed in its band on 900×520, one starting height, auto", () => {
  whole("on");
  try {
    const sid = "sess-born0003";
    const t = compose(sid, "terminal"), l = compose(sid, "list");
    const pt = placeOf(sid, t.id), pl = placeOf(sid, l.id);
    assert.deepEqual([pt.band, pt.w, pt.h, pt.auto], ["wide", S.STAGE_W - 2 * S.PAD, S.BORN_H, true]);
    assert.deepEqual([pl.band, pl.w, pl.h, pl.auto], ["measure", S.MEASURE_W, S.BORN_H, true]);
    assert.equal(S.getStage(project, sid).room, undefined);
  } finally { whole(undefined); }
});

test("on, with a room of 1400×800: a terminal is wide (wider than 900), a list is at the measure, each kind by the face's rule", () => {
  whole("on");
  try {
    const sid = "sess-born0004";
    const st = faceWrites(sid, { room: { w: 1400, h: 800 } });
    assert.deepEqual(st.room, { w: 1400, h: 800 });
    assert.deepEqual(onDisk(sid).room, { w: 1400, h: 800 }, "kept in stage.json");
    const t = compose(sid, "terminal"), l = compose(sid, "list");
    const pt = placeOf(sid, t.id), pl = placeOf(sid, l.id);
    assert.equal(pt.band, "wide");
    assert.equal(pt.w, 1400 - 2 * S.PAD);
    assert.ok(pt.w > 900);
    assert.equal(pt.auto, true);
    assert.deepEqual([pl.band, pl.w, pl.auto], ["measure", 436, true], "the measure 412 and its two sides, as the face is born");
    assert.equal(S.MEASURE_W, 412 + 2 * 12);
    for (const k of S.KINDS) assert.equal(S.bandOf(k), k === "terminal" || k === "browser" || k === "shots" ? "wide" : "measure", k);
    // a slot is cut from the room too
    const r = S.compose(who(sid), { kind: "page", title: "left", body: "x", slot: "left", waits: true });
    const pr = placeOf(sid, r.id);
    assert.deepEqual([pr.slot, pr.h, pr.band], ["left", 800 - 2 * S.PAD, "measure"]);
    assert.deepEqual(S.slotRect("full", [], { w: 1400, h: 800 }), { x: S.PAD, y: S.PAD, w: 1400 - 2 * S.PAD, h: 800 - 2 * S.PAD });
  } finally { whole(undefined); }
});

test("on: placed inside 1400×800 where 900×520 has no room, and the stage is not tiled", () => {
  whole("on");
  try {
    const big = "sess-born0005", small = "sess-born0006";
    faceWrites(big, { room: { w: 1400, h: 800 } });
    for (let i = 0; i < 5; i++) { compose(big, "terminal", `t${i}`); compose(small, "terminal", `t${i}`); }
    const st = S.getStage(project, big);
    assert.equal(st.tiled, false, "five fit in the room the face reported");
    for (const p of st.blocks) {
      assert.ok(p.x >= S.PAD && p.y >= S.PAD && p.x + p.w <= 1400 - S.PAD && p.y + p.h <= 800 - S.PAD, JSON.stringify(p));
      assert.ok(!st.blocks.some((o) => o !== p && o.y < p.y + p.h && p.y < o.y + o.h), "none over another");
    }
    assert.ok(st.blocks.some((p) => p.y + p.h > 520 - S.PAD), "one sits where 900×520 has no room");
    assert.equal(S.getStage(project, small).tiled, true, "on 900×520 the same five tile");
  } finally { whole(undefined); }
});

test("on: a layout that writes a block three rows tall is read back as written; the band survives it, auto does not", () => {
  whole("on");
  try {
    const sid = "sess-born0007";
    faceWrites(sid, { room: { w: 1400, h: 800 } });
    const l = compose(sid, "list"), t = compose(sid, "terminal");
    const three = 34 + 3 * 25 + 35 + 12;   // the face's head, three rows, the list's foot, its foot (born.ts)
    faceWrites(sid, {}, S.getStage(project, sid).blocks.map(({ band: _b, auto: _a, ...p }) => (p.id === l.id ? { ...p, x: 40, y: 60, w: 436, h: three } : p)));
    const pl = placeOf(sid, l.id), pt = placeOf(sid, t.id);
    assert.deepEqual([pl.x, pl.y, pl.w, pl.h], [40, 60, 436, three]);
    assert.equal(pl.band, "measure", "a layout that names no band keeps it");
    assert.equal(pt.band, "wide");
    assert.equal(pl.auto, undefined, "the face's place is no longer the engine's guess");
    assert.equal(onDisk(sid).blocks.find((p: any) => p.id === t.id).band, "wide", "and it is on disk");
    assert.deepEqual(S.getStage(project, sid).room, { w: 1400, h: 800 }, "a layout that names no room keeps it");
    // a band the patch names is taken; one that is not a band leaves the one before
    faceWrites(sid, {}, S.getStage(project, sid).blocks.map((p) => (p.id === l.id ? { ...p, band: "wide" } : p.id === t.id ? { ...p, band: "huge" } : p)));
    assert.equal(placeOf(sid, l.id).band, "wide");
    assert.equal(placeOf(sid, t.id).band, "wide");
    faceWrites(sid, {}, S.getStage(project, sid).blocks.map((p) => (p.id === t.id ? { ...p, band: "measure" } : p)));
    assert.equal(placeOf(sid, t.id).band, "measure");
  } finally { whole(undefined); }
});

test("on: a room that is not a size changes nothing", () => {
  whole("on");
  try {
    const sid = "sess-born0008";
    faceWrites(sid, { room: { w: 1200, h: 700 } });
    for (const room of [{ w: -1, h: 700 }, { w: NaN, h: 700 }, { w: "1200", h: 700 }, { w: 1200 }, { w: 99_999, h: 700 }, { w: 10, h: 10 }, null, "big", 3])
      assert.deepEqual(faceWrites(sid, { room }).room, { w: 1200, h: 700 }, JSON.stringify(room));
    assert.deepEqual(faceWrites(sid, { room: { w: 1000.6, h: 600.2 } }).room, { w: 1001, h: 600 }, "whole pixels");
    // a room narrower than the measure: the measure is cut to it
    faceWrites(sid, { room: { w: 300, h: 600 } });
    const l = compose(sid, "list");
    assert.equal(placeOf(sid, l.id).w, 300 - 2 * S.PAD);
  } finally { whole(undefined); }
});

test("on: a project's own block comes folded at its band's size, not its kind's", () => {
  whole("on");
  try {
    const A = "sess-born0009", B = "sess-born0010";
    const src = join(TMP, "status.json");
    writeFileSync(src, JSON.stringify({ sessions: [] }));
    const l = S.compose(who(A), { kind: "list", title: "In the background" });
    S.bind(who(A), { id: l.id, source: src, watch: "run" });
    faceWrites(B, { room: { w: 1400, h: 800 } });
    const p = S.withProject(project, B).blocks.find((x) => x.id === l.id)!;
    assert.deepEqual([p.folded, p.auto, p.band, p.w, p.h], [true, true, "measure", 436, S.BORN_H]);
  } finally { whole(undefined); }
});

test("turned off again: a layout drops the band as today, and new places are sized by kind", () => {
  whole("on");
  const sid = "sess-born0011";
  faceWrites(sid, { room: { w: 1400, h: 800 } });
  const t = compose(sid, "terminal");
  assert.equal(placeOf(sid, t.id).band, "wide");
  whole("off");
  try {
    S.layout(project, sid, S.getStage(project, sid));
    assert.equal("band" in placeOf(sid, t.id), false);
    const c = compose(sid, "card");
    const p = placeOf(sid, c.id);
    assert.deepEqual([p.w, p.h], S.SIZES.card);
    assert.equal("band" in p, false);
  } finally { whole(undefined); }
});
