// A folder's stickies, managed for real (#1228): make one, change its words, tick it done, drop it (with undo), press
// it and watch its agent work. The engine keeps them in the folder's stickies.md (stickies.ts → agent.sticky,
// agent.press); this only asks and draws. The run pane opens for any run of this folder, the one pressed here or one the
// clock started, and draws its steps as the engine tells them (agent.step): what started it, each tool in use, each file
// made, how it ended. Every change says what it did in Home's line, with its undo.
// Agents inside Home (#1327, 2026-11-18): `doer` is the jelly of the agent that does this folder's stickies, beside each
// open one (a press opens its desk in Home); `peek` draws "again?" on a sticky ticked done when Sol noticed a job there.
// The blank sticky (#1483) leads them: typing anywhere fills it, Enter puts it in this folder. Today (#1487): a due read
// from the words' end is kept under the sticky; each one shows its due, and one more than a day late waits at the top.
// What was made (#1490): the stickies are paper on the place's surface (no longer rows drawn as tall folder cards,
// #1486); what a run made for one (its did: lines, made.ts) is a dark card clipped under it, new until opened; one made
// for a sticky already done waits on the surface while new, and in the made pile at the place's foot always.
// Finish or drop (#1493): the person ticks, Sol never does; after a run that made something, the foot's act is "✓ done";
// "drop it" (one word everywhere) keeps it a day for undo; carried, a tray rises (done · drop it · Today); Delete drops
// the sticky in focus; the done pile shows the done ones with "bring back".
// The trust gate (#1497): the foot's press says how far it goes (do it · draft it · get it ready, the engine's reach from
// the words); a draft or an ask made for it puts its act there (Send, Pay …): the first press opens it whole, the next
// is the person's yes, held a moment for undo, after which the engine runs that step and ticks the sticky done.
import { useEffect, useState, type ReactNode } from "react";
import { lastOf, PRESS, useStickies, type Made, type RunOf, type Via } from "./stickies";
import { BlankSticky } from "./Blank";
import { dueIn, dueOf, dueText, dueWord, placeOrder } from "./due";
import { onToday, ranLast, UNDO_FOR, zonesFor } from "./finishZones";
import { useCarry } from "./Finish";
import { isNew, madeIn, type MadeThing } from "./madeLines";
import { MadeCard, MadePile, MadeSheet, SOL, tellOpened, useSeen, useYes, type Maker } from "./Made";
import "./today.css";

type Ask = <T>(o: object, ms: number) => Promise<T | null>;
type Sub = (f: (m: any) => void) => () => void;

