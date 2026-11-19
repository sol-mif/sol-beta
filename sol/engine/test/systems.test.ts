// The system stage block's engine side (#1091, sol/engine/src/work/systems.ts): the lane a record stands in, the order
// of a lane, the ring read from a record, the area's members, the watch that tells the face a record changed, and the
// history that replays the area from git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { areaView, dropFace, factsFor, MAX_SHOWN, shownAreas, systemsMsg, watching, factsOf, history, nextTick, tokensOf, layerOf, partsOf, readRecords, readRegistry, ringOf, saneRec, watchRecords, weightOf, wiresOf, lensError, systemBodyError, type Rec } from "../src/work/systems.ts";

const rec = (id: string, more: Partial<Rec> = {}): Rec => ({
  id, name: id, about: `${id}, for a test`, parent: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "jelly", kind: "doc", owner: "marcocyl04-ux",
  state: "live", where: {}, feeds: [], fed_by: [], health: [], ...more,
});
const map = (...rs: Rec[]) => new Map(rs.map((r) => [r.id, r]));

test("a record's own layer wins; else its kind suggests one, marked guessed; an area or a machine has none", () => {
  assert.deepEqual(layerOf({ kind: "doc", layer: "why" }), { layer: "why", guessed: false });
  assert.deepEqual(layerOf({ kind: "doc" }), { layer: "rules", guessed: true });
  assert.deepEqual(layerOf({ kind: "practice" }), { layer: "rules", guessed: true });
  assert.deepEqual(layerOf({ kind: "store" }), { layer: "source", guessed: true });
  for (const k of ["tool", "service", "timer", "check"]) assert.deepEqual(layerOf({ kind: k }), { layer: "machine", guessed: true });
  for (const k of ["part", "channel"]) assert.deepEqual(layerOf({ kind: k }), { layer: "surface", guessed: true });
  assert.equal(layerOf({ kind: "area" }), null);
  assert.equal(layerOf({ kind: "machine" }), null);
  assert.deepEqual(layerOf({ kind: "area", layer: "surface" }), { layer: "surface", guessed: false });
  assert.deepEqual(layerOf({ kind: "store", layer: "nonsense" }), { layer: "source", guessed: true });   // the check refuses it; the block guesses
});

test("a feed is one wire whichever side names it", () => {
  const w = wiresOf(map(rec("a", { feeds: ["b"] }), rec("b", { fed_by: ["a"] }), rec("c", { fed_by: ["b"] })));
  assert.deepEqual(w, [["a", "b"], ["b", "c"]]);
});

test("weight is Σ 0.5^(d-1) over every system downstream, each counted once at its nearest", () => {
  const w: [string, string][] = [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["d", "e"], ["e", "a"]];
  // from a: b, c at 1 (1 + 1), d at 2 (.5), e at 3 (.25); a itself is never counted
  assert.equal(weightOf("a", w), 2.75);
  assert.equal(weightOf("e", w), 1 + 0.5 + 0.5 + 0.25);   // a at 1, b and c at 2, d at 3
  assert.equal(weightOf("z", w), 0);
});

test("a lane is ordered by weight, heaviest first, lane by lane left to right", () => {
  const v = areaView(map(
    rec("design", { kind: "area", parent: "jelly" }),
    rec("design/a", { layer: "why", feeds: ["design/b"] }),
    rec("design/b", { layer: "rules", feeds: ["design/c", "design/d"] }),
    rec("design/c", { layer: "rules", feeds: ["design/d"] }),
    rec("design/d", { layer: "surface" }),
  ), "design");
  assert.deepEqual(v.tiles.map((t) => t.id), ["design/a", "design/b", "design/c", "design/d"]);
  assert.deepEqual(v.tiles.map((t) => t.weight), [2, 2, 1, 0]);
});

test("the ring is read from the record: probe, owner, decided, paths, a check that feeds it", () => {
  const recs = map(
    rec("t", { health: [{ path: "x" }], decided: "sol/design/root.md:3", where: { paths: ["sol/design/system/tokens.json"] } }),
    rec("lint", { kind: "check", feeds: ["t"] }),
    rec("u", { owner: "" }),
    rec("v", { fed_by: ["lint"] }),
  );
  assert.deepEqual(ringOf(recs.get("t")!, recs), { signal: true, owner: true, decision: true, change: true, check: true });
  assert.deepEqual(ringOf(recs.get("u")!, recs), { signal: false, owner: false, decision: false, change: false, check: false });
  assert.equal(ringOf(recs.get("v")!, recs).check, true);   // fed_by counts the same
});

