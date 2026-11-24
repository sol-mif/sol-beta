// Which plane cards fitCards (plane/index.tsx) fits this draw: only a card with a front (.fo-front) is ever fitted or
// stamped. A folded tab (Pieces.tsx FolderTab, DayMore) has no front and no inline height (pieces.css sizes it), so it
// carries no fit memo and is never refit (#1615). Signed: marcocyl04-ux's agent (builder E8).

/** the few parts of an element the choice reads; a plane card in the face, a plain object in a test */
export type FitCard = { className: string; style: { width: string; height: string }; dataset: Record<string, string | undefined>; querySelector(s: string): unknown };

/** the cards to fit with their fronts: a card whose look and data are as at its last fit is skipped while its size is the
 *  same (a pan), or (#1633) while it only grew and nothing in it was cut; the rest are stamped with this fit */
export function toFit<C extends FitCard, F>(cards: C[], ver: number): { c: C; f: F }[] {
  return cards.map((c) => ({ c, f: c.querySelector(".fo-front") as F | null })).filter((x): x is { c: C; f: F } => !!x.f).filter(({ c }) => {
    const w = parseFloat(c.style.width), h = parseFloat(c.style.height), fit = `${c.className.replace(/ fo-on/, "")} ${ver}`, d = c.dataset;
    if (d.fit === fit && ((w === +d.fw! && h === +d.fh!) || (d.cut === "" && w >= +d.fw! && h >= +d.fh!))) return false;
    d.fit = fit; d.fw = String(w); d.fh = String(h); d.cut = "";
    return true;
  });
}
