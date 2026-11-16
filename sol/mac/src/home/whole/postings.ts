// The applications flow, living (#808, plan Part C slice 45; flows.md flow 1 "Applications", scene 2; the still
// home/shots/flows-2.png), behind sol.home.whole and the flow's own switch (its on, flows page). Face; the engine half
// is #836 (Frank's). The pure half and its stub:
// - it watches LinkedIn and Handshake every 2 h, 7:00–23:00;
// - Jev's `fit` (choice, line .70): for you ≥ .70 is drafted; a maybe (.45–.70) asks you; under .45 it is held, a count;
// - Sol fills the portal in your browser (Sol's hand, watchable), then Jev's `ready` (noul, line .80): ready ≥ .80 waits
//   on your yes; under .80, one more pass, then a question card naming what is missing;
// - submit is his, every time: Sol's hand stops before submit; "submit now" is his press, held 10 s so undo can take it.
// Nothing here draws; Applications.tsx does.
//
// Stubbed until #836 lands: `stub()` answers `flow.apps {flowId}`, `flow.run.now {flowId}` (the 2-hourly look, now),
// `home.answer {thingId, answer}`, `home.later {thingId}` and `home.undo {ledgerId}` with one `flow.apps` message of the
// shape below (flows.md's Run, JudgeRead and the things on the list it makes).
import type { Station } from "./flows.ts";

export const FIT = 0.7, READY = 0.8, GUESS = 0.45;
export const HOURS = { from: 7, to: 23, every: 2 };
export type Site = "LinkedIn" | "Handshake";
/** a posting the flow read and what became of it: held (under .45), asks (a maybe), typing (Sol's hand in the portal),
 *  second (under .80, one more pass), missing (still under .80: a question card), ready (waits on your yes), going (your
 *  press, held 10 s), in (submitted by you), later (moved to the back) */
export type Posting = {
  id: string; company: string; role: string; where: string; site: Site; portal: string; closes: string;
  fit: number; ready?: number; passes: number; missing?: string; state: "held" | "asks" | "typing" | "second" | "missing" | "ready" | "going" | "in" | "later";
  drafted?: string; answers: number; field?: [number, number];
};
export type AppsDone = { ledgerId: string; line: string; thingId?: string };
/** the engine's message after every ask (#836) */
export type AppsMsg = { type: "flow.apps"; flowId: "f-apps"; at: string; next: string; read: number; held: number; postings: Posting[]; done: AppsDone | null };
export type AppsAsk =
  | { type: "flow.apps"; flowId: "f-apps" }
  | { type: "flow.run.now"; flowId: "f-apps" }
  | { type: "home.answer"; thingId: string; answer: "submit" | "yes, draft it" | "no" }
  | { type: "home.later"; thingId: string }
  | { type: "home.undo"; ledgerId: string };

