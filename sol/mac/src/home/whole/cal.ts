// Three calendars as one (#807, plan Part C slice 44; flows.md "Three calendars as one", scene 6; "Decisions" 7: code
// finds calendar clashes, Jev only chooses among fixes), behind sol.home.whole. Face half; the engine half is #835
// (Frank's), the room calendar its own issue (filed with this PR). The pure half and its stub:
// - three layers: school (Canvas and the school calendar), building (your own work, the Sol sessions), cowork (the
//   team's rhythm, .sol/rhythm.json: release 9:00, hand-in 20:00, review 21:00; the room's calendar; the night job 3:00);
// - one day line, its load band (wider where the day is fuller), the team's free windows under it;
// - a clash found by code (a fixed moment of one layer inside a held span of another), with the fixes Jev ranked and the
//   one it picked;
// - a sentence that finds the team a slot ("G2 call with Frank and Isaac this week, half an hour"): the first half hour
//   everyone named is free, you included, written to the room calendar, with its undo.
// Nothing here draws; ThreeCalendars.tsx does.
//
// Stubbed until #835 lands: `stub()` answers `cal.layers`, `cal.fix.keep {conflictId, fix}`, `cal.place {sentence}` and
// `home.undo {ledgerId}` with one `cal.layers` message of the shape below.

export type LayerId = "school" | "building" | "cowork";
export type Layer = { id: LayerId; name: string; sources: string[] };
/** an event on a layer: a held span (`end`), or a fixed moment (a pin: release, hand-in) */
export type CalEvent = { id: string; layer: LayerId; title: string; at: number; end?: number; dashed?: boolean; answers?: string };   // `answers`: the team moment yours meets (your hand-in, the team's)
/** a person of the team and their free windows this week */
export type Mate = { who: string; windows: { at: number; end: number }[] };
export type Fix = { kind: string; label: string; p: number };
/** a clash (flows.md: Conflict {a, b, fixes:[{kind, p}], picked}): code found it, Jev ranked the fixes */
export type Conflict = { id: string; a: string; b: string; fixes: Fix[]; picked: string; title: string; why: string };
export type CalDone = { ledgerId: string; line: string };
/** the engine's message after every ask (#835) */
export type CalMsg = { type: "cal.layers"; day: number; layers: Layer[]; events: CalEvent[]; team: Mate[]; conflicts: Conflict[]; done: CalDone | null };
export type CalAsk =
  | { type: "cal.layers" }
  | { type: "cal.fix.keep"; conflictId: string; fix: string }
  | { type: "cal.place"; sentence: string }
  | { type: "home.undo"; ledgerId: string };

export const LAYERS: Layer[] = [
  { id: "school", name: "school", sources: ["Canvas", "the school calendar"] },
  { id: "building", name: "building", sources: ["your work", "Sol's sessions"] },
  { id: "cowork", name: "cowork", sources: [".sol/rhythm.json", "the room's calendar", "the night job"] },
];
/** the team's rhythm, as .sol/rhythm.json on main sets it */
export const RHYTHM = { release: "09:00", handIn: "20:00", review: "21:00" };

const startOf = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const at = (base: number, plus: number, h: number, m = 0) => { const d = new Date(base); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, h, m).getTime(); };
const hhmm = (s: string) => s.split(":").map(Number) as [number, number];
export const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const dayName = (t: number, now: number) => { const n = Math.round((startOf(t) - startOf(now)) / 864e5); return n === 0 ? "today" : n === 1 ? "tomorrow" : new Date(t).toLocaleDateString("en-GB", { weekday: "short" }); };

// ── code finds the clash ─────────────────────────────────────────────────────────────────────────────────────────
/** the clashes of a day (pure): a fixed moment of one layer that falls inside a held span of another layer, unless
 *  something of yours already answers it (you hand in early: the team's moment is met) */
export function clashesOf(events: CalEvent[]): [CalEvent, CalEvent][] {
  const out: [CalEvent, CalEvent][] = [], met = new Set(events.map((e) => e.answers).filter(Boolean));
  for (const pin of events.filter((e) => e.end === undefined && !e.dashed && !met.has(e.id))) for (const span of events.filter((e) => e.end !== undefined && !e.dashed))
    if (span.layer !== pin.layer && pin.at > span.at && pin.at < span.end!) out.push([span, pin]);
  return out;
}
/** how full the day is at a moment (pure): each held span counts, a fixed moment a little around it */
export function loadAt(t: number, events: CalEvent[]): number {
  let l = 0;
  for (const e of events) {
    if (e.end !== undefined) { if (t >= e.at && t <= e.end) l += e.dashed ? 0.5 : 1; }
    else l += 0.5 * Math.exp(-(((t - e.at) / 36e5) ** 2) / 0.08);
  }
  return l;
}

