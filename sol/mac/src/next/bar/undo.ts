// The one Undo line (BR1, #1615; mine/look/br1/pieces.html): every move, fold and resize by hand says what it did in the
// same line as Arrange, with its Undo. The moves say it here; the bar (Bar.tsx) draws it: inside Arrange's card when that
// is open, else floating just above the bar for a while. No React here, so a move can say it from anywhere.
// Signed: marcocyl04-ux's agent, the port's BR1 pieces (#1615).
export type Line = { words: string; undo: (() => void) | null; at: number };
let show: ((l: Line | null) => void) | null = null;
let shown: string | undefined;   // the key of the line up now, if it has one
/** the bar listens while it is drawn; null takes the line down */
export const bindLine = (f: ((l: Line | null) => void) | null) => { show = f; };
/** say what a move did, and how to take it back; the line's Undo says "Put back as it was" after. A key names what the
 *  line is about, so it goes when that is undone elsewhere (forget) */
export function said(words: string, undo: (() => void) | null, key?: string): void {
  if (!show) return;
  const f = show;
  shown = key;
  f({ words, at: Date.now(), undo: undo ? () => { undo(); shown = undefined; f({ words: "Put back as it was", undo: null, at: Date.now() }); } : null });
}
/** the line about this key is undone some other way (the Shelf's Take back): it goes, its Undo with it */
export function forget(key: string): void {
  if (!show || shown !== key) return;
  shown = undefined;
  show(null);
}
