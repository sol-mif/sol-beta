// The pieces a Home folder handed the talk (#1031), over Build's box: each a small slab with its folder's path, waiting
// for the next message, which carries them to the agent (useWork.say, the engine's homeLine). × takes one back.
import { dropPiece, useCrossState } from "./store";

export function Pieces() {
  const { pieces } = useCrossState();
  if (!pieces.length) return null;
  return (
    <div className="cross-pieces" data-cross-pieces>
      {pieces.map((p) => (
        <span key={p.id} className="cross-piece" title={`from Home › ${p.path}${p.knows?.length ? ` · it knows ${p.knows.map((k) => k.label).join(", ")}` : ""}`}>
          <i aria-hidden="true" /><small>{p.path}</small><b>{p.words}</b>
          <button type="button" aria-label={`take ${p.words} back`} onClick={() => dropPiece(p.id)}>×</button>
        </span>
      ))}
    </div>
  );
}
