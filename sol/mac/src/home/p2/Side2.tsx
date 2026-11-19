// Home's side, pass 2 (#692, pieces/main.mjs, folder.mjs, side.mjs as pass 2 changes it), slice C of the pass 2 build:
// today (what needs you), the folders two levels deep with deeper ones folded under their parent, the automations
// folder (one folder inside per type), world. A folder shows one count: its jobs that wait on you (yellow) or run. Drop a
// file, a link or words on a folder row and it is in that folder's context; drop a sticky on one and it refiles there.
// Right-click a folder: rename · move under · archive. Archived ones sit in one quiet row at the foot.
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { Metas } from "../meta";
import { Ink } from "../../kit";
import type { Folder, Home2Api, HomeState2, Place } from "./pass2";
import { canTake, dropInto, kids, live, saidOf, subtree } from "./folders";
import "./folders.css";

export const meta = {
  Side2: {
    job: "Home's index: today, the folders two levels deep, automations, world; one count per folder; drop onto a folder",
    flow: "know",
    states: ["engine down", "folders", "a folder picked", "a deeper folder picked (shown under its parent)", "dragging over a folder", "added (the said line)", "the folder menu", "renaming", "moving under", "archived ones open"],
    keys: [
      { press: "click a row", does: "opens that place", opens: "FolderView" },
      { press: "drop a file, a link or words on a folder", does: "adds it to that folder's context (home.folder.drop)", goal: "mine" },
      { press: "right-click a folder", does: "rename · move under · archive (home.folder.set)" },
      { press: "+ folder", does: "a name and it exists at the top (home.folder.make)" },
    ],
    listens: ["home.state › folders, archived"],
  },
  SideRename: {
    job: "a folder's name, edited in its row",
    flow: "know",
    states: ["editing", "a name already there"],
    keys: [{ press: "Enter", does: "renames it; its directory follows (home.folder.set)" }, { press: "Esc", does: "leaves the name" }],
    listens: [],
  },
  SideNewFolder: {
    job: "a new folder at the top: a name and it exists",
    flow: "know",
    states: ["naming", "a name already there"],
    keys: [{ press: "Enter", does: "makes it (home.folder.make)" }, { press: "Esc", does: "makes nothing" }],
    listens: [],
  },
  SideMenu: {
    job: "a folder's menu: rename, move under another, archive",
    flow: "know",
    states: ["the menu", "picking where to move it"],
    keys: [{ press: "click an item", does: "rename · move under · archive (home.folder.set)" }, { press: "Esc or a click outside", does: "closes it" }],
    listens: [],
  },
} satisfies Metas;

type Menu = { id: string; x: number; y: number; mode: "menu" | "move" };

