// A new session's opening (#700, the issue: "the last ledger lines folded under the jelly's first line"): the session
// opened on the project's open blocks (folded, as chips) and the project's last ledger lines, which the engine kept in
// its stage.json (blocks.ts start). Folded, one line at the top of the talk (#734): how many lines, and where it came
// from; a click opens them under it, oldest first, each naming its block. Nothing to hand-write to hand over.
import { useCallback, useState, useSyncExternalStore } from "react";
import type { StageStore } from "./store";
import { named, nameOf } from "./carry";

const hhmm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function StartLines({ store, session }: { store: StageStore; session: string }) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const [open, setOpen] = useState(false);
  const st = seen.stage.start;
  if (!st?.lines.length) return null;
  const chips = seen.stage.blocks.filter((p) => p.folded).length;
  const said = `${st.lines.length} last line${st.lines.length > 1 ? "s" : ""}${st.from ? ` from "${nameOf(st.from)}"` : " of the project"}${chips ? ` · ${chips} open artifact${chips > 1 ? "s" : ""} folded below` : ""}`;
  return (
    <div className="st-start">
      <button tabIndex={-1} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "fold" : said}</button>
      {open && (
        <div className="st-startlines" role="list">
          {st.lines.map((l, i) => <div key={i} role="listitem">{hhmm(l.at)} <i>{l.title}</i> · {named(l.note ? `${l.ev} · ${l.note}` : l.ev)} · {l.by}</div>)}
        </div>
      )}
    </div>
  );
}
