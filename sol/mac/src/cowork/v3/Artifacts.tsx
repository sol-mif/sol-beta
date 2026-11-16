// Cowork v3, slice 7 (fr-30, #560): Artifacts. The shelf (a project's documents, pages, tables, canvases and flows, each
// a small picture of itself with its two marks and its version), and one artifact opened on the stage: its body, live
// (a change is saved on leaving the line, as one new version), and its versions as a strip of dots under it. One gesture
// back: "back to v2" (or ⌘[) writes v2 again as the newest version; nothing is deleted, every dot stays. A dot pressed
// shows that version, and "Bring v1 back" makes it the newest. Export gives it in its own format.
import { useEffect, useRef, useState } from "react";
import { Glyph } from "../Room";
import { Marks } from "./SevenMarks";
import { ask, download, kindGlyph, KIND_WORD, KINDS, useRead, when, who, type ArtKind, type Artifact, type ArtVersion, type Content, type Shape } from "./seven";
import "./seven.css";

type Got = { art: Artifact; versions: ArtVersion[] };

/** the Artifacts room: the shelf, or the one open on the stage */
export function Artifacts({ project, name, me, open, onOpen }: { project: string; name: string; me: string; open?: string; onOpen: (id?: string) => void }) {
  return open ? <ArtStage project={project} id={open} me={me} onBack={() => onOpen()} /> : <Shelf project={project} name={name} me={me} onOpen={onOpen} />;
}

function Shelf({ project, name, me, onOpen }: { project: string; name: string; me: string; onOpen: (id: string) => void }) {
  const { data, error } = useRead<{ artifacts: Artifact[] }>("team.v3.artifacts.list", { project }, 20_000);
  const list = data?.artifacts ?? [];
  const [kind, setKind] = useState<ArtKind>("document");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  const make = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy("making");
    const r = await ask<Got>("team.v3.artifacts.make", { project, kind, title: t });
    setBusy(r.error ?? "");
    if (!r.error) { setTitle(""); onOpen(r.art.id); }
  };
  return (
    <div className="s7 s7-room">
      <header className="s7-head">
        <span className="s7-kicker">Artifacts</span>
        <h1>{name}</h1>
        <p>What you and your agents made that stays: live, versioned, one gesture back. It opens here, on the stage.</p>
      </header>
      {error && <p className="s7-none">{error}</p>}
      <div className="s7-grid">
        {list.map((a, i) => (
          <button key={a.id} className="s7-card" style={{ animationDelay: `${0.04 + i * 0.05}s` }} onClick={() => onOpen(a.id)} title={`open ${a.title} on the stage`}>
            <span className="s7-prev"><Preview a={a} /></span>
            <span className="s7-meta">
              <span className="t">{a.title}</span>
              <span className="l"><span className="k">{KIND_WORD[a.kind]} · v{a.version}</span>{a.waiting && <span className="s7-wait" title="written here; the cloud has not kept it yet">waiting to send</span>}<span className="sp" /><Marks whose={a.whose} place={a.place} me={me} /></span>
            </span>
          </button>
        ))}
        {/* a new one: its kind as five small pictures, its name, Enter */}
        <div className="s7-card s7-new">
          <span className="s7-kinds" role="radiogroup" aria-label="what kind">
            {KINDS.map((k) => <button key={k} role="radio" aria-checked={k === kind} className={k === kind ? "on" : ""} onClick={() => setKind(k)} title={`a ${k}`}><Glyph kind={kindGlyph(k)} size={18} /></button>)}
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void make(); }} placeholder={`Name a new ${kind}`} aria-label={`name a new ${kind}`} />
          <span className="s7-none">{busy || (list.length ? "" : `Nothing kept in ${name} yet.`)}</span>
        </div>
      </div>
    </div>
  );
}

/** what the kind looks like, small, from its last version (the list carries none, so a quiet drawing) */
function Preview({ a }: { a: Artifact }) {
  if (a.kind === "document") return <span className="pv-doc"><b>{a.title}</b>{[92, 100, 84, 0, 96, 70].map((w, i) => <i key={i} className={w ? "" : "gap"} style={{ width: `${w}%` }} />)}</span>;
  if (a.kind === "table") return <span className="pv-table">{[0, 1, 2, 3].map((r) => <span key={r}>{[0, 1, 2].map((c) => <i key={c} className={r === 0 ? "h" : ""} />)}</span>)}</span>;
  if (a.kind === "page") return <span className="pv-page"><b>{a.title}</b><span><i /><i /></span></span>;
  if (a.kind === "canvas") return <span className="pv-canvas"><i style={{ left: "14%", top: "22%" }} /><i style={{ left: "30%", top: "22%" }} className="b" /><em style={{ left: "52%", top: "48%" }} /></span>;
  return <span className="pv-flow"><i /><s /><i /><s /><i /></span>;
}

