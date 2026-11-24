// The move-in screen (round 6 · M1, #1615; merge/movein.js screenHTML and its keys, missing/move-in.html's design): one
// "Keep, fix or drop" page over the whole window before the canvas is drawn (mount.ts puts it in #mvi). The unsure rows
// come first, each with its two answers and "Ask me later"; then Places (Build, Life), Sessions and Your AIs, every row
// with Rename and Remove (Bring back once removed); then the tally and "These are mine". Anything left alone is kept.
// Keys while it is up: ↑ ↓ choose a row · F rename it · ⌫ remove it (or bring it back) · ⌘↩ these are mine;
// in a name, ↩ keeps the new name and esc puts the old one back. It reads the move-in's state and presses M.
// BR1 (mine/look/br1/movein.html): when Claude Code or Codex was read (p.apps, live and the "coder" fixture) the page is
// "Here's what you already have": the apps as chips, the unsure projects as questions, one Folders list, the apps under
// Your AIs (kept, names only), the tally, a dashed privacy note. What the person sees first is not asked here: it is
// Settings › Start screen only (Lead.tsx; Marco, 2026-11-22, BR1 rapid).
// Calm at rest (the card check, scoped to #mvi): a folder's facts are one line of words, its chips, Rename and Remove show on
// the row the person is on; an unsure question has its two answers only, and one left open is asked again in Needs you.
// Signed: marcocyl04-ux's agent, port slice 11 (#1615); BR1.
import { useEffect } from "react";
import { M, regionOf, useNext } from "../cv/core.ts";
import { fromWords, gone, goneWhy, nm, tally, type Choices, type Person, type Row } from "./data.ts";
import { placeOf } from "../place.ts";   // BR1 root part 2: a folder row says its place's line
import { ed, personOf, st } from "./state.ts";
import { footOf } from "./live.ts";
import Circle from "./you/Circle.tsx";
import { known, type Known } from "../known.ts";
import { onShelf, takeBack } from "../shelf/model.ts";   // BR1 (d): a kept folder on the Shelf says so, with Take back
import Migration from "./Migration.tsx";
import { migrates } from "./plan.ts";   // migration.html C, D: the first move-in, one move at a time
import { tintOf } from "../plane/layout.ts";   // a folder's own tint
import "./movein.css";

const TERM = <svg className="mv-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M7.5 10l3 2-3 2M12.5 15h4" /></svg>;

/** a folder's colour as the canvas will draw it (tabs/Label.tsx FolderMark: the same four, in the plane's order); a folder
 *  not drawn yet takes its place in the list */
function toneOf(p: Person, r: Row): number {
  const t = tintOf(r.id);   // a folder drawn already: its own tint (plane/layout.ts)
  if (t >= 0) return t;
  return p.rows.filter((x) => x.k === "place").indexOf(r) % 4;
}

/** a row: its mark, its name (fixable in place), why it is gone or where it came from, and Fix · Drop or Bring back */
function RowLine({ p, c, r }: { p: Person; c: Choices; r: Row }) {
  const out = gone(c, r), name = nm(c, r);
  // a folder kept and then archived says so here, with Take back (BR1 (d)): before, it read as one on the canvas
  const shelved = r.k === "place" && !out && onShelf(r.id);
  const mark = r.k === "place" ? <i className={`mv-fold t${toneOf(p, r)}`} /> : r.k === "ai" && !r.app ? <span className="mv-aura" /> : TERM;
  const fix = (v: string) => { if (v !== name) M.move_in_row(r.id, "fix", v); };
  // a row that is only read (Claude Code, Codex: locked, nothing Sol learned to show) is not a stop for the keys or a
  // press: it drew focus and did nothing (sweep 3, #1615). The others are the arrow keys' list (keys below)
  const still = !!r.locked && !(r.found && !out);
  return (
    <div className={`mv-row${out ? " tb" : ""}`} data-row={r.id} data-k={r.k} data-locked={r.locked ? "1" : undefined} data-shelf={shelved ? "1" : undefined} tabIndex={still ? undefined : 0}>
      <span className="mv-gl">{mark}</span>
      <span className="mv-t">
        {r.locked ? <span className="mv-nm">{name}</span> : <textarea key={name} className="mv-nm" rows={1} spellCheck={false} defaultValue={name} aria-label={`Name of ${r.n}`} data-mvname={r.id} disabled={out}
          ref={grow} onInput={(e) => grow(e.currentTarget)} onBlur={(e) => fix(e.currentTarget.value)} />}
        <small>{goneWhy(p, c, r) || (shelved ? ["Archived", fromWords(p, c, r)] : [fromWords(p, c, r), r.k === "place" && regionOf(r.id) ? placeOf(r.id).line : ""]).filter(Boolean).join(" · ")}</small>
        {r.plus && !out ? <span className="mv-plus">+ {r.plus}</span> : null}
        {r.found && !out ? <Facts known={known(r.id, { found: [r.found] })} where={name} /> : null}
      </span>
      <span className="mv-acts">{r.locked ? <span className="mv-keep">Keep</span> : out
        ? <a className="mv-lk" data-mvundo={r.id} role="button" tabIndex={0} onClick={() => M.move_in_row(r.id, "keep")}>Bring back</a>
        : <>{shelved ? <a className="mv-lk" data-mvtake={r.id} role="button" tabIndex={0} aria-label={`Take ${name} back`} onClick={() => takeBack(r.id)}>Take back</a> : null}
          <a className="mv-lk" data-mvfix={r.id} role="button" tabIndex={0} aria-label={`Rename ${name}`} onClick={() => fixName(r.id)}>Rename</a>
          <a className="mv-lk" data-mvdrop={r.id} role="button" tabIndex={0} aria-label={`Remove ${name}`} onClick={() => M.move_in_row(r.id, "drop")}>Remove</a></>}</span>
    </div>
  );
}
/** what Sol learned of a folder (known()): at rest its words in one quiet line; on the row the person is on (focused), the
 *  same facts as chips, each pressed for where Sol learned it (Circle chips). A screen of rows at rest stays calm */