const secs = (from: number, to = Date.now()) => { const s = Math.max(0, Math.round((to - from) / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
const working = (m: Made) => m.notes.some((n) => /← now\s*$/.test(n));

/** the run, as it goes: one line per step; while it goes, the seconds count */
function RunPane({ run, onClose }: { run: RunOf; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { if (run.end) return; const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t); }, [run.end]);
  const steps = run.steps.filter((s) => s.kind === "tool" || s.kind === "made");
  const what = run.sticky ? `“${run.sticky}”` : run.steps[0]?.text ?? run.rule;
  const end = run.end;
  return (
    <div className="ob-door" data-run-pane data-run-state={end ? (end.ok ? "done" : "failed") : "working"} style={{ flexDirection: "column", alignItems: "stretch", gap: 6, marginTop: 12 }}>
      <div className="t-body">
        <b>{end ? (end.ok ? (end.report === "blocked" || end.report === "waiting" ? "Needs you" : "Done") : "Stopped") : "Working on"}</b> {what}
        <span className="fh-note"> · {run.sticky ? "you pressed it" : "the clock started it"} · {secs(run.at, end?.at)}</span>
      </div>
      {steps.length === 0 && !end && <div className="fh-note">The agent is reading the folder. Each page it opens and each file it makes shows here.</div>}
      {steps.map((s, i) => (
        <div key={s.id ?? `${s.kind}-${i}`} className="fh-note" data-run-step={s.kind}>
          {s.kind === "made" ? "wrote " : ""}{s.text}{s.kind === "tool" ? (s.done ? (s.ok === false ? " · failed" : " · done") : " · now") : ""}
        </div>
      ))}
      {end && <div className="t-body" data-run-end>{end.text}</div>}
      {end && <div><button type="button" className="ob1-btn" onClick={onClose}>close</button></div>}
    </div>
  );
}

const CHECK = <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** `place`: the place's id (made things are keyed by it); `maker`: who works here (the place's agent, else Sol); `seen`
 *  and `see`: the made things opened, shared with Home's made row (its own when not given) */
export function FolderStickies({ ask, sub, folder, name, dry, say, doer, peek, place, maker = SOL, seen: seenIn, see: seeIn }: { ask: Ask; sub: Sub; folder: string | null; name: string; dry: boolean; say: (text: string, undo?: () => void) => void; doer?: ReactNode; peek?: (sticky: string) => ReactNode; place?: string; maker?: Maker; seen?: ReadonlySet<string>; see?: (key: string) => void }) {
  const b = useStickies(ask, folder, name, sub);
  const own = useSeen();
  const seen = seenIn ?? own.seen, see = seeIn ?? own.see;
  const [opened, setOpened] = useState<MadeThing | null>(null);
  const [pile, setPile] = useState(false);
  const made = madeIn(place ?? name, b.items ?? []);
  const openMade = (x: MadeThing) => { tellOpened(ask, x, isNew(x, seen), pile ? "pile" : "place"); see(x.key); setPile(false); setOpened(x); };
  const [editing, setEditing] = useState<{ key: string; t: string; s: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const busy = !!b.run && !b.run.end;
  const now = Date.now();
  const open = placeOrder((b.items ?? []).filter((m) => !m.done), now), done = (b.items ?? []).filter((m) => m.done);

  const make = async (t: string): Promise<void> => {
    const d = dueIn(t);
    const r = await b.add(d?.t ?? t, d?.due);
    if (!r) throw new Error("not made");   // the words stay on the blank sticky; useStickies says why (b.err)
    const key = r.key ?? t, due = d ? dueOf([`due: ${d.due}`]) : null;
    say(`Made “${key}”${due !== null ? `, due ${dueWord(due)}` : ""}.`, () => void b.remove(key));
  };
  const save = async () => {
    if (!editing) return;
    const was = b.items?.find((m) => m.t === editing.key);
    const r = await b.edit(editing.key, editing.t, editing.s);
    if (!r) return;
    setEditing(null);
    const now = editing.t.trim() || editing.key;
    if (was && (now !== was.t || editing.s.trim() !== was.s)) say(`Changed to “${now}”.`, () => void b.edit(now, was.t, was.s));
  };
  const tick = async (m: Made, d: boolean, via: Via = "button") => { if (await b.done(m.t, d, via)) say(d ? `Done: “${m.t}”.` : `Brought back: “${m.t}”.`, () => void b.done(m.t, !d)); };
  const drop = async (m: Made, via: Via = "button") => { const undo = await b.remove(m.t, via); if (undo) say(`Dropped “${m.t}”.`, () => void undo()); };
  const toToday = async (m: Made) => {
    const was = dueOf(m.notes), due = onToday();
    if (await b.due(m.t, dueText(due))) say(`On Today: “${m.t}”, ${dueWord(due)}.`, () => void b.due(m.t, was === null ? null : dueText(was)));
  };
  const carry = useCarry((key, z) => {
    const m = b.items?.find((x) => x.t === key);
    if (!m) return;
    if (z === "done") void tick(m, true, "carry"); else if (z === "drop") void drop(m, "carry"); else void toToday(m);
  });
  const press = async (m: Made) => {
    const r = await b.press(m.t);
    if (r?.ok) { const needs = r.ticket?.needs?.title; say(needs ? `“${m.t}” needs one thing from you: ${needs.replace(/\.$/, "")}.` : `“${m.t}” ran. What it did is under it.`); }
  };
  // the trust gate (#1497): a draft or an ask made for it waits on the person; the first press opens it whole, then its act
  const yes = useYes(ask, say, UNDO_FOR);
  const waitingFor = (m: Made) => made.find((x) => x.sticky === m.t && x.waiting);
  const act = (x: MadeThing) => { if (!seen.has(x.key)) openMade(x); else if (folder) yes(folder, x); };

  const row = (m: Made) => {
    // a did: line is a made card now (clipped under, or in the made pile), so the slip keeps only an asked line
    const last = lastOf(m)?.startsWith("did: ") ? null : lastOf(m), now = working(m), due = dueOf(m.notes), w = waitingFor(m), how = PRESS[m.reach ?? "does"];
    if (editing?.key === m.t) return (
      <div key={m.t} className="fh-sticky fh-slip editing" data-sticky={m.t} data-sticky-editing>
        <input className="ob1-box" autoFocus value={editing.t} aria-label="what the sticky is" onChange={(ev) => setEditing({ ...editing, t: ev.target.value })} onKeyDown={(ev) => { if (ev.key === "Enter") void save(); if (ev.key === "Escape") setEditing(null); }} data-sticky-t />
        <input className="ob1-box" value={editing.s} placeholder="what it asks (optional)" aria-label="what it asks" onChange={(ev) => setEditing({ ...editing, s: ev.target.value })} onKeyDown={(ev) => { if (ev.key === "Enter") void save(); if (ev.key === "Escape") setEditing(null); }} data-sticky-s />
        <div className="ft"><button type="button" className="go" onClick={() => void save()} data-sticky-save>save</button><button type="button" className="x" onClick={() => setEditing(null)}>cancel</button></div>
      </div>
    );
    return (
      <div key={m.t} className="fh-sticky fh-slip" data-sticky={m.t} data-sticky-state={m.done ? "done" : now ? "working" : "open"}
        onPointerDown={m.done || now ? undefined : carry.down(m.t, zonesFor(due, false))} onClickCapture={carry.swallow}
        onKeyDown={(ev) => { if ((ev.key === "Delete" || ev.key === "Backspace") && !now && !(ev.target as HTMLElement).closest("input")) { ev.preventDefault(); void drop(m, "key"); } }}>
        <button type="button" className={`ck ${m.done ? "on" : ""}`} role="checkbox" aria-checked={m.done} disabled={now} aria-label={m.done ? "open it again" : "tick it done"} title={m.done ? "open it again" : "done"} onClick={() => void tick(m, !m.done)} data-sticky-done>{CHECK}</button>
        <button type="button" className="t" title={now ? "its agent is on it" : "change its words"} disabled={now} onClick={() => setEditing({ key: m.t, t: m.t, s: m.s })} data-sticky-edit>
          {m.t}{m.s && <span className="s">{m.s}</span>}
        </button>
        {due !== null && !m.done && <em className={`fh-due ${due < Date.now() ? "passed" : ""}`} data-sticky-due>{dueWord(due)}</em>}
        {(now || last) && <div className="last" data-sticky-last>{now ? "its agent is on it now" : last}</div>}
        <div className="ft">
          {!m.done && !now && w && <button type="button" className="go yes" title={seen.has(w.key) ? `${w.act}: it goes when you press, with a moment to undo` : "open it first: the whole of it, before it leaves you"} onClick={() => act(w)} data-sticky-yes={w.act}>{w.act}</button>}
          {!m.done && !now && !w && ranLast(m) && <button type="button" className="go" title="it made what this asked: tick it done" onClick={() => void tick(m, true)} data-sticky-finish>✓ done</button>}
          {m.done && <button type="button" className="go back" title="open it again" onClick={() => void tick(m, false)} data-sticky-back>bring back</button>}
          {!m.done && !ranLast(m) && !dry && b.agent !== false && <button type="button" className="go" disabled={busy} title={busy ? "its agent is on another one; this one waits for your press" : how[1]} onClick={() => void press(m)} data-sticky-press={m.reach ?? "does"}>{how[0]}</button>}
          {m.done ? peek?.(m.t) : doer}
          <button type="button" className="x" disabled={now} title="drop it: you can undo, and it is kept a day" onClick={() => void drop(m)} data-sticky-drop>drop it</button>
        </div>
      </div>
    );
  };
  /** a sticky, and under it the newest thing made for it (the others are in the made pile) */
  const withMade = (m: Made) => {
    const mine = made.find((x) => x.sticky === m.t);
    if (!mine || editing?.key === m.t) return row(m);
    return <div key={m.t} className="fh-pair" data-sticky-pair={m.t}>{row(m)}<MadeCard x={mine} maker={maker} seen={seen} onOpen={openMade} clipped /></div>;
  };
  // made for a sticky already done: on the surface while new (the newest one each), always in the pile
  const freshAlone = made.filter((x) => !x.open && isNew(x, seen)).filter((x, i, l) => l.findIndex((y) => y.sticky === x.sticky) === i);

  return (
    <section data-stickies={name} style={{ marginTop: 18, maxWidth: 880, width: "100%" }}>
      <div className="fh-date" style={{ marginBottom: 8 }}>stickies · {b.items === null ? "reading…" : `${open.length} open${done.length ? `, ${done.length} done` : ""}`}{dry ? " · record only: nothing runs here" : b.agent === false ? " · this folder has no agent yet, so nothing runs here" : ""}</div>
      {b.run && <RunPane run={b.run} onClose={b.closeRun} />}
      <div className="fh-surface" style={{ marginTop: 16 }} data-surface>
        {folder && <div style={{ width: 220 }}><BlankSticky hint={`a sticky for ${name}`} onPut={make} /></div>}
        {open.map(withMade)}
        {freshAlone.map((x) => <MadeCard key={x.key} x={x} maker={maker} seen={seen} onOpen={openMade} />)}
      </div>
      {showDone && <div className="fh-surface" style={{ marginTop: 22 }} data-done-surface>{done.map(row)}</div>}
      {b.err && <p className="fh-note" data-sticky-err style={{ marginTop: 8 }}>{b.err}</p>}
      <div className="fh-foot-piles">
        <MadePile list={made} seen={seen} onOpen={() => setPile(true)} />
        <button type="button" className={`fh-pile ${done.length ? "" : "empty"}`} disabled={!done.length} onClick={() => setShowDone((x) => !x)} data-sticky-show-done>
          <span className="sheets"><i /><i /><i /></span>{showDone ? "hide done" : `done${done.length ? ` · ${done.length}` : ""}`}
        </button>
      </div>
      {pile && (
        <div className="fh-made-veil" onClick={() => setPile(false)} data-made-pile-open>
          <div className="fh-made-sheet" onClick={(ev) => ev.stopPropagation()}>
            <div className="nm">Made here</div>
            <div className="fh-surface" style={{ paddingTop: 6, overflow: "auto" }}>{made.map((x) => <MadeCard key={x.key} x={x} maker={maker} seen={seen} onOpen={openMade} />)}</div>
            <div className="acts"><button type="button" className="ob1-btn" onClick={() => setPile(false)}>close</button></div>
          </div>
        </div>
      )}
      {opened && <MadeSheet ask={ask} dir={folder} x={opened} maker={maker} where={name} onClose={() => setOpened(null)} onYes={folder ? (x) => yes(folder, x) : undefined} />}
      {carry.tray}
    </section>
  );
}
