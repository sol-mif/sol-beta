// A way's clock triggers (FORMAT §1.5): which are due now, and what they write. Pure: now (ms) and which Sol this is
// (`<machine>@<login>`) come in; the zone is the way's own (clock.ts), never this machine's.
//   only the runner   a way names one Sol that runs its triggers (`runner`, `<machine>@<login>`); on any other Sol
//                     nothing is due, another Sol of the same person included, so the same tick is never written twice
//                     and its ping goes out once. With that Sol closed, triggers wait. (The fold agrees: a firing not
//                     signed `machine:<runner>` is passed over)
//   the tick          the last `daily HH:MM` or `weekly <day> HH:MM` at or before now, in the way's zone. A thing is due
//                     for it when the trigger has not fired for that thing at that tick or later, the tick is not before
//                     the thing was born, the thing is not in an end state, and the trigger's `if` passes at the tick
//                     (the fold judges it again there). A Sol that was closed for days fires once, for the latest tick
//   what it writes    nothing, when the `if` does not pass (so calling again within a tick writes nothing new). When it
//                     does: the `if`'s way.checked, each saying the tick (a lead check: in a team's book it is folded
//                     only right before this firing, spine.ts), then way.fired { trigger, thing, tick, checks }, then what its `do`
//                     does, judged with the firing already standing (a move's `when` that asks whether this trigger
//                     fired reads this firing, as every fold of what is written does): `ping` writes nothing more (the ping goes to the role's people, with the way's `say`); `move`
//                     presses the move as `trigger:<id>` (moves.ts judge: the move's `by` must name it, its `from` and
//                     `when` hold as for anyone), and its drafts point at the way.fired; `act` lists the seam to run with
//                     the thing's fields (or writes its way.acted when the answer is handed in)
//   the order         at one tick, the triggers that ping before the others, each group by id (FORMAT §1.5: asked
//                     before it is dropped), and things by birth then id, each one's drafts folded before the next is
//                     judged, so a thing a trigger moved is seen moved by the next. The order of keys in the file does
//                     not count: two files with one ver behave alike
// `event:<kind>` triggers are not a clock's and are not listed here (they need the wiring, step four).
import { lastTick, readOn } from "./clock.js";
import { copy, stepDrafts, type step } from "./fold.js";
import { acted, checked, judge, subjectOf, type Act } from "./moves.js";
import { evaluate } from "./rules.js";
import { lifeOf, own, type Answers, type Draft, type Loaded, type Projection, type Way } from "./types.js";

/** a ping to deliver: the role, the trigger, the thing, the way's words for it */
export type Ping = { role: string; trigger: string; thing: string; say?: string; tick: number };
/** what is due now: the drafts in order, the acts to run, the pings to deliver */
export type Due = { drafts: Draft[]; acts: Act[]; pings: Ping[] };

/** a way's trigger ids in the order they run at one tick (pure): the pings first, then the rest, each by id */
export const triggerOrder = (way: Way): string[] => Object.keys(way.triggers).sort((a, b) => {
  const pa = "ping" in way.triggers[a].do ? 0 : 1, pb = "ping" in way.triggers[b].do ? 0 : 1;
  return pa - pb || (a < b ? -1 : a > b ? 1 : 0);
});

/** the triggers due now on this Sol (pure). `me`: this Sol, `<machine>@<login>` (never a bare login); only the Sol the
 *  way names as runner gets anything. `acted`: an act's answer handed in (a replay's recorded one); without it the act
 *  is listed to run. `only`: these triggers alone */
export function due(l: Loaded, p: Projection, now: number, me: string, answers: Answers = {}, acted_: Record<string, boolean> = {}, only?: ReadonlySet<string>): Due {
  const out: Due = { drafts: [], acts: [], pings: [] };
  const way = l.way;
  if (!way || !l.runs || me !== way.runner || !p.ver || p.ver !== l.ver) return out;
  dueInto(out, l, way, copy(p), now, only ? triggerOrder(way).filter((id) => only.has(id)) : triggerOrder(way), answers, acted_);
  return out;
}

