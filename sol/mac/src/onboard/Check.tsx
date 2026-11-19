// Checking each folder (#1423, drawn at mine/look/onboarding/folder-check.html): one card over Home, one new folder at a
// time. Its things are rows; a press crosses one out ("over"), a second press brings it back; an unsure one is ringed
// and asks its own question. "Anything missing?" takes one sentence for this folder. "<folder> is right" writes the
// folder's answers (checked.ts afterCheck, through OneHome's `onRight`) and opens the next; "check later" writes the
// folder into `later` (`onLater`), so Home keeps it ringed and a reload does not ask it again. After the last folder, one line and "open my Home" (none for one folder, or when all were put off). The same card opens again for
// a folder "+" makes. What the rows mean is checked.ts's; the writes are OneHome's.
import { useEffect, useState } from "react";
import { questionOf, rowsOf } from "./checked";
import type { Record } from "./record";
import type { Confirm } from "./sort";

type Area = Record["areas"][number];
export function Check({ rec, areas, open, onRight, onLater, onDone }: {
  rec: Record; areas: readonly Area[]; open: readonly Confirm[];
  onRight: (area: string, over: ReadonlySet<string>, said: string) => Promise<boolean>; onLater: (area: string) => void; onDone: () => void;
}) {
  const [at, setAt] = useState(0), [over, setOver] = useState<Set<string>>(new Set()), [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false), [tally, setTally] = useState({ out: 0, added: 0 }), [later, setLater] = useState<string[]>([]);
  const next = () => { setAt((i) => i + 1); setOver(new Set()); setSaid(""); };
  const pills = <div className="osc-pills">{areas.map((a, i) => <span key={a.id} className={`osc-pill ${i === at ? "on" : later.includes(a.id) ? "later" : i < at ? "done" : ""}`}>{a.name}</span>)}</div>;
  // one folder (a "+" one), or all of them put off: no closing line; Home's tile and rings say it
  const allLater = at >= areas.length && (areas.length === 1 || later.length === areas.length);
  useEffect(() => { if (allLater) onDone(); }, [allLater, onDone]);
  if (allLater) return null;
  if (at >= areas.length) return (
    <div className="osc" data-check="end">
      {pills}
      <div className="osc-end">
        <b>{later.length ? "The rest is checked." : "Your Home is checked."}</b>
        <p>{later.length ? `${areas.filter((x) => later.includes(x.id)).map((x) => x.name).join(", ")} ${later.length === 1 ? "waits" : "wait"} in Home with a ring; opening ${later.length === 1 ? "it" : "one"} checks it.` : "Everything in it is something you still do."} I’ll ask again when a folder changes, never all at once.</p>
        <div className="osc-tally"><span>{areas.length === 1 ? "one folder" : `${areas.length} folders`}</span>{tally.out > 0 && <span>{tally.out} crossed out</span>}{tally.added > 0 && <span>{tally.added} added</span>}{later.length > 0 && <span>{later.length} for later</span>}</div>
        <button type="button" className="ob1-btn pearl" data-check-done onClick={onDone}>open my Home</button>
      </div>
    </div>
  );
  const a = areas[at], rows = rowsOf(rec, a.id, open), unsure = rows.filter((r) => r.unsure), sure = rows.filter((r) => !r.unsure);
  const flip = (id: string) => setOver((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (r: (typeof rows)[number]) => {
    const o = over.has(r.id);
    return (
      <button key={r.id} type="button" className={`osc-row ${r.unsure ? "unsure" : ""} ${o ? "out" : ""}`} data-row={r.id} data-out={o || undefined} onClick={() => flip(r.id)}>
        <span className="osc-mk">{o ? "–" : r.unsure ? "?" : "✓"}</span>
        <span className="osc-txt"><b>{r.t}</b><small>{r.s}</small></span>
        <span className="osc-act">{o ? "bring back" : r.unsure ? "still yours?" : "over"}</span>
      </button>
    );
  };
  const right = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onRight(a.id, over, said);
    setBusy(false);
    if (!ok) return;   // not written: OneHome said so; the card stays as it was
    setTally((t) => ({ ...t, out: t.out + over.size, added: t.added + (said.trim() ? 1 : 0) }));
    next();
  };
  return (
    <div className="osc" data-check={a.id}>
      {pills}
      <div className="osc-head"><h3>{a.name}</h3><p>{rows.length ? `${questionOf(a.part)} Press anything that’s over.` : "I found nothing for it yet. Anything to start it with?"}</p></div>
      <div className="osc-list">
        {unsure.length > 0 && <div className="osc-gap">not sure about</div>}
        {unsure.map(row)}
        {unsure.length > 0 && sure.length > 0 && <div className="osc-gap">what I found</div>}
        {sure.map(row)}
      </div>
      <label className="osc-miss"><span>Anything missing?</span><input key={a.id} value={said} onChange={(ev) => setSaid(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") void right(); }} placeholder="one sentence" autoFocus={!rows.length} data-check-said /></label>
      <div className="osc-added">{said.trim() ? `+ ${said.trim()} · I’ll add it to ${a.name}` : ""}</div>
      <div className="osc-foot">
        <button type="button" className="ob1-btn pearl" data-check-right disabled={busy} onClick={() => void right()}>{busy ? "saving…" : `${a.name} is right`}</button>
        <button type="button" className="ob-quiet" data-check-later onClick={() => { onLater(a.id); setLater((l) => [...l, a.id]); next(); }}>check later</button>
        <span className="osc-count">{at + 1} of {areas.length}</span>
      </div>
    </div>
  );
}
