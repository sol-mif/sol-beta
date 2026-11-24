// Beside at Near (#1615, slice 3; map.md #24, the mockup's views/near.js sideHTML): two pieces side by side (⌘\, the
// shared M.beside), each with its line saying which is here, which beside and where the keys go (⌥⌘← / ⌥⌘→ move
// them). One side draws the piece by its kind: a split job's parts, a code session, side copies, arrivals, a page.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { D, S, isFolderDiary, type Piece } from "../cv/index.ts";
import { Slot } from "../slots.ts";
import { PREFIX as AUTO } from "../auto/model.ts";
import { find } from "./runs.ts";
import { titleOf } from "../plane/layout.ts";   // BR1 (#1615): a session reads as its task, never its AI
import { Session } from "./Session.tsx";
import { Parts } from "./Parts.tsx";
import { Arrivals, Copies, LifePiece } from "./Piece.tsx";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;

/** one piece drawn by its kind */
export function One({ pid, keysHere, beside, width }: { pid: string; keysHere: boolean; beside: boolean; width: number }) {
  const p: Piece | undefined = D.pieces[pid] || find(pid)?.p;
  if (!p) return null;
  if (p.kind === "session" && p.parts && p.parts.length && !p.part) return <Parts p={p} width={width} />;
  if (p.kind === "session") return <Session p={p} keysHere={keysHere} beside={beside} width={width} />;
  if (p.kind === "copies") return <Copies p={p} />;
  if (p.kind === "arrivals") return <Arrivals p={p} />;
  // BR1 slots (#1615): an automation's piece and a folder's own Diary are drawn by their own slices, up close
  if (p.id.startsWith(AUTO)) return <div className="nr-auto"><Slot name="automation" id={p.id} band="middle" /></div>;
  if (p.kind === "diary" && isFolderDiary(p.id)) return <Slot name="diary" scope={p.region} band="middle" part="near" />;
  return <LifePiece p={p} keysHere={keysHere} />;
}

/** a side of Near: the piece, and with beside open, the line that says which side has the keys */
export function Side({ pid, main, two, width }: { pid: string; main: boolean; two: boolean; width: number }) {
  const keys = main === (S.keysSide !== "beside"), bp = D.pieces[pid] || find(pid)?.p;
  return (
    <div className={`nr-side${two ? " nr-two" : ""}`}>
      {two && bp ? (
        <div className="nr-tagline"><b>{main ? "Here" : "Beside"}</b> · {bp.kind === "session" ? titleOf(bp) : bp.name}
          {keys ? " · your keys go here" : <> · <Kbd t={main ? "⌥⌘←" : "⌥⌘→"} /> to type here</>}</div>
      ) : null}
      <One pid={pid} keysHere={keys} beside={!main} width={width} />
    </div>
  );
}