test("the area: its own systems and those wired to them one hop out; legacy and unwired ones are not drawn", () => {
  const v = areaView(map(
    rec("design", { kind: "area", parent: "jelly" }),
    rec("design/tokens", { kind: "store", feeds: ["face/kit"], gaps: [{ to: "marketing/site", why: "the site draws its own colours" }] }),
    rec("design/old", { state: "legacy", feeds: ["design/tokens"] }),
    rec("design/alone"),
    rec("design/said", { layer: "why" }),
    rec("face", { kind: "area", parent: "jelly", feeds: ["design/tokens"] }),
    rec("face/kit", { kind: "part", feeds: ["product"] }),
    rec("product", { kind: "area", parent: "jelly" }),
    rec("marketing/site", { kind: "channel", parent: "jelly" }),
    rec("far", { feeds: ["face/kit"] }),
  ), "design");
  assert.deepEqual(v.tiles.map((t) => [t.id, t.layer, t.guessed, t.inArea]), [
    ["design/said", "why", false, true],
    ["design/tokens", "source", true, true],
    ["face/kit", "surface", true, false],
    ["marketing/site", "surface", true, false],
  ]);
  assert.deepEqual(v.wires, [["design/tokens", "face/kit"]]);   // face is an area (no lane), far and product are two hops
  assert.deepEqual(v.gaps, [{ from: "design/tokens", to: "marketing/site", why: "the site draws its own colours" }]);
  assert.deepEqual(v.loose, [{ id: "design/alone", name: "design/alone" }]);
  assert.equal(v.legacy, 1);
});

test("a gap that has become a wire is drawn as the wire alone", () => {
  const v = areaView(map(
    rec("design", { kind: "area", parent: "jelly" }),
    rec("design/tokens", { kind: "store", feeds: ["design/site"], gaps: [{ to: "design/site", why: "old news" }] }),
    rec("design/site", { kind: "channel" }),
  ), "design");
  assert.deepEqual(v.gaps, []);
  assert.deepEqual(v.wires, [["design/tokens", "design/site"]]);
});

const scratch = () => realpathSync(mkdtempSync(join(process.env.TMPDIR || tmpdir(), "systems-block-")));   // macOS: /var is a link, and git compares real paths (#1258)
const put = (dir: string, r: Rec) => { const f = join(dir, `${r.id}.json`); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, JSON.stringify(r, null, 2)); };

/** wait until `ok` holds, up to two seconds (a watch's timing is the machine's, never the test's) */
const until = async (ok: () => boolean) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); return ok(); };
type Told = { type?: string; area: string; view: { tiles: { id: string }[] } };
const ids = (m: Told) => m.view.tiles.map((t) => t.id).join(" ");

test("a record that changes on disk goes to the face showing its area, with the new view", async () => {
  const d = scratch();
  put(d, rec("jelly", { kind: "area", parent: null }));
  put(d, rec("design", { kind: "area" }));
  put(d, rec("design/root", { layer: "why" }));
  process.env.SOL_SYSTEMS_RECORDS = d;
  const face = { sent: [] as any[], send(m: object) { this.sent.push(m); } };
  try {
    await systemsMsg(face, { type: "work.systems.area", rid: 1, area: "design" });
    assert.deepEqual(face.sent[0].view.tiles.map((t: { id: string }) => t.id), ["design/root"]);
    assert.ok(watching(d), "the first face that shows an area arms the watch");
    put(d, rec("design/brand", { layer: "why", feeds: ["design/root"] }));
    put(d, rec("design/root", { layer: "why", fed_by: ["design/brand"] }));
    const told = () => face.sent.filter((m) => m.type === "work.systems.changed") as Told[];
    assert.ok(await until(() => told().some((m) => ids(m) === "design/brand design/root")), "the face hears the new view");
    assert.ok(told().every((m) => m.area === "design"));
  } finally { dropFace(face); delete process.env.SOL_SYSTEMS_RECORDS; rmSync(d, { recursive: true, force: true }); }
});

