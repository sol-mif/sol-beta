// Settings › Privacy, the ledger, for trust only (BR1, #1615; mine/look/br1/because.html scene 4): one plain list for
// the person who wants to check or erase. Nothing on the canvas or in the sidebar leads here.
//   reads(you)        what Sol may read: each source the last read read, in full or cut short by a stop (on), or the
//                     person said no to (read.off: off), in their words. It turns off and on by next.you.source (agreed
//                     with the people builder); until the engine's answer carries read.off, the rows only say whether
//                     each is read and nothing pretends to switch
//   ledger(all, q)    everything Sol has learned, the same Known as every screen (known.ts), found by any of its words
//   byPlace(list)     read under who it is about: the person first, then each place by its name (placeName)
// Pure, so the tests read it with invented people only. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Known } from "../known.ts";
import type { Source, You } from "../movein/you/types.ts";

/** each source as the person would name it, where it is read */
export const READS: Record<Source, string> = {
  "claude-sessions": "Claude Code sessions on this Mac", "codex-sessions": "Codex sessions on this Mac", apps: "Your apps",
  browser: "Your browsers’ history", "calendar-store": "Your calendar", notes: "Your notes", files: "Your files", projects: "Your code",
};
const ORDER = Object.keys(READS) as Source[];

/** can: the engine answers with read.off, so the row is a switch (next.you.source); until then it only says */
export type ReadRow = { source: Source; name: string; on: boolean; can: boolean };
/** what Sol may read: the last read's sources and the ones a stop cut short (read in part: still read, what was read
 *  kept), then the ones the person said no to (read.off), each once, in one fixed order */
export function reads(you: Pick<You, "read"> | null | undefined): ReadRow[] {
  const r = you?.read, off = new Set<string>(r?.off ?? []), can = Array.isArray(r?.off);
  const on = new Set<string>([...(r?.sources ?? []), ...(r?.stopped ?? [])].filter((s) => !off.has(s)));
  return ORDER.filter((s) => on.has(s) || off.has(s)).map((s) => ({ source: s, name: READS[s], on: on.has(s), can }));
}

/** a source just turned off, said with what Sol forgot from it (the lines that came from it, taken before the switch):
 *  how many, the first one or two in their own words; none, that Sol had learned nothing there */
export function forgot(name: string, left: readonly Known[]): string {
  const said = /^Your\b/.test(name) ? name[0].toLowerCase() + name.slice(1) : name, head = `Sol no longer reads ${said}.`;
  if (!left.length) return `${head} Sol hadn't learned anything there yet.`;
  // what it knew of the person comes first, then what it knew of a place
  const first = [...left.filter((f) => f.place === null), ...left.filter((f) => f.place !== null)];
  const q = (f: Known) => `“${f.fact.trim().replace(/[.。]$/, "")}”`, n = left.length;
  return `${head} It forgot ${n} thing${n === 1 ? "" : "s"} it learned there: ${q(first[0])}${n === 2 ? `, ${q(first[1])}` : n > 2 ? `, +${n - 1}` : ""}`;
}

/** everything Sol has learned, found by words: every word asked is in the fact, where it came from, or its place (its
 *  name as said, or its path) */
export function ledger(all: readonly Known[], q: string, name: (place: string) => string = (p) => p): Known[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...all];
  return all.filter((f) => { const hay = `${f.fact} ${f.source} ${f.place ?? ""} ${f.place ? name(f.place) : ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

export type Group = { place: string | null; name: string; lines: Known[] };
/** the ledger under who it is about: the person first ("About you"), then each place in the order it first comes, by
 *  its name, so a line that says "here" is read under the place it means */
export function byPlace(list: readonly Known[], name: (place: string) => string): Group[] {
  const out: Group[] = [];
  for (const f of list) {
    let g = out.find((x) => x.place === f.place);
    if (!g) { g = { place: f.place, name: f.place ? name(f.place) : "About you", lines: [] }; if (f.place) out.push(g); else out.unshift(g); }
    g.lines.push(f);
  }
  return out;
}

/** a place's name: the part next.you names, else the last part of its path ("w:/u/ana/garden" → "garden") */
export function placeName(you: Pick<You, "parts"> | null | undefined, place: string): string {
  const p = you?.parts.find((x) => x.id === place || `w:${x.id}` === place || `h:${x.id}` === place);
  if (p?.name) return p.name;
  const bare = place.replace(/^[wh]:/, "").replace(/\/+$/, "");
  return bare.slice(bare.lastIndexOf("/") + 1) || bare;
}
