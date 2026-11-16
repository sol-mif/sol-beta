// Where a new session starts (#647, Marco 2026-11-06: "make the folder it starts in a bit easier to deal with"; the
// mechanics with Frank, #656). The chip reads "in <folder>"; a click lifts a card: the folders you work in most, each
// its name and its path in grey, the picked one marked; your home folder; a switch for a side copy (a worktree, so the
// session cannot touch your branch); and a field for another path, checked with the engine before it is taken. Enter
// picks, arrows walk, Esc closes, a click outside closes. What it routes to: work.say { fresh, cwd, worktree }. Round 4
// (from the kit #674): the card is a Card at the pop step, the folders a List, the folder it starts in the pearl.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CFG, enter } from "../motion";
import { useCover } from "../cowork/thingView";
import { Card, List, type Item } from "../kit";
import { label } from "../kit/paint";

export type Place = { name: string; path: string; count: number };
const tilde = (p: string) => p.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
const W = 340, PAD = 8, IN = W - 2 * PAD;
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || "~";

export function FolderPick({ r, places, cwd, copy, onPick, onCopy, onOther, onClose, chip }: {
  r: DOMRect; places: Place[]; cwd: string; copy: boolean; onPick: (path: string) => void; onCopy: (v: boolean) => void;
  onOther: (path: string) => Promise<string | null>;   // the path the engine found, or null with a flash
  onClose: () => void; chip: HTMLElement | null;
}) {
  useCover(true);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = [...places].sort((a, b) => b.count - a.count).slice(0, 7);
  const rows = [...list.map((p) => ({ label: p.name || base(p.path), path: p.path })), { label: "home folder", path: "~" }];
  const onAt = Math.max(0, rows.findIndex((x) => (x.path === "~" ? !cwd || cwd === "~" : x.path === cwd)));
  const [lit, setLit] = useState(onAt);
  const [other, setOther] = useState("");
  const [bad, setBad] = useState("");
  useLayoutEffect(() => { const el = box.current; if (el) enter(el, { y: 8, cfg: CFG.settle }); }, []);
  useEffect(() => {
    const down = (ev: PointerEvent) => { const t = ev.target as Node; if (!box.current?.contains(t) && !chip?.contains(t)) onClose(); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose, chip]);
  const take = async () => {
    const v = other.trim();
    if (!v) return;
    const got = await onOther(v);
    if (got) { onPick(got); onClose(); } else setBad(`no folder at ${v}`);
  };
  const key = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") { ev.preventDefault(); onClose(); return; }
    if (ev.target === field.current && ev.key === "Enter") { ev.preventDefault(); void take(); }
  };
  const items: Item[] = [{ head: "a new session starts in" }, ...rows.map((x, k) => ({ id: x.path, title: x.label, note: x.path === "~" ? "your files, no project" : tilde(x.path), picked: k === onAt }))];
  const left = Math.max(8, Math.min(r.left, innerWidth - 8 - W));
  return createPortal(
    <div ref={box} className="wpick folder kit" role="dialog" aria-label="where a new session starts" style={{ position: "fixed", zIndex: 60, left, bottom: innerHeight - r.top + 8 }} onKeyDown={key}>
      <Card w={W} step="pop"><div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 8 }}>
      <List w={IN} items={items} lit={lit} onLit={setLit} onClose={onClose} onPick={(k) => { onPick(rows[k].path); onClose(); }} />
      <label className="wswitch">
        <input type="checkbox" checked={copy} onChange={(ev) => onCopy(ev.target.checked)} />
        <b>in a side copy</b><i>its own branch; your files stay as they are</i>
      </label>
      <div className="wother">
        <input ref={field} value={other} placeholder="another folder: ~/path" onChange={(ev) => { setOther(ev.target.value); setBad(""); }} />
        <button type="button" onClick={() => void take()} disabled={!other.trim()}>go</button>
      </div>
      {bad && <p className="wbad" style={{ ...label, margin: 0, padding: "0 12px" }}>{bad}</p>}
      </div></Card>
    </div>, document.body);
}
