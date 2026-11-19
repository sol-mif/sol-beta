// Home 8 (#874): places (src/home/places.ts, src/contract/home/places.ts). The engine's half of Marco's side tests: the
// side is your real folders on disk, each saying where it comes from, never the empty view's example rows; a Thing's
// folder crumb finds its place (his inPlace); a folder you never read is not there; a folder only a Thing names is a
// place you made. Replayed against the engine's handler with fake faces, a real kernel's log (test/fixtures/home/rig.ts)
// and a temp folder of the person's own as the files source's scope. Tests 1 to 7 are the plan's (specs home-plan §6
// Home 8); 8 and after pin what the plan left to the build: the "~" labels, the depth, nothing written, the push, the
// switch. The Canvas half (his courses "from Canvas") and people are not built: no source exists for either.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { rig, cleanup, SCHEMAS, type Rig } from "./fixtures/home/rig.ts";
import { NOW, seed } from "./fixtures/home/seed.ts";
import { EXAMPLES, inPlace, ON_DISK, SCHOOL_LABEL, UNDER_SCHOOL, YOURS } from "./fixtures/home/places.ts";
import { PlacesAsk, PlacesMsg } from "../src/contract/home/places.ts";
import { diskFolders, placesMsg, withIds } from "../src/home/places.ts";
import { handleHome, homeHandles } from "../src/home/wire.ts";
import { newThing, changeThing } from "../src/home/items.ts";
import { isHomeKind } from "../src/contract/kinds.ts";
import { freePort } from "./test-engine.ts";

const dirs: string[] = [];
const engines: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = (() => { throw new Error("no network in Home 8"); }) as typeof fetch; });
after(async () => {
  globalThis.fetch = realFetch;
  for (const s of sockets) s.terminate();
  for (const e of engines) {
    if (e.exitCode !== null || e.signalCode !== null) continue;
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  cleanup();
});

const schemas = { ...SCHEMAS, "home.places": PlacesMsg };
const tick = () => new Promise((r) => setImmediate(r));
/** a person's own folder with School/bio 201, School/chem 110, Jobs/applications (and what a test adds) */
function user(more: string[] = []): string {
  const u = mkdtempSync(join(tmpdir(), "sol-user-"));
  dirs.push(u);
  for (const p of ["School/bio 201", "School/chem 110", "Jobs/applications", ...more]) mkdirSync(join(u, p), { recursive: true });
  return u;
}
/** the files source's scope, in the home's sources/files.json (absolute: "~" in the engine is the real home folder) */
function scope(r: Rig, reads: string[], never: string[] = []): void {
  mkdirSync(join(r.home, "sources"), { recursive: true });
  writeFileSync(join(r.home, "sources", "files.json"), JSON.stringify({ reads, never }));
}
const places = async (r: Rig, f = r.face()) => { const got = await r.ask(f, { type: "home.places" }); assert.equal(got.length, 1, "one ask, one answer"); return got[0]; };
const paths = (m: any) => m.places.map((p: any) => p.path);
const byPath = (m: any, path: string) => m.places.find((p: any) => p.path === path);

test("1. the files source's folders: school, its two classes, jobs, its applications; each from files, at a real path", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  const m = await places(r);
  assert.deepEqual(paths(m), ["school", "school › bio 201", "school › chem 110", "jobs", "jobs › applications"]);
  for (const p of m.places) {
    assert.equal(p.from.source, "files", p.path);
    assert.ok(existsSync(p.from.ref), `${p.path}: ${p.from.ref} is there`);
    assert.deepEqual(p.knows, [], "what a place knows comes from Canvas: nothing tonight");
  }
  assert.equal(byPath(m, "school › bio 201").from.ref, join(u, "School", "bio 201"));
  // a course sits under its folder: the tree the face's treeOf walks, by parent id
  const id = (path: string) => byPath(m, path).id;
  assert.deepEqual(m.places.map((p: any) => [p.id, p.parent ?? null]),
    [["school", null], ["school-bio-201", "school"], ["school-chem-110", "school"], ["jobs", null], ["jobs-applications", "jobs"]]);
  assert.equal(byPath(m, "jobs › applications").parent, id("jobs"));
  assert.deepEqual(m.people, [], "no source knows people");
});

