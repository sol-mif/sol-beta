// The because (BR1, #1615; picked drawing mine/look/br1/folder.html): what Sol knows, said only on the thing Sol did,
// never in a floating card. A Diary line, a folder's part, an ask or a plan carries why, the keys of the facts that made
// it; this draws grey words (at most six, known.ts becauseOf's short) in the part's corner or under the line, and a press
// unfolds the fact right under it, in flow, pushing what follows down: the fact in a sentence, where Sol learned it, and
// the ways to answer it, each with its icon: That's right · That's wrong · It's out of date · Only in this folder. With
// several facts each says itself with one Edit this fact (three, then Show N more). A fix shows what Sol would do
// differently before it is kept (Keep / Back), the engine's next.you.fact.fix; once kept, and only where the caller knows
// the things shown this for the same reason (same, or the engine's on the preview), it asks once "Same for these N?": Only here · These N · Everywhere.
// Until a fixer is held (fix.ts) the one way is That's wrong, which forgets the fact (with Back) where the engine or the
// person's settings hold it. Esc, a second press or a press outside folds it. No why, or no fact Sol still knows: nothing.
// A folder Sol placed (placed:<folder>, place.ts) answers with a placement's ways instead: That's right, Put this folder
// back where it was (off the shelf), or the drag that moves it, then "Bring them back too?" once for a move back.
// Everything inside is a span, so it sits in a line's <p> or <span>. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { useEffect, useRef, useState } from "react";
import { M, hooks } from "../cv/index.ts";
import { frame } from "../frame.tsx";
import { W } from "../cv/moves/settings.ts";
import { knownEngine } from "../cv/wire/because.ts";
import { youNow } from "../cv/wire/you.ts";
import { becauseOf, forgettable, known, type Known } from "../known.ts";
import { HOW_W, changed, howW, kept, lineOf, placeWord, useFixer, waysOf, type Fixer, type How, type Preview, type SameOf } from "./fix.ts";
import { ASK_W, DRAG_W, PLACE_W, samePlacedW, placeSaid, placeWays, placedOf, solPlaced, usePlacer, type PlaceHow, type Placer } from "./place.ts";
import "./because.css";

/** what Sol knows of the person now, every place: the facts a why can name (next.known's, once the engine holds it) */
export const knownNow = (): Known[] => known("you", { you: youNow(), engine: knownEngine(), learned: W().prefs.learned });

/** That's wrong without a fixer: the fact forgotten; what it returns is the Back (none: it could not be forgotten) */
export type Forget = (k: string) => (() => void) | null;
const forgetLive: Forget = (k) => { const r = M.stAct("k-rm", k); return r.ok && r.undo ? r.undo : null; };

/** the scopes a kept fix may reach: this thing alone, the N shown it for the same reason, or every place */
export type Scope = "here" | "these" | "everywhere";
/** the things shown this for the same reason (P's similar list, read-only), and how a scope is kept; null: none known */
export type Same = (how: How) => { n: number; keep: (s: Scope) => void } | null;

type Props = {
  /** the why of what Sol did: the keys of the facts that made it */
  ks: readonly string[] | null | undefined;
  /** the facts to read them from (the dev page's person); unsaid, what Sol knows now */
  all?: readonly Known[];
  forget?: Forget;
  /** the fixer to use (the dev page's); unsaid, the one the engine holds, if any */
  fixer?: Fixer | null;
  /** the placer to use (the dev page's); unsaid, the one the engine holds, if any */
  placer?: Placer | null;
  /** the place what Sol did is in (a folder's part, its plan): Only in this folder moves a fact to it */
  here?: string;
  /** the things shown this for the same reason; unsaid, the fix is not offered to them */
  same?: Same;
  /** the grey words, when the thing names its own fact in 2-6 of them (a folder's part); unsaid, the fact's first words */
  words?: string;
  /** told when it folds (Esc, a second press, a press outside, a fix done), so a part hidden by it can leave then */
  onFold?: () => void;
  /** a link after where Sol learned it, to the place that holds it (Settings: History of changes) */
  link?: { label: string; go: () => void };
};

