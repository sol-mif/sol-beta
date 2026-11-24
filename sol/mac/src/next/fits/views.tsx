// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The fits' views (round 8, #1615; merge/fits.js, as it is), each filling a render point in another slice's view
// (requests/fits.md lists them):
//   the Diary (slice 4)     FitLine on a fit's line (Why, Keep · Not now, Back; "taken back · a hold"), FitWeek under the
//                           story on a summary day ("Your week, fitted to you"), DiaryFit (the card ends on a whole row)
//   Settings (slice 6)      FitsPage (Who set what, What I've learned), FitsRow and LearnedRow,
//                           KnobWho (a knob's "who set it"), FitResults (find)
//   the shell (the prep)    FitPal (⌘P finds every fit), FitsLayer (the knob a find lands on, #ft-knob), TopFold (⋯)
//   the move-in             ReachCard ("When I see a better fit for you, may I make it?"; the move-in is not on this branch)
// Each reads the store and the person's month and presses M; with no person (live) each draws nothing, or what it wraps.
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { M, S, SCN, camMovedAt, dataVer, useNext } from "../cv/index.ts";
import type { Line } from "../diary/book.ts";
import { DIARY_PX, fitDiary, fitTop, topItems } from "./fit.ts";
import { folderName } from "../place.ts";
import { fitOf, knob, knobNow, now, openPage, palFind, person, st, toggleWhy, ui, who, find, land, type Pal } from "./state.ts";
import { SCN as SCNS, TUNE, because, byDay, byWhom, dateOf, onDay, week, whenOf, type Fit, type Month } from "./rules.ts";
import { Overlay, Pop } from "../Overlay.tsx";
import { boxOf } from "../layers.ts";
import Circle from "../movein/you/Circle.tsx";
import "./fits.css";
import { dur } from "../../motion.ts";

export { DIARY_PX };
const aura = <span className="nx-aura still" />;
/** the small mark beside a word press, so a choice reads by its shape too (BR1, #1615, builder F) */
const Ic = ({ d }: { d: string }) => <svg className="ft-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const WHY = "M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.6M12 17.2v.3", BACK = "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11";

// ---------------------------------------------------------------- the why, one press away

function Why({ f, k }: { f: Fit; k: "d" | "s" }) {
  const open = ui.open.has(k + ":" + f.id);
  return <button className="ft-why" data-ftwhy={f.id} aria-expanded={open} onClick={(e) => { e.stopPropagation(); toggleWhy(k + ":" + f.id); }}><Ic d={WHY} />Why</button>;
}
function WhyText({ f, open }: { f: Fit; open: boolean }) {
  return <p className="ft-whytext" hidden={!open}>{because(f)} <small>From {f.src}.</small></p>;
}
const press = (f: () => unknown) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f(); };

// ---------------------------------------------------------------- the Diary

/** the fit a Diary line is about (its key fit:<id>:on|offer), for the line's data-fit */
export function fitIdOf(l: Line): string | undefined {
  const m = l.kind === "fit" ? /^fit:([^:]+):(on|offer)/.exec(l.key || "") : null;
  return m && fitOf(m[1]) ? m[1] : undefined;
}
/** on a fit's line in the Diary: its state, Why (and Back, or Keep · Not now, away from Far) */
export function FitLine({ l, far }: { l: Line; far?: boolean }) {
  const m = l.kind === "fit" ? /^fit:([^:]+):(on|offer)/.exec(l.key || "") : null, f = m ? fitOf(m[1]) : null, r = f ? now(SCNS[SCN]) : null;
  if (!m || !f || !r) return null;
  const s = r.state(f);
  const tag = s === "held" ? "taken back · a hold" : m[2] === "offer" && s === "on" ? "kept" : m[2] === "offer" && s === "notnow" ? "not now" : "";
  const acts = s === "on" ? <button data-ft={`back:${f.id}`} onClick={press(() => M.back_fit(f.id))}><Ic d={BACK} />Back</button>
    : m[2] === "offer" && s === "offered" ? <><button className="ft-keep" data-ft={`keep:${f.id}`} onClick={press(() => M.keep_fit(f.id))}>Keep</button><button data-ft={`notnow:${f.id}`} onClick={press(() => M.not_now_fit(f.id))}>Not now</button></> : null;
  return <>{tag ? <span className="ft-tag">{tag}</span> : null}<span className="ft-la"><Why f={f} k="d" />{far ? null : acts}</span><WhyText f={f} open={ui.open.has("d:" + f.id)} /></>;
}

