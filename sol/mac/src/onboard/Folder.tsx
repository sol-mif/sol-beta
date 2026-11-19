// The one folder (#1088, the designer's): Home's folder (folders.css `.fh-folder`: the tab, the name) drawn as pieces,
// not pills. One.tsx uses it while the person watches (size "s"), OneHome.tsx when Home is theirs (size "l"): the same
// thing in both, so the hand-over changes nothing the person is looking at.
//   a folder shows at most four pieces, each a small picture of one kind of fact:
//     week    seven day columns, a dot where a repeating thing sits, the names of the nearest two
//     coming  the kit's Ring filling as the next date nears, its name and the days left
//     files   the kit's FileMarks, stacked, the newest one's name and how many more
//     places  round letters, one per site, and the most visited one's name
//   "you" (the person's record) is the same folder with its own four: screens to scale, AI tools, connections, apps.
//   dashed while it has nothing; whole once a fact lands; the tab carries the count; a yellow ring only on a piece
//   that holds something unsure. Every piece is a button: pressing it is the parent's (turn it over, open the answer).
//   open (size "l"): a piece that asks nothing turns over on a press (each thing and where it was read), and under the
//   pieces the folder's routines are drawn as lines: when → where → with what; dashed while guessed, whole once kept.
//   A kept routine is the folder's first piece of work: the round "run" at its end does it once, and the line itself
//   is the run: each stop lights as it is opened, the line fills behind it, and what was made is set down at the end.
//   No other surface. (Kept, it is also a sticky in the folder's stickies.md, so the file and Home agree.)
//   `fresh`: the ids a later look brought ("look again" from Home). A piece that holds one wears a small pearl dot,
//   and turned over, the new things are listed first in white; the parent clears them once the folder has been opened.
//   `sure` and `onThing` (#1227): turned over, every thing not kept yet carries "keep" and "not here", the folder's
//   whole setup by touch; the parent writes the answer into the record and the folder's ground.json.
//   `ghosts`: the ids Jev half-believes belong here (0.45 to 0.7). Each is drawn in its piece as a dashed hairline, last,
//   and never named on the closed folder; turned over, its row is dashed with two presses: "keep" (it becomes whole)
//   and "not here" (it goes back to "you"). `shut`: the ids her words closed ("don't read my messages"): struck.
//   `unchecked`: a folder made and not yet checked once (checked.ts): a yellow ring on the whole folder until it is opened.
// A landing fact is the parent's to animate; a piece marks itself `data-piece="<area>:<kind>"` to be the target.
import { useState, type ReactNode } from "react";
import type React from "react";
import { FileMark, Ring } from "../kit";
import type { Found } from "./sort";
import "../home/folders/folders.css";
import "./folder.css";

export type PieceKind = "week" | "coming" | "files" | "places" | "screens" | "ai" | "tools" | "apps";
export type Size = "s" | "l";
export type Scr = { id: string; w: number; h: number; x: number; y: number; main?: boolean };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** the days of the week a "when" names: "Tue/Thu 2pm" → [1, 3] */
export const daysOf = (when = "") => DAYS.map((d, i) => (new RegExp(`\\b${d}`, "i").test(when) ? i : -1)).filter((i) => i >= 0);
/** the hour a "when" names, 24h: "Thu, Nov 19 3pm" → 15 */
export const hourOf = (when = "") => { const m = /(\d{1,2})(?::(\d\d))?\s*(am|pm)/i.exec(when); return m ? (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0) + (m[2] ? +m[2] / 60 : 0) : null; };
/** the days from `now` to the date a "when" names ("Thu, Nov 19 3pm"); null when it names none */
export function daysTo(when = "", now = new Date()) {
  const m = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.? (\\d{1,2})(?:,? (\\d{4}))?`, "i").exec(when);
  if (!m) return null;
  const mo = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  let d = new Date(m[3] ? +m[3] : now.getFullYear(), mo, +m[2]);
  if (!m[3] && d.getTime() < now.getTime() - 864e5) d = new Date(now.getFullYear() + 1, mo, +m[2]);
  return Math.max(0, Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5));
}
/** which piece a fact belongs to */
export function pieceOf(f: Found): PieceKind {
  if (f.k === "screens") return "screens";
  if (f.kind === "ai") return "ai";
  if (f.kind === "tool") return "tools";
  if (f.kind === "machine") return "apps";
  if (f.kind === "event") return f.repeats ? "week" : "coming";
  if (f.kind === "place") return "places";
  return "files";
}
const extOf = (f: Found) => (f.kind === "project" ? "ts" : /\.([a-z0-9]{2,4})$/i.exec(f.v)?.[1]?.toLowerCase() ?? (/invoice|contract|syllabus|guide|plan|resume/i.test(f.v) ? "pdf" : /brief|notes/i.test(f.v) ? "md" : "pdf"));
const one = (s: string) => s.replace(/^(www|mail|docs|drive|calendar)\./, "").trim()[0]?.toUpperCase() ?? "·";
const two = (s: string) => { const w = s.replace(/^Google /, "").replace(/[^\p{L}\p{N} -]/gu, "").trim(), cut = /[a-z][-\s]?([A-Z])|[-\s]([a-z])/.exec(w); return (w[0]?.toUpperCase() ?? "·") + (cut?.[1] ?? cut?.[2] ?? w[1] ?? "").toLowerCase(); };
const soon = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`);

