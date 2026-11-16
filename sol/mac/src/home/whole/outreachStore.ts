// Applications and follow-ups (#808, plan Part C slice 45), behind sol.home.whole: what the face holds of `flow.apps` and
// `flow.people`. The transport is postings.ts's and met.ts's stubs until #836 lands; then `ask`/`askPeople` are the
// engine's socket. The flow's own switch is its `on` on the flows page (flowsStore): paused, the look is not asked for.
// Your press (submit, send) is held HOLD_MS by the engine so undo can take it; here the stub's push stands for that.
import { useSyncExternalStore } from "react";
import { HOLD_MS, stub as appsStub, type AppsAsk, type AppsMsg } from "./postings.ts";
import { stub as peopleStub, type PeopleAsk, type PeopleMsg } from "./met.ts";
import { flowsNow } from "./flowsStore.ts";

let apps: AppsMsg | null = null, people: PeopleMsg | null = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
let a: ReturnType<typeof appsStub> | null = null, p: ReturnType<typeof peopleStub> | null = null;
// one hold per submit (C45-1): a posting's timer, and the receipt whose undo may take it back
const holds = new Map<string, { t: ReturnType<typeof setTimeout>; ledgerId: string }>();

/** is a flow on (its own switch on the flows page; on unless the flows page says paused) */
export const flowOn = (id: "f-apps" | "f-follow") => flowsNow()?.flows.find((f) => f.id === id)?.on ?? true;

/** ask the applications flow (the stub, until #836) */
export function ask(q: AppsAsk) {
  a ??= appsStub();
  if (q.type === "flow.run.now" && !flowOn("f-apps")) return;   // paused: nothing is read
  apps = a(q); tell();
  if (q.type === "home.answer" && q.answer === "submit" && apps.done?.thingId) {
    const id = apps.done.thingId, prev = holds.get(id);
    if (prev) clearTimeout(prev.t);
    holds.set(id, { ledgerId: apps.done.ledgerId, t: setTimeout(() => { holds.delete(id); if (apps?.postings.some((x) => x.id === id && x.state === "going")) { apps = a!.gone(id); tell(); } }, HOLD_MS) });
  }
  // an undo takes back only its own submit's hold; any other receipt's undo leaves the 10 s running
  if (q.type === "home.undo") for (const [id, h] of holds) if (h.ledgerId === q.ledgerId) { clearTimeout(h.t); holds.delete(id); }
}
/** ask the follow-ups flow (the stub, until #836) */
export function askPeople(q: PeopleAsk) {
  p ??= peopleStub(); people = p(q); tell();
  if (q.type === "home.answer" && q.answer !== "not now" && people.done?.ledgerId) {
    const id = people.done.ledgerId;
    // the engine's push when the 10 s are up: it went on LinkedIn; the receipt stays, its undo goes
    setTimeout(() => { if (people?.done?.ledgerId === id) { people = { ...people, done: { ...people.done, ledgerId: "", line: people.done.line.replace(" goes on LinkedIn", " went on LinkedIn") } }; tell(); } }, HOLD_MS);
  }
}

export const lookNow = () => ask({ type: "flow.run.now", flowId: "f-apps" });
export const answerPosting = (thingId: string, answer: "submit" | "yes, draft it" | "no") => ask({ type: "home.answer", thingId, answer });
export const laterPosting = (thingId: string) => ask({ type: "home.later", thingId });
export const undoPosting = (ledgerId: string) => ask({ type: "home.undo", ledgerId });
export const noteMet = (text: string) => askPeople({ type: "people.note", text });
export const editDm = (personId: string, text: string) => askPeople({ type: "people.dm.edit", personId, text });
export const answerMet = (thingId: string, answer: "send" | "send the nudge" | "not now") => askPeople({ type: "home.answer", thingId, answer });
export const laterMet = (thingId: string) => askPeople({ type: "home.later", thingId });
export const undoMet = (ledgerId: string) => askPeople({ type: "home.undo", ledgerId });

export const appsNow = () => apps;
export const peopleNow = () => people;
const on = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useApps(): AppsMsg | null { return useSyncExternalStore((f) => { const off = on(f); if (!apps) ask({ type: "flow.apps", flowId: "f-apps" }); return off; }, () => apps); }
export function useMet(): PeopleMsg | null { return useSyncExternalStore((f) => { const off = on(f); if (!people) askPeople({ type: "flow.people", flowId: "f-follow" }); return off; }, () => people); }
