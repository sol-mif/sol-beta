// An agent's desk (#1327, pass 2, play.html's "desk"): the one place an agent is changed by hand. Its places as tiles
// (× takes one out, a dashed one of its kind presses in, each with undo); its work, where a press on a line opens the fix
// ("Always like this?": Always · Just this once; the same fix twice is learned anyway, with undo); its steps, where a
// typed change is rehearsed on the last run (Before and After: Keep · Back); how far (looks · drafts · does); Pause (it
// sleeps, its work stays). At most one lit offer: "Always like this?" first, else its question.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Pill } from "../kit";
import { CURVE } from "../kit/tokens";
import { Jelly } from "./Jelly";
import { HOW, withLine, blankLine, cardStatus, changeOfLearned, dayRows, doingOf, homeCount, howFar, howWords, placeLine, postureOf, questionOf, saidOf, whenWord, workParts, workTitle, type AgentRow, type AskRow, type Change, type DeskRead, type Work } from "./model";
import { Go, Quiet, Surface, pressed } from "./ui";
import type { Ask } from "./useAgents";

export type Said = { line: string; ok: boolean; undo?: string; back?: () => Promise<boolean> };

/** the person's fix written into the file the run made (Home's route: the folder's place, then work.read and work.write
 *  over the file as it was read); its undo writes the line back. A file that cannot be written is named, never hidden */
async function writeFix(ask: Ask, w: Work, before: string, after: string): Promise<{ ok: boolean; why?: string; back?: () => Promise<boolean> }> {
  if (!w.file) return { ok: true };
  const t = await ask<{ ok: boolean; path?: string; why?: string }>({ type: "agent.tickets", folder: w.folder }, 8000);
  if (!t?.ok || !t.path) return { ok: false, why: `${w.file} could not be reached (${t?.why ?? "the engine did not answer"})` };
  const put = async (from: string, to: string) => {
    const r = await ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd: t.path, path: w.file }, 8000);
    if (!r || r.error) return `${w.file} could not be read (${r?.error ?? "the engine did not answer"})`;
    const text = withLine(r.text ?? "", from, to);
    if (text === null) return `${w.file} no longer has that line`;
    const wr = await ask<{ ok?: boolean; error?: string }>({ type: "work.write", cwd: t.path, path: w.file, text, ...(r.hash ? { hash: r.hash } : {}) }, 8000);
    return wr?.ok ? null : `${w.file} was not saved (${wr?.error ?? "the engine did not answer"})`;
  };
  const why = await put(before, after);
  return why ? { ok: false, why } : { ok: true, back: async () => (await put(after, before)) === null };
}
type Rehearsal = { line: string; before: string; after: string };

