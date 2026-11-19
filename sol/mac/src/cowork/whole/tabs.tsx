// Cowork, whole (#1173): the anchor's tabs, each a part on its own so a session's stage can carry it later. The reads
// are the engine's (engine/src/team/cowork-shell.ts); each tab says plainly when the engine could not read.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Systems } from "../../stage/kinds/Systems";   // the whole of Jelly, the cluster map (#1193)
import { Pill } from "../../kit";   // the map or the overview (#1416)
import type { Block } from "../../stage/model";
import { askEngine } from "../askEngine";
import { outLabel, useOut } from "./out";   // a row's page opens in the app, as a layer of the place (#1416)
import { nameChildren, place, type Place } from "./place";
import { PeopleCards, usePeople } from "../People";   // People (#1297): a card each

// ---- the reads ----

export type ForYouItem = { what: string; ask: string; url?: string; kind: "try" | "decide" };
export type ForYouRead = { me: string; items: ForYouItem[] };
type Held = { n: number; title: string; url?: string; draft?: boolean };
type WhoRead = { neglected: (Held & { days: number; holder: string })[] };
type GuardRead = { log: boolean; rows: { rule: string; what: string; held: number; let: number }[]; strict: string[] };
export type Read<T> = { data: T | null; error: string; busy: boolean; again: () => void };

/** one read of the engine's cowork.shell.read, asked when the tab opens and on "read again" */
export function useRead<T>(what: string): Read<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let gone = false;
    setBusy(true);
    void askEngine("cowork.shell.read", { what }, 45_000).then((r: any) => {
      if (gone) return;
      setBusy(false);
      if (r?.error) { setError(r.error === "not connected" ? "Jelly's engine is not running" : r.error); return; }
      setError(""); setData(r as T);
    });
    return () => { gone = true; };
  }, [what, n]);
  const again = useCallback(() => setN((x) => x + 1), []);
  return { data, error, busy, again };
}

/** one read shared by everyone who asks for it while it is on screen (the rail's count and the tab), asked once */
const shared = new Map<string, { r: Omit<Read<unknown>, "again">; subs: Set<() => void> }>();
function sharedOf(what: string) {
  let s = shared.get(what);
  if (!s) { s = { r: { data: null, error: "", busy: true }, subs: new Set() }; shared.set(what, s); }
  return s;
}
function askShared(what: string) {
  const s = sharedOf(what);
  s.r = { ...s.r, busy: true }; s.subs.forEach((f) => f());
  void askEngine("cowork.shell.read", { what }, 45_000).then((r: any) => {
    s.r = r?.error ? { data: s.r.data, busy: false, error: r.error === "not connected" ? "Jelly's engine is not running" : r.error } : { data: r, error: "", busy: false };
    s.subs.forEach((f) => f());
  });
}
export function useShared<T>(what: string): Read<T> {
  const s = sharedOf(what);
  // the first one on screen asks again (Cowork opened anew reads anew); the others share it
  const sub = useCallback((f: () => void) => { if (s.subs.size === 0) askShared(what); s.subs.add(f); return () => { s.subs.delete(f); }; }, [s, what]);
  const r = useSyncExternalStore(sub, () => s.r);
  const again = useCallback(() => askShared(what), [what]);
  return { ...(r as Read<T>), again };
}

function Page({ lead, children }: { lead: string; children: ReactNode }) {
  return <div className="cw-pad"><p className="cw-lead">{lead}</p>{children}</div>;
}
function State<T>({ r, children }: { r: Read<T>; children: (d: T) => ReactNode }) {
  if (r.data) return <>{children(r.data)}</>;
  if (r.busy) return <p className="cw-dim">reading…</p>;
  return <p className="cw-dim">Could not read this: {r.error}. <button className="cw-link" data-act="read again" onClick={r.again}>read again</button></p>;
}

// ---- ANCHOR · For you ----

/** the first few: the anchor is for the big decisions, and the rest is one press away */
const FIRST = 6;
export const useForYouCount = () => useShared<ForYouRead>("foryou").data?.items.length ?? 0;
export function ForYou() {
  const r = useShared<ForYouRead>("foryou");
  const open = useOut();
  const [all, setAll] = useState(false);
  return (
    <Page lead="Only what is yours to decide, said as what it does for people who use Jelly.">
      <State r={r}>{(d) => d.items.length === 0
        ? <div className="cw-empty"><b>Nothing waits on you.</b><span>When a change needs your yes, or a decision is yours, it shows here.</span></div>
        : <>{(all ? d.items : d.items.slice(0, FIRST)).map((x, i) => (
          <div key={i} className="cw-card">
            <p>{x.what}</p>
            <div className="cw-row"><span className="cw-dim">{x.ask}</span>
              {x.url && <button className="cw-btn" data-layer="page" onClick={() => open(x.url!, outLabel(x.what))}>{x.kind === "try" ? "Try it, then decide" : "Decide"}</button>}</div>
          </div>
        ))}
        {d.items.length > FIRST && <button className="cw-link" data-act="all or fewer" onClick={() => setAll((a) => !a)}>{all ? "fewer" : `all ${d.items.length}`}</button>}</>}
      </State>
    </Page>
  );
}