function ArtStage({ project, id, me, onBack }: { project: string; id: string; me: string; onBack: () => void }) {
  const { data, setData, error } = useRead<Got>("team.v3.artifacts.get", { project, id });
  const [vi, setVi] = useState<number | null>(null);   // the version looked at; null = the newest
  const [said, setSaid] = useState("");
  const [pop, setPop] = useState(0);
  const versions = data?.versions ?? [];
  const n = versions.length, at = vi ?? n - 1, v = versions[at];
  const latest = at === n - 1;
  const tell = (s: string) => { setSaid(s); window.setTimeout(() => setSaid((x) => (x === s ? "" : x)), 6000); };
  const took = (r: Got & { error?: string; wrote?: boolean }, line: string) => {
    if (r.error) { tell(r.error); return; }
    setData({ art: r.art, versions: r.versions }); setVi(null); setPop((p) => p + 1);
    if (r.wrote !== false) tell(line.replace("{v}", String(r.art.version)));
  };
  const edit = async (content: Content) => took(await ask<Got & { wrote?: boolean }>("team.v3.artifacts.edit", { project, id, content }), "Saved as v{v}. The dot before it is how it was.");
  const back = async (to?: number) => {
    const from = to ?? n - 1;
    took(await ask<Got>("team.v3.artifacts.back", { project, id, ...(to ? { to } : {}) }), `v{v} is v${from} again. Nothing was deleted; every dot is still there.`);
  };
  const exp = async () => {
    const r = await ask<{ name: string; mime: string; text: string }>("team.v3.artifacts.export", { project, id, v: at + 1 });
    if (r.error) tell(r.error); else { download(r.name, r.mime, r.text); tell(`${r.name}, v${at + 1}, in its own format.`); }
  };
  // ⌘[ is the one gesture back, as in the prototype
  const backRef = useRef(back); backRef.current = back;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.metaKey && e.key === "[" && !(e.target as HTMLElement)?.isContentEditable) { e.preventDefault(); if (n > 1) void backRef.current(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);
  if (error && !data) return <div className="s7 s7-room"><button className="s7-crumb" onClick={onBack}>← Artifacts</button><p className="s7-none">{error}</p></div>;
  if (!data || !v) return <div className="s7 s7-room" />;
  const a = data.art;
  return (
    <div className="s7 s7-room s7-stage">
      <button className="s7-crumb" onClick={onBack}>← Artifacts</button>
      <article className={`s7-art k-${a.kind}`}>
        <div className="s7-art-head">
          <span className="s7-art-kind"><Glyph kind={kindGlyph(a.kind)} size={13} />{KIND_WORD[a.kind]}</span>
          <span className="sp" />
          <Marks whose={a.whose} place={a.place} me={me} size={20} />
        </div>
        <div className="s7-art-body" key={`${at}:${pop}`}>
          <Body kind={a.kind} title={v.title} v={v} me={me} editable={latest} onEdit={edit} />
        </div>
        <div className="s7-vers">
          <span className="k">versions</span>
          <span className="s7-strip">
            {versions.map((x, i) => (
              <span key={x.event} className="s7-dotwrap">
                {i > 0 && <i className="s7-line" />}
                <button className={`s7-dot ${i === at ? "on" : ""} ${i === n - 1 ? "last" : ""} ${i === n - 1 && pop ? "pop" : ""}`} onClick={() => setVi(i === n - 1 ? null : i)}
                  title={`v${x.v} · ${who(x.by.person, me)}${x.by.agent ? "'s agent" : ""} · ${when(x.at)}${x.note ? ` · ${x.note}` : ""}`}><span>v{x.v}</span></button>
              </span>
            ))}
          </span>
          <span className="sp" />
          {!latest ? <>
            <span className="s7-quiet">looking at v{at + 1}, {who(v.by.person, me)}, {when(v.at)}</span>
            <button className="v3s-press ink" onClick={() => void back(at + 1)}>Bring v{at + 1} back</button>
          </> : n > 1 ? <button className="v3s-press ghost" title="one gesture back (⌘[): the version before, as the newest" onClick={() => void back()}>← back to v{n - 1}</button> : null}
          <button className="v3s-press ghost" onClick={() => void exp()} title="this version in its own format">Export</button>
        </div>
        {said && <p className="s7-said" role="status">{said}</p>}
      </article>
    </div>
  );
}

