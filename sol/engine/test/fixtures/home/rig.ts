// A Home for one test (Home 1, #790; for every Home unit's tests): a temp home, a real kernel's log beside it (the
// event format v1, read and written as the engine does), a context over both, and fake faces that keep what they are
// sent. Every message a face is sent is checked against its schema as it arrives (contract/home/today.ts for Today's;
// a type with no schema here is kept unchecked), so every test that sends checks the contract too.
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { Kernel } from "../../../src/kernel.ts";
import { logFiles, readLog } from "../../../src/log.ts";
import { DoneMsg, TodayMsg } from "../../../src/contract/home/today.ts";
import { homeLog, type HomeLog } from "../../../src/home/log.ts";
import { handleHome, makeCtx } from "../../../src/home/wire.ts";
import { newThing, type Thing } from "../../../src/home/items.ts";
import type { Ctx, Sorter } from "../../../src/home/unit.ts";

export const SCHEMAS: Record<string, z.ZodTypeAny> = { "home.today": TodayMsg, "home.done": DoneMsg };
const dirs: string[] = [];
/** every temp folder made here, removed (call it from after()) */
export const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); };

export type FakeFace = { send: (m: object) => void; got: any[]; raw: string[]; name: string };
export type Rig = {
  dir: string; home: string; logDir: string; kernel: Kernel; log: HomeLog; ctx: Ctx; clock: { now: number };
  faces: FakeFace[];
  face(name?: string): FakeFace;
  ask(face: FakeFace, msg: object): Promise<any[]>;
  seed(things: Thing[]): void;
  /** the log's files' text, joined, as on the disk */
  bytes(): string;
  /** every event on the log, in order */
  events(): any[];
  /** a context over the same home and log folder, as after a restart: a new kernel, a new door */
  restart(o?: { sorter?: Sorter }): Rig;
};

export function rig(o: { now: number; sorter?: Sorter; schemas?: Record<string, z.ZodTypeAny>; dir?: string } ): Rig {
  const dir = o.dir ?? mkdtempSync(join(tmpdir(), "sol-home-"));
  if (!o.dir) dirs.push(dir);
  const home = join(dir, "home"), logDir = join(dir, "log");
  mkdirSync(home, { recursive: true });
  const clock = { now: o.now };
  const kernel = new Kernel(home, { logDir, old: null, now: () => clock.now, appDir: join(dir, "app"), stable: null });
  const log = homeLog(kernel);
  const faces: FakeFace[] = [];
  const schemas = o.schemas ?? SCHEMAS;
  const face = (name = `face ${faces.length + 1}`): FakeFace => {
    const f: FakeFace = {
      name, got: [], raw: [],
      send(m) {
        const s = schemas[(m as { type?: string }).type ?? ""];
        if (s) { const p = s.safeParse(m); if (!p.success) throw new Error(`${(m as { type?: string }).type} does not parse: ${p.error.message}`); }
        const text = JSON.stringify(m);
        f.raw.push(text);
        f.got.push(JSON.parse(text));
      },
    };
    faces.push(f);
    return f;
  };
  const ctx = makeCtx({ home, log, now: () => clock.now, all: (m) => { for (const f of faces) f.send(m); }, ...(o.sorter ? { sorter: o.sorter } : {}) });
  const r: Rig = {
    dir, home, logDir, kernel, log, ctx, clock, faces, face,
    async ask(f, msg) { const n = f.got.length; await handleHome(f, msg, ctx); return f.got.slice(n); },
    seed(things) { for (const t of things) newThing(ctx, t); },
    bytes: () => logFiles(logDir).map((p) => readFileSync(p, "utf8")).join(""),
    events: () => readLog(logDir),
    restart: (x = {}) => rig({ now: clock.now, dir, schemas, ...(x.sorter ? { sorter: x.sorter } : {}) }),
  };
  return r;
}
