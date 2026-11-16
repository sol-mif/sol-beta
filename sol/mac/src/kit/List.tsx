// A list in a card (#647, kit growth: who answers, the mode and the folder each lift a card that is a list to pick from,
// so the shape moved down into the kit). Heads and rows, the rows the kit's Row: the one under the pointer or the keys
// washed, the picked one in the pearl. Walked by the keys: ↑↓ the rows, Enter picks, Esc closes, 1-9 pick by number when
// `numbers`. It takes the keys when it opens. A row may carry `id` (data-row, for a test to find it), a `lead` mark, a
// `note` line and an `aside`.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Row } from "./Row";
import { label } from "./paint";

export type Item = { head: ReactNode } | { id: string; title: ReactNode; note?: ReactNode; lead?: ReactNode; aside?: ReactNode; picked?: boolean };
const isRow = (x: Item): x is Exclude<Item, { head: ReactNode }> => "id" in x;

export function List({ w, items, lit, onLit, onPick, onClose, numbers, h }: {
  w: number; items: readonly Item[]; lit: number; onLit: (k: number) => void; onPick: (k: number) => void; onClose?: () => void; numbers?: boolean; h?: number;
}) {
  const at = useRef<HTMLDivElement>(null);
  const rows = items.filter(isRow), n = rows.length;
  useLayoutEffect(() => { at.current?.focus({ preventScroll: true }); }, []);
  const key = (ev: React.KeyboardEvent) => {
    const k = ev.key;
    if (k === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose?.(); }
    else if (k === "ArrowDown" || k === "ArrowUp") { ev.preventDefault(); onLit((lit + (k === "ArrowDown" ? 1 : -1) + n) % Math.max(1, n)); }
    else if (k === "Enter") { ev.preventDefault(); if (lit >= 0 && lit < n) onPick(lit); }
    else if (numbers && /^[1-9]$/.test(k) && Number(k) <= n) { ev.preventDefault(); onPick(Number(k) - 1); }
  };
  let k = -1;
  return (
    <div ref={at} role="menu" tabIndex={-1} onKeyDown={key} style={{ display: "flex", flexDirection: "column", gap: 2, outline: "none" }}>
      {items.map((x, i) => {
        if (!isRow(x)) return <div key={`h${i}`} style={{ ...label, padding: "8px 12px 4px" }}>{x.head}</div>;
        const j = ++k;
        return (
          <div key={x.id} data-row={x.id} role="menuitemradio" aria-checked={!!x.picked} className={`${j === lit ? "lit" : ""}${x.picked ? " on" : ""}`} onPointerEnter={() => onLit(j)}>
            <Row w={w} h={h ?? (x.note != null ? 48 : 36)} title={x.title} note={x.note} lead={x.lead} aside={x.aside} picked={x.picked} hover={j === lit} onClick={() => onPick(j)} />
          </div>
        );
      })}
    </div>
  );
}
