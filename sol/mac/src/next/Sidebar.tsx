// The sidebar of the new face, from the frame drawing (#1879 step 1; decisions.md 2026-11-25, "the sidebar has two states").
// Find, Waiting on you and New session on top; then one of two states, by the tab in front (TB().front):
//   the Canvas in front: Check in (Back to, Kept, Done, Made: boxes, quiet at zero) and Live (the 4 most recent live
//     sessions as keys, then "N more live"); the folder list and Working now are gone, the canvas is the folders;
//   a tab in front: Running elsewhere (the 4 folders with other sessions running, then "N more folders") and Recent (the
//     4 folders used most recently, apart from the one in front).
// Your AIs and Plans are rows in the foot (#1858, #1859). Every rule is general: groups of at most 4, quiet at zero, most
// recent first, and only kit parts and tokens (sol/skills/kit). Signed: marcocyl04-ux's agent, #1879 step 1.
import { useState } from "react";
import { D, S, SCEN, SCN, act, folderOrder, regionOf } from "./cv/index.ts";
import { K, MOST, backTo, doneAway, keptItems, recentFolders, type Item } from "./keeps.ts";
import { TB } from "./cv/moves/tabs.ts";
import { needsCount } from "./people/queue.ts";
import { placeOf } from "./place.ts";
import { tintOf } from "./plane/layout.ts";
import { viewNow } from "./atwork/count.ts";
import type { Row } from "./atwork/model.ts";
import { helpOpen, helpShown } from "./learn/help-state.ts";
import { Slot } from "./slots.ts";
import { BoxCard, FolderCard, Group, Icon, Key, paintAt, runningLine, type BoxInside, type IconName, type Paint } from "../kit/index.ts";

const TILT = [-2, 2, -1, 1.5];   // the angle each card lands from, in turn
const paintOf = (rid: string | null | undefined): Paint => paintAt(Math.max(0, tintOf(rid)));

