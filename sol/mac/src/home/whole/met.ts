// The follow-ups flow in people (#808, plan Part C slice 45; flows.md flow 2 "Follow-ups", scene 3; the stills
// home/shots/flows-3.png, flows-3-2.png), behind sol.home.whole and the flow's own switch. Face; the engine half is #836
// (Frank's). The pure half and its stub:
// - the trigger is a note in people ("met Priya Shah at the Stripe info session, …"); Jev's `keep` (noul, line .70)
//   asks whether it is someone you want to keep in touch with; under .70 they are held, with Jev's p;
// - three days on, a DM is drafted in your voice; you send it (Sol sends it from LinkedIn on your yes: pick 2 A);
// - seven days after it went, if Jev's `reply` reads none, one nudge is proposed; never a second.
// Nothing here draws; FollowUps.tsx does.
//
// Stubbed until #836 lands: `stub()` answers `flow.people {flowId}`, `people.note {text}` (the trigger),
// `people.dm.edit {personId, text}`, `home.answer {thingId, answer}`, `home.later {thingId}` and `home.undo {ledgerId}`
// with one `flow.people` message of the shape below. Days are counted from Monday 9 November (day 0); the stub's
// today is Thursday 12 November (day 3), scene 3 step 2.
import type { Station } from "./flows.ts";

export const KEEP = 0.7, DM_AFTER = 3, NUDGE_AFTER = 7;
export const TODAY = 3;
export type Reply = "asks" | "thanks" | "none";
/** a person you met, as the follow-ups flow holds them */
export type Met = {
  id: string; name: string; org: string; where: string; note: string; met: number; keep: number;
  dm?: { text: string; drafted: number; sent?: number; reply?: Reply; nudge?: { text: string; sent?: number } };
  /** what the flow did with them last: held (under .70), waits (DM not due yet), drafted (waits on you), sent, nudge
   *  (one nudge proposed), done (a reply, or the one nudge went), not now (you said no) */
  state: "held" | "waits" | "drafted" | "sent" | "nudge" | "done" | "not now" | "later" | "going";
  initials: string; context?: string;
};
export type PeopleDone = { ledgerId: string; line: string; personId?: string };
/** the engine's message after every ask (#836) */
export type PeopleMsg = { type: "flow.people"; flowId: "f-follow"; today: number; people: Met[]; done: PeopleDone | null };
export type PeopleAsk =
  | { type: "flow.people"; flowId: "f-follow" }
  | { type: "people.note"; text: string }
  | { type: "people.dm.edit"; personId: string; text: string }
  | { type: "home.answer"; thingId: string; answer: "send" | "send the nudge" | "not now" }
  | { type: "home.later"; thingId: string }
  | { type: "home.undo"; ledgerId: string };

// ── the rules (pure) ─────────────────────────────────────────────────────────────────────────────────────────────
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** a day number as words (day 0 is Monday 9 November) */
export const dayName = (d: number) => `${DAY[((d % 7) + 7) % 7]} ${9 + d}`;
/** Jev's keep (noul, line .70): asked for, offered help, a lead ≥ the line; small talk, a crowd, "no need" under it */
export function keepP(note: string): number {
  const t = note.toLowerCase();
  if (/\b(no need|small talk|crowd)\b/.test(t)) return 0.31;
  if (/\b(ping|asked|offered|lead|intro|refer|said to|follow up|coffee)\b/.test(t)) return 0.88;
  return 0.58;
}
/** where a person stands on a day (pure): the flow's rules, one by one */
export function stateOn(m: Met, today: number): Met["state"] {
  if (m.state === "not now" || m.state === "later" || m.state === "going") return m.state;
  if (m.keep < KEEP) return "held";
  if (!m.dm || m.dm.drafted > today) return today - m.met >= DM_AFTER ? "drafted" : "waits";
  if (m.dm.sent === undefined) return "drafted";
  if (m.dm.reply && m.dm.reply !== "none") return "done";
  if (m.dm.nudge?.sent !== undefined) return "done";   // one nudge, never a second
  return today - m.dm.sent >= NUDGE_AFTER ? "nudge" : "sent";
}
/** a note in people, read: "met Priya Shah at the Stripe info session, she runs payments infra, said to ping her about
 *  new grad" → the name, where, what you said you would do (a stand-in for the engine's read and Jev's keep) */