test("2. none of the empty view's example rows (his home-side.test.ts l.28)", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  r.seed(seed(NOW));
  const m = await places(r);
  const names = m.places.map((p: any) => p.name);
  for (const ex of EXAMPLES) assert.ok(!names.includes(ex), `no example row "${ex}"`);
});

test("3. a Thing's folder finds its place (his inPlace): chem 110's two, and school above them holds his three", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  const things = seed(NOW);
  r.seed(things);
  const m = await places(r);
  assert.deepEqual(inPlace(byPath(m, "school › chem 110"), things).map((t) => t.id).sort(), ["t-chem-set6", "t-lab-prep"]);
  assert.deepEqual(inPlace(byPath(m, "school"), things).map((t) => t.id).sort(), UNDER_SCHOOL);
  assert.deepEqual(inPlace(byPath(m, "jobs › applications"), things).map((t) => t.id), ["t-shopify-app"]);
  assert.equal(byPath(m, "school › chem 110").from.source, "files", "chem 110 is on disk, not made up from the Thing");
});

test("4. a folder the files source never reads is not a place, nor anything under it", async () => {
  const u = user(["School/private/diary"]), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")], [join(u, "School", "private"), join(u, "Jobs")]);
  const m = await places(r);
  assert.deepEqual(paths(m), ["school", "school › bio 201", "school › chem 110"]);
});

test("5. a folder only a Thing names is a place you made, each crumb above it too; a gone or done Thing makes none", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  r.seed(seed(NOW));
  r.seed([{ id: "t-old", read: "you", folder: "life › moving out", words: "old", state: "done", waitsOn: "none", at: NOW, links: [], made: [] },
    { id: "t-gone", read: "you", folder: "trips", words: "gone", state: "you", waitsOn: "you", at: NOW, links: [], made: [] }]);
  changeThing(r.ctx, "t-gone", { gone: true });
  const m = await places(r);
  const work = byPath(m, "work"), group = byPath(m, "work › stats group");
  assert.deepEqual(work.from, YOURS);
  assert.deepEqual(group.from, YOURS, "Maya's ask files under work › stats group: not on this disk");
  assert.equal(group.parent, work.id);
  assert.equal(group.name, "stats group");
  assert.deepEqual(inPlace(group, seed(NOW)).map((t) => t.id), ["t-maya-data"], "no Thing is left off the side");
  assert.equal(byPath(m, "life"), undefined, "a done Thing makes no place");
  assert.equal(byPath(m, "trips"), undefined, "a gone one neither");
  assert.equal(m.places.filter((p: any) => p.from.source === "you").length, 2, "chem 110, bio 201, applications are on disk");
});

test("6. every home.places sent parses with contract/home/places.ts; the strict schema refuses a field of the engine's", async () => {
  const u = user(), r = rig({ now: NOW, schemas });   // the rig checks each one as it arrives, too
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  r.seed(seed(NOW));
  const m = await places(r);
  assert.ok(PlacesMsg.safeParse(m).success);
  assert.equal(PlacesMsg.safeParse({ ...m, places: [{ ...m.places[0], abs: "/x" }] }).success, false);
  assert.equal(PlacesMsg.safeParse({ ...m, places: [{ ...m.places[0], from: { ...m.places[0].from, source: "disk" } }] }).success, false);
  assert.ok(PlacesAsk.safeParse({ type: "home.places" }).success);
  assert.ok(PlacesAsk.safeParse({ type: "home.places", rid: "x" }).success, "an ask may carry more");
});

test("7. no source registered: places []; a files source with nothing in its scope: places []", async () => {
  const r = rig({ now: NOW, schemas });
  // Home not started yet: no door is registered on this context
  assert.deepEqual(placesMsg(r.ctx), { type: "home.places", places: [], people: [] });
  scope(r, []);
  assert.deepEqual((await places(r)).places, []);
  const u = user();
  scope(r, [join(u, "Gone")]);
  assert.deepEqual((await places(r)).places, [], "a folder that is not there");
});