/** the weekly summary, under the Diary's story on its day: the mode offer with its reason, Keep · Not now (after Keep,
 *  "Kept · today" with Back); the week's small fits, each with Why and Back; then the holds */
export function FitWeek({ k, band }: { k: number; band: string }) {
  const n = SCNS[SCN], p = person(n), r = p ? now(n) : null, w = p && r ? week(p, r, k) : null;
  if (!w || !r) return null;
  const offer = (f: Fit) => {
    const s = r.state(f);
    return (
      <div key={f.id} className={`ft-offer ${s}`} data-fit={f.id} data-fitmode={f.mode}><span className="ft-mode">{f.mode}</span>
        <p><b>{f.offer}</b> <span className="ft-because">{because(f)}</span></p>
        <div className="ft-acts">{s === "on" ? <><span className="ft-kept">Kept{byDay(r, f, "keep")}</span><button className="ft-btn" data-ft={`back:${f.id}`} onClick={press(() => M.back_fit(f.id))}><Ic d={BACK} />Back</button></>
          : s === "held" ? <span className="ft-kept">Taken back · a hold</span>
          : s === "notnow" ? <span className="ft-kept">Not now · asked again in four weeks at most</span>
          : <><button className="ft-btn pri" data-ft={`keep:${f.id}`} onClick={press(() => M.keep_fit(f.id))}>Keep</button><button className="ft-btn" data-ft={`notnow:${f.id}`} onClick={press(() => M.not_now_fit(f.id))}>Not now</button></>}</div>
      </div>
    );
  };
  return (
    <section className="ft-week" data-ft-week={w.d} data-front data-part="Your week">
      <div className="ft-wh">{aura}<b>Your week, fitted to you</b><small>{dateOf(w.d - 6)} to {dateOf(w.d)} · from what you did</small></div>
      {w.offers.map(offer)}
      {w.small.length ? <div className="ft-wsmall"><span>{w.small.length === 1 ? "One small fit this week" : w.small.length + " small fits this week"}, {r.reach === "small" ? "made and told" : "offered"}:</span>
        {w.small.map((f) => { const s = r.state(f); return (
          <div key={f.id} className="ft-sf" data-fitrow={f.id}><b>{f.value}</b>{f.place && folderName(f.place, "") ? ` · in ${folderName(f.place, "")}` : ""}{s === "held" ? " · taken back, a hold" : s === "offered" ? " · waits for your yes" : ""}
            <span className="ft-la"><Why f={f} k="d" />{band !== "far" && s === "on" ? <button data-ft={`back:${f.id}`} onClick={press(() => M.back_fit(f.id))}><Ic d={BACK} />Back</button> : null}</span><WhyText f={f} open={ui.open.has("d:" + f.id)} /></div>); })}</div> : null}
      {band !== "far" ? w.holds.map((f) => <p key={f.id} className="ft-wheld"><span className="ft-who ft-who-hold">a hold</span>{f.value}: you took it back on {dateOf(r.backs[f.id])}; it stays as you set it.</p>) : null}
    </section>
  );
}

