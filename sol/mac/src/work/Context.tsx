// The context (#647 round 4, from the kit #674). Marco, 2026-11-06: "I'd prefer it if it was a circle"; "61k of 200k" is
// confusing for someone who is not a developer and a developer does not need it, so the row carries the circle alone:
// the kit's Ring, the jelly's colours pooling from the bottom, the fuller the more of them (his ring pick, b). On hover
// (or focus) a card says, so that anyone can judge whether to compact, never a verdict of Sol's: how full it is in plain
// words, what is filling it as one meter in parts, what compacting would keep and what it would lose, and what happens
// if nobody does anything; then "compact now". The card is the kit's Card at the pop step, so the talk never reads
// through it; each part wears the meter's colour for it, and its name says what it is (never colour alone).
// What fills it comes from work.run's `usage` (the engine's split, overview.ts; #657 for keeping it exact): the
// conversation, Sol's instructions and tools, memory files, skills and agents; files it read sit inside the
// conversation and are not split yet. Without a split, the conversation is the whole count and the rest is marked as
// not known. Every number that is an estimate says "about".
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Card, Meter, Ring, partColour } from "../kit";
import { dim, ink, label, mute, on } from "../kit/paint";
import { SHADE, TYPE } from "../kit/tokens";

type PartKey = "messages" | "mcpTools" | "systemTools" | "systemPrompt" | "skills" | "memory" | "mcpInstructions" | "agents" | "buffer" | "free";
export type Usage = {
  total: number; window: number; parts: Record<PartKey, number | null>;
  compactSoon: boolean; threshold?: number; how: "counted" | "summary" | "estimated"; est: PartKey[]; rest?: number;
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

export function ContextRing({ context, win, usage, turns, busy, onCompact }: { context: number; win: number; usage?: Usage; turns: number; busy?: boolean; onCompact?: () => void }) {
  const total = usage?.total ?? context, w = usage?.window || win || 200_000;
  const f = Math.max(0, Math.min(1, total / w));
  const near = f >= NEAR || !!usage?.compactSoon;
  const btn = useRef<HTMLButtonElement>(null);
  const [card, setCard] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = () => { window.clearTimeout(timer.current); const r = btn.current?.getBoundingClientRect(); if (r) setCard(r); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCard(null), 120); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (<>
    <button ref={btn} type="button" className={`wring${near ? " near" : ""}`} aria-label={`context: ${words(f)}`} aria-expanded={!!card}
      onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onClick={() => (card ? setCard(null) : show())}>
      <Ring value={Math.round(f * 20) / 20} size={24} />
    </button>
    {card && createPortal(<CtxCard r={card} total={total} w={w} usage={usage} turns={turns} near={near} busy={busy} onCompact={onCompact}
      onIn={() => window.clearTimeout(timer.current)} onOut={hide} />, document.body)}
  </>);
}

function CtxCard({ r, total, w, usage, turns, near, busy, onCompact, onIn, onOut }: { r: DOMRect; total: number; w: number; usage?: Usage; turns: number; near: boolean; busy?: boolean; onCompact?: () => void; onIn: () => void; onOut: () => void }) {
  const f = Math.min(1, total / w);
  const guess = !usage || usage.how !== "counted";
  const about = guess ? "about " : "";
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
  const self = total >= at;
  const nothing = self ? "It compacts on its own now, at a moment it picks, which can be in the middle of a task."
    : left === 0 ? "It goes on as it is, and compacts on its own during the next back-and-forth."
    : left !== null ? `It goes on as it is. After ${about}${left} more back-and-forth${left === 1 ? "" : "s"} like these it compacts on its own, at a moment it picks.`
    : "It goes on as it is, and compacts on its own when it nears full, at a moment it picks.";
  const parts = [...groups.map((g) => (g.n ?? 0) / w), rest / w];
  const left0 = Math.max(8, Math.min(r.right - W, innerWidth - 8 - W));
  const lead = words(f)[0].toUpperCase() + words(f).slice(1);
  const read = { fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px` };
  const line = (head: string, body: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "108px 1fr", columnGap: 12 }}><b style={{ fontWeight: 500, color: ink }}>{head}</b><span style={{ color: dim }}>{body}</span></div>
  );
  return (
    <div className={`wctx${near ? " near" : ""}`} role="dialog" aria-label="context" style={{ position: "fixed", zIndex: 60, left: left0, bottom: innerHeight - r.top + 8 }} onPointerEnter={onIn} onPointerLeave={onOut}>
      <Card w={W} step="pop">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, color: ink }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Ring value={f} size={56} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <b className="wctx-lead" style={{ ...read, fontWeight: 600 }}>{lead}</b>
              <span style={{ color: dim }}>{about}{pctOf(total, w)} % of what Claude can hold in mind at once</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Meter w={IN} h={10} parts={parts} label={groups.filter((g) => (g.n ?? 0) > 0).map((g) => `${g.name} ${pctOf(g.n!, w)} %`).join(", ")} />
            <ul className="wclegend" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {groups.map((g, i) => (
                <li key={g.id} className={g.n === null ? "unknown" : ""} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", columnGap: 8, alignItems: "center" }}>
                  <i style={{ justifySelf: "center", width: 8, height: 8, borderRadius: 4, background: g.n === null ? "transparent" : partColour(i), boxShadow: g.n === null ? `inset 0 0 0 1px ${on(SHADE.on.edge)}` : undefined }} />
                  <span style={{ color: g.n === null ? mute : ink }}>{g.name}</span>
                  <em style={{ fontStyle: "normal", color: dim, fontVariantNumeric: "tabular-nums" }}>{g.n === null ? "not known yet" : `${g.est || guess ? "about " : ""}${pctOf(g.n, w)} %`}</em>
                  <span style={{ ...label, gridColumn: "2 / 4", color: mute }}>{g.what}</span>
                </li>
              ))}
              {rest > 0 && <li style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", columnGap: 8, alignItems: "center" }}>
                <i style={{ justifySelf: "center", width: 8, height: 8, borderRadius: 4, background: partColour(GROUPS.length) }} /><span>the rest, not split yet</span><em style={{ fontStyle: "normal", color: dim }}>about {pctOf(rest, w)} %</em>
              </li>}
            </ul>
          </div>
          <div style={{ height: 1, background: on(SHADE.on.line) }} />
          <div className="wcwhat" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {line("Compacting keeps", "a summary of what was said and decided, what it is working on, your instructions and memory files")}
            {line("and loses", "the exact wording of earlier messages, and long outputs and files it read (it can read them again)")}
            {line("If you do nothing", nothing)}
          </div>
          <div className="wcfoot" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ ...label, flex: 1 }}>{guess ? "an estimate until the turn ends and it is counted" : "counted after the last turn"}</span>
            {onCompact && <span className={busy ? "wcompact busy" : "wcompact"} title={busy ? "it is working: compact when the turn ends" : "/compact"} style={busy ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
              <Button h={32} onClick={onCompact}>compact now</Button>
            </span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