/** the bodies, per kind; the newest version can be changed in place, a change kept on leaving the line */
function Body({ kind, title, v, me, editable, onEdit }: { kind: ArtKind; title: string; v: ArtVersion; me: string; editable: boolean; onEdit: (c: Content) => void }) {
  const c = v.content;
  const ed = (was: string, put: (s: string) => Content) => (e: React.FocusEvent<HTMLElement>) => {
    const t = (e.currentTarget.textContent ?? "").trim();
    if (t !== was.trim()) onEdit(put(t));
  };
  const ce = editable ? { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false } : {};
  if (kind === "document") {
    const secs = c.sections ?? [];
    return (
      <div className="s7-paper">
        <div className="s7-paper-title">{title}</div>
        <div className="s7-paper-by">{who(v.by.person, me) === "you" ? "You" : v.by.person}{v.by.agent ? "'s agent" : ""} · v{v.v}{v.note ? ` · ${v.note}` : ""}</div>
        {secs.map((s, i) => (
          <section key={i}>
            <h4 {...ce} onBlur={ed(s.h, (t) => ({ sections: secs.map((x, j) => (j === i ? { ...x, h: t } : x)) }))}>{s.h}</h4>
            <p {...ce} onBlur={ed(s.p, (t) => ({ sections: secs.map((x, j) => (j === i ? { ...x, p: t } : x)) }))}>{s.p}</p>
          </section>
        ))}
        {editable && <button className="s7-add" onClick={() => onEdit({ sections: [...secs, { h: "New section", p: "…" }] })}>+ a section</button>}
      </div>
    );
  }
  if (kind === "table") {
    const cols = c.cols ?? [], rows = c.rows ?? [];
    return (
      <div className="s7-tablewrap">
        <table className="s7-table">
          <thead><tr>{cols.map((h, i) => <th key={i} {...ce} onBlur={ed(h, (t) => ({ cols: cols.map((x, j) => (j === i ? t : x)), rows }))}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{cols.map((_, ci) => <td key={ci} {...ce} onBlur={ed(r[ci] ?? "", (t) => ({ cols, rows: rows.map((x, j) => (j === ri ? cols.map((_, k) => (k === ci ? t : x[k] ?? "")) : x)) }))}>{r[ci]}</td>)}</tr>)}</tbody>
        </table>
        {editable && <button className="s7-add" onClick={() => onEdit({ cols, rows: [...rows, cols.map(() => "")] })}>+ a row</button>}
      </div>
    );
  }
  if (kind === "page") {
    return (
      <div className="s7-page">
        <div className="hero"><div className="h" {...ce} onBlur={ed(c.hero ?? "", (t) => ({ ...c, hero: t }))}>{c.hero}</div>
          <div className="p" {...ce} onBlur={ed(c.p ?? "", (t) => ({ ...c, p: t }))}>{c.p || (editable ? "Write here." : "")}</div></div>
        <div className="cards">{(c.cards ?? []).map((x, i) => <div key={i} className="card" {...ce} onBlur={ed(x, (t) => ({ ...c, cards: (c.cards ?? []).map((y, j) => (j === i ? t : y)) }))}>{x}</div>)}
          {editable && <button className="s7-add" onClick={() => onEdit({ ...c, cards: [...(c.cards ?? []), "a card"] })}>+ a card</button>}</div>
      </div>
    );
  }
  if (kind === "canvas") {
    const shapes = c.shapes ?? [];
    return (
      <div className="s7-canvas">
        {shapes.map((s, i) => <CanvasShape key={i} s={s} editable={editable} onText={(t) => onEdit({ shapes: shapes.map((x, j) => (j === i ? { ...x, t } : x)) })} />)}
        {editable && <button className="s7-add" style={{ position: "absolute", right: 12, bottom: 10 }} onClick={() => onEdit({ shapes: [...shapes, { k: "note", x: 40 + (shapes.length % 5) * 6, y: 60, t: "a note" }] })}>+ a note</button>}
      </div>
    );
  }
  const parts = c.parts ?? [];
  return (
    <div className="s7-flow">
      <div className="pics">{parts.map((p, i) => <span key={i} className="part">{i > 0 && <s />}<i title={p}>{p.slice(0, 1).toUpperCase()}</i><small>{p}</small></span>)}</div>
      <p {...ce} onBlur={ed(c.words ?? "", (t) => ({ ...c, words: t }))}>{c.words}</p>
    </div>
  );
}

function CanvasShape({ s, editable, onText }: { s: Shape; editable: boolean; onText: (t: string) => void }) {
  const at = { left: `${s.x}%`, top: `${s.y}%` };
  if (s.k === "sw") return <i className={`cs-sw tone-${s.tone ?? 0}`} style={at} />;
  if (s.k === "ring") return <i className="cs-ring" style={at} />;
  if (s.k === "pill") return <span className={`cs-pill tone-${s.tone ?? 0}`} style={{ ...at, width: `${s.w ?? 30}%` }}>{s.t}</span>;
  if (s.k === "mark") return <span className="cs-mark" style={{ ...at, width: s.s ?? 48, height: s.s ?? 48 }} />;
  return <span className="cs-note" style={at} contentEditable={editable} suppressContentEditableWarning spellCheck={false}
    onBlur={(e) => { const t = (e.currentTarget.textContent ?? "").trim(); if (t !== (s.t ?? "")) onText(t); }}>{s.t}</span>;
}