/** how one thing is marked where it is drawn: a ghost is dashed, a thing her words closed is struck */
type Marks = { ghosts?: ReadonlySet<string>; shut?: ReadonlySet<string> };
const mark = (f: Found, m?: Marks) => (m?.shut?.has(f.id) ? "shut" : m?.ghosts?.has(f.id) ? "ghost" : "");
const sureFirst = (fs: Found[], m?: Marks) => (m?.ghosts?.size ? [...fs].sort((a, b) => +m.ghosts!.has(a.id) - +m.ghosts!.has(b.id)) : fs);

function Piece({ area, kind, unsure, fresh, onPress, back, children }: { area: string; kind: PieceKind; unsure: boolean; fresh?: boolean; onPress?: (k: PieceKind) => void; back?: ReactNode; children: ReactNode }) {
  return <button type="button" className={`obf-piece ${unsure ? "unsure" : ""} ${fresh && !unsure ? "fresh" : ""} ${back ? "turned" : ""}`} data-piece={`${area}:${kind}`} onClick={(e) => { e.stopPropagation(); onPress?.(kind); }}>{back ?? children}</button>;
}

/** a routine: something the person does every week, read across sources: when it happens, where they go for it, what
 *  they use. Guessed until kept (a dashed line); kept, it is the folder's first piece of work. */
export type Routine = { id: string; event: Found; place?: Found; file?: Found };
/** one run of a kept routine: `at` is the stop being opened (0 the place, 1 the file, 2 making; 3 = done), `made` what
 *  it left in the folder, `broke` why it stopped at `at` (that stop then wears the yellow ring and is pressed to mend) */
export type Run = { at: number; made?: string; broke?: string; ticks?: number; secs?: number };
/** a long run (the agent works for a minute or two): the making segment fills in steps, one per real step the agent
 *  reports (`ticks`: its ledger lines so far), never on a timer; each step leaves a small dot on the line, so the line
 *  is a record of the work. Step k sits at 1 − 0.72^k of the way: it nears the end and never reaches it until the
 *  file is made. `secs` is the honest count beside the breathing dot while nothing else can be said. */
const tickAt = (k: number) => 1 - Math.pow(0.72, k);
const CODE = /\b[A-Z]{2,4}\s?\d{3}\b/;
export function routinesOf(facts: readonly Found[]): Routine[] {
  const reps = facts.filter((f) => f.kind === "event" && f.repeats), places = facts.filter((f) => f.kind === "place");
  const files = facts.filter((f) => pieceOf(f) === "files" && f.k !== "folder");
  return reps.map((event) => { const k = CODE.exec(event.v)?.[0]; return { id: `r-${event.id}`, event, place: places[0], file: files.find((f) => (k ? f.v.includes(k) : reps.length === 1)) }; }).filter((r) => r.place || r.file);
}

/** the week: seven columns; a dot per repeating thing on its days; the names of the first `names` */
function Week({ facts, size, m }: { facts: Found[]; size: Size; m?: Marks }) {
  const names = size === "l" ? 4 : 2;
  return (
    <>
      <div className="obf-week" aria-label="every week">
        {DAYS.map((d, i) => (
          <div key={d} className="obf-day">
            <div className="obf-dots">{facts.filter((f) => daysOf(f.when).includes(i)).map((f) => <i key={f.id} data-fact={f.id} className={mark(f, m)} />)}</div>
            <span>{d[0]}</span>
          </div>
        ))}
      </div>
      <div className="obf-names">{facts.slice(0, names).map((f) => <span key={f.id}>{f.v}</span>)}{facts.length > names && <span className="more">+{facts.length - names}</span>}</div>
    </>
  );
}

