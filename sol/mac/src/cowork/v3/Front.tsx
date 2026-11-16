// Cowork v3, slice 2 (fr-30, #555): the front, all projects. A hello with the one count, then one tile per project
// that wants me (loud first): its name, its people, how many things want me, its one next thing as a press (both marks:
// whose face, where it lives), "N more for you". Quiet projects are one line each. Every tile and line is a drop
// target: a thing dropped on it opens the crossing card. The card is slice 1's (CrossingFoot): the front fires the
// shared DOM event 'sol:cross' and, when nobody answers it (preventDefault), draws the same card itself:
// "→ <project> · Plan  Send  Keep in Home". Send drops the thing in that project's space, with Undo for 8 s.
import { useEffect, useRef, useState } from "react";
import { Body } from "../bits";
import { Glyph } from "../Room";
import type { Team } from "../useTeam";
import { NeedsChip } from "./NeedsMe";
import { useV3, write, placeGlyph, PLACE_WORD, T_THING, T_LOOSE, T_ITEM, type Tile } from "./front-store";
import { greeting } from "./greet";
import "./front.css";

/** what a drop carries: a thing picked up in Sol, words, or files from the desktop */
export type Thing = { title: string; kind: string; whose: string; place: string; from?: { project: string; item?: string } };
export type CrossDetail = { thing: Thing; to: { project: string; spot: "plan" }; from: "front" };

const WORDS = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things", "Seven things", "Eight things", "Nine things"];
const PWORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const MONTH_L = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD_L = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function thingOf(dt: DataTransfer, me: string): Thing | null {
  const sol = dt.getData(T_THING);
  if (sol) { try { const t = JSON.parse(sol) as Thing; if (t?.title) return t; } catch { /* not ours */ } }
  const files = Array.from(dt.files ?? []);
  if (files.length) {
    const f = files[0];
    const kind = /pdf/.test(f.type) ? "pdf" : /image/.test(f.type) ? "photo" : /audio/.test(f.type) ? "voice" : "file";
    return { title: files.length > 1 ? `${f.name} and ${files.length - 1} more` : f.name, kind, whose: me, place: "record" };
  }
  const text = (dt.getData("text/plain") || "").trim();
  if (text) return { title: text.slice(0, 240), kind: /^(https?:\/\/|www\.)\S+$/i.test(text) ? "link" : "note", whose: me, place: "record" };
  return null;
}
const carries = (dt: DataTransfer | null) => !!dt && [...dt.types].some((t) => t === T_THING || t === "text/plain" || t === "Files" || t === T_LOOSE || t === T_ITEM);