function Facts({ known: k, where }: { known: Known[]; where: string }) {
  if (!k.length) return null;
  return <span className="mv-kn"><span className="mv-knw">{k.map((f) => f.fact).join(" · ")}</span><Circle size="chips" known={k} where={where} /></span>;
}
/** a name's field grows with its text: CSS field-sizing where the webview has it, else its height from what it holds
 *  (Sol.app's WebKit has no field-sizing), on mount and on every keystroke */
const SIZES = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
function grow(t: HTMLTextAreaElement | null): void {
  if (!t || SIZES) return;
  t.style.height = "auto";
  // measured before the page is laid out (hidden, or opening), scrollHeight is 0: a 0px name would draw no name at all
  // (first-timer P 5), so it stays one line high until a keystroke measures it again
  t.style.height = t.scrollHeight ? `${t.scrollHeight}px` : "";
}
/** the name of a row, ready to type */
function fixName(id: string): void {
  const i = document.querySelector<HTMLTextAreaElement>(`#mvi [data-mvname="${CSS.escape(id)}"]`);
  if (i && !i.disabled) { i.focus(); i.select(); }
}

/** the way out that keeps nothing (BR1 first-timer P 1): the page closes as if it never opened; Esc does the same.
 *  Jev: "Back without saving" 0.06 unclear, "Back, without keeping anything" 0.52, "Leave without keeping" 0.87 */
const Back = () => <button type="button" className="mv-btn ghost mv-back" data-mvclose="1" onClick={() => M.move_in_close()}>‹ Back without saving</button>;

