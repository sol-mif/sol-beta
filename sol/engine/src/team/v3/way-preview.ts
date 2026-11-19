// Cowork ways, step 4b part 4 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §7): a preview, what a version would
// have made of a way's history (FORMAT §6, way/replay.ts). Pure: it is handed a project's rows and the way files and
// reads and checks them itself, so it runs in a worker of its own (way-preview-worker.ts): neither the check of every
// row nor a long replay holds the engine's thread. The caller always says how far it walks (`until`: its own clock), never the engine's default.
// Loaded only behind the ways' switch (SOL_COWORK_WAYS, on unless set off).
import { place } from "../../way/fold.js";
import { load } from "../../way/load.js";
import { replay, type Replayed } from "../../way/replay.js";
import { isObj, type Way } from "../../way/types.js";
import type { TrailEvent } from "./trail.js";
import { readWays } from "./way-reader.js";

/** what a preview is handed: the project's rows (way-reader.ts rowsOf), the versions this Sol holds (way-files.ts, read
 *  back checked), the way, the version to preview, this Sol's clock, and how far a changed trigger's ticks are walked */
export type PreviewIn = { rows: TrailEvent[]; held: { ver: string; way: Way }[]; way: string; to: string; now: number; until: number };
/** a preview, or why there is none: `not_applied` (no version in force yet: nothing to replay), `no_file`, `way_unread` */
export type PreviewOut = { ok: true; replayed: Replayed } | { ok: false; why: string };

/** a version replayed over a way's history in a team's project (pure) */
export function previewOf(i: PreviewIn): PreviewOut {
  const r = readWays(i.rows), ways = new Map<string, Way>();
  // only the versions this project's trail carries: a Sol that holds this project alone folds no other (grade17 F2)
  const on = new Set(r.files.map((f) => f.ver));
  for (const h of i.held) if (h.way.id === i.way && on.has(h.ver)) ways.set(h.ver, h.way);
  for (const f of r.files) {
    if (ways.has(f.ver)) continue;
    const l = load(f.file);
    if (l.way && l.ver === f.ver && l.way.id === i.way) ways.set(f.ver, l.way);
  }
  const events = r.ways.get(i.way) ?? [];
  const placed = place(i.way, events, ways, r.book, { now: i.now });
  const cur = placed.p.ver;
  if (!cur) return { ok: false, why: "not_applied" };
  const to = ways.get(i.to), from = ways.get(cur);
  if (!to || !from) return { ok: false, why: "no_file" };
  const toL = load(to);
  if (!toL.way || toL.problems.length) return { ok: false, why: "way_unread" };
  // the proposal's map of states the new version takes away ("old>new"), the last one taken for this version
  const said = placed.seq.filter((x) => x.taken && x.e.kind === "way.proposed" && x.e.item === i.to && isObj(x.e.value) && x.e.value.from === cur).pop();
  const map = said && isObj(said.e.value) && Array.isArray(said.e.value.map) ? (said.e.value.map as string[]) : undefined;
  return { ok: true, replayed: replay(events, ways, load(from), toL, r.book, { now: i.now, until: i.until, ...(map ? { map } : {}) }) };
}