// ── the rules (pure) ─────────────────────────────────────────────────────────────────────────────────────────────
/** Jev's fit on a posting (choice, line .70): for you, maybe (it asks), or not (held) */
export const fitOf = (p: number): "for_you" | "maybe" | "not" => (p >= FIT ? "for_you" : p >= GUESS ? "maybe" : "not");
/** after Sol's draft, Jev's ready (noul, line .80): ready waits on you; under it one more pass, then a question */
export const readyOf = (p: number, passes: number): "ready" | "second" | "missing" => (p >= READY ? "ready" : passes < 2 ? "second" : "missing");
/** where a fresh posting goes on its fit (and, when drafted, its ready) */
export function placeOf(fit: number, ready?: number, passes = 1): Posting["state"] {
  const f = fitOf(fit);
  if (f === "not") return "held";
  if (f === "maybe") return "asks";
  return ready === undefined ? "typing" : readyOf(ready, passes);
}
/** the looks of a day: every 2 h from 7:00 to 23:00 */
export const looks = () => Array.from({ length: (HOURS.to - HOURS.from) / HOURS.every + 1 }, (_, i) => HOURS.from + i * HOURS.every);
/** the next look after an hour (a decimal hour), or tomorrow's first */
export function nextLook(hour: number): string {
  const n = looks().find((h) => h > hour);
  return n === undefined ? `tomorrow ${HOURS.from}:00` : `${n}:00`;
}
/** what waits on you, in the list's order: ready first, then a question, then a maybe; later at the back */
export function needsOf(ps: Posting[]): Posting[] {
  const rank: Partial<Record<Posting["state"], number>> = { ready: 0, missing: 1, asks: 2 };
  const front = ps.filter((p) => rank[p.state] !== undefined).sort((a, b) => rank[a.state]! - rank[b.state]!);
  return [...front, ...ps.filter((p) => p.state === "later")];
}
const W = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things"];
/** the one line (scene 2: "Two things need you here. Figma is being typed.") */
export function appsLine(ps: Posting[], on: boolean): [string, string] {
  if (!on) return ["Applications is paused.", "Nothing is read until you turn it on."];
  const n = needsOf(ps).length, typing = ps.filter((p) => p.state === "typing");   // in the browser now; a second pass is Jev's, not the hand's
  return [`${W[n] ?? `${n} things`} ${n === 1 ? "needs" : "need"} you here.`, typing.length ? `${typing.map((p) => p.company).join(" and ")} ${typing.length === 1 ? "is" : "are"} being typed.` : "Nothing is being typed."];
}
/** the front card's words for a posting that waits on you */
export function cardOf(p: Posting): { title: string; why: string; answers: [string, string] } {
  if (p.state === "asks") return { title: `Is ${p.company}'s ${p.role} for you?`, why: `Jev isn't sure (${p.fit.toFixed(2).replace(/^0/, "")}): ${p.missing ?? "close, one thing off"}. Under .70 Sol drafts nothing until you say.`, answers: ["yes, draft it", "no"] };
  if (p.state === "missing") return { title: `${p.company}'s application needs one thing from you.`, why: `Two passes and Jev still reads it short of ready (${p.ready!.toFixed(2).replace(/^0/, "")}): ${p.missing}. Nothing is submitted.`, answers: ["let me read it", "no"] };
  return { title: `${p.company}'s application is ready. Submit it?`, why: `Drafted at ${p.drafted} from your résumé and the two letters you liked; Jev read it ready (${p.ready!.toFixed(2).replace(/^0/, "")}). The portal is signed in. Nothing is submitted.`, answers: ["submit now", "let me read it"] };
}
/** the flow drawn as stations (scene 2), with what is at each: watches · fit? · Sol makes · ready? · your yes */
export function stationsOf(m: Pick<AppsMsg, "read" | "held" | "at" | "postings">): (Station & { at: Posting[] })[] {
  const ps = m.postings, by = (...s: Posting["state"][]) => ps.filter((p) => s.includes(p.state));
  const cleared = ps.filter((p) => fitOf(p.fit) === "for_you").length, guesses = by("asks").length;
  const ready = ps.filter((p) => p.ready !== undefined && p.state !== "in");
  return [
    { kind: "watch", title: "LinkedIn, Handshake", detail: `${m.read} read since 7:00`, at: [] },
    { kind: "judge", title: `for you? · ${FIT.toFixed(2).replace(/^0/, "")}`, detail: `${cleared} cleared · ${guesses} a guess · ${m.held} held`, at: by("asks") },
    { kind: "make", title: "the application", detail: "in your browser, now", at: by("typing") },
    { kind: "judge", title: `ready? · ${READY.toFixed(2).replace(/^0/, "")}`, detail: ready.length ? ready.map((p) => `${p.company} ${p.ready!.toFixed(2).replace(/^0/, "")}`).join(" · ") : "nothing drafted yet", at: by("second", "missing") },
    { kind: "you", title: "submit", detail: "yours, every time", at: by("ready", "going") },
  ];
}
/** a token's word at its station */
export const tokenWord = (p: Posting) => ({ asks: "asks you", typing: p.field ? `field ${p.field[0]} of ${p.field[1]}` : "typing", second: "second pass", missing: "asks you", ready: "ready", going: "going in", in: "in", held: "held", later: "later" })[p.state];