/** the BR1 page: what Claude Code, Codex and Sol's folders hold, kept, fixed or dropped */
function Found({ name, p }: { name: string; p: Person }) {
  const c = ed(name), open = p.unsure.filter((u) => !c.done[u.id] && !c.later[u.id]);
  const asked = new Set(p.unsure.map((u) => u.id.slice(2)));
  const places = p.rows.filter((r) => r.k === "place" && (!asked.has(r.id) || c.done["u:" + r.id] || c.later["u:" + r.id]));
  const ses = p.rows.filter((r) => r.k === "session"), ais = p.rows.filter((r) => r.k === "ai");
  const rows = (rs: Row[]) => rs.map((r) => <RowLine key={r.id} p={p} c={c} r={r} />);
  const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return (
    <div className="mv-page mv-found" data-movein={name}>
      <Back />
      <h1 className="mvi-h">Here’s what you already have</h1>
      <p className="mv-say">Sol found these on this Mac. Keep them, rename one, or remove what isn’t yours. Nothing changes in Claude Code or Codex.</p>
      {p.apps?.length ? <div className="mv-from">{p.apps.map((a) => (
        <span key={a.app} className="mv-src" data-app={a.app}><b className={`mv-appm ${a.app}`}>{a.app === "codex" ? "X" : "C"}</b>{a.name} · {pl(a.projects, "project")} · {pl(a.sessions, "session")}</span>
      ))}</div> : null}
      {p.unsure.map((u) => {
        const s = c.done[u.id] ? "done" : c.later[u.id] ? "later" : "";
        return (
          <div key={u.id} className={`mv-q${s ? " " + s : ""}`} data-q={u.id}>
            <div className="q">{u.q}</div><div className="w">{u.w}</div>
            <div className="mv-qacts">
              {u.opts.map(([l, a], i) => <button key={l} className={`mv-btn ${i ? "ghost" : "pri"}`} data-mvans={`${u.id}|${a}|${l}`} onClick={() => M.move_in_answer(u.id, a, l)}>{l}</button>)}
            </div>
            <div className="said">{s === "later" ? "In Waiting on you, once you go on: you can answer it there." : `You said: ${c.done[u.id] || ""}`}{" "}
              <a className="mv-lk" data-mvreopen={u.id} role="button" tabIndex={0} onClick={() => M.move_in_answer(u.id, "reopen")}>change</a></div>
          </div>
        );
      })}
      {places.length ? <section className="mv-sec">
        <div className="mv-ph"><b>Folders</b><span className="mv-hint">one per project you’ve worked in</span></div>
        {rows(places)}
      </section> : null}
      {ses.length ? <section className="mv-sec">
        <div className="mv-ph"><b>Sessions</b><span className="mv-hint">{ses.length} open · each in its folder</span></div>
        {rows(ses)}
      </section> : null}
      {ais.length ? <section className="mv-sec">
        <div className="mv-ph"><b>{ais.length === 1 ? "Your AI" : "Your AIs"}</b></div>
        {rows(ais)}
      </section> : null}
      <div className="mv-end">
        <button className="mv-btn pri" data-mvmine="1" onClick={() => M.these_are_mine()}>Keep these</button>
        <span>{footOf(p, c)} · anything you leave alone is kept{open.length ? ` · ${open.length} still unsure: Sol asks again in Waiting on you` : ""}</span>
      </div>
      <p className="mv-priv" data-mvpriv="1">Read on this Mac only: folder names, which files exist, skill and tool names. Sol doesn’t send your files or rules anywhere, and never writes to <code>~/.claude</code> or <code>~/.codex</code>.</p>
      <p className="mv-keys"><kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>F</kbd> rename · <kbd>⌫</kbd> remove · <kbd>⌘↩</kbd> keep these · <kbd>esc</kbd> back without saving
        {p.moved ? <> · <a className="mv-lk" data-mvskip="1" role="button" tabIndex={0} onClick={() => M.these_are_mine(true)}>skip, look later</a></> : null}</p>
    </div>
  );
}

