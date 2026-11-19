// Making a piece by hand (#1092, the design: S/design/design.md "He makes a tool by hand"). Pure, so the face's tests
// reach it: what the person has pressed so far (a draft), the recipe that draft is, the name it suggests for itself.
// A new piece is a piece whose back he sees first: three notches (reads, every, may) and a name. The recipe file an
// agent writes and the one his presses write are the same file.
import type { PieceInfo } from "./model";

/** one thing this folder can be read from, as the engine found it (`work.pieces.sources`): never typed */
export type BenchSource = {
  /** "issues", "prs", "runs", "file:.sol/rhythm.json", "facts" (a Home folder's ground.json), "url", "script" */
  id: string;
  /** the word on its pill: "issues", "pull requests", "rhythm.json", "what it knows" */
  word: string;
  /** a source with parts narrows by them: issues by area and by kind (the labels file) */
  parts?: { label: string; options: string[] }[];
  /** a source that needs one line from him before it can be read: an address, a program's path; "sentence" is the
   *  last pill, "something else": nothing here reads it, his session is asked to make the piece from his words */
  asks?: "address" | "program" | "sentence";
};
export type Draft = {
  reads?: string; parts: Record<string, string>; line?: string;
  every: number; ceiling: PieceInfo["ceiling"];
  /** what it does between his visits, once it may draft: his sentence, or `TEND` while he has not written one */
  tend?: string;
  /** his own name for it; empty until he types, and then `titleOf` no longer speaks */
  title: string;
};
/** the starters (morning round of 11-13): what any folder can be read from with only the folder, in this order; a
 *  folder with no pieces shows them as rows, and a press opens the bench with that one pressed and read */
export const STARTERS = ["recent", "git"];
export const startersOf = (sources: BenchSource[]) => STARTERS.flatMap((id) => sources.filter((s) => s.id === id));
/** what a folder with no pieces says above its starters */
export const EMPTY_LINE = "A piece is a small tool that keeps one thing in this folder in view. Open a starter below, or make your own with \"new piece\".";
/** the sentence a made piece starts with when its ladder reaches "drafts" */
export const TEND = "Say in two sentences what I would do about this, from what it links to.";
export const BLANK: Draft = { parts: {}, every: 300, ceiling: "look", title: "" };

/** the name a draft gives itself from what was pressed: "marketing decisions", "cowork bugs", "rhythm", "issues" */
export function titleOf(d: Draft, sources: BenchSource[]): string {
  if (d.title.trim()) return d.title.trim();
  const s = sources.find((x) => x.id === d.reads);
  if (!s || s.asks === "sentence") return "";
  const picked = (s.parts ?? []).map((p) => d.parts[p.label]).filter(Boolean);
  if (!picked.length) return s.word.replace(/\.json$/, "");
  const last = picked[picked.length - 1], kind = s.parts!.length > 1 && d.parts[s.parts![s.parts!.length - 1].label];
  return kind ? [...picked.slice(0, -1), last.endsWith("s") ? last : `${last}s`].join(" ") : `${picked.join(" ")} ${s.word}`;
}
/** the file's name: lower case, words joined by "-", 40 letters at most */
export const nameOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** can it be read yet: a source is pressed, and its one line is there when it asks for one */
export function readable(d: Draft, sources: BenchSource[]): boolean {
  const s = sources.find((x) => x.id === d.reads);
  return !!s && s.asks !== "sentence" && (!s.asks || !!d.line?.trim());
}
/** "something else" with his words in it: what his session is asked, and the piece is the session's to write (the
 *  row drops into the folder when its recipe appears, as any agent-made piece does). Null while there is nothing to ask */
export function askOf(d: Draft, sources: BenchSource[]): string | null {
  const s = sources.find((x) => x.id === d.reads), words = d.line?.trim();
  if (s?.asks !== "sentence" || !words) return null;
  return `Make a piece for this folder that reads ${words}. Write its recipe to .sol/pieces/ (docs: the recipe page), reading every ${Math.round(d.every / 60)} min, ceiling "${d.ceiling}".`;
}

/** the recipe this draft is: what `work.pieces.try` reads and `work.pieces.make` writes. `drafts` or more on the
 *  ladder gives the piece its sentence, so it does part of its job between his visits (the recipe's `tend`) */
export function recipeOf(d: Draft, sources: BenchSource[]): Record<string, unknown> | null {
  if (!readable(d, sources)) return null;
  const title = titleOf(d, sources), s = sources.find((x) => x.id === d.reads)!;
  const labels = (s.parts ?? []).map((p) => d.parts[p.label]).filter(Boolean);
  const source = s.id.startsWith("file:") ? { from: "file", path: s.id.slice(5) }
    : s.asks === "address" ? { from: "url", url: d.line!.trim() }
    : s.asks === "program" ? { from: "script", path: d.line!.trim() }
    : { from: "builtin", name: s.id, ...(labels.length ? { labels } : {}) };
  const drafts = d.ceiling !== "look";
  return {
    name: nameOf(title), title, view: "list", source, pulse: { every: d.every },
    verbs: drafts ? ["look", "draft"] : ["look"], ceiling: d.ceiling,
    ...(drafts ? { tend: d.tend?.trim() || TEND } : {}),
  };
}