// ── a sentence finds the team a slot ─────────────────────────────────────────────────────────────────────────────
const WORD_MIN: [RegExp, number][] = [[/\bhalf an hour\b|\b30 ?min/i, 30], [/\ban hour\b|\b60 ?min|\b1 ?h(our)?\b/i, 60], [/\b(\d+) ?min/i, -1], [/\bquarter of an hour\b|\b15 ?min/i, 15]];
/** what a sentence asks (pure): who, how long, which days, and what to call it */
export function askOf(sentence: string, team: string[], now: number): { who: string[]; minutes: number; from: number; to: number; title: string } {
  const who = team.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(sentence));
  let minutes = 30;
  for (const [re, m] of WORD_MIN) { const x = re.exec(sentence); if (x) { minutes = m > 0 ? m : Number(x[1]); break; } }
  const d = new Date(now), sunday = at(now, (7 - d.getDay()) % 7, 23, 59);
  const range = /\bnext week\b/i.test(sentence) ? [at(now, ((7 - d.getDay()) % 7) + 1, 0), at(now, ((7 - d.getDay()) % 7) + 7, 23, 59)]
    : /\btomorrow\b/i.test(sentence) ? [at(now, 1, 0), at(now, 1, 23, 59)] : /\btoday\b/i.test(sentence) ? [now, at(now, 0, 23, 59)] : [now, sunday];
  const title = sentence.split(/\s+with\s+|\s+this\s+|\s+next\s+|,/i)[0].trim() || "a call";
  return { who, minutes, from: range[0], to: range[1], title };
}
/** the first slot of `minutes` from `from` to `to` (pure), on the half hour, between 9:00 and 21:00, where you are free
 *  (no held span of yours) and everyone named has a free window around it */
export function slotOf(ask: ReturnType<typeof askOf>, mine: CalEvent[], team: Mate[]): { at: number; end: number } | null {
  const len = ask.minutes * 6e4, step = 30 * 6e4;
  for (let t = Math.ceil(ask.from / step) * step; t + len <= ask.to; t += step) {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60, he = h + ask.minutes / 60;
    if (h < 9 || he > 21) continue;
    if (mine.some((e) => e.end !== undefined && !e.dashed && t < e.end && t + len > e.at)) continue;
    if (!ask.who.every((p) => team.find((m) => m.who.toLowerCase() === p.toLowerCase())?.windows.some((w) => w.at <= t && w.end >= t + len))) continue;
    return { at: t, end: t + len };
  }
  return null;
}

// ── the stub (until #835) ────────────────────────────────────────────────────────────────────────────────────────
/** this week as the design's day has it (scene 6), on the days of the list's own week (today.ts: the lecture, the lab,
 *  the stats group, the exam), with the team's rhythm from .sol/rhythm.json */
export function seedCal(now: number): { events: CalEvent[]; team: Mate[] } {
  const [rh, rm] = hhmm(RHYTHM.release), [hh, hmin] = hhmm(RHYTHM.handIn), [vh, vm] = hhmm(RHYTHM.review);
  // #878 R1: the week's later days sit on their weekdays (the scenes' week, from a Monday: the lab Tuesday, the stats
  // group and the free windows Wednesday, the exam Thursday), as the list's week does (#867 F1), so "Wednesday 17:30"
  // is a Wednesday on any day; a weekday already past this week is next week's. Today's own events stay today's.
  const on = (dow: number, h: number, m = 0) => at(now, (dow - new Date(now).getDay() + 7) % 7, h, m);
  const events: CalEvent[] = [
    { id: "c-lecture", layer: "school", title: "bio 201 lecture", at: at(now, 0, 10), end: at(now, 0, 11, 30) },
    { id: "c-chem", layer: "school", title: "chem set 6, held", at: at(now, 0, 19), end: at(now, 0, 21) },
    { id: "c-due", layer: "school", title: "chem set 6 due", at: at(now, 0, 23, 59) },
    { id: "c-build", layer: "building", title: "Sol: Home flows", at: at(now, 0, 14, 30), end: at(now, 0, 19) },
    { id: "c-release", layer: "cowork", title: `release ${RHYTHM.release.replace(/^0/, "")}`, at: at(now, 0, rh, rm) },
    { id: "c-morning", layer: "cowork", title: "morning run", at: at(now, 0, rh, rm + 30) },
    { id: "c-handin", layer: "cowork", title: "team hand-in", at: at(now, 0, hh, hmin) },
    { id: "c-review", layer: "cowork", title: "review", at: at(now, 0, vh, vm), end: at(now, 0, vh, vm + 45) },
    { id: "c-lab", layer: "school", title: "chem lab", at: on(2, 14), end: on(2, 17) },
    { id: "c-build2", layer: "building", title: "Sol session", at: on(2, 9), end: on(2, 12) },
    { id: "c-stats", layer: "school", title: "stats group", at: on(3, 16), end: on(3, 17, 30) },
    { id: "c-exam", layer: "school", title: "bio exam", at: on(4, 10), end: on(4, 12) },
  ];
  const team: Mate[] = [
    { who: "Frank", windows: [{ at: at(now, 0, 13), end: at(now, 0, 19) }, { at: on(2, 13), end: on(2, 15) }, { at: on(3, 13), end: on(3, 19) }, { at: on(4, 9), end: on(4, 12) }] },
    { who: "Isaac", windows: [{ at: at(now, 0, 16), end: at(now, 0, 22) }, { at: on(2, 16), end: on(2, 19) }, { at: on(3, 17, 30), end: on(3, 22) }, { at: on(4, 9), end: on(4, 11) }] },
  ];
  return { events, team };
}
/** the clash card for a clash (stub wording, scene 6), with the fixes Jev ranked and its pick */
function conflictOf([span, pin]: [CalEvent, CalEvent]): Conflict {
  const early = new Date(span.at - 30 * 6e4);
  const fixes: Fix[] = [
    { kind: "early", label: `hand in at ${hm(early.getTime())}`, p: 0.81 },
    { kind: "move", label: `move ${span.title.replace(/, held$/, "")}`, p: 0.12 },
    { kind: "late", label: "ask for late", p: 0.07 },
  ];
  return { id: `x-${span.id}-${pin.id}`, a: span.id, b: pin.id, fixes, picked: fixes.sort((x, y) => y.p - x.p)[0].kind,
    title: `Your ${pin.title.replace(/^team /, "")} falls in your ${span.title.replace(/ set \d+, held$/, "").replace(/, held$/, "")} evening. Hand in at ${hm(early.getTime())}?`,
    why: `${span.title.replace(/, held$/, "")} holds ${hm(span.at)} to ${hm(span.end!)}; the team's ${pin.title.replace(/^team /, "")} is ${hm(pin.at)}. Sol found three fixes; Jev picked the one most like you (.81).` };
}

