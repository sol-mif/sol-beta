// ⌘F in a session (#1239): where the words he typed sit in a piece of the talk's text. Pure, so the face's tests reach it;
// FindBar.tsx walks the talk's text and lights what this returns.

/** each place q sits in text, [start, end), case set aside; none for an empty or blank q */
export function spans(text: string, q: string): [number, number][] {
  if (!q.trim()) return [];
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const out: [number, number][] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** the match to land on first: the first that starts at or below the top of what is on screen, else the first of all */
export function firstFrom(tops: number[], top: number): number {
  const i = tops.findIndex((y) => y >= top);
  return i < 0 ? 0 : i;
}

/** one step on from at, round the ends either way */
export function step(at: number, by: 1 | -1, count: number): number {
  return count ? (at + by + count) % count : 0;
}
