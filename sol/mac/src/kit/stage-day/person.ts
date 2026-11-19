// Whose day it is (rule 38: the first thing a person sees is in their terms, never sample content). A person with three
// folders, the shape of a real week: a class, a job, a side project. Their name comes from the page (`?name=`), so the
// one who plays it sees their own; the folders are one young adult's life, the brand's first tier (brand.md, The person).
const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const name = (q.get("name") ?? "").trim();

export type Folder = { id: "class" | "job" | "side"; name: string; line: string; stickies: readonly string[] };
export const PERSON = {
  name: name || "Maya",
  /** the folder they last had open: the window opens on it (rule 38: their last pick as the default) */
  last: "side" as Folder["id"],
  /** the bar's mode they last picked: auto */
  lastMode: 2,
  folders: [
    { id: "class", name: "linear algebra", line: "exam friday", stickies: ["chapter 6, summed up", "the 2023 paper, worked", "flashcards from tuesday"] },
    { id: "job", name: "Northside café", line: "the rota, saturday hours", stickies: ["next week's rota", "the oat milk order"] },
    { id: "side", name: "the zine", line: "issue three, two spreads left", stickies: ["lay out the photo essay", "the editor's letter"] },
  ] as readonly Folder[],
};
export const folder = (id: Folder["id"]) => PERSON.folders.find((f) => f.id === id)!;
