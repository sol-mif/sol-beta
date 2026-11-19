// The pile as a Home block (#692 suite step 2, suite.html "pile · by folder: a tree"): the folder tree drawn inside the
// frame. Nested cards, one per folder its run read (shape-pile.mjs), each with the line the run wrote on what it holds
// and its counts, live from home.state (stickies open, waiting on you, made, things in its context). Under them the
// loose things the run found, each with where it belongs and why. Moves: drop anything on a folder's card to file it
// there (a sticky or block: home.block.patch folder, its swap line; a loose thing: home.pile.block.file); press file on a
// loose thing to file it where the run said, or leave to let it be; a folder's name opens it; "again" runs it again.
import { useState, type DragEvent } from "react";
import type { Metas } from "../../meta";
import type { Folder, HomeState2 } from "../pass2";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./shape-pile.css";

export const meta = {
  PileShape: {
    job: "the folder tree inside a Home block: nested cards with their counts, the loose things and where each belongs",
    flow: "know",
    states: ["its run reading the folders", "the tree (wide: columns; narrow: one column)", "a folder lit under a drag", "loose things", "nothing loose"],
    keys: [
      { press: "drop a sticky, a block or a loose thing on a folder", does: "files it there (home.block.patch folder · home.pile.block.file)" },
      { press: "file on a loose thing", does: "files it where the run said, making the folder first when it named a new one" },
      { press: "leave on a loose thing", does: "it stays where it is (home.pile.block.leave)" },
      { press: "a folder's name", does: "opens the folder" },
      { press: "again", does: "its run reads the folders again (home.block.run)" },
    ],
    listens: ["home.state › blocks (its body), folders, stickies, made, context"],
  },
} satisfies Metas;

export type PileNode = { id: string; name: string; line: string; kids: PileNode[] };
export type Loose = { id: string; name: string; kind: "file" | "sticky"; from: string; to: string | null; toName: string; why: string; sticky?: string; make?: boolean };
export type PileBody = { root: string | null; tree: PileNode[]; loose: Loose[]; by?: string };

/** a folder's counts, live: its stickies still open and waiting on him, its made things, its context, its subtree's included */
export function countsOf(fid: string, st: HomeState2) {
  const fs = st.folders ?? [], ids = new Set([fid]);
  for (let grew = true; grew;) { grew = false; for (const f of fs) if (f.parent && ids.has(f.parent) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }
  const sk = (st.stickies ?? []).filter((s) => ids.has(s.folder) && !["done", "dropped"].includes(s.state));
  return {
    open: sk.length, waits: sk.filter((s) => s.state === "asks").length,
    made: (st.made ?? []).filter((m) => ids.has(m.folder)).length,
    things: [...ids].reduce((a, id) => a + (st.context?.[id]?.length ?? 0), 0),
  };
}
const countLine = (c: ReturnType<typeof countsOf>) => [c.waits ? `${c.waits} wait on you` : "", c.open ? `${c.open} open` : "", c.made ? `${c.made} made` : "", `${c.things} thing${c.things === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

export function PileShape({ b, r, st, h, setPlace }: ShapeProps) {
  const p = b.body as PileBody | null;
  const [over, setOver] = useState<string | null>(null);
  if (!p?.tree) return <p className="pc-step" data-pp-running>its run: {r?.run ?? "reading the folders"}…</p>;
  const root = st.folders?.find((f) => f.id === p.root);

  const ask = async (type: string, o: object) => {
    const res = await h.ask<{ said?: string; swap?: string; error?: string }>({ type, ...o });
    say(res.error ?? res.said ?? res.swap ?? "");
  };
  const kinds = (e: DragEvent) => e.dataTransfer.types.includes("text/sol-sticky") || e.dataTransfer.types.includes("text/sol-loose");
  const onOver = (e: DragEvent, f: PileNode) => { if (!kinds(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; if (over !== f.id) { setOver(f.id); say(`let go: filed in ${f.name}`); } };
  const onDrop = (e: DragEvent, f: PileNode) => {
    const loose = e.dataTransfer.getData("text/sol-loose"), sticky = e.dataTransfer.getData("text/sol-sticky");
    setOver(null);
    if (!loose && (!sticky || sticky === b.id)) return;
    e.preventDefault(); e.stopPropagation();
    if (loose) void ask("home.pile.block.file", { id: b.id, loose, to: f.id });
    else void ask("home.block.patch", { id: sticky, folder: f.id });
  };

  const card = (n: PileNode, depth: number) => {
    const f: Folder | undefined = st.folders?.find((x) => x.id === n.id);
    return (
      <div key={n.id} className={`pp-card d${Math.min(depth, 2)}${over === n.id ? " over" : ""}`} data-pp-folder={n.id} data-pp-name={n.name}
        onDragOver={(e) => onOver(e, n)} onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === n.id ? null : o)); }} onDrop={(e) => onDrop(e, n)}>
        <span className="pp-top">
          <button type="button" className="pp-name" onClick={(e) => { e.stopPropagation(); if (f) setPlace({ at: "folder", id: f.id }); }}>{n.name}</button>
          <span className="pp-counts" data-pp-counts>{countLine(countsOf(n.id, st))}</span>
        </span>
        <span className="pp-line">{n.line}</span>
        {n.kids.length > 0 && <div className="pp-kids">{n.kids.map((k) => card(k, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="pp" data-pc-inside="pile" onPointerDown={(e) => { if ((e.target as Element).closest(".pp-card, .pp-loose")) e.stopPropagation(); }}>
      <div className="pp-head">
        <span className="pp-root">{root ? root.crumb.join(" › ") : "your folders"}</span>
        <span className="pp-what">{p.tree.length} folder{p.tree.length === 1 ? "" : "s"}{p.by ? ` · by ${p.by}` : ""}</span>
        <button type="button" className="pc-act quiet" data-pp-again disabled={b.state === "running"} onClick={(e) => { e.stopPropagation(); h.send({ type: "home.block.run", id: b.id }); say("its run reads the folders again"); }}>{b.state === "running" ? "reading…" : "again"}</button>
      </div>
      <div className="pp-tree">{p.tree.map((n) => card(n, 0))}</div>
      <div className="pp-loose-list" data-pp-loose-list>
        <span className="pp-k">{p.loose.length ? `loose · ${p.loose.length}` : "nothing loose"}</span>
        {p.loose.map((x) => (
          <div key={x.id} className="pp-loose" data-pp-loose={x.id} draggable
            onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/sol-loose", x.id); e.dataTransfer.effectAllowed = "move"; }}>
            <span className="pp-loose-name" title={x.name}>{x.name}</span>
            <span className="pp-to">→ {x.toName}{x.make ? " (new)" : ""}</span>
            <span className="pp-why" title={x.why}>{x.why}</span>
            <span className="pp-acts">
              <button type="button" className="pc-act lit" data-pp-file onClick={(e) => { e.stopPropagation(); void ask("home.pile.block.file", { id: b.id, loose: x.id }); }}>file</button>
              <button type="button" className="pc-act quiet" data-pp-leave onClick={(e) => { e.stopPropagation(); void ask("home.pile.block.leave", { id: b.id, loose: x.id }); }}>leave</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
