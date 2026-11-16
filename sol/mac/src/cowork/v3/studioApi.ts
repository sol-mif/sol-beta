// Cowork v3, slice 6 (fr-30, #559): the studio's one line to the engine. Requests are team.v3.studio.*, the answers
// work.v3.studio.* by rid (engine team/v3/studio-wire.ts), heard by ask.ts askV3, so it does not lean on Cowork's
// team.* store, and Home could use it as it is. One store: a project's automations and nights, read now and
// every 30 s while shown, and again after every write.
import { useEffect, useSyncExternalStore } from "react";
import { askV3 } from "./ask";

export type Part = "when" | "gather" | "ask" | "wait" | "summarize" | "send" | "if";
export type Step = { part: Part; label: string; place?: string; call?: { script: string; args: string[] }; look?: string };
export type PartRun = { step: number; part: Part; label: string; result: string; state: "done" | "waiting" | "failed"; cost: number; at: number };
export type Run = { run: string; id: string; at: number; by: { person: string }; parts: PartRun[]; state: "done" | "waiting" | "failed"; cost: number; waitingFor?: { to: string; place: string; ask: string } };
export type Automation = {
  id: string; project: string; owner: string; name: string; words: string; flow: Step[]; on: boolean;
  spend: { who: string; limit: number }; spendNow: { who: string; limit: number; run: number; month: number };
  last: Run | null; needsYes: { to: string; place: string }[]; mine: boolean;
  night?: "night" | "release" | "morning"; timer?: string; calendar?: string; next?: string; readonly?: true; note?: string;
};
export type Ask = { event: string; id: string; name: string; to: string; place: string; run: string; step: number; by: string; at: number };
export type Listing = { project: string; me: string; automations: Automation[]; nights: Automation[]; asks: Ask[] };

/** one question, answered by rid (ask.ts askV3, the one work.v3.* listener); a night's dry run may take long */
export const ask = <T = any>(what: string, body: object = {}, wait = 30_000): Promise<T & { error?: string }> => askV3<T>(`team.v3.studio.${what}`, body, wait);

const lists = new Map<string, Listing>();
let counts: Record<string, number> = {};
const subs = new Set<() => void>();
let ver = 0;
const changed = () => { ver++; subs.forEach((f) => f()); };
export async function readList(project: string) {
  const r = await ask<Listing>("list", { project });
  if (!r.error && Array.isArray(r.automations)) { lists.set(project, r); counts = { ...counts, [project]: r.automations.length + r.nights.length }; changed(); }
}
export async function readCounts() {
  const r = await ask<{ counts: Record<string, number> }>("list", {});
  if (!r.error && r.counts) { counts = r.counts; changed(); }
}
const useVer = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => ver);

/** a project's automations, its nights and the yeses that wait on me */
export function useStudio(project: string) {
  useVer();
  useEffect(() => {
    void readList(project);
    const t = window.setInterval(() => void readList(project), 30_000);
    return () => window.clearInterval(t);
  }, [project]);
  return lists.get(project) ?? null;
}
/** how many automations each project holds (the side shows the room only once it holds one) */
export function useCounts() {
  useVer();
  useEffect(() => {
    void readCounts();
    const t = window.setInterval(() => void readCounts(), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return counts;
}

/** a write: its answer, and the project read again */
export async function write<T = any>(what: "make" | "change" | "copy" | "run" | "yes", body: { project: string } & Record<string, unknown>, wait?: number) {
  const r = await ask<T>(what, body, wait);
  void readList(body.project);
  return r;
}