/** nothing to say without a why: no facts are read for the many lines that carry none */
export default function Because(p: Props) { return p.ks?.length ? <BecauseOf {...p} /> : null; }

function BecauseOf({ ks, all, forget = forgetLive, fixer, placer, here, same, words, onFold, link }: Props) {
  const held = useFixer(), fx = fixer === undefined ? held : fixer;
  const heldPl = usePlacer(), pl = placer === undefined ? heldPl : placer;
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState<{ f: Known; back: () => void } | null>(null);
  const [every, setEvery] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);   // the one fact being fixed: the others hold their press
  const [ask, setAsk] = useState<{ n: number; keep: (s: Scope) => void; of?: "folders" } | null>(null);   // "Same for these N?", once
  const at = useRef<HTMLButtonElement | null>(null), box = useRef<HTMLSpanElement | null>(null);
  const b = becauseOf(ks ?? undefined, (all ?? knownNow()).filter((f) => f.k !== gone?.f.k));
  const fold = () => { setOpen(false); setEditing(null); setAsk(null); onFold?.(); };
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { const t = e.target as Node; if (!at.current?.contains(t) && !box.current?.contains(t)) fold(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fold(); at.current?.focus(); } };
    document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  useEffect(() => { if (open || ask) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [open, ask]);   // clear of the bar below (scroll-margin)
  const goneLine = gone ? <Gone f={gone.f} onBack={() => { gone.back(); setGone(null); }} /> : null;
  const sameFor = ask ? <span ref={box} className="bc-open" role="group" aria-label="Same for these?" onClick={(e) => e.stopPropagation()}>
    <SameFor n={ask.n} of={ask.of} onPick={(s) => { ask.keep(s); fold(); }} onBack={fold} /></span> : null;
  if (!b) return <>{goneLine}{sameFor}</>;   // a fix that took the line's last fact still asks, once
  const no = (f: Known) => { const back = forget(f.k); if (back) { setGone({ f, back }); fold(); } };
  const done = (how: How | null, p?: Preview) => {
    const s = !how || how === "right" ? null : same ? same(how) : p?.same && fx?.same ? sameLive(fx, how, p.same) : null;
    if (s && s.n > 0) setAsk(s); else fold();
  };
  const one = b.facts.length === 1;
  // the grey words already say the one fact whole (Settings' row, a short Diary line): the unfold does not say it again
  const said = one && bare(words ?? b.short) === bare(b.facts[0].fact);
  // a screen reader hears the whole because, never the six words cut short (BR1 item 5): the shown words first, so the
  // name still holds what is on screen
  const tip = b.facts.every(solPlaced) ? b.facts.map((f) => f.fact).join(" · ") : b.label;
  return (
    <>
      <button type="button" ref={at} className="bc" data-because={b.facts.map((f) => f.k).join(" ")} aria-expanded={open} title={tip} aria-label={words && bare(words) !== bare(tip) ? `${words}: ${tip}` : tip}
        onClick={(e) => { e.stopPropagation(); if (open) fold(); else setOpen(true); }}>{words ?? b.short}<BecauseMark open={open} /></button>
      {goneLine}
      {sameFor ?? (open ? (
        <span ref={box} className="bc-open" role="group" aria-label="Why Sol did this" onClick={(e) => e.stopPropagation()}>
          {(every ? b.facts : b.facts.slice(0, SHOWN)).map((f) => <Fact key={f.k} f={f} fx={fx} pl={pl} here={here} one={one} said={said} quiet={editing !== null && editing !== f.k}
              onEdit={(on) => setEditing((e) => (on ? f.k : e === f.k ? null : e))} onNo={() => no(f)} onDone={done}
              onPlaced={(s) => { if (s && s.n > 0 && pl) setAsk(samePlaced(pl, s)); else fold(); }} />)}
            {!every && editing === null && b.facts.length > SHOWN ? <button type="button" className="bc-btn q" data-more onClick={() => setEvery(true)}><I d={IC.more} />Show {b.facts.length - SHOWN} more</button> : null}
            <span className="bc-from">{b.from.join(" · ")}{link ? <> · <button type="button" className="bc-tx" data-link onClick={() => { fold(); link.go(); }}>{link.label}</button></> : null}</span>
        </span>
      ) : null)}
    </>
  );
}

