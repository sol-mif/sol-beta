// The clean Home's side (#589): the only list. Every session in its folder, each row one mark (the goo droplet) saying
// how it is: running, needs you, done, failed. Opened wide it is the old chats page: the same rows with more columns.
// Every row, folder and head is a "thing" for the keys (keys.ts): data-thing, data-kind, focused by Home.tsx.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { RunInfo, Work, WorkSession } from "../work/useWork";
import { rowState } from "../work/WorkSidebar";
import { Droplet, type DropletKind } from "../creature/goo";
import { ModeWheel } from "../ModeWheel";
import { useSpine } from "../spine/flag";
import { stageWhole } from "../flag";
import { useLamp } from "../spine/lamp";
import type { AppMode } from "../ModeSwitch";
import { Menu, type MenuItem } from "../work/Menu";
import { Icon } from "../settingsShell";
import { sideOf, wideOf, base, folderOf, when, type Filter, type St } from "./sideRows";
import type { Metas } from "./meta";
import { BlocksHere } from "../stage/BlocksHere";
import { LensPill } from "../stage/LensPill";
import { store } from "../stage/engineStore";
import { onCarryOver, carryOver, rowWord, setNames } from "../stage/carry";
import { EMPTY } from "../stage/store";

export const meta = {
  Side: {
    job: "the only list: every session in its folder, its state on its row",
    flow: "pickup",
    states: ["reading", "empty", "one", "many", "more than six in a folder", "folder folded", "done today", "picked row", "row menu", "soft-open", "wide", "wide, filtered", "carry here", "n carried"],
    keys: [
      { press: "click a row", does: "opens the session in the talk", goal: "pickup" },
      { press: "⌘-click a row", does: "opens it in the pane", goal: "pickup", opens: "Second", faster: true },
      { press: "drag a row to the talk", does: "opens it in the pane", goal: "pickup", opens: "Second", faster: true },
      { press: "right-click a row", does: "the row's menu: open in the pane, pin, archive" },
      { press: "click new", does: "a new session, as ⌘N", goal: "say", faster: true },
      { press: "click all sessions", does: "opens the side wide: every session, with filters", goal: "pickup", faster: true },
      { press: "click a folder", does: "folds it or opens it" },
      { press: "click N more", does: "opens the side wide" },
      { press: "click settings", does: "Settings, as a sheet over Home", goal: "mine" },
      { press: "drag a block's title onto a row (the stage on)", does: "carries the block there too: the row lights \"carry here\", then says \"n carried\"" },
      { press: "click home | cowork", does: "goes to Cowork", goal: "team" },
    ],
    listens: ["work.sessions", "work.runs (each row's state)", "work.loaded", "sol.home.clean.folds", "work.stage.changed (blocks here, n carried)"],
  },
  Mark: {
    job: "a session's state as one mark, the goo droplet: running, needs you, failed, finished unseen, done",
    flow: "know",
    states: ["running", "needs", "failed", "unread", "done", "none"],
    keys: [],
    listens: ["the row's state (rowState)"],
  },
} satisfies Metas;

const FOLDS = "sol.home.clean.folds";
const SHOWN = 6;   // a folder shows its newest six; the rest are the wide side's (and ⌘K's)
const readFolds = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(FOLDS) ?? "{}"); } catch { return {}; } };
export const stOf = (w: Work) => (s: WorkSession): St => rowState(s, w.runs[s.id] as RunInfo | undefined);
const DROP: Partial<Record<St, DropletKind>> = { running: "running", needs: "needs", failed: "failed", done: "done", unread: "done" };
const SAYS: Record<St, string> = { running: "running", needs: "needs you", failed: "failed", unread: "finished, unseen", done: "done", "": "" };
const HERE: Record<string, string> = { mac: "mac", nucbox: "nucbox" };

export function Mark({ st, size = 14 }: { st: St; size?: number }) {
  const k = DROP[st];
  return k ? <Droplet kind={k} size={size} title={SAYS[st]} /> : <i className="hc-nomark" aria-hidden />;
}

