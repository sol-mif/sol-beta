// The opened folder (BR1, frame.html part 5: the folder is the session's context). On the left, what every session here
// knows: the folder's place, what the person told it (each with where it came from), its notes, and what finished
// sessions wrote back. On the right its sessions, on three shelves: Needs you, Working, Done. The shelves are only where a
// session starts: the person may move any session anywhere inside, and the place is kept (next.pos.set, id "in:<folder>|
// <piece>"). Done sessions fold to chips. Nothing here deletes a session. A session has no agent name: its folder's mark,
// its task as its title, and a label only for an automation ("automation · x"). ＋ New session in <folder> starts one that
// knows the folder; a session moved to another folder says so in one line from its next message. The head says the
// folder's one count of sessions, the number its card says (place.ts sessionsOf: the move-in read's, or the drawn when
// more; "495 sessions in Claude Code and Codex · 2 need you"), never "no sessions yet" against a busy folder nor the
// shelves' drawn count as a second total (BR1 hold 3), and what the read found in it (a repo, who works here, its rules files) is listed with the rest of
// what every session knows, the same facts as the badge (first-timer line 1), as the drawing's rows: place, rules, pages,
// notes (BR1 conform #3). Two forms (BR1 2+Q2): a press opens it in
// place, the folder's own shape on the canvas's ground; ⤢ opens it up into its page, which adds its parts. Inside either,
// a session wears its folder's mark on the folder's tint, never the dashed mark of a loose one on the canvas.
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { useEffect, useRef, useState } from "react";
import { frame } from "../frame.tsx";
import { D, M, asksOn, childrenOf, piecesIn, regionOf, render, useNext, type Piece } from "../cv/index.ts";
import { stateOf } from "../plane/Face.tsx";
import { tintOf, titleOf } from "../plane/layout.ts";
import { SHELVES, shelfOf, type Folder, type Notes } from "../notes/read.ts";
import { send } from "../notes/link.ts";
import { forgettable, type Known } from "../known.ts";
import { rowOfFolder as readRow } from "../movein/state.ts";
import Circle, { Gone } from "../movein/you/Circle.tsx";
import "../notes/notes.css";
import Parts from "./parts/Parts.tsx";   // a folder's parts, each from a fact Sol saw (BR1 override 4, builder F)
import Placed from "./Placed.tsx";   // where Sol put this folder, and why (BR1 item 4, builder F)
import Setup from "./setup/Setup.tsx";   // the folder's setup, one line under its name (setup.html, builder F10)
import { earlier, headOf, startsKnowing } from "./head.ts";
import { folderKnows } from "./knows.ts";
import Collection from "../Collection.tsx";   // the one list (root part 4)
import { homeDirOf, placeOf, tilde } from "../place.ts";
import { tipAt } from "../tips/tips-state.ts";   // the first Keep open and As a tab show their tips (BR1, builder P9)
import { SessionRow } from "../holders/Holders.tsx";   // a finished session as the Sessions holder's row (walk note item 4)
import { sessionRank } from "../holders/model.ts";

const kept = (rid: string, pid: string) => `in:${rid}|${pid}`;
const tint = (rid: string) =>`pl-t${Math.max(0, tintOf(rid))}`;

/** keep where the person put a session inside this folder: on the engine live, on the page's store either way */
function keep(rid: string, pid: string, x: number, y: number) {
  const id = kept(rid, pid), q = { x: Math.round(x), y: Math.round(y), w: 1, h: 1, by: "person" as const, touched: true, at: Date.now() };
  D.pos = { ...(D.pos || {}), [id]: q };
  send({ type: "next.pos.set", id, x: q.x, y: q.y, w: 1, h: 1, by: "person", touched: true });
  render();
}