export function Desk({ a, changes, now, ask, onSaid, say0 }: { a: AgentRow; changes: Change[]; now: number; ask: Ask; onSaid: (s: Said) => void;
  /** a change already typed (the dev page's still of the rehearsal): rehearsed once on open */
  say0?: string }) {
  const [d, setD] = useState<DeskRead | null>(null);
  const [dErr, setDErr] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);   // `${run}:${line}` of the line being fixed
  const [asked, setAsked] = useState<AskRow | null>(null);        // the fix that asks "Always like this?" right now
  const [said, setSaid] = useState("");                            // the change typed in the steps
  const [rehearsal, setRehearsal] = useState<Rehearsal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const read = useCallback(async () => {
    const r = await ask<{ ok: boolean; why?: string } & DeskRead>({ type: "agents.desk", id: a.id }, 15_000);
    if (!r) setDErr("Its work cannot be read right now: the engine did not answer.");
    else if (!r.ok) setDErr(`Its work cannot be read: ${r.why ?? "the engine refused"}.`);
    else { setD({ work: r.work ?? [], more: r.more ?? [] }); setDErr(null); }
  }, [ask, a.id]);
  // the desk reads again whenever the list does (agents.changed): `a` is a new object then
  useEffect(() => { void read(); }, [read, a]);
  useEffect(() => { setNaming(false); setEditing(null); setAsked(null); setRehearsal(null); setSaid(""); }, [a.id]);

  const press = async (what: string, o: { type: string } & Record<string, unknown>) => {
    setBusy(what);
    const r = await pressed(ask, o, what, onSaid);
    setBusy(null);
    return r;
  };
  const asleep = postureOf(a) === "paused";
  const ask1 = asked ?? a.asks?.[0] ?? null;
  const q = questionOf(a);
  const how = howFar(a);

  const fix = async (w: Work, before: string, after: string) => {
    setEditing(null);
    if (!after.trim() || after.trim() === before.trim()) return;
    setBusy("fix");
    const wrote = await writeFix(ask, w, before, after);
    if (!wrote.ok) { setBusy(null); onSaid({ ok: false, line: `Not fixed: ${wrote.why}.` }); return; }
    const place = w.place;
    const r = await ask<{ ok: boolean; why?: string; ask?: string; learned?: { line: string } | null; change?: Change }>({ type: "agents.fix", id: a.id, place, before, after: after.trim() }, 30_000);
    setBusy(null);
    void read();
    if (!r?.ok) { onSaid({ ...saidOf(r, "the fix"), ...(wrote.back ? { line: `Fixed in ${w.file}, but ${a.name} did not hear it: ${r?.why ?? "the engine did not answer"}.` } : {}) }); return; }
    if (r.ask) { setAsked({ fix: "", place, before, after: after.trim(), q: r.ask }); onSaid({ ok: true, line: `Fixed in ${w.name}.`, ...(wrote.back ? { back: wrote.back } : {}) }); return; }
    if (r.learned) { setAsked(null); onSaid({ ok: true, line: `Learned: ${r.learned.line}. The same fix twice, so it does it this way now.`, ...(r.change ? { undo: r.change.id } : {}) }); }
  };
  const always = async (yes: boolean) => {
    if (!ask1) return;
    setBusy(yes ? "always" : "once");
    const r = await ask<{ ok: boolean; why?: string; learned?: { line: string } | null; change?: Change }>({ type: "agents.fix", id: a.id, place: ask1.place, before: ask1.before, after: ask1.after, always: yes }, 30_000);
    setBusy(null); setAsked(null);
    if (!r?.ok) { onSaid(saidOf(r, yes ? "Always" : "Just this once")); return; }
    onSaid(yes && r.learned ? { ok: true, line: `Learned: ${r.learned.line}. Its open work is redone.`, ...(r.change ? { undo: r.change.id } : {}) } : { ok: true, line: "Kept as you fixed it, this once." });
  };
  const rehearse = () => rehearseLine(said);
  async function rehearseLine(typed: string) {
    const line = typed.trim();
    if (!line) return;
    setBusy("change");
    const r = await ask<{ ok: boolean; why?: string; before?: string; after?: string; same?: { line: string } }>({ type: "agents.change", id: a.id, line }, 120_000);
    setBusy(null);
    if (!r?.ok) { onSaid(saidOf(r, "the change")); return; }
    if (r.same) { onSaid({ ok: true, line: `It knows that already: ${r.same.line}.` }); setSaid(""); return; }
    setRehearsal({ line, before: r.before ?? "", after: r.after ?? "" });
  }
  useEffect(() => { if (say0) { setSaid(say0); void rehearseLine(say0); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const keepChange = async () => {
    if (!rehearsal) return;
    const r = await press("Keep the change", { type: "agents.change", id: a.id, line: rehearsal.line, keep: true });
    if (r?.ok) { setRehearsal(null); setSaid(""); }
  };

  return (
    <div className="ag-desk" data-place="talk">
      <header className="ag-desk-top">
        <Jelly size={104} doing={asleep ? "rest" : ask1 ? "needs" : doingOf(a.state)} turn={a.turn} className={asleep ? "ag-asleep" : undefined} />
        <div className="ag-cell">
          {naming
            ? <NameField name={a.name} onDone={(n) => { setNaming(false); if (n && n !== a.name) void press("rename", { type: "agents.rename", id: a.id, name: n }); }} />
            : <h1 className="ag-title ag-big-title"><button type="button" className="ag-bare ag-rename" onClick={() => setNaming(true)} title="rename it">{a.name}</button></h1>}
          <p className="ag-dim">{a.role || a.job}</p>
          <p className="ag-mute">{asleep ? "Paused by you · its work stays" : cardStatus(a, now)}{homeCount(a) ? ` · ${homeCount(a)}` : ""}</p>
        </div>
        {asleep ? <Go busy={busy === "wake"} onClick={() => void press("wake", { type: a.state === "off" ? "agents.mode" : "agents.rest", id: a.id, ...(a.state === "off" ? { mode: "watch" } : { on: false }) })}>Wake</Go>
          : <Quiet onClick={() => void press("pause", { type: "agents.rest", id: a.id, on: true })}>Pause</Quiet>}
      </header>

      {ask1 ? (
        <Surface step="raised" className="ag-bar" role="group" aria-label="Always like this?">
          <Jelly size={40} doing="needs" toward={[1, 0]} turn={a.turn} />
          <span className="ag-ask-q">Always like this? <span className="ag-dim">“{ask1.before}” → “{ask1.after}”</span></span>
          <Go busy={busy === "always"} onClick={() => void always(true)}>Always</Go>
          <Quiet small onClick={() => void always(false)}>Just this once</Quiet>
        </Surface>
      ) : (a.stucks ?? []).length ? (a.stucks ?? []).map((s) => (
        <Surface step="raised" className="ag-bar" key={s.site} data-site={s.site}>
          <Jelly size={40} doing="needs" toward={[1, 0]} turn={a.turn} />
          <span className="ag-ask-q">Waiting on {s.site}{s.since ? ` since ${whenWord(new Date(s.since).toISOString(), now)}` : ""}. Sign in and it picks up where it stopped.</span>
          <Go busy={busy === `Sign in to ${s.site}`} onClick={() => void press(`Sign in to ${s.site}`, { type: "agents.signin", folder: s.folder, rule: s.rule })}>Sign in</Go>
        </Surface>
      )) : q && !q.desk && q.send.type === "agents.signin" ? (
        <Surface step="raised" className="ag-bar">
          <Jelly size={40} doing="needs" toward={[1, 0]} turn={a.turn} />
          <span className="ag-ask-q">{q.q}</span>
          <Go busy={busy === "answer"} onClick={() => void press(q.yes, q.send)}>{q.yes}</Go>
        </Surface>
      ) : null}

      <p className="ag-lbl">Where</p>
      <div className="ag-tiles">
        {(a.places ?? []).map((p) => (
          <Surface step="raised" key={p.place} className="ag-tile ag-place" data-place-id={p.place}>
            <b>{p.name}</b><small>{placeLine(p, now)}</small>
            {(a.places ?? []).length > 1 && <button type="button" className="ag-x" aria-label={`take ${p.name} out`} title={`take ${p.name} out; what it made there stays`}
              onClick={() => void press(`${p.name} out`, { type: "agents.scope", id: a.id, remove: p.place })}>×</button>}
          </Surface>
        ))}
        {(d?.more ?? []).map((m) => (
          <button type="button" key={m.place} className="ag-tile ag-ghost" data-place-id={m.place} onClick={() => void press(`${m.name} in`, { type: "agents.scope", id: a.id, add: m.place })}>
            <span className="ag-plus" aria-hidden>+</span><b>{m.name}</b><small>{m.why ?? (m.ask ? `is ${m.name} one of these?` : "a place like these · press to add")}</small>
          </button>
        ))}
        {!(a.places ?? []).length && !(d?.more ?? []).length && <p className="ag-mute">No place yet.</p>}
      </div>

      <div className="ag-grid2">
        <div className="ag-min">
          <p className="ag-lbl">Its day</p>
          {(a.steps ?? []).length > 0
            ? <ol className="ag-day">{dayRows(a).map((s, i) => (
                <li key={`${s.when}#${s.what}#${i}`} className="ag-dstep" data-only={s.only ?? undefined}><em>{s.when}</em><span className="ag-cell">{s.what}</span>
                  {s.only && <small className="ag-only">{s.only} only</small>}</li>
              ))}</ol>
            : <div className="ag-chips"><span className="ag-step"><span>{a.job}</span></span></div>}
          <div className="ag-chips">
            {(a.learned ?? []).map((l) => {
              const c = changeOfLearned(changes, a.id, l.line);
              return <span key={l.id} className="ag-step ag-learned">{l.line}{l.place ? <small> · {(a.places ?? []).find((p) => p.place === l.place)?.name ?? l.place}</small> : null}
                {c && <button type="button" className="ag-x-in" aria-label={`forget: ${l.line}`} onClick={() => void press("forget", { type: "agents.undo", changeId: c.id })}>×</button>}</span>;
            })}
          </div>
          {rehearsal ? (
            <>
              <div className="ag-rehearse">
                <Surface step="box" r={CURVE.radius.field} className="ag-work"><p className="ag-wt">Before</p>{rehearsal.before.split("\n").map((l, i) => <p key={i} className="ag-line">{l}</p>)}</Surface>
                <Surface step="box" r={CURVE.radius.field} className="ag-work"><p className="ag-wt">After · on its last run</p>{after(rehearsal.before, rehearsal.after).map((l, i) => <p key={i} className={`ag-line ${l.new ? "ag-new" : ""}`}>{l.t}</p>)}</Surface>
              </div>
              <div className="ag-acts"><Go busy={busy === "Keep the change"} onClick={() => void keepChange()}>Keep</Go><Quiet onClick={() => setRehearsal(null)}>Back</Quiet></div>
            </>
          ) : (
            <form className="ag-say-change" onSubmit={(ev) => { ev.preventDefault(); void rehearse(); }}>
              <input value={said} onChange={(ev) => setSaid(ev.target.value)} placeholder="Change a step… (it shows you before and after)" aria-label="change a step" maxLength={240} disabled={busy === "change"} />
              {busy === "change" && <span className="ag-mute">trying it on its last run…</span>}
            </form>
          )}
          <p className="ag-lbl">How far it goes</p>
          <div className="ag-how">
            <Pill words={HOW} picked={how && how !== "asks" ? HOW.indexOf(how) : -1} onPick={(i) => { if (HOW[i] !== how) void press(`how far: ${HOW[i]}`, { type: "agents.trust", id: a.id, trust: HOW[i] }); }} />
            <span className="ag-mute">{howWords(how)}</span>
          </div>
          <details className="ag-fold ag-words">
            <summary className="ag-mute">The exact words · {a.rules.length} rule{a.rules.length === 1 ? "" : "s"}</summary>
            {a.rules.map((r) => <p key={`${r.folder}#${r.rule}`} className="ag-mute"><b>{(a.places ?? []).find((p) => p.folder === r.folder)?.name ?? r.folder}</b> {r.sentence}</p>)}
          </details>
        </div>
        <div className="ag-min">
          <p className="ag-lbl">Its work {d && !d.work.length ? <span className="ag-mute">· nothing yet</span> : null}</p>
          {dErr && <p className="ag-say">{dErr}</p>}
          {(d?.work ?? []).map((w, ri) => (
            <Surface step="box" r={CURVE.radius.field} key={`${w.place}${w.at}`} className="ag-work" data-run={ri}>
              <p className="ag-wt">{workTitle(w, now)}</p>
              {w.unread && <p className="ag-say">{w.unread}; it shows what the run says it made.</p>}
              {workParts(w.lines).map((p) => {
                const line = (li: number, body: ReactNode) => {
                  const k = `${ri}:${li}`, l = w.lines[li];
                  return editing === k
                    ? <FixLine key={k} line={l} onDone={(v) => void fix(w, l, v)} onCancel={() => setEditing(null)} />
                    : <button type="button" key={k} className="ag-line ag-press" onClick={() => setEditing(k)} title="press to fix this line">{body}</button>;
                };
                if (p.k === "line") return line(p.i, p.t);
                // a markdown table: its head muted, each filled row a line to press; none filled: one quiet line
                const cols = { "--cols": Math.max(p.head.length, ...p.rows.map((r) => r.cells.length)) } as CSSProperties;
                if (!p.rows.length) return <p key={`t${ri}:${p.head.join("|")}`} className="ag-mute" data-blank>{blankLine(p.blank)}</p>;
                return (
                  <div key={`t${ri}:${p.rows[0].i}`} data-table>
                    {p.head.length > 0 && <p className="ag-thead" style={cols}>{p.head.map((h, hi) => <span key={hi}>{h}</span>)}</p>}
                    {p.rows.map((r) => line(r.i, <span className="ag-trow" style={cols}>{r.cells.map((c, ci) => <span key={ci}>{c}</span>)}</span>))}
                    {p.blank > 0 && <p className="ag-mute">{blankLine(p.blank, p.rows.length)}</p>}
                  </div>
                );
              })}
            </Surface>
          ))}
          {(d?.work.length ?? 0) > 0 && <p className="ag-mute">Press a line to fix it.</p>}
        </div>
      </div>
    </div>
  );
}

/** the after of a rehearsal, each line marked new when the before did not have it */
function after(before: string, afterText: string) {
  const had = new Set(before.split("\n"));
  return afterText.split("\n").map((t) => ({ t, new: !had.has(t) }));
}

function FixLine({ line, onDone, onCancel }: { line: string; onDone: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(line);
  const at = useRef<HTMLInputElement>(null);
  useEffect(() => { at.current?.focus(); at.current?.select(); }, []);
  return (
    <span className="ag-fix">
      <input ref={at} value={v} onChange={(ev) => setV(ev.target.value)} aria-label="the line as it should be"
        onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); onDone(v); } else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onCancel(); } }} />
      <small className="ag-mute">Write it as it should be · Enter</small>
    </span>
  );
}

function NameField({ name, onDone }: { name: string; onDone: (n: string) => void }) {
  const [v, setV] = useState(name);
  const at = useRef<HTMLInputElement>(null);
  useEffect(() => { at.current?.focus(); at.current?.select(); }, []);
  return <input ref={at} className="ag-namef" value={v} aria-label="its name" maxLength={60} onChange={(ev) => setV(ev.target.value)} onBlur={() => onDone(v.trim())}
    onKeyDown={(ev) => { if (ev.key === "Enter") onDone(v.trim()); else if (ev.key === "Escape") { ev.stopPropagation(); onDone(name); } }} />;
}
