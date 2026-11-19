// One block's engine half in the big room (bigroom.ts): the only code in the room's process before the block's. The wall
// is macOS's sandbox around this whole process, not an import hook: the block may import node's builtins and files of
// its own folder, read and write the folders its record declares, and connect to its proxy; it can start nothing.
//   the door   `sol`, over the process's IPC channel to the engine. A read, a write, a run, a fetch and a call to one of
//              Sol's tools are asked and awaited: each returns a promise (in the small room read and write return at once;
//              `await` works in both). A tool's run, a listener and a schedule run here when the engine hands them over:
//              the engine counts the times (needs.every) and keeps the events (hears) while the room is put away.
//              sol.since(from, kinds), the log's past, is there only when the engine's start says so (its switch, step A3).
// Only node: builtins and erasable TypeScript, as kernel-worker.ts.
import { pathToFileURL } from "node:url";

type Arg = "string" | "number" | "boolean";
const send = (m: Record<string, unknown>) => { if (process.connected) process.send?.(m); };
const msg = (e: unknown) => (e as Error)?.message ?? String(e);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const TOOL = /^[a-z][a-z0-9_]{0,31}$/;

const waiting = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();
let n = 0;
/** ask the engine and wait for its answer */
function ask(m: Record<string, unknown>): Promise<unknown> {
  const q = ++n;
  return new Promise((ok, no) => { waiting.set(q, { ok, no }); send({ ...m, q }); });
}
const trouble = (where: string, e: unknown) => send({ t: "trouble", where, why: msg(e) });
function guard(where: string, f: () => unknown): Promise<void> {
  try {
    const p = f();
    if (p && typeof (p as Promise<unknown>).then === "function") return (p as Promise<unknown>).then(() => {}, (e) => trouble(where, e));
  } catch (e) { trouble(where, e); }
  return Promise.resolve();
}

const tools = new Map<string, (args: Record<string, unknown>) => unknown>();
const hears: ((e: unknown) => unknown)[] = [];
const times = new Map<number, (() => unknown)[]>();
const offs: (() => unknown)[] = [];

function makeSol(id: string, folders: string[], past: boolean) {
  const door = {
    id,
    room: "big" as const,
    folders: Object.freeze([...folders]),   // the folders its record declares, as they are on this Mac ("~/" made the person's home)
    tool(def: { name?: unknown; description?: unknown; args?: unknown; run?: unknown }) {
      if (!isObj(def) || typeof def.name !== "string" || !TOOL.test(def.name)) throw new Error("a tool's name is lowercase letters, digits and _, starting with a letter");
      if (typeof def.run !== "function") throw new Error(`the tool ${def.name} has no run`);
      const args: Record<string, Arg> = {};
      for (const [k, a] of Object.entries(isObj(def.args) ? def.args : {})) {
        if (!TOOL.test(k) || !["string", "number", "boolean"].includes(a as string)) throw new Error(`the tool ${def.name}'s argument ${k} is not string, number or boolean`);
        args[k] = a as Arg;
      }
      tools.set(def.name, def.run as (args: Record<string, unknown>) => unknown);
      send({ t: "tool", name: def.name });
    },
    listen(f: unknown) { if (typeof f === "function") hears.push(f as (e: unknown) => unknown); },
    every(ms: unknown, f: unknown) {
      if (typeof f !== "function") return;
      const k = Number(ms);
      times.set(k, [...(times.get(k) ?? []), f as () => unknown]);
    },
    log(line: unknown) { send({ t: "log", line: String(line).slice(0, 500) }); },
    read(what: unknown) { return ask({ t: "read", what: String(what) }); },
    write(what: unknown, value: unknown) { return ask({ t: "write", what: String(what), value: JSON.parse(JSON.stringify(value ?? null)) }).then(() => undefined); },
    run(program: unknown, args: unknown = [], opts: unknown = {}) { return ask({ t: "run", program: String(program), args, opts }); },
    fetch(url: unknown, opts: unknown = {}) { return ask({ t: "fetch", url: String(url), opts }); },
    call(tool: unknown, args: unknown = {}) { return ask({ t: "call", tool: String(tool), args }); },
  };
  const since = (from: unknown, kinds?: unknown) => ask({ t: "since", from: from === undefined ? 0 : Number(from), kinds: kinds === undefined ? undefined : Array.isArray(kinds) ? kinds.map(String) : String(kinds) });
  return Object.freeze(past ? { ...door, since } : door);
}

process.on("message", (m: { t: string; q?: number; ok?: boolean; value?: unknown; why?: string; e?: unknown; call?: number; name?: string; args?: Record<string, unknown>; ms?: number; id?: string; file?: string; folders?: unknown[]; since?: boolean }) => {
  switch (m?.t) {
    case "start": void start(String(m.id), String(m.file), Array.isArray(m.folders) ? m.folders.filter((f): f is string => typeof f === "string") : [], m.since === true); return;
    case "answer": { const w = waiting.get(Number(m.q)); waiting.delete(Number(m.q)); if (w) (m.ok ? w.ok(m.value) : w.no(new Error(m.why))); return; }
    case "ev": for (const f of hears) void guard("a listener", () => f(m.e)); return;
    case "every": {
      const fs = times.get(Number(m.ms)) ?? [];
      if (!fs.length) trouble("a schedule", `its record says every ${m.ms} ms, and it gave sol.every nothing to run then`);
      for (const f of fs) void guard("a schedule", f);
      return;
    }
    case "call": {
      const run = tools.get(m.name ?? "");
      Promise.resolve()
        .then(() => { if (!run) throw new Error(`no tool ${m.name}: it did not register it with sol.tool`); return run(m.args ?? {}); })
        .then((out) => typeof out === "string" ? out : JSON.stringify(out ?? null))
        .then((value) => send({ t: "result", call: m.call, ok: true, value }), (e) => send({ t: "result", call: m.call, ok: false, why: msg(e) }));
      return;
    }
    case "unload": void Promise.all(offs.splice(0).map((off) => guard("its unload", off))).then(() => send({ t: "closed" })); return;
  }
});
process.on("disconnect", () => process.exit(0));   // the engine is gone (killed, crashed): the room goes too, never an orphan
process.on("uncaughtException", (e) => trouble("the room", e));
process.on("unhandledRejection", (e) => trouble("the room", e));

async function start(id: string, file: string, folders: string[], past: boolean) {
  try {
    const mod = (await import(pathToFileURL(file).href)) as { default?: unknown; load?: unknown };
    const inner = isObj(mod.default) ? (mod.default as { default?: unknown; load?: unknown }) : null;
    const f = [mod.default, mod.load, inner?.default, inner?.load].find((x) => typeof x === "function") as ((s: unknown) => unknown) | undefined;
    if (!f) throw new Error(`${file.split("/").at(-1)} exports no function (export default function (sol) { … })`);
    const off = await f(makeSol(id, folders, past));
    if (typeof off === "function") offs.push(off as () => unknown);
    send({ t: "ready" });
  } catch (e) {
    send({ t: "failed", why: msg(e) });
  }
}