export function stub(now: () => number = Date.now) {
  let { events, team } = seedCal(now());
  const kept = new Map<string, CalEvent[]>();
  let n = 0;
  const conflicts = () => clashesOf(events.filter((e) => startOf(e.at) === startOf(now()))).map((c) => conflictOf(c));
  const msg = (done: CalDone | null): CalMsg => ({ type: "cal.layers", day: startOf(now()), layers: LAYERS, events, team, conflicts: conflicts(), done });
  return (a: CalAsk): CalMsg => {
    if (a.type === "cal.layers") return msg(null);
    if (a.type === "home.undo") { const was = kept.get(a.ledgerId); if (was) { events = was; kept.delete(a.ledgerId); } return msg(null); }
    if (a.type === "cal.fix.keep") {
      const c = conflicts().find((x) => x.id === a.conflictId), fix = c?.fixes.find((f) => f.kind === a.fix);
      if (!c || !fix) return msg(null);
      const ledgerId = `k${++n}`; kept.set(ledgerId, events);
      const span = events.find((e) => e.id === c.a)!, pin = events.find((e) => e.id === c.b)!;
      if (fix.kind === "early") {
        const mine = span.at - 30 * 6e4;
        events = [...events.map((e) => (e.layer === "building" && e.end !== undefined && e.end > mine - 15 * 6e4 && e.at < mine ? { ...e, end: mine - 15 * 6e4 } : e)),
          { id: `c-myhandin-${n}`, layer: "cowork", title: "your hand-in", at: mine, end: mine + 15 * 6e4, answers: pin.id }]   // yours holds a quarter hour;
        return msg({ ledgerId, line: `Your hand-in moved to ${hm(mine)}; your Sol block ends at ${hm(mine - 15 * 6e4)} · the team's ${hm(pin.at)} stays` });
      }
      if (fix.kind === "move") {
        events = events.map((e) => (e.id === span.id ? { ...e, at: pin.at + 60 * 6e4, end: pin.at + 60 * 6e4 + (span.end! - span.at) } : e));
        return msg({ ledgerId, line: `${span.title.replace(/, held$/, "")} moved to ${hm(pin.at + 60 * 6e4)}` });
      }
      events = events.map((e) => (e.id === pin.id ? { ...e, dashed: true, title: `${pin.title}, late asked` } : e));
      return msg({ ledgerId, line: "Asked the team for a late hand-in" });
    }
    // cal.place: the first half hour everyone named is free, you too; written to the room calendar
    const ask = askOf(a.sentence, team.map((m) => m.who), now());
    if (!ask.who.length) return msg({ ledgerId: "", line: "Name who it is with: Frank, Isaac" });
    const slot = slotOf(ask, events.filter((e) => e.layer !== "cowork" || e.end !== undefined), team);
    if (!slot) return msg({ ledgerId: "", line: `No ${ask.minutes} minutes this week when you, ${ask.who.join(" and ")} are all free` });
    const ledgerId = `p${++n}`; kept.set(ledgerId, events);
    events = [...events, { id: `c-placed-${n}`, layer: "cowork", title: `${ask.title} · ${hm(slot.at)}`, at: slot.at, end: slot.end }];
    return msg({ ledgerId, line: `↳ a date · cowork · ${dayName(slot.at, now())} ${hm(slot.at)}, the first ${ask.minutes === 30 ? "half hour" : `${ask.minutes} minutes`} you, ${ask.who.join(" and ")} are all free · on the room's calendar` });
  };
}
/** the day's one line (scene 6: "One day, three calendars. One clash.") */
export function calLine(conflicts: Conflict[]): [string, string] {
  const n = conflicts.length;
  return ["One day, three calendars.", n === 0 ? "No clash." : n === 1 ? "One clash." : `${n} clashes.`];
}
