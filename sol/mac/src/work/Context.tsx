// The context (#647 round 4, from the kit #674). Marco, 2026-11-06: "I'd prefer it if it was a circle"; "61k of 200k" is
// confusing for someone who is not a developer and a developer does not need it, so the row carries the circle alone:
// the kit's Ring, the jelly's colours pooling from the bottom, the fuller the more of them (his ring pick, b). On hover
// (or focus) a card says, so that anyone can judge whether to compact, never a verdict of Sol's. Round 5 (Marco
// 2026-11-07) made it a glance and a little fun: the heading is the number, large, and one word beside it; what fills it
// is one meter in parts with a legend, each row opening a small card with a personal reading of that part
// (contextReading.ts; with work.liveContext on, the engine's breakdown of that part under it, #683, #1519); the ? opens
// what compacting keeps and loses; then "compact now". The sentence about what happens anyway went ("bloat"), and so did
// "counted after the last turn": with work.liveContext on the total is the API's own at every step (`live`), so the
// number wears no "~"; off, it is counted after each turn and wears "~" between counts. Near full, one stat: the turns left before it compacts itself. The card is the kit's Card at the pop step, so the talk never reads
// through it; each part wears the meter's colour for it, and its name says what it is (never colour alone).
// What fills it comes from work.run's `usage` (the engine's split, overview.ts; #657 for keeping it exact): the
// conversation, Sol's instructions and tools, memory files, skills and agents; files it read sit inside the
// conversation and are not split yet. Without a split, the conversation is the whole count and the rest is marked as
// not known. Every number that is an estimate says "about".
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Card, Meter, Ring, partColour } from "../kit";
import { dim, ink, label, mute, on, textW } from "../kit/paint";
import { CURVE, SHADE, TYPE } from "../kit/tokens";
import { readingOf, shares, type PartId, type PartReading, type Seen } from "./contextReading";

type PartKey = "messages" | "mcpTools" | "systemTools" | "systemPrompt" | "skills" | "memory" | "mcpInstructions" | "agents" | "buffer" | "free";
export type Usage = {
  total: number; window: number; parts: Record<PartKey, number | null>;
  compactSoon: boolean; threshold?: number; how: "counted" | "summary" | "estimated"; est: PartKey[]; rest?: number;
  live?: boolean;   // work.liveContext (#1519): the total is exact at every step; only parts in `est` are estimates
};
// the person's groups, in plain words, in the meter's order
const GROUPS: { id: string; name: string; what: string; keys: PartKey[] }[] = [
  { id: "talk", name: "your conversation", what: "what you and Claude said, and the files and outputs it read", keys: ["messages"] },
  { id: "sys", name: "Sol's instructions and tools", what: "how Claude is told to work here, and what it can use", keys: ["systemPrompt", "systemTools", "mcpTools", "mcpInstructions"] },
  { id: "mem", name: "memory files", what: "the notes it reads at the start of every session", keys: ["memory"] },
  { id: "kit", name: "skills and agents", what: "the skills and helpers it can call on", keys: ["skills", "agents"] },
];
const NEAR = 0.85;
const W = 352, IN = W - 2 * 20;
const pctOf = (n: number, w: number) => Math.round((n / (w || 1)) * 100);
const words = (f: number) => (f < 0.15 ? "almost empty" : f < 0.35 ? "about a quarter full" : f < 0.45 ? "about a third full" : f < 0.6 ? "about half full" : f < 0.75 ? "more than half full" : f < NEAR ? "getting full" : "nearly full");

