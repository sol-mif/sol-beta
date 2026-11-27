// owned by slice 4 (Life and Diary), docs/port/slices.md
// The diary's page (#1604; the mockup's merge/views/diary.js, round 3 · C3, D1–D8; the day page of BR1, #1615): the page
// being read (today unless flipped), kept by the AIs and written in by the person. Top to bottom: the date, the turn of a
// page and how many things need you; the night's line (headline, its proof); the day: the hours down the left (the AIs'
// runs as bars on the hours they ran, a line for now, a line of yours with a time at its hour; no calendar is read yet,
// and it says so), the lines in the order of the day, each one fact naming its folder or its AI, yours in italic, an ask
// a line with its Answer, the quiet ones folded, a note pinned as a sticky; a line to write in; how it writes and what it
// writes down; on a closed day, its last line. A line can carry its thing, live: a press goes there (goto).
// The shell mounts it over the plane at Far, on today's page (D.zones.page, the plane's); a page too narrow to read is
// drawn short, without the hours. In a real Sol it is drawn once the engine has answered (cv/wire/diary.ts).
// One Diary, scoped (BR1 item 1): <Diary scope={folder}> is the same page over one folder, where it sits: only the
// lines, runs and asks of things in it (within), its own count of what needs you, and a line written in it goes in
// that folder. The canvas's Diary (scope null) holds everything and keeps what is the whole canvas's: the night's line,
// a question asked of the diary, the week, how it writes and what it writes down.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SlotProps } from "../slots.ts";
import { D, M, MODE, S, SCEN, above, needWords, hooks, isReady, open, rectOn, regionOf, sessions, useNext, type Ask } from "../cv/index.ts";
import { clean, type Run, type Traces, type Worked } from "../settings/worked-read.ts";
import { tintOf } from "../plane/layout.ts";
import { sampleTraces } from "../settings/worked-seed.ts";
import * as B from "./book.ts";
import { fitCount, newestFirst } from "./rows.ts";
import { DiaryCard, paintAt, type DiaryRow } from "../../kit/index.ts";
import { K } from "../keeps.ts";   // #1879 step 3: the last time the person was present
import { changedWords } from "../lead/rules.ts";
import { answerHere, askRegion, askSaid, needList } from "./asks.ts";   // the asks at rest, said once for the Diary and the canvas's line
import { shelfNow, shelvedOf, subscribe as onShelf, takeBack } from "../shelf/model.ts";   // a move-in line's Bring back (BR1 first-timer, builder F)
import { formOf } from "../form.ts";
import { firstWords } from "../people/extra.ts";
import Seen from "../pieces/Seen.tsx";   // slice 12: your own pieces under the headline (docs/port/requests/pieces.md)
import { answerOffer, ask, clearAsk, focusDiary, fold, toToday } from "../cv/moves/life.ts";
import "./diary.css";
import { DiaryFit, FitLine, FitWeek, fitIdOf } from "../fits/views.tsx";   // slice R8 (#1615): render points, requests/fits.md
import { sortRunOf } from "../cv/moves/setup.ts";   // a sort's line: its moves' because and its Undo (BR1, #1615)
import Because from "../because/Because.tsx";   // BR1 item 4 (#1615): why Sol wrote a line or asks, from the facts it acted on
import { actedNow, onActed } from "../cv/wire/raises.ts";   // the floor's meter (quiet.html §3, builder J)

const bare = (n: unknown) => String(n || "").replace(/ \(.*\)$/, "");
const within = B.within;
/** an ask's folder: its piece's, else the part it is on */
const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const verb = (w: string) => (/^([A-Z][a-z]+ed|Ran|Made|Wrote|Split|Read|Went|Set|Took|Kept|Left|Sent|Found|Built|Asked|Told)\b/.test(w) ? w[0].toLowerCase() + w.slice(1) : w);
const flash = (t: string) => hooks.flash?.(t);

// ---------------------------------------------------------------- what a line points at, read live from the canvas

type Target = { kind: string; id: string; open?: string; title?: string; wait?: boolean; p?: (typeof D.pieces)[string]; r?: { name: string }; d?: { what?: string } };
function target(e: B.Embed): Target | null {
  if (!e) return null;
  if (e.kind === "page") {
    const blk = e.id ? B.blockOf(e.id) : null;
    if (blk) return { kind: "page", title: (blk.title as string) || e.title, open: blk.session, wait: !blk.placed, id: e.id! };
    if (e.id && D.pieces[e.id]) return { kind: "page", title: D.pieces[e.id].name, open: e.id, id: e.id };
    if (e.open && D.pieces[e.open]) return { kind: "page", title: e.title, open: e.open, id: e.open };
    return null;
  }
  const id = e.id;
  if (!id) return null;
  const p = D.pieces[id];
  if (p) return { kind: e.kind === "split" || (p.parts || []).length ? "split" : p.kind === "session" ? "session" : p.kind === "sticky" ? "sticky" : "piece", p, open: id, id };
  const d = (D.drafts as Record<string, { pressed?: boolean; what?: string; region?: string; args?: { session?: string; piece?: string } }> | undefined)?.[id];
  if (d && !d.pressed) return { kind: "draft", d, open: d.args?.session || d.args?.piece || d.region, id };
  const r = regionOf(id);
  if (r) return { kind: "region", r, open: id, id };
  return { kind: "gone", id };
}
const asksOnId = (id: string) => open().filter((a) => a.piece === id || a.part === id).length;
const stateOf = (p: Target["p"]) => (p?.term?.waiting ? "waiting" : p?.state || "");

