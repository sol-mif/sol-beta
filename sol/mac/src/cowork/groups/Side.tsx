// The left column of a table's page (#1537; a3 of docs/cowork-ui-2026-11-18): all tables with their count, one row per
// table (its mark, its name, who else sits there, two small jellies), then "start a table" and "i have a code". A row's
// menu (a10) opens from the row: copy the code, rename, quiet, and apart from them, leave.
import { useEffect, useRef, type ReactNode } from "react";
import { Jelly } from "./Jelly";
import { Sticker } from "./Coin";
import { codeShown, othersOf, type TableView } from "./view";

const IC: Record<TableView["kind"], string> = {
  github: "M6 6v20M6 14c10 0 14-2 14-8M20 6h18M6 22h30",
  drive: "M8 3h20l8 7v15H8zM14 12h14M14 17h14M14 22h8",
  cloud: "M5 7h34v19H5zM5 13h34M13 3v6M31 3v6M14 19h.1M22 19h.1M30 19h.1",
};
export function KindMark({ kind, small }: { kind: TableView["kind"]; small?: boolean }) {
  const svg = <svg viewBox="0 0 44 28"><path d={IC[kind]} /></svg>;
  if (small) return <span className="gh-k">{svg}</span>;
  return <span className="gh-kind">{svg}</span>;
}

export type Menu = { copy: () => void; rename: () => void; quiet: () => void; leave: () => void; code: string; quietOn: boolean };

export function Side({ tables, me, at, lo, menuFor, onHome, onOpen, onMenu, onStart, onCode, menu }: {
  tables: TableView[]; me: string; at: string; lo: "start" | "code" | ""; menuFor: string;
  onHome: () => void; onOpen: (id: string) => void; onMenu: (id: string) => void; onStart: () => void; onCode: () => void; menu?: Menu & { close: () => void };
}) {
  const menuEl = useRef<HTMLDivElement>(null);
  // the menu closes on a press anywhere else, or Esc
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (!menuEl.current?.contains(e.target as Node)) menu.close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") menu.close(); };
    window.addEventListener("mousedown", down); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [menu]);
  return (
    <aside className="gh-card gh-side" data-place="groups-side">
      <button type="button" className="gh-gr home" data-go="home" onClick={onHome}><span className="gh-k"><svg viewBox="0 0 16 16" style={{ transform: "scaleX(-1)" }}><path d="M6.5 4.5l3.5 3.5-3.5 3.5" /></svg></span><span className="gh-gn">all tables</span><span className="gh-num" style={{ marginLeft: "auto", color: "var(--dim)" }}>{tables.length}</span></button>
      {tables.map((t) => (
        <div key={t.id} className="gh-grw">
          <button type="button" className={`gh-gr${t.id === at ? " on" : ""}${menuFor === t.id ? " held" : ""}`} data-go={`table/${t.id}`} data-table={t.id}
            onClick={() => onOpen(t.id)} onContextMenu={(e) => { e.preventDefault(); onMenu(t.id); }} title="open; right-click for its menu">
            <KindMark kind={t.kind} small />
            <span className="gh-gn">{t.name}<small>{othersOf(t.seats, t.more)}</small></span>
            <span className="gh-js">{t.seats.filter((s) => !s.me).slice(0, 2).map((s) => <Jelly key={s.login} login={s.login} me={me} s={24} />)}</span>
          </button>
          <button type="button" className="gh-dots" data-act="menu" aria-label={`${t.name}'s menu`} onClick={() => onMenu(t.id)}>···</button>
          {menu && menuFor === t.id && (
            <div ref={menuEl} className="gh-lifted gh-menu" role="menu" data-menu={t.id}>
              <Mi act="copy" onClick={menu.copy}>copy the code {menu.code ? <Sticker>{codeShown(menu.code)}</Sticker> : <span className="gh-dim">none yet</span>}</Mi>
              <Mi act="rename" onClick={menu.rename}>rename the table</Mi>
              <Mi act="quiet" onClick={menu.quiet}>{menu.quietOn ? "unquiet this table" : "quiet this table"}</Mi>
              <div className="gh-sep" />
              <Mi act="leave" onClick={menu.leave}>leave this table</Mi>
            </div>
          )}
        </div>
      ))}
      <span className="gh-grow" />
      <button type="button" className={`gh-lo${lo === "start" ? " on" : ""}`} data-go="new" onClick={onStart}>start a table</button>
      <button type="button" className={`gh-lo${lo === "code" ? " on" : ""}`} data-go="code" onClick={onCode}>i have a code</button>
    </aside>
  );
}
const Mi = ({ act, onClick, children }: { act: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="gh-mi" role="menuitem" data-act={act} onClick={onClick}>{children}</button>
);
