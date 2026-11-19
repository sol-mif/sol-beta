// The sidebar's people section (slices 8+9, #1615; merge/shell.js sidePeople and fitSide, P1): the Cowork row and,
// while Cowork or a group is open, up to 5 groups nested under it (the one waiting marked), then "All groups · N"; the
// Social row and, while Social or a friend is open, up to 5 close friends, then "All close · N". The sidebar never
// scrolls: the shell fits it everywhere (round 6 · F2, next/side.ts: "+N more" AIs, then fold-ais, then fold-regions;
// people.css draws the folds).
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { useNext } from "../cv/index.ts";
import { Face } from "./Face.tsx";
import { PEOPLE, circle, items, parg, pk, sortedGroups, st, team } from "./queue.ts";
import "./people.css";


export default function SideRows() {
  const page = useNext((_d, s) => s.page);
  const k = pk(page), a = parg(page), v = PEOPLE[k ?? ""];

  let groups = null, close = null;
  if (v === "cowork") {
    const s = team(), gs = sortedGroups(s), waiting = new Set(items().flatMap((x) => (x.type === "wait" ? [x.g.id] : [])));
    groups = <>{gs.slice(0, 5).map((g) => <a key={g.id} className={`nx-row${k === "group" && a === g.id ? " on" : ""}`} role="button" tabIndex={0} data-act={`page:group:${g.id}`} data-g={g.id}>
      <span className="dotf" style={{ background: g.color }} /><span className="nx-rn">{g.name}</span>{waiting.has(g.id) ? <span className="pk wait" title="waits on you" /> : null}</a>)}
      {s.groups.length > 5 ? <a className="nx-row allrow" role="button" tabIndex={0} data-act="page:cowork" data-allgroups="">All groups · {s.groups.length}</a> : null}</>;
  }
  if (v === "social") {
    const b = st(), cl = circle().friends.filter((f) => !f.waiting && (f.close || b.close.has(f.n)));
    close = <>{cl.slice(0, 5).map((f) => <a key={f.n} className={`nx-row${k === "friend" && a === f.n ? " on" : ""}`} role="button" tabIndex={0} data-act={`page:friend:${f.n}`} data-p={f.n}>
      <Face p={{ h: f.h, n: f.n }} /><span className="nx-rn">{f.n}</span>{f.theirs.ar && f.pres ? <span className={`pk ${f.pres}`} /> : null}</a>)}
      {cl.length > 5 ? <a className="nx-row allrow" role="button" tabIndex={0} data-act="page:social" data-allclose="">All close · {cl.length}</a> : null}</>;
  }
  return (
    <div className="ppl-side">
      <a className={`nx-row${v === "cowork" ? " on" : ""}`} id="coworkrow" role="button" tabIndex={0} data-act="page:cowork">Cowork<span className="nx-k">with others</span></a>
      <div id="sidecowork" className="sidepeople" aria-label="Groups">{groups}</div>
      <a className={`nx-row${v === "social" ? " on" : ""}`} id="socialrow" role="button" tabIndex={0} data-act="page:social">Social<span className="nx-k">friends</span></a>
      <div id="sidesocial" className="sidepeople" aria-label="Close friends">{close}</div>
    </div>
  );
}
