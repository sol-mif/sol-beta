// One thing at a time asks for the eye (#891, the night brief's human check 3: "more than one thing moves or glows for
// attention at once" fails a person). Behind the run's switches (stage.whole, sol.home.whole), what moves at rest is
// chosen by one written order, and everything below the first one present rests:
//   asks      a block or a card waits on you (its rim, its "when" in yellow): the only thing that needs the person
//   running   work going on by itself (a list's running step turning, the ribbon's thread)
//   decor     the effort pill's heat, a sheen: never more than ornament, so it never moves while anything above is there
// The jelly (the creature) is not in the order: it is the window's own face, drawn by the body, and breathes slower
// than a glance; it is counted by the eyes script as the one thing that may move when nothing else does. Pure: the
// parts ask `moves(kind, present)` and draw still when it says no.

export const ATTENTION = ["asks", "running", "decor"] as const;
export type Attention = (typeof ATTENTION)[number];

/** the one kind that moves, given the kinds present on the screen; null when none is */
export function mover(present: Iterable<Attention>): Attention | null {
  const p = new Set(present);
  return ATTENTION.find((k) => p.has(k)) ?? null;
}

/** whether a part of this kind may move, given what else is present. Decor never moves while the jelly is on the
 *  screen (always, in the window), so it is still unless it is all there is and the jelly is away */
export function moves(kind: Attention, present: Iterable<Attention>, jelly = true): boolean {
  if (kind === "decor" && jelly) return false;
  return mover([...present, kind]) === kind;
}