/** "40m", "3h", "2d": how long ago; "" when the time is not kept */
const ago = (t: number | null | undefined): string => {
  if (!t || t > Date.now()) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 60 ? `${Math.max(m, 1)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};
/** a time as a card says it: "08:31" today, "yesterday", else the weekday */
const when = (t: number): string => {
  const d = new Date(t), now = new Date(), day = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 864e5);
  const back = day(now) - day(d);
  return back <= 0 ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : back === 1 ? "yesterday" : d.toLocaleDateString("en", { weekday: "short" });
};

// ---- the canvas in front ----
type Made = { id: string; name: string; folder: string; at: number };
/** what the person's AIs made: the pages, docs and lists, newest first */
const madeNow = (): Made[] => Object.values(D.pieces)
  .filter((p) => ["doc", "page", "list"].includes(p.kind) && !p.inside && !p.part)
  .map((p) => ({ id: p.id, name: p.name, folder: p.region, at: Number(p.born) || 0 }))
  .sort((a, b) => b.at - a.at);

function CheckIn({ open, setOpen }: { open: BoxInside | null; setOpen: (b: BoxInside | null) => void }) {
  const made = madeNow(), k = K(), pieces = Object.values(D.pieces), front = TB().front;
  const lists: Record<BoxInside, Item[]> = {
    back: backTo(pieces, k.seen, front), kept: keptItems(pieces, k.pinned), done: doneAway(pieces, k.away),
    made: made.map((m) => ({ id: m.id, name: m.name, folder: m.folder, kind: "page", at: m.at })),
  };
  const boxes: { inside: BoxInside; name: string; n: number; hint: string }[] = [
    { inside: "back", name: "Back to", n: lists.back.length, hint: lists.back[0]?.name ?? "nothing yet" },
    { inside: "kept", name: "Kept", n: lists.kept.length, hint: lists.kept[0]?.name ?? "nothing yet" },
    { inside: "done", name: "Done", n: lists.done.length, hint: lists.done.length ? "while you were away" : "nothing yet" },
    { inside: "made", name: "Made", n: made.length, hint: made[0]?.name ?? "nothing yet" },
  ];
  return <>
    <Group label="Check in" items={boxes} render={(b, i) => <BoxCard key={b.inside} inside={b.inside} name={b.name} n={b.n} hint={b.hint} open={open === b.inside} tilt={TILT[i]}
      onOpen={b.n ? () => setOpen(open === b.inside ? null : b.inside) : undefined} />} />
    {open && lists[open].length ? <BoxList title={boxes.find((b) => b.inside === open)!.name} rows={lists[open]} /> : null}
  </>;
}

/** a box's list, in the sidebar: the 4 most recent, each opens where it is (the box's number says how many there are) */
function BoxList({ title, rows }: { title: string; rows: Item[] }) {
  return <div className="nx-boxlist" aria-label={title}>
    {rows.slice(0, MOST).map((m) => <a key={m.id} className="nx-row" role="button" tabIndex={0} data-act={`goto:${m.id}`} data-made={m.id}>
      <Icon name={m.kind === "session" ? "session" : "page"} small /><span className="nx-rn">{m.name}</span><span className="nx-k">{regionOf(m.folder)?.name ?? ""}{m.at ? ` · ${when(m.at)}` : ""}</span></a>)}
  </div>;
}

/** a live session as a key: its folder's window, its name, one line in words; its question on a slip on hover */
function LiveKey({ r, i }: { r: Row; i: number }) {
  const asks = r.stand === "asks", folder = r.folder && regionOf(r.folder) ? regionOf(r.folder)!.name : "loose", age = ago(r.since);
  const words = r.line.replace(/^(Asks you|Waiting on you): ?/, "");
  return <Key name={r.name} paint={paintOf(r.folder)} folder={folder} tilt={TILT[i % 4]} onOpen={() => act(`goto:${r.id}`)}
    state={asks ? { asks: true, age: age || "now" } : { asks: false, running: age }} question={{ head: asks ? `asked ${age || "now"} ago` : "running", words }} />;
}

const recentFirst = (rows: Row[]) => [...rows].sort((a, b) => (b.since ?? 0) - (a.since ?? 0));

function Live({ opened, setOpened }: { opened: boolean; setOpened: (o: boolean) => void }) {
  const rows = viewNow(null).now, asks = rows.filter((r) => r.stand === "asks"), runs = rows.filter((r) => r.stand !== "asks");
  if (opened) return <>
    <a className="nx-row nx-back" role="button" tabIndex={0} data-live-back onClick={() => setOpened(false)}><span aria-hidden="true">‹</span><span className="nx-rn">Live</span></a>
    {asks.length ? <Group label="Asks you" count={asks.length} opened items={recentFirst(asks)} render={(r, i) => <LiveKey key={r.id} r={r} i={i} />} /> : null}
    {runs.length ? <Group label="Running" count={runs.length} opened items={recentFirst(runs)} render={(r, i) => <LiveKey key={r.id} r={r} i={i} />} /> : null}
  </>;
  return <Group label="Live" count={rows.length || undefined} items={recentFirst(rows)} more="live" paintOf={(r) => paintOf(r.folder)} onMore={() => setOpened(true)} quiet="Nothing live"
    aside={rows.length ? <><b>{asks.length}</b> ask · <b>{runs.length}</b> running</> : undefined} render={(r, i) => <LiveKey key={r.id} r={r} i={i} />} />;
}

// ---- a tab in front ----
function Elsewhere({ here }: { here: string | null }) {
  const order = folderOrder();
  const by = order.filter((id) => id !== here).map((id) => ({ id, c: placeOf(id).counts })).filter((f) => f.c.asks + f.c.working > 0)
    .sort((a, b) => b.c.asks - a.c.asks || order.indexOf(a.id) - order.indexOf(b.id));
  const sessions = by.reduce((n, f) => n + f.c.asks + f.c.working, 0);
  return <Group label="Running elsewhere" items={by} more={["folder", "folders"]} paintOf={(f) => paintOf(f.id)} quiet="Nothing running elsewhere"
    aside={sessions ? <><b>{sessions}</b> {sessions === 1 ? "session" : "sessions"}</> : undefined}
    onMore={() => act("map")}
    render={(f, i) => <FolderCard key={f.id} name={placeOf(f.id).name} paint={paintOf(f.id)} line={runningLine(f.c.asks, f.c.working)} tilt={TILT[i % 4]} onOpen={() => act(`folder_open:${f.id}`)} />} />;
}

function Recent({ here }: { here: string | null }) {
  const items = recentFolders(folderOrder(), K().uses, here);
  return <Group label="Recent" items={items} quiet="No folders yet"
    render={(f, i) => <FolderCard key={f.id} name={placeOf(f.id).name} paint={paintOf(f.id)} line={when(f.at)} tilt={TILT[i % 4]} onOpen={() => act(`folder_open:${f.id}`)} />} />;
}

// ---- the rows ----
const Row_ = ({ icon, on, id, data, k, children }: { icon: IconName; on?: boolean; id?: string; data: Record<string, string>; k?: string; children: string }) =>
  <a className={`nx-row${on ? " on" : ""}`} id={id} role="button" tabIndex={0} {...data}><Icon name={icon} small /><span className="nx-rn">{children}</span>{k ? <span className="nx-k">{k}</span> : null}</a>;

export default function Sidebar() {
  const who = SCN ? SCEN[SCN]?.label.split(" · ")[0] : "";
  const [box, setBox] = useState<BoxInside | null>(null), [liveOpen, setLiveOpen] = useState(false);
  const front = TB().front, here = front ? D.pieces[front]?.region ?? null : null;
  const ais = D.ais.length, plans = (D as { work?: { autos?: unknown[] } }).work?.autos?.length ?? 0;
  return (
    <nav className="nx-side" id="side" aria-label="Sidebar">
      <div className="nx-drag" data-tauri-drag-region aria-hidden="true" />
      {who ? <div className="nx-me"><span className="nx-av">{who[0]}</span><b>{who}</b></div> : null}
      <a className="nx-row" id="findrow" role="button" tabIndex={0} data-act="goto"><Icon name="find" small /><span className="nx-rn">Find</span><span className="nx-k">⌘K</span></a>
      <a className={`nx-row${!S.page && S.dist === "needs" ? " on" : ""}`} id="needsrow" role="button" tabIndex={0} data-act="needs" data-f="one count: Cowork waits + Social cards"><Icon name="waiting" small /><span className="nx-rn">Waiting on you</span><span className="nx-k">⌘J</span><span className={`nx-n${needsCount() ? "" : " zero"}`} id="needn">{needsCount()}</span></a>
      <a className="nx-row" id="newrow" role="button" tabIndex={0} data-act="tabNew" data-new-session><Icon name="plus" small /><span className="nx-rn">New session</span><span className="nx-k">⌘N</span></a>
      <div className="nx-scroll" data-state={front ? "tab" : "canvas"}>
        {front
          ? <><Elsewhere here={here} /><Recent here={here} /></>
          : <>{liveOpen ? null : <CheckIn open={box} setOpen={setBox} />}<Live opened={liveOpen} setOpened={setLiveOpen} /></>}
      </div>
      <div className="nx-foot">
        <Row_ icon="ai" id="aisrow" on={S.page === "ais"} data={{ "data-act": "page:ais", "data-go": "ais" }} k={ais ? String(ais) : undefined}>Your AIs</Row_>
        <Row_ icon="loop" id="plansrow" on={S.page === "work"} data={{ "data-act": "page:work", "data-go": "work" }} k={plans ? String(plans) : undefined}>Plans</Row_>
        <Slot name="peopleside" />
        {/* learn.html part 1 note 3: Help sits above Settings; the walks replay from there and its session opens there */}
        <a className={`nx-row lr-helprow${helpShown() && !S.page ? " on" : ""}`} role="button" tabIndex={0} data-help-row onClick={() => helpOpen()}><span className="lr-q" aria-hidden="true">?</span>Help</a>
        <a className={`nx-row${S.page === "settings" ? " on" : ""}`} role="button" tabIndex={0} data-act="page:settings" data-go="settings"><Icon name="settings" small /><span className="nx-rn">Settings</span><span className="nx-k">⌘,</span></a>
      </div>
    </nav>
  );
}
