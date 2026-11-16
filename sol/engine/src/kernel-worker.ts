// One block's engine half, in a worker of its own (#633, the second read's fix round): kernel.ts starts one per block
// and terminates it at unload, so everything the block opened (its timers, its promises, its state) dies with it. This
// file is the only code in the worker before the block's; it builds the wall, then imports the engine half.
//   the wall   the block's imports are resolved through a hook that refuses every builtin (node:fs, node:net,
//              node:child_process, node:worker_threads, node:module ...), every bare package, and every file outside the
//              block's own folder; `process`, `fetch`, `WebSocket`, `EventSource`, `BroadcastChannel` and `navigator`
//              are gone from its globals. What is left is the language, timers, and `sol`.
//   the door   `sol`, carried over the worker's port: a read or a write is asked of the engine and waited for (a shared
//              flag, then the answer taken off a port of its own), so it stays a plain call that returns or throws, and
//              every one passes the engine's gate(). A tool's run, a listener and a schedule run here; the engine asks
//              for a tool's answer and hands over each step on the log.
// Only node: builtins are imported here, and only erasable TypeScript is used: the engine runs it as written (Node strips
// the types) under tsx, and as tsc's kernel-worker.js in dist.
import { parentPort, workerData, receiveMessageOnPort, type MessagePort } from "node:worker_threads";
import { registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sep } from "node:path";

type Arg = "string" | "number" | "boolean";
type Data = { id: string; file: string; dir: string; flag: SharedArrayBuffer; reply: MessagePort; askMs: number };
const port = parentPort as NonNullable<typeof parentPort>;
const d = workerData as Data;
const flag = new Int32Array(d.flag);
const msg = (e: unknown) => (e as Error)?.message ?? String(e);

// ---- the wall ----
const home = realpathSync(d.dir) + sep;
registerHooks({
  resolve(spec, ctx, next) {
    const no = () => new Error(`refused: ${d.id} may not import ${spec}: an engine half reaches Sol only through sol`);
    // only a path is resolved: a bare specifier ("zod", "fs", "#x") is refused before resolution, so a package under the
    // block's own node_modules, which would resolve inside its folder, is refused like any other (the second read, round two)
    if (!/^(\.{1,2}\/|\/|file:)/.test(spec)) throw no();
    const r = next(spec, ctx);
    if (!r.url.startsWith("file:")) throw no();
    let p: string;
    try { p = realpathSync(fileURLToPath(r.url)); } catch { p = fileURLToPath(r.url); }
    if (!p.startsWith(home)) throw no();
    return r;
  },
});
for (const k of ["process", "fetch", "WebSocket", "EventSource", "BroadcastChannel", "navigator", "XMLHttpRequest"]) {
  Object.defineProperty(globalThis, k, { value: undefined, writable: false, configurable: false, enumerable: false });
}

// ---- the door ----
/** ask the engine and wait for its answer: a read or a write, through its gate */
function ask(m: Record<string, unknown>): unknown {
  Atomics.store(flag, 0, 0);
  port.postMessage(m);
  if (Atomics.wait(flag, 0, 0, d.askMs) === "timed-out") throw new Error(`Sol did not answer ${String(m.t)} within ${d.askMs} ms`);
  const got = receiveMessageOnPort(d.reply)?.message as { ok: boolean; value?: unknown; why?: string } | undefined;
  if (!got) throw new Error(`Sol's answer to ${String(m.t)} was lost`);
  if (!got.ok) throw new Error(got.why);
  return got.value;
}
const trouble = (where: string, e: unknown) => port.postMessage({ t: "trouble", where, why: msg(e) });
/** run the block's own function: what it throws, now or later, is its trouble on the log */
function guard(where: string, f: () => unknown): Promise<void> {
  try {
    const p = f();
    if (p && typeof (p as Promise<unknown>).then === "function") return (p as Promise<unknown>).then(() => {}, (e) => trouble(where, e));
  } catch (e) { trouble(where, e); }
  return Promise.resolve();
}

const TOOL = /^[a-z][a-z0-9_]{0,31}$/;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const tools = new Map<string, (args: Record<string, unknown>) => unknown>();
const hears: ((e: unknown) => unknown)[] = [];
const offs: (() => unknown)[] = [];

const sol = Object.freeze({
  id: d.id,
  tool(def: { name?: unknown; description?: unknown; args?: unknown; run?: unknown }) {
    if (!isObj(def) || typeof def.name !== "string" || !TOOL.test(def.name)) throw new Error("a tool's name is lowercase letters, digits and _, starting with a letter");
    if (typeof def.run !== "function") throw new Error(`the tool ${def.name} has no run`);
    const args: Record<string, Arg> = {};
    for (const [k, a] of Object.entries(isObj(def.args) ? def.args : {})) {
      if (!TOOL.test(k) || !["string", "number", "boolean"].includes(a as string)) throw new Error(`the tool ${def.name}'s argument ${k} is not string, number or boolean`);
      args[k] = a as Arg;
    }
    tools.set(def.name, def.run as (args: Record<string, unknown>) => unknown);
    port.postMessage({ t: "tool", name: def.name, description: String(def.description ?? def.name), args });
  },
  listen(f: unknown) {
    if (typeof f !== "function") return;
    if (!hears.length) port.postMessage({ t: "listen" });
    hears.push(f as (e: unknown) => unknown);
  },
  every(ms: unknown, f: unknown) {
    if (typeof f !== "function") return;
    setInterval(() => { void guard("a schedule", f as () => unknown); }, Math.max(1000, Number(ms) || 0));
  },
  log(line: unknown) { port.postMessage({ t: "log", line: String(line).slice(0, 500) }); },
  read(what: unknown) { return ask({ t: "read", what: String(what) }); },
  write(what: unknown, value: unknown) {
    const plain = JSON.parse(JSON.stringify(value ?? null)) as unknown;   // what is written is JSON, as the file will be
    ask({ t: "write", what: String(what), value: plain });
  },
});

port.on("message", (m: { t: string; e?: unknown; call?: number; name?: string; args?: Record<string, unknown> }) => {
  if (m.t === "ev") for (const f of hears) void guard("a listener", () => f(m.e));
  else if (m.t === "call") {
    const run = tools.get(m.name ?? "");
    Promise.resolve()
      .then(() => { if (!run) throw new Error(`no tool ${m.name}`); return run(m.args ?? {}); })
      .then((out) => typeof out === "string" ? out : JSON.stringify(out ?? null))
      .then((value) => port.postMessage({ t: "result", call: m.call, ok: true, value }), (e) => port.postMessage({ t: "result", call: m.call, ok: false, why: msg(e) }));
  } else if (m.t === "unload") {
    void Promise.all(offs.splice(0).map((off) => guard("its unload", off))).then(() => port.postMessage({ t: "closed" }));
  }
});

// ---- the block ----
try {
  const mod = (await import(pathToFileURL(d.file).href)) as { default?: unknown; load?: unknown };
  const inner = isObj(mod.default) ? (mod.default as { default?: unknown; load?: unknown }) : null;   // CommonJS's wrap
  const start = [mod.default, mod.load, inner?.default, inner?.load].find((f) => typeof f === "function") as ((s: typeof sol) => unknown) | undefined;
  if (!start) throw new Error(`${d.file.split(sep).at(-1)} exports no function (export default function (sol) { … })`);
  const off = await start(sol);
  if (typeof off === "function") offs.push(off as () => unknown);
  port.postMessage({ t: "ready" });
} catch (e) {
  port.postMessage({ t: "failed", why: msg(e) });
}