function Embed({ e, past }: { e: B.Embed; past?: boolean }) {
  const t = target(e);
  if (!t) return null;
  if (t.kind === "gone") return <div className="dy-emb gone"><span className="dy-et">Gone from the canvas since</span></div>;
  const p = t.p;
  if (past) {
    const name = p ? (t.kind === "session" ? `${B.taskOf(p)} in ${bare(regionOf(p.region)?.name)}` : String(p.words || p.name)) : t.r ? bare(t.r.name) : t.title || t.d?.what || "it";
    return <span className="dy-emb dy-past"><button className="dy-chip" data-embed={t.id} data-act={`goto:${t.open}`} title="Go there">{name} ›</button></span>;
  }
  let body: React.ReactNode;
  if (t.kind === "session" && p) {
    const n = asksOnId(t.id);
    body = <><span className={`dy-aura${/work/.test(stateOf(p)) ? "" : " still"}`} /><span className="dy-et"><b>{B.taskOf(p)}</b> in {bare(regionOf(p.region)?.name)}</span>
      <span className="dy-es">{p.term?.stateWord || stateOf(p)}{p.files ? ` · ${p.files} file${p.files === 1 ? "" : "s"}` : ""}{n ? <> · <i>asks you</i></> : null}</span></>;
  } else if (t.kind === "split" && p) {
    const ps = p.parts || [], n = open().filter((a) => a.piece === p.id).length, dn = ps.filter((x) => /done/.test(x.state || "")).length;
    body = <><span className="dy-et"><b>{p.name}</b></span><span className="dy-parts">{ps.map((x) => <span key={x.id} className={`dy-pt${open().some((q) => q.part === x.id) ? " dy-pt-ask" : /done/.test(x.state || "") ? " dy-pt-done" : ""}`} title={x.name}>{B.taskOf(x)}</span>)}</span>
      <span className="dy-es">{ps.length} parts{dn ? ` · ${dn} done` : ""}{n ? <> · <i>{n} ask{n === 1 ? "s" : ""} you</i></> : null}</span></>;
  } else if (t.kind === "page") body = <><span className="dy-doc" /><span className="dy-et"><b>{t.title || "a page"}</b></span><span className="dy-es">{t.wait ? "waits for your press" : "beside its session"}</span></>;
  else if (t.kind === "draft") body = <><span className="dy-doc" /><span className="dy-et"><b>{t.d?.what}</b></span><span className="dy-es">waits for your press</span></>;
  else if (t.kind === "sticky" && p) body = <><span className="dy-stk" /><span className="dy-et"><b>{String(p.words || p.text || p.name)}</b></span><span className="dy-es">{String(p.state || "a sticky")}{((p.made as unknown[]) || []).length ? ` · made ${(p.made as unknown[]).length}` : ""}</span></>;
  else if (t.kind === "region") body = <><span className="dy-dot" /><span className="dy-et"><b>{bare(t.r?.name)}</b></span></>;
  else if (p) body = <><span className="dy-doc" /><span className="dy-et"><b>{p.name}</b></span>{p.text ? <span className="dy-es">{p.text}</span> : null}</>;
  return <div className={`dy-emb dy-e-${t.kind}`}><button className="dy-open" data-embed={t.id} data-act={`goto:${t.open}`} title="Go there">{body}<span className="dy-go">Open ›</span></button></div>;
}

// ---------------------------------------------------------------- why a line is there, read live

function whyOf(l: B.Line): string {
  if (l.removed) return "";
  const r = B.rowOf(l.row);
  if (r?.undone) return "taken back";
  if (l.sort) return sortSaid(l.sort).why;
  if (l.kind === "ask") { const a = l.asked ? D.asks[l.asked] : r ? D.asks[String(r.value)] : undefined; return a ? (a.answered ? "you answered" : "needs you") : ""; }
  if (l.gate === "draft") { const t = target(l.embed); if (t && t.kind === "page" && !t.wait) return "kept"; return t && t.kind === "draft" ? "waits for your press" : l.why || ""; }
  if (l.gate === "ask") { const a = r ? D.asks[String(r.value)] : undefined; return a && a.answered ? "you answered" : "needs you"; }
  return l.why || "";
}
/** a sort's line (the folder agent's, Line.sort): its because, the reason its moves give (the engine's words, as heard in
 *  this window), or "taken back" once every move is; undone, its Undo goes */
function sortSaid(id: string): { why: string; back: boolean } {
  const run = sortRunOf(id), ms = run?.moves ?? [];
  if (ms.length && ms.every((m) => m.back)) return { why: "taken back", back: true };
  const ws = [...new Set(ms.map((m) => m.why).filter(Boolean))];
  return { why: ws.length ? `because ${ws[0]}${ws.length > 1 ? `, and ${ws.length - 1} more reason${ws.length > 2 ? "s" : ""}` : ""}` : "", back: false };
}
function warm(l: B.Line, tone: string) { if (tone !== "warm" || l.mine || l.who !== B.VOICE || /^(I|You) /.test(l.what)) return l.what; return "I " + l.what[0].toLowerCase() + l.what.slice(1); }

/** where a line comes from, named: its folder, else the AI that wrote it (when the line does not name it already) */
function sourceOf(l: B.Line, named: boolean, scope: string | null = null): string {
  const r = l.region ? regionOf(l.region) : null;
  if (r && l.region !== scope) return bare(r.name);   // in its own folder's Diary the page says the folder once, at its top
  if (l.mine || l.who === "person" || named) return "";
  return l.who === B.VOICE ? "your AI" : B.sayWho(l.who, l.region);
}
const askOf = (l: B.Line): Ask | undefined => {
  if (l.kind !== "ask") return undefined;
  if (l.asked) return D.asks[l.asked];
  const r = B.rowOf(l.row);
  return r ? D.asks[String(r.value)] : undefined;
};
const waiting = (a: Ask | undefined): a is Ask => !!a && !a.answered && !a.withdrawn;

/** the folder a move-in line is about, while it is on the Shelf (shelvedOf): its Bring back takes it off */
function useShelved(key: string | null): string | null {
  return shelvedOf(key, useSyncExternalStore(onShelf, shelfNow, shelfNow).shelf);
}

