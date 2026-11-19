// Agents' meta (#1327, the calm pass, 2026-11-17): an agent is a chain. Rules of one place where one makes what the
// next reads are one piece of work, so they are one unit before the same-job test (jobs.ts groupRules) puts units
// across places together. Code links two rules by file names: what one makes (ruleShape's made) is what the other
// reads (a file, a folder, or a source named after a folder it fills). A rule code left alone is asked about with Jev's
// "feeds" (does one use what the other makes?) over both sentences with the place masked: its best partner at
// ≥ JEV_SAME joins it; at JEV_HALF..JEV_SAME it is an ask (decided 2026-11-17), "One agent for these two steps?", never a
// join. Jev null: the pairs go to one Sol turn of the person's own model (agents.ts Say, one prompt for all of them),
// and each yes is an ask too (an answer with no score never joins). No turn either: code's links only.
//   linkedByCode(a, b)        pure, either order
//   chainsOf(rules, ask, o)   the units, in the rules' order: a unit is its first rule with `members` (all its rules);
//                             the asks into o.asks (p null: the model's yes)
//   feedsPrompt, feedsSaid    the one turn's prompt and its answer read (pure)
//   stepAsksLate(units, ...)  the late look's asks inside a place: half band and over, all asked, nothing joined
//   shapeOf(unit)             pure: what a unit reads and makes, its members' together
//   unitsOf(rules)            the units with no links (each rule its own): the code grouping before any Jev
import { inOrder, limiter, type Ask } from "./jev.js";
import { maskOf, pairKey, ruleShape, unitShape, type RuleIn } from "./jobs.js";
import { JEV_HALF, JEV_SAME } from "./numbers.js";

/** a rule of a place, or a chain of them: the first rule's place and ids, `members` every rule in it, in order */
export type Unit = RuleIn & { members: RuleIn[] };
/** a whole Sol turn that answers in words (agents.ts Say) */
type Say = (prompt: string) => Promise<string | null>;
/** two rules of one place the person is asked about, in their policy's order; `p` Jev's score, null: the model's yes */
export type StepPair = { a: RuleIn; b: RuleIn; p: number | null };
export type ChainOpts = {
  /** the asks, filled here */
  asks?: StepPair[];
  /** pairs the person kept apart (pairKey): never asked again */
  apart?: Set<string>;
  /** the turn asked when Jev is null; none: code's links only */
  say?: Say;
};

const stem = (x: string) => x.replace(/\/$/, "");
const base = (x: string) => stem(x).split("/").pop()!;
/** what a made thing is called when another rule reads it: the file or folder itself, its last part, and a folder's
 *  name as a source (a folder people/ filled by one rule is the "people" another rule starts from) */
function readsMade(made: string, read: string): boolean {
  if (!made || !read || made.startsWith("<")) return false;
  if (made === read || stem(made) === stem(read)) return true;
  if (made.endsWith("/") && read.startsWith(made)) return true;
  return /\.[a-z0-9]{1,5}$/.test(made) && base(made) === base(read);
}
/** one rule makes what the other reads (pure, either order) */
export function linkedByCode(a: Pick<RuleIn, "sentence" | "source" | "names">, b: Pick<RuleIn, "sentence" | "source" | "names">): boolean {
  const x = ruleShape(a), y = ruleShape(b);
  const feeds = (p: typeof x, q: typeof y) => p.made.some((m) => q.reads.some((r) => readsMade(m, r)));
  return feeds(x, y) || feeds(y, x);
}
/** a unit's reads and makes (pure): its members' together */
export const shapeOf = unitShape;
/** what Jev reads of a rule for the feeds question: its source (when it reads one) and its sentence, the place masked */
export const feedWords = (r: Pick<RuleIn, "sentence" | "source" | "names">) => maskOf(`${r.source}: ${r.sentence}`, r.names);

