// The mode (#647 round 4, from the kit #674). A ladder of the harness's permission modes, Bypass at the top (it does the
// most without asking) down to Plan (it only plans). Round 3 compared three ways of telling the order; round 4 draws
// one, from the kit: a Card at the pop step holding a List, each mode a Row (its name, what it does in plain words). The
// meters went (Marco 2026-11-07: "no value add"); round 5's pins took the rest of the right column ("useless space for no
// reason") and the Bypass heat chip ("useless"): the card is as wide as its words, and the risk reads in the row itself,
// Bypass lit in the jelly's heat when it is the pick, as its pill is in the row. Any other mode that is on is the pearl.
// Bypass sticks (Marco 2026-11-06, "the key isn't removing it but making it stick"): the first pick asks "sure?" once;
// confirmed, it is the person's default for every new session (Settings › work's default mode) and never asks again.
// Then the Bypass row says so, "every new session starts here", and the row under the pointer offers the quiet way
// back, "make default". Enter picks, Esc closes, 1-5 pick, a click outside closes.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CFG, enter } from "../motion";
import { useCover } from "../cowork/thingView";
import { Button, Card, List, type Item } from "../kit";
import { textW } from "../kit/paint";
import { heatWord } from "../kit/Pill";
import { TYPE } from "../kit/tokens";

export type ModeItem = { m: string; label: string; note: string; risky?: string };
// top to bottom: the most it does on its own first
const ORDER = ["bypassPermissions", "auto", "acceptEdits", "default", "plan"];
const PAD = 8, ROW = 12, GAP = 10, BTN = 24;   // the card's padding; the kit Row's own padding and gap; the button's height
const SURE = "everything runs unasked, in every new session", STUCK = "every new session starts here";

/** the bypass pick is confirmed once per person (this window's storage, and the default it set) */
export const BYPASS_SURE = "sol.work.bypass.sure";
export const bypassSure = (def?: string) => def === "bypassPermissions" || (() => { try { return localStorage.getItem(BYPASS_SURE) === "1"; } catch { return false; } })();

export function ModePick({ r, items, mode, def, onPick, onSure, onDefault, onClose, chip }: {
  r: DOMRect; items: ModeItem[]; mode: string; def?: string;
  onPick: (m: string) => void;
  onSure: () => void;              // bypass confirmed the first time: it becomes the default for every new session
  onDefault: (m: string) => void;  // the quiet way back: new sessions start in this mode
  onClose: () => void; chip: HTMLElement | null;
}) {
  useCover(true);
  const box = useRef<HTMLDivElement>(null);
  const rungs = [...items].sort((a, b) => ORDER.indexOf(a.m) - ORDER.indexOf(b.m));
  const on = Math.max(0, rungs.findIndex((x) => x.m === mode));
  const dAt = rungs.findIndex((x) => x.m === def);
  const [lit, setLit] = useState(on);
  const [sure, setSure] = useState<number | null>(null);
  useLayoutEffect(() => { const el = box.current; if (el) enter(el, { y: 8, cfg: CFG.settle }); }, []);
  useEffect(() => {
    const down = (ev: PointerEvent) => { const t = ev.target as Node; if (!box.current?.contains(t) && !chip?.contains(t)) onClose(); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose, chip]);
  const choose = (k: number) => {
    const it = rungs[k];
    if (it.risky && !bypassSure(def)) {
      if (sure !== k) { setSure(k); setLit(k); return; }
      onSure(); onClose(); return;
    }
    onPick(it.m); onClose();
  };
  const stuck = def === "bypassPermissions";
  const list: Item[] = rungs.map((it, k) => {
    const risky = !!it.risky, asking = sure === k;
    const note = asking ? SURE : risky && stuck ? STUCK : it.note;
    const hot = risky && k === on;   // Bypass is the pick: its name wears the heat, never the pearl
    const name = hot ? <span className="kheat" style={heatWord()}>{it.label}</span> : it.label;
    const title = asking ? "sure? click again" : <>{name}{k === on ? <span style={{ opacity: 0.6 }}> · now</span> : null}{k === dAt && k !== on ? <span style={{ opacity: 0.6 }}> · new sessions</span> : null}</>;
    const back = stuck && k === lit && !risky && !asking;
    return {
      id: it.m, title, note, picked: k === on && !hot,
      aside: back
        ? <span className="wback" onClick={(ev) => ev.stopPropagation()}><Button h={BTN} flat acts onClick={() => { onDefault(it.m); onPick(it.m); onClose(); }}>make default</Button></span>
        : null,   // no column of its own: the way back stands in the row under the pointer, only once Bypass sticks
    };
  });
  // as wide as its words: the widest name (with its "· now" or "· new sessions") or note any row can show, and the way
  // back's button beside it once Bypass sticks; measured once, so the card never jumps as the pointer walks it
  const back = stuck ? GAP + textW("make default", TYPE.pill[0], 500) + BTN : 0;
  const words = Math.max(...rungs.map((it) => Math.max(
    textW(`${it.label} · new sessions`, TYPE.body[0], 500), textW(it.note, TYPE.label[0]),
    ...(it.risky ? [textW("sure? click again", TYPE.body[0], 500), textW(SURE, TYPE.label[0]), textW(STUCK, TYPE.label[0])] : []),
  ) + (it.risky ? 0 : back)));
  const IN = Math.ceil(words) + 2 * ROW, W = IN + 2 * PAD;
  const left = Math.max(8, Math.min(r.left, innerWidth - 8 - W));
  return createPortal(
    <div ref={box} className="wpick mode kit" aria-label="mode" style={{ position: "fixed", zIndex: 60, left, bottom: innerHeight - r.top + 8 }}
      onPointerLeave={() => { if (sure === null) setLit(on); }}>
      <Card w={W} step="pop">
        <div style={{ padding: PAD }}>
          <List w={IN} items={list} lit={lit} numbers onClose={onClose} onPick={choose}
            onLit={(k) => { if (sure === null || sure === k) setLit(k); else { setSure(null); setLit(k); } }} />
        </div>
      </Card>
    </div>, document.body);
}
