// A folder open (#692, pieces/folder.mjs, agent.mjs, context.mjs, automation.mjs, moves.mjs mo-drop and mo-dial),
// slice C of the pass 2 build. The head: where you are (home › school › bio 201, each step a way back), the rule in one
// sentence, the tools; then the dial (read · propose · draft · act; sliding it lights the jobs that would change before
// you let go) and who works here (Codex · Claude; a child shows its parent's, dimmed, until it picks its own). Below:
// what it knows, grouped by kind, its own and then each child's under the child's name; what is inside it; its
// stickies; what was made here, each turning over to its back; the log. Drop a file, a link or words anywhere on it:
// they are in its context, and it says so within a second. The automations folder shows its automations instead of
// stickies: what, for which folder, when, the last run.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { Metas } from "../meta";
import { BackCard, FileMark, Ink, Pill } from "../../kit";
import { DIALS, usePick, type Automation, type Ctx, type Dial, type Folder, type Home2Api, type Made, type Place, type StepLine } from "./pass2";
import { agentName, agentOf, canTake, dropInto, kids, live, saidOf, subtree } from "./folders";
import { RunLog } from "./RunLog";
import "./folders.css";

export const meta = {
  FolderView: {
    job: "a folder open: what it knows, who works it and how far, what it is doing, what it made",
    flow: "mine",
    states: ["a folder", "a folder with nothing in it", "dropping a file", "added (the said line)", "sliding the dial", "the automations folder", "a made thing turned over"],
    keys: [
      { press: "Esc", does: "back to the main view" },
      { press: "click a step of the crumb", does: "opens that folder, or home", opens: "FolderView" },
      { press: "drop a file, a link or words", does: "adds it to this folder's context (home.folder.drop)", goal: "mine" },
      { press: "click a made thing", does: "turns it over to its back", opens: "BackCard" },
    ],
    listens: ["home.state › folders, context, log, made, stickies, automations"],
  },
  FolderDial: {
    job: "how far Sol goes on its own in this folder: read · propose · draft · act; what would change lights while sliding",
    flow: "mine",
    states: ["at rest", "sliding: what would change, lit", "nothing would change", "set"],
    keys: [
      { press: "drag along it, or click a step", does: "lights what would change (home.dial.try); letting go sets it (home.folder.set)", goal: "mine" },
      { press: "← →", does: "moves the dial a step and lights what would change" },
      { press: "Enter", does: "sets it where it is" },
      { press: "Esc", does: "leaves it as it was" },
    ],
    listens: ["home.dial.tried"],
  },
  FolderAgent: {
    job: "who works this folder: Codex or Claude; a child shows its parent's, dimmed, until it picks its own",
    flow: "mine",
    states: ["its own pick", "its parent's, dimmed", "switched: the next jobs start on it"],
    keys: [{ press: "click Codex or Claude", does: "the folder's agent; the next job starts on it (home.folder.set)", goal: "mine" }],
    listens: ["home.state › folders"],
  },
  FolderContext: {
    job: "what a folder knows, by kind: its own, then each child's under the child's name",
    flow: "mine",
    states: ["rows", "nothing yet: drop something here", "the drop line while dragging", "a new row in yellow", "a learned row asking keep · no"],
    keys: [
      { press: "click × on a row", does: "forgets it in this folder and every job from now (home.context.forget)" },
      { press: "keep · no on a learned row", does: "keeps it for every job here, or forgets it and never learns it again" },
    ],
    listens: ["home.state › context"],
  },
  FolderAutos: {
    job: "the automations folder: each automation, the folder it runs for, its when, its last run; pause from its row",
    flow: "mine",
    states: ["automations", "a failed run", "paused", "waits on mail"],
    keys: [{ press: "click pause or on", does: "pauses it or puts it back on (home.auto.set)" }],
    listens: ["home.state › automations"],
  },
  FolderInside: {
    job: "the folders inside this one, each with its count; make one more inside",
    flow: "mine",
    states: ["none inside", "folders inside", "naming a new one", "a name already there"],
    keys: [{ press: "click a folder", does: "opens it", opens: "FolderView" }, { press: "+ a folder inside, a name, Enter", does: "makes it (home.folder.make)" }],
    listens: ["home.state › folders"],
  },
  FolderStickies: {
    job: "the stickies filed in this folder and the ones inside it, each with its step; write one that files here",
    flow: "mine",
    states: ["none yet", "stickies with their steps"],
    keys: [{ press: "write and Enter", does: "a sticky filed here (home.dump.line with this folder)" }],
    listens: ["home.state › stickies", "home.step"],
  },
  FolderMade: {
    job: "what was made in this folder, newest first; each turns over to its back",
    flow: "mine",
    states: ["absent: nothing made", "made things", "one turned over"],
    keys: [{ press: "click a made thing", does: "turns it over: made from, under, by, took, doubts", opens: "BackCard" }],
    listens: ["home.state › made", "home.made"],
  },
  FolderLog: {
    job: "every step in this folder and the ones inside it, newest first",
    flow: "mine",
    states: ["nothing yet", "lines"],
    keys: [],
    listens: ["home.state › log"],
  },
} satisfies Metas;

