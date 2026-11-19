// The folders as the shelf and a lift read them (#1045), pure, so this file is tested without the window. Since #1223
// cross/folders.ts hands in the record's areas; foldersOf and knowsIn still read a school-and-jobs shape for a caller that has one.
import type { HomeThing, Knows } from "./store.ts";

export type Folder = { id: string; name: string; parent?: string };
type Cls = { id: string; name: string; who: string; read: string[] };
type Job = { name: string; said: string; ask: string };
export type Lifted = { thing: HomeThing; label: string; mark: "card" | "fact" | "source" };

/** school, each class inside it, jobs, each job inside it */
export const foldersOf = (classes: Cls[], jobs: Job[]): Folder[] => [
  { id: "school", name: "school" },
  ...classes.map((c) => ({ id: c.id, name: c.name, parent: "school" })),
  { id: "jobs", name: "jobs" },
  ...jobs.map((j) => ({ id: `jobs.${j.name}`, name: j.name, parent: "jobs" })),
];
/** a folder's path as his Home's crumbs say it ("school › LA245") */
export function pathIn(list: Folder[], id: string): string | null {
  const f = list.find((x) => x.id === id);
  if (!f) return null;
  const up = f.parent ? list.find((x) => x.id === f.parent) : undefined;
  return up ? `${up.name} › ${f.name}` : f.name;
}
/** what a class or a job folder knows so far: it rides a thing carried out of it */
export function knowsIn(classes: Cls[], jobs: Job[], id: string): Knows[] {
  const c = classes.find((x) => x.id === id);
  if (c) return [...(c.who ? [{ kind: "class", label: c.who }] : []), ...c.read.map((r) => ({ kind: "read", label: r }))];
  const j = jobs.find((x) => `jobs.${x.name}` === id);
  if (j) return [...(j.said ? [{ kind: "you said", label: j.said }] : []), { kind: "asks", label: j.ask }];
  return [];
}
/** a thing of his folders as it crosses; with the switch off there is none (the row stays only its own press) */
export function liftIn(on: boolean, path: string, knows: Knows[], place: string, words: string, mark: Lifted["mark"], key = words): Lifted | undefined {
  if (!on || !words.trim()) return undefined;
  return { mark, label: words, thing: { id: `${place}:${key}`, words, place, path, knows } };
}