/** the Diary's card ends on a whole row (fit.ts): after every draw of the page, and when the card changes size */
export function DiaryFit() {
  const ref = useRef<HTMLSpanElement>(null), fitted = useRef(""), later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // the join (#1615): on the plane the Diary draws on every pan and zoom (S32). It is fitted again only when what it holds
  // or its zoom changed, and while the hand pans or zooms, once it stops (fitting forces a layout per row folded)
  const key = (pg: HTMLElement) => `${dataVer()}|${S.cam.z}|${pg.textContent?.length}|${pg.getElementsByTagName("*").length}`;
  const fit = (pg: HTMLElement) => {
    clearTimeout(later.current);
    if (performance.now() - camMovedAt() < dur("lag")) { later.current = setTimeout(() => { if (pg.isConnected) fit(pg); }, dur("turn")); return; }
    fitDiary(pg); fitted.current = key(pg);
  };
  useLayoutEffect(() => { const pg = ref.current?.closest<HTMLElement>("#pl-dy"); if (pg && key(pg) !== fitted.current) fit(pg); });
  useEffect(() => () => clearTimeout(later.current), []);
  useEffect(() => {
    const pg = ref.current?.closest<HTMLElement>("#pl-dy");
    if (!pg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit(pg));
    ro.observe(pg);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className="ft-dyfit" hidden />;
}

// ---------------------------------------------------------------- Settings

/** Settings shows a fits page now (Who set what, What I've learned) */
export const fitsOpen = () => S.page === "settings" && !!ui.page;
function BackTo({ label, go }: { label: string; go: () => void }) {
  return <button className="st-tx ft-back" onClick={press(go)}>‹ {label}</button>;
}
function Tunes({ n }: { n: string }) {
  const s = st(n)!;
  return (
    <div className="st-tunes"><span>When I see a better fit</span>
      <span className="st-seg" role="radiogroup" aria-label="When I see a better fit">{TUNE.map((t) => <button key={t.id} role="radio" aria-checked={s.reach === t.id} data-ft={`reach:${t.id}`} onClick={press(() => M.set_reach(t.id))}>{t.n}</button>)}</span></div>
  );
}
function Row({ f, r }: { f: Fit; r: Month }) {
  const s = r.state(f), by = byWhom(r, f), open = ui.open.has("s:" + f.id);
  const chip = by === "hold" ? <span className="ft-who ft-who-hold">a hold</span> : <span className="ft-who ft-who-sol">{aura}{by === "kept" ? "Sol, kept by you" : "Sol"}</span>;
  const where = [folderName(f.place, "") || f.mode || "everywhere", s === "held" ? `taken back ${whenOf(r.backs[f.id])}` : `since ${whenOf(onDay(r, f))}`].join(" · ");
  return (
    <div className={`ft-card ft-row ${s}${ui.ringed === f.id ? " ft-ring" : ""}`} data-fitrow={f.id}>
      <div className="ft-rh">{chip}<span className="ft-rt"><b>{f.setting}</b><small>{s === "held" ? f.value + " · taken back, so it stays as you set it" : f.value}</small><span className="ft-rw">{where}</span></span>
        <Why f={f} k="s" />
        {s === "held" ? <button className="ft-btn" data-ft={`letgo:${f.id}`} onClick={press(() => M.let_go_hold(f.id))}>Let Sol suggest it again</button>
          : <button className="ft-btn" data-ft={`back:${f.id}`} onClick={press(() => M.back_fit(f.id))}><Ic d={BACK} />Back</button>}</div>
      <WhyText f={f} open={open} />
      {s === "held" ? <p className="ft-heldw">A hold: you took it back once, so I never make it there again.</p> : null}
    </div>
  );
}
function OfferRow({ f }: { f: Fit }) {
  return (
    <div className="ft-card ft-row offered" data-fitrow={f.id}><div className="ft-rh"><span className="ft-who ft-who-sol">{aura}Sol asks</span><span className="ft-rt"><b>{f.offer || f.offerLine}</b><small>{because(f)}</small></span>
      <button className="ft-btn pri" data-ft={`keep:${f.id}`} onClick={press(() => M.keep_fit(f.id))}>Keep</button><button className="ft-btn" data-ft={`notnow:${f.id}`} onClick={press(() => M.not_now_fit(f.id))}>Not now</button></div></div>
  );
}
/** Settings › Who set what (#settings&fits) and What I've learned (#settings&learned) */
export function FitsPage() {
  useNext(() => 0);
  const ref = useRef<HTMLDivElement>(null);
  // &ring=<fit|fact>: the row in view, ringed (its why is open already)
  useLayoutEffect(() => {
    if (!ui.ring) return;
    const el = ref.current?.querySelector<HTMLElement>(ui.page === "fits" ? `[data-fitrow="${CSS.escape(ui.ring)}"]` : `[data-fact="${CSS.escape(ui.ring)}"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("ft-ring"); }
  });
  const n = who(), p = person(n), r = now(n);
  if (ui.page === "learned") {
    const s = n ? st(n) : null, fs = p && s ? p.facts.filter((f) => !s.gone[f.k]) : [];
    return (
      <div className="st-page ft-page" data-ftpage="learned" ref={ref}><BackTo label="Settings" go={() => openPage(null)} /><h1>What I’ve learned about you</h1>
        <p className="st-say">Each line says where I learned it; press one to see it whole. Forget one and I stop using it now; nothing else of yours changes.</p>
        {ui.removed ? <div className="ft-undo">{aura}<span className="st-t">Forgotten. I stop using it now.</span><button className="ft-btn" onClick={press(() => ui.removed?.undo())}><Ic d={BACK} />Back</button></div> : null}
        {/* the circle's lines (known.ts): the same fact, source card and Forget as Settings › You's circle; Back is the bar above */}
        <div className="st-learn ft-learn">{fs.length ? fs.map((f) => (
          <div key={f.k} className="st-fact" data-fact={f.k}><Circle size="line" fact={f} where="everywhere, about you" onForget={(x) => { M.remove_fact(x.k); }} /></div>))
          : <div className="st-fact"><span className="st-t st-t3">Nothing yet. I add a line here when I learn something, with where I learned it.</span></div>}</div>
      </div>
    );
  }
  if (!n || !p || !r) return <div className="st-page ft-page" data-ftpage="fits"><BackTo label="Settings" go={() => openPage(null)} /><h1>Who set what</h1><p className="st-say">Nothing here has been fitted to you yet.</p></div>;
  const sol = p.fits.filter((f) => r.state(f) === "on"), held = p.fits.filter((f) => r.state(f) === "held"), wait = p.fits.filter((f) => r.state(f) === "offered");
  return (
    <div className="st-page ft-page" data-ftpage="fits" ref={ref}><BackTo label="Settings" go={() => openPage(null)} /><h1>Who set what</h1>
      <p className="st-say">Each setting says who set it: you, Sol, or a hold. Sol’s say why, from what you did; Back is one press, and a Back is a hold.</p>
      <Tunes n={n} />
      {wait.length ? <><h2 className="st-gh">Waiting for your yes <small>{wait.length}</small></h2>{wait.map((f) => <OfferRow key={f.id} f={f} />)}</> : null}
      <h2 className="st-gh">Set by Sol <small>{sol.length}</small></h2>{sol.length ? sol.map((f) => <Row key={f.id} f={f} r={r} />) : <p className="ft-none">Nothing yet.</p>}
      <h2 className="st-gh">Held <small>{held.length}</small></h2>{held.length ? held.map((f) => <Row key={f.id} f={f} r={r} />) : <p className="ft-none">No holds. A Back on anything Sol set makes one.</p>}
      <h2 className="st-gh">Set by you <small>{p.yours.length}</small></h2>{p.yours.length ? p.yours.map((y) => (
        <div key={y.setting} className="ft-card ft-row you"><div className="ft-rh"><span className="ft-who ft-who-you">you</span><span className="ft-rt"><b>{y.setting}</b><small>{y.value}</small><span className="ft-rw">since {whenOf(y.day)}</span></span></div></div>))
        : <p className="ft-none">Nothing yet: everything else is the default.</p>}
    </div>
  );
}
function GoRow({ id, n, sub, go }: { id: string; n: string; sub: string; go: () => void }) {
  return <div className="st-knob st-go"><button className="st-head" data-place={id} onClick={press(go)}><span className="st-ht"><b>{n}</b><small className="st-who">{sub}</small></span><span className="st-cur">›</span></button></div>;
}
/** a row in "How your AIs work": Who set what, with how many each set */
export function FitsRow() {
  const n = who(), p = person(n), r = now(n);
  if (!p || !r) return null;
  const sol = p.fits.filter((f) => r.state(f) === "on").length, held = p.fits.filter((f) => r.state(f) === "held").length;
  return <GoRow id="fits" n="Who set what" sub={`${sol} by Sol${held ? `, ${held} held` : ""}, ${p.yours.length} by you · each with why it is so`} go={() => openPage("fits")} />;
}
/** the voice group's "What I've learned about you" row: the person's facts, on their own page; else Settings' own row */
export function LearnedRow({ or }: { or: ReactNode }) {
  const n = who(), p = person(n), s = st(n);
  if (!p || !s) return <>{or}</>;
  const k = p.facts.filter((f) => !s.gone[f.k]).length;
  return <GoRow id="learned" n="What I’ve learned about you" sub={`${k} things · each one yours to see whole or forget`} go={() => openPage("learned")} />;
}
/** a knob's "who set it": Sol (its why one press away) or a hold, when a fit of the person's acts on that knob */
/** why Sol set a knob, when a fit of the person's month set it and is on, for Settings' plain rows (BR1 item 6) */
export function fitWhyOf(kid: string): string | null {
  const n = who(), p = person(n), r = now(n);
  const f = p && r ? p.fits.find((f) => f.knob === kid && r.state(f) === "on") : null;
  return f ? f.why : null;
}
export function KnobWho({ kid, or }: { kid: string; or: ReactNode }) {
  const n = who(), p = person(n), r = now(n);
  const f = p && r ? p.fits.find((f) => f.knob === kid && ["on", "held"].includes(r.state(f))) : null;
  if (!f || !r) return <>{or}</>;
  return r.state(f) === "held" ? <><span className="ft-who ft-who-hold">a hold</span> you took back “{f.value}” · {whenOf(r.backs[f.id])}</>
    : <>{aura} Sol set it: {f.value} · <span className="ft-whyin">{because(f)}</span></>;
}
/** Settings' find: every fit and fact of the person, under Settings' own results */
export function FitResults({ q }: { q: string }) {
  const n = who(), r = now(n), p = person(n);
  const hits = q.trim() && r && p ? find(q).slice(0, 4) : [];
  if (!hits.length || !r || !p) return null;
  return (
    <div className="st-rl ft-res" role="listbox" aria-label="Fitted to you"><div className="st-rh">Fitted to you</div>
      {hits.map((h) => {
        if (h.x === "fit") {
          const f = fitOf(String(h.id))!, s = r.state(f);
          return <button key={f.id} className="st-r st-r-x" role="option" aria-selected={false} data-fid={f.id} onClick={press(() => land(f.id))}>
            <span className="st-t"><b>{f.setting}</b><small>{s === "held" ? "A hold" : byWhom(r, f) === "kept" ? "Sol, kept by you" : s === "offered" ? "Sol asks" : "Sol"}: {f.value}{f.place ? " · in " + folderName(f.place, "") : ""}</small></span></button>;
        }
        const x = p.facts.find((y) => y.k === h.id)!;
        return <button key={"f" + x.k} className="st-r st-r-x" role="option" aria-selected={false} onClick={press(() => openPage("learned", x.k))}><span className="st-t"><b>{x.fact}</b><small>What I’ve learned · from {x.source}</small></span></button>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the shell: ⌘P, the knob, the top bar's ⋯

/** ⌘P: the person's fits and facts by their words; a pick lands on the knob */
export function FitPal({ q, close }: { q: string; close: () => void }) {
  const rows: Pal[] = q.trim() && who() ? palFind(q) : [];
  return <>{rows.map((x) => <button key={x.l} className="nx-res ft-pal" data-fit={x.fit} onClick={(e) => { e.stopPropagation(); close(); x.go(); }}><span>{x.l}<small className="ft-pals"> · {x.s}</small></span><span className="nx-k">{x.g}</span></button>)}</>;
}
/** the knob a find landed on (#ft-knob), in its folder at Middle: ringed, its why open; Escape, × or leaving closes it */
export function FitsLayer() {
  useNext(() => 0);
  const k = knobNow(), f = k ? fitOf(k.id) : null, r = f ? now() : null;
  if (!k || !f || !r) return null;
  const s = r.state(f), by = byWhom(r, f);
  return (<Overlay>
    <div key={ui.n} id="ft-knob" className="ft-knob ft-ring" role="dialog" aria-label={f.setting} data-fitrow={f.id}>
      <div className="ft-kh">{s === "held" ? <span className="ft-who ft-who-hold">a hold</span> : <span className="ft-who ft-who-sol">{aura}{by === "kept" ? "Sol, kept by you" : s === "offered" ? "Sol asks" : "Set by Sol"}</span>}
        <span className="ft-kwhere">here, in {folderName(f.place, "")}</span><button className="ft-x" data-ft="close" aria-label="Close" onClick={press(() => knob(null))}>×</button></div>
      <b className="ft-kn">{f.setting}</b><div className="ft-kv">{s === "held" ? "Taken back: " + f.value : f.value}</div>
      <button className="ft-why" data-ftwhy={f.id} aria-expanded="true"><Ic d={WHY} />Why</button><WhyText f={f} open />
      <div className="ft-acts">{s === "held" ? <button className="ft-btn" data-ft={`letgo:${f.id}`} onClick={press(() => M.let_go_hold(f.id))}>Let Sol suggest it again</button>
        : s === "offered" ? <><button className="ft-btn pri" data-ft={`keep:${f.id}`} onClick={press(() => M.keep_fit(f.id))}>Keep</button><button className="ft-btn" data-ft={`notnow:${f.id}`} onClick={press(() => M.not_now_fit(f.id))}>Not now</button></>
        : <button className="ft-btn" data-ft={`back:${f.id}`} onClick={press(() => M.back_fit(f.id))}><Ic d={BACK} />Back</button>}
        <button className="st-tx" data-ft={`go:fits:${f.id}`} onClick={press(() => { knob(null); openPage("fits", f.id); })}>Who set what ›</button>
        {f.knob ? <button className="st-tx" data-ft={`go:knob=${f.knob}`} onClick={press(() => { knob(null); M.stOpen(f.knob); })}>In Settings ›</button> : null}</div>
    </div>
  </Overlay>);
}
/** the top bar's ⋯: shown while something is folded; its menu lists the folded items, each pressing the original */
export function TopFold() {
  const ref = useRef<HTMLButtonElement>(null);
  const [n, setN] = useState(0);
  const [menu, setMenu] = useState<{ word: string; key: string; el: HTMLElement }[] | null>(null);
  useLayoutEffect(() => { const t = ref.current?.closest<HTMLElement>(".nx-top"); if (t) { const k = fitTop(t); if (k !== n) setN(k); if (!k && menu) setMenu(null); } });
  useEffect(() => {
    const t = ref.current?.closest<HTMLElement>(".nx-top"), r = t?.querySelector(".nx-right");
    if (!t || !r || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setN(fitTop(t)));
    ro.observe(t); ro.observe(r);
    const off = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.("#topmenu,.ft-more")) setMenu(null); };
    document.addEventListener("click", off, true);
    return () => { ro.disconnect(); document.removeEventListener("click", off, true); };
  }, []);
  return (
    <>
      <button ref={ref} className={`nx-chip ft-more${n ? " on" : ""}`} aria-label="More" title={n ? `${n} more here` : "More"} aria-expanded={!!menu} hidden={!n}
        onClick={(e) => { e.stopPropagation(); const t = ref.current?.closest<HTMLElement>(".nx-top"); setMenu(menu || !t ? null : topItems(t)); }}>⋯</button>
      {menu ? <Pop id="topmenu" className="ft-topmenu" role="menu" prefer="below" anchor={() => (ref.current ? boxOf(ref.current) : null)}>
        {menu.length ? menu.map((x, i) => <button key={i} className="nx-mv" role="menuitem" data-tm={i} onClick={(e) => { e.stopPropagation(); setMenu(null); x.el.click(); }}>{x.word}{x.key ? <span className="nx-kbd">{x.key}</span> : null}</button>)
          : <div className="ft-tmf">Everything here is in the bar</div>}
      </Pop> : null}
    </>
  );
}

// ---------------------------------------------------------------- the move-in's one ask

/** "When I see a better fit for you, may I make it?" (the move-in draws it under its unsure cards; not on this branch) */
export function ReachCard({ scen }: { scen?: string }) {
  useNext(() => 0);
  const n = (scen && SCNS[scen]) || who(), s = n ? st(n) : null;
  if (!n || !s) return null;
  const said = s.asked ? TUNE.find((t) => t.id === s.reach)!.n : null, order = (["small", "ask", "off"] as const).map((id) => TUNE.find((t) => t.id === id)!);
  return (
    <div className={`ft-card ft-reach${said ? " done" : ""}`} data-q="reach"><div className="ft-q">When I see a better fit for you, may I make it?</div>
      <div className="ft-w">Small fits only, like folding steps you never open; each says why, and Back is one press. A change to a whole mode always waits for your Keep. Until you answer: Ask me first.</div>
      <div className="ft-acts">{order.map((t, i) => <button key={t.id} className={`ft-btn${i ? "" : " pri"}`} data-ft={`reach:${t.id}`} onClick={press(() => M.set_reach(t.id))}>{t.n}</button>)}</div>
      {said ? <div className="ft-said">You said: {said}. Change it in Settings › How I keep your settings fitting.</div> : null}
    </div>
  );
}
