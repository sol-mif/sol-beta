// Home's world (#1093): the rules the world draws by, read without a window (home/world3d/model.ts, person.ts, flag.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SLOTS, asks, daylight, fileInto, folderSpots, lineOf, moodOf, projectsOf, running, thingsOf, weatherOf, type WorldData } from "./home/world3d/model.ts";
import { JELLY_LOOPS, PERSON } from "./home/world3d/person.ts";
import { makeWorldSwitch } from "./home/world3d/flag.ts";
import { parse } from "./home/folders/stickies.ts";

const made = (t: string, notes: string[] = [], done = false) => ({ done, t, s: "", notes });

test("a sticky's state comes from its line in stickies.md", () => {
  assert.equal(moodOf(made("Quiz 4", [], true)), "done");
  assert.equal(moodOf(made("Exam prep ← now")), "run");
  assert.equal(moodOf(made("ERD draft", ["needs you: which schema"])), "ask");
  assert.equal(moodOf(made("Reading week 11")), "wait");
  // wanting him outranks running: he is the one it stopped for
  assert.equal(moodOf(made("Cover letter ← now", ["needs you: send it?"])), "ask");
});

test("the made-up person's files parse in the real stickies format", () => {
  for (const f of PERSON.folders) {
    const p = parse(f.stickies);
    assert.ok(p.items.length >= 1, `${f.id} has stickies`);
    const th = thingsOf(f.id, p.items);
    assert.equal(th.length, p.items.length);
    assert.ok(th.every((t) => !t.name.includes("← now")), "the mark is not part of the name");
  }
  const is210 = thingsOf("is210", parse(PERSON.folders.find((f) => f.id === "is210")!.stickies).items);
  assert.equal(is210[0].mood, "ask");
});

const world = (): WorldData => ({
  who: "Remy", source: "made-up", at: 0, mates: PERSON.mates, social: 0,
  parts: PERSON.parts.map((p) => ({ ...p, folders: PERSON.folders.filter((f) => f.part === p.id).map((f) => ({ id: f.id, name: f.name, part: f.part, rel: f.rel, set: true, things: thingsOf(f.id, parse(f.stickies).items) })) })),
  projects: PERSON.projects,
});

test("the one line answers what is working and what wants you", () => {
  const d = world();
  assert.equal(running(d), 3 + 3);   // three stickies with ← now, three busy sessions
  assert.equal(asks(d).length, 2 + 1);   // two stickies that need him, one session waiting
  assert.match(lineOf(d), /^6 working · 3 want you · \d+ done$/);
});

test("districts never move, and a folder keeps its slot when another is added after it", () => {
  const d = world(), school = d.parts[0];
  const before = folderSpots(school, SLOTS[0]);
  const more = { ...school, folders: [...school.folders, { id: "new", name: "new", part: "school", rel: "school/new", set: false, things: [] }] };
  const after = folderSpots(more, SLOTS[0]);
  for (const f of school.folders) { assert.equal(after.get(f.id)!.x, before.get(f.id)!.x, `${f.id} stays in its column`); }
  // every block stands inside its district
  for (const [, s] of after) { assert.ok(s.x > SLOTS[0].x - SLOTS[0].w / 2 && s.x < SLOTS[0].x + SLOTS[0].w / 2); assert.ok(s.z > SLOTS[0].z - SLOTS[0].d / 2 && s.z < SLOTS[0].z + SLOTS[0].d / 2); }
});

test("a folder grows with what is open in it, not with what is done", () => {
  const f = (n: number, done: number) => ({ id: "x", name: "x", part: "p", rel: "x", set: true, things: [...Array(n)].map((_, i) => ({ id: `x#${i}`, name: "", mood: i < done ? "done" as const : "wait" as const, folder: "x", i })) });
  const h = (n: number, done: number) => folderSpots({ id: "p", name: "p", folders: [f(n, done)] }, SLOTS[0]).get("x")!.h;
  assert.ok(h(3, 0) > h(1, 0));
  assert.equal(h(3, 2), h(1, 0));
  assert.equal(h(40, 0), h(6, 0), "capped");
});

test("Build's projects from the engine's session list", () => {
  const now = Date.UTC(2026, 10, 13);
  const ps = projectsOf(
    [{ path: "/p/sol", name: "Sol" }, { path: "/p/maps", name: "Project B" }, { path: "/p/old", name: "Quiet" }, { path: "/p/none", name: "None" }],
    [
      { id: "a", title: "world", project: "/p/sol", updatedAt: now - 1000 }, { id: "b", title: "tickets", project: "/p/sol", updatedAt: now - 5000 },
      { id: "c", title: "export", project: "/p/maps", updatedAt: now - 1000, failed: true },
      { id: "d", title: "menu", project: "/p/old", updatedAt: now - 30 * 864e5 },
    ],
    { a: { busy: true }, b: { waiting: 1 } }, now);
  assert.deepEqual(ps.map((p) => [p.name, p.health]), [["Sol", "ok"], ["Project B", "broken"], ["Quiet", "idle"]], "a folder with no sessions is not drawn");
  assert.equal(ps[0].jelly, true, "Sol's own project is the Jelly project");
  assert.deepEqual(ps[0].sessions.map((s) => [s.id, s.busy, s.waiting]), [["a", true, false], ["b", false, true]]);
});

