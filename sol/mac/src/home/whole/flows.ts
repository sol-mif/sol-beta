// A flow from a sentence, its stations and the flows page (#802, plan Part C slice 39; flows.md "The model: a flow is a
// job that runs every time", "The flows page"; scenes 1 and 7), behind sol.home.whole. Face; the flows engine is #801
// (Frank's). The pure half and its stub:
// - a sentence that says "every time …", "whenever …", "when <it happens> …" or "every day at 19:30 …" is a flow: whole's five reads stay five,
//   and a second Jev `noul`, "once or every time?", turns a job into a flow;
// - a flow is drawn as stations: watches (hollow) · Jev asks (a nacre diamond, its question, its line, last week's dots)
//   · Sol makes (warm) · on your list (a yellow ring);
// - its rung starts at read, record-only, whatever the sentence asked; a rung it can never have is struck;
// - "run it on last week" plays it over past data and writes only the ledger; "save it" puts it on the flows page;
// - the flows page: a row per flow (what it watches, the ladder, last ran, needs, on), and what Sol saw you do by hand.
// Nothing here draws; NewFlow.tsx and FlowsPage.tsx do.
//
// Stubbed until #801 lands: `stub()` answers flows.md's `flow.say {sentence}`, `flow.save {flowId}`, `flow.pause
// {flowId, on}`, `flow.run.once {flowId, replay: "last week"}`, and `flow.drop {flowId}`, `flow.habit.keep|drop {id}`,
// `home.undo {ledgerId}`, with one `flows` message of the shape below (flows.md's Flow).
import type { Rung } from "./policy.ts";

export type Station = { kind: "watch" | "judge" | "make" | "you"; title: string; detail: string;
  question?: { type: "choice" | "noul"; text: string; line: number; dots: number[]; of: string } };
/** a flow (flows.md: Flow {id, sentence, place, trigger:{kind, source, every}, steps, rung, ceiling, on, lastRun, needs}) */
export type Flow = { id: string; name: string; sentence: string; place: string;
  trigger: { kind: "watch" | "clock" | "note"; source: string; every: string };
  steps: Station[]; rung: Rung; asked: Rung; ceiling: Rung | null; on: boolean; saved: boolean;
  lastRun: string; needs: string[]; policy: string[] };
/** something Sol saw you do by hand, offered as a flow (flows.md "Sol saw you do these by hand") */
export type Habit = { id: string; sentence: string; seen: string };
export type FlowsDone = { ledgerId: string; line: string };
/** the engine's message after every ask (#801) */
export type FlowsMsg = { type: "flows"; flows: Flow[]; draft: Flow | null; habits: Habit[]; done: FlowsDone | null };
export type FlowsAsk =
  | { type: "flows" }
  | { type: "flow.say"; sentence: string }
  | { type: "flow.save"; flowId: string }
  | { type: "flow.drop"; flowId: string }
  | { type: "flow.pause"; flowId: string; on: boolean }
  | { type: "flow.run.once"; flowId: string; replay: "last week" }
  | { type: "flow.habit.keep" | "flow.habit.drop"; id: string }
  | { type: "home.undo"; ledgerId: string };

// ── once or every time? (the second Jev noul; a stand-in until #801 asks Jev) ─────────────────────────────────────
// a flow needs a repeat word (F1): "every …", "each …", "whenever", or "when <something happens>". A bare hour ("at 3 call
// Sam") is once, a filing with a date; "at 19:30 every day, …" is a flow. "when" asking a question ("when is the quiz
// due?") is once too
const DAYS = "day|morning|evening|night|week|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const REPEAT = new RegExp(`\\b(every time|each time|whenever|(every|each) (${DAYS}))\\b`, "i");
const WHEN = /^\s*when\b(?!\s+(is|are|was|were|do|does|did|will|would|should|can|could|has|have)\b)/i;
/** the probability that a sentence asks for every time, not once (pure) */
export const everyP = (sentence: string) => (REPEAT.test(sentence) || (WHEN.test(sentence) && !/\?\s*$/.test(sentence)) ? 0.93 : 0.08);
export const isFlow = (sentence: string) => everyP(sentence) >= 0.7;

