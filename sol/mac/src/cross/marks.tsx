// A block's kind as a small drawn mark (#1031), for what crossed into Home: a page's lines, a list's ticks, a table's
// grid, shots as frames, a browser's bar. The word is the title's, on hover.
export function KindMark({ kind }: { kind: string }) {
  const d: Record<string, string> = {
    page: "M5 4h10l4 4v12H5z M8 11h8 M8 14h8 M8 17h5",
    list: "M5 7l1.5 1.5L9 6 M11 7h8 M5 12l1.5 1.5L9 11 M11 12h8 M11 17h8 M5.5 17h3",
    table: "M4 5h16v14H4z M4 10h16 M4 14.5h16 M10 5v14",
    shots: "M4 6h7v6H4z M13 6h7v6h-7z M4 14h7v5H4z M13 14h7v5h-7z",
    browser: "M4 5h16v14H4z M4 9h16 M6.5 7h.01 M8.5 7h.01",
    card: "M5 7h14v10H5z M8 11h8",
    diff: "M7 4v16 M17 4v16 M4 9h6 M14 15h6",
    terminal: "M4 5h16v14H4z M7 10l3 2-3 2 M12 15h5",
    session: "M4 5h16v10h-9l-4 4v-4H4z M8 9h8 M8 12h5",   // #1045: a whole session, its talk
  };
  return <svg className="cross-kind" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={d[kind] ?? d.card} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