test("a tell that throws, or a record broken mid-write, never stops the watch: the next change is still told", async () => {
  const d = scratch();
  put(d, rec("design", { kind: "area" }));
  put(d, rec("design/root", { layer: "why" }));
  process.env.SOL_SYSTEMS_RECORDS = d;
  const face = { send() {} };
  const got: Told[] = [];
  let stop = () => {};
  try {
    await systemsMsg(face, { type: "work.systems.area", rid: 1, area: "design" });
    let n = 0;
    stop = watchRecords((m) => { n++; if (n === 1) throw new Error("a face in trouble"); got.push(m); }, d);
    writeFileSync(join(d, "design", "broken.json"), "{ half");
    assert.ok(await until(() => n >= 1), "the first tick came");
    put(d, rec("design/tokens", { layer: "source", fed_by: ["design/root"] }));
    assert.ok(await until(() => got.some((m) => ids(m) === "design/root design/tokens")), "a later tick is told");
    assert.ok(got.at(-1)!.view && (got.at(-1) as unknown as { view: { loose: { name: string }[] } }).view.loose.some((l) => l.name === "design/broken (unreadable)"));
  } finally { stop(); dropFace(face); delete process.env.SOL_SYSTEMS_RECORDS; rmSync(d, { recursive: true, force: true }); }
});

test("a face that leaves lets its areas go and the watch stops; a face that asks again (its socket back) arms it again", async () => {
  const d = scratch();
  put(d, rec("design", { kind: "area" }));
  put(d, rec("design/root", { layer: "why" }));
  process.env.SOL_SYSTEMS_RECORDS = d;
  const a = { sent: [] as any[], send(m: object) { this.sent.push(m); } };
  try {
    await systemsMsg(a, { type: "work.systems.area", rid: 1, area: "design" });
    assert.ok(watching(d) && shownAreas().includes("design"));
    dropFace(a);
    assert.equal(watching(d), false, "nobody shows an area: the watch stops");
    assert.deepEqual(shownAreas(), []);
    await systemsMsg(a, { type: "work.systems.area", rid: 2, area: "design" });
    assert.ok(watching(d), "the ask again re-arms it");
    put(d, rec("design/brand", { layer: "why", feeds: ["design/root"] }));
    assert.ok(await until(() => a.sent.some((m) => m.type === "work.systems.changed")), "and the face hears the change");
  } finally { dropFace(a); delete process.env.SOL_SYSTEMS_RECORDS; rmSync(d, { recursive: true, force: true }); }
});

test("at most MAX_SHOWN areas are held, and history is answered only for an area that exists", async () => {
  const d = scratch();
  put(d, rec("jelly", { kind: "area", parent: null }));
  for (let i = 0; i < MAX_SHOWN + 3; i++) put(d, rec(`a${i}`, { kind: "area", parent: "jelly" }));
  process.env.SOL_SYSTEMS_RECORDS = d;
  const f = { sent: [] as any[], send(m: object) { this.sent.push(m); } };
  try {
    for (let i = 0; i < MAX_SHOWN + 3; i++) await systemsMsg(f, { type: "work.systems.area", rid: i, area: `a${i}` });
    assert.equal(shownAreas().length, MAX_SHOWN);
    assert.equal(shownAreas()[0], "a3", "the one asked longest ago goes first");
    await systemsMsg(f, { type: "work.systems.history", rid: "h", area: "nowhere" });
    assert.match(f.sent.at(-1).error, /no system "nowhere"/);
  } finally { dropFace(f); delete process.env.SOL_SYSTEMS_RECORDS; rmSync(d, { recursive: true, force: true }); }
});