const KIND_GROUPS: { h: string; kinds: Ctx["kind"][] }[] = [
  { h: "files", kinds: ["file"] }, { h: "sites", kinds: ["site"] }, { h: "people", kinds: ["person"] },
  { h: "notes", kinds: ["note"] }, { h: "said · learned", kinds: ["said", "learned"] },
];
const NEW_MS = 8000;
const ext = (p: string) => (/\.([a-z0-9]+)$/i.exec(p)?.[1] ?? "").toLowerCase();
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  if (Number.isNaN(+d)) return iso;
  return d.toDateString() === now.toDateString() ? d.toTimeString().slice(0, 5) : d.toLocaleDateString(undefined, { weekday: "short" }).toLowerCase();
};

export function FolderView({ h, id, setPlace }: { h: Home2Api; id: string; setPlace: (p: Place) => void }) {
  const fs = live(h.st);
  const f = fs.find((x) => x.id === id);
  const [over, setOver] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const depth = useRef(0);
  useEffect(() => { setSaid(null); setOver(false); depth.current = 0; }, [id]);
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(null), 6000); return () => clearTimeout(t); }, [said]);
  const ctx = usePick("ctx");   // what it knows: the first column, or a side column at the right edge (pass2.ts PICKS)
  if (!f) return null;
  const autos = f.kind === "automations" || f.kind === "type";

  const enter = (e: DragEvent) => { if (!canTake(e.dataTransfer)) return; e.preventDefault(); depth.current++; setOver(true); };
  const leave = () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); };
  const drop = async (e: DragEvent) => {
    if (!canTake(e.dataTransfer)) return;
    e.preventDefault(); e.stopPropagation(); depth.current = 0; setOver(false);
    const rs = await dropInto(h, f.id, e.dataTransfer);
    if (!rs.length) return;
    setSaid(saidOf(rs));
    setFresh((x) => [...x, ...rs.map((r) => (r as { row?: { id?: string } }).row?.id).filter((v): v is string => !!v)]);
  };

  return (
    <section className={`p2-tile p2-folder${over ? " over" : ""}`} data-p2="folder-view" data-folder={f.id}
      onDragEnter={enter} onDragOver={(e) => { if (canTake(e.dataTransfer)) e.preventDefault(); }} onDragLeave={leave} onDrop={drop}>
      <header className="fo-head">
        <nav className="fo-crumb" aria-label="where you are">
          <button type="button" onClick={() => setPlace({ at: "today" })}>home</button>
          {f.crumb.map((c, i) => {
            const anc = ancestors(fs, f)[i];
            return <span key={i}><i aria-hidden>›</i>{i === f.crumb.length - 1 ? <b>{c}</b> : <button type="button" onClick={() => anc && setPlace({ at: "folder", id: anc.id })}>{c}</button>}</span>;
          })}
        </nav>
        <p className="fo-rule"><small>rule</small><span className={f.rule ? "" : "inherited"}>{f.rule || ruleOf(fs, f) || "none yet"}</span></p>
        {f.tools.length > 0 && <div className="fo-tools">{f.tools.map((t) => <span key={t} className="fo-chip">{t}</span>)}</div>}
        <div className="fo-hand">
          <FolderDial h={h} f={f} />
          <FolderAgent h={h} f={f} fs={fs} />
        </div>
      </header>
      {said && <p className={`fo-said${said.bad ? " bad" : ""}`} data-p2="said" role="status" aria-live="polite">{said.text}</p>}
      <div className="fo-cols" data-ctx-at={ctx}>
        <FolderContext h={h} f={f} fs={fs} over={over} fresh={fresh} />
        <div className="fo-mid">
          {autos ? <FolderAutos h={h} f={f} fs={fs} /> : <><FolderInside h={h} f={f} fs={fs} setPlace={setPlace} /><FolderStickies h={h} f={f} fs={fs} /></>}
          <FolderMade h={h} f={f} fs={fs} />
        </div>
        <FolderLog h={h} f={f} fs={fs} />
      </div>
    </section>
  );
}

