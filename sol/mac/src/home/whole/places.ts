// The side (#799, plan Part C slice 36; home/whole.md pain 5 "the side is today, the week, places, sources", pain 10
// "folders come from Canvas and files; what it knows shows from where"; flows.md "Decisions" 1 "people is a place in
// the side", 2 "flows is in the side foot"), behind sol.home.whole. The pure half: the places as the engine sends them
// (folders from your Canvas courses and your files, each saying where it comes from and what it knows), the people, and
// the side's rows drawn from them and from Today: today with its count, the week, the places as a tree with a dot where
// something waits on you, people, and the foot (done today, sources, flows). Nothing here draws; WholeSide.tsx does.
//
// Stubbed until the engine sends places (no engine half is filed for this slice; see the PR): `stub()` answers
// `home.places` with the shape below. Its courses are the ones Sources' Canvas row names (bio 201, chem 110, stats 140,
// policy.ts), its folders the ones Files reads (~/School, ~/Jobs), so the side, Sources and the list agree.
import type { Thing } from "./today.ts";

export type From = { source: "canvas" | "files" | "you"; ref: string; label: string };
export type Knows = { kind: "slides" | "file" | "syllabus" | "person" | "site" | "notes"; label: string; from: string };
/** a place (a folder): its crumb path as the things' `folder` names it ("school › bio 201"), its parent, where it comes
 *  from (a Canvas course, a folder on disk, or one you made), and what it knows */
export type PlaceItem = { id: string; name: string; path: string; parent?: string; from: From; knows: Knows[] };
/** a person Sol keeps up with: where you know them from, and the things that name them */
export type Person = { id: string; name: string; note: string; thingIds: string[] };
/** the engine's answer to `home.places` */
export type PlacesMsg = { type: "home.places"; places: PlaceItem[]; people: Person[] };

// ── the stub ─────────────────────────────────────────────────────────────────────────────────────────────────────
const course = (code: string, term: string): From => ({ source: "canvas", ref: `canvas:${code.replace(/\s+/g, "").toLowerCase()}`, label: `Canvas · ${code.toUpperCase()} · ${term}` });
const disk = (path: string): From => ({ source: "files", ref: `files:${path}`, label: path });
const yours: From = { source: "you", ref: "you", label: "a place you made" };
export function seedPlaces(): PlacesMsg {
  const term = "Fall 2026";
  return {
    type: "home.places",
    places: [
      { id: "school", name: "school", path: "school", from: disk("~/School"), knows: [{ kind: "file", label: "3 classes", from: "~/School" }] },
      { id: "bio-201", name: "bio 201", path: "school › bio 201", parent: "school", from: course("bio 201", term),
        knows: [{ kind: "slides", label: "12 lectures", from: "Canvas, synced" }, { kind: "syllabus", label: "syllabus", from: "Canvas" }, { kind: "file", label: "textbook ch 1–8", from: "~/School" },
          { kind: "person", label: "prof. Ahmed", from: "4 mails" }, { kind: "site", label: "course site", from: "Canvas" }, { kind: "notes", label: "your notes", from: "9 pages" }] },
      { id: "chem-110", name: "chem 110", path: "school › chem 110", parent: "school", from: course("chem 110", term),
        knows: [{ kind: "file", label: "problem sets 1–6", from: "Canvas" }, { kind: "notes", label: "lecture 9 notes", from: "your words" }, { kind: "site", label: "lab schedule", from: "Canvas" }] },
      { id: "stats-140", name: "stats 140", path: "school › stats 140", parent: "school", from: course("stats 140", term),
        knows: [{ kind: "file", label: "survey data", from: "~/School/stats 140" }, { kind: "site", label: "group page", from: "Canvas" }] },
      { id: "jobs", name: "jobs", path: "jobs", from: disk("~/Jobs"), knows: [{ kind: "file", label: "CV and cover letters", from: "~/Jobs" }] },
      { id: "applications", name: "applications", path: "jobs › applications", parent: "jobs", from: disk("~/Jobs/applications"), knows: [{ kind: "file", label: "Shopify application", from: "filled by Sol" }] },
      { id: "work", name: "work", path: "work", from: yours, knows: [] },
      { id: "stats-group", name: "stats group", path: "work › stats group", parent: "work", from: disk("~/School/stats 140/group"), knows: [{ kind: "file", label: "the report, drafted", from: "the group" }] },
      { id: "life", name: "life", path: "life", from: yours, knows: [] },
    ],
    people: [
      { id: "maya", name: "Maya", note: "stats 140, the group", thingIds: ["t-maya-data"] },
      { id: "ahmed", name: "prof. Ahmed", note: "bio 201 · 4 mails", thingIds: [] },
      { id: "sam", name: "Sam Ortiz", note: "Northwind · the offer", thingIds: [] },
    ],
  };
}
/** the engine's answer, in the face (the places do not change from the side; Sources and the files change them) */
export const stub = () => (_a: { type: "home.places" }): PlacesMsg => seedPlaces();

// ── the side's rows ──────────────────────────────────────────────────────────────────────────────────────────────
export type SideRow = { id: string; name: string; depth: number; from: From["source"]; waits: number; moving: number };
/** the things in a place and below it (its path, or a path under it) */
export const inPlace = (p: PlaceItem, things: Thing[]) => things.filter((t) => t.folder === p.path || t.folder.startsWith(`${p.path} › `));
/** the places as a tree, parents before their children, each with what waits on you and what moves in it */
export function treeOf(places: PlaceItem[], things: Thing[], needs: string[]): SideRow[] {
  const out: SideRow[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const p of places.filter((x) => x.parent === parent)) {
      const here = inPlace(p, things);
      out.push({ id: p.id, name: p.name, depth, from: p.from.source, waits: here.filter((t) => needs.includes(t.id)).length, moving: here.filter((t) => t.state === "moving").length });
      walk(p.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}
/** today's count beside "today" (scene 1: "3 need you") */
export const todayCount = (needs: number) => (needs ? `${needs} need you` : "");
/** a place's one line (scene 8: "Bio 201. The notes are halfway."): its name, then what moves and what waits */
export function placeLine(p: PlaceItem, things: Thing[], needs: string[]): [string, string] {
  const here = inPlace(p, things), w = here.filter((t) => needs.includes(t.id)).length, m = here.filter((t) => t.state === "moving").length;
  const name = p.name.charAt(0).toUpperCase() + p.name.slice(1) + ".";
  const parts = [m ? `${m} moving` : "", w ? `${w} ${w === 1 ? "needs" : "need"} you` : ""].filter(Boolean);
  return [name, parts.length ? `${parts.join(", ")}.` : "Nothing moving here."];
}
/** the people place's one line */
export function peopleLine(people: Person[], needs: string[]): [string, string] {
  const W = ["No one", "One person", "Two people", "Three people", "Four people", "Five people"];
  const waiting = people.filter((p) => p.thingIds.some((id) => needs.includes(id)));
  return [`${W[people.length] ?? `${people.length} people`}.`, waiting.length ? `${waiting.map((p) => p.name).join(" and ")} ${waiting.length === 1 ? "waits" : "wait"} on you.` : "Nobody waits on you."];
}
