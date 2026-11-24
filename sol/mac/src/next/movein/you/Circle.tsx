// The circle, the one picture of what Sol knows (BR1 root part 5, #1615; scene 7 of mine/look/br1/meta-loop.html). One
// component at four sizes, each reading next/known.ts and nothing else:
//   full    the Mac as a circle (circle.ts works it out; this draws it and nothing else): the places, the facts as
//           chips threaded to the rim where Sol learned them (a picked place's or fact's only), Claude outside; buttons over it for what a person presses
//   badge   a place's facts as their sources' dots and "3 facts about this folder · ◑" (the place's dial); a press opens full on it
//   line    one fact in one sentence, its source's dot and where it came from; a press opens its source card under it
//   chips   a place's facts in a row (the move-in's Found rows); a press opens the pressed one's source card under them
// The source card (Source) is the same wherever a fact is pressed: the fact, where Sol learned it and when, the place,
// and Forget with Back when the engine holds the fact (Fix once next.you.fact.fix is held). Nothing is cut: every
// word wraps. Signed: marcocyl04-ux's agent (builder F).
import { useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { KIND, badgeOf, dialGlyph, dialShort, type Picture } from "./circle-state.ts";
import { kindOfKnown } from "./lens-state.ts";
import { forgettable, type Known } from "../../known.ts";
import type { Level } from "./types.ts";
import "./known.css";

export type Sel = { chip: string } | { place: string } | null;

type Full = {
  size: "full"; pic: Picture; sel: Sel; colour: (placeId: string, i: number) => string; claude: boolean;
  onChip: (id: string) => void; onPlace: (id: string) => void; still?: boolean;   // still: a picture with nothing to press (the read running)
  calm?: string;   // calm (#yu, BR1): at rest the places and chips are words; pointing at the picture, or a key in it, makes them presses; the picture's own name
};
type Badge = { size: "badge"; known: readonly Known[]; n?: number; level?: Level | null; onOpen: () => void; label?: string };   // n: the count said, when not known's
/** onForget: Forget was pressed; what it returns is the Back (none: Forget is not offered) */
type Line = { size: "line"; fact: Known; where?: string; onForget?: (f: Known) => (() => void) | void; children?: ReactNode };
type Chips = { size: "chips"; known: readonly Known[]; where?: string };

export default function Circle(p: Full | Badge | Line | Chips) {
  return p.size === "badge" ? <BadgeC {...p} /> : p.size === "line" ? <LineC {...p} /> : p.size === "chips" ? <ChipsC {...p} /> : <FullC {...p} />;
}

/** a place's facts in a row, each its source's dot and all its words; a press opens its source card under them */
function ChipsC({ known, where }: Chips) {
  const [open, setOpen] = useState<string | null>(null);
  if (!known.length) return null;   // nothing learned of it: no row, never an empty one
  const f = known.find((x) => x.k === open);
  return (
    <div className="kn-chips">
      <div className="kn-row">{known.map((x) => (
        <button type="button" key={x.k} className={`kn-chip${open === x.k ? " on" : ""}`} data-known={x.k} aria-expanded={open === x.k}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => (o === x.k ? null : x.k)); }}>
          <i className="kn-dot" style={{ background: KIND[kindOfKnown(x)].c }} aria-hidden="true" />{x.fact}
        </button>
      ))}</div>
      {f ? <Source f={f} where={where} /> : null}
    </div>
  );
}

function BadgeC({ known, n, level, onOpen, label }: Badge) {
  const b = badgeOf(known, { level, label, n });
  if (!b) return null;   // nothing known here yet: no badge, never a zero
  return (
    <button type="button" className="kn-badge" data-known={b.n} onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label={b.aria} aria-description={b.desc}>
      <span className="kn-dots" aria-hidden="true">{b.kinds.map((k) => <i key={k} style={{ background: KIND[k].c }} />)}</span>
      <span className="kn-bw">{b.short}<span className="kn-bwr">{b.w.slice(b.short.length)}</span>{b.dial ? <span className="kn-dial"> · {b.dial}</span> : null}</span>
    </button>
  );
}