function ancestors(fs: Folder[], f: Folder): Folder[] {
  const out: Folder[] = [];
  for (let x: Folder | undefined = f; x; x = x.parent ? fs.find((y) => y.id === x!.parent) : undefined) out.unshift(x);
  return out;
}
const ruleOf = (fs: Folder[], f: Folder) => ancestors(fs, f).reverse().find((x) => x.rule)?.rule ?? "";

// ---- the dial ----
type Lit = { id: string; kind: "job" | "automation"; text: string; would: string; line: string };
export function FolderDial({ h, f }: { h: Home2Api; f: Folder }) {
  const [to, setTo] = useState<Dial | null>(null);
  const [lit, setLit] = useState<{ dial: Dial; lit: Lit[]; summary: string } | null>(null);
  const [note, setNote] = useState("");
  const track = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const asked = useRef<Dial | null>(null);
  useEffect(() => { setTo(null); setLit(null); setNote(""); }, [f.id]);
  const look = (d: Dial) => {
    setTo(d);
    if (asked.current === d) return;
    asked.current = d;
    if (d === f.dial) { setLit(null); return; }
    void h.ask<{ type: string; dial: Dial; lit: Lit[]; summary: string }>({ type: "home.dial.try", id: f.id, dial: d }).then((r) => { if (r.type === "home.dial.tried" && asked.current === r.dial) setLit(r); });
  };
  const cancel = () => { setTo(null); setLit(null); asked.current = null; down.current = false; };
  const set = async (d: Dial | null) => {
    down.current = false; asked.current = null;
    if (!d || d === f.dial) { cancel(); return; }
    const r = await h.ask<{ type: string; said?: string; error?: string }>({ type: "home.folder.set", id: f.id, dial: d });
    setNote(r.type === "home.error" ? r.error ?? "" : r.said ?? "");
    setTo(null); setLit(null);
  };
  const at = (x: number): Dial | null => {
    const el = track.current; if (!el) return null;
    const bs = [...el.querySelectorAll<HTMLElement>("[data-dial]")];
    let best: Dial | null = null, dist = Infinity;
    for (const b of bs) { const r = b.getBoundingClientRect(), c = r.left + r.width / 2, d = Math.abs(x - c); if (d < dist) { dist = d; best = b.dataset.dial as Dial; } }
    return best;
  };
  const onDown = (e: PointerEvent) => { down.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); const d = at(e.clientX); if (d) look(d); };
  const onMove = (e: PointerEvent) => { if (!down.current) return; const d = at(e.clientX); if (d && d !== to) look(d); };
  const onUp = () => { if (down.current) void set(to); };
  const onKey = (e: KeyboardEvent) => {
    const i = DIALS.indexOf(to ?? f.dial);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const j = Math.max(0, Math.min(DIALS.length - 1, i + (e.key === "ArrowRight" ? 1 : -1))); look(DIALS[j]); }
    else if (e.key === "Enter") { e.preventDefault(); void set(to); }
    else if (e.key === "Escape" && to) { e.preventDefault(); e.stopPropagation(); cancel(); }
  };
  const sliding = to !== null && to !== f.dial;
  return (
    <div className="fo-dial" data-p2="dial">
      <small>how far Sol goes on its own</small>
      <div ref={track} className="fo-track" role="slider" tabIndex={0} aria-label={`${f.name}: how far Sol goes on its own`}
        aria-valuemin={0} aria-valuemax={3} aria-valuenow={DIALS.indexOf(to ?? f.dial)} aria-valuetext={to ?? f.dial}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={cancel} onKeyDown={onKey}>
        {DIALS.map((d) => (
          <span key={d} data-dial={d} className={`${d === f.dial ? "on" : ""}${sliding && d === to ? " to" : ""}`}>
            {sliding && d === to ? <Ink k="dash">{d}</Ink> : d}
          </span>
        ))}
      </div>
      {sliding && lit && lit.dial === to && (
        <div className="fo-lit" data-p2="dial-lit" aria-live="polite">
          <b>{lit.summary}</b>
          {lit.lit.slice(0, 5).map((l) => <div key={l.id} data-lit={l.id}>{l.line}</div>)}
          <small>let go to set · esc leaves it at {f.dial}</small>
        </div>
      )}
      {!sliding && note && <p className="fo-note" data-p2="dial-note">{note}</p>}
    </div>
  );
}

