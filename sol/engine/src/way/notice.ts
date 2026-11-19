// Cowork ways, step 4d (docs/cowork-ways-2026-11-10/FORMAT.md §3, "誰要按" and the cost of rule B): what everyone of
// a way is told when a version is applied or reverted. Rule B lets a change that touches no role be applied by one
// person: a move sent elsewhere (its `from`, `to` or `when`), or a new move, can do what a revert does not undo. So
// every role any move names hears of every change, sees which parts of the way changed, and such a move change is said
// in words. Pure: two versions in, the notice out.
import { canonical } from "../canonical.js";
import { touched } from "./fold.js";
import type { Move, Way } from "./types.js";

/** one move that differs between two versions: of which thing's life, which move, what of it changed, or that it is new
 *  or gone; and the words that say it */
export type MoveChange = { kind: string; move: string; what: ("from" | "to" | "when" | "by")[] | "new" | "gone"; say: string };
/** a change of version as everyone of the way is told it: the parts of the way that differ, the roles it touched (they
 *  agreed), the moves whose `from`, `to`, `when` or `by` changed or that are new or gone, the roles told (every role
 *  any move of either version names, but a trigger) and the logins behind them, and both runners' when it changes */
export type Notice = { from: string; to: string; slots: string[]; touched: string[]; moves: MoveChange[]; roles: string[]; people: string[] };

const own = <T>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const list = (x: Move["from"]): string => (x === null ? "(born)" : Array.isArray(x) ? x.join(", ") : x);
const loginOf = (who: string): string => who.slice(who.lastIndexOf(who.includes("@") ? "@" : ":") + 1);
const sorted = (x: Move["from"]): string[] | null => (x === null ? null : Array.isArray(x) ? [...x].sort() : [x]);

/** the top-level parts of a way that differ between two versions (pure): every part, for a first version */
export function slotsOf(from: Way | undefined, to: Way): string[] {
  const a = (from ?? {}) as Record<string, unknown>, b = to as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => canonical(a[k] ?? null) !== canonical(b[k] ?? null)).sort();
}

/** the moves whose `from`, `to`, `when` or `by` differ, or that one version has and the other not (pure), in the order of
 *  the new version's lives and moves, then those gone */
export function movesChanged(a: Way | undefined, b: Way): MoveChange[] {
  const out: MoveChange[] = [];
  const byId = (w: Way | undefined) => { const m = new Map<string, Move>(); for (const [kind, life] of Object.entries(w?.life ?? {})) for (const mv of life.moves) m.set(`${kind}/${mv.id}`, mv); return m; };
  const ma = byId(a), mb = byId(b);
  for (const [k, y] of mb) {
    const kind = k.slice(0, k.indexOf("/")), x = ma.get(k);
    if (!x) { out.push({ kind, move: y.id, what: "new", say: `new move "${y.id}" of ${kind}: ${list(y.from)} → ${y.to}, by ${y.by.join(", ")}${y.when ? `, when ${y.when}` : ""}` }); continue; }
    const what: ("from" | "to" | "when" | "by")[] = [], said: string[] = [];
    if (canonical(sorted(x.from)) !== canonical(sorted(y.from))) { what.push("from"); said.push(`from ${list(x.from)} → ${list(y.from)}`); }   // a list's order says nothing (grade20 F5)
    if (x.to !== y.to) { what.push("to"); said.push(`to ${x.to} → ${y.to}`); }
    if ((x.when ?? "") !== (y.when ?? "")) { what.push("when"); said.push(`when ${x.when ?? "(always)"} → ${y.when ?? "(always)"}`); }
    if (canonical([...x.by].sort()) !== canonical([...y.by].sort())) { what.push("by"); said.push(`by ${x.by.join(", ")} → ${y.by.join(", ")}`); }
    if (what.length) out.push({ kind, move: y.id, what, say: `move "${y.id}" of ${kind}: ${said.join("; ")}` });
  }
  for (const [k, x] of ma) if (!mb.has(k)) { const kind = k.slice(0, k.indexOf("/")); out.push({ kind, move: x.id, what: "gone", say: `move "${x.id}" of ${kind} is gone` }); }
  return out;
}

/** what everyone of a way is told of a change from one version to another (pure). `a`: the version before (none for a
 *  first apply) */
export function noticeOf(a: Way | undefined, b: Way, from: string, to: string): Notice {
  const roles = new Set<string>();
  for (const w of [a, b]) for (const life of Object.values(w?.life ?? {})) for (const mv of life.moves) for (const r of mv.by) if (!r.startsWith("trigger:")) roles.add(r);
  const people = new Set<string>();
  for (const r of roles) for (const w of [a, b]) for (const who of (w ? own(w.roles, r)?.who : undefined) ?? []) people.add(loginOf(who));
  // a change of runner touches every role (FORMAT §3): both runners' people are told too (grade20 F5)
  if (a && a.runner !== b.runner) for (const w of [a, b]) people.add(loginOf(w.runner));
  return {
    from, to, slots: slotsOf(a, b), touched: a ? touched(a, b) : Object.keys(b.roles).sort(), moves: movesChanged(a, b),
    roles: [...roles].sort(), people: [...people].sort(),
  };
}