export function Front({ team, onOpen }: { team: Team; onOpen: (project: string) => void }) {
  const { front } = useV3(team.ask);
  const me = team.me || front?.me || "";
  const name = (team.state?.me.name || me).split(" ")[0];
  const [hot, setHot] = useState<string | null>(null);
  const [card, setCard] = useState<{ d: CrossDetail; name: string } | null>(null);
  const [sent, setSent] = useState<{ name: string; project: string; token: string; until: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);
  const tiles = front?.tiles ?? [];
  const loud = tiles.filter((t) => !t.quiet), calm = tiles.filter((t) => t.quiet);
  const all = front?.count ?? 0;

  // a drop on a project: the crossing card, slice 1's when it is there, else this one
  const cross = (t: Tile, thing: Thing) => {
    const d: CrossDetail = { thing, to: { project: t.project, spot: "plan" }, from: "front" };
    const ev = new CustomEvent<CrossDetail>("sol:cross", { detail: d, cancelable: true });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) { setSent(null); setCard({ d, name: t.name }); }
  };
  const target = (t: Tile) => ({
    "data-project": t.project,
    onDragOver: (ev: React.DragEvent) => { if (!carries(ev.dataTransfer)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; if (hot !== t.project) setHot(t.project); },
    onDragLeave: (ev: React.DragEvent) => { if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) setHot((h) => (h === t.project ? null : h)); },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault(); setHot(null);
      const thing = thingOf(ev.dataTransfer, me);
      if (thing && thing.from?.project !== t.project) cross(t, thing);
    },
  });
  const send = async () => {
    if (!card) return;
    const { d, name } = card;
    setCard(null);
    const r = await write<{ loose: string; undo: string }>(d.to.project, "drop", { title: d.thing.title, kind: d.thing.kind, place: d.thing.place });
    if (r.error || !r.result) return;
    setSent({ name, project: d.to.project, token: r.result.undo, until: Date.now() + 8000 });
  };
  useEffect(() => { if (!sent) return; const t = window.setTimeout(() => setSent(null), Math.max(0, sent.until - Date.now())); return () => window.clearTimeout(t); }, [sent]);
  const undo = async () => { if (!sent) return; const s = sent; setSent(null); await write(s.project, "undo", { token: s.token }); };

  const quietN = calm.length;
  return (
    <div className="v3 v3-front" data-v3="front">
      <div className="v3-hello">
        <div className="day">{WD_L[now.getDay()]}, {MONTH_L[now.getMonth()]} {now.getDate()}</div>
        <h1>{greeting(now, name)}</h1>
        <p>{all
          ? <><span className="dot" aria-hidden="true" />{WORDS[all] ?? `${all} things`} {all === 1 ? "wants" : "want"} you. {quietN ? `${PWORDS[quietN] ?? quietN} ${quietN === 1 ? "project is" : "projects are"} quiet.` : ""}</>
          : tiles.length ? "Nothing wants you. Every project is quiet." : "No projects yet."}</p>
        <NeedsChip count={all} big />
      </div>

      {(card || sent) && (
        <div className="v3-cross" role="dialog" aria-label="crossing">
          {card ? <>
            <span className="v3-thing"><Body login={card.d.thing.whose || me} size={18} /><span className="t">{card.d.thing.title}</span>
              <span className="where" title={PLACE_WORD[card.d.thing.place] ?? card.d.thing.place}><Glyph kind={placeGlyph(card.d.thing.place)} size={16} /></span></span>
            <span className="to">→ {card.name} · Plan</span>
            <button className="v3-press ink" autoFocus onClick={() => void send()}>Send</button>
            <button className="v3-press ghost" onClick={() => setCard(null)}>Keep in Home</button>
          </> : sent && <>
            <span className="to">Sent to {sent.name} · Space</span>
            <UndoRing until={sent.until} onUndo={() => void undo()} />
          </>}
        </div>
      )}

      {loud.length > 0 && <div className="v3-tiles">
        {loud.map((t, i) => (
          <div key={t.project} className={`v3-tile ${hot === t.project ? "hot" : ""}`} style={{ animationDelay: `${50 + i * 60}ms` }} {...target(t)}
            title={`drop a thing here to send it to ${t.name}`} onClick={() => onOpen(t.project)}>
            <div className="head"><span className="n">{t.name}</span><Faces logins={t.faces} /></div>
            <div className="count"><b>{t.count}</b><span>for you</span></div>
            {t.next && <NextPress t={t} me={me} onGo={() => onOpen(t.project)} />}
            {t.more > 0 && <span className="more">{t.more} more for you</span>}
          </div>
        ))}
      </div>}
      {calm.length > 0 && <div className="v3-quiet">
        {calm.map((t) => (
          <div key={t.project} className={`v3-qline ${hot === t.project ? "hot" : ""}`} {...target(t)} title={`drop a thing here to send it to ${t.name}`} onClick={() => onOpen(t.project)}>
            <span className="n">{t.name}</span><span className="k">Quiet</span>
            <span className="x">{t.next ? <><Body login={t.next.whose} size={14} />{t.next.label}<Glyph kind={placeGlyph(t.next.place)} size={14} /></> : ""}</span>
            <Faces logins={t.faces} />
          </div>
        ))}
      </div>}
      {tiles.length === 0 && front && <p className="v3-none">Make a project in the side, and it gets its tile here.</p>}
    </div>
  );
}

/** a tile's one next thing: press to go to it, or pick it up and drop it on another project */
function NextPress({ t, me, onGo }: { t: Tile; me: string; onGo: () => void }) {
  const n = t.next!;
  const thing: Thing = { title: n.label.replace(/ · from .*$/, "").replace(/ · \d{4}-\d{2}-\d{2}$/, ""), kind: "note", whose: n.whose || me, place: n.place, from: { project: t.project, item: n.item } };
  return (
    <button className={`v3-next ${n.kind === "due" ? "" : "needs"}`} draggable={!!n.item}
      onDragStart={(ev) => { ev.dataTransfer.setData(T_THING, JSON.stringify(thing)); ev.dataTransfer.setData("text/plain", thing.title); ev.dataTransfer.effectAllowed = "copy"; }}
      onClick={(ev) => { ev.stopPropagation(); onGo(); }} title="press to go to it, or drag it onto another project">
      <Body login={n.whose || me} size={16} /><span className="l">{n.label}</span>
      <span className="where" title={PLACE_WORD[n.place] ?? n.place}><Glyph kind={placeGlyph(n.place)} size={14} /></span>
    </button>
  );
}

export function Faces({ logins, max = 4 }: { logins: string[]; max?: number }) {
  if (!logins.length) return null;
  return <span className="v3-faces">{logins.slice(0, max).map((l) => <Body key={l} login={l} size={16} title={l} />)}{logins.length > max && <small>+{logins.length - max}</small>}</span>;
}

/** Undo with its ring: the ring empties over the time left, then it goes */
export function UndoRing({ until, onUndo }: { until: number; onUndo: () => void }) {
  const left = Math.max(0, until - Date.now());
  const ring = useRef<SVGCircleElement>(null);
  return (
    <span className="v3-undo">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" className="track" />
        <circle ref={ring} cx="8" cy="8" r="6.5" className="run" style={{ animationDuration: `${left}ms` }} /></svg>
      <button className="v3-press ghost" onClick={(ev) => { ev.stopPropagation(); onUndo(); }}>Undo</button>
    </span>
  );
}
