// The log's narrow look (#691 step 3): GET /log?kinds=<families> answers only those families' events, since=-1 answers
// the newest seq alone, and the kernel says a page or an ask.md edited in place (plugin.edited), so the face can read
// /things again only on the steps that can change it. All of it behind the switch log.kinds (SOL_LOG_KINDS first),
// off by default: off, the answer is the one it always was. The last test runs a real engine on its own port and home.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logAnswer, PAGE, type AnyEv } from "../src/log.ts";
import { Kernel } from "./kernels.ts";
import { freePort, ownHealth } from "./test-engine.ts";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "sol-log-kinds-")); dirs.push(d); return d; };

/** a log of n events whose kinds go round the list, as logAnswer is handed it (a page at most, as the kernel's) */
function stub(n: number, round: string[]) {
  const all = Array.from({ length: n }, (_, i) => ({ seq: i + 1, kind: round[i % round.length] }) as unknown as AnyEv);
  return { since: (s: number) => all.filter((e) => e.seq > s).slice(0, PAGE), lastSeq: () => n };
}
const q = (o: Record<string, string>) => new URLSearchParams(o);
const ROUND = ["seat.step", "seat.turn", "plugin.write", "tool.call", "undo.did", "key.pasted", "engine.start", "load"];

test("off (the default): kinds= and since=-1 change nothing, the answer is the one it always was", () => {
  const k = stub(16, ROUND);
  const all = logAnswer(k, q({ since: "0" }));
  assert.equal(all.events.length, 16);
  assert.deepEqual(logAnswer(k, q({ since: "0", kinds: "plugin,undo,key" })), all, "kinds= is not read");
  assert.deepEqual(logAnswer(k, q({ since: "-1" })), all, "since=-1 is from the start, as before");
  assert.ok(!("kinds" in all));
});

test("on: kinds= keeps only those families and says them back; since=-1 is the newest seq alone", () => {
  const k = stub(16, ROUND);
  const a = logAnswer(k, q({ since: "0", kinds: "plugin,undo,key" }), true) as { last: number; events: AnyEv[]; kinds?: string[]; next?: number };
  assert.deepEqual(a.events.map((e) => e.kind), ["plugin.write", "undo.did", "key.pasted", "plugin.write", "undo.did", "key.pasted"]);
  assert.deepEqual(a.kinds, ["plugin", "undo", "key"]);
  assert.equal(a.last, 16);
  assert.equal(a.next, undefined);
  assert.deepEqual(logAnswer(k, q({ since: "-1", kinds: "plugin" }), true), { last: 16, events: [] });
  assert.deepEqual(logAnswer(k, q({ since: "-1" }), true), { last: 16, events: [] });
  // a v0 line whose old name has no row (no dot) is in no family, so never kept by a filter
  assert.ok(!a.events.some((e) => e.kind === "load"));
  // none named, or nothing that is a family: every event, as off
  assert.deepEqual(logAnswer(k, q({ since: "0" }), true), logAnswer(k, q({ since: "0" })));
  assert.deepEqual(logAnswer(k, q({ since: "0", kinds: "Plugin.*, " }), true), logAnswer(k, q({ since: "0" })));
  // since past the newest: nothing, last as it is
  assert.deepEqual(logAnswer(k, q({ since: "99", kinds: "plugin" }), true), { last: 16, events: [], kinds: ["plugin"] });
});

test("on: the page is cut where it is cut without kinds, so next is the same and an empty page still says it", () => {
  // two pages of seat steps, with one plugin.write past the first page
  const n = PAGE * 2;
  const k = stub(n, ["seat.step"]);
  const kinds = (k as any).since;
  (k as any).since = (s: number) => kinds(s).map((e: AnyEv) => (e.seq === PAGE + 7 ? { ...e, kind: "plugin.write" } : e));
  const plain = logAnswer(k, q({ since: "0" }));
  const one = logAnswer(k, q({ since: "0", kinds: "plugin" }), true) as { events: AnyEv[]; next?: number };
  assert.equal(one.events.length, 0, "nothing of plugin's on the first page");
  assert.equal(one.next, (plain as { next?: number }).next, "and the same next");
  assert.equal(one.next, PAGE);
  const two = logAnswer(k, q({ since: String(one.next), kinds: "plugin" }), true) as { events: AnyEv[]; next?: number };
  assert.deepEqual(two.events.map((e) => e.seq), [PAGE + 7]);
  assert.equal(two.next, undefined);
});

/** a home with one block of its own: a record, its page and its ask, no engine half */
function home() {
  const h = tmp();
  const d = join(h, "things", "note");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id: "note", title: "note", place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-13", contract: 1 }] }));
  writeFileSync(join(d, "v1.html"), "<p>one</p>");
  writeFileSync(join(d, "ask.md"), "a note");
  return { h, d, lab: { logDir: join(h, "lab-log"), appDir: join(h, "app"), mirror: null } };
}
const kindsOf = (k: Kernel, since: number) => k.since(since).map((e) => `${e.kind}${e.item ? ` ${e.item}` : ""}`);

