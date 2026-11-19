// A Home block lifted to the stage (#692 suite step 1, sticky.html's fourth form): a page block at sol://home/block/<id>.
// A block whose recipe has its own shape (shapes.ts: a tracker, a deck, a week…) draws that shape's inside, wide (Marco
// 2026-11-08). A sticky, or a made recipe with no shape, is the sticky made into work: two tools side by side (the one it
// had and the next; a second tool was the signal to lift). Either way its shelf carried over (the folder's and its own),
// and its ring. "back to a sticky" folds it into
// Home again (the block here says so and stays until the stage's own close takes it off). Home's socket as HomeBlock's.
import type { Metas } from "../../meta";
import { useBlockWire } from "../HomeBlock";
import { useHome2, type Tool } from "../pass2";
import { liftedInside } from "./grammar";
import { foldHome } from "./lift";
import { RingOf, Shelf, Words } from "./Piece";
import { SHAPES } from "./shapes";
import { ToolPane } from "./Tools";
import "./suite.css";

export const meta = {
  Lifted: {
    job: "a Home block lifted to the stage: its words, its shape's own inside (or a sticky's two tools side by side), its shelf, its ring; back to a sticky",
    flow: "show",
    states: ["engine down", "reading", "gone from Home", "lifted: its shape's inside", "lifted: two tools", "folded back to a sticky"],
    keys: [
      { press: "its hand's pill (two tools)", does: "passes the tool between its hand and yours (home.block.patch hand)" },
      { press: "the shape's own moves", does: "as in Home: a tracker's column, a deck's card, a week's dashed block" },
      { press: "back to a sticky", does: "folds it into Home again (home.block.lift to home)" },
      { press: "press the ring", does: "done, or running again (home.block.patch done)" },
    ],
    listens: ["home.state › blocks, recipes, folders"],
  },
} satisfies Metas;

export function Lifted({ id }: { id: string }) {
  const h = useHome2(useBlockWire());
  const st = h.st;
  if (!st) return <p className="st-note">{h.up ? "reading Home…" : "Home's engine is not answering"}</p>;
  const b = st.blocks?.find((x) => x.id === id);
  if (!b) return <p className="st-note">this block is no longer in Home</p>;
  const s = b.sticky ? st.stickies?.find((x) => x.id === b.sticky) : undefined;
  const f = st.folders?.find((x) => x.id === b.folder);
  const Own = liftedInside(b.recipe, (id) => id in SHAPES) === "shape" ? SHAPES[b.recipe] : null;
  const r = st.recipes?.find((x) => x.id === b.recipe && (!x.folder || x.folder === b.folder)) ?? st.recipes?.find((x) => x.id === b.recipe);
  const first: Tool = b.tool ?? "browser";
  const second: Tool = (b.own.map((o) => o.from).find((t): t is Tool => t !== first && ["browser", "write", "list", "calendar", "ask"].includes(t))) ?? (first === "write" ? "list" : "write");
  const patch = (o: object) => h.send({ type: "home.block.patch", id: b.id, ...o });
  return (
    <div className="pc-lifted" data-pc-lifted={b.id} data-lifted={b.lifted?.to ?? "home"}>
      <div className="pc-lifted-head">
        <RingOf state={b.state} onPress={() => patch({ done: b.state !== "done" })} />
        <b><Words b={b} h={h} /></b>
        <span className="pc-lifted-what">{f ? f.crumb.join(" › ") : "Home"} · {Own ? `a ${r?.name ?? b.recipe} block` : "a block"}, a session behind it</span>
        {b.lifted ? <button type="button" className="pc-act quiet" data-pc-back onClick={() => foldHome(b, h)}>back to a sticky</button> : <span className="pc-lifted-what">folded back into Home</span>}
      </div>
      {Own ? (
        <div className="pc-lifted-own" data-pc-lifted-inside={b.recipe}>
          <Own b={b} r={r} h={h} st={st} setPlace={() => {}} />
        </div>
      ) : (
        <div className="pc-cols" data-pc-lifted-inside="tools">
          <ToolPane b={b} s={s} st={st} tool={first} wide onHand={(hand) => patch({ hand })} />
          <ToolPane b={b} s={s} st={st} tool={second} wide onHand={(hand) => patch({ hand })} />
        </div>
      )}
      <Shelf b={b} st={st} />
    </div>
  );
}