function Card({ p, rid, chip, at, onGrab }: { p: Piece; rid: string; chip: boolean; at?: { x: number; y: number }; onGrab: (e: React.PointerEvent, p: Piece) => void }) {
  const st = stateOf(p), asks = asksOn(p.id).length > 0, label = typeof p.label === "string" ? p.label : "";
  const style = at ? { position: "absolute" as const, left: at.x, top: at.y, zIndex: "var(--z-lift)" } : undefined;
  if (chip) {
    return (
      <button className={`fv-chip ${tint(rid)}`} data-session={p.id} style={style} onPointerDown={(e) => onGrab(e, p)} title={`${titleOf(p)} · ${st}`}>
        <span className="nt-fc" />{titleOf(p)}
      </button>
    );
  }
  const others = D.regions.filter((r) => r.id !== rid);
  // frame.html part 5's card: the folder's mark, the task, its status with its dot, the last thing it said (an ask's question first)
  const lastOf = (xs?: string[]) => (xs?.length ? xs[xs.length - 1] : ""), last = p.term?.waiting || lastOf(p.talk) || lastOf(p.term?.lines);
  const tone = asks || st === "waiting" ? "fo-asks" : /fail/.test(st) ? "fo-bad" : /work|start/.test(st) ? "fo-run" : /done|merged/.test(st) ? "fo-good" : "fo-quiet";
  return (
    <div className={`fv-card ${tint(rid)}${asks ? " ask" : ""}`} data-session={p.id} data-inside={rid} style={style} onPointerDown={(e) => onGrab(e, p)}
      role="button" tabIndex={0} aria-label={`Open ${titleOf(p)}`} onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); M.goto(p.id); } }}>
      <div className="fv-hd"><span className="nt-fc" /><b title={titleOf(p)}>{titleOf(p)}</b>{label ? <span className="fv-lbl">{label}</span> : null}</div>
      <small className="fv-st"><span className={`fo-d ${tone}`} />{st}</small>
      {last ? <p className="fv-last">{last}</p> : null}
      <div className="fv-row" onPointerDown={(e) => e.stopPropagation()}>
        <button className="y" data-keep={p.id} onClick={() => { M.besideKeep(p.id); tipAt("keep"); }} title="Keep it open beside the canvas; the folder closes">◧ Keep open</button>   {/* BR1 Q1 (keep.html): beside the canvas, or out to a tab; a press on the card itself opens it */}
        <button data-astab={p.id} onClick={() => { M.tabOpen(p.id, true); tipAt("tab"); }} title="Take it out to a tab">⤢ As a tab</button>
        {others.length ? (
          <select aria-label="Move to another folder" value="" onChange={(e) => { if (e.target.value) M.into_folder(p.id, e.target.value); }}>
            <option value="">Move to…</option>
            {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : null}
      </div>
    </div>
  );
}

/** what every session here knows, as frame.html part 5 draws it (BR1 conform #3): what a session started here is given,
 *  never what Sol knows of the person (their share of time, their hours: You says those): its place on disk, its rules
 *  on one row (a press unfolds each told one as a line of the circle, Forget with Back), its pages, its notes, what
 *  finished sessions wrote back (head.ts knowsRows) */
