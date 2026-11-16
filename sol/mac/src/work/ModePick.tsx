// The mode (#647 round 4, from the kit #674). A ladder of the harness's permission modes, Bypass at the top (it does the
// most without asking) down to Plan (it only plans). Round 3 compared three ways of telling the order; round 4 draws
// one, from the kit: a Card at the pop step holding a List, each mode a Row (its name, what it does in plain words) and
// at its end a Meter of how much it does on its own, so the order reads down the meters without reading a word. The mode
// that is on is the pearl.
// Bypass sticks (Marco 2026-11-06, "the key isn't removing it but making it stick"): the first pick asks "sure?" once;
// confirmed, it is the person's default for every new session (Settings › work's default mode) and never asks again.
// Then the Bypass row says so, "every new session starts here", and the row under the pointer offers the quiet way
// back, "make default". Enter picks, Esc closes, 1-5 pick, a click outside closes.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CFG, enter } from "../motion";
import { useCover } from "../cowork/thingView";
import { Button, Card, List, Meter, type Item } from "../kit";

export type ModeItem = { m: string; label: string; note: string; risky?: string };
// top to bottom: the most it does on its own first
const ORDER = ["bypassPermissions", "auto", "acceptEdits", "default", "plan"];
const W = 340, PAD = 8, IN = W - 2 * PAD;

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
  const n = rungs.length;
  const list: Item[] = rungs.map((it, k) => {
    const risky = !!it.risky, asking = sure === k;
    const note = asking ? `${it.risky}: once you say sure, every new session starts here` : risky && stuck ? "every new session starts here" : it.note;
    const title = asking ? "sure? click again" : <>{it.label}{k === on ? <span style={{ opacity: 0.6 }}> · now</span> : null}{k === dAt && k !== on ? <span style={{ opacity: 0.6 }}> · new sessions</span> : null}</>;
    const back = stuck && k === lit && !risky && !asking;
    return {
      id: it.m, title, note, picked: k === on,
      aside: back
        ? <span className="wback" onClick={(ev) => ev.stopPropagation()}><Button h={24} onClick={() => { onDefault(it.m); onPick(it.m); onClose(); }}>make default</Button></span>
        : <Meter w={40} h={6} value={(n - k) / n} label={`${it.label}: how much it does on its own`} />,
    };
  });
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