test("8. labels say the folder as the person knows it: ~/School, ~/Jobs/applications (his values); ids by crumb, unique", () => {
  const u = user();
  const raw = diskFolders({ reads: ["~/School", "~/Jobs"], never: ["~/Desktop"] }, u);
  const m = withIds(raw);
  const label = (path: string) => m.find((p) => p.path === path)!.from.label;
  assert.equal(label("school"), SCHOOL_LABEL);
  for (const [path, l] of ON_DISK) assert.equal(label(path), l, path);
  assert.equal(label("school › bio 201"), "~/School/bio 201");
  // two crumbs with one slug, and a name with no letter or digit: still one id each, the same every time
  const odd = withIds([{ name: "a b", path: "a b", from: YOURS }, { name: "a-b", path: "a-b", from: YOURS }, { name: "生物", path: "生物", from: YOURS }]);
  assert.equal(new Set(odd.map((p) => p.id)).size, 3);
  assert.deepEqual(odd.map((p) => p.id), withIds([{ name: "a b", path: "a b", from: YOURS }, { name: "a-b", path: "a-b", from: YOURS }, { name: "生物", path: "生物", from: YOURS }]).map((p) => p.id));
  assert.match(odd[2].id, /^p-[0-9a-f]{12}$/);
});

test("9. two folders deep, folders only: no file, no hidden folder, no link to elsewhere, no name with a › of its own", async () => {
  const u = user(["School/bio 201/lectures/week 1", "School/.git", "School/a › b", "Elsewhere/secret"]);
  writeFileSync(join(u, "School", "syllabus.pdf"), "x");
  symlinkSync(join(u, "Elsewhere"), join(u, "School", "elsewhere"));
  const r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School")]);
  const m = await places(r);
  assert.deepEqual(paths(m), ["school", "school › bio 201", "school › bio 201 › lectures", "school › chem 110"]);
  assert.deepEqual([byPath(m, "school › bio 201 › lectures").name, byPath(m, "school › bio 201 › lectures").parent], ["lectures", "school-bio-201"]);
});

test("10. an ask writes nothing, makes no <HOME>/items, and twice gives byte-equal JSON (R8)", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  const f = r.face();
  const a = await places(r, f), b = await places(r, f);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(r.events().map((e) => e.kind).filter(isHomeKind), [], "no Home kind on the log");
  assert.equal(existsSync(join(r.home, "items")), false);
});

test("11. once a window asked, a Thing filed in a new folder sends home.places to every window; one in a known folder does not", async () => {
  const u = user(), r = rig({ now: NOW, schemas });
  scope(r, [join(u, "School"), join(u, "Jobs")]);
  const a = r.face(), b = r.face();
  // Home started (a window asked Today), nobody asked places: a Thing in a new folder pushes nothing
  await r.ask(a, { type: "home.today" });
  newThing(r.ctx, { id: "t-first", read: "you", folder: "trips", words: "first", state: "you", waitsOn: "you", at: NOW, links: [], made: [] });
  await tick();
  assert.equal(b.got.filter((m) => m.type === "home.places").length, 0, "nobody asked places: nothing pushed");
  await places(r, a);
  newThing(r.ctx, { id: "t-known", read: "you", folder: "school › chem 110", words: "known", state: "you", waitsOn: "you", at: NOW, links: [], made: [] });
  await tick();
  assert.equal(b.got.filter((m) => m.type === "home.places").length, 0, "a known folder: the places did not change");
  newThing(r.ctx, { id: "t-new", read: "you", folder: "life › moving out", words: "new", state: "you", waitsOn: "you", at: NOW, links: [], made: [] });
  newThing(r.ctx, { id: "t-new2", read: "you", folder: "life › moving out", words: "new2", state: "you", waitsOn: "you", at: NOW, links: [], made: [] });
  await tick();
  for (const f of [a, b]) {
    const pushed = f.got.filter((m) => m.type === "home.places");
    assert.equal(pushed.length, f === a ? 2 : 1, `${f.name}: one push for the two Things`);
    assert.equal(byPath(pushed.at(-1), "life › moving out").from.source, "you");
  }
  // done, the place it alone made goes, and every window is told
  changeThing(r.ctx, "t-new", { state: "done", waitsOn: "none" });
  changeThing(r.ctx, "t-new2", { state: "done", waitsOn: "none" });
  await tick();
  assert.equal(byPath(b.got.filter((m) => m.type === "home.places").at(-1), "life"), undefined);
});

