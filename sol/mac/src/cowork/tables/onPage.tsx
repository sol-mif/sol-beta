// Tables on a page (#434; the line and the menu entry in part.ts): a page's line `::table[<id>]` is a table drawn in place, live, one of its views at a time; the
// slash menu's "/table" offers the project's tables and puts that line. Three calls into pages (#433): `definePart` for
// the line, `drawPart` for its drawing, `defineSlash` for the entry; nothing in pages changed for it but the two fields a
// drawing and a menu need (DrawCtx's team, SlashCtx's tables).
import { useState } from "react";
import { drawPart } from "../pages/Page";
import type { Team } from "../useTeam";
import { Glyph } from "../Room";
import { useTable, ViewOf } from "./Table";
import { sourceName } from "./shapes";
import { KINDS } from "./views";
import { tablesOnPages } from "./part";

tablesOnPages(sourceName);
drawPart("table", (p, c) => (c.team ? <TableOnPage key={p.id} team={c.team} id={p.id ?? ""} /> : null));

function TableOnPage({ team, id }: { team: Team; id: string }) {
  const { t, rows, error } = useTable(team, id);
  const [vid, setVid] = useState("");
  if (!t) return <div className="pg-block off"><Glyph kind="sheet" size={28} /><span className="pg-bk-tx"><span className="pg-bk-n">{id}</span><span className="pg-bk-s">{error || "reading the table…"}</span></span></div>;
  const view = t.table.views.find((v) => v.id === vid) ?? t.table.views[0];
  return (
    <div className="tb-onpage">
      <div className="tb-onpage-top">
        <Glyph kind="sheet" size={22} />
        <span className="tb-onpage-t">{t.table.title}</span>
        <span className="tb-dim">{t.table.source === "own" ? `${rows.length} row${rows.length === 1 ? "" : "s"}` : `reads ${sourceName(t.table.source)}, kept current`}</span>
        <div className="tb-views" role="tablist" aria-label="views">
          {t.table.views.map((v) => (
            <button key={v.id} role="tab" aria-selected={v.id === view?.id} className={`tb-vtab ${v.id === view?.id ? "on" : ""}`} onClick={() => setVid(v.id)} title={v.name}>
              <span className="tb-vmark" aria-hidden>{KINDS.find((k) => k.kind === v.kind)?.mark}</span>{v.name}
            </button>
          ))}
        </div>
      </div>
      {view && <ViewOf view={view} cols={t.table.columns} rows={rows} people={[]} compact />}
    </div>
  );
}
