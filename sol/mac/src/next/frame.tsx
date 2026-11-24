// What just happened, said by the frame (BR1 root part 1, #1615; root.html "frame.say()", design-br1 11-21: the frame
// is the sidebar plus the bottom bar, always there, and it owns what just happened). One line, centred just above the
// bottom bar, in the frame's layer: never a toast over the canvas, never under a piece.
//   frame.say(text, { act })   a moment: it fades after SAY_MS unless it carries an act (Undo, Back), which keeps it
//                              until the next line; { act, no }: a question, `no` the act that declines, drawn first
//   frame.hold(source, line)   a line a part keeps up while its state lasts (the notes' Undo, Arrange's Undo); null
//                              takes it down
// The newest line shows. hooks.flash (cv) is frame.say.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { useEffect, useSyncExternalStore } from "react";

export type Act = { label: string; run: () => void };
export type Line = { text: string; act?: Act; no?: Act };
type Shown = Line & { n: number; source: string | null };

export const SAY_MS = 3200;
let n = 0;
let said: Shown | null = null;
const held = new Map<string, Shown>();
const subs = new Set<() => void>();
let snap: Shown | null = null;
const changed = () => {
  const all = [...held.values(), ...(said ? [said] : [])];
  snap = all.length ? all.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  subs.forEach((f) => f());
};

export const frame = {
  say(text: string, opts: { act?: Act; no?: Act } = {}): void {
    said = { text, act: opts.act, ...(opts.act && opts.no ? { no: opts.no } : {}), n: ++n, source: null };
    changed();
  },
  hold(source: string, line: Line | null): void {
    const was = held.get(source);
    if (!line) { if (was) { held.delete(source); changed(); } return; }
    if (was && was.text === line.text && was.act?.label === line.act?.label) { was.act = line.act; return; }
    held.set(source, { ...line, n: ++n, source });
    changed();
  },
  /** the line showing now (tests, the counts) */
  now: (): Line | null => snap,
  clear(): void { said = null; held.clear(); changed(); },
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};

/** the frame's line; the shell draws it once */
export function FrameLine() {
  const s = useSyncExternalStore(frame.subscribe, () => snap, () => null);
  useEffect(() => {
    if (!s || s.source || s.act) return;
    const t = setTimeout(() => { if (said?.n === s.n) { said = null; changed(); } }, SAY_MS);
    return () => clearTimeout(t);
  }, [s?.n]);
  if (!s) return null;
  return (
    <div className="nx-say" id="toast" role="status" aria-live="polite" data-frame-line={s.source ?? "say"} key={s.n} onClick={(e) => e.stopPropagation()}>
      <span>{s.text}</span>
      {s.act && s.no ? <button type="button" data-frame-no onClick={() => { const a = s.no!; if (s.source) held.delete(s.source); else said = null; changed(); a.run(); }}>{s.no.label}</button> : null}
      {s.act ? <button type="button" data-frame-act onClick={() => { const a = s.act!; if (s.source) held.delete(s.source); else said = null; changed(); a.run(); }}>{s.act.label}</button> : null}
    </div>
  );
}
