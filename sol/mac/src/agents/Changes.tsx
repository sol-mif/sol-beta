// What Sol changed (#1327; the calm pass, rule 6): Sol's own changes grouped by cause (every pause at a sign-in one
// line, every rest for want of work one line), each with one undo for the whole group and its lines folded under it;
// the person's own presses one by one. Newest first. Sol changes how they work by itself; only the person changes what
// they may do.
import { useState } from "react";
import { Jelly } from "./Jelly";
import { causesOf, saidOf, whenWord, type AgentRow, type Change, type CauseGroup } from "./model";
import type { Ask } from "./useAgents";
import type { Said } from "./Desk";

export function Changes({ changes, agents, now, ask, onSaid, onOpen }: { changes: Change[]; agents: AgentRow[]; now: number; ask: Ask; onSaid: (s: Said) => void; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const groups = causesOf(changes, (id) => agents.find((a) => a.id === id)?.name);
  const undo = async (g: CauseGroup) => {
    setBusy(g.key);
    const r = await ask<{ ok: boolean; why?: string; change?: Change }>(g.ids.length > 1 ? { type: "agents.undo", changeIds: g.ids } : { type: "agents.undo", changeId: g.ids[0] }, 15_000);
    setBusy(null);
    const s = saidOf(r, "undo");
    onSaid({ ok: s.ok, line: s.ok ? `Undone: ${g.line}` : s.line });
  };
  const undoable = (g: CauseGroup) => g.ids.some((id) => changes.find((c) => c.id === id)?.undo);
  return (
    <div className="ag-changes" data-place="talk">
      <h1 className="ag-title">What Sol changed</h1>
      <p className="ag-lead">Sol keeps your agents running by itself; each change is one line, with one undo. What they may do changes only when you press.</p>
      {!groups.length && <p className="ag-none">Nothing changed yet.</p>}
      <ol>
        {groups.map((g) => {
          const whose = [...new Set(g.ids.map((id) => changes.find((c) => c.id === id)?.agent).filter(Boolean))].map((id) => agents.find((x) => x.id === id)).filter((x): x is AgentRow => !!x);
          const last = changes.find((c) => c.id === g.ids[0]);
          return (
            <li key={g.key} className={`ag-change ${g.undone ? "ag-undone" : ""}`} data-cause={g.cause ?? ""}>
              <span className="ag-when">{whenWord(g.at, now)}</span>
              <span className="ag-cell">
                <span className="ag-line">{g.line}</span>
                {g.ids.length > 1 && <details className="ag-fold"><summary className="ag-mute">{g.ids.length} changes</summary>{g.lines.map((l, i) => <p key={i} className="ag-mute">{l}</p>)}</details>}
              </span>
              <span className="ag-two">{whose.slice(0, 4).map((a) => <button type="button" key={a.id} className="ag-who" onClick={() => onOpen(a.id)} title={`${a.name}'s desk`}><Jelly size={18} turn={a.turn} /></button>)}</span>
              {g.undone ? <span className="ag-mute">undone {last?.undoneAt ? whenWord(last.undoneAt, now) : ""}</span>
                : undoable(g) ? <button type="button" className="ag-btn ag-sm" disabled={busy === g.key} onClick={() => void undo(g)}>{busy === g.key ? "undoing…" : "Undo"}</button>
                : <span className="ag-mute">no undo</span>}
            </li>
          );
        })}
      </ol>
      <p className="ag-mute ag-gap">Never by itself: more reach, a new account, a higher rung, deleting what an agent made.</p>
    </div>
  );
}