export function noteOf(text: string, id: string, today: number): Met | null {
  const m = /^\s*met\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’.-]*)?)\s+(?:at|in|on)\s+(?:the\s+)?([^,]+)(?:,\s*(.*))?$/i.exec(text.trim());
  if (!m) return null;
  const name = m[1].replace(/\b\w/g, (c) => c.toUpperCase()), where = m[2].trim(), rest = (m[3] ?? "").trim();
  const org = /^([A-Z][\w]*)\b/.exec(where)?.[1] ?? where.split(" ")[0];
  const keep = keepP(text);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return { id, name, org, where, note: rest || "your note", met: today, keep, state: keep >= KEEP ? "waits" : "held", initials };
}
/** the drafted DM, in your voice, from your note (the engine's draft; the face shows it and lets you change any word) */
export function dmOf(m: Met): string {
  const first = m.name.split(" ")[0], ask = /new grad/i.test(m.note) ? "You said to ping you about new grad: I'd love fifteen minutes on what the team looks for." : "I'd love to keep in touch.";
  return `Hi ${first}, Marco here; we met at the ${m.where}. ${ask} Thanks either way!`;
}
/** what waits on you: a drafted DM due, then a nudge; "later" at the back */
export const needsOf = (ps: Met[], today: number) => [
  ...ps.filter((p) => stateOn(p, today) === "drafted" && p.dm), ...ps.filter((p) => stateOn(p, today) === "nudge"), ...ps.filter((p) => p.state === "later"),
];
/** the people place's one line (scene 3-2: "Priya, three days on. The message is drafted.") */
export function peopleLine(ps: Met[], today: number): [string, string] {
  const front = needsOf(ps, today)[0];
  if (!front) return ["People.", "Who you met, and what you said you would do."];
  const first = front.name.split(" ")[0];
  if (stateOn(front, today) === "nudge") return [`${first}, seven days and no reply.`, "One nudge is drafted; there will not be a second."];
  if (front.state === "later") return [`${first} waits at the back.`, "The message is drafted."];
  return [`${first}, ${["today", "one day", "two days", "three days", "four days"][today - front.met] ?? `${today - front.met} days`} on.`, "The message is drafted."];
}
/** a person's stations (scene 3-2): you met · keep in touch? · a message drafted · your yes · a reply? · one nudge */
export function stationsOf(m: Met): (Station & { when: string; lit: boolean })[] {
  const s = m.dm?.sent, drafted = m.met + DM_AFTER, nudgeOn = (s ?? drafted) + NUDGE_AFTER;
  return [
    { kind: "watch", when: `${dayName(m.met)} · met`, title: `you met ${m.name.split(" ")[0]}`, detail: "your note, in people", lit: true },
    { kind: "judge", when: "Jev asks", title: "keep in touch?", detail: `${m.keep >= KEEP ? "yes" : "no"}, ${m.keep.toFixed(2).replace(/^0/, "")} · the line is .70`, lit: true },
    { kind: "make", when: `${dayName(drafted)} 9:00`, title: "a message drafted", detail: "from your note, in your voice", lit: !!m.dm },
    { kind: "you", when: s !== undefined ? dayName(s) : "now", title: "your yes", detail: "Sol sends it from LinkedIn", lit: s !== undefined },
    { kind: "judge", when: "7 days", title: "a reply?", detail: `Jev: asks something · thanks · none${m.dm?.reply ? ` → ${m.dm.reply}` : ""}`, lit: !!m.dm?.reply },
    { kind: "judge", when: dayName(nudgeOn), title: "one nudge, proposed", detail: "only if no reply · never a second", lit: !!m.dm?.nudge },
  ];
}
/** a person's line in "the people around it" */
export function aroundLine(m: Met, today: number): string {
  const st = stateOn(m, today);
  if (st === "held") return `held by Jev (${m.keep.toFixed(2).replace(/^0/, "")})${/no need/i.test(m.note) ? ": you said “no need”" : ""}`;
  if (st === "waits") return `met ${dayName(m.met)} · a message drafts ${dayName(m.met + DM_AFTER)} 9:00`;
  if (st === "drafted") return `met ${dayName(m.met)} at the ${m.where} · drafted, waits on you`;
  if (st === "sent") return `sent ${dayName(m.dm!.sent!)} · no reply yet · a nudge only after ${dayName(m.dm!.sent! + NUDGE_AFTER)}`;
  if (st === "nudge") return `sent ${dayName(m.dm!.sent!)} · no reply in 7 days · one nudge, proposed`;
  if (st === "going") return "going on LinkedIn by your press";
  if (st === "not now") return "not now: no message";
  if (st === "later") return "later, at the back";
  return m.context ?? (m.dm?.reply ? `replied: ${m.dm.reply === "asks" ? "asks something" : "thanks"}` : "the one nudge went · nothing more");
}

