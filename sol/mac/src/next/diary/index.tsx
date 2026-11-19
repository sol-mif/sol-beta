// owned by slice 4 (Life and Diary), docs/port/slices.md
// The diary's page (#1604; the mockup's merge/views/diary.js, round 3 · C3, D1–D8): the page being read (today unless
// flipped), from the book only (diary/book.ts). Top to bottom: the date and the turn of a page; the night's story
// (headline, its proof, what needs you), folded to one line once read; your own lines; one group per folder, most
// relevant first, each line one fact with why it is there, the quiet ones folded; a line to write in; how it writes and
// what it writes down; on a closed day, its last line. A line can carry its thing, live: a press goes there (goto).
// The shell mounts it over the plane at Far, on today's page (D.zones.page, the plane's); a page too narrow to read is
// drawn short. In a real Sol the page is "not yet" (map.md: next.diary.* is slice 7's) and nothing is drawn.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SlotProps } from "../slots.ts";
import { D, M, MODE, S, SCEN, above, asksInRegion, hooks, isReady, open, rectOn, regionOf, sessions, useNext, type Ask } from "../cv/index.ts";
import * as B from "./book.ts";
import { firstWords } from "../people/extra.ts";
import { answerOffer, ask, clearAsk, focusDiary, fold, toToday } from "../cv/moves/life.ts";
import "./diary.css";

const bare = (n: unknown) => String(n || "").replace(/ \(.*\)$/, "");
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
    const name = p ? (t.kind === "session" ? `${p.ai} in ${p.copy || p.name}` : String(p.words || p.name)) : t.r ? bare(t.r.name) : t.title || t.d?.what || "it";
    return <span className="dy-emb dy-past"><button className="dy-chip" data-embed={t.id} data-act={`goto:${t.open}`} title="Go there">{name} ›</button></span>;
  }
  let body: React.ReactNode;
  if (t.kind === "session" && p) {
    const n = asksOnId(t.id);
    body = <><span className={`dy-aura${/work/.test(stateOf(p)) ? "" : " still"}`} /><span className="dy-et"><b>{p.ai}</b> in {p.copy || p.name}</span>
      <span className="dy-es">{p.term?.stateWord || stateOf(p)}{p.files ? ` · ${p.files} file${p.files === 1 ? "" : "s"}` : ""}{n ? <> · <i>asks you</i></> : null}</span></>;
  } else if (t.kind === "split" && p) {
    const ps = p.parts || [], n = open().filter((a) => a.piece === p.id).length, dn = ps.filter((x) => /done/.test(x.state || "")).length;
    body = <><span className="dy-et"><b>{p.name}</b></span><span className="dy-parts">{ps.map((x) => <span key={x.id} className={`dy-pt${open().some((q) => q.part === x.id) ? " dy-pt-ask" : /done/.test(x.state || "") ? " dy-pt-done" : ""}`} title={x.name}>{x.ai}</span>)}</span>
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
  if (l.kind === "ask") { const a = l.asked ? D.asks[l.asked] : r ? D.asks[String(r.value)] : undefined; return a ? (a.answered ? "you answered" : "needs you") : ""; }
  if (l.gate === "draft") { const t = target(l.embed); if (t && t.kind === "page" && !t.wait) return "kept"; return t && t.kind === "draft" ? "waits for your press" : l.why || ""; }
  if (l.gate === "ask") { const a = r ? D.asks[String(r.value)] : undefined; return a && a.answered ? "you answered" : "needs you"; }
  return l.why || "";
}
function warm(l: B.Line, tone: string) { if (tone !== "warm" || l.mine || l.who !== B.VOICE || /^(I|You) /.test(l.what)) return l.what; return "I " + l.what[0].toLowerCase() + l.what.slice(1); }

