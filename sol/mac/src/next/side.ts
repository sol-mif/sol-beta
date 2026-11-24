// The sidebar fits (round 6 · F2, #1615; the mockup's shell.js fitSide): it never scrolls. Run after each draw of the
// sidebar and again when it changes size. While its rows would scroll, Working now keeps the whole rows that fit (those
// that are open, then those that ask, first; otherwise in their order) and a "+N more" row that opens See what's at work;
// when even one row and "+N more" do not fit, Working now folds to its heading. Then the folders do the same (H4, BR1
// #1615): the first whole rows of the canvas's order that fit and a "+N more" row that lists the rest; only when even one
// folder and "+N more" do not fit do the folders fold, their heading with them, so "Folders" never stands over nothing
// (the classes fold-ais and fold-regions, drawn by people/people.css). The rows are the shell's (Next.tsx); this only
// hides. Signed: marcocyl04-ux's agent, the port's join (#1615); Working now, builder G (BR1).

/** the sidebar's lists the person folds (Look 1 A1, Marco: "should be able to open and collapse"): Working now ("ais")
 *  and Folders ("regions"); a press on the heading folds or opens it, and it stays so across loads (localStorage
 *  "sol.side.fold"). A folded list draws its heading only, so the fit above never unhides its rows */
export type SideList = "ais" | "regions";
const FOLD_KEY = "sol.side.fold";
export function sideFolded(k: SideList): boolean {
  try { return !!JSON.parse(globalThis.localStorage?.getItem(FOLD_KEY) || "{}")[k]; } catch { return false; }
}
export function setSideFolded(k: SideList, v: boolean): void {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(FOLD_KEY) || "{}") as Record<string, boolean>;
    if (v) all[k] = true; else delete all[k];
    globalThis.localStorage?.setItem(FOLD_KEY, JSON.stringify(all));
  } catch { /* no storage: it folds for this load */ }
}

/** the most of `n` rows to show, at least 1, while `over(k)` (the sidebar scrolls with k shown) only grows with k: by
 *  halving (#1615 S32), the same k as trying k = n−1, n−2, … 1 in turn, in about log2(n) layouts instead of one per row */
export function mostThatFit(n: number, over: (k: number) => boolean): number {
  let lo = 1, hi = n - 1, best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (over(mid)) hi = mid - 1; else { best = mid; lo = mid + 1; }
  }
  return best;
}

/** keep the most of `rows` (in this order) that fit, and `more` saying how many are left out */
function keep(rows: HTMLElement[], more: HTMLElement, over: () => boolean): void {
  const label = more.firstElementChild as HTMLElement | null;
  const show = (k: number) => {
    rows.forEach((r, j) => { r.hidden = j >= k; });
    if (label) label.textContent = `+${rows.length - k} more`;
  };
  more.hidden = false;
  show(mostThatFit(rows.length, (k) => { show(k); return over(); }));
}

/** fit the sidebar `sd` (nav#side): unhide everything, then hide from the bottom of the AIs' order, then the folders',
 *  until nothing scrolls */
export function fitSide(sd: HTMLElement): void {
  const ss = sd.querySelector<HTMLElement>(".nx-scroll"), box = sd.querySelector<HTMLElement>("#sideais");
  if (!ss || !box) return;
  sd.classList.remove("fold-ais", "fold-regions");
  ss.scrollTop = 0;
  const over = () => ss.scrollHeight > ss.clientHeight + 1 || sd.scrollHeight > sd.clientHeight + 1;
  const more = box.querySelector<HTMLElement>(".nx-aimore"), rows = [...box.querySelectorAll<HTMLElement>(".nx-ai")];
  const fmore = sd.querySelector<HTMLElement>("#sideregions [data-regmore]");
  const folders = [...sd.querySelectorAll<HTMLElement>("#sideregions .nx-reg[data-region]")];
  for (const r of [...rows, ...folders]) r.hidden = false;
  if (more) more.hidden = true;
  if (fmore) fmore.hidden = true;
  if (more && over() && rows.length > 1) {
    const rank = (r: HTMLElement) => (r.classList.contains("on") ? 4 : 0) + (r.querySelector(".nx-st.asks") ? 2 : 0);
    keep(rows.map((r, i) => ({ r, i })).sort((p, q) => rank(q.r) - rank(p.r) || p.i - q.i).map((x) => x.r), more, over);
  }
  if (over()) sd.classList.add("fold-ais");
  // the folders in the canvas's order, so a folder inside another stays under it; the outermost are kept first, so a
  // top folder is never left in "+N more" while rows inside another take its place (#1816 round 2)
  const depth = (r: HTMLElement) => Number(r.dataset.depth) || 0;
  if (fmore && over() && folders.length > 1) keep(folders.map((r, i) => ({ r, i })).sort((p, q) => depth(p.r) - depth(q.r) || p.i - q.i).map((x) => x.r), fmore, over);
  if (over()) sd.classList.add("fold-regions");
}
