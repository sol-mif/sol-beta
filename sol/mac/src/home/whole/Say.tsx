// The five reads for a sentence (#792, plan Part C slice 29; home/whole.md "One box", "The judge"; scenes 2 and 3),
// behind sol.home.whole. Face half; the engine half is #827. Home's one box: write anything, what and when. As you
// write, Sol's read stands over the box: each part of the sentence quoted, its read as a pill track of the five with the
// pick in pearl, a 2 px bar of each read's probability under it (the jelly, ui.md "the judge's bars"), the verdict
// ("sure", "a guess · or X?", "asks you on ↵"), and where it will go in plain words; "read in N ms" above. One press on
// another read changes it, ⇥ cycles the last part touched; at ↵ each part changed is one learned line (`home.learn`). ↵ files
// every part (`home.file`): each flies from its row to where it lands on the ribbon, and the receipt says where, with
// its undo (First.tsx's receipt; ⌘Z too). Esc clears. Drawn from the kit (Glass, Field, Pearl); whole-say.css lays it out.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Field, Glass, Pearl } from "../../kit";
import { deep, dim, ink, jellyBands, mute, textW } from "../../kit/paint";
import { CURVE, JELLY, SHADE, TYPE } from "../../kit/tokens";
import { file, learn, useToday } from "./store";
import { READS, READ_WORDS, cycle, readOf, verdictWords, whereOf, type Filed, type Part, type Read, type ReadMsg } from "./reads";
import { isFlow } from "./flows";   // C39
import { sayFlow } from "./flowsStore";   // C39
import { FlowRead, NewFlow } from "./NewFlow";   // C39
import "../whole-say.css";

const PILL_H = 32, INSET = PILL_H / 8, PAD = PILL_H / 2;   // as the kit's Pill draws its track (kit/Pill.tsx)
const SUN = JELLY.warm[3];
const BAR_H = 2;   // the judge's bar, 2 px (home/whole.md "The judge"); no step of the scale is that thin but the hairline
// each word as wide as itself (scene 2's track), unlike the kit's Pill, whose words share one width: the same glass
// track and pearl thumb, from the kit
const SEGS = READS.map((r) => textW(READ_WORDS[r], TYPE.body[0], 500) + 2 * PAD - 2 * INSET);
const LEFTS = SEGS.map((_, i) => INSET + SEGS.slice(0, i).reduce((a, b) => a + b, 0));
const TRACK_W = SEGS.reduce((a, b) => a + b, 0) + 2 * INSET;

/** the track of the five: the pick in pearl, a press on another picks it, a 2 px bar of each one's probability under it */
function Track({ part, picked, onPick }: { part: Part; picked: Read; onPick: (r: Read) => void }) {
  const k = READS.indexOf(picked), th = PILL_H - 2 * INSET;
  return (
    <div className="hs-pill" role="radiogroup" aria-label={`the read of “${part.text}”`} style={{ width: TRACK_W }}>
      <Glass w={TRACK_W} h={PILL_H} r={PILL_H / 2} step="card">
        <Pearl w={SEGS[k]} h={th} r={th / 2} style={{ position: "absolute", left: LEFTS[k], top: INSET }} />
        {READS.map((r, i) => (
          <button key={r} type="button" role="radio" aria-checked={r === picked} className="hs-word" data-word={r} onClick={() => onPick(r)}
            style={{ left: LEFTS[i], width: SEGS[i], height: PILL_H, fontSize: TYPE.body[0], lineHeight: `${TYPE.body[1]}px`,
              ...(r === picked ? { color: deep(), fontWeight: 500 } : { color: dim, fontWeight: 400 }) }}>{READ_WORDS[r]}</button>
        ))}
      </Glass>
      {READS.map((r, i) => (
        <div key={r} className="hs-bar" aria-hidden data-bar={r} data-p={part.p[r]} style={{ left: LEFTS[i] + PAD - INSET, height: BAR_H, width: Math.max(1, (SEGS[i] - 2 * (PAD - INSET)) * part.p[r]),
          backgroundImage: jellyBands(JELLY.six), opacity: r === picked ? 1 : 0.45 }} />
      ))}
    </div>
  );
}

/** a part's row: the quote, the track with its bars and the verdict, then where it goes */
function PartRow({ part, picked, now, week, onPick }: { part: Part; picked: Read; now: number; week: Parameters<typeof whereOf>[2]; onPick: (r: Read) => void }) {
  const changed = picked !== part.read;
  return (
    <div className="hs-part" data-part={part.text} data-read={picked}>
      <div className="hs-quote" style={{ color: ink, fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px` }}>“{part.text}”</div>
      <div className="hs-right">
        <div className="hs-track">
          <Track part={part} picked={picked} onPick={onPick} />
          <span className="hs-verdict" data-verdict={changed ? "yours" : undefined} style={{ color: mute }}>{verdictWords(part, picked)}</span>
        </div>
        <div className="hs-where" style={{ color: dim }}>
          {whereOf(part, picked, week, now)}{changed && <> · <s style={{ color: mute }}>{READ_WORDS[part.read]}</s></>}
        </div>
      </div>
    </div>
  );
}

/** a filed part flies from its row to its place on the ribbon (the jelly travels → body: pour, ui.md "Motion") */
function fly(from: DOMRect, label: string, to: Element) {
  const css = getComputedStyle(document.documentElement), ms = parseFloat(css.getPropertyValue("--d-pour")) || 0, ease = css.getPropertyValue("--e-pour").trim();
  if (!ms || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t = to.getBoundingClientRect(), g = document.createElement("div");
  g.className = "hs-flier"; g.textContent = label; g.style.left = `${from.left}px`; g.style.top = `${from.top}px`; g.style.color = SUN;
  document.body.appendChild(g);
  const dx = t.left + t.width / 2 - from.left, dy = t.top + t.height / 2 - from.top;
  g.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.4)`, opacity: 0 }], { duration: ms, easing: ease || undefined, fill: "forwards" })
    .finished.finally(() => g.remove());
}