function LineRow({ l, embed, acts = true, past, scope = null }: { l: B.Line; embed?: boolean; acts?: boolean; past?: boolean; scope?: string | null }) {
  const shelved = useShelved(l.key);
  const b = B.book(), r = B.rowOf(l.row), w = shelved ? whyOf(l).replace(/ · Bring back in .*$/, "") : whyOf(l);
  const who = !l.mine && l.who !== B.VOICE && l.who !== "person" ? B.sayWho(l.who, l.region) : "";
  const text = who ? verb(warm(l, b.take.tone)) : cap(warm(l, b.take.tone));
  const a = askOf(l), asking = !past && waiting(a), src = sourceOf(l, !!who, scope);
  return (
    <div className={`dy-l${l.mine ? " mine" : ""} dy-k-${l.kind}${l.small ? " dy-small" : ""}${r?.undone || (l.sort && sortSaid(l.sort).back) ? " dy-undone" : ""}${asking ? " dy-asking" : ""}`} data-line={l.id} data-fit={fitIdOf(l)} data-ask={asking ? a.id : undefined}>
      <time className="dy-tm">{B.hm(l.t)}</time>
      <div className="dy-b">
        <span className="dy-t">{who ? <><b className="dy-ai">{who}</b> </> : null}{text}</span>
        {src ? <> <span className="dy-by">{src}</span></> : null}
        {l.via ? <> <span className="dy-via">from the {l.via}</span></> : null}
        {w && !asking ? <> <span className="dy-why">{w}</span></> : null}
        {shelved && !past ? <> <button type="button" className="dy-back" onClick={() => takeBack(shelved)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>Bring back</button></> : null}
        {l.mine ? <span className="dy-yours">yours</span> : <> <Because ks={l.because ?? a?.because} here={l.region ?? undefined} /></>}
        {embed ? <Embed e={l.embed} past={past} /> : null}
        <FitLine l={l} far={!acts} />
      </div>
      {asking ? <button className="dy-answer" onClick={() => answerHere(a)}>Answer</button> : acts ? (
        <span className="dy-acts">
          {l.mine ? <button title="A new session with these words, in this line's folder; nothing is sent until you start it" data-do-session
            onClick={() => M.start({ words: l.what, region: l.region ?? scope ?? undefined, now: false })}>Chat with AI about this</button> : null}
          {l.mine && !l.sticky ? <button title="One press makes it a sticky" onClick={() => { const x = M.to_sticky(l.id); flash(x.ok ? "Made a sticky" : x.why ?? ""); }}>Make a sticky</button> : null}
          {l.sort && !sortSaid(l.sort).back ? <button title="Put what this sort moved back where it was; the agent leaves each where you put it" data-sort-back={l.sort}
            onClick={() => { const x = M.fsSortBack(l.sort!); if (!x.ok) flash(x.why ?? "This sort can be taken back only while Sol runs"); }}>Undo</button> : null}
          <button title="Remove this line; undo gets it back" onClick={() => M.remove_line(l.id)}>Remove</button>
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- the day: the hours, the lines, the notes

function quietWords(n: number) { return n === 1 ? "one quieter thing" : n + " quieter things"; }
const NUMS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** the hour a line of yours names ("at 3pm", "14:30", "noon", "at one"), on the page's day; a line about another day has none */
function clockOf(w: string, k: number): number | null {
  const s = w.toLowerCase();
  if (/\b(tomorrow|yesterday|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(s)) return null;
  let m: RegExpExecArray | null, min: number | null = null;
  if ((m = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/.exec(s))) min = ((+m[1] % 12) + (m[3] === "pm" ? 12 : 0)) * 60 + (+m[2] || 0);
  else if ((m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(s))) min = +m[1] * 60 + +m[2];
  else if (/\bnoon\b/.test(s)) min = 720;
  else if ((m = new RegExp(`\\bat (\\d{1,2}|${NUMS.join("|")})\\b(?![:.]\\d)`).exec(s))) { const h = /\d/.test(m[1]) ? +m[1] : NUMS.indexOf(m[1]) + 1; if (h >= 1 && h <= 12) min = (h < 7 ? h + 12 : h) * 60; }
  return min == null ? null : B.TODAY0 + k * B.DAY + min * B.MIN;
}

/** a note: a line of yours marked "Note:" or made a sticky, or a sticky an AI made; pinned beside the day */
type Note = { l: B.Line; words: string; by: string; filed: string | null };
const NOTE = /^note\s*[:–-]\s*/i;
function noteOf(l: B.Line): Note | null {
  if (l.mine && (l.sticky || NOTE.test(l.what))) {
    const rid = l.sticky ? D.pieces[l.sticky]?.region ?? l.region : null;
    return { l, words: l.what.replace(NOTE, ""), by: "your note", filed: rid ? bare(regionOf(rid)?.name) || null : null };
  }
  if (!l.mine && l.fn === "sticky") {
    const m = /“(.+)”/.exec(l.what);
    return { l, words: m ? m[1] : l.what, by: `${l.who === B.VOICE ? "your AI" : B.sayWho(l.who, l.region)}’s note`, filed: l.region ? bare(regionOf(l.region)?.name) || null : null };
  }
  return null;
}
function Sticky({ n }: { n: Note }) {
  return (
    <div className={`dy-l dy-sticky${n.l.mine ? " mine" : ""}`} data-line={n.l.id}>
      <span className="dy-t">{n.words}</span>
      <small>{n.l.mine ? <span className="dy-yours">{n.by}</span> : n.by}{n.filed ? ` · filed to ${n.filed}` : ""}</small>
    </div>
  );
}

/** the AIs' runs today (next.traces): a real Sol reads the engine's answer for today; the dev page reads its sample */
type Bar = { r: Run; t: number; to: number; who: string; on: string; where: string; tint: string };
let sample: Traces | null = null;
function barsOf(k: number, scope: string | null = null): Bar[] {
  if (k !== 0) return [];
  const w = D.worked as Worked | undefined, n = B.now();
  let t: Traces | null, of: (at: number) => number;
  if (MODE === "live") { t = w?.t && !w.day ? w.t : null; of = B.loc; }
  else { t = sample ??= clean(sampleTraces(null)); of = (at) => B.TODAY0 + ((B.loc(at) % B.DAY) + B.DAY) % B.DAY; }   // the sample's hours, on the canvas's today
  const out: Bar[] = [];
  for (const r of t?.runs ?? []) {
    const s = r.source, p = D.pieces[s.id];
    // the diary writing itself; a plan's, an automation's or the planner's run spans its own step sessions, which are drawn (#1752);
    // on the dev page only the panel's own pieces
    if (s.kind === "diary" || s.kind === "plan" || s.kind === "automation" || s.kind === "planner" || (MODE !== "live" && !p)) continue;
    if (!within(p?.region ?? (s.kind === "folder" ? s.id : null), scope)) continue;
    const from = of(r.from), to = Math.min(of(r.to), n);
    if (from > n) continue;
    // a session is said by its task, never an AI's name; one a plan or an automation started says so
    const step = (r as { of?: { plan?: string; automation?: string } }).of;
    const who = p?.kind === "session" ? B.taskOf(p) : s.kind === "session" ? "A session" : s.kind === "folder" ? "An AI" : s.kind === "thing" ? "A Thing" : "Your AI";
    const on = step?.automation ? "automation" : step?.plan ? "a step of a plan" : p && p.kind !== "session" ? String(p.name) : s.kind === "home" ? "Home" : "";
    out.push({ r, t: from, to: Math.max(from, to), who, on, where: scope && p?.region === scope ? "" : bare(regionOf(p?.region)?.name), tint: p?.region ? `pl-t${Math.max(0, tintOf(p.region))}` : "" });
  }
  return out.sort((x, y) => x.t - y.t);
}
const END: Record<Run["result"], string> = { done: "done", failed: "it failed", running: "still running", waiting: "it waits for you", unknown: "how it ended is not recorded" };
function RunRow({ b }: { b: Bar }) {
  const min = Math.max(1, Math.round((b.to - b.t) / B.MIN));
  return (
    <div className="dy-l dy-k-run" data-run={b.r.id}>
      <time className="dy-tm">{B.hm(b.t)}</time>
      <div className="dy-b"><span className="dy-t"><b className="dy-ai">{b.who}</b> {b.on ? `worked on ${b.on}` : "worked"} for {min} min; {END[b.r.result]}.</span>{b.where ? <> <span className="dy-by">{b.where}</span></> : null}</div>
    </div>
  );
}
/** an open ask with no line of its own yet: a line in the day, with its Answer */
function AskRow({ a }: { a: Ask }) {
  const { who, words, where, at } = askSaid(a), p = D.pieces[a.piece];
  return (
    <div className="dy-l dy-k-ask dy-asking" data-ask={a.id}>
      <time className="dy-tm">{at != null ? B.hm(at) : "now"}</time>
      <div className="dy-b"><span className="dy-t"><b className="dy-ai">{who}</b> asks: {words}</span>{where ? <> <span className="dy-by">{where}</span></> : null} <Because ks={a.because} here={p?.region} /></div>
      <button className="dy-answer" onClick={() => answerHere(a)}>Answer</button>
    </div>
  );
}

/** the hours down the left, a true time scale beside the lines: each line's time sits level with the line, so an hour
 *  with many lines grows and an empty one shrinks (placeRail, after the page has folded). On it the runs as bars as
 *  long as they ran, in their folder's colour, side by side when they overlap; a line of yours with a time at its hour;
 *  a line for now; and, plainly, that no calendar is read yet. Before the first placing the scale is even. */
function Hours({ k, ls, bars }: { k: number; ls: B.Line[]; bars: Bar[] }) {
  const n = k === 0 ? B.now() : null, day0 = B.TODAY0 + k * B.DAY;
  const dated = ls.filter((l) => l.mine).map((l) => ({ l, at: clockOf(l.what, k) })).filter((x): x is { l: B.Line; at: number } => x.at != null);
  const ts = [...ls.map((l) => l.t), ...bars.flatMap((x) => [x.t, x.to]), ...dated.map((x) => x.at), ...(n != null ? [n] : [])].filter((t) => t >= day0 - 3 * B.HOUR);
  let a = ts.length ? Math.floor(Math.min(...ts) / B.HOUR) * B.HOUR : day0 + 8 * B.HOUR, z = ts.length ? Math.ceil(Math.max(...ts) / B.HOUR) * B.HOUR : day0 + 18 * B.HOUR;
  if (z - a < 4 * B.HOUR) z = a + 4 * B.HOUR;
  const at = (t: number) => `${(((t - a) / (z - a)) * 100).toFixed(2)}%`, hrs: number[] = [];
  for (let h = a; h <= z; h += B.HOUR) hrs.push(h);
  // overlapping runs take lanes side by side
  const ends: number[] = [], lane = bars.map((x) => { let i = ends.findIndex((e) => e <= x.t); if (i < 0) i = ends.length; ends[i] = x.to; return i; });
  return (
    <div className="dy-rail">
      <div className="dy-hrs" data-a={a} data-z={z}>
        {hrs.map((h) => <div key={h} className="dy-hr" data-at={h} style={{ top: at(h) }}><span>{new Date(h).getUTCHours()}:00</span></div>)}
        {bars.map((x, i) => <div key={x.r.id} className={`dy-run dy-r-${x.r.result} ${x.tint}`} data-at={x.t} data-to={x.to}
          style={{ top: at(x.t), height: at(a + (x.to - x.t)), ["--lane" as string]: lane[i], ["--lanes" as string]: ends.length }}
          role="img" title={`${x.who}${x.where ? " in " + x.where : ""}, ${B.hm(x.t)} to ${B.hm(x.to)}`} aria-label={`${x.who}${x.where ? " in " + x.where : ""}, ${B.hm(x.t)} to ${B.hm(x.to)}`} />)}
        {dated.map((x) => <div key={x.l.id} className="dy-ev" data-at={x.at} style={{ top: at(x.at) }} role="img" title={x.l.what.replace(NOTE, "")} aria-label={x.l.what.replace(NOTE, "")} />)}
        {n != null ? <div className="dy-now" data-at={n} style={{ top: at(n) }} title={`Now, ${B.hm(n)}`} /> : null}
      </div>
    </div>
  );
}

/** sets the rail on the lines as they stand (folded ones out): each shown row's time is a point, its time's middle the
 *  height; between points the scale runs straight, before the first and after the last it runs to the rail's ends.
 *  An hour's label shows only where it has room. A run is a bar from its start to its end, never shorter than a dot. */
function placeRail(sec: HTMLElement, times: Map<string, number>) {
  const hrs = sec.querySelector<HTMLElement>(".dy-hrs");
  if (!hrs) return;
  const top0 = hrs.getBoundingClientRect().top, H = hrs.clientHeight, a = +hrs.dataset.a!, z = +hrs.dataset.z!;
  const pts: [number, number][] = [];
  let lastBottom = 0;   // the last placed row's lower edge: what comes after it is drawn below it, never beside it
  for (const el of Array.from(sec.children) as HTMLElement[]) {
    if (el.hidden || el.style.display === "none") continue;
    const id = el.dataset.line || el.dataset.ask || el.dataset.run, t = id != null ? times.get(id) : undefined;
    if (t == null || t < a || t > z) continue;
    const r = (el.querySelector(".dy-tm") || el).getBoundingClientRect();
    if (!r.height) continue;
    const y = Math.max(0, Math.min(H, r.top + r.height / 2 - top0)), last = pts[pts.length - 1];
    if (last && t <= last[0]) continue;   // rows run in time; a second row at the same minute keeps the first's place
    if (!last || y >= last[1]) { pts.push([t, y]); lastBottom = Math.min(H, el.getBoundingClientRect().bottom - top0); }
  }
  if (!pts.length || !H) return;
  // after the last row the hours do not stretch to the rail's end beside it (the first-timer read 04:07 beside 5:00 to
  // 7:00): from the next hour on they step down below the row, a label's room each, and past the rail's end are not drawn
  const [tl, yl] = pts[pts.length - 1], STEP = 24, next = Math.ceil((tl + 1) / B.HOUR) * B.HOUR;
  const after = (t: number) => (t < next ? yl + ((t - tl) / (next - tl)) * Math.max(0, lastBottom + 2 - yl) : lastBottom + 2 + ((t - next) / B.HOUR) * STEP);
  const ps: [number, number][] = [...(pts[0][0] > a ? [[a, 0] as [number, number]] : []), ...pts];
  const y = (t: number) => {
    if (t > tl) return after(t);
    if (t <= ps[0][0]) return ps[0][1];
    for (let i = 1; i < ps.length; i++) if (t <= ps[i][0]) { const [t0, y0] = ps[i - 1], [t1, y1] = ps[i]; return y0 + ((t - t0) / (t1 - t0)) * (y1 - y0); }
    return ps[ps.length - 1][1];
  };
  let shown = -Infinity;
  for (const el of Array.from(hrs.children) as HTMLElement[]) {
    const t = +el.dataset.at!, top = y(t);
    el.style.top = `${Math.min(top, H).toFixed(1)}px`;   // a mark past the rail's end is hidden and kept inside it, so the rail never grows
    if (el.classList.contains("dy-hr")) { const room = top - shown >= 18 && top <= H; el.style.visibility = room ? "" : "hidden"; if (room) shown = top; }
    else {
      el.style.visibility = top <= H ? "" : "hidden";   // past the rail's end: not drawn below the card
      if (el.dataset.to) el.style.height = top <= H ? `${Math.max(6, Math.min(H, y(+el.dataset.to)) - top).toFixed(1)}px` : "0px";
    }
  }
}

function Day({ k, ls, form, take, past, scope = null }: { k: number; ls: B.Line[]; form: string; take: B.Take; past: boolean; scope?: string | null }) {
  const notes = ls.map(noteOf).filter((x): x is Note => !!x), noted = new Set(notes.map((x) => x.l.id));
  const bars = barsOf(k, scope), lined = new Set(ls.map((l) => l.asked).filter(Boolean));
  const asks = k === 0 ? open().filter((a) => !lined.has(a.id) && within(askRegion(a), scope)) : [];
  const rest = ls.filter((l) => !noted.has(l.id));
  const loud = take.keeps === "everything" ? rest : rest.filter((l) => !l.small || waiting(askOf(l))), quiet = take.keeps === "everything" ? [] : rest.filter((l) => !loud.includes(l));
  // a thing is shown once on the page: its embed rides on the latest line that points at it
  const last: Record<string, string> = {};
  loud.forEach((l) => { if (l.embed) last[String(l.embed.id || l.embed.open)] = l.id; });
  type Row = { t: number; key: string; keep: boolean; el: React.ReactNode };
  let rows: Row[] = [
    ...loud.map((l) => ({ t: l.t, key: l.id, keep: l.mine || waiting(askOf(l)), el: <LineRow key={l.id} l={l} embed={form !== "far" && !!l.embed && last[String(l.embed.id || l.embed.open)] === l.id} acts={form !== "far"} past={past} scope={scope} /> })),
    ...(MODE === "live" ? bars.map((x) => ({ t: x.t, key: x.r.id, keep: false, el: <RunRow key={x.r.id} b={x} /> })) : []),   // the dev page's book has its AIs' lines already
    ...asks.map((a) => ({ t: typeof a.at === "number" ? a.at : Infinity, key: a.id, keep: true, el: <AskRow key={a.id} a={a} /> })),
  ].sort((x, y) => x.t - y.t);
  // the short form keeps the latest few, and every line of yours and every ask
  const SHORT = 4, all = rows.length;
  if (form === "far") rows = rows.filter((x, i) => x.keep || i >= all - SHORT);
  const earlier = all - rows.length;
  // the rail is set on the lines after every render, and again when the page folds or unfolds a line or changes size
  const ref = useRef<HTMLElement>(null), times = new Map(rows.filter((x) => Number.isFinite(x.t)).map((x) => [x.key, x.t]));
  useLayoutEffect(() => {
    const sec = ref.current;
    if (!sec) return;
    let f = 0;
    const soon = () => { if (!f) f = requestAnimationFrame(() => { f = 0; placeRail(sec, times); }); };
    soon();
    const mo = new MutationObserver(soon), ro = new ResizeObserver(soon);
    mo.observe(sec, { subtree: true, attributes: true, attributeFilter: ["data-dyfit", "hidden", "open"] });
    ro.observe(sec);
    return () => { cancelAnimationFrame(f); mo.disconnect(); ro.disconnect(); };
  });
  if (!rows.length && !notes.length) return k !== 0 ? null : scope
    ? <p className="dy-empty">Nothing written here yet today. It writes what your AIs finish in {bare(regionOf(scope)?.name) || "this folder"}, what you decide and what you open here.</p>
    : <p className="dy-empty">Nothing written yet today. It writes as the day goes: what your AIs finish, what you decide, what you open.</p>;
  return (
    <section className="dy-f dy-day" data-region="~day" ref={ref}>
      <Hours k={k} ls={ls} bars={bars} />
      {notes.length ? <aside className="dy-notes" aria-label="Notes">{notes.map((x) => <Sticky key={x.l.id} n={x} />)}</aside> : null}
      {earlier ? <p className="dy-earlier">{earlier === 1 ? "One line" : `${earlier} lines`} earlier today</p> : null}
      {rows.map((x) => x.el)}
      {quiet.length && form !== "far" ? <details className="dy-quiet"><summary>{quietWords(quiet.length)}</summary>{quiet.map((l) => <LineRow key={l.id} l={l} past={past} scope={scope} />)}</details> : null}
      <p className="dy-nocal">No calendar connected yet.</p>
    </section>
  );
}

// ---------------------------------------------------------------- the night's line: headline, proof; how many things need you

/** the page's side padding (.dy, --s6) and the pill's chrome beside its words (its count, gap and padding): what a word
 *  of the page's top has to fit in (form.ts) */
const DY_PAD = 24, NEED_CHROME = 20;
/** does a line of the page's top fit, its words whole, at `pad` either side: its form near, else far (form.ts formOf, the
 *  one rule every piece's form follows; BR1 23+Q4) */
const fitsTop = (text: string, size: "label" | "head", room: number, pad: number) => formOf({ near: [[text, size]], far: [] }, room, Infinity, Infinity, pad) === "near";
/** the page's whole form is at least this wide: narrower, it is its narrow form (dy-narrow), and at Far its short one */
const DY_WHOLE = 460;
/** how many things need you, at the page's top: a press goes to the first ask in the day (its Answer), or brings it; on
 *  a page too narrow for its sentence, the count alone (the sentence on its title; BR1 root part 3) */
function Need({ room = Infinity, scope = null }: { room?: number; scope?: string | null }) {
  if (scope) return <NeedHere room={room} scope={scope} />;
  const o = open(), first: Ask | undefined = o[0], n = above(), fx = firstWords(), { n: c, say, after } = needList();
  const at = first ? bare(regionOf(D.pieces[first.piece]?.region)?.name) : "";
  const go = (e: React.SyntheticEvent<HTMLElement>) => {
    const row = e.currentTarget.closest(".dy")?.querySelector<HTMLElement>(".dy-day .dy-asking .dy-answer");
    if (row) { row.scrollIntoView({ block: "center", behavior: "smooth" }); row.focus({ preventScroll: true }); } else M.next();
  };
  const words = fitsTop(after, "label", room, DY_PAD + NEED_CHROME), t = words ? undefined : say;
  const inner = <><span className="dy-cnt">{c}</span>{words ? <span><b>{after}</b></span> : null}</>;
  if (n) return <button className="dy-need" data-m1="needs" title={fx ? `The first ${fx}` : at ? `The first is in ${at}` : t} onClick={go}>{inner}</button>;
  if (c) return <div className="dy-need" role="link" tabIndex={0} data-m1="needs" data-act="needs" title={t}>{inner}</div>;
  return <div className="dy-need none" data-m1="needs" title={t}>{inner}</div>;
}

/** a scoped Diary's count: the asks of things in its folder; a press goes to the first one's Answer in the day */
function NeedHere({ room, scope }: { room: number; scope: string }) {
  // the count is drawn beside the words, so the words carry no number of their own: "1 · waiting for you in this folder"
  const { n, say } = needList(scope);
  const words = fitsTop(say, "label", room, DY_PAD + NEED_CHROME), t = words ? undefined : n ? `${n} ${say}` : say;
  const inner = <><span className="dy-cnt">{n}</span>{words ? <span><b>{say}</b></span> : null}</>;
  if (!n) return <div className="dy-need none" data-m1="needs" title={t}>{inner}</div>;
  const go = (e: React.SyntheticEvent<HTMLElement>) => {
    const row = e.currentTarget.closest(".dy")?.querySelector<HTMLElement>(".dy-day .dy-asking .dy-answer");
    if (row) { row.scrollIntoView({ block: "center", behavior: "smooth" }); row.focus({ preventScroll: true }); }
  };
  return <button className="dy-need" data-m1="needs" title={t} onClick={go}>{inner}</button>;
}

/** the night's line and its span, said once for the page's story and the canvas's card: while you were away counts from the
 *  last time the person was present (the engine keeps it, #1879 step 3), not from when this window loaded */
export function told(k: number) {
  const b = B.book(), h = k === 0 ? B.headline() : null;
  const n = k === 0 ? above() : 0;
  const away = B.LIVE ? K().away : null, from = away ? B.loc(away) : -Infinity;
  const night = B.lines(k).filter((l) => l.who !== "person" && B.pageOf(l.t) === k && l.t < b.start && l.t >= from && k === 0);
  const ss = sessions().slice().sort((x, y) => (y.files ?? 0) - (x.files ?? 0)), lab = SCEN[b.name]?.label || "";
  const when = /2am/.test(lab) ? "tonight" : /11pm/.test(lab) ? "since you last looked" : "overnight";
  const text = h ? h.text : night.length && ss.length ? `${B.taskOf(ss[0])} ${changedWords(ss[0].files)} in ${bare(regionOf(ss[0].region)?.name)} ${when}.` : night.length ? `${night.length} thing${night.length === 1 ? "" : "s"} happened ${when}.`
    : n ? `${needWords(n)} this morning.` : "A quiet start: nothing moved overnight.";
  const span = night.length ? `While you were away · ${B.hm(night[0].t)} to ${B.hm(night[night.length - 1].t)}` : "This morning";
  return { h, text, span, away: night.length > 0 };
}
function Story({ k, band }: { k: number; band: string }) {
  const b = B.book();
  const old = k !== 0 ? B.lines(k).find((l) => l.kind === "headline") : null;
  if (old) return <p className="dy-story dy-folded" data-m1="what"><span className="dy-aura still" /><span className="dy-sl">The morning</span>{old.what}</p>;
  if (k !== 0) return null;
  const { h, text, span } = told(k);
  if (b.read) return <button className="dy-story dy-folded" data-front data-m1="what" onClick={() => fold(false)}><span className="dy-aura still" /><span className="dy-sl">The night</span>{text}<span className="dy-go">›</span></button>;
  return (
    <section className="dy-story" data-front data-part="The night">
      <div className="dy-sw"><span className="dy-aura" />{span}</div>
      <h1 className="dy-h" data-m1="what">{text}</h1>
      {h?.proof ? <Proof h={h} /> : null}
      {(hooks as unknown as { seen?: ((band: string) => React.ReactNode)[] }).seen?.map((f) => f(band))}   {/* round 6: the .seen cards (movein/extra.ts) */}
      <Seen />
    </section>
  );
}
function Proof({ h }: { h: NonNullable<ReturnType<typeof B.headline>> }) {
  const rows = B.agent()?.rows?.(0) ?? [], steps: { brief: string; at: string[] }[] = [];
  for (const id of h.proof.rows || []) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const last = steps[steps.length - 1];
    if (last && last.brief === r.brief) last.at.push(r.at); else steps.push({ brief: r.brief, at: [r.at] });
  }
  if (!steps.length) return null;
  return (
    <div className="dy-proof"><span className="dy-pk">{B.sayWho(h.ai)} · {h.at}</span>{steps.map((s, i) => <span key={i} className="dy-ps"><i>{s.at.join(", ")}</i> {s.brief}</span>)}
      {h.proof.piece && D.pieces[h.proof.piece] ? <button className="dy-chip" data-act={`goto:${h.proof.piece}`}>see it</button> : null}</div>
  );
}

// ---------------------------------------------------------------- a question asked of the diary; the foot

function Asked() {
  const q = B.book().asked;
  if (!q) return null;
  const before = q.before ? B.byId(q.before) : null;
  return (
    <section className="dy-asked">
      <div className="dy-qh"><span className="dy-aura still" />“{q.words.replace(/\?*$/, "?")}” <small>from the diary, {q.span}</small><button className="dy-x" aria-label="Close" onClick={clearAsk}>×</button></div>
      {q.groups.length ? q.groups.map((g) => <p key={g.who} className="dy-qa"><b>{B.sayWho(g.who)}</b> {g.lines.map((id) => { const l = B.byId(id)!; return `${B.hm(l.t)} ${l.what.replace(/\.$/, "")}`; }).join("; ")}.</p>)
        : <p className="dy-qa">Nothing {q.span}.{before ? ` The last change was at ${B.hm(before.t)}: ${B.sayWho(before.who, before.region)}, ${before.what[0].toLowerCase() + before.what.slice(1)}` : ""}</p>}
    </section>
  );
}
/** the floor's meter (quiet.html §3 rule 4): raises acted on (answered or opened) of those checked this week; under the
 *  floor Sol raises less. Before the engine has said it, or with nothing checked, it says so */
function Acted() {
  const a = useSyncExternalStore(onActed, actedNow);
  const pct = a && a.rate !== null ? Math.round(a.rate * 100) : null, floor = Math.round((a?.floor ?? 0.7) * 100);
  return (
    <p className="dy-acted"><span className="dy-fk">Raises you acted on</span>{pct === null ? "this week: none checked yet" : `this week: ${pct}%`}
      <span className="dy-meter" role="meter" aria-label="Raises you acted on, this week" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}><i style={{ width: `${pct ?? 0}%` }} /><b style={{ left: `${floor}%` }} /></span>
      <span className="dy-say">{a?.raised ? `Under the floor of ${floor}%: Sol raises less this week, for every raise (the bar rises), and for you (it learns what you pass by).` : `The floor is ${floor}%. Below it Sol raises less, for every raise (the bar rises), and for you (it learns what you pass by).`}</span></p>
  );
}
function Foot({ k }: { k: number }) {
  const b = B.book(), t = b.take, T = B.TAKES, o = k === 0 ? B.offerOf() : null;
  const first = t.first && regionOf(t.first) ? `starts with ${bare(regionOf(t.first)!.name)}` : "";
  const takes = [T.length[t.length], T.keeps[t.keeps], T.notes[t.notes], T.tone[t.tone], first].filter(Boolean);
  return <>
    {o ? <div className="dy-offer"><span className="dy-aura" /><span>{o.words}</span><button className="dy-btn" onClick={() => answerOffer(true)}>Yes</button><button className="dy-later" onClick={() => answerOffer(false)}>Not now</button></div> : null}
    <footer className="dy-foot">
      <p><span className="dy-fk">How it writes</span>{takes.map((x) => <span key={x} className="dy-tag">{x}</span>)} <span className="dy-say">Say it to change it: “start my day with …”, “shorter”, “warmer”.</span></p>
      <p><span className="dy-fk">What it writes down</span>Only what passes through Sol: the pieces you open, your asks, the runs. Nothing from your browser or mail{b.sources.length > 1 ? "" : "; you can add a source"}.
        {b.paused ? null : <button className="dy-pause" onClick={() => { const r = M.pause_diary(); flash(r.ok ? "Not writing this down" : r.why ?? ""); }}>Don’t write this down</button>}</p>
      <Acted />
    </footer>
  </>;
}

/** the line to write in: Enter writes it in today (a question asks the diary; "Note: …" pins it; a time puts it on the
 *  hours), Escape gives the keys back */
function Write({ scope = null }: { scope?: string | null }) {
  const [v, setV] = useState("");
  const here = scope ? bare(regionOf(scope)?.name) : "";
  return (
    <label className="dy-write">
      <input placeholder="Write a line, a note, or a date…" aria-label="Write in the diary" value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          // a question asks the whole diary, on the canvas's page; in a folder every line is written there
          if (e.key === "Enter") { const w = v.trim(); if (!w) return; setV(""); if (!scope && /\?$/.test(w)) ask(w); else { const r = M.write(w, scope ? { region: scope } : {}); if (r.ok) flash(NOTE.test(w) ? "Pinned as a note" : here ? `Written in today, in ${here}` : "Written in today"); } }
          if (e.key === "Escape") { (e.target as HTMLInputElement).blur(); focusDiary(false); }
        }} />
      <i>{here ? `it goes in today, in ${here}` : "it goes in today"}</i>
    </label>
  );
}

// ---------------------------------------------------------------- the Diary on the canvas, a sticker (#1879 step 4)

/** the folder's paint, the one its sidebar card and tab wear */
const paintOf = (rid: string | null | undefined) => (rid && regionOf(rid) ? paintAt(Math.max(0, tintOf(rid))) : null);
/** a line's words as a row: who it is from in bold, then what it says without the name said twice */
function rowOf(l: B.Line, take: B.Take): DiaryRow & { t: number } {
  const who = l.mine || l.who === "person" ? "You" : l.who === B.VOICE ? "Your AI" : B.sayWho(l.who, l.region);
  const said = cap(warm(l, take.tone)), rest = said.toLowerCase().startsWith(who.toLowerCase() + " ") ? said.slice(who.length + 1) : said;
  return { id: l.id, t: l.t, time: B.hm(l.t), title: who, detail: cap(rest), paint: paintOf(l.region), ask: waiting(askOf(l)) };
}
/** every row of the day, newest first: the lines and the asks waiting now (the ones no line already says) */
export function dayRows(k: number): (DiaryRow & { t: number })[] {
  const b = B.book(), ls = B.lines(k).filter((l) => l.kind !== "headline" && l.kind !== "week" && !noteOf(l));
  const loud = b.take.keeps === "everything" ? ls : ls.filter((l) => !l.small || waiting(askOf(l)));
  const lined = new Set(ls.map((l) => l.asked).filter(Boolean));
  const asks = k === 0 ? open().filter((a) => !lined.has(a.id)).map((a) => {
    const s = askSaid(a), at = typeof a.at === "number" ? a.at : null;
    return { id: a.id, t: at ?? Infinity, time: at != null ? B.hm(at) : "now", title: `${s.who} asked you`, detail: cap(s.words), paint: paintOf(s.region), ask: true };
  }) : [];
  return newestFirst([...loud.map((l) => rowOf(l, b.take)), ...asks]);
}
/** the Diary at rest on the canvas: the card as drawn, its rows the day's lines newest first, as many as it has room for
 *  (measured: the card's room is the piece's box), then "+N more". A press anywhere on it opens the Diary up close */
function CanvasDiary({ pos }: { pos?: React.CSSProperties }) {
  useNext((_, s) => s.cam);
  const b = B.book(), k = b.showing, rows = dayRows(k), { n: count, after } = needList();
  const { text, span, away } = k === 0 ? told(k) : { text: B.lines(k).find((l) => l.kind === "headline")?.what ?? "", span: "", away: false };
  const earlier = Object.keys(b.pages).map(Number).some((x) => x < k);
  const root = useRef<HTMLDivElement>(null), sig = rows.map((r) => r.id).join();
  const [fit, setFit] = useState<{ sig: string; n: number }>({ sig: "", n: Infinity });
  const n = fit.sig === sig ? fit.n : rows.length;   // new rows: all of them first, then measured
  useLayoutEffect(() => {
    const el = root.current, box = el?.closest<HTMLElement>(".pl-diary");
    if (!el || !box) return;
    const measure = () => {
      // the piece's box is the room; the card starts where the wrapper does (its handles' strip above it)
      const all = [...el.querySelectorAll<HTMLElement>(".kp-diary-row")], at = el.getBoundingClientRect().top, room = box.getBoundingClientRect().bottom - at, pad = parseFloat(getComputedStyle(el.firstElementChild!).paddingBottom || "0");
      const more = el.querySelector<HTMLElement>(".kp-diary-more"), moreH = more ? more.offsetHeight : (all[0]?.offsetHeight ?? 0) / 2;
      const ends = all.map((r) => r.getBoundingClientRect().bottom - at), next = fitCount(all.length === rows.length ? ends : [], room - pad, moreH);
      if (all.length === rows.length && (fit.sig !== sig || fit.n !== next)) setFit({ sig, n: next });
    };
    measure();
  });
  // the piece's box changed (pulled, or the window): measure from all the rows again
  useLayoutEffect(() => {
    const box = root.current?.closest<HTMLElement>(".pl-diary");
    if (!box || typeof ResizeObserver === "undefined") return;
    let was = box.clientHeight;
    const ro = new ResizeObserver(() => { if (box.clientHeight !== was) { was = box.clientHeight; setFit({ sig: "", n: Infinity }); } });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={root} className="kp-diary-pos" style={pos} data-diary data-day={k} data-form="card">
      <DiaryCard date={B.dateWords(k)} day={new Date(B.TODAY0 + k * B.DAY).getUTCDate()} count={count} waiting={after} away={away ? span : null} headline={text}
        rows={rows.slice(0, n)} more={Math.max(0, rows.length - n)} onPrev={earlier ? () => M.flip(-1) : null} onNext={k < 0 ? () => M.flip(1) : null} />
    </div>
  );
}

// ---------------------------------------------------------------- the page

let askedWorked = false;
export default function Diary({ band = "middle", part, scope: sc }: SlotProps & { scope?: string | null }) {
  const scope = typeof sc === "string" && sc ? sc : null;
  useNext((_, s) => (part !== "frame" && s.dist === "far" ? s.cam : 0));   // every change; at Far on its own a pan too: the page stands on the plane (#1615 S32)
  const el = useRef<HTMLElement>(null);
  const [room, setRoom] = useState(Infinity);
  // the diary has the keys after a press inside it (the keys are in cv/moves/life.ts)
  useEffect(() => {
    const down = (e: PointerEvent) => focusDiary(!!(e.target as Element | null)?.closest?.(".dy, .kp-diary"));
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);
  // a real Sol: today's runs for the hours, asked of the engine once (next.traces, settings' stWorked)
  useEffect(() => { if (MODE === "live" && !askedWorked && !D.worked) { askedWorked = true; M.stWorked?.(); } }, []);
  // the short form is for a page too narrow to read, not for a camera distance
  useLayoutEffect(() => {
    const x = el.current;
    if (!x || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setRoom(x.clientWidth));
    ro.observe(x);
    return () => ro.disconnect();
  }, []);
  if (!D || MODE !== "fixture" && !isReady("write")) return null;
  const b = B.book(), k = b.showing;
  const ls = B.lines(k).filter((l) => l.kind !== "headline" && l.kind !== "week" && within(l.region, scope)), p = b.pages[k];
  const earlier = Object.keys(b.pages).map(Number).some((x) => x < k);
  // on the plane at Far the canvas's page stands on today's spot (D.zones.page, the plane's layout); without it, in the
  // view's flow inside the plane's own frame (#pl-dy, part "frame", the join) the frame stands there already. A folder's
  // Diary stands where its piece is: the plane places it
  const z = !scope && part !== "frame" && band === "far" && D.zones?.page && S.dist === "far" ? rectOn(D.zones.page) : null;
  const pos = z ? { position: "absolute" as const, left: z.x, top: z.y, width: z.w } : undefined;
  // BR1 root part 3: a page too narrow for its date, whole, draws no words (the bare page, its date on its title)
  const date = B.dateWords(k);
  const here = scope ? bare(regionOf(scope)?.name) || "this folder" : "";
  // its form as every piece's (form.ts formOf): whole at DY_WHOLE or wider; near, the narrow page, while its date fits;
  // far, the bare page. At Far a page short of whole is the short form, its day's lines only
  const f = formOf({ near: [[date, "head"]], far: [] }, room, Infinity, DY_WHOLE, DY_PAD), wide = f === "whole", short = band === "far" && !wide, form = short ? "far" : "middle";
  if (!scope && band === "far") return <CanvasDiary pos={pos} />;
  if (f === "far") return <article ref={el} className="dy dy-bare" data-diary data-day={k} data-form="far" data-scope={scope ?? undefined} style={pos} title={here ? `${date} · ${here}` : date} />;
  return (
    <article ref={el} className={`dy${short ? " dy-far" : ""}${wide ? "" : " dy-narrow"}${b.focus ? " dy-focus" : ""}`} data-diary data-day={k} data-scope={scope ?? undefined} style={pos}>
      <header className="dy-top">
        <nav className="dy-nav">
          {earlier ? <button title="The day before (⌘[)" aria-label="Show the day before" onClick={() => M.flip(-1)}>‹</button> : <span />}
          <div className="dy-date">{date}{here && fitsTop(here, "label", room, DY_PAD) ? <small className="dy-where">{here}</small> : null}</div>
          {k < 0 ? <><button title="The next day (⌘])" aria-label="Show the next day" onClick={() => M.flip(1)}>›</button><button className="dy-today" onClick={toToday}>Today</button></> : null}
        </nav>
        {k === 0 ? <Need room={room} scope={scope} /> : null}
      </header>
      {b.paused && k === 0 ? <div className="dy-paused"><span>Not writing since {B.hm(b.paused.from)}{b.paused.skipped ? ` · ${b.paused.skipped} thing${b.paused.skipped === 1 ? "" : "s"} left out` : ""}.</span><button className="dy-btn" onClick={() => M.pause_diary()}>Write again</button></div> : null}
      {k === 0 && !scope ? <Asked /> : null}
      {scope ? null : <Story k={k} band={form} />}
      <Day k={k} ls={ls} form={form} take={b.take} past={k < 0} scope={scope} />
      {scope ? null : <FitWeek k={k} band={form} />}{/* below the day: a short page folds the week's summary before the day's own lines */}
      {form !== "far" && k === 0 ? <Write scope={scope} /> : null}
      {p?.closing && !scope ? <p className="dy-close">{p.closing.what} <small>{B.hm(p.closing.t)}</small></p> : null}
      {form !== "far" && !scope ? <Foot k={k} /> : null}
      {scope ? null : <DiaryFit />}
    </article>
  );
}