// ── a sentence drawn as stations ─────────────────────────────────────────────────────────────────────────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** last week's things as dots on 0..1 (a steady seed, so a flow draws the same every time) */
function dots(n: number, through: number, line: number, seed: number): number[] {
  let s = seed >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => Math.round((i < through ? line + (1 - line) * (0.05 + 0.9 * r()) : line * (0.1 + 0.88 * r())) * 100) / 100);
}
/** what a sentence asks of Sol's hand: make notes or a draft is draft; tell or put on the list is propose; reading is read */
function askedOf(make: string): Rung {
  if (/\b(submit|send|pay|post|turn in)\b/i.test(make)) return "act";
  if (/\b(make|draft|write|save|fill|prepare)\b/i.test(make)) return "draft";
  if (/\b(tell|remind|put .* on my list|suggest|show)\b/i.test(make)) return "propose";
  return "read";
}
/** a sentence into a flow (pure): when it fires, what it watches, what Jev asks, what Sol makes, what reaches you */
export function flowOf(sentence: string, id: string): Flow {
  const s = sentence.trim().replace(/\s+/g, " ");
  const [, ...rest] = s.split(/,\s*/);
  const make = rest.join(", ") || "tell me";
  const lower = s.toLowerCase();
  const course = /\b(bio|biology)\b/.test(lower) ? "bio 201" : /\b(chem)\b/.test(lower) ? "chem 110" : /\b(stats)\b/.test(lower) ? "stats 140" : null;
  const school = !!course || /\b(slide|lecture|canvas|class|assignment|due)\b/.test(lower);
  const source = school ? `Canvas${course ? ` · ${course}` : ""}` : /\b(posting|job)\b/.test(lower) ? "LinkedIn, Handshake" : /\b(mail|email)\b/.test(lower) ? "Mail" : "your sources";
  const place = school ? `school${course ? ` › ${course}` : ""}` : /\b(posting|job|application)\b/.test(lower) ? "jobs" : "life";
  const what = /slide/.test(lower) ? "a slide" : /posting/.test(lower) ? "a posting" : "something new";
  const question = /slide/.test(lower) ? "Is this a new lecture's slides?" : `Is this ${what} for you?`;
  const made = /notes?/.test(lower) ? `notes in ${place}` : cap(make);
  const asked = askedOf(make);
  const name = /notes?/.test(lower) && course ? `${course} notes` : make.split(" ").slice(0, 3).join(" ");
  // a clock when the sentence names a day or an hour (F2): "every Sunday", "every day at 19:30"; else Sol watches a source
  const day = s.match(new RegExp(`\\b(?:every|each) (${DAYS})\\b`, "i"))?.[1], hour = s.match(/\bat (\d{1,2}(?::\d{2})?)\b/i)?.[1];
  const trigger: Flow["trigger"] = day || hour ? { kind: "clock", source: "a clock", every: [day && `every ${day}`, hour && `at ${hour}`].filter(Boolean).join(" ") }
    : { kind: "watch", source, every: school ? "every hour" : "every 2 h" };
  return {
    id, name, sentence: cap(s.replace(/\.?$/, ".")), place, trigger, rung: "read", asked, ceiling: school ? "act" : null, on: false, saved: false, lastRun: "never", needs: [],
    policy: [`Read ${school ? (course ? `${course} on Canvas` : "Canvas") : source} ${what === "a slide" ? "for new slides" : `for ${what.replace(/^a /, "")}s`};`, `${make} in ${place};`, school ? "never turn work in." : "never send without me."],
    steps: [
      { kind: "watch", title: source, detail: trigger.kind === "clock" ? `${trigger.every} · on the clock, nothing watched` : `${trigger.every} · ${what} as it is posted` },
      { kind: "judge", title: question, detail: `${what} against your ${school ? "classes and your notes" : "profile and your past yes and no"}`,
        question: { type: "choice", text: question, line: 0.7, dots: dots(14, 12, 0.7, id.length * 31 + s.length), of: `last week's ${what === "a slide" ? "posts" : "things"}` } },
      { kind: "make", title: made, detail: /notes?/.test(lower) ? "one page, headings as questions, from the slides and your earlier notes · in made/" : `${make}, never sent` },
      { kind: "you", title: /notes?/.test(lower) ? "“Notes ready: read them?”" : "“Ready: look at it?”", detail: "on your list, the morning after; nothing leaves without you" },
    ],
  };
}
/** the line under a flow's ladder (scene 1 step 2: "You asked for draft. It starts at read: it runs, and writes what it
 *  would have done. act (submit) is never this flow's.") */