function Page({ name, p }: { name: string; p: Person }) {
  const c = ed(name), t = tally(p, c), open = p.unsure.filter((u) => !c.done[u.id] && !c.later[u.id]);
  const pl = (z: string) => p.rows.filter((r) => r.k === "place" && r.z === z), ses = p.rows.filter((r) => r.k === "session"), ais = p.rows.filter((r) => r.k === "ai");
  const them = open.length === 1 ? "it is" : "they are";
  const rows = (rs: Row[]) => rs.map((r) => <RowLine key={r.id} p={p} c={c} r={r} />);
  return (
    <div className="mv-page" data-movein={name}>
      <Back />
      <div className="mv-date">{p.moved ? "Moving in" : "Your first run · last step"}</div>
      <h1 className="mvi-h">{p.moved ? "These are your places, sessions and AIs." : "This is what I found."}</h1>
      <p className="mv-say">Keep, fix or remove. Anything you leave alone is kept. A folder you remove is archived, in Sessions › Archived; nothing is deleted.</p>
      {open.length ? <div className="mv-unsure"><span className="mv-cnt">{open.length}</span><span>{open.length === 1 ? "One thing I’m unsure of" : `${open.length} things I’m unsure of`}, first. Kept as {them} if you go on.</span></div> : null}
      {p.unsure.map((u) => {
        const s = c.done[u.id] ? "done" : c.later[u.id] ? "later" : "";
        return (
          <div key={u.id} className={`mv-q${s ? " " + s : ""}`} data-q={u.id}>
            <div className="q">{u.q}</div><div className="w">{u.w}</div>
            <div className="mv-qacts">
              {u.opts.map(([l, a], i) => <button key={l} className={`mv-btn ${i ? "ghost" : "pri"}`} data-mvans={`${u.id}|${a}|${l}`} onClick={() => M.move_in_answer(u.id, a, l)}>{l}</button>)}
              <button className="mv-btn ghost" data-mvlater={u.id} onClick={() => M.move_in_skip(u.id)}>Ask me later</button>
            </div>
            <div className="said">{s === "later" ? "In Waiting on you, once you go on: you can answer it there." : `You said: ${c.done[u.id] || ""}`}{" "}
              <a className="mv-lk" data-mvreopen={u.id} role="button" tabIndex={0} onClick={() => M.move_in_answer(u.id, "reopen")}>change</a></div>
          </div>
        );
      })}
      <section className="mv-sec">
        <div className="mv-ph"><b>Places</b><span className="mv-hint">{pl("Build").length + pl("Life").length} · where things live</span></div>
        {pl("Build").length ? <><div className="mv-sub">Build</div>{rows(pl("Build"))}</> : null}
        {pl("Life").length ? <><div className="mv-sub">Life</div>{rows(pl("Life"))}</> : null}
      </section>
      <section className="mv-sec">
        <div className="mv-ph"><b>Sessions</b><span className="mv-hint">{ses.length ? `${ses.length} open · each in its place` : "none open"}</span></div>
        {rows(ses)}
        <p className="mv-more">{p.finished} finished {p.finishedWord || "sessions"} stay in their places’ history, findable with ⌘P.</p>
      </section>
      <section className="mv-sec">
        <div className="mv-ph"><b>{ais.length === 1 ? "Your AI" : "Your AIs"}</b><span className="mv-hint">{ais.length} · with the plan each runs on and its routines</span></div>
        {rows(ais)}
      </section>
      <div className="mv-end">
        <span><b>{t.kept} kept</b>{t.fixed ? `, ${t.fixed} fixed` : ""}{t.shelved ? `, ${t.shelved} archived` : ""}{t.dropped - t.shelved ? `, ${t.dropped - t.shelved} hidden` : ""}.{open.length ? ` ${open.length} still unsure: kept as ${them} if you go on.` : ""}</span>
        <button className="mv-btn pri" data-mvmine="1" onClick={() => M.these_are_mine()}>Keep these</button>
      </div>
      <p className="mv-keys"><kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>F</kbd> rename · <kbd>⌫</kbd> remove · <kbd>⌘↩</kbd> keep these · <kbd>esc</kbd> back without saving
        {p.moved ? <> · <a className="mv-lk" data-mvskip="1" role="button" tabIndex={0} onClick={() => M.these_are_mine(true)}>skip, look later</a></> : null}</p>
    </div>
  );
}

/** the keys while the screen is up (merge/movein.js keydown), heard before the shell's */
function keys(e: KeyboardEvent): void {
  const name = st.open;
  if (!name) return;
  const tg = e.target as HTMLElement | null, i = tg?.closest?.<HTMLTextAreaElement>("[data-mvname]") ?? null;
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    if (i && i.value !== nm(ed(name), { id: i.dataset.mvname!, n: i.defaultValue })) M.move_in_row(i.dataset.mvname!, "fix", i.value);
    M.these_are_mine(); return;
  }
  if (i) {
    if (e.key === "Enter") { e.preventDefault(); i.blur(); }
    else if (e.key === "Escape") { i.value = i.defaultValue; i.blur(); }
    e.stopPropagation(); return;
  }
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); M.move_in_close(); return; }
  const rows = [...document.querySelectorAll<HTMLElement>("#mvi .mv-row[tabindex]")];
  if (!rows.length) return;
  const at = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>(".mv-row") ?? null;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); e.stopPropagation();
    const k = Math.max(0, Math.min(rows.length - 1, rows.indexOf(at!) + (e.key === "ArrowDown" ? 1 : -1)));
    rows[k].focus(); rows[k].scrollIntoView({ block: "nearest" }); return;
  }
  if (!at || at.dataset.locked) return;
  if (e.key === "f" || e.key === "F") { e.preventDefault(); e.stopPropagation(); fixName(at.dataset.row!); }
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault(); e.stopPropagation();
    const id = at.dataset.row!;
    M.move_in_row(id, at.classList.contains("tb") ? "keep" : "drop");
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#mvi [data-row="${CSS.escape(id)}"]`)?.focus());
  }
}

/** the screen: drawn while a canvas has it open, nothing otherwise */
export default function Movein() {
  const name = useNext(() => st.open), p = personOf(name);
  useEffect(() => {
    document.addEventListener("keydown", keys, true);
    return () => document.removeEventListener("keydown", keys, true);
  }, []);
  if (!name || !p) return null;
  // the first move-in of a judged read is the migration (migration.html C, D); a move-in kept before keeps the list
  return <div className="mvi-scroll">{migrates(p) ? <Migration name={name} p={p} /> : p.apps ? <Found name={name} p={p} /> : <Page name={name} p={p} />}</div>;
}
