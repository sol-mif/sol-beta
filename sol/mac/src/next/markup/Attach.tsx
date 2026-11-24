// The chat bar's attach menu (BR1, #1615; HANDOFF-P2 3c): one + control that opens one menu, every entry with its name
// and an icon: Mark things on screen (Mark up), Screenshot of the app, Photo, File (attach.ts). What each attaches rides in the message and goes
// with Send in the bar (MarkBar.tsx, drawn right after it). The chat bar mounts it with one line, <Attach />; it needs
// nothing else. ⇧⌘M starts marking from anywhere and ⌘↵ sends the marks (builder M, mine/look/br1/markup.html); while
// marking, the + is lit with Mark up's sign and a press on it ends marking.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ENTRIES, put, run } from "./attach-state.ts";
import { mu, send, subscribe, toggleMarking, endMarking, versionNow } from "./model.ts";
import MarkBar from "./MarkBar.tsx";
import { IC } from "./ic.ts";
import "./markup.css";

const Ic = ({ d }: { d: string }) => <svg className="mu-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const ICON = { markup: IC.mark, shot: IC.shot, photo: IC.photo, file: IC.file } as const;

/** the keys from anywhere, heard once for the window: ⇧⌘M marks, ⌘↵ sends the marks waiting in the bar */
export function markKeys(e: KeyboardEvent): boolean {
  if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && (e.code === "KeyM" || e.key.toLowerCase() === "m")) { toggleMarking(); return true; }
  if (e.metaKey && !e.shiftKey && e.key === "Enter" && (mu.marks.length || mu.files.length) && !mu.sending) { void send(); return true; }
  return false;
}
if (typeof window !== "undefined" && !(window as { __muKeys?: boolean }).__muKeys) {
  (window as { __muKeys?: boolean }).__muKeys = true;
  window.addEventListener("keydown", (e) => { if (!e.defaultPrevented && markKeys(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
}

export default function Attach({ open: start = false }: { open?: boolean }) {
  useSyncExternalStore(subscribe, versionNow, versionNow);
  const [open, setOpen] = useState(start);
  const box = useRef<HTMLSpanElement>(null), first = useRef<HTMLButtonElement>(null);
  const photo = useRef<HTMLInputElement>(null), file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", out, true); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", out, true); window.removeEventListener("keydown", key, true); };
  }, [open]);
  const pick = (kind: "photo" | "file") => (kind === "photo" ? photo : file).current?.click();
  // the picker opens inside the press (a browser opens it only then); the screenshot waits for the menu to close, so it
  // is of the app and not of the menu
  const go = (id: (typeof ENTRIES)[number]["id"]) => {
    setOpen(false);
    if (id === "shot") requestAnimationFrame(() => requestAnimationFrame(() => run(id, pick)));
    else run(id, pick);
  };
  const took = (kind: "photo" | "file") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = [...(e.target.files ?? [])];
    e.target.value = "";
    if (fs.length) void put(kind, fs);
  };
  return (<>
    <span className="at-root" ref={box} data-attach="">
      {mu.on ? <button type="button" className="at-plus on" aria-label="Stop marking (Esc)" title="Stop marking (Esc)" onClick={() => endMarking()}><Ic d={IC.mark} /></button>
        : <button type="button" className="at-plus" aria-label="Attach" aria-haspopup="menu" aria-expanded={open} title="Attach"
          onClick={() => setOpen((o) => !o)}><Ic d={IC.plus} /></button>}
      {open ? <span className="at-menu" role="menu" aria-label="Attach">
        {ENTRIES.map((x, i) => <button key={x.id} ref={i === 0 ? first : undefined} type="button" role="menuitem" className="at-it" data-at={x.id}
          onClick={() => go(x.id)}><Ic d={ICON[x.id]} />{x.label}{x.keys ? <small className="at-k">{x.keys}</small> : null}</button>)}
      </span> : null}
      <input ref={photo} type="file" accept="image/*" multiple hidden onChange={took("photo")} />
      <input ref={file} type="file" multiple hidden onChange={took("file")} />
    </span>
    <MarkBar />
  </>);
}
