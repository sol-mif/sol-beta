// The stack's inside (#692 suite step 2, suite.html: "a row, in order"): the folder's list, the next one lit, done in
// turn by its run, which stops only at a gate (an ask block takes the question). Drawn inside Piece's own card; the run
// and the moves are the stand-in's suite-stack.mjs.
//   pull to the top   home.stack.pull: it is next
//   peel one off      home.stack.peel: a sticky of its own in the same folder (its run starts)
//   press its mark    home.stack.done: ticked by hand; the next one lights
import type { Metas } from "../../meta";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./stack.css";

export const meta = {
  Stack: {
    job: "a folder's things in a row, in order, the next one lit; done in turn, asking only at a gate",
    flow: "know",
    states: ["its run laying it out", "one lit, the rest waiting", "stopped at a gate: an ask block holds it", "one held for your hand", "all done"],
    keys: [
      { press: "to the top", does: "pulls it first; it is next (home.stack.pull)" },
      { press: "peel off", does: "makes it a sticky of its own in the same folder (home.stack.peel)" },
      { press: "its mark", does: "ticks it by hand; the next one lights (home.stack.done)" },
    ],
    listens: ["home.state › blocks (its body: items)"],
  },
} satisfies Metas;

export type StackItem = { id: string; text: string; state: "done" | "next" | "todo" | "held"; gate?: string; sticky?: string; asked?: string | boolean; held?: string };
type StackBody = { items: StackItem[]; by?: string };

const SAYS: Record<StackItem["state"], string> = { done: "done", next: "next: its run is on it", todo: "waiting its turn", held: "held for your hand" };

export function Stack({ b, r, h, st }: ShapeProps) {
  const body = b.body as StackBody | null;
  if (!body?.items) return <p className="pc-step">{r ? `its run: ${r.run}` : "its run is laying it out"}…</p>;
  const items = body.items, done = items.filter((x) => x.state === "done").length;
  const folder = st.folders?.find((f) => f.id === b.folder)?.name ?? "its folder";
  const send = <T,>(o: object) => h.ask<T & { error?: string }>({ id: b.id, ...o });
  const pull = (it: StackItem) => { void send({ type: "home.stack.pull", item: it.id }); say(`to the top: ${it.text} is next`); };
  const peel = (it: StackItem) => { void send({ type: "home.stack.peel", item: it.id }).then((x) => say(x?.error ?? `peeled off: a sticky of its own in ${folder}`)); };
  const tick = (it: StackItem) => { if (it.state !== "done") { void send({ type: "home.stack.done", item: it.id }); say(`ticked by hand: ${it.text}`); } };
  return (
    <div className="stk" data-pc-inside="stack" onPointerDown={(e) => e.stopPropagation()}>
      <ol className="stk-list">
        {items.map((it) => (
          <li key={it.id} className={`stk-row ${it.state}`} data-stack-item={it.id} data-state={it.state}>
            <button type="button" className="stk-mark" aria-label={`${SAYS[it.state]}: press to tick it`} title={SAYS[it.state]} onClick={(e) => { e.stopPropagation(); tick(it); }} />
            <span className="stk-text" title={it.held ? `${it.text} · you said: ${it.held}` : it.text}>{it.text}</span>
            {it.gate && it.state !== "done" && <span className="stk-gate" title={it.gate} data-stack-gate>{it.asked && b.state === "asks" && it.state === "next" ? "asks you" : "asks first"}</span>}
            {it.state !== "done" && (
              <span className="stk-acts">
                {it.state !== "next" && <button type="button" className="pc-act quiet" data-stack-pull onClick={(e) => { e.stopPropagation(); pull(it); }}>to the top</button>}
                <button type="button" className="pc-act quiet" data-stack-peel onClick={(e) => { e.stopPropagation(); peel(it); }}>peel off</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="stk-foot">{done} of {items.length} done{body.by ? ` · laid out by ${body.by}` : ""}</p>
    </div>
  );
}