/** what is coming: the nearest date as a ring that fills as it nears (30 days out is empty), then how many more */
function Coming({ facts, size, now }: { facts: Found[]; size: Size; now: Date }) {
  const by = facts.map((f) => ({ f, n: daysTo(f.when, now) ?? 999 })).sort((a, b) => a.n - b.n);
  const shown = by.slice(0, size === "l" ? 3 : 1);
  return (
    <>
      {shown.map(({ f, n }) => (
        <div key={f.id} className="obf-coming" data-fact={f.id}>
          <Ring value={Math.max(0.06, 1 - n / 30)} size={size === "l" ? 40 : 30} />
          <div><b>{f.v}</b><span>{n === 999 ? f.when : soon(n)}</span></div>
        </div>
      ))}
      {by.length > shown.length && <div className="obf-names"><span className="more">+{by.length - shown.length}{size === "l" ? " later" : ""}</span></div>}
    </>
  );
}

function Files({ facts, size, m }: { facts: Found[]; size: Size; m?: Marks }) {
  const n = size === "l" ? 6 : 3, sure = facts.filter((f) => !m?.ghosts?.has(f.id));
  return (
    <div className="obf-files">
      <div className="obf-stack">{facts.slice(0, n).map((f) => <span key={f.id} data-fact={f.id} title={f.v} className={mark(f, m)}><FileMark ext={extOf(f)} h={size === "l" ? 34 : 26} /></span>)}</div>
      <div className="obf-names"><span>{(sure[sure.length - 1] ?? facts[0]).v}</span>{facts.length > 1 && <span className="more">+{facts.length - 1}</span>}</div>
    </div>
  );
}

/** round letters for places and connections; square two-letter tiles for apps (the face draws the app's own icon there) */
function Letters({ facts, size, of, square, m }: { facts: Found[]; size: Size; of?: (f: Found) => "ok" | "ask"; square?: boolean; m?: Marks }) {
  // two letters where one would repeat (three connections that all start with G)
  const n = size === "l" ? 8 : 5, clash = new Set(facts.map((f) => one(f.v))).size < facts.length, letter = (s: string) => (square || clash ? two(s) : one(s));
  return (
    <div className={`obf-letters ${square ? "sq" : ""}`}>
      {facts.slice(0, n).map((f) => <i key={f.id} data-fact={f.id} className={of?.(f) === "ask" ? "obf-ask" : mark(f, m)} title={m?.shut?.has(f.id) ? `${f.v}: closed to me` : f.v}>{letter(f.v)}</i>)}
      {facts.length > n && <span className="obf-n">+{facts.length - n}</span>}
      {!of && !square && <div className="obf-names"><span>{facts[0].v.replace(/^www\./, "")}</span></div>}
    </div>
  );
}

/** the screens, to scale, the main one filled */
export function Screens({ screens, h = 30 }: { screens: readonly Scr[]; h?: number }) {
  if (!screens.length) return null;
  const x0 = Math.min(...screens.map((s) => s.x)), y0 = Math.min(...screens.map((s) => s.y));
  const W = Math.max(...screens.map((s) => s.x + s.w)) - x0, H = Math.max(...screens.map((s) => s.y + s.h)) - y0, k = h / H;
  return (
    <div className="obf-screens" style={{ width: W * k, height: h }}>
      {screens.map((s) => <i key={s.id} className={s.main ? "obf-main" : ""} title={`${s.w}×${s.h}`} style={{ left: (s.x - x0) * k, top: (s.y - y0) * k, width: s.w * k - 2, height: s.h * k - 2 }} />)}
    </div>
  );
}

/** A folder of Home: a part of the person's life, or "you". `facts` are the ones that have landed; `unsure` the ids
 *  still to be said; `ghost` a folder Jev half-believes in (a dashed hairline, pressed to make). */