export function ContextRing({ context, win, usage, turns, busy, compacting, kit, onPart, onCompact }: { context: number; win: number; usage?: Usage; turns: number; busy?: boolean; compacting?: boolean; kit?: { skills: number; commands: number }; onPart?: (p: PartId) => Promise<PartReading | null>; onCompact?: () => void }) {
  const total = usage?.total ?? context, w = usage?.window || win || 200_000;
  const full = Math.max(0, Math.min(1, total / w));
  // compacting (Marco 2026-11-07: "what happens when I push it?"): the goo drains over a second and holds low until
  // the new count lands (the engine's compact line stands in the talk meanwhile); then it is the count again
  const [drain, setDrain] = useState<number | null>(null);
  useEffect(() => {
    if (!compacting) { setDrain(null); return; }
    let raf = 0; const t0 = performance.now(), from = full;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); setDrain(from + (0.08 - from) * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compacting]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = drain ?? full;
  const near = f >= NEAR || !!usage?.compactSoon;
  const btn = useRef<HTMLButtonElement>(null);
  const [card, setCard] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = () => { window.clearTimeout(timer.current); const r = btn.current?.getBoundingClientRect(); if (r) setCard(r); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCard(null), 120); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (<>
    <button ref={btn} type="button" className={`wring${near ? " near" : ""}${compacting ? " compacting" : ""}`} aria-label={compacting ? "context: compacting" : `context: ${words(f)}`} title={compacting ? "compacting: the talk so far is being summarised" : undefined} aria-expanded={!!card}
      onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onClick={() => (card ? setCard(null) : show())}>
      <Ring value={Math.round(f * 20) / 20} size={24} flat />
    </button>
    {card && !compacting && createPortal(<CtxCard r={card} total={total} w={w} usage={usage} turns={turns} near={near} busy={busy} kit={kit} onPart={onPart} onCompact={onCompact && (() => { setCard(null); onCompact(); })}
      onIn={() => window.clearTimeout(timer.current)} onOut={hide} />, document.body)}
  </>);
}

// the heading's one word beside the number (Marco 2026-11-07, round 5: the sentence heading was "inefficient ... not fun")
const word = (f: number) => (f < 0.15 ? "fresh" : f < 0.45 ? "roomy" : f < 0.6 ? "half" : f < NEAR ? "filling" : "full");
const RPAD = 12;   // the reading's small card's padding; it is as wide as its words
const RNAME = 200;   // a breakdown row's name at its widest; longer ones end in "…"

function CtxCard({ r, total, w, usage, turns, near, busy, kit, onPart, onCompact, onIn, onOut }: { r: DOMRect; total: number; w: number; usage?: Usage; turns: number; near: boolean; busy?: boolean; kit?: { skills: number; commands: number }; onPart?: (p: PartId) => Promise<PartReading | null>; onCompact?: () => void; onIn: () => void; onOut: () => void }) {
  const f = Math.min(1, total / w);
  // an estimate wears "~": the total does not once it is live (#1519, the API's own at every step), nor once counted
  const guess = !usage || (usage.how !== "counted" && !usage.live);
  const about = guess ? "~" : "";
  // the groups' tokens: from the split when there is one; else the conversation is the whole count, the rest unknown
  const groups = GROUPS.map((g) => {
    if (!usage) return { ...g, n: g.id === "talk" ? total : null, est: true };
    const vals = g.keys.map((k) => usage.parts[k]);
    const known = vals.filter((v): v is number => v !== null);
    return { ...g, n: known.length ? known.reduce((a, b) => a + b, 0) : null, est: g.keys.some((k) => usage.est.includes(k)) };
  });
  const rest = usage?.rest ?? 0;   // in the window, not split
  const reserve = usage?.parts.buffer ?? null;   // kept free for compacting
  const at = usage?.threshold ?? (reserve ? w - reserve : Math.round(w * 0.92));   // where it compacts on its own
  const perTurn = turns > 0 ? Math.max(1, (groups[0].n ?? total) / turns) : 0;
  const left = perTurn ? Math.max(0, Math.floor((at - total) / perTurn)) : null;
  // near full, the one stat that matters: how many more back-and-forths before it compacts itself (always an estimate)
  const stat = !near ? null : total >= at ? "compacting itself" : left === null ? null : left === 0 ? "compacts itself next turn" : `~${left} turn${left === 1 ? "" : "s"} left`;
  const parts = [...groups.map((g) => (g.n ?? 0) / w), rest / w];
  const left0 = Math.max(8, Math.min(r.right - W, innerWidth - 8 - W));
  const [help, setHelp] = useState(false);   // the ? opens what compacting keeps and loses (Marco 2026-11-07: never there all the time)
  // a legend row under the pointer: its reading, a small card beside this one (contextReading.ts, a stub until #683)
  const [hov, setHov] = useState<{ id: PartId; i: number; y: number } | null>(null);
  const seen = (tokens: number | null, est: boolean): Seen => ({ tokens, window: w, turns, skills: kit?.skills ?? 0, commands: kit?.commands ?? 0, guess: guess || est });
  // the engine's breakdown of the hovered part (#1519), asked when the row is first hovered and again when it is older
  // than 10 s; the engine counts it off the turn's path. Until it answers (or with the switch off) the head stands alone
  const [parts2, setParts2] = useState<Partial<Record<PartId, PartReading & { asked: number }>>>({});
  useEffect(() => {
    const id = hov?.id;
    if (!id || id === "rest" || !onPart) return;
    const had = parts2[id];
    if (had && Date.now() - had.asked < 10_000) return;
    let live = true;
    void onPart(id).then((x) => { if (live && x) setParts2((p) => ({ ...p, [id]: { ...x, asked: Date.now() } })); });
    return () => { live = false; };
  }, [hov?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const detail = hov && hov.id !== "rest" ? parts2[hov.id] : undefined;
  const rows = detail ? shares(detail) : [];
  const reading = hov && (hov.id === "rest" ? readingOf("rest", seen(rest, true)) : (() => { const g = groups[hov.i]; return readingOf(g.id as PartId, seen(g.n, g.est)); })());
  const lw = (t: string) => textW(t, TYPE.label[0]) + t.length * TYPE.label[0] * 0.01;   // the label's .01em tracking
  const RW = reading ? Math.ceil(Math.max(textW(reading.n, TYPE.read[0], 600), lw(reading.words), ...rows.map((x) => Math.min(RNAME, lw(x.name)) + 12 + lw("100%")))) + 2 * RPAD : 0;
  const beside = left0 + W + 8 + RW <= innerWidth - 8 ? W + 8 : -(RW + 8);   // to the right when there is room, else the left
  const read = { fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px` };
  const line = (head: string, body: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "108px 1fr", columnGap: 12 }}><b style={{ fontWeight: 500, color: ink }}>{head}</b><span style={{ color: dim }}>{body}</span></div>
  );
  const row = (id: PartId, i: number, el: ReactNode) => (
    <li key={id} data-part={id} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", columnGap: 8, alignItems: "center", margin: "0 -8px", padding: "4px 8px", borderRadius: CURVE.radius.chip, background: hov?.id === id ? on(SHADE.on.hover) : undefined }}
      onPointerEnter={(ev) => { const box = (ev.currentTarget.closest(".wctx") as HTMLElement).getBoundingClientRect(); setHov({ id, i, y: ev.currentTarget.getBoundingClientRect().top - box.top }); }}
      onPointerLeave={() => setHov((x) => (x?.id === id ? null : x))}>{el}</li>
  );
  return (
    <div className={`wctx${near ? " near" : ""}`} role="dialog" aria-label="context" style={{ position: "fixed", zIndex: 60, left: left0, bottom: innerHeight - r.top + 8 }} onPointerEnter={onIn} onPointerLeave={onOut}>
      <Card w={W} step="pop">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, color: ink }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Ring value={f} size={56} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div className="wctx-lead" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px`, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{about}{pctOf(total, w)}%</b>
                <span style={{ ...read, color: dim }}>{word(f)}</span>
              </div>
              {stat && <span className="wctx-stat" style={{ ...label, color: dim }}>{stat}</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Meter w={IN} h={10} parts={parts} label={groups.filter((g) => (g.n ?? 0) > 0).map((g) => `${g.name} ${pctOf(g.n!, w)} %`).join(", ")} />
            <ul className="wclegend" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              {groups.map((g, i) => row(g.id as PartId, i, <>
                <i style={{ justifySelf: "center", width: 8, height: 8, borderRadius: 4, background: g.n === null ? "transparent" : partColour(i), boxShadow: g.n === null ? `inset 0 0 0 1px ${on(SHADE.on.edge)}` : undefined }} />
                <span style={{ color: g.n === null ? mute : ink }}>{g.name}</span>
                <em style={{ fontStyle: "normal", color: dim, fontVariantNumeric: "tabular-nums" }}>{g.n === null ? "?" : `${g.est || guess ? "~" : ""}${pctOf(g.n, w)}%`}</em>
              </>))}
              {rest > 0 && row("rest", GROUPS.length, <>
                <i style={{ justifySelf: "center", width: 8, height: 8, borderRadius: 4, background: partColour(GROUPS.length) }} /><span>the rest, not split yet</span><em style={{ fontStyle: "normal", color: dim }}>~{pctOf(rest, w)}%</em>
              </>)}
            </ul>
          </div>
          {help && <div style={{ height: 1, background: on(SHADE.on.line) }} />}
          {help && (
            <div className="wcwhat" style={{ display: "flex", flexDirection: "column", gap: 8, ...label }}>
              {line("Compacting keeps", "a summary of what was said and decided, what it is working on, your instructions and memory files")}
              {line("and loses", "the exact wording of earlier messages, and long outputs and files it read (it can read them again)")}
            </div>
          )}
          <div className="wcfoot" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 -12px" }}>{/* each word on the card's text edge: a pill's padding is half its height */}
            <Button h={24} flat up={help} label={help ? "hide what compacting does" : "what compacting does"} onClick={() => setHelp((v) => !v)}>?</Button>
            {onCompact && <span className={busy ? "wcompact busy" : "wcompact"} title={busy ? "it is working: compact when the turn ends" : "/compact"} style={busy ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
              <Button h={24} flat acts onClick={onCompact}>compact now</Button>
            </span>}
          </div>
        </div>
      </Card>
      {reading && hov && (
        <div className="wcread" aria-live="polite" style={{ position: "absolute", left: beside, top: hov.y - RPAD, width: RW, pointerEvents: "none" }}>
          <Card w={RW} step="pop">
            <div style={{ padding: RPAD, display: "flex", flexDirection: "column", gap: 2 }}>
              <b style={{ ...read, fontWeight: 600, color: ink, fontVariantNumeric: "tabular-nums" }}>{reading.n}</b>
              <span style={{ ...label, color: dim, whiteSpace: "nowrap" }}>{reading.words}</span>
              {rows.length > 0 && (
                <ul className="wcread-rows" aria-label="what fills it, as its share of this part" style={{ listStyle: "none", margin: "8px 0 0", padding: "8px 0 0", borderTop: `1px solid ${on(SHADE.on.line)}`, display: "flex", flexDirection: "column", gap: 2, ...label }}>
                  {rows.map((x) => (
                    <li key={x.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 12 }}>
                      <span title={x.name} style={{ color: ink, maxWidth: RNAME, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                      <em style={{ fontStyle: "normal", color: dim, fontVariantNumeric: "tabular-nums" }}>{x.pct}</em>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
