// The used-Cowork mark's words (#431, the engine's team/used.ts, PROTOCOL round 76): the small mark under a reply that
// read the project, and who used what, on the people strip and the project's page. No React here: src/used.test.ts.
export type Part = "things" | "feed" | "memory" | "goal" | "calendar" | "decisions" | "polls";
export type Use = { who: string; part: Part; at: string; version: string };
export type UsedView = { repo: string; people: Record<string, Use[]>; note?: string; error?: string };

/** a part as a person reads it: the feed is the project's build updates */
export const PART_WORD: Record<Part, string> = { things: "things", feed: "build updates", memory: "memory", goal: "goal", calendar: "calendar", decisions: "decisions", polls: "polls" };
const word = (p: string) => PART_WORD[p as Part] ?? p;
const and = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);

/** the parts a reply wears, or [] (pure): a list of known words from the item, nothing else */
export const usedOf = (v: unknown): Part[] => (Array.isArray(v) ? v.filter((p): p is Part => typeof p === "string" && p in PART_WORD) : []);
/** under a reply: "from the project · memory, build updates" (pure) */
export const markLine = (parts: Part[]) => `from the project · ${parts.map(word).join(", ")}`;
/** the mark's longer words, for its title (pure) */
export const markTitle = (parts: Part[]) => `this answer read the project's ${and(parts.map(word))}; the project sees that it was used, never what was read`;

/** on the strip: the person's newest parts, three at most, "used memory, goal · 2h", or "" (pure) */
export function stripLine(uses: Use[] | undefined, ago: (iso: string) => string): string {
  if (!uses?.length) return "";
  const parts = uses.slice(0, 3).map((u) => word(u.part));
  return `used ${parts.join(", ")}${uses.length > 3 ? ` +${uses.length - 3}` : ""} · ${ago(uses[0].at)}`;
}

/** the project page's rows: each person who used something, newest first, with each part and when (pure) */
export function usedRows(v: Pick<UsedView, "people">): { who: string; at: string; parts: { part: Part; word: string; at: string; version: string }[] }[] {
  return Object.entries(v.people ?? {}).filter(([, l]) => l.length)
    .map(([who, l]) => ({ who, at: l[0].at, parts: l.map((u) => ({ part: u.part, word: word(u.part), at: u.at, version: u.version })) }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