// ── the stub (until #836) ────────────────────────────────────────────────────────────────────────────────────────
export function seedMet(): Met[] {
  const priya: Met = { id: "m-priya", name: "Priya Shah", org: "Stripe", where: "Stripe info session", note: "she runs payments infra, said to ping her about new grad", met: 0, keep: 0.88, state: "drafted", initials: "PS" };
  priya.dm = { text: "Hi Priya, Marco here; we met Monday at the Stripe info session (I asked about the ledger service). You said to ping you about new grad: I applied to the infra role and would love fifteen minutes on what the team looks for. Thanks either way!", drafted: 3 };
  return [
    priya,
    { id: "m-alex", name: "Alex Chen", org: "Ramp", where: "Ramp's campus talk", note: "offered an intro to the platform team", met: -7, keep: 0.84, state: "nudge", initials: "AC",
      dm: { text: "Hi Alex, Marco from the Ramp campus talk. You offered an intro to the platform team; I'd still love one if it's easy.", drafted: -4, sent: -4, reply: "none",
        nudge: { text: "Hi Alex, a short nudge on the platform team intro; no worries if the timing is off. Thanks!" } } },
    { id: "m-dana", name: "Dana Lee", org: "Figma", where: "Figma recruiting call", note: "your application is being typed", met: 3, keep: 0.79, state: "waits", initials: "DL" },
    { id: "m-sam", name: "Sam Ortiz", org: "Northwind", where: "Northwind interview", note: "the offer", met: -14, keep: 0.93, state: "done", initials: "SO", context: "the offer · your call today 13:00",
      dm: { text: "", drafted: -11, sent: -11, reply: "asks" } },
    { id: "m-tom", name: "Tom K.", org: "career fair", where: "career fair", note: "small talk, no need", met: 1, keep: 0.31, state: "held", initials: "TK" },
  ];
}
export function stub() {
  let people = seedMet(), done: PeopleDone | null = null, n = 0;
  const today = TODAY, kept = new Map<string, Met[]>();
  const keep = () => { const id = `pm${++n}`; kept.set(id, people); return id; };
  const settle = (ps: Met[]) => ps.map((p) => ({ ...p, state: stateOn(p, today) }));
  const msg = (): PeopleMsg => ({ type: "flow.people", flowId: "f-follow", today, people, done });
  const set = (id: string, f: (p: Met) => Met) => { people = people.map((p) => (p.id === id ? f(p) : p)); };
  people = settle(people);
  const ask = (a: PeopleAsk): PeopleMsg => {
    if (a.type === "flow.people") return msg();
    if (a.type === "home.undo") { const w = kept.get(a.ledgerId); if (w) people = w; kept.delete(a.ledgerId); done = null; return msg(); }
    if (a.type === "people.note") {
      const m = noteOf(a.text, `m-new-${n + 1}`, today);
      if (!m) { done = { ledgerId: "", line: "Not read as someone you met: say “met <name> at <where>, …”" }; return msg(); }
      const ledgerId = keep();
      people = [m, ...people];
      done = { ledgerId, personId: m.id, line: m.state === "held"
        ? `Kept in people › ${m.name}, new · Jev: someone to keep in touch with? no, ${m.keep.toFixed(2).replace(/^0/, "")}; held, no message`
        : `Kept in people › ${m.name}, new · Jev: someone to keep in touch with? yes, ${m.keep.toFixed(2).replace(/^0/, "")} · the follow-ups flow drafts a message ${dayName(m.met + DM_AFTER)} 9:00, sent only on your yes` };
      return msg();
    }
    const p = people.find((x) => x.id === (a.type === "people.dm.edit" ? a.personId : a.thingId));
    if (!p) return msg();
    const ledgerId = keep();
    if (a.type === "people.dm.edit") { set(p.id, (x) => ({ ...x, dm: x.dm && (stateOn(x, today) === "nudge" && x.dm.nudge ? { ...x.dm, nudge: { ...x.dm.nudge, text: a.text } } : { ...x.dm, text: a.text }) })); done = { ledgerId, personId: p.id, line: `${p.name.split(" ")[0]}'s message: your words now` }; return msg(); }
    if (a.type === "home.later") { set(p.id, (x) => ({ ...x, state: "later" })); done = { ledgerId, personId: p.id, line: `${p.name.split(" ")[0]}: later, at the back` }; return msg(); }
    if (a.answer === "not now") { set(p.id, (x) => ({ ...x, state: "not now" })); done = { ledgerId, personId: p.id, line: `${p.name.split(" ")[0]}: not now · no message goes` }; return msg(); }
    const st = stateOn({ ...p, state: "drafted" }, today);
    if (a.answer === "send the nudge" && st === "nudge") {
      set(p.id, (x) => ({ ...x, state: "done", dm: { ...x.dm!, nudge: { ...x.dm!.nudge!, sent: today } } }));
      done = { ledgerId, personId: p.id, line: `${p.name.split(" ")[0]}: the one nudge goes on LinkedIn by your press · there will not be a second` };
      return msg();
    }
    if (a.answer === "send" && p.dm && p.dm.sent === undefined) {
      set(p.id, (x) => ({ ...x, state: "sent", dm: { ...x.dm!, sent: today } }));
      done = { ledgerId, personId: p.id, line: `${p.name.split(" ")[0]}: goes on LinkedIn by your press, ${dayName(today)} · Jev reads the reply; one nudge after ${dayName(today + NUDGE_AFTER)} only if none` };
      return msg();
    }
    kept.delete(ledgerId);
    return msg();
  };
  return ask;
}