/** these triggers, in the order given, run at `now` on a projection that is changed as they go (pure but for `work` and
 *  `out`): each one's drafts are added to `out` and folded into `work` before the next is judged. due() hands it a copy;
 *  a replay hands it its own working projection, a tick after a tick, so a life of many days is not copied once a day.
 *  The caller has checked that the way runs here and that `work` is on its version */
export function dueInto(out: Due, l: Loaded, way: Way, work: Projection, now: number, ids: readonly string[], answers: Answers, acted_: Record<string, boolean>): void {
  const ways = (ver: string) => (ver === l.ver ? way : undefined);
  const things = Object.values(work.things).sort((a, b) => a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((t) => t.id);
  for (const id of ids) {
    const trig = way.triggers[id];
    const on = readOn(trig.on);
    if (!on) continue;
    const tick = lastTick(on, now, way.zone);
    if (!Number.isFinite(tick)) continue;
    for (const thingId of things) {
      const t = work.things[thingId];
      if (t.state === null || own(lifeOf(way, t.kind)?.states, t.state)?.end) continue;
      if ((t.fired[id] ?? -Infinity) >= tick || tick < t.born) continue;
      const mine: Draft[] = [];
      let named: number[] = [];
      if (trig.if !== undefined) {
        const j = evaluate(way, trig.if, `trigger:${id}`, subjectOf(t), tick, answers);
        if (!j.pass) continue;   // nothing written: judged again at the next call, the same way
        mine.push(...checked(way, l.ver, thingId, j.checks, now, { tick }));
        named = j.checks.map((_, i) => i);
      }
      const fired = mine.push({ kind: "way.fired", item: thingId, at: now, value: { way: way.id, ver: l.ver, trigger: id, thing: thingId, tick }, ...(named.length ? { checks: named } : {}) }) - 1;
      // the firing stands before what it does is judged, as it does in the book: a move's `when` that asks whether
      // this trigger fired reads this very firing, here as in every fold of what is written
      const ids = stepDrafts(work, mine, ways);
      const d = trig.do;
      if ("ping" in d) out.pings.push({ role: d.ping, trigger: id, thing: thingId, ...(d.say !== undefined ? { say: d.say } : {}), tick });
      else if ("move" in d) {
        // the move's drafts follow the way.fired: its index shifts theirs, and what had no cause answers the firing
        const r = judge(l, work, { thing: thingId, move: d.move, roles: [`trigger:${id}`], trigger: true, acted: acted_ }, now, answers);
        const base = mine.length;
        for (const x of r.drafts) mine.push({ ...x, cause: x.cause !== undefined ? x.cause + base : fired, ...(x.checks ? { checks: x.checks.map((i) => i + base) } : {}) });
        for (const a of r.acts) out.acts.push({ ...a, after: a.after + base + out.drafts.length });
      } else {
        const seam = way.seams[d.act];
        const done = own(acted_, d.act);
        if (t.missing.length) mine.push(acted(way, l.ver, thingId, d.act, false, now, fired));   // a field never came: fails closed
        else if (done === undefined) out.acts.push({ seam: d.act, thing: thingId, pv: seam.pv, pkg: seam.pkg, after: fired + out.drafts.length, fields: { ...t.fields } });
        else mine.push(acted(way, l.ver, thingId, d.act, done, now, fired));
      }
      add(out, mine, work, ways, ids);
    }
  }
}

/** a trigger's drafts added to the list (their indexes shifted to it) and folded into the working projection: those
 *  after the firing, which was folded before its `do` was judged (`done`: the ids its drafts were given) */
function add(out: Due, mine: Draft[], work: Projection, ways: Parameters<typeof step>[2], done: readonly string[]): void {
  const base = out.drafts.length;
  for (const d of mine) out.drafts.push({ ...d, ...(d.cause !== undefined ? { cause: d.cause + base } : {}), ...(d.checks ? { checks: d.checks.map((i) => i + base) } : {}) });
  stepDrafts(work, mine, ways, done);
}