export function rungLine(f: Pick<Flow, "rung" | "asked" | "ceiling">): string {
  const asked = f.asked !== f.rung ? `You asked for ${f.asked}. ` : "";
  const now = f.rung === "read" ? "It starts at read: it runs, and writes what it would have done." : `It is at ${f.rung}.`;
  const never = f.ceiling ? ` ${f.ceiling} is never this flow's.` : "";
  return `${asked}${now}${never}`;
}
/** a Jev station's count (scene 1: "3 of 41 last week clear 0.70") */
export const clearLine = (q: NonNullable<Station["question"]>) => `${q.dots.filter((p) => p >= q.line).length} of ${q.dots.length} ${q.of} clear ${q.line.toFixed(2)}`;
/** the flows page's one line (scene 7: "Five flows. Two need you; one is paused.") */
export function flowsLine(flows: Flow[]): [string, string] {
  const W = ["No flows", "One flow", "Two flows", "Three flows", "Four flows", "Five flows", "Six flows", "Seven flows"];
  const need = flows.filter((f) => f.needs.length).length, paused = flows.filter((f) => !f.on).length, Wl = ["none", "one", "two", "three", "four", "five", "six"];
  const parts = [need ? `${cap(Wl[need] ?? String(need))} ${need === 1 ? "needs" : "need"} you` : "Nothing needs you", paused ? `${Wl[paused] ?? paused} ${paused === 1 ? "is" : "are"} paused` : ""].filter(Boolean);
  return [`${W[flows.length] ?? `${flows.length} flows`}.`, `${parts.join("; ")}.`];
}

// ── the stub (until #801) ────────────────────────────────────────────────────────────────────────────────────────
const seedFlow = (f: Partial<Flow> & Pick<Flow, "id" | "name" | "sentence" | "place" | "rung" | "on" | "lastRun" | "needs">, watch: string, ceiling: Rung | null, policy: string[]): Flow =>
  ({ trigger: { kind: "watch", source: watch, every: "" }, steps: [], asked: f.rung, ceiling, saved: true, policy, ...f } as Flow);
export function seedFlows(): Flow[] {
  return [
    seedFlow({ id: "f-apps", name: "applications", sentence: "Every time a posting matches my profile, draft the application and put it on my list.", place: "jobs", rung: "draft", on: true, lastRun: "9:00 · 41 read", needs: ["Shopify: submit?"] },
      "LinkedIn, Handshake", "act", ["Read LinkedIn and Handshake for postings like the ones I said yes to;", "fill the portals, never submit;", "put each ready one on my list."]),
    seedFlow({ id: "f-follow", name: "follow-ups", sentence: "When I meet someone, draft a follow-up three days later.", place: "people", rung: "draft", on: true, lastRun: "Thu 9:00 · Priya", needs: ["Priya: send?"] },
      "your notes in people", null, ["When I write that I met someone,", "draft a follow-up in my voice three days on;", "I press send."]),
    seedFlow({ id: "f-school", name: "school", sentence: "Read Canvas; put due things on my week, make notes for each class.", place: "school", rung: "draft", on: true, lastRun: "11:02 · 3 new", needs: [] },
      "Canvas · every hour", "act", ["Read Canvas for my three classes;", "put due things on my week, dashed until I keep them;", "make notes and quizzes in the class folders."]),
    seedFlow({ id: "f-handin", name: "hand-in", sentence: "At 19:30, if I haven't handed in, tell me what is left.", place: "cowork", rung: "propose", on: true, lastRun: "Sun 19:30 · 2 left", needs: [] },
      "GitHub, the team's rhythm", null, ["At 19:30, read what I have not handed in;", "tell me what is left."]),
    seedFlow({ id: "f-reading", name: "reading summary", sentence: "Every Sunday, sum up the week's readings.", place: "school", rung: "draft", on: false, lastRun: "paused · Sun 8:00 · week 10", needs: [] },
      "a clock · Sun 8:00", null, ["Every Sunday at 8:00,", "sum up the week's readings in each class folder."]),
  ];
}
export const SEED_HABITS: Habit[] = [
  { id: "h-prs", sentence: "Before the review, show me the team's PRs that wait on me.", seen: "most nights about 20:40 you open the team's PRs and look for your name · seen 5 times" },
  { id: "h-connect", sentence: "When I meet someone, find them on LinkedIn and connect.", seen: "after each info session you search the speaker · seen 3 times · it would join follow-ups" },
];

