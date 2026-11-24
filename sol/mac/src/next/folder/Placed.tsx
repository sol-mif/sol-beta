// Where Sol put this folder, said in its head (BR1 item 4, #1615; three.html "Anything Sol placed says so when you point
// at it, with why"): when what Sol knows holds a placed:<folder> line of Sol's for it, the grey "Sol put it here" with
// the because's chevron; a press unfolds where and why, That's right, and the move back (because/place.ts). A folder the
// person put there, or one Sol never placed, says nothing. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import Because, { knownNow } from "../because/Because.tsx";
import { PLACED_W, placedOf, solPlaced } from "../because/place.ts";
import { useNext } from "../cv/index.ts";
import { samePlace } from "../known.ts";
import "./placed.css";

export default function Placed({ rid }: { rid: string }) {
  // read again on every draw: the engine's next.known comes after the folder opens, and a move back takes the line out
  const k = useNext(() => knownNow().find((x) => solPlaced(x) && samePlace(placedOf(x.k)!, rid))?.k ?? "");
  return k ? <span className="fv-placed"><Because ks={[k]} words={PLACED_W} here={rid} /></span> : null;
}
