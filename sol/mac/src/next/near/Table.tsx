// A session's table, drawn (BR1, mine/look/br1/inside.html §2 and §3, birth.html row 5, #1615; the list is cv/moves/table.ts).
// As a tab it is a pane of its own beside the conversation, drawn by the fixture's session (Session.tsx) and the live one
// (Live.tsx) alike: every piece the session uses and made, a press opens one in a tab; the automations made in it (`in` its
// session, make_automation or Add's Automation) are the Automation piece itself (auto/index.tsx) through the one list
// (Collection, auto/model.ts TABLE: on or never turned on drawn, "N paused" counted). Beside the canvas it is a strip under
// the head, its first few and "its table · N", which opens the session as a tab. Both take a drop (data-takes,
// notes/drop.ts): a piece or a note let go here is given to the session. "Drag anything here" shows until the person's
// first drag in, then never again (the sixth moment, data-moment="table-hint").
// Signed: marcocyl04-ux's agent (builders E and F), BR1 (#1615).
import { D, M, useNext, type Piece } from "../cv/index.ts";
import { hintGone, tableOf, type TableItem } from "../cv/moves/table.ts";
import Automation from "../auto/index.tsx";
import Collection from "../Collection.tsx";
import { pieceId, TABLE } from "../auto/model.ts";
import type { Auto, Work } from "../work/read.ts";

const MARK: Record<string, string> = { note: "✎", sticky: "✎", change: "±", automation: "↻", list: "☰", row: "☰" };
const mark = (k: string) => MARK[k] ?? "▤";

const open = (t: TableItem) => { if (t.piece && !t.piece.startsWith("auto:")) M.tabOpen(t.piece, true); };
const sig = (pid: string) => () => tableOf(pid).map((t) => `${t.key}\t${t.kind}\t${t.title}\t${t.how}\t${t.from}\t${t.piece ?? ""}`).join("\n");
const read = (s: string): TableItem[] => (s ? s.split("\n").map((l) => { const [key, kind, title, how, from, piece] = l.split("\t"); return { key, kind, title, how: how as TableItem["how"], from, ...(piece ? { piece } : {}) }; }) : []);

/** the automations that live in this session: made in it, by its id on the plane or the engine's session id */
export const madeIn = (p: Piece): Auto[] => ((D.work as Work | undefined)?.autos ?? []).filter((a) => !!a.in && (a.in === p.id || a.in === p.sessionId));

/** the whole table, a pane of the session as a tab; the blocks it made keep their own heading under it (Session.tsx) */
export function Table({ pid, name }: { pid: string; name: string }) {
  const items = read(useNext(sig(pid)));
  const rows = items.filter((t) => !t.key.startsWith("blk:") && t.kind !== "automation");
  const p = D.pieces[pid], made = p ? madeIn(p) : [];
  return (
    <div className="nr-table" data-takes={pid} data-takes-name={name}>
      <div className="nr-bar"><b>Its table</b><span className="sm">{items.length} · what it uses and what it made</span></div>
      <div className="nr-tb-list">
        {rows.map((t) => (
          <button key={t.key} type="button" className={`nr-tb-it ${t.how}`} data-table-item={t.key} disabled={!t.piece} onClick={() => open(t)} title={t.piece ? `Open ${t.title}` : t.title}>
            <span className="nr-tb-m" aria-hidden="true">{mark(t.kind)}</span>
            <span className="nr-tb-t"><b>{t.title}</b><small>{t.from}</small></span>
          </button>
        ))}
        <Collection items={made} label="table" className="nr-blocks" keyOf={(a) => a.id} draw={(a) => <Automation id={pieceId(a.id)} />}
          ranking={TABLE} more={(n) => `${n} paused`} />
        {hintGone() ? null : <div className="nr-tb-hint" data-moment="table-hint">Drag anything here: a file, a note, a piece from the canvas. It now knows it.</div>}
      </div>
    </div>
  );
}

/** the strip beside the canvas: its first three, and "its table · N", which opens the session as a tab to see it all */
export function Strip({ pid, name }: { pid: string; name: string }) {
  const items = read(useNext(sig(pid)));
  return (
    <div className="kp-strip" data-takes={pid} data-takes-name={name} data-strip={pid}>
      {items.slice(0, 3).map((t) => (
        <button key={t.key} type="button" className="kp-chip" data-table-item={t.key} disabled={!t.piece || t.piece.startsWith("auto:")} onClick={() => open(t)} title={`${t.title} · ${t.from}`}>
          <span aria-hidden="true">{mark(t.kind)}</span><span className="kp-chip-t">{t.title}</span>
        </button>
      ))}
      <button type="button" className="kp-chip kp-all" data-table-all onClick={() => M.besideTab()} title="Open it as a tab to see its whole table">its table · {items.length}</button>
    </div>
  );
}
