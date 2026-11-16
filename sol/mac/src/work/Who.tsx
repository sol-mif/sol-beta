// Who answers (#647 round 4, from the kit #674). Round 2's buds were the old kit's (goo.tsx's JOBS and budPath); round 3
// compared three directions for how much a provider's mark should carry. Round 4 draws one, from the kit and its job:
// the job is to say who answers and let you pick another, so the words carry it. The row's pill is the kit's Pill, the
// model's name in it; the card is a Card at the pop step holding a List: a head per connected provider (and how it is
// reached, when that adds to the name), its models as rows, each with what it is for; the one answering is the pearl.
// The providers not connected yet are one line under the list, pointing to where they are connected. No marks: on the
// glass the only colour is the person's. Keys: ↑↓ walk, Enter picks, Esc closes; a click outside closes. A pick of
// another provider is the seat switch's move (Composer onSeat / onSeatModel).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Seat, SeatInfo } from "../useEngine";
import { prettyModel } from "../models";
import { CFG, enter } from "../motion";
import { useCover } from "../cowork/thingView";
import { Card, List, Pill, type Item } from "../kit";
import { label } from "../kit/paint";

const KNOWN: { id: string; label: string }[] = [{ id: "gemini", label: "Gemini" }, { id: "hermes", label: "Hermes" }, { id: "ollama", label: "Ollama" }];
const W = 320, PAD = 8, IN = W - 2 * PAD;

// what a model is for, in a person's words, from its family name (the engine says only the id)
const FOR: [RegExp, string][] = [[/fable/i, "the newest, for the hardest work"], [/opus/i, "the most capable"], [/sonnet/i, "fast and able, for most work"], [/haiku/i, "the quickest, for small things"], [/luna|mini/i, "the quickest, for small things"], [/gpt|sol/i, "the most capable"]];
const forOf = (m: string) => FOR.find(([re]) => re.test(m))?.[1] ?? "";

export function WhoPill({ seat, seats, model, onSeat, onModel, onSeatModel }: { seat: Seat; seats: SeatInfo[]; model?: string; onSeat: (s: Seat) => void; onModel: (m: string) => void; onSeatModel?: (s: Seat, m: string) => void }) {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const info = seats.find((s) => s.seat === seat);
  const name = info?.label ?? seat;
  return (<>
    <button ref={btn} type="button" className={`wchip who kit${open ? " lifted" : ""}`} aria-haspopup="menu" aria-expanded={!!open} title={`who answers: ${name}${info?.via ? ` (${info.via})` : ""}; the model`}
      onClick={() => setOpen((o) => (o ? null : btn.current!.getBoundingClientRect()))}>
      <Pill words={[model ? prettyModel(model, seat) : name]} picked={open ? 0 : -1} h={24} start />
    </button>
    {open && createPortal(<WhoCard r={open} seat={seat} seats={seats} model={model} onModel={(m) => { onModel(m); setOpen(null); }} onSeatModel={(s, m) => { if (onSeatModel) onSeatModel(s, m); else onSeat(s); setOpen(null); }} onClose={() => setOpen(null)} chip={btn.current} />, document.body)}
  </>);
}

function WhoCard({ r, seat, seats, model, onModel, onSeatModel, onClose, chip }: { r: DOMRect; seat: Seat; seats: SeatInfo[]; model?: string; onModel: (m: string) => void; onSeatModel: (s: Seat, m: string) => void; onClose: () => void; chip: HTMLElement | null }) {
  useCover(true);
  const box = useRef<HTMLDivElement>(null);
  const connected = seats.filter((s) => (s.models?.length ?? 0) > 0);
  const others = KNOWN.filter((k) => !seats.some((s) => s.seat === k.id));
  const flat = connected.flatMap((s) => (s.models ?? []).map((m) => ({ s, m })));
  const [lit, setLit] = useState(Math.max(0, flat.findIndex((x) => x.s.seat === seat && x.m === model)));
  useLayoutEffect(() => { const el = box.current; if (el) enter(el, { y: 8, cfg: CFG.settle }); }, []);
  useEffect(() => {
    const down = (ev: PointerEvent) => { const t = ev.target as Node; if (!box.current?.contains(t) && !chip?.contains(t)) onClose(); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose, chip]);
  const take = (s: SeatInfo, m: string) => { if (s.seat !== seat) onSeatModel(s.seat, m); else onModel(m); };
  // how it is reached, said only when it adds to the name (Claude via Claude says nothing)
  const via = (s: SeatInfo) => { const v = s.via ? s.via.replace(/ (subscription|account|plan)$/i, "") : ""; return v.toLowerCase() === (s.label ?? s.seat).toLowerCase() ? "" : v; };
  const items: Item[] = connected.flatMap((s) => [
    { head: <>{s.label ?? s.seat}{via(s) && <span style={{ opacity: 0.7 }}> · via {via(s)}</span>}</> },
    ...(s.models ?? []).map((m) => ({ id: `${s.seat}:${m}`, title: prettyModel(m, s.seat), note: forOf(m) || undefined, picked: s.seat === seat && m === model })),
  ]);
  const left = Math.max(8, Math.min(r.left, innerWidth - 8 - W));
  return (
    <div ref={box} className="wpick who kit" aria-label="who answers" style={{ position: "fixed", zIndex: 60, left, bottom: innerHeight - r.top + 8 }}>
      <Card w={W} step="pop">
        <div style={{ padding: PAD }}>
          <List w={IN} items={items} lit={lit} onLit={setLit} onClose={onClose} onPick={(k) => { const x = flat[k]; if (x) take(x.s, x.m); }} />
          {others.length > 0 && <p className="wconnect" style={{ ...label, margin: 0, padding: "8px 12px 4px" }}>{others.map((o) => o.label).join(", ")}: connect in Settings › accounts</p>}
        </div>
      </Card>
    </div>
  );
}
