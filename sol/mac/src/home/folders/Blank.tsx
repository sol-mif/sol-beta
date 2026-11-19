// The blank sticky (#1483, "Put down"): it always leads the surface, at Home above the places
// and in a place above its stickies. Typing anywhere fills it (a key typed outside a field, with no card open, lands in
// it), Enter puts it down. `onPut` says what happened: nothing more to show (it is put, the sticky empties), or the two
// nearest places (`near`), drawn as dark chips on the paper until one is pressed or the words change. One blank sticky
// is mounted at a time (Home's or the open place's), so the window's keys go to that one.
import { useEffect, useRef, useState } from "react";
import "./blank.css";

export type Put = { near?: string[] } | void;

export function BlankSticky({ onPut, onNear, nameOf, hint }: {
  onPut: (text: string) => Promise<Put>;
  onNear?: (place: string, text: string) => Promise<boolean>;
  nameOf?: (place: string) => string;
  hint: string;                                   // the placeholder: what putting it down here does
}) {
  const [text, setText] = useState("");
  const [near, setNear] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  // typing anywhere: a printable key outside a field, with no card or check open, goes into the blank sticky
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (ev.key.length !== 1 || ev.metaKey || ev.ctrlKey || ev.altKey || ev.defaultPrevented) return;
      const t = ev.target as Element | null;
      if (t?.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".ob-scrim")) return;
      ev.preventDefault();
      setText((x) => x + ev.key); setNear(null);
      const el = box.current;
      if (el) { el.focus(); requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length)); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const put = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await onPut(t);
      if (r && r.near?.length) setNear(r.near);
      else { setText(""); setNear(null); }
    } catch { /* not put: the words stay, and the caller says why */ } finally { setBusy(false); }
  };
  const pick = async (id: string) => {
    if (!onNear || busy) return;
    setBusy(true);
    try { if (await onNear(id, text.trim())) { setText(""); setNear(null); } } catch { /* not filed: the chips stay */ } finally { setBusy(false); }
  };

  return (
    <div className={`fh-sticky fh-blank ${text ? "typing" : ""}`} onClick={() => box.current?.focus()} data-blank-sticky data-blank-state={near ? "near" : busy ? "putting" : text ? "typing" : "blank"}>
      <input ref={box} value={text} placeholder={hint} aria-label="a new sticky" readOnly={busy}
        onChange={(ev) => { setText(ev.target.value); setNear(null); }}
        onKeyDown={(ev) => { if (ev.key === "Enter") void put(); if (ev.key === "Escape") { ev.preventDefault(); setText(""); setNear(null); box.current?.blur(); } }} />
      {near
        ? <div className="fh-blank-near">{near.map((id) => <button type="button" key={id} className="fh-blank-chip" onClick={(ev) => { ev.stopPropagation(); void pick(id); }} data-blank-near={id}>{nameOf?.(id) ?? id}</button>)}</div>
        : text ? <div className="fh-blank-hint">{busy ? "…" : "↵"}</div> : <div className="fh-blank-plus" aria-hidden="true">+</div>}
    </div>
  );
}
