// A project's fold in the sidebar as a landing place (fr-30, slice 1): the crossing card flies into this mark, and what
// I sent there this sitting shows as +N beside it. Mine, so never the accent; the mark pulses as a thing lands.
import { useV3 } from "./store";
import "./v3.css";

export default function RowMark({ room }: { room: string }) {
  const n = useV3().fresh[room] ?? 0;
  return <span className="v3-land" title={n ? `${n} sent from Home just now` : "things you send to this project land here"}>{n > 0 && <small className="v3-fresh">+{n}</small>}</span>;
}