// ── the stub (until #836) ────────────────────────────────────────────────────────────────────────────────────────
export function seedPostings(): Posting[] {
  return [
    { id: "p-figma", company: "Figma", role: "Product Engineer, New Grad", where: "San Francisco", site: "LinkedIn", portal: "boards.greenhouse.io", closes: "Mon 12:00", fit: 0.91, passes: 1, state: "typing", answers: 7, field: [4, 7] },
    { id: "p-stripe", company: "Stripe", role: "Software Engineer, Payments", where: "Seattle", site: "LinkedIn", portal: "stripe.com/jobs", closes: "Sun 23:59", fit: 0.62, passes: 0, missing: "it asks for two years, you have one internship", state: "asks", answers: 0 },
    { id: "p-linear", company: "Linear", role: "Product Engineer", where: "remote", site: "Handshake", portal: "jobs.ashbyhq.com", closes: "Fri 17:00", fit: 0.78, ready: 0.71, passes: 1, missing: "why Linear is a guess", state: "second", drafted: "8:40", answers: 5 },
  ];
}
/** what the next looks find (the stub's postings; the engine reads the real searches) */
export const ARRIVING: Omit<Posting, "state">[] = [
  { id: "p-shopify", company: "Shopify", role: "Developer, New Grad", where: "Toronto or remote", site: "Handshake", portal: "jobs.lever.co", closes: "Fri 17:00", fit: 0.84, ready: 0.88, passes: 1, drafted: "11:00", answers: 7 },
  { id: "p-ramp", company: "Ramp", role: "Software Engineer, New Grad", where: "New York", site: "LinkedIn", portal: "jobs.ashbyhq.com", closes: "Wed 12:00", fit: 0.76, ready: 0.83, passes: 1, drafted: "13:00", answers: 6 },
];
export function stub() {
  let postings = seedPostings(), read = 41, held = 37, at = 9, done: AppsDone | null = null, n = 0, queue = [...ARRIVING];
  const kept = new Map<string, { postings: Posting[]; read: number; held: number; at: number; queue: typeof queue }>();
  const keep = () => { const id = `ap${++n}`; kept.set(id, { postings, read, held, at, queue }); return id; };
  const msg = (): AppsMsg => ({ type: "flow.apps", flowId: "f-apps", at: `${at}:00`, next: nextLook(at), read, held, postings, done });
  const set = (id: string, f: (p: Posting) => Posting) => { postings = postings.map((p) => (p.id === id ? f(p) : p)); };
  const ask = (a: AppsAsk): AppsMsg => {
    if (a.type === "flow.apps") return msg();
    if (a.type === "home.undo") { const w = kept.get(a.ledgerId); if (w) ({ postings, read, held, at, queue } = w); kept.delete(a.ledgerId); done = null; return msg(); }
    if (a.type === "flow.run.now") {
      const look = looks().find((h) => h > at) ?? at, next = queue[0];
      const ledgerId = keep();
      at = look; read += 6; held += next ? 5 : 6;
      if (!next) { done = { ledgerId, line: `The ${look}:00 look: 6 read, none for you; 6 held` }; return msg(); }
      queue = queue.slice(1);
      const p: Posting = { ...next, state: placeOf(next.fit, next.ready, next.passes) };
      postings = [...postings, p];
      done = { ledgerId, thingId: p.id, line: `The ${look}:00 look: 6 read · ${p.company} for you (${p.fit.toFixed(2).replace(/^0/, "")}), drafted, read ${p.state === "ready" ? `ready (${p.ready!.toFixed(2).replace(/^0/, "")})` : "short of ready"} · 5 held` };
      return msg();
    }
    const p = postings.find((x) => x.id === a.thingId);
    if (!p) return msg();
    const ledgerId = keep();
    if (a.type === "home.later") { set(p.id, (x) => ({ ...x, state: "later" })); done = { ledgerId, thingId: p.id, line: `${p.company}: later, at the back` }; return msg(); }
    if (a.answer === "submit") {
      if (p.state !== "ready" && p.state !== "later") return msg();
      set(p.id, (x) => ({ ...x, state: "going" }));
      done = { ledgerId, thingId: p.id, line: `${p.company}'s application goes in by your press · in the page ledger as yours` };
      return msg();
    }
    if (a.answer === "yes, draft it") { set(p.id, (x) => ({ ...x, state: "typing", field: [1, 6] })); done = { ledgerId, thingId: p.id, line: `${p.company}: for you, by your word · Sol is filling it in your browser; nothing is submitted` }; return msg(); }
    set(p.id, (x) => ({ ...x, state: "held" })); held += 1;
    done = { ledgerId, thingId: p.id, line: `${p.company}: not for you · held; Jev learns from your no` };
    return msg();
  };
  /** the engine's own push when your press's 10 s are up: submitted in your browser's tab, as your row; no undo now */
  const gone = (thingId: string): AppsMsg => {
    const p = postings.find((x) => x.id === thingId && x.state === "going");
    if (!p) return msg();
    set(p.id, (x) => ({ ...x, state: "in" }));
    done = { ledgerId: "", thingId: p.id, line: `${p.company}'s application is in · submitted by you at ${at}:00, your row in the page ledger` };
    return msg();
  };
  return Object.assign(ask, { gone });
}
/** how long your press is held before the engine submits, so undo can take it (the engine's; the face only shows it) */
export const HOLD_MS = 10_000;