/** the engine's same (next.you.fact.fix's), kept by next.known.same: these N by their keys, or every place */
function sameLive(fx: Fixer, how: How, o: SameOf): { n: number; keep: (s: Scope) => void } {
  return { n: o.n, keep: (s) => { void fx.same?.({ reason: o.reason, how, reach: s, ...(s === "these" ? { to: o.these.map((t) => t.k) } : {}) })
    .then((ok) => { if (ok && s !== "here") hooks.flash?.(s === "these" ? `Kept for the ${o.n === 1 ? "other place" : `${o.n} other places`} too` : "Kept everywhere"); }); } };
}

/** a move back taken to the things placed for the same reading: these N by their keys, or every one like it */
function samePlaced(pl: Placer, o: SameOf): { n: number; keep: (s: Scope) => void; of: "folders" } {
  return { n: o.n, of: "folders", keep: (s) => { if (s === "here") return; void pl.same({ reason: o.reason, reach: s, to: o.these.map((t) => t.k) })
    .then((ok) => { if (ok) hooks.flash?.(s === "these" ? `${o.n === 1 ? "The other one is" : `The ${o.n} others are`} back where they were too` : "Your AI won’t shelve folders like this again"); }); } };
}

/** a because's words as bare words: no "because", no closing stop or ellipsis, one case */
const bare = (s: string) => s.trim().replace(/^because\s+/i, "").replace(/[.…\s]+$/, "").toLowerCase();

/** the one mark wherever because… lives (a folder's part, a Diary line, an ask, the canvas's caption): a small chevron after
 *  the grey words, grey like them, pointing right while folded and down while open (23a57e26's pick) */