// ---- the agent ----
export function FolderAgent({ h, f, fs }: { h: Home2Api; f: Folder; fs: Folder[] }) {
  const { agent, from } = agentOf(fs, f.id);
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [f.id]);
  const pick = async (a: "codex" | "claude") => {
    if (f.agent === a) return;
    const r = await h.ask<{ type: string; note?: string; error?: string }>({ type: "home.folder.set", id: f.id, agent: a });
    setNote(r.type === "home.error" ? r.error ?? "" : r.note ?? "");
  };
  const back = async () => { const r = await h.ask<{ type: string; note?: string }>({ type: "home.folder.set", id: f.id, agent: null }); setNote(r.note ?? ""); };
  return (
    <div className={`fo-agent${from ? " inherited" : ""}`} data-p2="agent" data-agent={agent} data-inherited={from ? "1" : undefined}>
      <small>works on</small>
      <Pill words={["Codex", "Claude"]} picked={agent === "codex" ? 0 : 1} h={24} onPick={(i) => void pick(i === 0 ? "codex" : "claude")} />
      {from ? <small className="fo-from">from {from.name}</small> : f.parent ? <button type="button" className="fo-link" onClick={() => void back()}>use {fs.find((x) => x.id === f.parent)?.name}'s</button> : null}
      {note && <p className="fo-note" data-p2="agent-note">{note}</p>}
    </div>
  );
}

// ---- what it knows ----
export function FolderContext({ h, f, fs, over, fresh }: { h: Home2Api; f: Folder; fs: Folder[]; over: boolean; fresh: string[] }) {
  const all = h.st?.context ?? {};
  const own = all[f.id] ?? [];
  const children = kids(fs, f.id).map((c) => ({ c, rows: subtree(fs, c.id).flatMap((x) => all[x] ?? []) })).filter((x) => x.rows.length);
  const now = Date.now();
  const isNew = (r: Ctx) => fresh.includes(r.id) || now - +new Date(r.at) < NEW_MS || r.kept === null;
  const row = (r: Ctx, kind = false) => (
    <div key={r.id} className={`fo-c${isNew(r) ? " new" : ""}${r.carry === false ? " dim" : ""}`} data-ctx={r.id} data-kind={r.kind}>
      {r.kind === "file" && <span className="fo-mark"><FileMark ext={ext(r.path ?? r.name)} h={16} /></span>}
      <span className="fo-cn">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</span>
      {(kind || r.line) && <small>{kind ? r.kind : r.from === "said" || r.kind === "said" ? "said" : r.kind === "learned" ? "learned" : r.line}</small>}
      {r.kind === "learned" && r.kept === null
        ? <span className="fo-ask"><button type="button" onClick={() => void h.ask({ type: "home.context.set", id: r.id, kept: true })}>keep</button><button type="button" onClick={() => void h.ask({ type: "home.context.forget", id: r.id })}>no</button></span>
        : <button type="button" className="fo-x" title={`forget ${r.name}`} aria-label={`forget ${r.name}`} onClick={() => void h.ask({ type: "home.context.forget", id: r.id })}>×</button>}
    </div>
  );
  const empty = !own.length && !children.length;
  return (
    <div className="fo-tile fo-ctx" data-p2="context">
      <h4>what {f.name} knows</h4>
      {over && <div className="fo-drop" data-p2="drop-line"><Ink k="dash">let go to add it to {f.name}</Ink></div>}
      {empty && !over && <p className="fo-empty">nothing yet: drop a file, a link or some words here</p>}
      {KIND_GROUPS.map((g) => {
        const rows = own.filter((r) => g.kinds.includes(r.kind));
        return rows.length ? <div key={g.h} className="fo-g"><h5>{g.h}</h5>{rows.map((r) => row(r))}</div> : null;
      })}
      {children.map(({ c, rows }) => (
        <div key={c.id} className="fo-g fo-child" data-child={c.id}><h5>{c.name}</h5>{rows.slice(0, 6).map((r) => row(r, true))}{rows.length > 6 && <small className="fo-more">and {rows.length - 6} more in {c.name}</small>}</div>
      ))}
    </div>
  );
}

