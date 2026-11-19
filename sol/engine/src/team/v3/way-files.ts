// Cowork ways, step 4b (docs/cowork-ways-2026-11-10/reports/step4-plan.md §2): the way files a Sol holds. A version's
// name is the hash of its file, so a file needs no trust: whoever hands it over, `load(file).ver` says whether it is the
// one named. In a team it travels on the trail as one `wayfile` event (way-reader.ts), `item` its ver, `value` the file.
// One whose hash is its `item` is kept at `<dir>/<way id>/<ver>.json`, and a file once held stays held, whatever happens
// to the event. Read back, a file is checked again: one that is no longer the version its name says is not used.
// Loaded only behind the ways' switch (SOL_COWORK_WAYS, on unless set off).
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "../../canonical.js";
import { writeWhole } from "../../safewrite.js";
import { load } from "../../way/load.js";
import type { Loaded, Way } from "../../way/types.js";

const VER = /^[0-9a-f]{64}$/;
/** a way's id as a folder's name: what the format allows, never `.` or `..` */
const FOLDER = /^(?!\.{1,2}$)[\w.-]{1,80}$/;

/** the way files under one folder: kept once their hash is their name, read back checked */
export class WayFiles {
  private where = new Map<string, string>();
  private read = new Map<string, Loaded>();
  constructor(private dir: string) {
    if (!existsSync(dir)) return;
    for (const id of readdirSync(dir)) {
      if (!FOLDER.test(id)) continue;
      let names: string[] = [];
      try { names = readdirSync(join(dir, id)); } catch { continue; }
      for (const n of names) { const ver = n.endsWith(".json") ? n.slice(0, -5) : ""; if (VER.test(ver)) this.where.set(ver, join(dir, id, n)); }
    }
  }

  /** files from the trail kept: each whose hash is the ver it is named by, and not held yet. The vers kept now */
  keep(files: readonly { ver: string; file: unknown }[]): string[] {
    const out: string[] = [];
    for (const { ver, file } of files) {
      if (!VER.test(ver) || this.where.has(ver)) continue;
      const l = load(file);
      if (!l.way || l.ver !== ver || !FOLDER.test(l.way.id)) continue;
      const path = join(this.dir, l.way.id, `${ver}.json`);
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      writeWhole(path, canonical(file) + "\n", { root: this.dir });
      this.where.set(ver, path);
      this.read.set(ver, l);
      out.push(ver);
    }
    return out;
  }

  /** the way a ver names, when a file of it is held and still is that version; else undefined */
  get(ver: string): Way | undefined { return this.loaded(ver)?.way ?? undefined; }

  /** the file of a ver as load() reads it (what decide() and due() take), when held and still that version */
  loaded(ver: string): Loaded | undefined {
    const had = this.read.get(ver);
    if (had) return had;
    const path = this.where.get(ver);
    if (!path) return undefined;
    try {
      const l = load(JSON.parse(readFileSync(path, "utf8")));
      if (l.way && l.ver === ver) { this.read.set(ver, l); return l; }
    } catch { /* unreadable: not used */ }
    return undefined;
  }

  /** the vers of every file held */
  vers(): string[] { return [...this.where.keys()]; }

  /** whether a file of this ver is held (not checked again) */
  has(ver: string): boolean { return this.where.has(ver); }
}