test("day and night from the hour; the weather from how the day goes", () => {
  const at = (h: number) => daylight(new Date(2026, 10, 13, h, 0));
  assert.equal(at(3), 0); assert.equal(at(12), 1); assert.equal(at(7), 0.5); assert.equal(at(19), 0.5); assert.equal(at(22), 0);
  const d = world();
  assert.equal(weatherOf(d), "rain", "Project B is broken");
  d.projects = d.projects.map((p) => ({ ...p, health: "ok" as const }));
  assert.equal(weatherOf(d), "haze", "three things want him");
  d.parts = d.parts.map((p) => ({ ...p, folders: p.folders.map((f) => ({ ...f, things: f.things.filter((t) => t.mood !== "ask") })) }));
  assert.equal(weatherOf(d), "clear");
});

test("a sticky dropped on another folder moves there whole, notes and all", () => {
  const a = [made("one"), made("two", ["needs you: x"])], b = [made("three")];
  const r = fileInto(a, 1, b)!;
  assert.deepEqual(r.from.map((m) => m.t), ["one"]);
  assert.deepEqual(r.to.map((m) => m.t), ["three", "two"]);
  assert.deepEqual(r.to[1].notes, ["needs you: x"]);
  assert.equal(fileInto(a, 5, b), null);
});

test("the Jelly project's loops: fourteen, the two that fail in silence red", () => {
  assert.equal(JELLY_LOOPS.length, 14);
  assert.deepEqual(JELLY_LOOPS.filter((l) => !l.ok).map((l) => l.name), ["the night job", "sol-mine-merge"]);
});

test("home.world3d is off by default, on by its row or a link", () => {
  const kv = new Map<string, string>();
  const env = (search = "") => ({ storage: () => ({ getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, v) }), search: () => search, target: null });
  assert.equal(makeWorldSwitch(env()).get(), false);
  assert.equal(makeWorldSwitch(env("?home.world3d=on")).get(), true);
  makeWorldSwitch(env()).set(true);
  assert.equal(makeWorldSwitch(env()).get(), true);
});

// morning round, 2026-11-13: "world only appeared after I turned it on and reloaded". Settings and Home share one
// window and one switch, so the row's press must reach Home's side at once, on and off; another window's by its event.
test("home.world3d's row reaches Home at once: its subscribers hear on and off in this window and from another", () => {
  const kv = new Map<string, string>(), target = new EventTarget();
  const sw = makeWorldSwitch({ storage: () => ({ getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, v) }), search: () => "", target });
  const seen: boolean[] = [];
  const stop = sw.sub(() => seen.push(sw.get()));
  sw.set(true); sw.set(false);
  assert.deepEqual(seen, [true, false], "the same window: on, then off, each heard at once");
  kv.set("home.world3d", "1"); target.dispatchEvent(Object.assign(new Event("storage"), { key: "home.world3d" }));
  assert.deepEqual(seen, [true, false, true], "another window turned it on");
  stop(); sw.set(false);
  assert.equal(seen.length, 3, "unsubscribed: no more calls");
});

// ---- the world's hand on the files (home/world3d/ops.ts): by title, never by place, nothing lost ----
import { canFile, finished, markNow, putIn, settle, takeOut, tick } from "./home/world3d/ops.ts";
import { needsOf } from "./home/world3d/model.ts";

test("do it marks the one pressed ← now and takes the mark off every other", () => {
  const l = [made("a", ["asked Nov 12 10:00 ← now"]), made("b")];
  const r = markNow("b", "Nov 13 02:30")(l);
  assert.deepEqual(r[0].notes, ["asked Nov 12 10:00"]);
  assert.deepEqual(r[1].notes, ["asked Nov 13 02:30 ← now"]);
  assert.equal(moodOf(r[1]), "run");
  assert.equal(markNow("gone")(l), l, "a sticky that is not there changes nothing");
  assert.deepEqual(settle(r)[1].notes, ["asked Nov 13 02:30"]);
});

test("a change finds its sticky by title, so a line the agent added meanwhile is kept", () => {
  const shown = [made("a"), made("b")];
  const onDisk = [made("new from the agent"), made("a"), made("b")];   // the file changed since it was shown
  assert.deepEqual(tick("b", true)(onDisk).map((m) => [m.t, m.done]), [["new from the agent", false], ["a", false], ["b", true]]);
  assert.deepEqual(takeOut("a")(onDisk).map((m) => m.t), ["new from the agent", "b"]);
  assert.deepEqual(takeOut("zz")(shown), shown);
  const moved = putIn(made("c", ["needs you: which one"]))(shown);
  assert.deepEqual(moved.map((m) => m.t), ["a", "b", "c"]);
  assert.equal(putIn(made("a"))(shown), shown, "one by that title is there: the same list back, nothing went in");
});

test("the run is finished when the agent wrote a new did: line and left no mark", () => {
  const before = made("DCF", ["asked Nov 13 02:30 ← now"]);
  assert.equal(finished(before, made("DCF", ["asked Nov 13 02:30 ← now"])), false, "still on it");
  assert.equal(finished(before, made("DCF", ["asked Nov 13 02:30"])), false, "stopped without a did: line");
  assert.equal(finished(before, made("DCF", ["asked Nov 13 02:30", "did: made/dcf.md"])), true);
  assert.equal(finished(made("DCF", ["did: an old one"]), made("DCF", ["did: an old one"])), false, "an old did: line is not this run");
  assert.equal(finished(before, undefined), false);
});