function LineRow({ l, embed, acts = true, past }: { l: B.Line; embed?: boolean; acts?: boolean; past?: boolean }) {
  const b = B.book(), w = whyOf(l), r = B.rowOf(l.row), you = B.personName();
  const who = !l.mine && l.who !== B.VOICE && l.who !== "person" ? l.who : "";
  const text = who ? verb(warm(l, b.take.tone)) : cap(warm(l, b.take.tone));
  return (
    <div className={`dy-l${l.mine ? " mine" : ""} dy-k-${l.kind}${l.small ? " dy-small" : ""}${r?.undone ? " dy-undone" : ""}`} data-line={l.id}>
      <time className="dy-tm">{B.hm(l.t)}</time>
      {l.who === "person" ? <span className="dy-av">{you[0]}</span> : <span className="dy-aura still" />}
      <div className="dy-b">
        <span className="dy-t">{who ? <><b className="dy-ai">{who}</b> </> : null}{text}</span>
        {l.via ? <> <span className="dy-via">from the {l.via}</span></> : null}
        {w ? <> <span className="dy-why">{w}</span></> : null}
        {l.mine ? <> <span className="dy-yours">yours</span></> : null}
        {embed ? <Embed e={l.embed} past={past} /> : null}
      </div>
      {acts ? (
        <span className="dy-acts">
          {l.mine && !l.sticky ? <button title="One press makes it a sticky" onClick={() => { const x = M.to_sticky(l.id); flash(x.ok ? "Made a sticky" : x.why ?? ""); }}>Make a sticky</button> : null}
          <button title="Remove this line; undo gets it back" onClick={() => M.remove_line(l.id)}>Remove</button>
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- a folder's part of the page

function quietWords(rest: number, more: number) { const q = rest - more, w = q === 1 ? "one quieter thing" : q + " quieter things"; return more && q ? `${more} more, and ${w}` : more ? `${more} more` : w; }
function Group({ g, take, band, past }: { g: { k: string; lines: B.Line[] }; take: B.Take; band: string; past: boolean }) {
  const r = regionOf(g.k), ls = g.lines;
  let loud = take.keeps === "everything" ? ls : ls.filter((l) => !l.small), quiet = take.keeps === "everything" ? [] : ls.filter((l) => l.small);
  if (!loud.length && g.k !== "~all") { loud = quiet; quiet = []; }   // a folder of quiet things only: say them plainly
  // a thing is shown once a folder: its embed rides on the latest line that points at it
  const last: Record<string, string> = {};
  loud.forEach((l) => { if (l.embed) last[String(l.embed.id || l.embed.open)] = l.id; });
  const limit = band === "far" ? 3 : take.length === "short" ? 5 : 99;
  const rank = (l: B.Line) => (whyOf(l) === "needs you" ? 0 : whyOf(l) === "waits for your press" ? 1 : l.mine ? 2 : 3);
  const shown = new Set(loud.slice().sort((a, b) => rank(a) - rank(b) || b.t - a.t).slice(0, limit).map((l) => l.id));
  const more = loud.filter((l) => !shown.has(l.id)), rest = [...more, ...quiet].sort((a, b) => a.t - b.t);
  const n = !past ? asksInRegion(g.k).length : 0;
  if (band === "far" && !shown.size) return null;
  return (
    <section className="dy-f" data-region={g.k}>
      {g.k === "~mine" ? <h2 className="dy-fh"><span className="dy-av">{B.personName()[0]}</span>Your lines</h2>
        : g.k === "~all" ? <h2 className="dy-fh"><span className="dy-aura still" />Across your folders</h2>
        : <h2 className="dy-fh" data-act={`goto:${g.k}`} role="link"><span className="dy-dot" />{bare(r?.name)}{n ? <small> {n} need{n === 1 ? "s" : ""} you</small> : null}</h2>}
      {loud.filter((l) => shown.has(l.id)).map((l) => <LineRow key={l.id} l={l} embed={band !== "far" && !!l.embed && last[String(l.embed.id || l.embed.open)] === l.id} acts={band !== "far"} past={past} />)}
      {rest.length && band !== "far" ? <details className="dy-quiet"><summary>{quietWords(rest.length, more.length)}</summary>{rest.map((l) => <LineRow key={l.id} l={l} />)}</details> : null}
    </section>
  );
}

// ---------------------------------------------------------------- the night's story: headline, proof, what needs you

function Story({ k, band }: { k: number; band: string }) {
  const b = B.book(), h = k === 0 ? B.headline() : null, o = k === 0 ? open() : [], first: Ask | undefined = o[0];
  // round 6 · F1: the one count (above(): the extra askers' and the canvas's); an extra ask standing first words itself
  const n = k === 0 ? above() : 0, fx = k === 0 ? firstWords() : null;
  const night = B.lines(k).filter((l) => l.who !== "person" && B.pageOf(l.t) === k && l.t < b.start && k === 0);
  const old = k !== 0 ? B.lines(k).find((l) => l.kind === "headline") : null;
  if (old) return <p className="dy-story dy-folded" data-m1="what"><span className="dy-aura still" /><span className="dy-sl">The morning</span>{old.what}</p>;
  if (k !== 0) return null;
  const ss = sessions().slice().sort((x, y) => (y.files ?? 0) - (x.files ?? 0)), lab = SCEN[b.name]?.label || "";
  const when = /2am/.test(lab) ? "tonight" : /11pm/.test(lab) ? "since you last looked" : "overnight";
  const text = h ? h.text : night.length && ss.length ? `${ss[0].ai} changed ${ss[0].files} files in ${ss[0].copy} ${when}.` : night.length ? `${night.length} thing${night.length === 1 ? "" : "s"} happened ${when}.`
    : n ? `${n === 1 ? "One thing needs" : n + " things need"} you this morning.` : "A quiet start: nothing moved overnight.";
  const span = night.length ? `While you were away · ${B.hm(night[0].t)} to ${B.hm(night[night.length - 1].t)}` : "This morning";
  const at = first ? bare(regionOf(D.pieces[first.piece]?.region)?.name) : "";
  if (b.read) return (
    <button className="dy-story dy-folded" data-front data-m1="what" onClick={() => fold(false)}><span className="dy-aura still" /><span className="dy-sl">The night</span>{text}
      {n ? <i data-m1="needs"> · {n} need{n === 1 ? "s" : ""} you</i> : null}<span className="dy-go">›</span></button>
  );
  return (
    <section className="dy-story" data-front data-part="The night">
      <div className="dy-sw"><span className="dy-aura" />{span}</div>
      <h1 className="dy-h" data-m1="what">{text}</h1>
      {h?.proof ? <Proof h={h} /> : null}
      {n
        ? <div className="dy-need" role="link" tabIndex={0} data-m1="needs" data-act="needs"><span className="dy-cnt">{n}</span><span><b>{n === 1 ? "One thing needs" : n + " things need"} you.</b> The first {fx ?? <>is first{at ? `, in ${at}` : ""}</>}.</span></div>
        : <div className="dy-need none" data-m1="needs"><span className="dy-cnt">0</span><span><b>Nothing needs you now.</b></span></div>}
      {band === "far" ? null : o.slice(0, 3).map((a) => <div key={a.id} className="dy-ask" data-ask={a.id}>{a.text}</div>)}
      {band === "far" ? null : <button className="dy-fold" onClick={() => fold(true)}>Read it · fold</button>}
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
    <div className="dy-proof"><span className="dy-pk">{h.ai} · {h.at}</span>{steps.map((s, i) => <span key={i} className="dy-ps"><i>{s.at.join(", ")}</i> {s.brief}</span>)}
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
      {q.groups.length ? q.groups.map((g) => <p key={g.who} className="dy-qa"><b>{g.who}</b> {g.lines.map((id) => { const l = B.byId(id)!; return `${B.hm(l.t)} ${l.what.replace(/\.$/, "")}`; }).join("; ")}.</p>)
        : <p className="dy-qa">Nothing {q.span}.{before ? ` The last change was at ${B.hm(before.t)}: ${before.who}, ${before.what[0].toLowerCase() + before.what.slice(1)}` : ""}</p>}
    </section>
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
    </footer>
  </>;
}

/** the line to write in: Enter writes it (a question asks the diary), Escape gives the keys back */
function Write() {
  const [v, setV] = useState("");
  return (
    <div className="dy-write">
      <input placeholder="Write a line of your own, or ask the diary a question" aria-label="Write in the diary" value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { const w = v.trim(); if (!w) return; setV(""); if (/\?$/.test(w)) ask(w); else { const r = M.write(w); if (r.ok) flash("Written in your diary"); } }
          if (e.key === "Escape") { (e.target as HTMLInputElement).blur(); focusDiary(false); }
        }} />
    </div>
  );
}

// ---------------------------------------------------------------- the page

export default function Diary({ band = "middle", part }: SlotProps) {
  useNext(() => 0);
  const el = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(true);
  // the diary has the keys after a press inside it (the keys are in cv/moves/life.ts)
  useEffect(() => {
    const down = (e: PointerEvent) => focusDiary(!!(e.target as Element | null)?.closest?.(".dy"));
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);
  // the short form is for a page too narrow to read, not for a camera distance
  useLayoutEffect(() => {
    const x = el.current;
    if (!x || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWide(x.clientWidth >= 460));
    ro.observe(x);
    return () => ro.disconnect();
  }, []);
  if (!D || MODE !== "fixture" && !isReady("write")) return null;
  const b = B.book(), k = b.showing, short = band === "far" && !wide, form = short ? "far" : "middle";
  const ls = B.lines(k).filter((l) => l.kind !== "headline"), p = b.pages[k], gs = B.groups(ls, b.take);
  const earlier = Object.keys(b.pages).map(Number).some((x) => x < k);
  // on the plane at Far the page stands on today's spot (D.zones.page, the plane's layout); without it, in the view's flow
  // inside the plane's own frame (#pl-dy, part "frame", the join) the frame stands there already
  const z = part !== "frame" && band === "far" && D.zones?.page && S.dist === "far" ? rectOn(D.zones.page) : null;
  const pos = z ? { position: "absolute" as const, left: z.x, top: z.y, width: z.w } : undefined;
  const groups = gs.map((g) => <Group key={g.k} g={g} take={b.take} band={form} past={k < 0} />);
  return (
    <article ref={el} className={`dy${short ? " dy-far" : ""}${b.focus ? " dy-focus" : ""}`} data-diary data-day={k} style={pos}>
      <header className="dy-top">
        <div className="dy-date">{B.dateWords(k)}</div>
        <span className="dy-dn">{B.dayName(k) === "Today" ? "Today’s page" : B.dayName(k) + "’s page"}</span>
        <nav className="dy-nav">
          {earlier ? <button title="The day before (⌘[)" onClick={() => M.flip(-1)}>‹</button> : <span />}
          {k < 0 ? <><button title="The next day (⌘])" onClick={() => M.flip(1)}>›</button><button className="dy-today" onClick={toToday}>Today</button></> : null}
        </nav>
      </header>
      {b.paused && k === 0 ? <div className="dy-paused"><span>Not writing since {B.hm(b.paused.from)}{b.paused.skipped ? ` · ${b.paused.skipped} thing${b.paused.skipped === 1 ? "" : "s"} left out` : ""}.</span><button className="dy-btn" onClick={() => M.pause_diary()}>Write again</button></div> : null}
      {k === 0 ? <Asked /> : null}
      <Story k={k} band={form} />
      {gs.length ? groups : k === 0 ? <p className="dy-empty">Nothing written yet today. It writes as the day goes: what your AIs finish, what you decide, what you open.</p> : null}
      {form !== "far" && k === 0 ? <Write /> : null}
      {p?.closing ? <p className="dy-close">{p.closing.what} <small>{B.hm(p.closing.t)}</small></p> : null}
      {form !== "far" ? <Foot k={k} /> : null}
    </article>
  );
}
