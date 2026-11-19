// Agents' meta (#1327, pass 2, the flow): what an agent's desk reads and the one press it adds, nothing else.
//   desk    its work (what each place's last runs made, as lines the person can press to fix) and the other places of
//           its kind (the dashed tiles to press in: the siblings that pass the kind test, the ones the offer listed
//           unchecked with their reason, the ones the person took out). Read only.
//   trust   how far it goes: looks · drafts · does, for every place, written into each rule's bracket, one change line
//           with undo. Only the person's press raises it. Work that others see goes no further than drafts; a place
//           whose work is money, a submission or a deletion keeps asking each time.
// A file that cannot be read is named in its run ("could not be read"), never skipped silently.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLedger } from "../store.js";
import { change as changeLine, ensure, find, homeOf, madeSomething, no, nowOf, runsOf, saveAgents, type Agent, type Host } from "../agents.js";
import { nameOfFolder, placesOf } from "./places.js";
import { joinsKind } from "./kinds.js";
import { filesIn } from "./traces.js";
import { rewritePlace } from "./render.js";
import { lineOf } from "./policy.js";
import { TRUSTS, type Trust } from "./when.js";

/** how many runs per place the desk shows (the newest); a view's length, not one of the design's numbers */
export const DESK_RUNS = 2;
/** how much of one made file the desk reads */
const READ_MAX = 2000;

export type Work = { place: string; name: string; folder: string; rule: string; at: number; made: string; file?: string; lines: string[]; unread?: string };
export type More = { place: string; name: string; why?: string; ask?: true };

/** a made thing as lines (pure): its non-empty lines, a heading's marks taken off */
export const linesOf = (text: string) => text.split("\n").map((l) => l.replace(/^#+\s*/, "").replace(/\s+$/, "")).filter((l) => l.trim());

/** agents.desk: its work, newest first, and the places of its kind it is not in */
export function desk(a: Host, id: string) {
  const home = homeOf(a), f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  const work: Work[] = [];
  // every rule's runs, a chain's later steps too: a rule run is the agent's work, shown here and never as a chat (run.ts)
  const steps = ag.rules.map((x) => (ag.places ?? []).find((p) => p.folder === x.folder && p.rule === x.rule) ?? { place: x.folder, name: nameOfFolder(x.folder), folder: x.folder, rule: x.rule });
  for (const r of steps) {
    const runs = runsOf(readLedger(join(home, r.folder), 500), r.rule).filter(madeSomething).slice(0, DESK_RUNS);
    for (const l of runs) {
      const file = filesIn(l.made).find((x) => !x.endsWith("/"));
      let text: string | null = null, unread: string | undefined;
      if (file) { try { text = readFileSync(join(home, r.folder, file), "utf8").slice(0, READ_MAX); } catch { unread = `${file} could not be read`; } }
      work.push({ place: r.place, name: r.name, folder: r.folder, rule: r.rule, at: l.at, made: l.made, lines: text !== null ? linesOf(text) : [l.made], ...(file && text !== null ? { file } : {}), ...(unread ? { unread } : {}) });
    }
  }
  work.sort((x, y) => y.at - x.at);
  return { ok: true, work, more: moreOf(home, ag) };
}

/** the places of its kind it is not in: the siblings that pass the kind test, the offer's unchecked ones (with why),
 *  the ones the person took out */
export function moreOf(home: string, ag: Agent): More[] {
  const mine = new Set((ag.places ?? []).map((p) => p.place));
  const { places } = placesOf(home);
  const inside = places.filter((p) => mine.has(p.id));
  const out: More[] = [];
  const seen = new Set<string>();
  const add = (m: More) => { if (mine.has(m.place) || seen.has(m.place)) return; seen.add(m.place); out.push(m); };
  for (const id of ag.out ?? []) { const p = places.find((x) => x.id === id); if (p) add({ place: p.id, name: p.name, why: "taken out by you" }); }
  for (const s of ag.seen ?? []) { const p = places.find((x) => x.id === s.place); if (p) add({ place: p.id, name: p.name, ...(s.why ? { why: s.why } : {}) }); }
  if (ag.kinds?.length && inside.length) for (const p of places) if (joinsKind(inside, p)) add({ place: p.id, name: p.name });
  return out;
}

/** agents.trust: how far it goes, for every place; one change line with undo */
export function trust(a: Host, id: string, to: string) {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  if (!(TRUSTS as string[]).includes(to)) return { ok: false, why: "how far is looks, drafts or does" };
  const t = to as Trust;
  const refs = ag.places ?? [];
  if (!refs.length) return { ok: false, why: `${ag.name} has no place yet` };
  if (t === "does" && (ag.reach === "drafts" || ag.reach === "asks")) return { ok: false, why: "what goes to other people always waits for you: drafts at most" };
  const old: Agent = JSON.parse(JSON.stringify(ag));
  const lines = refs.map((r) => ({ folder: r.folder, rule: r.rule, line: lineOf(home, r.folder, r.rule) ?? "" })).filter((x) => x.line);
  const was = refs[0].trust;
  for (const r of refs) {
    if (r.trust === "asks") continue;   // money, a submission or a deletion asks each time
    r.trust = t; delete r.first;
    rewritePlace(home, ag, r, true);
  }
  const c = changeLine(f, { at, kind: "trust", agent: ag.id, rules: refs.map((r) => ({ folder: r.folder, rule: r.rule })), line: `${ag.name}: how far, ${was} → ${t}.`, undo: { restore: { agent: old, lines } } });
  saveAgents(home, f);
  return { ok: true, change: c };
}