export function Folder({ id, name, word, facts, unsure, sure, onThing, size = "s", screens, ghost, ghosts, shut, onGhost, lit, unchecked, fresh, first, now = new Date(), kept: keptIn, runs, dry, onOpen, onPiece, onRoutine, onRun, onMend, children }: {
  id: string; name: string; word?: string; facts: readonly Found[]; unsure?: ReadonlySet<string>; size?: Size;
  /** #1227: the ids the person has kept (drawn plain); every other thing, turned over, carries "keep" and "not here" */
  sure?: ReadonlySet<string>; onThing?: (id: string, keep: boolean) => void; screens?: readonly Scr[];
  ghost?: boolean; ghosts?: ReadonlySet<string>; shut?: ReadonlySet<string>; onGhost?: (id: string, keep: boolean) => void; lit?: boolean; unchecked?: boolean; fresh?: ReadonlySet<string>; first?: string; now?: Date; onOpen?: () => void; onPiece?: (k: PieceKind) => void; onRoutine?: (r: Routine) => void; children?: ReactNode;
  kept?: ReadonlySet<string>; runs?: Readonly<Record<string, Run>>; dry?: boolean; onRun?: (r: Routine) => void; onMend?: (r: Routine, run: Run) => void;
}) {
  const things = facts.filter((f) => f.k !== "name");   // the name is the folder's own, not a thing in it
  const m: Marks = { ghosts, shut };
  const by = (k: PieceKind) => sureFirst(things.filter((f) => pieceOf(f) === k), m);
  const ask = (k: PieceKind) => by(k).some((f) => unsure?.has(f.id));
  const you = id === "you", count = things.length;
  const [turned, setTurned] = useState<PieceKind | null>(null), [keptOwn, setKept] = useState<ReadonlySet<string>>(new Set());
  const kept = keptIn ?? keptOwn;   // the parent's when it keeps them (the record), else the folder's own
  // open (large), a piece that asks nothing turns over on a press: each thing in it and where it was read
  const press = (k: PieceKind) => { if (size === "l" && !ask(k)) setTurned(turned === k ? null : k); else onPiece?.(k); };
  const back = (k: PieceKind) => (size === "l" && turned === k ? <div className="obf-back">{[...by(k)].sort((a, b) => +!!fresh?.has(b.id) - +!!fresh?.has(a.id)).map((f) => ghosts?.has(f.id)
    ? <span key={f.id} className="maybe" data-maybe={f.id}><b>{f.v}</b>{f.src}<em><i role="button" tabIndex={0} title="it belongs here" onClick={(e) => { e.stopPropagation(); onGhost?.(f.id, true); }}>keep</i><i role="button" tabIndex={0} title="it goes back to you" onClick={(e) => { e.stopPropagation(); onGhost?.(f.id, false); }}>not here</i></em></span>
    // #1227: every thing not yet answered carries the same two touches, so the folder is set up by pressing, not talking
    : onThing && !sure?.has(f.id) && !unsure?.has(f.id)
      ? <span key={f.id} className={`maybe ${fresh?.has(f.id) ? "new" : ""}`} data-thing={f.id}><b>{f.v}</b>{f.src}<em><i role="button" tabIndex={0} title="it belongs here" onClick={(e) => { e.stopPropagation(); onThing(f.id, true); }}>keep</i><i role="button" tabIndex={0} title="not part of this folder" onClick={(e) => { e.stopPropagation(); onThing(f.id, false); }}>not here</i></em></span>
      : <span key={f.id} className={fresh?.has(f.id) ? "new" : ""} data-thing={f.id} data-kept={sure?.has(f.id) ? "" : undefined}><b>{f.v}</b>{f.src}</span>)}</div> : undefined);
  const all = you ? [] : routinesOf(things), routines = size === "l" ? [...all].sort((a, b) => +(b.id === first) - +(a.id === first)) : [];   // the one picked for her leads
  // closed, a folder that has a kept routine carries its ▶ on its own head: Home's first second is a thing to press.
  // `first` is the one picked for her (Jev pick 8): kept already, and its ▶ breathes once as Home arrives.
  const head = size === "s" ? all.find((r) => r.id === first && kept.has(r.id)) ?? all.find((r) => kept.has(r.id) && runs?.[r.id] === undefined) : undefined;
  const headRun = head ? runs?.[head.id] : undefined;
  const order: PieceKind[] = you ? ["screens", "ai", "tools", "apps", "files", "places"] : ["week", "coming", "files", "places"];
  return (
    <div className={`fh fh-folder obf ${size} ${count ? "" : "obf-empty"} ${ghost ? "ghost" : ""} ${lit ? "lit" : ""} ${unchecked ? "unchecked" : ""} ${you ? "you" : ""}`} data-unchecked={unchecked || undefined} data-folder={id} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen} onKeyDown={(e) => { if (onOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}>
      {count > 0 && <span className="obf-count" aria-label={`${count} things`}>{count}</span>}
      <h2>{name}</h2>
      {head && onRun && !headRun && <button type="button" className={`obf-go ${dry ? "dry" : ""} ${head.id === first ? "first" : ""}`} data-go={head.id} aria-label={`do ${head.event.v} once`} title={`${head.event.v}: ${dry ? "write down what I would do" : "do it once, while you watch"}`} onClick={(e) => { e.stopPropagation(); onRun(head); }}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L10 6z" /></svg></button>}
      {word && <div className="who">{word}</div>}
      <div className="obf-pieces">
        {order.map((k) => {
          const fs = by(k);
          if (k === "screens") return screens?.length ? <Piece key={k} area={id} kind={k} unsure={false} onPress={onPiece}><Screens screens={screens} h={size === "l" ? 44 : 30} /><div className="obf-names"><span>{screens.length === 1 ? "one screen" : `${screens.length} screens`}</span></div></Piece> : null;
          if (!fs.length) return null;
          return (
            <Piece key={k} area={id} kind={k} unsure={ask(k)} fresh={fs.some((f) => fresh?.has(f.id))} onPress={press} back={back(k)}>
              {k === "week" ? <Week facts={fs} size={size} m={m} /> : k === "coming" ? <Coming facts={fs} size={size} now={now} /> : k === "files" ? <><Files facts={fs} size={size} m={m} />{you && <div className="obf-names"><span>{fs.length === 1 ? "one file" : `${fs.length} files`}</span></div>}</>
                : <><Letters facts={fs} size={size} m={m} square={k === "apps"} of={k === "ai" ? (f) => (f.signed === false ? "ask" : "ok") : undefined} />{you && <div className="obf-names"><span>{k === "ai" ? "your AI" : k === "tools" ? "connected" : k === "apps" ? (fs.length === 1 ? "one app" : `${fs.length} apps`) : "sites"}</span></div>}</>}
            </Piece>
          );
        })}
      </div>
      {routines.length > 0 && (
        <div className="obf-routines" aria-label="every week">
          {routines.map((r) => {
            const is = kept.has(r.id), run = runs?.[r.id], going = !!run && run.at < 3 && !run.broke;
            const seg = (i: number) => `ln ${run && run.at > i ? "on" : ""} ${going && run.at === i ? "now" : ""}`, stop = (i: number) => (going && run.at === i ? "now" : run?.broke && run.at === i ? "broke" : "");
            return (
              <div key={r.id} className={`obf-routine ${is ? "obf-kept" : "guess"} ${going ? "going" : ""} ${run?.at === 3 ? "ran" : ""}`} data-routine={r.id} onClick={(e) => e.stopPropagation()}>
                <span className="when">{r.event.when}</span><b>{r.event.v}</b>
                {r.place && <><i className={seg(0)} /><i className={`at ${stop(0)}`} role={run?.broke && run.at === 0 ? "button" : undefined} tabIndex={run?.broke && run.at === 0 ? 0 : undefined} title={run?.broke && run.at === 0 ? `${run.broke}: press to mend` : undefined} onClick={() => { if (run?.broke && run.at === 0) onMend?.(r, run); }}>{one(r.place.v)}</i><span>{r.place.v.replace(/^www\./, "")}</span></>}
                {r.file && <><i className={seg(1)} /><em className={stop(1)}><FileMark ext={extOf(r.file)} h={22} /></em><span>{r.file.v}</span></>}
                {run && run.at >= 2 && !run.broke && <><i className={`${seg(2)} ${run.ticks !== undefined && run.at === 2 ? "obf-steps" : ""}`} style={run.ticks !== undefined && run.at === 2 ? ({ "--fill": `${Math.round(tickAt(run.ticks) * 100)}%` } as React.CSSProperties) : undefined}>{run.ticks !== undefined && Array.from({ length: run.ticks }, (_, k) => <b key={k} className="obf-tk" style={{ left: `${tickAt(k + 1) * 100}%` }} />)}</i><em className={`made ${stop(2)}`}>{run.made ? <FileMark ext="md" h={22} /> : <i className="dot" />}</em>{run.made ? <span className="made">{run.made}</span> : run.secs !== undefined && run.secs >= 5 && <span className="secs">{run.secs} s</span>}</>}
                {run?.broke && <button type="button" className="obf-why" title={run.broke} onClick={() => onMend?.(r, run)}>{run.broke.split(/[(:.]/)[0].trim().split(" ").slice(0, 4).join(" ")}</button>}
                {run?.broke ? null : !is ? <button type="button" className="keep" title="a guess: press to keep" onClick={() => { if (!keptIn) setKept((x) => new Set(x).add(r.id)); onRoutine?.(r); }}>keep</button>
                  : <button type="button" className={`run ${dry ? "dry" : ""}`} disabled={going} aria-label={dry ? `write down what ${r.event.v} would do` : `do ${r.event.v} once`} title={dry ? "record only: I write down what I would do" : "do it once, while you watch"} onClick={() => onRun?.(r)}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L10 6z" /></svg></button>}
              </div>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