export function BecauseMark({ open }: { open: boolean }) {
  return <svg className={`bc-mark${open ? " open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>;
}

/** the facts unfolded before "N more": one Edit this fact each, so it holds at most four presses (the card check's 5) */
export const SHOWN = 3;

/** the icons, one per press (the card check: an icon on every choice), drawn in the ink's own stroke */
const IC = {
  fix: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", right: "M5 12.5l4.5 4.5L19 7", wrong: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  changed: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4", only: "M12 20.5s-6-5.6-6-10.5a6 6 0 0 1 12 0c0 4.9-6 10.5-6 10.5zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  back: "M14.5 6l-6 6 6 6", see: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", more: "M6 9.5l6 6 6-6",
  these: "M4 7h16M4 12h16M4 17h10", take: "M12 19V7M7 11l5-5 5 5M5 21h14", all: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.5 2.4 3.5 5.2 3.5 8.5s-1 6.1-3.5 8.5c-2.5-2.4-3.5-5.2-3.5-8.5s1-6.1 3.5-8.5z",
} as const;
const WAY_IC: Record<How, string> = { right: IC.right, "not-true": IC.wrong, "not-anymore": IC.changed, "only-here": IC.only };
const I = ({ d }: { d: string }) => <svg className="bc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

type Step = { s: "view" } | { s: "ways" } | { s: "now"; how: How } | { s: "asking"; how: How } | { s: "preview"; how: How; p: Preview };

/** one fact unfolded: its sentence and the ways to answer it (at once when it is the only one); a fix previews, then Keep or Back */
function Fact({ f, fx, pl, here, one, said, quiet, onEdit, onNo, onDone, onPlaced }: { f: Known; fx: Fixer | null; pl: Placer | null; here?: string; one: boolean; said: boolean; quiet: boolean; onEdit: (on: boolean) => void; onNo: () => void; onDone: (how: How | null, p?: Preview) => void; onPlaced: (same: SameOf | null) => void }) {
  if (solPlaced(f)) return <PlacedFact f={f} pl={pl} one={one} quiet={quiet} onEdit={onEdit} onDone={onPlaced} />;
  return <FactOf f={f} fx={fx} here={here} one={one} said={said} quiet={quiet} onEdit={onEdit} onNo={onNo} onDone={onDone} />;
}

/** a placement unfolded: where Sol put the folder and why, and its ways (at once when it is the only fact): That's
 *  right, Take it off the shelf for one on the shelf, else the drag that moves it, said */
function PlacedFact({ f, pl, one, quiet, onEdit, onDone }: { f: Known; pl: Placer | null; one: boolean; quiet: boolean; onEdit: (on: boolean) => void; onDone: (same: SameOf | null) => void }) {
  const folder = placedOf(f.k)!, name = placeWord(folder);
  const [st, setSt] = useState<"view" | "ways" | "asking">(one ? "ways" : "view");
  useEffect(() => onEdit(st !== (one ? "ways" : "view")), [st]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (how: PlaceHow) => {
    if (!pl) return;
    setSt("asking");
    if (how === "right") { if (await pl.right(folder)) { hooks.flash?.(placeSaid("right", name)); onDone(null); } else setSt("ways"); return; }
    const same = await pl.sameOf(f.k, folder);   // before the move: the placement still stands to be read
    const back = await pl.take(folder, name);
    if (!back) { setSt("ways"); return; }
    frame.say(placeSaid("take", name), { act: { label: "Back", run: back } });
    onDone(same);
  };
  const ways = pl ? placeWays(pl.onShelf(folder)) : [];
  return (
    <span className="bc-fact" data-known={f.k} data-step={st}>
      <span className="bc-why">{f.fact}</span>
      {!pl || quiet ? null : st === "view"
        ? <span className="bc-acts"><button type="button" className="bc-btn" data-fix onClick={() => setSt("ways")}><I d={IC.fix} />{ASK_W}</button></span>
        : st === "ways" ? (
          <span className="bc-acts" role="group" aria-label={ASK_W}>
            {ways.map((h) => <button type="button" key={h} className="bc-btn" data-place={h} onClick={() => void go(h)}><I d={h === "right" ? IC.right : IC.take} />{PLACE_W[h]}</button>)}
            {one ? null : <button type="button" className="bc-btn q" data-back onClick={() => setSt("view")}><I d={IC.back} />Back</button>}
            {ways.includes("take") ? null : <span className="bc-note" data-drag>{DRAG_W}</span>}
          </span>)
        : <span className="bc-note" role="status">Working on it…</span>}
    </span>
  );
}

/** a fact unfolded (what Sol knows, not where it put a thing) */
function FactOf({ f, fx, here, one, said, quiet, onEdit, onNo, onDone }: { f: Known; fx: Fixer | null; here?: string; one: boolean; said: boolean; quiet: boolean; onEdit: (on: boolean) => void; onNo: () => void; onDone: (how: How | null, p?: Preview) => void }) {
  const rest: Step = one && fx ? { s: "ways" } : { s: "view" };
  const [st, setSt] = useState<Step>(rest);
  useEffect(() => onEdit(st.s !== rest.s), [st.s]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [now, setNow] = useState("");
  const told = f.k.startsWith("fact:");   // only a told fact takes new words (the engine's rule)
  const ask = async (how: How, words?: string) => {
    if (!fx) return;
    setSt({ s: "asking", how });
    const p = await fx.fix({ k: f.k, how, now: words, place: how === "only-here" ? here : undefined });
    if (!p) { setSt(rest); return; }   // not taken (the fact went meanwhile, or no answer in time): as it was
    if (how === "right") { hooks.flash?.("Sol goes on using it"); onDone(null); return; }
    setSt({ s: "preview", how, p });
  };
  const settle = async (st0: { how: How; p: Preview }, keep: boolean) => {
    if (!fx) return;
    await fx.settle(st0.p.token, keep);
    if (keep) { hooks.flash?.(kept(st0.p.changes)); onDone(st0.how, st0.p); } else setSt(rest);   // said by the frame (frame.say)
  };
  return (
    <span className="bc-fact" data-known={f.k} data-step={st.s}>
      {said ? null : <span className="bc-why">{f.fact}</span>}
      {st.s === "view" && !quiet ? (fx
        ? <span className="bc-acts"><button type="button" className="bc-btn" data-fix onClick={() => setSt({ s: "ways" })}><I d={IC.fix} />Edit this fact</button></span>
        : forgettable(f.k) ? <span className="bc-acts"><button type="button" className="bc-btn" data-how="not-true" onClick={onNo}><I d={WAY_IC["not-true"]} />{HOW_W["not-true"]}</button></span> : null)
        : null}
      {st.s === "ways" && fx ? (
        <span className="bc-acts" role="group" aria-label="Edit this fact">{waysOf(f, here).map((h) => (
          <button type="button" key={h} className="bc-btn" data-how={h} title={howW(h, here)}
            onClick={() => (h === "not-anymore" && told ? setSt({ s: "now", how: h }) : void ask(h))}><I d={WAY_IC[h]} />{HOW_W[h]}</button>))}
          {one ? null : <button type="button" className="bc-btn q" data-back onClick={() => setSt({ s: "view" })}><I d={IC.back} />Back</button>}</span>
      ) : null}
      {st.s === "now" ? (
        <span className="bc-now">
          <input autoFocus value={now} onChange={(e) => setNow(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(st.how, now.trim() || undefined); }}
            placeholder="What’s true now, if anything?" aria-label="What’s true now" />
          <span className="bc-acts"><button type="button" className="bc-btn on" onClick={() => void ask(st.how, now.trim() || undefined)}><I d={IC.see} />Preview the change</button><button type="button" className="bc-btn q" onClick={() => setSt({ s: "ways" })}><I d={IC.back} />Back</button></span>
        </span>
      ) : null}
      {st.s === "asking" ? <span className="bc-note" role="status">Working out what would change…</span> : null}
      {st.s === "preview" ? (
        <span className="bc-preview" role="status">
          <b>{changed(st.p.changes)}</b>
          {st.p.changes.map((c, i) => { const l = lineOf(c), own = new Set(st.p.changes.map((x) => x.when ?? "")).size > 1;   // one when for all: the headline says it
            return <span key={i} className="bc-ch"><span className="bc-what">{l.what}</span> {l.from ? <><s>{l.from}</s> → </> : "→ "}{l.to}{own && c.when ? <small> · {c.when}</small> : null}</span>; })}
          <span className="bc-acts"><button type="button" className="bc-btn on" data-keep onClick={() => void settle(st, true)}><I d={IC.right} />Keep</button><button type="button" className="bc-btn q" data-back onClick={() => void settle(st, false)}><I d={IC.back} />Back</button></span>
        </span>
      ) : null}
    </span>
  );
}

/** a kept fix, asked once of the things shown this for the same reason: here alone, these N, or everywhere */
function SameFor({ n, of, onPick, onBack }: { n: number; of?: "folders"; onPick: (s: Scope) => void; onBack: () => void }) {
  return (
    <span className="bc-fact" data-same={n}>
      <span className="bc-why">{of ? samePlacedW(n) : `Same for ${n === 1 ? "the other place" : `the ${n} other places`} Sol used this?`}</span>
      <span className="bc-acts" role="group" aria-label="Same for these?">
        <button type="button" className="bc-btn" data-scope="here" onClick={() => onPick("here")}><I d={IC.only} />Only here</button>
        <button type="button" className="bc-btn" data-scope="these" onClick={() => onPick("these")}><I d={IC.these} />{n === 1 ? "That one too" : `These ${n}`}</button>
        <button type="button" className="bc-btn" data-scope="everywhere" onClick={() => onPick("everywhere")}><I d={IC.all} />Everywhere</button>
        <button type="button" className="bc-btn q" data-back onClick={onBack}><I d={IC.back} />Back</button>
      </span>
    </span>
  );
}

/** a fact just said That's wrong, in the because's place, with Back */
function Gone({ f, onBack }: { f: Known; onBack: () => void }) {
  return (
    <span className="bc-gone" role="status">“{f.fact}” forgotten. Sol won’t use it. <button type="button" className="bc-tx" onClick={onBack}>Back</button></span>
  );
}
