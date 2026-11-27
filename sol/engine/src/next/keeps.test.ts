// What the sidebar needs kept (next/keeps.ts, parts/next-keeps.ts; #1879 step 3), on a temp SOL_HOME: each of the four is
// kept across a reload, a broken file is set aside and the others stay, an empty account answers empty, and with ui.next
// off nothing is answered or written; another connection is refused.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-keeps-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });

const K = await import("./keeps.js");
const part = (await import("../parts/next-keeps.js")).default;

let n = 0;
const home = () => join(tmp, `h${++n}`);
const T = 1_800_000_000_000;
const ok = <X,>(r: ({ ok: true } & X) | { ok: false; why: string }): X => { assert.ok(r.ok, (r as { why?: string }).why); return r as X; };

test("an empty account: nothing kept, nothing written by a read", () => {
  const h = home(), k = K.readKeeps(h);
  assert.deepEqual([k.present, k.seen, k.pinned, k.uses], [null, {}, {}, {}]);
  assert.equal(existsSync(join(h, "next")), false);
});

test("last present is kept across a reload, at most once a minute, and says what it was before", () => {
  const h = home();
  assert.deepEqual(K.present(h, T), { ok: true, at: T, was: null });
  assert.deepEqual(K.present(h, T + 30_000), { ok: true, at: T, was: T }, "inside the minute: nothing written");
  assert.equal(K.readKeeps(h).present, T);
  assert.deepEqual(K.present(h, T + 90_000), { ok: true, at: T + 90_000, was: T });
  assert.equal(K.readKeeps(h).present, T + 90_000, "a reload reads it again");
});

test("seen is kept per piece across a reload; the newest 400 stay", () => {
  const h = home();
  ok(K.seen(h, { id: "s1" }, T));
  ok(K.seen(h, { id: "p1" }, T + 1));
  assert.equal(K.seen(h, {}, T).ok, false);
  const k = ok(K.seen(h, { id: "s1" }, T + 5));
  assert.deepEqual(K.readKeeps(h).seen, { s1: T + 5, p1: T + 1 });
  assert.deepEqual(k.seen, K.readKeeps(h).seen);
  for (let i = 0; i < K.MOST.seen + 5; i++) K.seen(h, { id: `x${i}` }, T + 100 + i);
  const kept = Object.keys(K.readKeeps(h).seen);
  assert.equal(kept.length, K.MOST.seen);
  assert.ok(kept.includes(`x${K.MOST.seen + 4}`) && !kept.includes("s1"));
});

test("pinned is kept across a reload, keeps its first time, and unpins", () => {
  const h = home();
  ok(K.pin(h, { id: "p1" }, T));
  ok(K.pin(h, { id: "p1" }, T + 10));
  ok(K.pin(h, { id: "s2" }, T + 20));
  assert.deepEqual(K.readKeeps(h).pinned, { p1: T, s2: T + 20 });
  ok(K.pin(h, { id: "p1", pinned: false }, T + 30));
  assert.deepEqual(K.readKeeps(h).pinned, { s2: T + 20 });
  assert.equal(K.pin(h, { id: "" }).ok, false);
});

test("a folder's last use is kept across a reload, at most once a minute per folder", () => {
  const h = home();
  ok(K.use(h, { folder: "api" }, T));
  ok(K.use(h, { folder: "api" }, T + 20_000));
  ok(K.use(h, { folder: "web" }, T + 20_000));
  assert.deepEqual(K.readKeeps(h).uses, { api: T, web: T + 20_000 });
  ok(K.use(h, { folder: "api" }, T + 120_000));
  assert.equal(K.readKeeps(h).uses.api, T + 120_000);
  assert.equal(K.use(h, { folder: 7 }).ok, false);
});

test("a broken file is set aside, never thrown away; the others are kept and the store starts fresh", () => {
  const h = home();
  ok(K.use(h, { folder: "api" }, T));
  ok(K.pin(h, { id: "p1" }, T));
  writeFileSync(K.keepFile(h, "seen"), "{ not json");
  writeFileSync(K.keepFile(h, "present"), "[1]");
  const k = K.readKeeps(h);
  assert.equal(k.aside?.length, 2);
  assert.deepEqual([k.present, k.seen, k.pinned, k.uses], [null, {}, { p1: T }, { api: T }]);
  const files = readdirSync(join(h, "next"));
  assert.ok(files.some((f) => f.startsWith("seen.broken-")) && files.some((f) => f.startsWith("present.broken-")));
  assert.deepEqual(ok(K.seen(h, { id: "s1" }, T)).seen, { s1: T });
  assert.equal(K.readKeeps(h).aside, undefined);
});

test("what is not an id with a time is left out of a file that was edited by hand", () => {
  const h = home();
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(K.keepFile(h, "uses"), JSON.stringify({ v: 1, folders: { api: T, bad: "x", neg: -1 } }));
  assert.deepEqual(K.readKeeps(h).uses, { api: T });
});

test("the part: off, nothing answered or written; on, only Sol's windows, and every window hears a change", async () => {
  const h = home(), hs = new Map<string, (m: unknown, c: unknown) => Promise<void>>(), sent: any[] = [], told: any[] = [];
  part({ on: (t: string, f: never) => hs.set(t, f) } as never);
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send() {}, everyone: (m: object) => told.push(m), face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = async (m: any, fromSol = true) => { sent.length = 0; await hs.get(m.type)!(m, conn(fromSol)); return sent.at(-1); };
  process.env.SOL_UI_NEXT = "off";
  assert.equal(await ask({ type: "next.use", folder: "api" }), undefined);
  assert.equal(existsSync(join(h, "next")), false);
  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(await ask({ type: "next.use", folder: "api" }, false), { type: "next.use", ok: false, why: "only Sol's own windows" });
  assert.equal(existsSync(join(h, "next")), false);
  const empty = await ask({ type: "next.keeps", rid: 1 });
  assert.deepEqual([empty.rid, empty.present, empty.seen, empty.pinned, empty.uses], [1, null, {}, {}, {}]);
  const r = await ask({ type: "next.pin", rid: 2, id: "p1" });
  assert.equal(r.rid, 2);
  assert.deepEqual(Object.keys(told.at(-1).pinned), ["p1"]);
  assert.equal(told.at(-1).type, "next.keeps");
  const p = await ask({ type: "next.present" });
  assert.equal(p.was, null);
  assert.equal(typeof p.at, "number");
  assert.equal((await ask({ type: "next.seen" })).ok, false);
});
