// The measure of the agent's eyes and hands on its stage (#1437): what the tracker wrote (track.ts, home/track/<day>.jsonl:
// stage.* from the engine's eyes and hands and from the face's felt.ts) read back as the few rates that say where they
// need work. `bash sol/stage-measure [days]` prints it; `--json` gives the same for an agent. Read on the Mac whose Sol
// it measures; nothing is sent.
//   the hands   asked by result; made or skipped and why; how long a move waited for the hand to be still (STILL_MS);
//               what the person did to each move in the next minute, by verb: kept is the agent arranging well,
//               undone, moved, widths, closed the ways it did not
//   the lens    gone to a part: found (a piece) or arrived at the top of what shows (a page), and how fast
//   the eyes    how each block landed, by tool and kind: whole, scaled, cut, still, large, away, or drawn while he was
//               elsewhere or hidden; the looks; the turns told what he did
//   his hand    how often he arranges by hand, and how much of it is to a piece the agent just placed
// The knobs these rates tune (Tuning, sol/systems/records/engine/tuning once it lands): STILL_MS and LENS_MS, KEPT_MS
// (mac pieces/hands.ts, felt.ts), the widths narrow, half and wide, and LAND_MS (eyes.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Line = { at: string; name: string; props?: Record<string, number | boolean | string> };
type Tally = Record<string, number>;
const add = (t: Tally, k: string, n = 1) => { t[k] = (t[k] ?? 0) + n; };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export type Measure = {
  days: number; from: string; to: string; lines: number;
  hands: { asked: Tally; made: number; skipped: Tally; waited_ms: { median: number; max: number }; brought: number;
    after: Record<string, Tally>; kept_pct: number; undone_pct: number; fixed_pct: number };
  lens: { gone: number; page: number; found: number; notFound: number; arrived: number; arrived_secs: number };
  eyes: { landed: Record<string, Tally>; byKind: Record<string, Tally>; looks: number; looksOk: number; since: number; sinceEvents: number };
  hand: { acts: Tally; onAgent: number; total: number; undo: Tally };
};

/** the measure of these lines (pure) */
export function measure(lines: Line[], days = 0): Measure {
  const s = lines.filter((l) => l.name?.startsWith("stage.")).sort((a, b) => a.at.localeCompare(b.at));
  const m: Measure = {
    days, from: s[0]?.at.slice(0, 10) ?? "", to: s.at(-1)?.at.slice(0, 10) ?? "", lines: s.length,
    hands: { asked: {}, made: 0, skipped: {}, waited_ms: { median: 0, max: 0 }, brought: 0, after: {}, kept_pct: 0, undone_pct: 0, fixed_pct: 0 },
    lens: { gone: 0, page: 0, found: 0, notFound: 0, arrived: 0, arrived_secs: 0 },
    eyes: { landed: {}, byKind: {}, looks: 0, looksOk: 0, since: 0, sinceEvents: 0 },
    hand: { acts: {}, onAgent: 0, total: 0, undo: {} },
  };
  const waits: number[] = [], arrivedSecs: number[] = [], all: Tally = {};
  for (const { name, props: p = {} } of s) {
    const w = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
    switch (name) {
      case "stage.asked": add(m.hands.asked, w("result") || "?"); break;
      case "stage.made":
        if (p.made === true) { m.hands.made++; if (typeof p.waited_ms === "number") waits.push(p.waited_ms); if (p.brought) m.hands.brought++; }
        else add(m.hands.skipped, w("why") || "?");
        break;
      case "stage.after": { const v = w("verb") || "?", how = w("how") || "?"; m.hands.after[v] ??= {}; add(m.hands.after[v], how); add(all, how); break; }
      case "stage.lens": m.lens.gone++; if (p.page) m.lens.page++; else if (p.found === true) m.lens.found++; else if (p.found === false) m.lens.notFound++; break;
      case "stage.lens.arrived": m.lens.arrived++; if (typeof p.secs === "number") arrivedSecs.push(p.secs); break;
      case "stage.landed": { const t = w("tool") || "?", k = w("kind") || "?", f = w("fit") || "?"; m.eyes.landed[t] ??= {}; add(m.eyes.landed[t], f); m.eyes.byKind[k] ??= {}; add(m.eyes.byKind[k], f); break; }
      case "stage.look": m.eyes.looks++; if (p.ok) m.eyes.looksOk++; break;
      case "stage.since": m.eyes.since++; m.eyes.sinceEvents += typeof p.events === "number" ? p.events : 0; break;
      case "stage.hand": m.hand.total++; add(m.hand.acts, w("what") || "?"); if (p.agent) m.hand.onAgent++; break;
      case "stage.undo": add(m.hand.undo, w("by") || "?"); break;
    }
  }
  m.hands.waited_ms = { median: median(waits), max: waits.length ? Math.max(...waits) : 0 };
  m.lens.arrived_secs = median(arrivedSecs);
  const judged = Object.entries(all).filter(([k]) => k !== "replaced").reduce((n, [, v]) => n + v, 0);
  m.hands.kept_pct = pct(all.kept ?? 0, judged);
  m.hands.undone_pct = pct(all.undone ?? 0, judged);
  m.hands.fixed_pct = pct(judged - (all.kept ?? 0) - (all.undone ?? 0), judged);
  return m;
}

