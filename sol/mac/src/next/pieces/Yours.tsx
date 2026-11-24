// "yours" on the canvas (round 6 · M3, #1615; merge/pieces.js VIEWS.yours): a piece of your own in use, where the plane
// draws its folder. Far: a "yours" tag at the start of the folder card's small line (· N when there are more). Middle:
// a line under the head, each piece by name, then what of Sol's it stands in for. Nothing when the folder has none.
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { useNext } from "../cv/index.ts";
import { forShort, yoursIn } from "./model.ts";
import "./pieces.css";

export default function Yours({ rid, band }: { rid: string; band: "far" | "middle" }) {
  const xs = useNext(() => yoursIn(rid));
  if (!xs.length) return null;
  if (band === "far") return <span className="yours cu-tag" data-yours={xs.map((x) => x.id).join(" ")} title={xs.map((x) => x.n).join(", ")}>yours{xs.length > 1 ? " · " + xs.length : ""}</span>;
  return (
    <div className="cu-here">
      {xs.map((x) => <span key={x.id} className="yours" data-yours={x.id}>{x.n}</span>)}
      <span className="cu-for">your own here, for Sol’s {xs.map(forShort).join(", ")}</span>
    </div>
  );
}