// p2: C needs `h` here for Drop and the folder menu (Home.tsx passes it); without it the side is read-only as before
export function Side2({ st, place, setPlace, h }: { st: HomeState2 | null; place: Place; setPlace: (p: Place) => void; h?: Home2Api }) {
  const fs = live(st);
  const [over, setOver] = useState<string | null>(null);
  const [said, setSaid] = useState<{ id: string; text: string; bad: boolean } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(null), 5000); return () => clearTimeout(t); }, [said]);
  useEffect(() => {
    if (!menu) return;
    const off = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", off);
    return () => window.removeEventListener("keydown", off);
  }, [menu]);

  const openId = place.at === "folder" ? place.id : null;
  const open = openId ? fs.find((f) => f.id === openId) : undefined;
  const depth = (f: Folder) => f.crumb.length - 1;
  // a picked folder deeper than two levels is shown under its second-level parent
  const shownAs = (f: Folder | undefined): string | null => {
    if (!f) return null;
    let x: Folder | undefined = f;
    while (x && depth(x) > 1) x = fs.find((y) => y.id === x!.parent);
    return x?.id ?? null;
  };
  const pickRow = shownAs(open);
  const waits = fs.filter((f) => !f.parent).reduce((n, f) => n + f.counts.waits, 0);
  const tops = kids(fs, null);
  const mine = tops.filter((f) => f.kind !== "automations"), autos = tops.filter((f) => f.kind === "automations");

  const act = (id: string) => ({
    onDragEnter: (e: DragEvent) => { if (h && canTake(e.dataTransfer)) { e.preventDefault(); setOver(id); } },
    onDragOver: (e: DragEvent) => { if (h && canTake(e.dataTransfer)) { e.preventDefault(); if (over !== id) setOver(id); } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === id ? null : o)); },
    onDrop: async (e: DragEvent) => {
      if (!h || !canTake(e.dataTransfer)) return;
      e.preventDefault(); e.stopPropagation(); setOver(null);
      const rs = await dropInto(h, id, e.dataTransfer);
      if (rs.length) setSaid({ id, ...saidOf(rs) });
    },
    onContextMenu: (e: MouseEvent) => { if (!h) return; e.preventDefault(); setMenu({ id, x: e.clientX, y: e.clientY, mode: "menu" }); },
  });

  const row = (f: Folder) => {
    const n = f.counts.waits + f.counts.running;
    const picked = pickRow === f.id && openId === f.id;
    const deeper = fs.filter((x) => x.parent === f.id).length && depth(f) === 1 ? subtree(fs, f.id).length - 1 : 0;
    return (
      <div key={f.id} className="s2-wrap">
        {renaming === f.id
          ? <SideRename f={f} h={h!} done={() => setRenaming(null)} />
          : (
            <div role="button" tabIndex={-1} data-thing data-folder={f.id} data-part={`folder › ${f.crumb.join(" › ")}`}
              className={`s2-row d${Math.min(depth(f), 1)}${picked ? " pick" : ""}${pickRow === f.id && !picked ? " within" : ""}${over === f.id ? " over" : ""}`}
              onClick={() => setPlace({ at: "folder", id: f.id })} {...act(f.id)}>
              <span className="s2-name">{over === f.id ? <Ink k="dash">{f.name}</Ink> : f.name}</span>
              {deeper > 0 && !(pickRow === f.id && open && open.id !== f.id) && <small className="s2-fold" title={`${deeper} folded inside`}>+{deeper}</small>}
              {n > 0 && <small className={`s2-n${f.counts.waits ? " waits" : ""}`}>{n}</small>}
            </div>
          )}
        {pickRow === f.id && open && open.id !== f.id && (
          <div role="button" tabIndex={-1} data-thing data-folder={open.id} className="s2-row d2 pick" onClick={() => setPlace({ at: "folder", id: open.id })} {...act(open.id)}>
            <span className="s2-name">› {open.crumb.slice(f.crumb.length).join(" › ")}</span>
          </div>
        )}
        {said?.id === f.id && <p className={`s2-said${said.bad ? " bad" : ""}`} data-p2="said" role="status">{said.text}</p>}
      </div>
    );
  };
  const branch = (f: Folder) => [row(f), ...kids(fs, f.id).map(row)];

  return (
    <div className="p2-side" data-p2="side">
      <div role="button" tabIndex={-1} data-thing className={`s2-row s2-today${place.at === "today" ? " pick" : ""}`} onClick={() => setPlace({ at: "today" })}>
        <span className="s2-name">today</span>
        {waits > 0 && <small className="s2-n waits">{waits} need{waits === 1 ? "s" : ""} you</small>}
      </div>
      <h6 className="s2-h">folders</h6>
      {mine.flatMap(branch)}
      {h && (making
        ? <SideNewFolder h={h} done={() => setMaking(false)} />
        : <button type="button" className="s2-add" data-p2="make-folder" onClick={() => setMaking(true)}>+ folder</button>)}
      {autos.length > 0 && <div className="s2-gap" />}
      {autos.flatMap(branch)}
      <div className="s2-gap" />
      <div role="button" tabIndex={-1} data-thing className={`s2-row${place.at === "world" ? " pick" : ""}`} onClick={() => setPlace({ at: "world" })}><span className="s2-name">world</span></div>
      {(st?.archived?.length ?? 0) > 0 && (
        <>
          <button type="button" className="s2-add s2-archived" data-p2="archived" onClick={() => setShowArchived(!showArchived)}>archived · {st!.archived!.length}</button>
          {showArchived && st!.archived!.map((a) => (
            <div key={a.id} className="s2-row d1 dim" data-archived={a.id}>
              <span className="s2-name">{a.crumb.join(" › ")}</span>
              {h && <button type="button" className="s2-link" onClick={() => void h.ask({ type: "home.folder.set", id: a.id, archived: false })}>bring back</button>}
            </div>
          ))}
        </>
      )}
      {menu && h && <SideMenu menu={menu} fs={fs} h={h} setMenu={setMenu} rename={(id) => { setMenu(null); setRenaming(id); }} />}
    </div>
  );
}