export function stub() {
  let flows = seedFlows(), draft: Flow | null = null, habits = SEED_HABITS;
  const kept = new Map<string, { flows: Flow[]; draft: Flow | null; habits: Habit[] }>();
  let n = 0, last: FlowsDone | null = null;
  const msg = (done: FlowsDone | null, keepLast = false): FlowsMsg => { last = keepLast ? last : done; return { type: "flows", flows, draft, habits, done: last }; };
  const keep = () => { const ledgerId = `fl${++n}`; kept.set(ledgerId, { flows, draft, habits }); return ledgerId; };
  return (a: FlowsAsk): FlowsMsg => {
    if (a.type === "flows") return msg(null, true);
    if (a.type === "home.undo") { const w = kept.get(a.ledgerId); if (w) ({ flows, draft, habits } = w); kept.delete(a.ledgerId); return msg(null); }
    if (a.type === "flow.say") {
      if (!isFlow(a.sentence)) return msg({ ledgerId: "", line: "Once, not every time: filed as a job, not a flow" });
      const ledgerId = keep();
      draft = flowOf(a.sentence, `f-new-${n}`);
      return msg({ ledgerId, line: `A new flow in ${draft.place}, at read: it runs and writes what it would have done; nothing else until you raise it` });
    }
    if (a.type === "flow.run.once") {
      const f = draft?.id === a.flowId ? draft : flows.find((x) => x.id === a.flowId);
      if (!f) return msg(null);
      const q = f.steps.find((s) => s.question)?.question;
      const would = q ? q.dots.filter((p) => p >= q.line).length : 0;
      const ledgerId = keep();
      const ran = { ...f, lastRun: `last week, record-only · ${q?.dots.length ?? 0} read, ${would} would have been made` };
      if (draft?.id === f.id) draft = ran; else flows = flows.map((x) => (x.id === f.id ? ran : x));
      return msg({ ledgerId, line: `Ran on last week, record-only: ${q?.dots.length ?? 0} read, ${would} would have been ${/notes/.test(f.steps[2]?.title ?? "") ? "notes" : "made"}; nothing was written but the ledger` });
    }
    if (a.type === "flow.save") {
      if (!draft || draft.id !== a.flowId) return msg(null);
      const ledgerId = keep();
      flows = [...flows, { ...draft, saved: true, on: true, lastRun: draft.lastRun === "never" ? "not yet" : draft.lastRun }];
      const name = draft.name; draft = null;
      return msg({ ledgerId, line: `“${name}” is a flow now, at read, record-only · on the flows page` });
    }
    if (a.type === "flow.drop") { if (!draft) return msg(null); const ledgerId = keep(); draft = null; return msg({ ledgerId, line: "Not now: the flow was not made" }); }
    if (a.type === "flow.pause") {
      const f = flows.find((x) => x.id === a.flowId);
      if (!f || f.on === a.on) return msg(null, true);
      const ledgerId = keep();
      flows = flows.map((x) => (x.id === f.id ? { ...x, on: a.on } : x));
      return msg({ ledgerId, line: `${f.name}: ${a.on ? "on again" : "paused; nothing runs until you turn it on"}` });
    }
    const h = habits.find((x) => x.id === a.id);
    if (!h) return msg(null);
    const ledgerId = keep();
    habits = habits.filter((x) => x.id !== h.id);
    if (a.type === "flow.habit.keep") { draft = flowOf(h.sentence, `f-new-${n}`); return msg({ ledgerId, line: "Made into a new flow, at read; look at it before you save it" }); }
    return msg({ ledgerId, line: "Not a flow: Sol will not offer it again" });
  };
}
