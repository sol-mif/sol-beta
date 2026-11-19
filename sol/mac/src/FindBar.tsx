import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { spans, firstFrom, step } from "./find";
import { CFG, enter } from "./motion";

// ⌘F in a session (#1239): Sol.app's web view has no find of its own, so a long talk could only be scrolled. A small bar at
// the top right of the talk lights every match (the CSS highlight API, so the talk's own DOM is never touched) and steps
// through them: ⏎ or ⌘G the next, ⇧⏎ or ⇧⌘G the one before, esc closes it. While it is open, words that arrive (a turn
// still answering, a step unfolded) are searched again.
const ALL = "sol-find", NOW = "sol-find-now";
const lit = typeof CSS !== "undefined" && "highlights" in CSS;

/** every match of q in the talk's text on screen, as ranges; a match lies inside one run of text */
function rangesIn(root: HTMLElement, q: string): Range[] {
  const out: Range[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const el = n.parentElement;
    if (!el || el.closest("[hidden], [aria-hidden='true'], .trail") || (el.checkVisibility && !el.checkVisibility())) continue;
    for (const [a, b] of spans(n.data, q)) { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); out.push(r); }
  }
  return out;
}

export function FindBar({ scroller, goTo }: { scroller: RefObject<HTMLDivElement | null>; goTo: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [count, setCount] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const found = useRef<Range[]>([]);
  const h = useRef({ open, at, count });
  h.current = { open, at, count };

  // where a match sits in the talk, as the talk's own scroll place
  const yOf = (r: Range) => { const el = scroller.current!; return r.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop; };
  const show = (i: number) => {
    const el = scroller.current, r = found.current[i];
    if (lit) { if (r) CSS.highlights.set(NOW, new Highlight(r)); else CSS.highlights.delete(NOW); }
    if (!el || !r) return;
    const y = yOf(r);
    if (y < el.scrollTop + 24 || y > el.scrollTop + el.clientHeight - 48) goTo(y - el.clientHeight / 3);
  };
  const go = (by: 1 | -1) => { const c = h.current.count; if (!c) return; const i = step(h.current.at, by, c); setAt(i); show(i); };
  const close = () => { setOpen(false); found.current = []; setCount(0); if (lit) { CSS.highlights.delete(ALL); CSS.highlights.delete(NOW); } };

  // the words typed: search, then land on the first match from what is on screen down
  const search = (land: boolean) => {
    const el = scroller.current;
    const rs = el && q.trim() ? rangesIn(el, q) : [];
    found.current = rs;
    setCount(rs.length);
    if (lit) { if (rs.length) CSS.highlights.set(ALL, new Highlight(...rs)); else CSS.highlights.delete(ALL); }
    const i = land ? firstFrom(rs.map(yOf), el?.scrollTop ?? 0) : Math.min(h.current.at, Math.max(0, rs.length - 1));
    setAt(i);
    if (land) show(i); else if (lit) { const r = rs[i]; if (r) CSS.highlights.set(NOW, new Highlight(r)); else CSS.highlights.delete(NOW); }
  };
  useEffect(() => { if (open) search(true); }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the talk changes under an open bar (a turn answering, another session opened): search again, at most every 150 ms
  useEffect(() => {
    const el = scroller.current;
    if (!open || !el) return;
    let t = 0;
    const mo = new MutationObserver(() => { if (!t) t = window.setTimeout(() => { t = 0; search(false); }, 150); });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [open, q, scroller]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (!ev.metaKey || ev.altKey || ev.ctrlKey) return;
      const k = ev.key.toLowerCase();
      if (k === "f" && !ev.shiftKey) {
        ev.preventDefault(); ev.stopPropagation();
        setOpen(true);
        requestAnimationFrame(() => { box.current?.focus(); box.current?.select(); });
      } else if (k === "g" && h.current.open) { ev.preventDefault(); ev.stopPropagation(); go(ev.shiftKey ? -1 : 1); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (open && bar.current) enter(bar.current, { y: -8, cfg: CFG.travel }); }, [open]);
  useEffect(() => () => { if (lit) { CSS.highlights.delete(ALL); CSS.highlights.delete(NOW); } }, []);

  if (!open) return null;
  return (
    <div ref={bar} className="findbar" role="search">
      <input ref={box} value={q} placeholder="find in this session" spellCheck={false} aria-label="find in this session"
        onChange={(ev) => setQ(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); go(ev.shiftKey ? -1 : 1); }
          else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
        }} />
      <span className="count">{q.trim() ? (count ? `${at + 1} of ${count}` : "none") : ""}</span>
      <button onClick={() => go(-1)} disabled={!count} title="the one before (⇧⌘G)" aria-label="the one before">↑</button>
      <button onClick={() => go(1)} disabled={!count} title="the next (⌘G)" aria-label="the next">↓</button>
      <button onClick={close} title="close (esc)" aria-label="close">×</button>
    </div>
  );
}
