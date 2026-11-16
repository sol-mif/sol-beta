// Parts (#934): a new part of the engine adds a file in src/parts/, not a line in index.ts.
// A part is a file whose default export is a function given the registry; there it says what it answers:
//   p.route(method, path | RegExp, handler)   an HTTP route, asked after the door (index.ts), before index.ts's own
//   p.on(type | "prefix.", handler)           a socket message; a type ending in "." takes every type it starts. Asked
//                                             after index.ts's own cases, so the stage and let-go refusals run first
//   p.atStart(fn)                             wiring, run once every part is loaded, before the engine listens
// Every file in src/parts/ is loaded at start from the directory listing (dist/parts/*.js when built, src/parts/*.ts
// under tsx; .d.ts, .map and tests are skipped), so there is no list of parts to conflict on. Two parts that answer the
// same thing stop the engine at start, naming both files: which file loads first never decides anything.
// The context is what index.ts hands out (HOME, PORT, send, everyone; on a socket the connection too). Anything else a
// part needs, it imports from the module that owns it.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSocket } from "ws";

/** anything that takes a JSON line: a socket, or a tap (index.ts) */
export type Wire = { readyState: number; send: (s: string) => void };
/** what every part is handed */
export type Engine = { HOME: string; PORT: number; send: (ws: Wire, msg: object) => void; everyone: (msg: object) => void };
/** an HTTP request that passed the door; match is the RegExp's, for a route given as one */
export type Asked = Engine & { req: IncomingMessage; res: ServerResponse; path: string; match: RegExpExecArray | null };
/** a socket message: the socket, the face it is (send to it alone), its conversation, and what the door said of it */
export type Heard = Engine & {
  ws: WebSocket;
  face: { send: (m: object) => void };
  conn: { sessionId?: string; chars: number };
  fromSol: boolean;   // one of Sol's own pages (door.ts doorOpen)
  fromApp: boolean;   // the app's own page, with an Origin (door.ts appPage)
};
export type Route = (a: Asked) => unknown;
export type Hear = (msg: any, h: Heard) => unknown;

type Mine<T> = T & { file: string };

export class Parts {
  private paths = new Map<string, Mine<{ method: string; path: string; fn: Route }>>();   // by "GET /file"
  private patterns: Mine<{ method: string; re: RegExp; fn: Route }>[] = [];
  private types = new Map<string, Mine<{ fn: Hear }>>();
  private prefixes: Mine<{ prefix: string; fn: Hear }>[] = [];
  private starts: Mine<{ fn: (e: Engine) => unknown }>[] = [];
  private file = "";   // the part being loaded; nothing registers outside a load
  private loaded = false;

  route(method: string, path: string | RegExp, fn: Route) {
    const file = this.mine(`route ${method} ${path}`);
    const m = method.toUpperCase();
    if (typeof path === "string") {
      const key = `${m} ${path}`;
      const was = this.paths.get(key) ?? this.patterns.find((p) => p.method === m && p.re.test(path));
      if (was) this.twice(`${m} ${path}`, was.file, file);
      this.paths.set(key, { method: m, path, fn, file });
    } else {
      if (path.global || path.sticky) throw new Error(`parts: ${file} routes ${path} with the g or y flag, which remembers between requests`);
      const was = this.patterns.find((p) => p.method === m && p.re.source === path.source && p.re.flags === path.flags)
        ?? [...this.paths.values()].find((p) => p.method === m && path.test(p.path));
      if (was) this.twice(`${m} ${path}`, was.file, file);
      this.patterns.push({ method: m, re: path, fn, file });
    }
  }

  on(type: string, fn: Hear) {
    const file = this.mine(`on ${type}`);
    if (!type) throw new Error(`parts: ${file} listens for an empty type`);
    if (type.endsWith(".")) {
      const was = this.prefixes.find((p) => p.prefix.startsWith(type) || type.startsWith(p.prefix))
        ?? [...this.types.entries()].map(([t, v]) => ({ ...v, t })).find((x) => x.t.startsWith(type));
      if (was) this.twice(`the message ${type}*`, was.file, file);
      this.prefixes.push({ prefix: type, fn, file });
    } else {
      const was = this.types.get(type) ?? this.prefixes.find((p) => type.startsWith(p.prefix));
      if (was) this.twice(`the message ${type}`, was.file, file);
      this.types.set(type, { fn, file });
    }
  }

  atStart(fn: (e: Engine) => unknown) {
    this.starts.push({ fn, file: this.mine("atStart") });
  }

  /** every part in dir, in name order, then each one's atStart; throws on a part that answers what another does */
  async load(dir: string, engine: Engine) {
    if (this.loaded) throw new Error("parts: loaded twice");
    const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js";   // under tsx the sources, built the .js beside index.js
    const files = readdirSync(dir).filter((f) => f.endsWith(ext) && !f.endsWith(".d.ts") && !/\.test\.[jt]s$/.test(f)).sort();
    for (const f of files) {
      this.file = `parts/${f}`;
      try {
        const mod = await import(pathToFileURL(join(dir, f)).href);
        if (typeof mod.default !== "function") throw new Error(`parts: ${this.file} has no default export (export default function (p: Parts) { … })`);
        await mod.default(this);
      } finally { this.file = ""; }
    }
    this.loaded = true;
    for (const s of this.starts) await s.fn(engine);
    return files.map((f) => `parts/${f}`);
  }

  /** the route that answers this request, or null: index.ts's own routes answer it */
  asked(method: string | undefined, path: string): ((a: Omit<Asked, "match">) => unknown) | null {
    const m = (method ?? "").toUpperCase();
    const exact = this.paths.get(`${m} ${path}`);
    if (exact) return (a) => exact.fn({ ...a, match: null });
    for (const p of this.patterns) {
      if (p.method !== m) continue;
      const match = p.re.exec(path);
      if (match) return (a) => p.fn({ ...a, match });
    }
    return null;
  }

  /** the part that hears this message type, or null */
  heard(type: unknown): Hear | null {
    if (typeof type !== "string") return null;
    return this.types.get(type)?.fn ?? this.prefixes.find((p) => type.startsWith(p.prefix))?.fn ?? null;
  }

  private mine(what: string) {
    if (!this.file) throw new Error(`parts: ${what} outside a part's load; say it in the function a part file exports`);
    return this.file;
  }
  private twice(what: string, a: string, b: string): never {
    throw new Error(`parts: ${what} is answered twice, by ${a} and by ${b}; one part answers it`);
  }
}

/** the engine's one registry (index.ts loads src/parts/ into it) */
export const parts = new Parts();
