// What Build made that lives in a Home folder (#1031): the blocks put down on this folder from Build's stage (seated, the
// engine keeps them, cross.ts), drawn as small slabs of their kind with their titles. A press opens the block's session
// in Build; the ring takes it back out of the folder (the block stays on its stage). Under cross only (Place.tsx).
import { hopTo } from "./hop";
import { seatedIn, undoCrossing, useCrossState, did } from "./store";
import { KindMark } from "./marks";

/** #1045: his folders use it too: `head` names it in his words ("LA245 · made in Build"), `quiet` draws nothing while the
 *  folder holds nothing (a job's card); a session put down here opens as itself */
export function MadeHere({ place, head = "made in Build", quiet = false, his = false }: { place: string; head?: string; quiet?: boolean; his?: boolean }) {
  const s = useCrossState();
  const here = seatedIn(s, place);
  if (quiet && !here.length) return null;
  return (
    <div className={`cross-made${his ? " his" : ""}`} data-cross-made={place}>
      {his ? <div className="cross-made-h">{head}</div> : <div className="hplace-h">{head}</div>}
      {here.length === 0 ? <div className="cross-made-none">drag an artifact of Build's stage, or a session from its side, here over the spine's home</div>
        : <div className="cross-made-row">{here.map((c) => (
          <div key={c.id} className="cross-made-slab" data-block={c.block}>
            <button type="button" className="cross-made-open" title={`open ${c.title} in Build`} onClick={() => hopTo("build", c.session)}>
              <KindMark kind={c.blockKind} /><b>{c.title}</b>
            </button>
            <button type="button" className="cross-made-out" aria-label={`take ${c.title} out of this folder`} title="take it out of this folder"
              onClick={() => { undoCrossing(c.id); did(`${c.title} left the folder`, () => {}); }}>×</button>
          </div>
        ))}</div>}
    </div>
  );
}