export function Say({ now }: { now: number }) {
  const v = useToday();
  const week = v.today?.week ?? [];
  const folders = useMemo(() => [...new Set([...v.things.values()].map((t) => t.folder))], [v.things]);
  const [text, setText] = useState("");
  const [read, setRead] = useState<ReadMsg | null>(null);
  const [picks, setPicks] = useState<Map<string, Read>>(new Map());   // the person's reads, by part
  const [last, setLast] = useState<string | null>(null);               // the part ⇥ cycles
  const [focus, setFocus] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // the read, as you write (the stub answers at once; the engine's `home.read` carries its own ms)
  useEffect(() => {
    if (!text.trim()) { setRead(null); return; }
    const t0 = performance.now(), r = readOf(text, week, Date.now(), folders);
    setRead({ ...r, ms: Math.max(r.ms, Math.round(performance.now() - t0)) });
  }, [text, week, folders]);
  const parts = read?.parts ?? [];
  const pickOf = (p: Part) => picks.get(p.text) ?? p.read;
  const choose = (p: Part, r: Read) => {
    const was = pickOf(p);
    if (r === was) return;
    setPicks((m) => new Map(m).set(p.text, r)); setLast(p.text);
  };
  // the flight: the rows' places are kept at ↵, and once the list has the new things each one leaves for its mark
  const pending = useRef<{ rects: { rect: DOMRect; label: string }[]; ids: string[] } | null>(null);
  const send = () => {
    if (isFlow(text)) { sayFlow(text); setText(""); setPicks(new Map()); setLast(null); return; }   // C39 (#802): "every time …" makes a flow, not a filing
    if (!parts.length) return;
    const filed: Filed[] = parts.map((p) => ({ text: p.text, read: pickOf(p), folder: p.folder, at: p.at, after: p.after, found: p.found, ...(pickOf(p) !== p.read ? { was: p.read } : {}) }));
    const rects = [...(panel.current?.querySelectorAll(".hs-quote") ?? [])].map((el, i) => ({ rect: el.getBoundingClientRect(), label: parts[i]?.text ?? "" }));
    pending.current = { rects, ids: [] };
    // the overrides, a learned line each (#867 F3): one per part, from Sol's read to the one filed, only when filed
    for (const f of filed) if (f.was) learn({ text: f.text, from: f.was, to: f.read });
    file(filed);
    setText(""); setPicks(new Map()); setLast(null);
  };
  const done = v.done;
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || done?.did !== "file") return;
    pending.current = null;
    (done.thingIds ?? []).forEach((id, i) => {
      const to = document.querySelector(`[data-ribbon] [data-thing="${id}"], [data-ribbon] [data-thread="${id}"]`);
      const from = p.rects[i] ?? p.rects[0];
      if (to && from) fly(from.rect, from.label, to);
    });
  }, [done]);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === "Tab" && parts.length) {
      e.preventDefault();
      const p = parts.find((x) => x.text === last) ?? parts[parts.length - 1];
      choose(p, cycle(pickOf(p)));
      return;
    }
    if (e.key === "Escape") { setText(""); setPicks(new Map()); }
  };
  return (
    <div className="hs" data-say>
      <NewFlow />{/* C39 (#802): a new flow, drawn as stations, over the box */}
      {isFlow(text) ? <FlowRead sentence={text} /> /* C39: one flow, never split */ : parts.length > 0 && (
        <div className="hs-panel" ref={panel} data-read-panel data-parts={parts.length}
          style={{ backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)`, borderRadius: CURVE.radius.card }}>{/* the kit's Card at pop: the blur on its own box */}
          <Glass r={CURVE.radius.card} step="pop" />
          <div className="hs-head" style={{ color: mute }}>
            <span>Sol’s read · {parts.length === 1 ? "one thing" : `${parts.length} things`} · <span style={{ color: dim }}>press another read to change it, ⇥ cycles</span></span>
            <span className="hs-ms" data-ms={read!.ms}>read in {read!.ms} ms</span>
          </div>
          {parts.map((p) => <PartRow key={p.text} part={p} picked={pickOf(p)} now={now} week={week} onPick={(r) => choose(p, r)} />)}
        </div>
      )}
      <div className="hs-box" data-box>
        <Field focus={focus} />
        <input className="hs-input" value={text} placeholder="write anything: what, and when" aria-label="write anything: what, and when" style={{ color: ink }}
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
        <span className="hs-hint" style={{ color: mute }}>↵ files it · ⇥ changes the read</span>
        <button type="button" className="hs-send" aria-label="file it" style={{ color: text.trim() ? ink : mute }} onClick={send}>↑</button>
      </div>
    </div>
  );
}