test("the line a sticky asks is its newest needs you note", () => {
  assert.equal(needsOf(made("ERD", ["needs you: which schema"])), "which schema");
  assert.equal(needsOf(made("ERD", ["needs you: old", "needs you: new"])), "new");
  assert.equal(needsOf(made("ERD", ["did: x"])), undefined);
  assert.equal(thingsOf("is210", [made("ERD", ["needs you: which schema"])])[0].needs, "which schema");
});

test("projects keep their places whatever order the engine lists them in", () => {
  const ps = [{ path: "/p/zeta", name: "zeta" }, { path: "/p/sol", name: "sol" }, { path: "/p/maps", name: "Project B" }];
  const ss = ps.map((p, i) => ({ id: `s${i}`, title: "t", project: p.path, updatedAt: Date.now() }));
  const a = projectsOf(ps, ss, {}).map((p) => p.name), b = projectsOf([...ps].reverse(), [...ss].reverse(), {}).map((p) => p.name);
  assert.deepEqual(a, ["sol", "Project B", "zeta"]);
  assert.deepEqual(b, a);
});

test("a sticky tied to a project holds one with: note, read back as a tie, and undo takes it off", async () => {
  const { tie, untie, tiesIn } = await import("./home/world3d/ops.ts");
  const l = [made("DCF problem set"), made("Notebook 6")];
  const t = tie("DCF problem set", "Project A")(l);
  assert.deepEqual(t[0].notes, ["with: Project A"]);
  assert.equal(tie("DCF problem set", "project a")(t)[0].notes.length, 1, "tied twice is one note");
  assert.deepEqual(tiesIn(t), [{ thing: "DCF problem set", project: "Project A" }]);
  assert.deepEqual(untie("DCF problem set", "Project A")(t)[0].notes, []);
});

test("filing onto a folder that has one by that title is refused, so the one being filed is never lost", () => {
  const to = [made("Reading week 11", ["did: notes"])];
  assert.equal(canFile(to, "Reading week 11"), false);
  assert.equal(canFile(to, "ERD draft"), true);
  assert.equal(putIn(made("Reading week 11", ["needs you: which pages"]))(to), to, "nothing added: the caller must not take it out");
});

test("after filing, a sticky is taken out of its folder only if it is still the one that was filed", async () => {
  const { takeOutIf } = await import("./home/world3d/ops.ts");
  const filed = made("Reading week 11", ["asked Nov 13 02:30"]);
  const sameNow = [made("ERD"), made("Reading week 11", ["asked Nov 13 02:30"])];
  assert.deepEqual(takeOutIf(filed)(sameNow).map((m) => m.t), ["ERD"]);
  const agentWrote = [made("ERD"), made("Reading week 11", ["asked Nov 13 02:30", "did: made/notes.md"])];
  assert.equal(takeOutIf(filed)(agentWrote), agentWrote, "a line the agent added since: left where it is (in both)");
  const ticked = [made("Reading week 11", ["asked Nov 13 02:30"], true)];
  assert.equal(takeOutIf(filed)(ticked), ticked, "ticked since: left where it is");
  assert.equal(takeOutIf(filed)([made("ERD")]).length, 1, "gone already: nothing taken");
});

test("one Jelly project: the repository the registry is read from; a project's title when the engine gives one", () => {
  const ps = [{ path: "/p/jelly", name: "jelly" }, { path: "/p/sol-dev", name: "sol-dev" }, { path: "/p/cafe-site", name: "cafe-site", title: "café site" }, { path: "/w/sol", name: "sol" }];
  const ss = ps.map((p, i) => ({ id: `s${i}`, title: "t", project: p.path, updatedAt: Date.now() }));
  const got = projectsOf(ps, ss, {});
  assert.equal(got.filter((p) => p.jelly).length, 1, "one only");
  assert.ok(got.some((p) => p.name === "café site"));
  assert.equal(got.find((p) => p.name === "jelly")?.jelly, false, "a project merely named jelly is a plate");
});

test("the hand's rules: a running sticky is not filed, a drawn project takes no tie, a tie undone takes off only its own line", async () => {
  const { running, canTie, tie, untie } = await import("./home/world3d/ops.ts");
  assert.equal(running(made("DCF", ["asked Nov 13 02:30 ← now"])), true);
  assert.equal(running(made("DCF", ["asked Nov 13 02:30 ← now"], true)), false, "ticked: done, not running");
  assert.equal(running(made("DCF", ["asked Nov 13 02:30"])), false);
  assert.equal(canTie(true), false); assert.equal(canTie(false), true);
  const his = [made("Cover letter", ["with: Project A"])];
  assert.equal(tie("Cover letter", "Project A")(his), his, "already his: the tie adds nothing, so its undo must take nothing");
  assert.deepEqual(untie("Cover letter", "Project B")(tie("Cover letter", "Project B")(his))[0].notes, ["with: Project A"], "undoing the Project B tie leaves his own Project A line");
  assert.equal(untie("Cover letter", "Project B")(his), his, "nothing to take off: the same list back");
});