// ---- what is inside it ----
function FolderInside({ h, f, fs, setPlace }: { h: Home2Api; f: Folder; fs: Folder[]; setPlace: (p: Place) => void }) {
  const cs = kids(fs, f.id);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const make = async () => {
    if (busy.current) return;
    const n = name.trim(); if (!n) { setNaming(false); return; }
    busy.current = true;
    const r = await h.ask<{ type: string; folder?: Folder; error?: string }>({ type: "home.folder.make", name: n, parent: f.id });
    busy.current = false;
    if (r.type === "home.error") { setErr(r.error ?? ""); return; }
    setNaming(false); setName(""); setErr("");
  };
  return (
    <div className="fo-tile fo-inside" data-p2="inside">
      <h4>inside {f.name}</h4>
      {cs.map((c) => {
        const n = c.counts.waits + c.counts.running;
        return <button type="button" key={c.id} className="fo-row" data-folder={c.id} onClick={() => setPlace({ at: "folder", id: c.id })}><span>{c.name}</span>{n > 0 && <small className={c.counts.waits ? "waits" : ""}>{n}</small>}</button>;
      })}
      {naming
        ? <input className="fo-name" autoFocus value={name} placeholder="a name" aria-label={`a new folder inside ${f.name}`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void make(); if (e.key === "Escape") { e.stopPropagation(); setNaming(false); } }} onBlur={() => void make()} />
        : <button type="button" className="fo-link" data-p2="make-inside" onClick={() => setNaming(true)}>+ a folder inside</button>}
      {err && <p className="fo-note bad">{err}</p>}
    </div>
  );
}

