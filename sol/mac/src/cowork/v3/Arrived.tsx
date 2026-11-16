// What arrived from a project (fr-30, slice 1): one chip row at the top of Home, "N from <project> · show", and the
// agent's proposals beside it as a count on its mark ("the agent never opens anything unasked"). Opening a session
// shows its own last thing first; these wait. Pressing show lays them out as lines with their two marks.
import { useEffect, useState } from "react";
import { askArrived, dropProposal, openProposal, seenArrived, useV3 } from "./store";
import { rise } from "./fly";

const initial = (who: string) => (who.trim()[0] ?? "?").toUpperCase();
export const Face = ({ who, agent }: { who: string; agent?: boolean }) => <span className={`v3-face${agent ? " agent" : ""}`} title={agent ? `${who}'s agent` : who}>{initial(who)}</span>;

export function Arrived({ sessionId, room, roomName }: { sessionId: string; room: string; roomName: string }) {
  const s = useV3();
  const [open, setOpen] = useState<"arrived" | "proposed" | null>(null);
  useEffect(() => { void askArrived(room); }, [room]);
  const a = s.arrived[room], props = s.proposed[sessionId] ?? [];
  const n = a?.n ?? 0;
  if (!n && !props.length) return null;
  return (
    <div className="v3-arrivals" ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = "1"; rise(el); } }}>
      <div className="v3-arr-row">
        {n > 0 && <button className="v3-arr-chip" onClick={() => setOpen(open === "arrived" ? null : "arrived")}>
          <span className="faces">{(a?.who ?? []).slice(0, 3).map((w) => <Face key={w} who={w} />)}</span>
          <b>{n} from {roomName || "the project"}</b><span className="sh">{open === "arrived" ? "hide" : "show"}</span>
        </button>}
        {props.length > 0 && <button className="v3-arr-chip agent" onClick={() => setOpen(open === "proposed" ? null : "proposed")} title="what your agent offers; nothing opens until you press">
          <Face who="you" agent /><b>{props.length} proposed</b><span className="sh">{open === "proposed" ? "hide" : "show"}</span>
        </button>}
      </div>
      {open === "arrived" && a && (
        <div className="v3-arr-list">
          {a.titles.map((t, i) => <div key={i} className="v3-arr-line"><span className="t">{t || "a thing"}</span><span className="v3-where">{roomName}</span></div>)}
          <button className="v3-press ghost" onClick={() => { seenArrived(room); setOpen(null); }}>seen</button>
        </div>
      )}
      {open === "proposed" && props[0] && (
        <div className="v3-arr-list">
          <div className="v3-arr-line"><Face who="you" agent /><span className="t">{props[0].title}</span><span className="v3-where">→ {props[0].projectName}</span></div>
          <div className="v3-arr-acts">
            <button className="v3-press ink" onClick={() => { openProposal(sessionId, props[0].id); setOpen(null); }}>Open it</button>
            <button className="v3-press ghost" onClick={() => dropProposal(sessionId, props[0].id)}>Not this</button>
          </div>
        </div>
      )}
    </div>
  );
}