const row = (t: Tally) => Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "none";

/** the measure as lines a person reads (pure) */
export function words(m: Measure): string {
  if (!m.lines) return `No stage.* events in the last ${m.days} days: the switches "the agent sees the stage" and "the agent arranges the stage" are off, usage tracking is off (settings.track.usage), or nothing has happened yet.`;
  const h = m.hands, judged = Object.values(h.after).reduce((n, t) => n + Object.entries(t).filter(([k]) => k !== "replaced").reduce((a, [, v]) => a + v, 0), 0);
  return [
    `The agent's eyes and hands, ${m.from} to ${m.to} (${m.lines} events)`,
    "",
    "THE HANDS",
    `  asked        ${row(h.asked)}`,
    `  made         ${h.made} (${h.brought} brought back first); skipped in the window: ${row(h.skipped)}`,
    `  waited       median ${h.waited_ms.median} ms, longest ${h.waited_ms.max} ms for the hand to be still`,
    `  the minute after (${judged} judged): kept ${h.kept_pct}% · undone ${h.undone_pct}% · fixed by hand ${h.fixed_pct}%`,
    ...Object.entries(h.after).map(([v, t]) => `    ${v.padEnd(11)}${row(t)}`),
    "",
    "THE LENS",
    `  gone to a part ${m.lens.gone}: on a page ${m.lens.page} (arrived ${m.lens.arrived}, median ${m.lens.arrived_secs} s); in a piece found ${m.lens.found}, not found ${m.lens.notFound}`,
    "",
    "THE EYES",
    ...Object.entries(m.eyes.landed).map(([t, f]) => `  ${t.padEnd(13)}${row(f)}`),
    ...Object.entries(m.eyes.byKind).map(([k, f]) => `    ${k.padEnd(11)}${row(f)}`),
    `  looks        ${m.eyes.looks} (${m.eyes.looksOk} with a still)`,
    `  turns told   ${m.eyes.since} (${m.eyes.sinceEvents} things he did)`,
    "",
    "HIS HAND",
    `  acts         ${m.hand.total}, ${m.hand.onAgent} on a piece the agent had just placed: ${row(m.hand.acts)}`,
    `  ⌥⌘Z          ${row(m.hand.undo)}`,
  ].join("\n");
}

/** the tracker's lines of the last `days` days in a home's track folder */
export function linesOf(dir: string, days: number, today = new Date()): Line[] {
  const from = new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl(\.sent)?$/.test(f) && f.slice(0, 10) >= from); } catch { return []; }
  const out: Line[] = [];
  for (const f of files) for (const l of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!l.includes('"stage.')) continue;
    try { out.push(JSON.parse(l)); } catch { /* a cut line */ }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), json = args.includes("--json"), days = Number(args.find((a) => /^\d+$/.test(a)) ?? 14);
  const home = process.env.SOL_HOME ?? join(process.cwd(), "..", "home");
  const m = measure(linesOf(join(home, "track"), days), days);
  console.log(json ? JSON.stringify(m, null, 1) : words(m));
}