function Knows({ rid, f, name }: { rid: string; f: Folder | undefined; name: string }) {
  const [telling, setTelling] = useState(false);
  const [gone, setGone] = useState<Known | null>(null);
  const [words, setWords] = useState("");
  const [open, setOpen] = useState(false);
  // what the card's badge counts too (knows.ts); a folder on disk says its place as ~/…, never /Users/<name>/… (scope c)
  const { ks, notes, rows } = useNext(() => folderKnows(rid, (at) => tilde(at, homeDirOf([{ path: at }]))));
  const tell = () => { if (M.folder_tell(rid, words).ok) { setWords(""); setTelling(false); } };
  return (
    <aside className="fv-ctx" aria-label={`What every session in ${name} knows`}>
      <h2>What every session here knows</h2>
      {rows.map((r) => r.k === "rules" && r.facts?.length ? (
        <div key={r.k} className="fv-it" data-knows={r.k}>
          <button type="button" className="fv-rl" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={open ? "Fold its rules" : "See each rule"}>{r.what}<small>{r.small}</small></button>
          {open ? r.facts.map((x) => <Circle key={x.k} size="line" fact={x} where={name} onForget={x.k.startsWith("fact:") && forgettable(x.k) ? (k) => { if (M.folder_forget(rid, k.k).ok) setGone(k); } : undefined} />) : null}
        </div>
      ) : <div key={r.k} className="fv-it" data-knows={r.k}>{r.what}<small>{r.small}</small></div>)}
      {gone ? <Gone fact={gone} onBack={() => { M.folder_forget(rid, gone.k, true); setGone(null); }} /> : null}
      {notes.map((n) => <div key={n.id} className="fv-it">{n.text}<small>a note you pinned</small></div>)}
      {telling ? (
        <div className="fv-row">
          <textarea rows={3} value={words} autoFocus placeholder={`Something every session in ${name} should know`} aria-label={`Tell ${name} something`}
            onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); tell(); } if (e.key === "Escape") { e.stopPropagation(); setTelling(false); } }} />
          <button className="y" disabled={!words.trim()} onClick={tell}>Keep</button>
          <button onClick={() => setTelling(false)}>Not now</button>
        </div>
      ) : <button className="fv-tx" onClick={() => setTelling(true)}>＋ Tell {name} something</button>}
      {f?.backs.length ? <h2>From finished sessions</h2> : null}
      {(f?.backs ?? []).map((b) => <div key={`${b.sessionId}${b.at}`} className="fv-it">{b.words}<small>“{b.title}” wrote this back</small></div>)}
      {!f && !ks.length ? <small>Reading what this folder knows…</small> : !rows.length && !notes.length && !f?.backs.length ? <small data-knows="none">Nothing yet. What you tell {name}, every session here starts knowing.</small> : null}
    </aside>
  );
}

function NewSession({ rid, name }: { rid: string; name: string }) {
  const [words, setWords] = useState("");
  const [open, setOpen] = useState(false);
  // what it will start knowing, the rows Knows lists, said before Start (BR1 conform #6)
  const knew = useNext(() => { const k = folderKnows(rid, (at) => tilde(at, homeDirOf([{ path: at }]))); return startsKnowing(k.rows, k.notes.length, k.f?.backs.length ?? 0).join(" · "); });
  const start = () => { if (M.folder_start(rid, words).ok) { setWords(""); setOpen(false); } };
  if (!open) return <button className="fv-draft" data-new-in={rid} onClick={() => setOpen(true)}><b>＋ New session in {name}</b><small>Starts knowing everything on the left</small></button>;
  return (
    <div className="fv-card fv-new">
      <textarea rows={3} value={words} autoFocus placeholder="What should it do?" aria-label={`A new session in ${name}`}
        onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); } if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }} />
      <small data-knows="new">{knew ? `It starts knowing ${knew}` : `It starts knowing nothing of ${name} yet. What you tell ${name}, every session here knows.`}</small>
      <div className="fv-row"><button className="y" disabled={!words.trim()} onClick={start}>Start ↵</button><button onClick={() => { setWords(""); setOpen(false); }}>Not now</button></div>
    </div>
  );
}