test("the history: one frame per commit that changed what the area draws, oldest first", async () => {
  const d = scratch(), r = join(d, "records");
  const g = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: d });
  g("init", "-q");
  put(r, rec("jelly", { kind: "area", parent: null }));
  put(r, rec("design", { kind: "area" }));
  put(r, rec("design/root", { layer: "why" }));
  g("add", "."); g("commit", "-qm", "the root");
  put(r, rec("other", { kind: "area" })); g("add", "."); g("commit", "-qm", "elsewhere");   // the area is the same: no frame
  put(r, rec("design/tokens", { layer: "source", fed_by: ["design/root"] })); g("add", "."); g("commit", "-qm", "the tokens");
  try {
    const f = await history("design", r);
    assert.deepEqual(f.map((x) => x.subject), ["the root", "the tokens"]);
    assert.deepEqual(f[1].view.tiles.map((t) => t.id), ["design/root", "design/tokens"]);
    assert.ok(f[0].at <= f[1].at);
    assert.equal(readRecords(r).size, 5);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("an area's parts are the ones its spine hops between, else its own areas", () => {
  const recs = map(rec("product", { kind: "area" }), rec("product/spine", { kind: "part", feeds: ["product/home", "product/build"] }),
    rec("product/home", { kind: "part", name: "Home" }), rec("product/build", { kind: "part", name: "Build" }), rec("product/notch", { kind: "part" }),
    rec("face", { kind: "area" }), rec("face/kit", { kind: "area", name: "Kit" }), rec("face/old", { kind: "area", state: "legacy" }));
  assert.deepEqual(partsOf("product", recs), ["Home", "Build"]);
  assert.deepEqual(partsOf("face", recs), ["Kit"]);
});

test("the walk never follows a symlink: a loop is no hang, a record from outside is not read", () => {
  const d = scratch(), out = scratch();
  try {
    put(d, rec("design", { kind: "area" }));
    put(out, rec("design/stranger", { layer: "why" }));
    symlinkSync(d, join(d, "loop"));
    symlinkSync(join(out, "design", "stranger.json"), join(d, "stranger.json"));
    assert.deepEqual([...readRecords(d).keys()], ["design"]);
  } finally { rmSync(d, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

test("a record with a field of the wrong type is skipped, named in the loose list as unreadable, and the block still draws", () => {
  const d = scratch();
  try {
    put(d, rec("design", { kind: "area" }));
    put(d, rec("design/root", { layer: "why", feeds: ["design/tokens"] }));
    put(d, rec("design/tokens", { layer: "source" }));
    // each of these broke the block before: feeds a string, gaps a string, where.paths a number, the name a number
    put(d, { ...rec("design/a"), feeds: "design/root" } as unknown as Rec);
    put(d, { ...rec("design/b"), gaps: "design/root" } as unknown as Rec);
    put(d, { ...rec("design/c"), where: { paths: 3 } } as unknown as Rec);
    put(d, { ...rec("design/d"), name: 4 } as unknown as Rec);
    mkdirSync(join(d, "design"), { recursive: true });
    writeFileSync(join(d, "design", "e.json"), "{ half");
    writeFileSync(join(d, "design", "f.json"), "[]");
    const { recs, bad } = readRegistry(d);
    assert.deepEqual([...recs.keys()].sort(), ["design", "design/root", "design/tokens"]);
    assert.deepEqual(bad.map((b) => b.id).sort(), ["design/a", "design/b", "design/c", "design/d", "design/e", "design/f"]);
    const v = areaView(recs, "design", bad);
    assert.deepEqual(v.tiles.map((t) => t.id), ["design/root", "design/tokens"]);
    assert.deepEqual(v.loose.map((l) => l.name), ["design/a (unreadable)", "design/b (unreadable)", "design/c (unreadable)", "design/d (unreadable)", "design/e (unreadable)", "design/f (unreadable)"]);
    assert.equal(saneRec(null), null);
    assert.equal(saneRec({ ...rec("x"), gaps: [{ to: 1, why: "x" }] }), null);
    assert.ok(saneRec(rec("x")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the facts never throw, whatever shape tokens.json has; a part that is not there is left out", async () => {
  for (const j of [null, "x", 3, [], { palette: 1 }, { palette: { shade: 1, curve: {}, jelly: {}, creature: {} } },
    { palette: { shade: {}, curve: { radius: 2 }, jelly: { six: "red" }, creature: { colours: [] } } }]) {
    const t = tokensOf(j);
    if (t) assert.deepEqual(t.six, []);
  }
  const t = tokensOf({ palette: { shade: { black: "#0b0b0d", window: 0.62, blur: 24 }, curve: { radius: { block: 22 } }, jelly: { six: ["red", 4, "teal"] }, creature: { colours: { red: "#f00", teal: 7 } } } });
  assert.deepEqual(t, { black: "#0b0b0d", window: 0.62, blur: 24, corner: 22, six: [{ name: "red", hex: "#f00" }] });
  const d = scratch();
  try {
    mkdirSync(join(d, "sol", "design", "system"), { recursive: true });
    for (const body of ["{ half", "[1,2]", JSON.stringify({ palette: { shade: "black", curve: null, jelly: [], creature: 0 } })]) {
      writeFileSync(join(d, "sol", "design", "system", "tokens.json"), body);
      assert.deepEqual(await factsOf(d), {});
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the files that type the default look are walked only when a tile on screen shows them, once per watch tick", async () => {
  const d = scratch();
  try {
    mkdirSync(join(d, "sol", "design", "system"), { recursive: true });
    mkdirSync(join(d, "sol", "mac", "src"), { recursive: true });
    writeFileSync(join(d, "sol", "design", "system", "tokens.json"), JSON.stringify({ palette: { shade: { black: "#000", window: 0.5, blur: 1 }, curve: {}, jelly: {}, creature: {} } }));
    writeFileSync(join(d, "sol", "mac", "src", "a.ts"), `const look = { black: "#000", alpha: 0.5 };\n`);
    const tile = (id: string) => ({ id }) as never;
    const without = { ...areaView(new Map(), "design"), tiles: [tile("design/tokens")] };
    const withLook = { ...without, tiles: [tile("design/tokens"), tile("product/settings/look")] };
    nextTick();
    assert.equal((await factsFor([without], d)).typed, undefined);
    const a = factsFor([withLook], d);
    assert.deepEqual((await a).typed, ["sol/design/system/tokens.json", "sol/mac/src/a.ts"]);
    assert.equal(factsFor([withLook], d), a, "the same tick reads once");
    assert.equal(factsFor([without], d), a, "a read with the typed files serves one without");
    nextTick();
    assert.notEqual(factsFor([withLook], d), a, "the next tick reads again");
  } finally { rmSync(d, { recursive: true, force: true }); }
});


// the lens (#1220): what the agent points at on a system block, refused by name when the area does not draw it
const walkRecs = () => map(
  rec("d", { kind: "area" }),
  rec("d/pins", { layer: "source", feeds: ["d/accent"] }),
  rec("d/accent", { layer: "surface", feeds: ["p/buttons"] }),
  rec("p/buttons", { layer: "surface" }),
  rec("far", { layer: "rules" }),
);

test("a lens on what the area draws stands; an id it does not draw is refused by name, with what it does draw", () => {
  const v = areaView(walkRecs(), "d");
  assert.equal(lensError(v, { focus: "d/pins", path: ["d/pins", "d/accent", "p/buttons"], say: "The pins lead.", step: [1, 3],
    mark: { "p/buttons": "redo" }, fit: "path", view: "window", show: { "p/buttons": "after" } }), null);
  assert.equal(lensError(v, {}), null);
  assert.equal(lensError(v, { fit: "area" }), null);
  for (const [lens, where] of [[{ focus: "far" }, "focus"], [{ path: ["d/pins", "ghost"] }, "path"], [{ mark: { far: "cut" } }, "mark"],
    [{ fit: "ghost" }, "fit"], [{ show: { far: "after" } }, "show"]] as const) {
    const e = lensError(v, lens)!;
    assert.match(e, new RegExp(`^lens\\.${where} names "(far|ghost)", which d does not draw; it draws `));
    assert.match(e, /d\/pins/);
  }
});

test("a lens of the wrong shape is refused in one sentence naming the field", () => {
  const v = areaView(walkRecs(), "d");
  assert.match(lensError(v, null)!, /lens is an object/);
  assert.match(lensError(v, { zoom: 2 })!, /no "zoom"/);
  assert.match(lensError(v, { step: [4, 3] })!, /lens\.step/);
  assert.match(lensError(v, { step: [0, 3] })!, /lens\.step/);
  assert.match(lensError(v, { mark: { "d/pins": "gone" } })!, /one of cut, redo, keep, new, you/);
  assert.match(lensError(v, { view: "map" })!, /lens\.view/);
  assert.match(lensError(v, { show: { "p/buttons": "later" } })!, /lens\.show/);
  assert.match(lensError(v, { say: "x".repeat(241) })!, /lens\.say/);
  assert.match(lensError(v, { path: Array(13).fill("d/pins") })!, /at most 12/);
});

test("a system block's body: only one with a lens is checked; it needs a real area", () => {
  const reg = () => ({ recs: walkRecs(), bad: [] });
  assert.equal(systemBodyError("not json", reg), null);
  assert.equal(systemBodyError(JSON.stringify({ area: "nowhere" }), reg), null);   // no lens: as before, the face says what it lacks
  assert.equal(systemBodyError(JSON.stringify({ area: "d", lens: { focus: "d/accent" } }), reg), null);
  assert.match(systemBodyError(JSON.stringify({ lens: { focus: "d/accent" } }), reg)!, /needs the area/);
  assert.match(systemBodyError(JSON.stringify({ area: "nowhere", lens: {} }), reg)!, /no area "nowhere"/);
  assert.match(systemBodyError(JSON.stringify({ area: "d", lens: { focus: "far" } }), reg)!, /lens\.focus names "far"/);
});