// ---- JELLY · System ----

const JELLY_BLOCK = { id: "cowork-system", kind: "systems", title: "Jelly, the whole", state: "live", versions: [], sessions: [] } as unknown as Block;
/** the whole of Jelly, full size: the systems kind (#1193), the cluster map; the five lanes are design's, a press inside it.
 *  Its zoom (a cluster) and its pick (a part in it) are the place's path (#1416): an address, on the history */
export function SystemMap({ path = [] }: { path?: string[] }) {
  return (
    <div className="cw-map" data-part="system">
      <Systems b={JELLY_BLOCK} body={{}} act={() => {}} at={{ path, go: place.path, names: (n) => nameChildren("system", n) }} />
    </div>
  );
}
const SYSTEM_AS = ["Visualization", "Overview"] as const;
/** System: the map, or the team at a glance (the mockup's switch, at the view's top right) */
export function SystemPart({ at }: { at: Place }) {
  const [view, setView] = useState<0 | 1>(0);
  return (
    <div className="cw-sys">
      {view === 0 ? <SystemMap path={at.path} /> : <Overview />}
      <div className="cw-as" data-act="the map or the overview"><Pill words={SYSTEM_AS} picked={view} h={24} onPick={(i) => setView(i as 0 | 1)} /></div>
    </div>
  );
}
/** the overview: the team strip of #1171 mounts here once it is on main */
export function Overview() {
  return (
    <div className="cw-pad" data-mount="overview">
      <div className="cw-empty"><b>The team at a glance comes here.</b>
        <span>Which release each of you runs, how far each is from it, and what moves today. It arrives with the team strip.</span></div>
    </div>
  );
}

// ---- JELLY · Agents' room: the group's chat (#1417, RoomChat.tsx; it was #1298's three layers) ----
export { RoomChat as Room } from "./RoomChat";

// ---- JELLY · People (#1297) ----

/** People: a card each (cowork/People.tsx, from the engine's people read), and under them the work nobody touched in
 *  three days or more (the who read's neglected; its old person row is gone, the cards say it) */
export function People() {
  const p = usePeople();
  const r = useRead<WhoRead>("who");
  const open = useOut();
  const [all, setAll] = useState(false);
  return (
    <Page lead="What each of you holds, what waits on you, what your agents have in flight, and what landed today. Open a card for the whole of it.">
      {p.data ? <PeopleCards r={p.data} again={p.again} />
        : p.busy ? <p className="cw-dim">reading…</p>
        : <p className="cw-dim">Could not read this: {p.error}. <button className="cw-link" data-act="read again" onClick={p.again}>read again</button></p>}
      <State r={r}>{(d) => (
        <>
          <p className="cw-k cw-top">neglected · {d.neglected.length}</p>
          {d.neglected.length === 0 ? <p className="cw-dim">Nothing is left alone.</p> : (
            <table className="cw-table"><tbody>
              {(all ? d.neglected : d.neglected.slice(0, 8)).map((x) => (
                <tr key={x.n}><td>{x.url ? <button className="cw-item" data-layer="page" onClick={() => open(x.url!, outLabel(`#${x.n} ${x.title}`))}>{x.title}</button> : <span className="cw-item">{x.title}</span>}</td>
                  <td className="cw-dim">{x.holder}</td><td className="cw-dim">{x.days} days</td></tr>
              ))}
            </tbody></table>
          )}
          {d.neglected.length > 8 && <button className="cw-link" data-act="all or fewer" onClick={() => setAll((a) => !a)}>{all ? "fewer" : `all ${d.neglected.length}`}</button>}
        </>
      )}</State>
    </Page>
  );
}

// ---- JELLY · Guardrails ----

export function Guardrails() {
  const r = useRead<GuardRead>("guard");
  return (
    <Page lead="Strict where it matters, out of the way elsewhere. What the guard held and let through today, on this machine.">
      <State r={r}>{(d) => (
        <>
          {d.log && d.rows.length > 0 ? (
            <table className="cw-table">
              <thead><tr><th>Today</th><th>What</th><th>Times</th></tr></thead>
              <tbody>{d.rows.map((x) => (
                <tr key={x.rule}><td className={x.held ? "cw-held" : "cw-let"}>{x.held ? "held" : "let through"}</td><td>{x.what}</td>
                  <td className="cw-dim">{x.held ? `${x.held} held` : ""}{x.held && x.let ? " · " : ""}{x.let ? `${x.let} let through` : ""}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="cw-dim">{d.log ? "The guard held nothing today." : "This machine keeps no log of the guard."}</p>}
          <p className="cw-k cw-top">always held</p>
          <ul className="cw-carried">{d.strict.map((s) => <li key={s}>{s}</li>)}</ul>
        </>
      )}</State>
    </Page>
  );
}