test("on: a page or an ask edited in place is said once, as plugin.edited, and loads nothing again", async () => {
  const { h, d, lab } = home();
  const k = new Kernel(h, { ...lab, edits: () => true });
  await k.sync();
  const s0 = k.lastSeq();
  await k.sync();
  assert.deepEqual(kindsOf(k, s0), [], "nothing changed, nothing said");
  writeFileSync(join(d, "v1.html"), "<p>two</p>");
  await k.sync();
  const e1 = k.since(s0);
  assert.deepEqual(e1.map((e) => `${e.kind} ${e.item}`), ["plugin.edited note"]);
  assert.deepEqual((e1[0] as { value?: unknown }).value, { page: true, ask: false });
  const s1 = k.lastSeq();
  await k.sync();
  assert.deepEqual(kindsOf(k, s1), [], "said once");
  writeFileSync(join(d, "ask.md"), "a note, asked again");
  await k.sync();
  const e2 = k.since(s1);
  assert.deepEqual(e2.map((e) => (e as { value?: unknown }).value), [{ page: false, ask: true }]);
  // a new version is a change to the record: it loads again, and that is what is said, not plugin.edited
  const s2 = k.lastSeq();
  writeFileSync(join(d, "v2.html"), "<p>three</p>");
  writeFileSync(join(d, "record.json"), JSON.stringify({ id: "note", title: "note", place: "card", reads: [], writes: [], current: 2, versions: [{ v: 1, file: "v1.html", at: "2026-11-13", contract: 1 }, { v: 2, file: "v2.html", at: "2026-11-13", contract: 1 }] }));
  await k.sync();
  const e3 = kindsOf(k, s2);
  assert.ok(e3.includes("plugin.load note"), e3.join(", "));
  assert.ok(!e3.some((x) => x.startsWith("plugin.edited")), e3.join(", "));
  await k.stop();
});

test("off: a page edited in place writes nothing, as before", async () => {
  const { h, d, lab } = home();
  const k = new Kernel(h, lab);
  await k.sync();
  const s0 = k.lastSeq();
  writeFileSync(join(d, "v1.html"), "<p>two</p>");
  writeFileSync(join(d, "ask.md"), "changed");
  await k.sync();
  assert.deepEqual(kindsOf(k, s0), []);
  await k.stop();
});

test("on: a tool a block registers after its load is said, as plugin.tools; off, it is not", async () => {
  for (const on of [true, false]) {
    const { h, d, lab } = home();
    // registered late, then the same again: said once
    writeFileSync(join(d, "engine.js"), `export default function (sol) { const t = () => sol.tool({ name: "late", description: "a late one", args: {}, run: () => "ok" }); setTimeout(t, 150); setTimeout(t, 250); }`);
    const k = new Kernel(h, { ...lab, edits: () => on });
    await k.sync();
    let said: AnyEv[] = [];
    for (let i = 0; i < 40 && !k.tools().length; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    said = k.since(0).filter((e) => e.kind === "plugin.tools");
    assert.equal(k.tools().length, 1, "the tool is there either way");
    if (on) assert.deepEqual(said.map((e) => [e.item, (e as { value?: unknown }).value]), [["note", { tools: ["thing_note_late"] }]]);
    else assert.deepEqual(said, []);
    await k.stop();
  }
});

test("on: a broken block that goes is said (plugin.unload); off, as before, nothing", async () => {
  for (const on of [true, false]) {
    const { h, d, lab } = home();
    writeFileSync(join(d, "record.json"), "{ not json");
    const k = new Kernel(h, { ...lab, edits: () => on });
    await k.sync();
    assert.ok(kindsOf(k, 0).includes("plugin.broken note"));
    const s0 = k.lastSeq();
    rmSync(d, { recursive: true, force: true });
    await k.sync();
    assert.deepEqual(kindsOf(k, s0), on ? ["plugin.unload note"] : []);
    await k.stop();
  }
});

test("a real engine: with SOL_LOG_KINDS=on, GET /log narrows; with it unset, the answer is as before", async () => {
  const run = async (narrow: boolean) => {
    const dir = tmp(), h = join(dir, "home");
    mkdirSync(h);
    cpSync(join(ENGINE, "..", "design", "system", "fixtures", "things"), join(h, "things"), { recursive: true });
    const PORT = await freePort();
    const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: ENGINE, stdio: "ignore",
      env: {
        ...process.env, SOL_PORT: String(PORT), SOL_HOME: h, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
        SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_LOGDIR: join(dir, "log"), SOL_SETTINGS: join(dir, "settings.json"),
        SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_FRAME: "on", SOL_APPDIR: join(dir, "app"),
        SOL_LOG_KINDS: narrow ? "on" : "",
        SOL_VERSION: "complete",   // unset reads as a tester's: a sol-dev checkout runs as the team's, where it stands on (#1406)
      },
    });
    try {
      await ownHealth(engine, PORT);
      const get = async (p: string) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json() as Promise<any>;
      let all: any = null;
      for (let i = 0; i < 150 && !all?.events?.some((e: any) => e.kind === "plugin.load"); i++) { all = await get("/log?since=0"); await new Promise((r) => setTimeout(r, 200)); }
      assert.ok(all.events.some((e: any) => e.kind === "engine.start" || e.kind.startsWith("engine.")), "the start's own lines are on it");
      const head = await get("/log?since=-1");
      const some = await get("/log?since=0&kinds=plugin,undo,key");
      return { all, head, some };
    } finally { engine.kill(); }
  };
  const on = await run(true);
  assert.deepEqual(on.head.events, []);
  assert.ok(on.head.last >= on.all.last);
  assert.deepEqual(on.some.kinds, ["plugin", "undo", "key"]);
  assert.ok(on.some.events.length > 0 && on.some.events.every((e: any) => /^(plugin|undo|key)\./.test(e.kind)), on.some.events.map((e: any) => e.kind).join(", "));
  assert.ok(on.some.events.length < on.all.events.length, "the engine's own start lines are left out");
  const off = await run(false);
  assert.ok(off.head.events.length > 0, "since=-1 off is from the start, as before");
  assert.equal(off.some.kinds, undefined);
  assert.equal(off.some.events.length, off.all.events.length);
});
