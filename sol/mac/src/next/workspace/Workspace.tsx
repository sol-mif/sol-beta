// Workspace changes, the review panel (#1615 BR1; engine next/workspace.ts, protocol next/protocol/WS.md): each setup Sol
// suggests, drawn as its title, one plain sentence, each change as a row with its reason and a skip toggle, "Why this
// setup?" with what it rests on, then Preview, Keep (the one black pill, on once the preview shows these choices) and
// Discard; a kept one has Undo. Mounted inside Settings by its owner, beside the entry row that reads workspaceCount().
// It reads the store and presses the moves in cv/moves/workspace.ts. Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { useNext } from "../cv/index.ts";
import moves, { WSof, previewed, workspaceCount, type Evidence, type Plan, type WS } from "../cv/moves/workspace.ts";
import "./workspace.css";

export { workspaceCount };

const NOTHING_YET = "Nothing changes until you keep it.";
const day = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
/** a change as the person reads it, before any preview (the engine's preview says the same in its rows) */
function says(o: Plan["operations"][number]): string {
  if (o.op === "create_folder") return o.type === "build" ? `Make the Build folder “${o.name}”` : o.type === "home" ? `Make the Home folder “${o.name}”` : `Make the folder “${o.name}”`;
  if (o.op === "create_piece") {
    if (o.kind === "note") return `Add the note “${o.name}”`;
    if (o.kind === "checklist") { const n = o.items?.length || 1; return `Add the checklist “${o.name}” (${n} ${n === 1 ? "item" : "items"})`; }
    if (o.kind === "session") return `Start an empty session “${o.name}”`;
    if (o.kind === "quick-tools") return `Add quick tools “${o.name}”`;
    if (o.kind === "automations-index") return `Add a list of your automations “${o.name}”`;
    return `Add your own tool “${o.name}”`;
  }
  const what = o.ref && "key" in o.ref ? o.ref.key : "a sticky";
  if (o.op === "move_piece") return `Move “${what}” to ${o.region?.startsWith("$") ? "the new folder" : `“${o.region}”`}`;
  return `Change “${what}”${o.name !== undefined ? ` to “${o.name}”` : ""}`;
}

export function WorkspaceChanges() {
  const w = useNext(() => WSof());
  const waiting = w.plans.filter((p) => p.status === "proposed");
  const kept = w.plans.filter((p) => p.status === "kept").slice(0, 5);
  return (
    <section className="ws" aria-label="Your setup" data-ws="changes">
      <h2 className="ws-h">Your setup</h2>
      <p className="ws-say">Sol can suggest a different setup for your folders and stickies. {NOTHING_YET}</p>
      {waiting.length ? waiting.map((p) => <Suggestion key={p.id} p={p} w={w} />)
        : <div className="ws-none">Nothing to review yet. When Sol suggests a different setup, it waits here for you.</div>}
      {kept.length ? (
        <div className="ws-kept">
          <div className="ws-sub">Kept lately</div>
          {kept.map((p) => (
            <div key={p.id} className="ws-krow" data-ws-kept={p.id}>
              <span className="ws-t"><b>{p.title}</b><small>Kept {day(p.keptAt)}{w.why[p.id] ? ` · ${w.why[p.id]}` : ""}</small></span>
              <button className="ws-btn" disabled={w.busy === p.id} onClick={() => moves.wsUndo(p.id)}>Undo</button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Suggestion({ p, w }: { p: Plan; w: WS }) {
  const skips = new Set(w.skips[p.id] ?? []), pv = w.preview?.id === p.id ? w.preview : null, ready = previewed(p.id);
  const busy = w.busy === p.id, kept = p.operations.length - skips.size;
  return (
    <article className="ws-card" data-ws-plan={p.id}>
      <h3 className="ws-title">{p.title}</h3>
      {p.reason ? <p className="ws-reason">{p.reason}</p> : null}
      <ul className="ws-ops">
        {p.operations.map((o) => (
          <li key={o.key} className={`ws-op${skips.has(o.key) ? " off" : ""}`} data-ws-op={o.key}>
            <label className="ws-take">
              <input type="checkbox" checked={!skips.has(o.key)} onChange={() => moves.wsSkip(p.id, o.key)} aria-label={`Keep: ${says(o)}`} />
              <span className="ws-t"><b>{says(o)}</b><small>{o.reason}</small>{o.cant && !skips.has(o.key) ? <small className="ws-cant">{o.cant}. Skip it to keep the rest.</small> : null}</span>
            </label>
          </li>
        ))}
      </ul>
      <details className="ws-why">
        <summary>Why this setup?</summary>
        {p.evidence.length ? <ul>{p.evidence.map((e, i) => <li key={i}><b>{e.label}</b> · {whose(e)}{e.claim ? <small>{e.claim}</small> : null}</li>)}</ul>
          : <p>Sol didn’t note why. Treat it as a suggestion, not something it saw you do.</p>}
        <p className="ws-reach">Keeping it only makes and moves folders and stickies. It starts nothing, sends nothing, and changes what no AI may reach.</p>
      </details>
      {pv ? (
        <section className="ws-pv" aria-label="Preview">
          <div className="ws-sub">Preview · not kept yet</div>
          {pv.rows.filter((r) => r.kept).map((r) => <p key={r.key} className={r.cant ? "ws-cant" : undefined}>{r.cant ? `${r.says}: ${r.cant}` : `＋ ${r.says}`}</p>)}
          {pv.why ? <p className="ws-cant">{pv.why}</p> : null}
          <p className="ws-t3">{pv.says || NOTHING_YET}</p>
        </section>
      ) : null}
      {w.why[p.id] ? <p className="ws-cant" role="status">{w.why[p.id]}</p> : null}
      <div className="ws-acts">
        <button className="ws-btn" disabled={busy || !kept} onClick={() => moves.wsPreview(p.id)}>Preview</button>
        <button className="ws-btn pri" disabled={busy || !ready} title={ready ? undefined : "Look at the preview first"} onClick={() => moves.wsKeep(p.id)}>Keep</button>
        <button className="ws-btn" disabled={busy} onClick={() => moves.wsDiscard(p.id)}>Discard</button>
      </div>
    </article>
  );
}
const whose = (e: Evidence) => (e.type === "stated-intent" ? "you said this" : "how Sol read it");