test("a made-up person's folder only under the home or a scratch folder", async () => {
  const { personAllowed } = await import("./home/world3d/ops.ts");
  assert.equal(personAllowed("/Users/you/sol/home/remy/", "/Users/you/sol/home"), "/Users/you/sol/home/remy");
  assert.equal(personAllowed("/home/you/computer/scratch/remy", "/x"), "/home/you/computer/scratch/remy");
  assert.equal(personAllowed("/home/you/scratch/remy", null), "/home/you/scratch/remy");
  assert.equal(personAllowed("/etc/remy", "/Users/you/sol/home"), null);
  assert.equal(personAllowed("/home/you/scratch/../.ssh", null), null);
  assert.equal(personAllowed("/tmp/scratch/remy", null), null);
});

test("pick 2 tells Jev titles and counts only: no notes, no sessions", async () => {
  const { edgeAsk } = await import("./home/world3d/ops.ts");
  const want = [{ id: "is210#0", name: "ERD draft", kind: "thing" }, { id: "s1", name: "secret session title", kind: "session" }];
  const folders = [{ id: "is210", things: [{ id: "is210#0", mood: "ask" }, { id: "is210#1", mood: "wait" }, { id: "is210#2", mood: "done" }] }];
  const got = edgeAsk(want, folders);
  assert.deepEqual(got, [{ id: "is210#0", words: "ERD draft", age: "", behind: "1 more open in its folder" }]);
  assert.ok(!JSON.stringify(got).includes("secret"));
});

