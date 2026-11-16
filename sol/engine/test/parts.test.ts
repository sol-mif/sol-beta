// Parts (#934): a new part of the engine is a file in src/parts/, not a line in index.ts. The registry (src/parts.ts)
// loads every file of a folder; a part's route and message answer as index.ts asks them; two parts that answer the same
// thing stop the load naming both files, whichever loads first; and index.ts may not grow past its ceiling.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Parts, type Engine, type Heard } from "../src/parts.ts";

// index.ts's lines, as `wc -l` counts them. A PR that makes it shorter lowers this number with it; none raises it.
const CEILING = 1334;

const root = mkdtempSync(join(tmpdir(), "sol-parts-"));
writeFileSync(join(root, "package.json"), `{ "type": "module" }`);   // as the engine's own package: a part is ESM
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
/** a folder of parts: { "name.ts": source } */
function folder(files: Record<string, string>) {
  const dir = join(root, `p${n++}`);
  mkdirSync(dir);
  for (const [f, src] of Object.entries(files)) writeFileSync(join(dir, f), src);
  return dir;
}
const sent: { to: unknown; msg: any }[] = [];
const told: object[] = [];
const engine: Engine = { HOME: "/home-of-the-test", PORT: 1, send: (ws, msg) => sent.push({ to: ws, msg }), everyone: (m) => told.push(m) };

test("a part with one route and one message answers both, as index.ts asks them", async () => {
  const dir = folder({
    "hello.ts": `export default function (p) {
      p.route("GET", "/hello", ({ res, HOME }) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("hello from " + HOME); });
      p.route("POST", /^\\/hello\\/([a-z]+)$/, ({ res, match }) => { res.writeHead(201); res.end(match[1]); });
      p.on("hello.there", (m, { ws, send }) => send(ws, { type: "hello.back", n: m.n }));
    }`,
  });
  const p = new Parts();
  assert.deepEqual(await p.load(dir, engine), ["parts/hello.ts"]);
  // the HTTP handler's two lines in index.ts, after the door; anything no part takes goes on to index.ts's own routes
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    const asked = p.asked(req.method, path);
    if (asked) return asked({ ...engine, req, res, path });
    res.writeHead(404); res.end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const at = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const a = await fetch(`${at}/hello?x=1`);
    assert.equal(a.status, 200);
    assert.equal(await a.text(), "hello from /home-of-the-test");
    const b = await fetch(`${at}/hello/moon`, { method: "POST" });
    assert.equal(b.status, 201);
    assert.equal(await b.text(), "moon");
    assert.equal((await fetch(`${at}/hello`, { method: "POST" })).status, 404, "another method is not the route");
    assert.equal((await fetch(`${at}/hello/`)).status, 404);
  } finally { server.close(); }
  // the socket's: the end of index.ts's cases asks the registry
  const ws = { readyState: 1, send: () => {} };
  const heard = p.heard("hello.there");
  assert.ok(heard);
  await heard!({ type: "hello.there", n: 7 }, { ...engine, ws, face: { send: () => {} }, conn: { chars: 0 }, fromSol: true, fromApp: false } as unknown as Heard);
  assert.deepEqual(sent.at(-1), { to: ws, msg: { type: "hello.back", n: 7 } });
  assert.equal(p.heard("hello.where"), null);
  assert.equal(p.heard(undefined), null);
});

test("a prefix takes every type it starts; an exact type is only itself", async () => {
  const p = new Parts();
  await p.load(folder({ "b.ts": `export default function (p) { p.on("box.", () => "box"); p.on("boxes", () => "boxes"); }` }), engine);
  assert.equal(p.heard("box.open")?.({}, {} as Heard), "box");
  assert.equal(p.heard("boxes")?.({}, {} as Heard), "boxes");
  assert.equal(p.heard("box"), null);
});

async function refused(files: Record<string, string>) {
  const err = await new Parts().load(folder(files), engine).then(() => null, (e: Error) => e);
  assert.ok(err, "the load should stop");
  return err!.message;
}

