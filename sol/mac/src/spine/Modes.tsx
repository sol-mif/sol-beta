// The views that have no insides yet (Marco 2026-11-07): Social today. Each is a side and a core, empty, so a function
// can land in it one at a time (mine/look/functions/board.html). Home is Home's folders (home/folders/FolderHome.tsx),
// Build is home/Home.tsx, Cowork is cowork/CoworkApp.tsx.
import { useEffect, useState } from "react";
import { Frame, Head } from "../kit/Chrome";
import "./spine.css";

export function EmptyView({ name, side, cards }: { name: string; side: { h: string; rows: string[] }[]; cards: { k: string; t: string }[] }) {
  const key = `sol.side.${name}`;
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== "0");
  const flip = () => setOpen((o) => { localStorage.setItem(key, o ? "0" : "1"); return !o; });
  // the one key every mode answers the same way (kit/Chrome.tsx): cmd+\ folds and opens the side
  useEffect(() => {
    const down = (ev: KeyboardEvent) => { if (ev.metaKey && !ev.shiftKey && ev.key === "\\") { ev.preventDefault(); flip(); } };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame className="ev" open={open} head={<Head side={{ open, onFlip: flip }} title={name} where="nothing here yet" />}
      side={<div className="ev-side">
        {side.map((g) => (
          <div key={g.h}><div className="ev-h">{g.h}</div>{g.rows.length === 0 && <div className="ev-none">none yet</div>}{g.rows.map((r) => <div key={r} className="ev-row"><i /> {r}</div>)}</div>
        ))}
      </div>}>
      <section className="ev-core" data-place="talk">
        <p className="ev-lead">This view is empty on purpose. Each of its functions lands alone, then gets its piece of UI.</p>
        <div className="ev-cards">{cards.map((c) => <div key={c.k} className="ev-card"><b>{c.k}</b>{c.t}</div>)}</div>
      </section>
    </Frame>
  );
}

export const SocialView = () => (
  <EmptyView name="social"
    side={[{ h: "people", rows: [] }, { h: "groups", rows: [] }]}
    cards={[{ k: "lend your Claude", t: "a time and a budget; take it back any moment" }, { k: "plans you vote on", t: "the agents gather, you vote, it lands in your calendar" }, { k: "friends as jellies", t: "whose agent is busy, at a glance" }]} />
);
