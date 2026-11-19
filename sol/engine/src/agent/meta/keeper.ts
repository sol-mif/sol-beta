// Agents' meta (#1327, pass 2): what Sol keeps by itself on the engine's tick, after the keeper (agents.ts keep). Sync,
// code only (Jev is never asked on the tick). Nothing until agents.json exists. Each is one change line with undo.
//   first runs   a place whose first run was capped (drafts for a new sibling, a look for a source never read) is
//                lifted to the agent's trust once that rule has run there
//   joining      a new folder or item under a kind's parent, with the shape of the agent's places (kinds.ts joinsKind)
//                and the job's inputs there, joins the agent by itself, never above drafts for its first run. A place
//                the offer listed unchecked for want of inputs joins when they come; one the person left unchecked
//                or took out never joins by itself.
//   dates        a place on a date trigger runs at its date minus its lead time, each date once (fired)
// Before the person has seen the floor (agents.json `met`), only the dates fire: no lift, no joining (rule 6).
// Never by itself: more reach, a new account, a higher rung than the agent's, deleting what it made.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { readLedger } from "../store.js";
import { change, loadAgents, runsOf, saveAgents, type Agent, type AgentsFile, type RuleRef } from "../agents.js";
import { joinsKind } from "./kinds.js";
import { placesOf, stickyTitles, type Place } from "./places.js";
import { datesOf } from "./when.js";
import { reachIn, filesOf, neverRead } from "./offer.js";
import { joinPlace } from "./learn.js";
import { rewritePlace } from "./render.js";
import { lineOf, restoreLine } from "./policy.js";
import { DAY_MS } from "./numbers.js";

const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
/** the meta's keeping, once a tick; the rules due on a date trigger back, for the clock to run */
export function keepMeta(home: string, now = Date.now()): { changed: boolean; due: RuleRef[] } {
  const f = loadAgents(home);
  if (!f) return { changed: false, due: [] };
  const iso = new Date(now).toISOString();
  let changed = false;
  const due: RuleRef[] = [];
  let places: Place[] | null = null;
  const all = () => (places ??= placesOf(home).places);
  for (const ag of f.agents) {
    for (const ref of ag.places ?? []) {
      // a capped first run, lifted once it ran (not before the person has seen the floor: rule 6)
      if (ref.first && f.met) {
        const ran = runsOf(readLedger(join(home, ref.folder), 500), ref.rule).some((l) => l.at > Date.parse(ref.at));
        if (ran) {
          const old: Agent = JSON.parse(JSON.stringify(ag)), line = lineOf(home, ref.folder, ref.rule) ?? "";
          const was = ref.first;
          delete ref.first;
          rewritePlace(home, ag, ref, true);
          change(f, { at: iso, kind: "trust", agent: ag.id, rules: [{ folder: ref.folder, rule: ref.rule }], line: `${ag.name} ran once in ${ref.name} (${was}); it ${ref.trust === "asks" ? "asks you each time" : ref.trust} there now.`, undo: { restore: { agent: old, lines: line ? [{ folder: ref.folder, rule: ref.rule, line }] : [] } }, cause: "first-run" });
          changed = true;
        }
      }
      // a date trigger whose time has come (each date once; a fire older than a day is let go)
      if (ref.trigger.kind === "date") {
        const p = all().find((x) => x.id === ref.place);
        const dates = datesOf(read(join(home, ref.folder, "stickies.md")), read(join(home, ref.folder, "calendar.md")), now - DAY_MS, p?.item ? p.name : undefined);
        for (const d of dates) {
          const [y, m, dd] = d.split("-").map(Number);
          const at = new Date(y, m - 1, dd - ref.trigger.leadDays, ref.trigger.hour, 0).getTime();
          const key = `${ag.id}|${ref.place}|${d}`;
          if (at <= now && at > now - DAY_MS && !f.fired.includes(key)) { f.fired.push(key); due.push({ folder: ref.folder, rule: ref.rule }); changed = true; }
        }
      }
    }
    if (f.met && joinNew(home, f, ag, all(), iso)) changed = true;
  }
  if (changed) saveAgents(home, f);
  return { changed, due };
}

/** new places of the agent's kind join it by themselves (at drafts at most for the first run) */
function joinNew(home: string, f: AgentsFile, ag: Agent, places: Place[], iso: string): boolean {
  if (!ag.kinds?.length || !ag.places?.length) return false;
  const mine = places.filter((p) => ag.places!.some((r) => r.place === p.id));
  if (!mine.length) return false;
  let changed = false;
  for (const p of places) {
    if (ag.places.some((r) => r.place === p.id) || ag.out?.includes(p.id)) continue;
    const seen = ag.seen?.find((s) => s.place === p.id);
    if (seen && !seen.why) continue;   // the person left it unchecked
    if (!joinsKind(mine, p)) continue;
    const files = filesOf(home, p.folder);
    const reach = (ag.sources ?? []).map((s) => reachIn(p, s, files));
    if (reach.includes("never")) continue;   // its inputs are not there yet: it joins when they come
    const ref = joinPlace(home, ag, p, iso, neverRead(home, p, ag.sources ?? []));
    ag.seen = (ag.seen ?? []).filter((s) => s.place !== p.id);
    change(f, { at: iso, kind: "joined", agent: ag.id, rules: [{ folder: ref.folder, rule: ref.rule }], line: `${p.name} joined ${ag.name} by itself${ref.first ? `; ${ref.first} for its first run` : ""}.`, undo: { unscope: { place: p.id } }, cause: "joined" });
    changed = true;
  }
  return changed;
}
export { restoreLine, datesOf };