test("the same route twice stops the load, naming both files, whichever loads first", async () => {
  const one = `export default function (p) { p.route("GET", "/twice", () => {}); }`;
  for (const [a, b] of [["a-first.ts", "z-last.ts"], ["z-last.ts", "a-first.ts"]]) {
    const why = await refused({ [a]: one, [b]: one });
    assert.match(why, /GET \/twice/);
    assert.match(why, /parts\/a-first\.ts/);
    assert.match(why, /parts\/z-last\.ts/);
  }
  // a pattern that takes a path another part routes, either way round
  const exact = `export default function (p) { p.route("GET", "/pane/x", () => {}); }`;
  const pattern = `export default function (p) { p.route("GET", /^\\/pane\\//, () => {}); }`;
  for (const files of [{ "a.ts": exact, "b.ts": pattern }, { "a.ts": pattern, "b.ts": exact }]) {
    const why = await refused(files);
    assert.match(why, /parts\/a\.ts/);
    assert.match(why, /parts\/b\.ts/);
  }
  // the same path on another method is another route
  const p = new Parts();
  await p.load(folder({ "a.ts": one, "b.ts": `export default function (p) { p.route("POST", "/twice", () => {}); }` }), engine);
  assert.ok(p.asked("GET", "/twice") && p.asked("POST", "/twice"));
});

test("the same message twice stops the load, naming both files; so does a prefix over a type", async () => {
  const why = await refused({
    "one.ts": `export default function (p) { p.on("work.say", () => {}); }`,
    "two.ts": `export default function (p) { p.on("work.say", () => {}); }`,
  });
  assert.match(why, /work\.say/);
  assert.match(why, /parts\/one\.ts/);
  assert.match(why, /parts\/two\.ts/);
  for (const files of [
    { "one.ts": `export default function (p) { p.on("work.", () => {}); }`, "two.ts": `export default function (p) { p.on("work.say", () => {}); }` },
    { "one.ts": `export default function (p) { p.on("work.say", () => {}); }`, "two.ts": `export default function (p) { p.on("work.", () => {}); }` },
    { "one.ts": `export default function (p) { p.on("work.", () => {}); }`, "two.ts": `export default function (p) { p.on("work.box.", () => {}); }` },
  ]) {
    const w = await refused(files);
    assert.match(w, /parts\/one\.ts/);
    assert.match(w, /parts\/two\.ts/);
  }
});

test("the loader takes the parts beside the running file: no .d.ts, maps, tests or the other build's files", async () => {
  const boom = `throw new Error("this file must not load")`;
  const p = new Parts();
  const dir = folder({
    "real.ts": `export default function (p) { p.on("real", () => "real"); }`,
    "real.d.ts": boom, "real.test.ts": boom, "real.ts.map": boom, "built.js": boom, "built.js.map": boom, "notes.md": boom,
  });
  assert.deepEqual(await p.load(dir, engine), ["parts/real.ts"]);
  assert.equal(p.heard("real")?.({}, {} as Heard), "real");
});

test("a part with no default export stops the load, named; nothing registers outside a load", async () => {
  const why = await refused({ "lost.ts": `export const x = 1;` });
  assert.match(why, /parts\/lost\.ts has no default export/);
  const p = new Parts();
  await p.load(folder({}), engine);
  assert.throws(() => p.route("GET", "/late", () => {}), /outside a part's load/);
  assert.throws(() => p.on("late", () => {}), /outside a part's load/);
  await assert.rejects(p.load(folder({}), engine), /loaded twice/);
});

test("atStart runs once every part is loaded, with what index.ts hands out", async () => {
  const p = new Parts();
  const seen: string[] = [];
  (globalThis as any).__partsSeen = seen;
  await p.load(folder({
    "a.ts": `export default function (p) { p.atStart((e) => globalThis.__partsSeen.push("a:" + e.HOME + ":" + String(!!p.heard("b")))); }`,
    "b.ts": `export default function (p) { p.on("b", () => {}); }`,
  }), engine);
  assert.deepEqual(seen, ["a:/home-of-the-test:true"]);
  delete (globalThis as any).__partsSeen;
});

test("index.ts may not grow: a new part is a file in sol/engine/src/parts/", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "src", "index.ts"), "utf8");
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  assert.ok(lines <= CEILING,
    `sol/engine/src/index.ts has ${lines} lines, its ceiling is ${CEILING}: add a file in sol/engine/src/parts/, see parts.ts`);
});
