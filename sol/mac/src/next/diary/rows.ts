// The Diary card's rows on the canvas (#1879 step 4): the day's lines newest first, as many as the card has room for, then
// "+N more". Pure: the card measures its rows and says how much room it has; this says which rows stay.

/** newest first: the latest time on top; a line with no time yet (an ask waiting right now) is the newest of all */
export function newestFirst<T extends { t: number }>(rows: T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (b.r.t === a.r.t ? a.i - b.i : b.r.t - a.r.t)).map((x) => x.r);
}

/** how many rows stay: `ends` are the bottoms of all the rows laid out one under another, `limit` the card's room, `moreH`
 *  the height "+N more" takes when some rows are left out. At least one stays when there is one; all when they fit whole */
export function fitCount(ends: number[], limit: number, moreH: number): number {
  const all = ends.length;
  if (!all || ends[all - 1] <= limit) return all;
  let n = 0;
  while (n < all && ends[n] <= limit - moreH) n++;
  return Math.max(1, n);
}
