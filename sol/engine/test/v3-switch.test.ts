// Cowork v3's switch (fr-30 slice 8, eval E17): the dry run says per group what would be imported and writes nothing;
// the import writes signed "imported" events (the record's own kinds, a field `imported: {from, at}`), leaves the old
// record untouched and readable, and a second run imports nothing new; SOL's project gets cowork.v3 on at its project
// layer and no other project does; the env wins over everything. The sync runs on its timer only with the switch on.
// The cloud's trail is wired into the cloud's own server (sol/cloud/src/index.ts), started here in a child process on
// 127.0.0.1, and two Sols sync through it. Nothing leaves the machine.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-v3-switch-"));
const kids: ChildProcess[] = [];
after(() => { for (const k of kids) k.kill(); rmSync(dir, { recursive: true, force: true }); });

// this process is one Sol with the switch on by the env: its state, team and home are the test's own
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_COWORK_V3 = "on";
const ME = "marcocyl04-ux";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({
  me: { login: ME, name: "Marco" },
  rooms: [
    { id: "sol", name: "SOL", provider: "github", org: "sol-mif", repos: ["sol-mif/sol-record", "sol-mif/sol-dev"], record: "sol-mif/sol-record" },
    { id: "study", name: "Study", provider: "cloud", code: "BKQ2CL", hub: "wss://cloud.matterfold.tech/relay" },
  ],
}));
// today's Talk on this machine, as talk.ts keeps it
mkdirSync(join(dir, "state", "talk", "sol"), { recursive: true });
writeFileSync(join(dir, "state", "talk", "sol", "general.json"), JSON.stringify([
  { id: "t1", thread: "general", from: "franktsai2008-eng", at: Date.parse("2026-10-30T10:00:00Z"), text: "rooms stack is in", source: "relay" },
  { id: "t2", thread: "general", from: ME, at: Date.parse("2026-10-30T10:01:00Z"), text: "nice", source: "relay" },
]));
mkdirSync(join(dir, "state", "talk", "study"), { recursive: true });
writeFileSync(join(dir, "state", "talk", "study", "551.json"), JSON.stringify([{ id: "s1", thread: "#551", from: "isaac-sol", at: 1, text: "on it", source: "relay" }]));