const unitOf = (ms: RuleIn[]): Unit => ({ ...ms[0], sentence: ms.map((m) => m.sentence.replace(/[.\s]+$/, "")).join("; "), members: ms });
export const unitsOf = (rules: RuleIn[]): Unit[] => rules.map((r) => unitOf([r]));

/** the links code makes and the pairs it leaves to Jev (pure) */
function linking(rules: RuleIn[]) {
  const idx = new Map(rules.map((r, i) => [r, i]));
  const root = rules.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  const link = (a: RuleIn, b: RuleIn) => { const x = find(idx.get(a)!), y = find(idx.get(b)!); if (x !== y) root[Math.max(x, y)] = Math.min(x, y); };
  const byPlace = new Map<string, RuleIn[]>();
  for (const r of rules) { if (!byPlace.has(r.place)) byPlace.set(r.place, []); byPlace.get(r.place)!.push(r); }
  const left: [RuleIn, RuleIn][] = [];
  for (const rs of byPlace.values()) for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    if (linkedByCode(rs[i], rs[j])) link(rs[i], rs[j]); else left.push([rs[i], rs[j]]);
  }
  const units = () => {
    const m = new Map<number, RuleIn[]>();
    rules.forEach((r, i) => { const k = find(i); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return [...m.entries()].sort(([a], [b]) => a - b).map(([, ms]) => unitOf(ms));
  };
  const alone = (r: RuleIn) => { const k = find(idx.get(r)!); return rules.every((x, i) => x === r || find(i) !== k); };
  const together = (a: RuleIn, b: RuleIn) => find(idx.get(a)!) === find(idx.get(b)!);
  return { link, left, units, alone, together };
}
/** the units by code alone (sync): only rules whose files link them */
export const chainsByCode = (rules: RuleIn[]): Unit[] => linking(rules).units();

/** the one turn's prompt (pure): every pair numbered, each rule masked as Jev reads it */
export function feedsPrompt(pairs: [RuleIn, RuleIn][]): string {
  return [
    "Each numbered pair below is two standing rules an assistant follows in one place of a person's life, with the place, the names and the dates taken out.",
    "For each pair: does one of them use what the other makes (its file, its notes, its list, its plan), so that together they are one chain of work? Two separate pieces of work that only share a place are a no.",
    "Answer with one line per pair, its number and yes or no, like \"1: no\". Nothing else; read no file.",
    "",
    ...pairs.map(([a, b], i) => `${i + 1}. first: ${feedWords(a)}\n   second: ${feedWords(b)}`),
  ].join("\n");
}
/** the pairs (their index) the turn said yes to (pure); an answer it could not read is no yes */
export function feedsSaid(text: string | null, n: number): number[] {
  const yes = new Set<number>();
  for (const m of (text ?? "").matchAll(/^\W*(\d+)\W+(yes|no)\b/gim)) { const k = Number(m[1]); if (k >= 1 && k <= n && /yes/i.test(m[2])) yes.add(k - 1); }
  return [...yes].sort((x, y) => x - y);
}

/** the units of the rules (each place apart): linked by code first; then each rule code left alone asks Jev about the
 *  other rules of its place and joins the one it scores highest, at JEV_SAME or more; a best partner in the half band
 *  is an ask (o.asks). Two chains code made stay two (their files say they are separate work), and a rule joins one
 *  chain, never two through a weak link. Jev null on a pair: it goes to the one turn (o.say), whose yes is an ask */
export async function chainsOf(rules: RuleIn[], ask: Ask, o: ChainOpts = {}): Promise<Unit[]> {
  const { link, left, units, alone, together } = linking(rules);
  const lone = new Set(rules.filter(alone));
  const pairs = left.filter(([a, b]) => lone.has(a) || lone.has(b));
  const best = new Map<RuleIn, { to: RuleIn; p: number }>();
  const blind: [RuleIn, RuleIn][] = [];
  const keep = (a: RuleIn, b: RuleIn, p: number) => { if (lone.has(a) && p > (best.get(a)?.p ?? -1)) best.set(a, { to: b, p }); };
  // a few at a time, the answers read in order
  await inOrder(pairs, ([a, b]) => ask("feeds", feedWords(a), feedWords(b)), (p, [a, b]) => {
    if (p !== null) { keep(a, b, p); keep(b, a, p); } else blind.push([a, b]);
  }, limiter());
  for (const r of rules) { const b = best.get(r); if (b && b.p >= JEV_SAME) link(r, b.to); }
  // the asks: once a pair, never one kept apart, never two rules already one chain
  const asked = new Set<string>();
  const put = (a: RuleIn, b: RuleIn, p: number | null) => {
    const k = pairKey(a, b);
    if (!o.asks || asked.has(k) || o.apart?.has(k) || together(a, b)) return;
    asked.add(k);
    o.asks.push(rules.indexOf(a) < rules.indexOf(b) ? { a, b, p } : { a: b, b: a, p });
  };
  for (const r of rules) { const b = best.get(r); if (b && b.p >= JEV_HALF && b.p < JEV_SAME) put(r, b.to, b.p); }
  if (blind.length && o.say && o.asks) {
    const said = await o.say(feedsPrompt(blind)).catch(() => null);
    for (const k of feedsSaid(said, blind.length)) put(blind[k][0], blind[k][1], null);
  }
  return units();
}
/** the late look's asks inside each place (agents.json there: nothing joins by itself, #1381). Each unit that is one
 *  rule in its place asks feeds about the other units there (an agent's rules of one place are one unit); its best
 *  partner at JEV_HALF or more is an ask, a pair in `skip` (kept apart, asked before, one agent already) never. Jev
 *  null on a pair: it goes to the one turn of the person's own model (o.say), whose yes is an ask with no score, as in
 *  the first grouping; `o.said` says the turn was had. No turn: no ask */
export async function stepAsksLate(units: RuleIn[], ask: Ask, skip: Set<string>, o: { say?: Say; said?: boolean } = {}): Promise<StepPair[]> {
  const one = (u: RuleIn) => (u.members?.length ?? 1) === 1;
  const all = (u: RuleIn) => (u.members?.length ? u.members : [u]);
  const skipped = (a: RuleIn, b: RuleIn) => all(a).some((x) => all(b).some((y) => skip.has(pairKey(x, y))));
  const pairs: [RuleIn, RuleIn][] = [];
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const [a, b] = [units[i], units[j]];
    if (a.place === b.place && (one(a) || one(b)) && !skipped(a, b)) pairs.push([a, b]);
  }
  const best = new Map<RuleIn, { to: RuleIn; p: number }>();
  const keep = (a: RuleIn, b: RuleIn, p: number) => { if (one(a) && p > (best.get(a)?.p ?? -1)) best.set(a, { to: b, p }); };
  const blind: [RuleIn, RuleIn][] = [];
  await inOrder(pairs, ([a, b]) => ask("feeds", feedWords(a), feedWords(b)), (p, [a, b]) => { if (p !== null) { keep(a, b, p); keep(b, a, p); } else blind.push([a, b]); }, limiter());
  const out: StepPair[] = [], asked = new Set<string>();
  const put = (a: RuleIn, b: RuleIn, p: number | null) => {
    if (asked.has(pairKey(a, b))) return;
    asked.add(pairKey(a, b));
    out.push(units.indexOf(a) < units.indexOf(b) ? { a, b, p } : { a: b, b: a, p });
  };
  for (const u of units) { const b = best.get(u); if (b && b.p >= JEV_HALF) put(u, b.to, b.p); }
  if (blind.length && o.say) {
    const said = await o.say(feedsPrompt(blind)).catch(() => null);
    o.said = said !== null;
    for (const k of feedsSaid(said, blind.length)) put(blind[k][0], blind[k][1], null);
  }
  return out;
}