test("his arrangement is read back from world.md by name, only inside the world's place; the first line for a part counts", async () => {
  const { orderFrom, worldMd, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const parts = [{ id: "school", name: "school" }, { id: "jobs", name: "jobs" }];
  const folders = [{ id: "bio101", name: "BIO101", part: "school" }, { id: "his210", name: "HIS210", part: "school" }, { id: "art330", name: "ART330", part: "school" }, { id: "jobs/trip", name: "a trip", part: "jobs" }, { id: "jobs/rw", name: "rent, water", part: "jobs" }];
  const md = "# Where things are\n\nAs you arranged them…\n\n- school: ART330, BIO101, gone one, HIS210\n- jobs: a trip\n- life: gym\n";
  assert.deepEqual(orderFrom(md, parts, folders), { school: ["art330", "bio101", "his210"], jobs: ["jobs/trip"] }, "a file from before the marks: under its heading; commas still read");
  assert.deepEqual(orderFrom("nothing here\n- school: HIS210\n", parts, folders), {}, "no world's place: his own lines are not read");
  assert.deepEqual(orderFrom(worldMd(null, "jobs", ["rent, water", "a trip"]), parts, folders), { jobs: ["jobs/rw", "jobs/trip"] });
  const two = `- school: ART330\n${WORLD_OPEN}\r\n- school: HIS210 · BIO101\r\n- school: BIO101\r\n${WORLD_CLOSE}\r\n`;
  assert.deepEqual(orderFrom(two, parts, folders), { school: ["his210", "bio101"] }, "his note above the block is not read; CRLF reads; the first line wins");
});

test("a move rewrites only its part's line in the world's place: his notes, other lines and CRLF kept byte for byte", async () => {
  const { worldMd, WORLD_HEAD, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const his = "# Where things are\r\n\nmy own words, kept\n- school: BIO101 · HIS210\n- life: gym\n\n## agent's note\n- school: leave this\n";
  assert.equal(worldMd(his, "school", ["HIS210", "BIO101"]), his.replace("- school: BIO101 · HIS210", "- school: HIS210 · BIO101"), "the line under the heading, not the agent's one below");
  const note = `- school: my own note\n${WORLD_OPEN}\n- school: A · B\n- school: B\n${WORLD_CLOSE}\n`;
  assert.equal(worldMd(note, "school", ["B", "A"]), note.replace("- school: A · B", "- school: B · A"), "his note above the block and a second line stay");
  const crlf = `${WORLD_OPEN}\r\n- school: A · B\r\n${WORLD_CLOSE}\r\n`;
  assert.equal(worldMd(crlf, "school", ["B", "A"]), crlf.replace("A · B", "B · A"), "a CRLF line is matched and keeps its \\r: no second line");
  assert.equal(worldMd(`${WORLD_OPEN}\n- school: A · Old one · B\n${WORLD_CLOSE}\n`, "school", ["B", "A"]), `${WORLD_OPEN}\n- school: B · A · Old one\n${WORLD_CLOSE}\n`, "a name that is not a folder now is carried over");
  assert.equal(worldMd(`${WORLD_OPEN}\n- life: gym\n${WORLD_CLOSE}\n`, "jobs", ["a trip"]), `${WORLD_OPEN}\n- life: gym\n- jobs: a trip\n${WORLD_CLOSE}\n`, "no line for the part: at the end of the block");
  assert.equal(worldMd("mine\n", "jobs", ["a trip"]), `mine\n\n${WORLD_OPEN}\n- jobs: a trip\n${WORLD_CLOSE}\n`, "no world's place: the marked block at the end, his line untouched");
  assert.equal(worldMd("mine", "jobs", ["a trip"]), `mine\n\n${WORLD_OPEN}\n- jobs: a trip\n${WORLD_CLOSE}\n`);
  assert.equal(worldMd(null, "jobs", ["a trip"]), `${WORLD_HEAD}${WORLD_OPEN}\n- jobs: a trip\n${WORLD_CLOSE}\n`, "no world.md yet: a new one");
});

test("world.md is written with the hash it was read with; a failed or textless read writes nothing; a new one is a create", async () => {
  const { writeWorldMd, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const B = (l: string) => `${WORLD_OPEN}\n${l}\n${WORLD_CLOSE}\n`;
  const writes: { text: string; hash?: string }[] = [];
  const w = async (text: string, hash?: string) => { writes.push({ text, hash }); return { ok: true }; };
  assert.equal(await writeWorldMd(async () => ({ text: `kept\n${B("- school: A")}`, hash: "h1" }), w, "school", ["B", "A"]), null);
  assert.deepEqual(writes.pop(), { text: `kept\n${B("- school: B · A")}`, hash: "h1" });
  assert.match((await writeWorldMd(async () => undefined, w, "school", ["A"]))!, /did not answer/);
  assert.match((await writeWorldMd(async () => ({ error: "EACCES: permission denied" }), w, "school", ["A"]))!, /EACCES/);
  assert.match((await writeWorldMd(async () => ({ size: 3_000_000 } as never), w, "school", ["A"]))!, /could not be read as text/, "too big or binary: no text, no error");
  assert.match((await writeWorldMd(async () => ({ text: "x" }), w, "school", ["A"]))!, /could not be read as text/, "no hash: never written over");
  assert.equal(writes.length, 0, "no answer, an error or no text: nothing written");
  assert.equal(await writeWorldMd(async () => ({ error: "ENOENT: no such file" }), w, "school", ["A"]), null);
  assert.equal(writes.pop()!.hash, "", "not there: a create only (\"\"), never over a file made meanwhile");
  let n = 0; const reads = [B("one"), B("two")];
  const busy = async (text: string, hash?: string) => { writes.push({ text, hash }); return n++ === 0 ? { changed: true } : { ok: true }; };
  assert.equal(await writeWorldMd(async () => ({ text: reads.shift(), hash: `h${n}` }), busy, "school", ["A"]), null);
  assert.deepEqual(writes.map((x) => x.text), [B("one\n- school: A"), B("two\n- school: A")], "changed meanwhile: read again, his new line kept");
  writes.length = 0;
  assert.match((await writeWorldMd(async () => ({ text: "x", hash: "h" }), async () => ({ changed: true }), "school", ["A"]))!, /kept changing/);
});


test("the dock's lamps come from Cowork's team.state: everyone but me, lit while their agent works", async () => {
  const { matesOf } = await import("./home/world3d/model.ts");
  assert.deepEqual(matesOf(null), []);
  assert.deepEqual(matesOf({ me: { login: "me" }, members: ["ana", "ben", "me"], agents: [{ of: "ana", working: true }, { of: "ben", working: false }] }),
    [{ name: "ana", on: true }, { name: "ben", on: false }]);
  assert.deepEqual(matesOf({ me: { login: "me" }, members: ["me"] }), []);
  assert.deepEqual(matesOf({ me: { login: "me" } }), [], "no members: no dock");
});

test("pick 3: only a session that was busy and stopped clean is asked; 0.7 shelves, 0.45 a ghost, under nothing", async () => {
  const { stopped, doneBy } = await import("./home/world3d/ops.ts");
  const s = (id: string, busy = false, waiting = false, failed = false) => ({ id, busy, waiting, failed });
  const first = stopped(new Set(), [{ sessions: [s("a", true), s("b"), s("c", true)] }]);
  assert.deepEqual(first.ended, [], "the first look asks nothing");
  const next = stopped(first.busy, [{ sessions: [s("a"), s("b"), s("c", false, true)] }]);
  assert.deepEqual(next.ended, ["a"], "c stopped to ask him: it is not finished");
  assert.deepEqual(stopped(new Set(["a"]), [{ sessions: [s("a", false, false, true)] }]).ended, [], "a failed one is not asked");
  assert.equal(doneBy(0.7), "shelve"); assert.equal(doneBy(0.5), "ghost"); assert.equal(doneBy(0.44), null); assert.equal(doneBy(null), null);
});

test("districts share the back row: one, two or three, never overlapping, never leaving a hole", async () => {
  const { slotsFor } = await import("./home/world3d/scene.ts");
  const three = slotsFor(3), left = three[0].x - three[0].w / 2, right = three[2].x + three[2].w / 2;
  for (const n of [1, 2, 3]) {
    const s = slotsFor(n);
    assert.equal(s.length, n);
    assert.ok(Math.abs(s[0].x - s[0].w / 2 - left) < 1e-9 && Math.abs(s[n - 1].x + s[n - 1].w / 2 - right) < 1e-9, `${n}: the row from end to end`);
    for (let i = 1; i < n; i++) assert.ok(s[i - 1].x + s[i - 1].w / 2 < s[i].x - s[i].w / 2, `${n}: ${i - 1} and ${i} apart`);
  }
});

test("pick 5: the places he went at about this hour on other days, never today's; the answer's two thresholds", async () => {
  const { placesAt, leanBy } = await import("./home/world3d/ops.ts");
  const now = new Date(2026, 10, 13, 9, 30), at = (d: number, h: number, mi = 0) => new Date(2026, 10, d, h, mi).toISOString();
  const moves = [
    { at: at(10, 9, 0), place: "school" }, { at: at(11, 10, 20), place: "jobs" }, { at: at(11, 14, 0), place: "build" },
    { at: at(12, 8, 45), place: "school" }, { at: at(12, 9, 10), what: "no place" }, { at: at(13, 9, 0), place: "build" },
    { at: "garbage", place: "x" }, { at: at(12, 23, 45), place: "night" },
  ];
  assert.deepEqual(placesAt(moves, now), ["school", "jobs", "school"]);
  assert.deepEqual(placesAt(moves, new Date(2026, 10, 13, 0, 30)), ["night"], "an hour either side wraps round midnight");
  assert.deepEqual(placesAt([], now), []);
  assert.deepEqual(leanBy({ part: "school", confidence: 0.7 }), { part: "school", sure: true });
  assert.deepEqual(leanBy({ part: "school", confidence: 0.5 }), { part: "school", sure: false });
  assert.equal(leanBy({ part: "school", confidence: 0.44 }), null);
  assert.equal(leanBy({ part: null }), null);
});

test("a home with many projects: the eight drawn keep every one working or waiting, then the latest; in name order", async () => {
  const { projectsOf } = await import("./home/world3d/model.ts");
  const now = Date.now(), names = "abcdefghijkl".split("");
  const ps = names.map((n) => ({ path: `/p/${n}`, name: n }));
  const ss = names.map((n, i) => ({ id: `s-${n}`, title: "t", project: `/p/${n}`, updatedAt: now - (i + 1) * 60_000 }));   // a newest … l oldest
  const runs = { "s-k": { busy: true }, "s-l": { waiting: 1 } };
  const got = projectsOf(ps, ss, runs, now).map((p) => p.name);
  assert.equal(got.length, 8);
  assert.ok(got.includes("k") && got.includes("l"), "the working and the waiting stand, though oldest and last by name");
  assert.deepEqual(got, ["a", "b", "c", "d", "e", "f", "k", "l"], "then the latest, all in name order");
});

test("pick 4: two things opened within a minute on three days are a pair; a kept tie is one line in world.md's place", async () => {
  const { pairsFrom, tiesFromMd, worldMdTie, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const now = new Date(2026, 10, 13, 9, 0), at = (d: number, h: number, m: number, s = 0) => new Date(2026, 10, d, h, m, s).toISOString();
  const known = new Set(["is223", "/p/path", "la245"]);
  const moves = [
    { at: at(10, 9, 0), id: "is223" }, { at: at(10, 9, 0, 40), id: "/p/path" },
    { at: at(11, 14, 0), id: "/p/path" }, { at: at(11, 14, 0, 30), id: "is223" },
    { at: at(12, 9, 0), id: "is223" }, { at: at(12, 9, 0, 59), id: "/p/path" },
    { at: at(12, 10, 0), id: "la245" }, { at: at(12, 10, 2), id: "/p/path" },   // over a minute apart
    { at: at(12, 11, 0), id: "gone" }, { at: at(12, 11, 0, 5), id: "la245" },  // gone is not drawn now
  ];
  assert.deepEqual(pairsFrom(moves, now, known), [{ a: "/p/path", b: "is223", days: 3 }]);
  assert.deepEqual(pairsFrom(moves.slice(0, 4), now, known), [], "two days are not enough");
  assert.deepEqual(pairsFrom(moves, new Date(2026, 10, 30), known), [], "older than fourteen days: forgotten");
  const md = `mine\n${WORLD_OPEN}\n- school: IS223\n${WORLD_CLOSE}\n`;
  const on = worldMdTie(md, "IS223", "pathfinder", true);
  assert.equal(on, `mine\n${WORLD_OPEN}\n- school: IS223\n- tied: IS223 / pathfinder\n${WORLD_CLOSE}\n`);
  assert.deepEqual(tiesFromMd(on), [["is223", "pathfinder"]]);
  assert.equal(worldMdTie(on, "pathfinder", "IS223", true), on, "kept once, either order");
  assert.equal(worldMdTie(on, "pathfinder", "IS223", false), md, "taken off: only its line");
  assert.deepEqual(tiesFromMd("- tied: a + b\n"), [], "outside the world's place: his own line, not read");
});

test("world.md's marks: a name with a comma round-trips inside the block; marks that do not pair get a new block", async () => {
  const { orderFrom, worldMd, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const parts = [{ id: "jobs", name: "jobs" }], folders = [{ id: "rw", name: "rent, water", part: "jobs" }, { id: "t", name: "a trip", part: "jobs" }];
  assert.deepEqual(orderFrom(`${WORLD_OPEN}\n- jobs: rent, water\n${WORLD_CLOSE}\n`, parts, folders), { jobs: ["rw"] }, "one name, with its comma");
  const noClose = `${WORLD_OPEN}\n- jobs: a trip\nhis own words\n`;
  assert.deepEqual(orderFrom(noClose, parts, folders), {}, "he deleted the close mark: nothing read as the world's");
  assert.equal(worldMd(noClose, "jobs", ["a trip"]), `${noClose}\n${WORLD_OPEN}\n- jobs: a trip\n${WORLD_CLOSE}\n`, "his lines kept, a new block at the end");
  const two = `${WORLD_OPEN}\nold\n${WORLD_OPEN}\n- jobs: a trip\n${WORLD_CLOSE}\n`;
  assert.equal(worldMd(two, "jobs", ["rent, water", "a trip"]), two.replace("- jobs: a trip", "- jobs: rent, water · a trip"), "the last open before the close");
});

test("world.md: nothing changes, nothing is written", async () => {
  const { writeWorldMd, worldMdTie, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const writes: string[] = []; const w = async (t: string) => { writes.push(t); return { ok: true }; };
  assert.equal(await writeWorldMd(async () => ({ error: "ENOENT" }), w, (prev) => worldMdTie(prev, "a", "b", false)), null);
  const md = `${WORLD_OPEN}\n- tied: a / b\n${WORLD_CLOSE}\n`;
  assert.equal(await writeWorldMd(async () => ({ text: md, hash: "h" }), w, (prev) => worldMdTie(prev, "b", "a", true)), null);
  assert.deepEqual(writes, [], "no empty world.md made, no write for the same text");
});

test("pick 3 at the open: sessions that ended earlier today, not asked yet, newest first, capped", async () => {
  const { endedToday } = await import("./home/world3d/ops.ts");
  const now = new Date(2026, 10, 13, 9, 0), t = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  const s = (id: string, at: number | undefined, o: Partial<{ busy: boolean; waiting: boolean; failed: boolean }> = {}) => ({ id, busy: false, waiting: false, failed: false, at, ...o });
  assert.deepEqual(endedToday([{ sessions: [s("live", t(13, 8, 45)), s("old", t(13, 8, 20))] }], now, new Set()), ["old"], "quiet under half an hour: maybe a talk in a terminal, not asked");
  const ps = [{ sessions: [s("a", t(13, 2)), s("b", t(13, 7)), s("c", t(12, 23)), s("d", t(13, 8), { busy: true }), s("e", t(13, 6), { waiting: true }), s("f", t(13, 5), { failed: true }), s("g", undefined)] }, { sessions: [s("h", t(13, 1))] }];
  assert.deepEqual(endedToday(ps, now, new Set()), ["b", "a", "h"], "today's, ended clean, newest first; yesterday's and the busy, waiting, failed are not");
  assert.deepEqual(endedToday(ps, now, new Set(["b"])), ["a", "h"], "asked once a day");
  assert.deepEqual(endedToday(ps, now, new Set(), 1), ["b"]);
});

test("a shelved session whose talk moved on comes off the shelf", async () => {
  const { movedOn } = await import("./home/world3d/ops.ts");
  const ps = [{ sessions: [{ id: "a", at: 200 }, { id: "b", at: 100 }] }];
  assert.deepEqual(movedOn([{ id: "a", at: 100 }, { id: "b", at: 100 }, { id: "c", at: 1 }, { id: "d" }], ps), ["a"]);
});

test("world.md's marks: a close whose open he deleted is passed over; the block written after it is found again", async () => {
  const { orderFrom, worldMd, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const parts = [{ id: "jobs", name: "jobs" }], folders = [{ id: "t", name: "a trip", part: "jobs" }, { id: "rw", name: "rent", part: "jobs" }];
  const noOpen = `- jobs: a trip\n${WORLD_CLOSE}\nhis words\n`;
  const once = worldMd(noOpen, "jobs", ["a trip", "rent"]);
  assert.equal(once, `${noOpen}\n${WORLD_OPEN}\n- jobs: a trip · rent\n${WORLD_CLOSE}\n`, "a new block at the end, his lines kept");
  const twice = worldMd(once, "jobs", ["rent", "a trip"]);
  assert.equal(twice, once.replace("- jobs: a trip · rent", "- jobs: rent · a trip"), "the next write finds that block: no second one");
  assert.deepEqual(orderFrom(twice, parts, folders), { jobs: ["rw", "t"] }, "and it is read back");
});

test("a read of stickies.md: only a missing file is an empty list; no text or no hash is never a list to write over", async () => {
  const { readSaid } = await import("./home/world3d/ops.ts");
  assert.deepEqual(readSaid({ text: "- [ ] a\n", hash: "h" }), { text: "- [ ] a\n", hash: "h" });
  assert.equal(readSaid({ error: "ENOENT: no such file" }), "missing");
  assert.equal(readSaid({ error: "that folder is not there" }), "not there");
  assert.equal(readSaid({ size: 3_000_000 } as never), null, "too big: no text, no error");
  assert.equal(readSaid({ text: "x" }), null, "no hash");
  assert.equal(readSaid({ error: "EACCES" }), null);
  assert.equal(readSaid(undefined), null);
});

test("pick 4 tells Jev a folder by its name, a project only as \"a project\": his project's name never leaves", async () => {
  const { tieTold } = await import("./home/world3d/ops.ts");
  const folders = [{ id: "is223", name: "IS223" }], projects = [{ id: "/p/secret-startup" }];
  assert.deepEqual(tieTold("is223", folders, projects), { name: "IS223", kind: "folder" });
  assert.deepEqual(tieTold("/p/secret-startup", folders, projects), { name: "a project", kind: "project" });
  assert.equal(tieTold("gone", folders, projects), null);
});

test("a world drawn with its own folders (the record's Home) tells Jev no folder's name or id at any pick; FolderHome's world is as before", async () => {
  const { toldAs, toldFolders, edgeTold, tiedMsg, opensMsg, formAsk } = await import("./home/world3d/ops.ts");
  const { whereJev, firstJev, formJev } = await import("./home/world3d/whereJev.ts");
  const { thingsOf, asks } = await import("./home/world3d/model.ts");
  const { parse } = await import("./home/folders/stickies.ts");
  // Noa's areas, named from what she typed, as OneHome passes them (ids are sort.ts's slugs of the names)
  const own = { folders: [{ id: "northwood", name: "Northwood", part: "school", rel: "northwood" }, { id: "bean-cafe", name: "Bean Cafe", part: "work", rel: "bean-cafe" }, { id: "zine-with-sam", name: "Zine with Sam", part: "build", rel: "zine-with-sam" }],
    parts: [{ id: "school", name: "school" }, { id: "work", name: "work" }, { id: "build", name: "projects" }] };
  const list = (md: string) => parse(md).items;
  const items: Record<string, string> = { northwood: "- [ ] Quiz 4 date\n  - needs you: which day\n- [ ] Read ch 3 ← now\n", "bean-cafe": "- [ ] Swap Friday shift\n  - needs you: who covers\n- [x] Clock in\n", "zine-with-sam": "- [ ] Draft cover\n" };
  const folders = own.folders.map((f) => ({ ...f, set: true, things: thingsOf(f.id, list(items[f.id])) }));
  const d = { parts: own.parts.map((p) => ({ ...p, folders: folders.filter((f) => f.part === p.id) })), projects: [{ id: "/p/site", name: "site", sessions: [{ id: "s1", title: "my first prompt", busy: true, waiting: true }] }] } as never as Parameters<typeof asks>[0];
  assert.ok(folders[0].things[0].id.startsWith("northwood#"), "the ids World3D holds are made from the name");
  const sent: object[] = [];
  const ask = async <T,>(o: object): Promise<T | null> => { sent.push(o); return null; };   // Jev stubbed: hears, answers nothing
  // pick 1 (agent.where), as World3D's loose(): the folders through toldFolders
  const tf = toldFolders(folders.map((f) => ({ ...f, things: f.things.slice(-5).map((x) => x.name) })), own);
  await whereJev(ask, "Bring apron", tf.folders);
  assert.equal(tf.real("f2"), "bean-cafe", "Jev's answer goes back to the folder it means"); assert.equal(tf.real("northwood"), null);
  // pick 2 (agent.first): the waiting stickies through edgeTold
  const want = asks(d), et = edgeTold(want, folders, own);
  assert.equal(et.things.length, 2); await firstJev(ask, et.things);
  assert.equal(et.real("t2"), "bean-cafe#0", "Jev's answer goes back to the sticky it means"); assert.equal(et.real("northwood#0"), null);
  // pick 4 (agent.tied): every pair of ends through tiedMsg
  const ids = [...folders.map((f) => f.id), "/p/site"];
  for (const a of ids) for (const b of ids) if (a < b) { const m = tiedMsg({ a, b, days: 3 }, folders, d.projects, own); if (m) await ask(m); }
  // pick 5 (agent.opens), with a record that went to an area's id
  const om = opensMsg(d, want, 9, ["school", "northwood", "edge"], own); assert.ok(om); await ask(om);
  assert.deepEqual(om.recent, ["school", "edge"]);
  // pick 6 (agent.form): each folder through formAsk
  for (const p of d.parts) for (const f of p.folders) await formJev(ask, formAsk(f, p.name, own));
  assert.equal(sent.length, 1 + 1 + 6 + 1 + 3);
  const heard = JSON.stringify(sent).toLowerCase();
  for (const n of ["Northwood", "Bean Cafe", "bean-cafe", "Zine with Sam", "zine-with-sam", "my first prompt"]) assert.ok(!heard.includes(n.toLowerCase()), `Jev never hears "${n}"`);
  assert.ok(heard.includes("swap friday shift"), "the stickies' titles still go, as the world's rule says");
  assert.deepEqual((sent[2] as { a: unknown }).a, { name: "school", kind: "folder" });
  assert.equal(toldAs({ name: "Northwood", part: "elsewhere" }, own), "a folder", "a part not in the list: still no name");
  assert.equal(toldAs({ name: "Northwood", part: "x" }, { parts: [{ id: "x", name: undefined as never }] }), "a folder", "never \"undefined\"");
  // FolderHome's world (no own): names and ids as before
  assert.equal(toldAs({ name: "IS223", part: "school" }), "IS223");
  assert.deepEqual(toldFolders([{ id: "is223", name: "IS223", part: "school", things: [] }]).folders, [{ id: "is223", name: "IS223", things: [] }]);
  const plain = edgeTold(want, folders); assert.deepEqual(plain.things.map((t) => t.id), ["northwood#0", "bean-cafe#0"]); assert.equal(plain.real("bean-cafe#0"), "bean-cafe#0");
  assert.deepEqual(tiedMsg({ a: "northwood", b: "/p/site", days: 3 }, folders, d.projects)?.a, { name: "Northwood", kind: "folder" });
  assert.deepEqual(opensMsg(d, want, 9, ["northwood"])?.recent, ["northwood"]);
  assert.equal(formAsk(folders[0], "school").name, "Northwood");
});

test("a tie whose name holds \" + \" round-trips (\" / \" between, which a folder's name cannot hold); an old \" + \" line still reads", async () => {
  const { tiesFromMd, worldMdTie, WORLD_OPEN, WORLD_CLOSE } = await import("./home/world3d/ops.ts");
  const on = worldMdTie(null, "R + D", "lab", true);
  assert.deepEqual(tiesFromMd(on), [["r + d", "lab"]]);
  assert.equal(worldMdTie(on, "lab", "R + D", false).includes("tied:"), false, "taken off by the same names");
  assert.deepEqual(tiesFromMd(`${WORLD_OPEN}\n- tied: IS223 + pathfinder\n${WORLD_CLOSE}\n`), [["is223", "pathfinder"]]);
});