export function Side({ w, live, wide, onOpen, onBeside, onFresh, onWide, onSettings, onMode, soft, onHover }: {
  w: Work; live: string | null; wide: boolean; onOpen: (id: string) => void; onBeside: (id: string) => void;
  onFresh: () => void; onWide: (v: boolean) => void; onSettings: () => void; onMode: (m: AppMode) => void;
  soft?: "open" | "closing"; onHover?: (on: boolean) => void;   // folded, soft-opened over the talk (Home.tsx)
}) {
  const st = stOf(w);
  // carry (#700): the row a block's head is over lights "carry here"; a row says how many of the blocks here it holds
  // too; this session's row how many blocks it has. The side's names are the stage's ledger's
  const over = useSyncExternalStore(onCarryOver, carryOver);
  const here = useSyncExternalStore(useCallback((f: () => void) => (live ? store.subscribe(live, f) : () => {}), [live]), () => (live ? store.read(live) : EMPTY));
  useEffect(() => { setNames(w.sessions); }, [w.sessions]);
  const word = (sid: string) => rowWord(sid, live, here.blocks, over);
  const spine = useSpine();   // with the spine on (sol.spine), the modes row is the spine's; the lamp follows the pointer through the rows
  const lamp = useLamp();
  const [folds, setFolds] = useState(readFolds);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const fold = (k: string, open: boolean) => setFolds((f) => { const n = { ...f, [k]: open }; try { localStorage.setItem(FOLDS, JSON.stringify(n)); } catch { /* private */ } return n; });
  const isOpen = (k: string) => !folds[k];
  // a row's menu: beside, pin, archive (the receipt card has the same archive)
  const rowMenu = (ev: React.MouseEvent, s: WorkSession) => {
    ev.preventDefault();
    setMenu({ x: ev.clientX, y: ev.clientY, items: [
      { label: "open in the pane", run: () => onBeside(s.id) },
      { label: s.pinned ? "unpin" : "pin: keep it on the side", run: () => w.mark(s.id, { pinned: !s.pinned }) },
      { label: s.archived ? "bring it back" : "archive", run: () => w.mark(s.id, { archived: !s.archived }) },
    ] });
  };
  const row = (s: WorkSession, cols = false) => (
    <div key={s.id} role="button" tabIndex={-1} data-thing data-kind="session" data-sid={s.id} className={`hc-row ${s.id === live ? "on" : ""} ${s.archived ? "gone" : ""} ${over === s.id ? "carry" : ""}`}
      draggable onDragStart={(ev) => { ev.dataTransfer.setData("text/sol-session", s.id); ev.dataTransfer.effectAllowed = "copy"; }}
      onClick={(ev) => (ev.metaKey ? onBeside(s.id) : onOpen(s.id))} onContextMenu={(ev) => rowMenu(ev, s)}>
      <Mark st={st(s)} />
      <span className="hc-tt" title={s.title}>{s.title || "untitled"}</span>
      {cols && <span className="hc-c">{base(folderOf(s)) || "home"}</span>}
      {cols && <span className="hc-c">{HERE[s.machine ?? "mac"] ?? s.machine}</span>}
      {!cols && word(s.id) ? <span className="hc-when hc-carried">{word(s.id)}</span> : <time className="hc-when">{when(s.updatedAt)}</time>}
    </div>
  );

  const top = (
    <div className="hc-sidetop">
      {!spine && <ModeWheel mode="home" onPick={onMode} />}
      <div role="button" tabIndex={-1} data-thing data-kind="head" className="hc-head" onClick={onFresh}><span className="hc-plus" aria-hidden />new<kbd>⌘N</kbd></div>
      <div role="button" tabIndex={-1} data-thing data-kind="head" className={`hc-head ${wide ? "on" : ""}`} onClick={() => onWide(!wide)}>
        <Icon name="search" size={13} />{wide ? "back" : "all sessions"}
      </div>
    </div>
  );
  const foot = (
    <div className="hc-sidefoot">
      <button className="hc-gear" data-thing data-kind="head" onClick={onSettings} tabIndex={-1}><Icon name="tools" size={14} /><span>settings</span></button>
    </div>
  );

  if (wide) {
    const rows = wideOf(w.sessions, st, filter).slice(0, 400);
    const F: [Filter, string][] = [["all", "all"], ["running", "running"], ["needs", "needs you"], ["done", "done"]];
    return (
      <aside data-place="side" tabIndex={-1} className="hc-side wide">
        {top}
        <div tabIndex={-1} data-thing data-kind="card" className="hc-filters">
          {F.map(([k, l]) => <button key={k} tabIndex={-1} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="hc-cols"><span>session</span><span>folder</span><span>machine</span><span>when</span></div>
        <div className="hc-list">{rows.map((s) => row(s, true))}</div>
        {foot}
        {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </aside>
    );
  }

  const { folders, doneToday } = sideOf(w.sessions, st);
  const group = (key: string, name: string, rows: WorkSession[]) => {
    const open = isOpen(key);
    return (
      <div key={key} className="hc-folder">
        <div role="button" tabIndex={-1} data-thing data-kind="folder" data-open={open ? "1" : undefined} data-fold={key} className="hc-fhead" onClick={() => fold(key, open)}>
          <span className={`hc-caret ${open ? "open" : ""}`} aria-hidden />{name}<span className="hc-n">{rows.length}</span>
        </div>
        {open && rows.slice(0, SHOWN).map((s) => row(s))}
        {open && rows.length > SHOWN && <div role="button" tabIndex={-1} data-thing data-kind="head" className="hc-head hc-more" onClick={() => onWide(true)}>{rows.length - SHOWN} more</div>}
      </div>
    );
  };
  return (
    <aside data-place="side" tabIndex={-1} className={`hc-side ${soft ? `soft ${soft}` : ""}`}
      onMouseEnter={soft && onHover ? () => onHover(true) : undefined} onMouseLeave={soft && onHover ? () => onHover(false) : undefined}>
      {top}
      {/* stage: joins lens (#701): the lens pill at the top of the side */}
      {live && !stageWhole() && <LensPill store={store} session={live} />}{/* #954: with stage.whole the lens is one setting (whole.md "Deleted") */}
      <div className="hc-list" onPointerMove={spine ? lamp.move : undefined} onPointerLeave={spine ? lamp.leave : undefined}>
        {spine && <div ref={lamp.ref} className="hc-lamp" aria-hidden />}
        {folders.map((f) => group(f.key, f.name, f.rows))}
        {doneToday.length > 0 && group("done-today", "done today", doneToday)}
        {!folders.length && !doneToday.length && <p className="hc-empty">{w.loaded ? "no sessions this week: ⌘N starts one" : "reading the sessions…"}</p>}
        {live && !stageWhole() && <BlocksHere store={store} session={live} />}{/* #954: no state dots or words in the side with stage.whole */}
      </div>
      {foot}
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  );
}