test("12. the message is Home's: homeHandles knows home.places; with the switch off nothing answers it", async () => {
  assert.equal(homeHandles("home.places"), true);
  const was = process.env.SOL_HOME_WHOLE;
  try {
    process.env.SOL_HOME_WHOLE = "off";
    const got: any[] = [];
    await handleHome({ send: (m) => got.push(m) }, { type: "home.places" });
    assert.deepEqual(got, [], "no live Home with the switch off");
  } finally { if (was === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = was; }
});

// ── a real engine on its own port (a free one, #1144), every folder in a temp one ─────────────────────────
type Msg = { type: string; [k: string]: any };
async function engine(port: number, env: Record<string, string>, before?: (home: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "sol-home-places-"));
  dirs.push(dir);
  const home = join(dir, "home");
  mkdirSync(home);
  before?.(home);
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const ENGINE = join(import.meta.dirname, "..");
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "state", "work.json"), SOL_TEAM: join(dir, "team", "team.json"),
      SOL_LOGDIR: join(dir, "log"), SOL_LOG: join(dir, "engine.log"), SOL_PROFILE: join(dir, "profile"), SOL_APPDIR: join(dir, "app"),
      SOL_FRAME: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", ...env,
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await realFetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const got: Msg[] = [];
  ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const next = async (pred: (m: Msg) => boolean, ms = 20_000): Promise<Msg> => {
    for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error("timed out; got " + got.map((m) => m.type).join(" "));
  };
  const log = async (): Promise<Msg[]> => (await (await realFetch(`${url}/log`)).json() as { events: Msg[] }).events;
  return { home, got, next, log, say: (m: object) => ws.send(JSON.stringify(m)) };
}
const withScope = (u: string) => (home: string) => {
  mkdirSync(join(home, "sources"), { recursive: true });
  writeFileSync(join(home, "sources", "files.json"), JSON.stringify({ reads: [join(u, "School"), join(u, "Jobs")], never: [] }));
};

test("13. a real engine, the switch off (the default): home.places is not answered, no <HOME>/items, no Home kind", { timeout: 90_000 }, async () => {
  const u = user();
  const e = await engine(await freePort(), {}, withScope(u));
  e.say({ type: "home.places" });
  e.say({ type: "settings.get" });
  await e.next((m) => m.type === "settings" && e.got.filter((x) => x.type === "settings").length >= 2);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(e.got.filter((m) => m.type.startsWith("home.")).length, 0, "no Home message comes back");
  assert.equal(existsSync(join(e.home, "items")), false);
  assert.deepEqual((await e.log()).map((m) => m.kind).filter(isHomeKind), []);
});

test("14. a real engine with SOL_HOME_WHOLE=on and the frame on: home.places over the socket is your folders on disk", { timeout: 90_000 }, async () => {
  const u = user();
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" }, withScope(u));
  e.say({ type: "home.places" });
  const m = await e.next((x) => x.type === "home.places");
  assert.ok(PlacesMsg.safeParse(m).success);
  assert.deepEqual(paths(m), ["school", "school › bio 201", "school › chem 110", "jobs", "jobs › applications"]);
  assert.deepEqual(m.people, []);
  assert.deepEqual((await e.log()).map((x) => x.kind).filter(isHomeKind), [], "an ask of places writes nothing");
});