export default function FolderView() {
  const v = useNext((d, s) => {
    const rid = String(s.folder ?? "");
    const ps = piecesIn(rid).filter((p) => p.kind === "session" && !p.inside);
    return { rid, as: s.folderAs === "page" ? "page" : "place", subs: childrenOf(rid).map((c) => `${c}:${placeOf(c).line}`).join(" "), before: earlier(readRow(rid)), ids: ps.map((p) => `${p.id}:${stateOf(p)}:${asksOn(p.id).length}:${p.label ?? ""}:${p.talk?.length ?? 0}:${p.term?.waiting ?? ""}`).join(" "), f: (d.notes as Notes | undefined)?.folders[rid], pos: ps.map((p) => JSON.stringify(d.pos?.[kept(rid, p.id)] ?? null)).join(" ") };
  });
  const main = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const r = regionOf(v.rid);
  if (!r) return <div className="fv"><div className="fv-head"><h1>This folder is gone</h1><button onClick={() => M.page(null)}>Close this folder</button></div></div>;
  const sessions = piecesIn(v.rid).filter((p) => p.kind === "session" && !p.inside);
  const placed = (p: Piece) => D.pos?.[kept(v.rid, p.id)];
  const loose = sessions.filter((p) => !placed(p));
  const on = (s: string) => loose.filter((p) => shelfOf(stateOf(p), asksOn(p.id).length > 0) === s);
  const onShelf = (s: string) => sessions.filter((p) => shelfOf(stateOf(p), asksOn(p.id).length > 0) === s).length;
  // a shelf's count is what it shows; Done's, when fewer are drawn than the one count leaves for it, says of how many
  const rest = Math.max(0, placeOf(v.rid).sessions - onShelf("needs") - onShelf("working"));
  const shelfCount = (s: string) => { const k = on(s).length; return !k ? "" : s === "done" && rest > onShelf("done") ? ` · ${k} of ${rest}` : ` · ${k}`; };
  const pl = placeOf(v.rid), head = headOf(pl.sessions, onShelf("needs"), onShelf("working"), readRow(v.rid), pl.empty ? pl.line : undefined);   // the one count (BR1 hold 3); an empty folder, its card's line
  // move a session anywhere inside: from the press to the release, in the shelves' own pixels, then kept
  const grab = (e: React.PointerEvent, p: Piece) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("select, button:not(.fv-chip)")) return;
    const box = main.current?.getBoundingClientRect(), card = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box) return;
    const ox = e.clientX - card.left, oy = e.clientY - card.top, sx = e.clientX, sy = e.clientY;
    const at = (ev: PointerEvent) => ({ x: Math.max(0, ev.clientX - box.left - ox), y: Math.max(0, ev.clientY - box.top - oy + (main.current?.scrollTop ?? 0)) });
    const mv = (ev: PointerEvent) => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) setDrag({ id: p.id, ...at(ev) }); };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      setDrag(null);
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) { M.goto(p.id); return; }   // a press, not a move: it opens (keep.html)
      const q = at(ev);
      keep(v.rid, p.id, q.x, q.y);
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const where = (p: Piece) => (drag?.id === p.id ? { x: drag.x, y: drag.y } : placed(p) ? { x: placed(p)!.x, y: placed(p)!.y } : undefined);
  const card = (p: Piece, chip: boolean) => <Card key={p.id} p={p} rid={v.rid} chip={chip} at={where(p)} onGrab={grab} />;
  // BR1 2+Q2: a press opens the folder in place, on the canvas's own ground, in frame.html part 5's shape (its tab, what
  // every session here knows, the shelves); ⤢ opens it up into its page, which adds the parts (walk 5); Esc steps back
  // down one form at a time (Next.tsx)
  const page = v.as === "page";
  const shelves = (
    <div className="fv-main" ref={main}>
      <div className="fv-shelves">
        {SHELVES.map((s) => (
          <section key={s.id} className={`fv-shelf${s.id === "done" ? " fv-done" : ""}`} aria-label={s.say}>
            <h2>{s.say}{shelfCount(s.id)}</h2>
            {/* the one list (root part 4): what asks and what works is drawn, an ask's rank first. The rest are rows, as the
                Sessions holder draws them: the week by when each last moved (its updatedAt), newest first, the older ones one
                count line; a row's press takes the session out to a tab (walk note item 4) */}
            {s.id === "done"
              ? <Collection items={on(s.id)} label={s.id} className="hd-co fv-rows" keyOf={(p) => p.id} draw={(p) => <SessionRow key={p.id} p={p} here open={(x) => M.tabOpen(x.id, true)} />}
                  ranking={sessionRank("all")} more={(n) => `${n} ${n === 1 ? "session" : "sessions"} before this week`} />
              : <Collection items={on(s.id)} label={s.id} keyOf={(p) => p.id} draw={(p) => card(p, false)}
                  ranking={{ rank: (p) => (s.id === "needs" ? asksOn(p.id)[0]?.rank ?? 1000 : 0), at: (p) => (typeof p.born === "number" ? p.born : undefined) }}
                  more={(n) => `${n} more`}
                  none={s.id === "needs" ? <p className="fv-none" data-none="needs">Nothing needs you here</p> : null} />}   {/* an empty column says so (BR1 first-timer) */}
            {s.id === "needs" ? <NewSession rid={v.rid} name={r.name} /> : null}
          </section>
        ))}
      </div>
      {sessions.filter((p) => placed(p)).map((p) => card(p, shelfOf(stateOf(p), asksOn(p.id).length > 0) === "done"))}
    </div>
  );
  if (!page) return (
    <div className={`fv fv-place ${tint(v.rid)}`} data-folder={v.rid} data-form="place" onClick={(e) => { if (e.target === e.currentTarget) M.page(null); }}>   {/* a press on the ground around it closes it (keep.html §1) */}
      <section className="fv-of" aria-label={`${r.name}, open in place`}>
        <div className="fv-head fv-oh">
          <span className="fv-tt"><span className="nt-fc" /><h1>{r.name}</h1><span className="fv-sum">{head}</span></span>   {/* on the tab, never past it */}
          <Placed rid={v.rid} />
          <span className="fv-acts">
            <button className="fv-ic" data-folder-page={v.rid} onClick={() => M.folder_page(v.rid)} title={`Open ${r.name} up as a page: what's working, what changed, what's coming up, its files`} aria-label={`Open ${r.name} as a page`}>⤢</button>
            <button className="fv-ic" data-folder-tab={v.rid} onClick={() => M.tabOpen(`folder:${v.rid}`, true)} title={`Keep ${r.name} as a tab`} aria-label={`Keep ${r.name} as a tab`}>◫</button>
            <button className="fv-ic" data-folder-close={v.rid} onClick={() => M.page(null)} title="Close this folder (Esc)" aria-label="Close this folder">×</button>
          </span>
        </div>
        <Setup rid={v.rid} name={r.name} />
        <Inside rid={v.rid} name={r.name} />
        <Knows rid={v.rid} f={v.f} name={r.name} />
        {shelves}
      </section>
      <Said />
    </div>
  );
  return (
    <div className={`fv fv-page ${tint(v.rid)}`} data-folder={v.rid} data-form="page">
      <div className="fv-head">
        <span className="nt-fc" /><h1>{r.name}</h1><span className="fv-sum">{head}</span>
        <Placed rid={v.rid} />
        <button data-folder-place={v.rid} onClick={() => M.folder_place()} title="Back to the folder open in place on the canvas (Esc)">◱ Back in place</button>
        <button onClick={() => M.page(null)}>Close this folder</button>
      </div>
      <Setup rid={v.rid} name={r.name} />
      <Inside rid={v.rid} name={r.name} />
      <Parts rid={v.rid} />
      <Knows rid={v.rid} f={v.f} name={r.name} />
      {shelves}
      <Said />
    </div>
  );
}

/** the folders inside this one (H3, BR1 #1615): the ones its card names ("inside: clean-room, home and 1 more"), each
 *  with its own card line, each opening as this one did; none, no row */
function Inside({ rid, name }: { rid: string; name: string }) {
  const subs = childrenOf(rid);
  if (!subs.length) return null;
  return (
    <nav className="fv-in" aria-label={`Folders in ${name}`}>
      {subs.map((c) => (
        <button key={c} type="button" className={`fv-sub ${tint(c)}`} data-sub={c} onClick={() => M.folder_open(c)}>
          <span className="fv-sn"><span className="nt-fc" />{placeOf(c).name}</span><small>{placeOf(c).line}</small>
        </button>
      ))}
    </nav>
  );
}

/** the one line a folder's moves say (started, told, moved, refused), on the frame's line (frame.tsx) */
function Said() {
  const w = useNext((d) => { const n = d.notes as Notes | undefined; return n?.note || n?.said || ""; });
  useEffect(() => { frame.hold("folder", w ? { text: w } : null); }, [w]);
  useEffect(() => () => frame.hold("folder", null), []);
  return null;
}
