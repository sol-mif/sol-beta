// The sidebar fits (round 6 · F2, #1615; the mockup's shell.js fitSide): it never scrolls. Run after each draw of the
// sidebar and again when it changes size. While its rows would scroll, Your AIs keeps the whole rows that fit (those that
// are open, then those that ask, first; otherwise in their order) and a "+N more" row that opens Your AIs; when even one
// row and "+N more" do not fit, the AIs fold to their heading; then the canvas's folders fold into the Diary's row (the
// classes fold-ais and fold-regions, drawn by people/people.css). The rows are the shell's (Next.tsx); this only hides.
// Signed: marcocyl04-ux's agent, the port's join (#1615).

/** fit the sidebar `sd` (nav#side): unhide everything, then hide from the bottom of the AIs' order until nothing scrolls */
export function fitSide(sd: HTMLElement): void {
  const ss = sd.querySelector<HTMLElement>(".nx-scroll"), box = sd.querySelector<HTMLElement>("#sideais");
  if (!ss || !box) return;
  sd.classList.remove("fold-ais", "fold-regions");
  ss.scrollTop = 0;
  const over = () => ss.scrollHeight > ss.clientHeight + 1 || sd.scrollHeight > sd.clientHeight + 1;
  const more = box.querySelector<HTMLElement>(".nx-aimore"), rows = [...box.querySelectorAll<HTMLElement>(".nx-ai")];
  rows.forEach((r) => { r.hidden = false; });
  if (more) more.hidden = true;
  if (more && over() && rows.length > 1) {
    const rank = (r: HTMLElement) => (r.classList.contains("on") ? 4 : 0) + (r.querySelector(".nx-st.asks") ? 2 : 0);
    const order = rows.map((r, i) => ({ r, i })).sort((p, q) => rank(q.r) - rank(p.r) || p.i - q.i).map((x) => x.r);
    more.hidden = false;
    const label = more.firstElementChild as HTMLElement | null;
    for (let k = rows.length - 1; k >= 1; k--) {
      order.forEach((r, j) => { r.hidden = j >= k; });
      if (label) label.textContent = `+${rows.length - k} more`;
      if (!over()) break;
    }
  }
  if (over()) sd.classList.add("fold-ais");
  if (over()) sd.classList.add("fold-regions");
}