function LineC({ fact, where, onForget, children }: Line) {
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState<(() => void) | null>(null);
  const kind = kindOfKnown(fact);
  if (back) return <Gone fact={fact} onBack={() => { back(); setBack(null); }} />;
  return (
    <div className={`kn-line${open ? " open" : ""}`} data-known={fact.k}>
      <button type="button" className="kn-press" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i className="kn-dot" style={{ background: KIND[kind].c }} aria-hidden="true" />
        <span className="kn-w">{fact.fact}<small>{fact.source}{fact.stale ? " · may be out of date" : ""}</small></span>
      </button>
      {children}
      {open ? <Source f={fact} where={where} onForget={onForget ? () => { const b = onForget(fact); if (b) setBack(() => b); setOpen(false); } : undefined} /> : null}
    </div>
  );
}

/** a fact just forgotten, in its line's place, with Back (a list whose fact leaves it draws this itself) */
export function Gone({ fact, onBack }: { fact: Known; onBack: () => void }) {
  return (
    <div className="kn-line gone" data-known={fact.k} role="status">
      <span className="kn-w">“{fact.fact}” forgotten. Sol won’t use it.</span>
      <button type="button" className="kn-tx" onClick={onBack}>Back</button>
    </div>
  );
}

/** when Sol learned it, as a day in the person's own words ("21 Nov"); words the engine sent as words are said as sent */
const when = (at: string) => { const t = Date.parse(at); return Number.isNaN(t) ? at : new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };

/** a pressed fact: what it is, where Sol learned it, its place, and Forget when the engine holds it */
export function Source({ f, where, onForget, note, cls = "kn-src" }: { f: Known; where?: string; onForget?: () => void; note?: ReactNode; cls?: string }) {
  const kind = kindOfKnown(f);
  return (
    <div className={cls} data-sel={f.k}>
      <h3>{f.fact}</h3>
      <p className="src"><i className="yl-dot kn-dot" style={{ background: KIND[kind].c }} />{KIND[kind].w} · {f.source}{f.at ? ` · ${when(f.at)}` : ""}{f.stale ? " · may be old" : ""}</p>
      <p className="src">In: {where ?? (f.place ? "this place" : "about you, everywhere")}</p>
      {onForget && forgettable(f.k) ? <div className="acts"><button type="button" className="yl-pill kn-pill" onClick={onForget}>Forget</button></div>
        : note ?? <p className="src mute">Sol works this out from what it reads; it changes as you work.</p>}
    </div>
  );
}

