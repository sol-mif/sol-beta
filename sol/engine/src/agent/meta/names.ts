// Agents' meta (#1327, the calm pass, 2026-11-17): an agent's name, by code, in the person's own words. No Sol turn
// names anything, so the first open never waits on a naming turn. In order:
//   one place      the place's name, when no other agent works there
//   one kind       its places are siblings: the parent's name when it is a plural (clients/ → Clients), else the
//                  noun every place's rules say after "the" or "each" (the course → Courses)
//   what it makes  a folder it fills (applications/ → Applications), else the kind of thing it makes when all of its
//                  work is one kind (messages, lists), else the folder its files go into (invoices/month.md →
//                  Invoices), else a file it makes that none of its own steps reads
//   the job        jobs.ts nameOfJob over its first rule, as before
// Names stay unique: a second agent with a taken name gets its job's name.
import { madeOf } from "./traces.js";
import { maskOf, unitShape, type RuleIn } from "./jobs.js";
import { dateWord, nameOfFolder } from "./places.js";

export type Named = { units: RuleIn[] };

/** folders and files any agent fills that say nothing of what it is */
const GENERIC = new Set(["made", "drafts", "draft", "tmp", "temp", "out", "output", "outputs", "files", "data", "log", "logs", "inbox", "ledger", "brain", "notes", "today"]);
/** words after "the" that are no thing */
const NOT_NOUN = new Set(["first", "last", "next", "same", "whole", "top", "new", "one", "ones", "other", "rest", "way", "end", "time", "day", "week", "night", "morning", "evening", "page", "person", "place"]);

export const plural = (w: string) => /(s|x|z|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;
const isPlural = (w: string) => /[^s]s$/.test(w) || /ies$/.test(w) || /^people$/i.test(w);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const parentOf = (place: string) => (place.includes("#") ? place.split("#")[0] : place.split("/").slice(0, -1).join("/"));
const membersOf = (u: RuleIn) => (u.members?.length ? u.members : [u]);

/** the noun every place's rules say after "the", "each" or "every" (pure); null when they share none */
export function sharedNoun(byPlace: RuleIn[][]): string | null {
  const count = new Map<string, number>();
  const sets = byPlace.map((rs) => {
    const s = new Set<string>();
    for (const r of rs.flatMap(membersOf)) {
      for (const m of maskOf(r.sentence, r.names).toLowerCase().matchAll(/\b(?:the|each|every)\s+(?:whole\s+|new\s+)?([a-z]{3,})\b/g)) {
        const w = m[1];
        if (NOT_NOUN.has(w) || dateWord(w)) continue;
        s.add(w);
        count.set(w, (count.get(w) ?? 0) + 1);
      }
    }
    return s;
  });
  const all = [...(sets[0] ?? [])].filter((w) => sets.every((s) => s.has(w)));
  if (!all.length) return null;
  return all.sort((a, b) => (count.get(b)! - count.get(a)!))[0];
}

/** the noun of what a group makes (pure): a folder it fills, the one kind of thing all its work makes, a file it makes
 *  that none of its own steps reads; null when it says none */
export function madeNoun(units: RuleIn[]): string | null {
  const shapes = units.flatMap(membersOf).map((m) => unitShape(m));
  const reads = new Set(shapes.flatMap((s) => s.reads));
  const made = shapes.flatMap((s) => s.made).filter((x) => !x.includes("<"));
  const name = (x: string) => x.replace(/\/$/, "").split("/").pop()!.replace(/\.[a-z0-9]{1,5}$/, "").replace(/[-_]+/g, " ").trim();
  const dirs = made.filter((x) => x.endsWith("/")).map(name).filter((n) => n && !GENERIC.has(n));
  if (dirs.length) return cap(isPlural(dirs[0]) ? dirs[0] : plural(dirs[0]));
  const kinds = units.map((u) => madeOf(membersOf(u).map((m) => m.sentence).join("; ")).kind);
  if (kinds.length && kinds.every((k) => k === kinds[0]) && ["message", "list", "calendar"].includes(kinds[0])) return cap(plural(kinds[0]));
  // a folder its files go into (invoices/month.md → Invoices)
  const into = made.filter((x) => !x.endsWith("/") && x.includes("/")).map((x) => name(x.split("/").slice(0, -1).join("/"))).filter((n) => n && !GENERIC.has(n) && !/\d/.test(n));
  if (into.length) return cap(isPlural(into[0]) ? into[0] : plural(into[0]));
  const files = made.filter((x) => !x.endsWith("/") && /\.[a-z0-9]{1,5}$/.test(x) && !reads.has(x)).map(name).filter((n) => n && !GENERIC.has(n) && !/\d/.test(n));
  return files.length ? cap(files[0]) : null;
}

/** each group's name (pure, in order): `fallback(i)` is the job's own name (nameOfJob) */
export function namesOf(groups: Named[], fallback: (i: number) => string): string[] {
  const placesIn = groups.map((g) => [...new Set(g.units.map((u) => u.place))]);
  const out: string[] = [];
  groups.forEach((g, i) => {
    const places = placesIn[i];
    const pick = (): string | null => {
      if (places.length === 1) {
        // an agent across several places (the messages of many) does not take a place's own agent's name from it
        const alone = !placesIn.some((ps, k) => k !== i && ps.length === 1 && ps[0] === places[0]);
        return alone ? nameOfFolder(places[0]) : madeNoun(g.units);
      }
      const parents = [...new Set(places.map(parentOf))];
      // the kind's name only when no other agent works only in its places (two jobs over the clients: each its own
      // noun); one that also works elsewhere (the messages of a course and a project) is another job, not this kind's
      const alone = !placesIn.some((ps, k) => k !== i && ps.every((p) => places.includes(p)));
      if (alone && parents.length === 1 && parents[0]) {
        const p = parents[0].split("/").pop()!.replace(/[-_]+/g, " ");
        if (isPlural(p.toLowerCase())) return cap(p);
        const noun = sharedNoun(places.map((pl) => g.units.filter((u) => u.place === pl)));
        if (noun) return cap(plural(noun));
      }
      return madeNoun(g.units);
    };
    let n = pick() ?? fallback(i);
    if (out.some((x) => x.toLowerCase() === n.toLowerCase())) n = fallback(i);
    if (out.some((x) => x.toLowerCase() === n.toLowerCase())) { let k = 2; while (out.includes(`${n} ${k}`)) k++; n = `${n} ${k}`; }
    out.push(n);
  });
  return out;
}