// ---- its stickies ----
function FolderStickies({ h, f, fs }: { h: Home2Api; f: Folder; fs: Folder[] }) {
  const under = useMemo(() => new Set(subtree(fs, f.id)), [fs, f.id]);
  const list = (h.st?.stickies ?? []).filter((s) => under.has(s.folder) && s.state !== "dropped");
  const [text, setText] = useState("");
  const write = () => { const t = text.trim(); if (!t) return; h.send({ type: "home.dump.line", text: t, at: new Date().toISOString(), folder: f.id }); setText(""); };
  return (
    <div className="fo-tile fo-stickies" data-p2="folder-stickies">
      <h4>stickies in {f.name}</h4>
      <input className="fo-write" value={text} placeholder="write one; it files here" aria-label={`write a sticky in ${f.name}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") write(); }} />
      {list.slice(0, 8).map((s) => {
        const last = s.steps[s.steps.length - 1];
        const where = s.folder !== f.id ? fs.find((x) => x.id === s.folder)?.name : null;
        return (
          <div key={s.id} className={`fo-s s-${s.state}`} data-sticky={s.id}>
            <span className="fo-cn">{s.text}</span>
            <small>{[where, s.state === "asks" ? s.ask?.q ?? "needs you" : last?.line ?? s.state, agentName(s.agent)].filter(Boolean).join(" · ")}</small>
          </div>
        );
      })}
    </div>
  );
}

// ---- what was made here ----
function FolderMade({ h, f, fs }: { h: Home2Api; f: Folder; fs: Folder[] }) {
  const under = useMemo(() => new Set(subtree(fs, f.id)), [fs, f.id]);
  const made = (h.st?.made ?? []).filter((m) => under.has(m.folder)).slice().sort((a, b) => b.at.localeCompare(a.at));
  const [peeled, setPeeled] = useState<string | null>(null);
  if (!made.length) return null;
  const ctxName = new Map(Object.values(h.st?.context ?? {}).flat().map((c) => [c.id, c.name]));
  return (
    <div className="fo-tile fo-made" data-p2="made">
      <h4>made here</h4>
      {made.slice(0, 8).map((m) => (
        <div key={m.id} className="fo-m" data-made={m.id}>
          <button type="button" className="fo-row" aria-expanded={peeled === m.id} onClick={() => setPeeled(peeled === m.id ? null : m.id)}>
            <span className="fo-mark"><FileMark ext={ext(m.path) || "md"} h={16} /></span><span className="fo-cn">{m.title}</span><small>{when(m.at)}</small>
          </button>
          {peeled === m.id && <BackCard b={backOf(m, fs, ctxName)} />}
        </div>
      ))}
    </div>
  );
}
function backOf(m: Made, fs: Folder[], names: Map<string, string>) {
  const b = m.back, where = fs.find((x) => x.id === (b?.under.folder ?? m.folder));
  return {
    title: m.title,
    size: m.kind,
    from: (b?.made_from ?? []).map((x) => names.get(x) ?? x.split("/").pop() ?? x),
    under: `${where ? where.crumb.join(" › ") : "a folder"}${b ? ` · ${b.under.dial}` : ""}`,
    agent: b ? `${agentName(b.agent)} · ${b.model}` : "",
    took: b ? `${Math.max(1, Math.round(b.took_ms / 1000))} s` : "",
    doubts: b?.doubts ?? [],
    undo: !!b?.undo,
  };
}

// ---- the log ----
function FolderLog({ h, f, fs }: { h: Home2Api; f: Folder; fs: Folder[] }) {
  const logs = h.st?.log ?? {};
  const steps: StepLine[] = subtree(fs, f.id)
    .flatMap((x) => (logs[x] ?? []).map((l) => ({ ...l, x })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30)
    .map((l) => ({ at: l.at, line: l.x !== f.id ? `${fs.find((y) => y.id === l.x)?.name} · ${l.line}` : l.line, kind: (l.kind === "ok" || l.kind === "fail" ? (l.kind === "fail" ? "error" : "made") : l.kind ?? "step") as StepLine["kind"] }));
  return (
    <div className="fo-tile fo-log" data-p2="folder-log">
      <h4>log</h4>
      {/* p2: A needs this: the runs in it and its children as run cards (head, steps, made, undo); the flat lines when none ran */}
      {h.st?.stickies?.some((s) => s.steps.length && subtree(fs, f.id).includes(s.folder)) ? <RunLog h={h} folder={f.id} /> : steps.length ? <RunLog steps={steps} /> : <p className="fo-empty">nothing has happened here yet</p>}
    </div>
  );
}

// ---- the automations folder ----
export function FolderAutos({ h, f, fs }: { h: Home2Api; f: Folder; fs: Folder[] }) {
  const all: Automation[] = h.st?.automations ?? [];
  const types = f.kind === "automations" ? kids(fs, f.id) : [f];
  const crumb = (id: string) => fs.find((x) => x.id === id)?.crumb.join(" › ") ?? "an archived folder";
  return (
    <div className="fo-tile fo-autos" data-p2="automations">
      <h4>automations</h4>
      {types.map((t) => {
        const rows = all.filter((a) => a.type === t.id);
        return (
          <div key={t.id} className="fo-g" data-type={t.id}>
            {types.length > 1 && <h5>{t.name}</h5>}
            {!rows.length && <p className="fo-empty">none yet</p>}
            {rows.map((a) => {
              const s = a.paused_by ? "pause" : a.waits ? "waits" : a.last && !a.last.ok ? "fail" : "ok";
              const last = a.paused_by ? `paused ${a.paused_by === "you" ? "by you" : "after 3 fails"}` : a.waits ? `waits on ${a.waits}` : a.last ? `${a.last.at} · ${a.last.line}` : "not run yet";
              return (
                <div key={a.id} className={`fo-a a-${s}`} data-auto={a.id}>
                  <span className="fo-cn">{a.text}</span>
                  <small><b>for {crumb(a.for)}</b> · {a.when} · <span className="fo-last">{last}</span></small>
                  <button type="button" className="fo-link" onClick={() => void h.ask({ type: "home.auto.set", id: a.id, paused: !a.paused_by })}>{a.paused_by ? "on" : "pause"}</button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