function FullC({ pic, sel, colour, claude, onChip, onPlace, still, calm }: Full) {
  const { cx, cy, R, you, claude: cb } = pic;
  // calm: words at rest; pointing, focus inside, or something picked makes them presses (the card check counts at most 5 at rest)
  const [near, setNear] = useState(false), live = !calm || near || !!sel;
  const reach = calm ? {
    tabIndex: live ? -1 : 0, role: "group", "aria-label": calm,
    onPointerEnter: () => setNear(true), onPointerLeave: (e: PointerEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(document.activeElement)) setNear(false); },
    onFocus: () => setNear(true), onBlur: (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNear(false); },
  } : {};
  const chipSel = sel && "chip" in sel ? sel.chip : null, placeSel = sel && "place" in sel ? sel.place : null;
  const lit = (placeId: string | null, chipId: string) => (chipSel ? chipSel === chipId : placeSel ? placeSel === placeId : true);
  const ay = cb ? cb.y + cb.h / 2 : cy, ax = cx + Math.sqrt(Math.max(0, R * R - (ay - cy) ** 2)) + 4, bx = cb ? cb.x - 6 : ax;
  return (
    <div className={`yk${live ? "" : " rest"}`} style={{ width: pic.w, height: pic.h }} data-fits={pic.fits ? "" : undefined} {...reach}>
      <svg width={pic.w} height={pic.h} viewBox={`0 0 ${pic.w} ${pic.h}`} aria-hidden="true">
        <defs><marker id="yk-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5b5bd6" /></marker></defs>
        <circle className="yk-mac" cx={cx} cy={cy} r={R} />
        <text className="yk-macw" x={cx} y={cy - R - 10} textAnchor="middle">This Mac</text>
        {pic.discs.map((d) => <circle key={d.id} className={`yk-disc${placeSel === d.id ? " on" : ""}`} cx={d.x} cy={d.y} r={d.r} style={{ fill: colour(d.id, d.i) }} />)}
        {/* a thread only for what is picked (#1787): at rest every fact's thread ran over other places' words and chips
            (nine places at 2560); the chip's dot already says its source, and "Pick any fact to see its source" draws it */}
        {chipSel || placeSel ? pic.threads.map((t) => {
          const c = pic.chips.find((x) => x.id === t.chip)!;
          return lit(c.place, c.id) ? <path key={t.chip} className={`yk-thread${chipSel === c.id ? " on" : ""}`} d={t.d} style={{ stroke: KIND[t.kind].c }} /> : null;
        }) : null}
        {pic.rim.map((r) => <g key={r.kind}>
          <circle cx={r.x} cy={r.y} r={11} style={{ fill: KIND[r.kind].c }} />
          <text className="yk-rimw" x={r.lx} y={r.ly} textAnchor={r.anchor} style={{ fill: KIND[r.kind].c }}>{KIND[r.kind].w}</text>
        </g>)}
        <circle className="yk-you" cx={you.x} cy={you.y} r={you.r} />
        <text className="yk-youw" x={you.x} y={you.y + 4.5} textAnchor="middle">You</text>
        {/* Claude's box only while Claude is on (BR1 scope (d), nothing over text): off, no faded box over what is behind */}
        {cb && claude ? <g className="yk-claude on">
          <rect x={cb.x} y={cb.y} width={cb.w} height={cb.h} rx={12} />
          <text className="yk-cw" x={cb.x + cb.w / 2} y={cb.y + 22} textAnchor="middle">Claude</text>
          <text className="yk-cs" x={cb.x + cb.w / 2} y={cb.y + 39} textAnchor="middle">outside this Mac</text>
          <path d={`M${ax} ${ay} L${bx} ${ay}`} className="yk-arrow" markerEnd="url(#yk-ah)" />
          <text className="yk-al" x={(ax + bx) / 2} y={ay - 9} textAnchor="middle">a short summary</text>
          <text className="yk-al" x={(ax + bx) / 2} y={ay + 18} textAnchor="middle">never files</text>
        </g> : null}
      </svg>
      {pic.discs.map((d) => {
        const share = d.share == null ? "" : d.share < 0.01 ? "under 1%" : `${Math.round(d.share * 100)}% of your time`;
        const st = { left: d.words === "beside" ? d.x + d.r + 10 : d.x, top: d.ly } as CSSProperties, cls = `yk-place${d.small ? " small" : ""}${d.words === "beside" ? " beside" : ""}${placeSel === d.id ? " on" : ""}`;
        // still: the read is running, nothing here to press yet and no dial set; the name only (the disc says its share)
        return still ? <span key={d.id} className={`${cls} still`} data-place={d.id} style={st} title={share ? `${d.name}: ${share}` : d.name}><b>{d.name}</b></span>
          : !live ? <span key={d.id} className={`${cls} at-rest`} data-place={d.id} style={st}><b>{d.name}</b>{d.small ? null : <>{share ? <small>{share}</small> : null}<small>{dialShort(d.level)}</small></>}</span>
          : <button key={d.id} className={cls} data-place={d.id} style={st} onClick={() => onPlace(d.id)}
            aria-label={`${d.name}: ${d.share == null ? "" : `${Math.round(d.share * 100)}% of your time, `}AIs here ${dialGlyph(d.level).slice(2)}`}>
            <b>{d.name}</b>{d.small ? null : <>{share ? <small>{share}</small> : null}<small>{dialShort(d.level)}</small></>}
          </button>;
      })}
      {pic.chips.map((c) => !live ? (
        <span key={c.id} className={`yk-chip at-rest${c.more ? " more" : ""}${c.stale ? " stale" : ""}`} data-chip={c.id}
          style={{ left: c.x - c.wd / 2, top: c.y - 11, width: c.wd, "--k": c.more ? "transparent" : KIND[c.kind].c } as unknown as CSSProperties}>
          {c.more ? null : <i aria-hidden="true" />}{c.w}
        </span>
      ) : (
        <button key={c.id} className={`yk-chip${c.more ? " more" : ""}${c.stale ? " stale" : ""}${chipSel === c.id ? " on" : ""}${lit(c.place, c.id) ? "" : " dim"}`} data-chip={c.id}
          style={{ left: c.x - c.wd / 2, top: c.y - 11, width: c.wd, "--k": c.more ? "transparent" : KIND[c.kind].c } as unknown as CSSProperties}
          onClick={() => (c.more ? onPlace(c.place ?? "you") : onChip(c.id))} title={c.full || undefined}>
          {c.more ? null : <i aria-hidden="true" />}{c.w}
        </button>
      ))}
    </div>
  );
}