const T = await import("../src/team/things.ts");
const C = await import("../src/team/calendar.ts");
const D = await import("../src/team/decisions.ts");
const Pl = await import("../src/team/polls.ts");
const G = await import("../src/team/goal.ts");
const Pg = await import("../src/team/pages.ts");
const SW = await import("../src/team/v3/switchwire.ts");
const { todaySource, projectOf } = await import("../src/team/v3/today.ts");
const { v3 } = await import("../src/team/v3/index.ts");
const { verify } = await import("../src/team/v3/trail.ts");
const { fold, settingOf } = await import("../src/team/v3/record.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { Keys } = await import("../src/team/v3/keys.ts");
const { Sync, httpCloud } = await import("../src/team/v3/sync.ts");

// SOL's record today, sol-mif/sol-record: every .sol file a fake GitHub serves, sha by content; any write is refused
// and counted, so "untouched" is a fact
const at = "2026-10-20T09:00:00.000Z";
const files = new Map<string, string>();
const put = (path: string, text: string) => files.set(path, text);
put(T.THINGS_PATH, T.serialize(T.apply(T.apply({ v: 1, things: [] }, { add: { url: "https://www.figma.com/file/abc/Sidebar", by: "isaac-sol", at } }).file, { add: { url: "https://docs.google.com/document/d/xyz/edit", by: ME, at, agent: true } }).file));
put(C.CAL_PATH, C.serializeCalendar(C.applyCalendar(C.parseCalendar(""), { add: { title: "Dev release", start: "2026-11-01T13:00:00Z", by: ME, at } }).file));
put(D.DECISIONS_PATH, D.serializeLog(D.applyLog(D.parseLog(""), { add: { title: "Rooms stack is Frank's", lines: "final say", by: "franktsai2008-eng", at } }).file));
put(Pl.POLLS_PATH, Pl.serializePolls(Pl.applyPolls(Pl.parsePolls(""), { add: { question: "Ship v3?", options: ["yes", "not yet"], by: ME, at } }).file));
put(G.GOAL_PATH, G.serializeGoal({ title: "One window for all your AI", lines: "beta by December", setBy: ME, at }));
for (const f of Pg.pageFiles({ id: "what-to-try", title: "What to try", made: "isaac-sol", by: "isaac-sol", at }, "Open Cowork.\n")) put(f.path, f.text);
const sha = (t: string) => (Buffer.from(t).toString("hex") + "0".repeat(40)).slice(0, 40);
const writes: string[] = [];
const notFound = () => Object.assign(new Error("gh: Not Found (HTTP 404)"), { full: "gh: Not Found (HTTP 404)" });
const fakeFiles = {
  async branch() { return "main"; },
  async readSha(_repo: string, path: string) { const t = files.get(path); if (t === undefined) throw notFound(); return JSON.stringify({ sha: sha(t), content: Buffer.from(t).toString("base64") }); },
  async list(_repo: string, d: string) {
    const l = [...files.keys()].filter((p) => p.startsWith(`${d}/`)).map((p) => ({ name: p.slice(d.length + 1), sha: sha(files.get(p)!), size: files.get(p)!.length, type: "file" }));
    if (!l.length) throw notFound();
    return JSON.stringify(l);
  },
};
const record = () => ({ files: new Proxy(fakeFiles, { get: (t, k: string) => (k in t ? (t as any)[k] : async () => { writes.push(k); throw new Error("refused: the import never writes"); }) }) }) as any;
const before = new Map(files);
let reads = 0;
SW._setSource(() => todaySource({ me: () => ME, deps: (r) => { reads++; return r === "sol-mif/sol-record" ? { record } : null; }, talkDir: join(dir, "state", "talk") }));

test("E17: the dry run says per group what would be imported, and writes nothing", async () => {
  const r = await SW.answerSwitch({ type: "team.v3.migrate.dry", rid: 1 }, ME) as any;
  assert.equal(r.type, "team.v3.migrate.dry");
  assert.equal(r.rid, 1);
  const [sol, study] = r.report.groups;
  assert.equal(sol.project, "sol");
  assert.equal(sol.record, "sol-mif/sol-record");
  assert.equal(sol.sol, true);
  assert.deepEqual(sol.counts, { items: 4, things: 2, members: 3, places: 2, pages: 1, talk: 2 }, "a date, a decision, a poll, the goal; two things; three people; the record and sol-dev; a page; two lines");
  assert.equal(sol.turnsOn, true, "SOL's project turns v3 on");
  assert.equal(study.project, "BKQ2CL", "a cloud group's project is its code");
  assert.equal(study.turnsOn, false);
  assert.deepEqual(study.counts, { items: 0, things: 0, members: 2, places: 1, pages: 0, talk: 1 });
  assert.deepEqual(study.unread, ["the record: this Sol cannot read it yet (its store is not wired)"]);
  assert.match(r.line, /^4 items, 2 things, 5 members, 3 places, 1 page, 3 Talk messages$/);
  assert.deepEqual(v3().trail.since("sol", 0), [], "nothing on the trail");
  assert.deepEqual(writes, []);
});

test("E17: the import writes signed imported events, leaves the old record as it was, and a second run imports nothing", async () => {
  const r = await SW.answerSwitch({ type: "team.v3.migrate.run", rid: 2 }, ME) as any;
  assert.deepEqual(r.report.groups[0].counts, { items: 4, things: 2, members: 3, places: 2, pages: 1, talk: 2 });
  assert.equal(r.report.run, true);
  const { trail } = v3();
  const events = trail.since("sol", 0);
  assert.equal(events.length, 4 + 2 + 3 + 2 + 1 + 2 + 1, "one an object, and the switch");
  const v = verify(events);
  assert.deepEqual(v.bad, [], "every one signed and chained");
  assert.ok(events.every((e) => e.by.person === ME && e.cert?.kind === "machine"), "signed by the importer on this machine");
  const kinds = new Set(events.map((e) => e.kind));
  assert.deepEqual([...kinds].sort(), ["artifact", "item", "loose", "member", "place", "setting", "talk"]);
  for (const e of events.filter((x) => x.kind !== "setting")) {
    const imp = (e.value as any).imported;
    assert.ok(imp && typeof imp.from === "string" && typeof imp.at === "number", `${e.kind} ${e.item} names where it came from`);
  }
  const thing = events.find((e) => e.kind === "loose" && (e.value as any).url?.includes("figma"))!;
  assert.match((thing.value as any).imported.from, /^sol-mif\/sol-record:\.sol\/things\.json@[0-9a-f]{12}$/);
  assert.equal((thing.value as any).imported.at, Date.parse(at));
  const rec = fold(trail.check("sol").ok);
  assert.equal(Object.values(rec.items).find((o) => o.fields.type === "goal")?.fields.title, "One window for all your AI");
  assert.equal(Object.keys(rec.loose).length, 2);
  assert.deepEqual(Object.keys(rec.members).sort(), ["franktsai2008-eng", "isaac-sol", ME].sort());
  assert.equal(settingOf(rec, "cowork.v3", "franktsai2008-eng"), true, "SOL's project: v3 on at the project layer, for everyone in it");
  assert.equal(settingOf(fold(trail.check("BKQ2CL").ok), "cowork.v3", ME), undefined, "no other project");
  const talk = events.filter((e) => e.kind === "talk").map((e) => (e.value as any).text);
  assert.deepEqual(talk, ["rooms stack is in", "nice"]);
  // the old record: not one write, every file as it was, and today's own stores still read it
  assert.deepEqual(writes, []);
  assert.deepEqual([...files], [...before]);
  assert.equal((await T.readThings({ record }, "sol-mif/sol-record")).file.things.length, 2, "today's things read as before");
  assert.equal((await D.decisions.read({ record }, "sol-mif/sol-record")).file.decisions[0].title, "Rooms stack is Frank's");
  // again: nothing new
  const n = trail.since("sol", 0).length;
  const dry = await SW.answerSwitch({ type: "team.v3.migrate.dry" }, ME) as any;
  assert.equal(dry.line, "nothing new");
  assert.equal(dry.report.total, 0);
  assert.deepEqual(dry.report.groups[0].already, { items: 4, things: 2, members: 3, places: 2, pages: 1, talk: 2 });
  const again = await SW.answerSwitch({ type: "team.v3.migrate.run" }, ME) as any;
  assert.equal(again.report.total, 0);
  assert.equal(trail.since("sol", 0).length, n, "a second run imports nothing new");
  assert.ok(reads >= 4);
});

test("E17: an imported object a person changed or erased since is never imported again", async () => {
  const { trail, keys } = v3();
  const page = trail.since("sol", 0).find((e) => e.kind === "artifact")!;
  assert.ok(trail.erase(page.id, { person: ME, machine: keys.machineName }));
  const r = await SW.answerSwitch({ type: "team.v3.migrate.dry" }, ME) as any;
  assert.equal(r.report.groups[0].counts.pages, 0);
});

test("the switch per project: the env wins; else my switch, then the project's own layers; off by default", () => {
  const { trail } = v3();
  assert.equal(SW.v3OnFor(trail, "sol", ME, { env: "", mine: true }), true, "SOL's project: on by its project layer");
  assert.equal(SW.v3OnFor(trail, "BKQ2CL", ME, { env: "", mine: true }), false, "another project: off by default");
  assert.equal(SW.v3OnFor(trail, "sol", ME, { env: "", mine: false }), false, "my switch off: nothing");
  assert.equal(SW.v3OnFor(trail, "BKQ2CL", ME, { env: "on", mine: false }), true, "the env on: every project");
  assert.equal(SW.v3OnFor(trail, "sol", ME, { env: "off", mine: true }), false, "the env off: none");
  // a person's own layer can turn it off for themselves in SOL's project
  const franks = new Trail({ file: ":memory:", keys: new Keys(join(dir, "frank-keys"), "frank-mac") });
  const off = franks.append({ project: "sol", by: { person: "franktsai2008-eng", machine: "frank-mac" }, kind: "setting", item: "me:franktsai2008-eng", field: "cowork.v3", value: false });
  assert.deepEqual(trail.merge([off]).bad, [], "frank's own word, from his Sol");
  assert.equal(SW.v3OnFor(trail, "sol", "franktsai2008-eng", { env: "", mine: true }), false);
  assert.equal(SW.v3OnFor(trail, "sol", ME, { env: "", mine: true }), true);
});

test("team.v3.on says the switch and each project; a bad project is refused", async () => {
  const r = await SW.answerSwitch({ type: "team.v3.on", rid: 9 }, ME) as any;
  assert.equal(r.on, true);
  assert.equal(r.env, "on");
  assert.deepEqual(r.projects.map((p: any) => [p.project, p.on]), [["sol", true], ["BKQ2CL", true]]);
  assert.match((await SW.answerSwitch({ type: "team.v3.on", project: "../x" }, ME) as any).error, /which project/);
  assert.equal(projectOf({ id: "Lea's room", code: "" }), "lea-s-room");
});

test("the sync timer: on, each cloud project pushes what waits and pulls since; off, a tick does nothing", async () => {
  const calls: string[] = [];
  const cloud = {
    async append(project: string, events: any[]) { calls.push(`append ${project} ${events.length}`); return { kept: events.map((e) => e.id), refused: [] }; },
    async since(project: string, seq: number) { calls.push(`since ${project} ${seq}`); return { events: [], seq }; },
  };
  SW.startV3Sync({ cloudOf: (room) => (room.code ? cloud : null) });
  assert.equal(SW.syncRunning(), true);
  const { trail, keys } = v3();
  trail.append({ project: "BKQ2CL", by: { person: ME, machine: keys.machineName }, kind: "item", item: "x", value: { title: "x" } });
  process.env.SOL_COWORK_V3 = "off";
  assert.deepEqual(await SW.syncTick(), [], "the switch off: no round");
  assert.deepEqual(calls, [], "and not one call to the cloud");
  process.env.SOL_COWORK_V3 = "on";
  const t = await SW.syncTick();
  assert.deepEqual(t.map((x) => x.project), ["BKQ2CL"], "only the cloud group (the cloud's trail is a room's code)");
  assert.ok(t[0].sent >= 4, "the import's events and the new one went");
  assert.ok(calls.some((c) => c.startsWith("since BKQ2CL")));
  assert.equal(trail.waiting("BKQ2CL").length, 0);
  SW.stopV3Sync();
  assert.equal(SW.syncRunning(), false);
});

test("migrate_v3: the agent's tool, there with the switch on, a dry run unless run is true", async () => {
  const W = await import("../src/work/tools.ts");
  const t = W.WORK_TOOLS.find((x) => x.name === "migrate_v3");
  assert.ok(t, "offered with the switch on");
  const r = await W.runWorkTool("migrate_v3", {}, "s1");
  assert.equal(r.isError, undefined);
  assert.match(r.content[0].text, /^Dry run, nothing written: nothing new in 2 groups\. The old record is untouched\./);
  process.env.SOL_COWORK_V3 = "off";
  assert.equal((await W.runWorkTool("migrate_v3", {}, "s1")).isError, true, "the switch read again on every call");
  process.env.SOL_COWORK_V3 = "on";
});

// ---- the cloud's own server with the trail wired in, in a child process (it needs @sol/hub: the engine's src/hub) ----
test("the cloud: the trail route is wired behind the rooms' gate; two Sols sync through it", { timeout: 60_000 }, async () => {
  const data = join(dir, "cloud");
  mkdirSync(data, { recursive: true });
  const ts = join(dir, "tsconfig.json");
  writeFileSync(ts, JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext", target: "es2023", allowImportingTsExtensions: true, paths: { "@sol/hub": [join(ENGINE, "src", "hub", "index.ts")] } } }));
  const main = join(dir, "cloud.mts");
  const CLOUD = join(ENGINE, "..", "cloud", "src");
  writeFileSync(main, `const { startCloud } = await import(${JSON.stringify(join(CLOUD, "index.ts"))});
const { configOf } = await import(${JSON.stringify(join(CLOUD, "config.ts"))});
const c = await startCloud({ ...configOf({ SOL_CLOUD_DATA: ${JSON.stringify(data)} }), port: 0 }, { heartbeat: 0, sample: 0 });
console.log(JSON.stringify({ port: c.port }));
process.on("SIGTERM", () => { void c.close().then(() => process.exit(0)); });
`);
  const kid = spawn(process.execPath, ["--import", "tsx", main], { cwd: ENGINE, env: { ...process.env, TSX_TSCONFIG_PATH: ts }, stdio: ["ignore", "pipe", "pipe"] });
  kids.push(kid);
  let out = "", err = "";
  kid.stderr!.on("data", (b) => { err += b; });
  const port = await new Promise<number>((ok, no) => {
    kid.stdout!.on("data", (b) => { out += b; const m = /\{"port":(\d+)\}/.exec(out); if (m) ok(Number(m[1])); });
    kid.once("exit", (c) => no(new Error(`the cloud stopped (${c}): ${err.slice(-400)}`)));
  });
  const { Proofs } = await import("../src/hub/index.ts");
  for (let i = 0; i < 50 && !existsSync(join(data, "relay", "proof.key")); i++) await new Promise((r) => setTimeout(r, 100));
  const proofs = new Proofs(join(data, "relay", "proof.key"));
  const ticket = (who: string) => proofs.sign(who, "", Date.now() + 60_000);
  const BASE = `http://127.0.0.1:${port}`;
  const made = await (await fetch(`${BASE}/relay/rooms`, { method: "POST", headers: { authorization: `Bearer ${ticket(ME)}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Study", provider: "cloud" }) })).json() as { code: string };
  const code = made.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await fetch(`${BASE}/relay/rooms/${code}`, { headers: { authorization: `Bearer ${ticket("franktsai2008-eng")}` } })).status, 200, "frank joins by the code");

  const keyDir = join(dir, "cloud-keys");
  const marco = new Trail({ file: join(dir, "m.db"), keys: new Keys(keyDir, "marco-mac") });
  const frank = new Trail({ file: join(dir, "f.db"), keys: new Keys(keyDir, "frank-mac") });
  const e = marco.append({ project: code, by: { person: ME, machine: "marco-mac" }, kind: "item", item: "logo", value: { title: "Logo review" } });
  const sm = new Sync(marco, httpCloud({ base: BASE, ticket: () => ticket(ME) }));
  const sf = new Sync(frank, httpCloud({ base: BASE, ticket: () => ticket("franktsai2008-eng") }));
  const pushed = await sm.push(code);
  assert.deepEqual([pushed.sent, pushed.waiting, pushed.away], [1, 0, undefined], JSON.stringify(pushed));
  const pulled = await sf.pull(code);
  assert.deepEqual(pulled.added.map((x) => x.id), [e.id]);
  assert.equal(fold(frank.check(code).ok).items.logo.fields.title, "Logo review");
  // the rooms' gate: no ticket 403; not a member, the same 404 as no room
  assert.equal((await fetch(`${BASE}/relay/rooms/${code}/trail?since=0`)).status, 403);
  const isaac = await fetch(`${BASE}/relay/rooms/${code}/trail?since=0`, { headers: { authorization: `Bearer ${ticket("isaac-sol")}` } });
  const none = await fetch(`${BASE}/relay/rooms/ZZZZZZ/trail?since=0`, { headers: { authorization: `Bearer ${ticket("isaac-sol")}` } });
  assert.deepEqual([isaac.status, none.status], [404, 404]);
  // a lower-case code is the same room
  const lower = await (await fetch(`${BASE}/relay/rooms/${code.toLowerCase()}/trail?since=0`, { headers: { authorization: `Bearer ${ticket(ME)}` } })).json() as { events: unknown[] };
  assert.equal(lower.events.length, 1);
  marco.close(); frank.close();
});