function SideRename({ f, h, done }: { f: Folder; h: Home2Api; done: () => void }) {
  const [v, setV] = useState(f.name);
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const go = async () => {
    if (busy.current) return;
    if (!v.trim() || v.trim() === f.name) return done();
    busy.current = true;
    const r = await h.ask<{ type: string; error?: string }>({ type: "home.folder.set", id: f.id, name: v.trim() });
    busy.current = false;
    if (r.type === "home.error") setErr(r.error ?? ""); else done();
  };
  return <div className="s2-wrap"><input className="s2-input" autoFocus value={v} aria-label={`rename ${f.name}`} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); if (e.key === "Escape") { e.stopPropagation(); done(); } }} onBlur={() => void go()} />{err && <p className="s2-said bad">{err}</p>}</div>;
}

function SideNewFolder({ h, done }: { h: Home2Api; done: () => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const go = async () => {
    if (busy.current) return;
    if (!v.trim()) return done();
    busy.current = true;
    const r = await h.ask<{ type: string; error?: string }>({ type: "home.folder.make", name: v.trim() });
    busy.current = false;
    if (r.type === "home.error") setErr(r.error ?? ""); else done();
  };
  return <div className="s2-wrap"><input className="s2-input" autoFocus value={v} placeholder="a name" aria-label="a new folder" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); if (e.key === "Escape") { e.stopPropagation(); done(); } }} onBlur={() => void go()} />{err && <p className="s2-said bad">{err}</p>}</div>;
}

function SideMenu({ menu, fs, h, setMenu, rename }: { menu: Menu; fs: Folder[]; h: Home2Api; setMenu: (m: Menu | null) => void; rename: (id: string) => void }) {
  const f = fs.find((x) => x.id === menu.id);
  if (!f) return null;
  const mineAll = new Set(subtree(fs, f.id));
  const targets = fs.filter((x) => !mineAll.has(x.id) && x.id !== f.parent && x.kind !== "automations" && x.kind !== "type");
  const set = async (o: object) => { setMenu(null); await h.ask({ type: "home.folder.set", id: f.id, ...o }); };
  return (
    <>
      <div className="s2-scrim" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
      <div className="s2-menu" role="menu" data-p2="folder-menu" style={{ left: menu.x, top: menu.y }}>
        <b>{f.name}</b>
        {menu.mode === "menu" ? (
          <>
            <button type="button" role="menuitem" onClick={() => rename(f.id)}>rename</button>
            <button type="button" role="menuitem" onClick={() => setMenu({ ...menu, mode: "move" })}>move under…</button>
            {f.kind !== "automations" && <button type="button" role="menuitem" onClick={() => void set({ archived: true })}>archive</button>}
          </>
        ) : (
          <div className="s2-targets">
            {f.parent && <button type="button" role="menuitem" onClick={() => void set({ parent: null })}>the top</button>}
            {targets.map((t) => <button type="button" role="menuitem" key={t.id} data-target={t.id} onClick={() => void set({ parent: t.id })}>{t.crumb.join(" › ")}</button>)}
          </div>
        )}
      </div>
    </>
  );
}
