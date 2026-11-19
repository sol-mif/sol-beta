// How the agent's moves went (#1437), for the tracker (engine track.ts, `work.stage.felt`): counts and plain words only,
// never a title, a part or what the agent said. Each move the face makes or skips is one `made`; what the person's hand
// does to it in the next KEPT_MS is its one `after` (undone, moved, widths, closed, away, large, back, or kept when the
// hand left it alone); every act of the hand is a `hand`, with whether it touched a piece the agent placed, so how often
// the person arranges by hand can be read beside how often the agent does. The measure is sol/stage-measure.
import type { Did } from "./seen";
import type { HandMove } from "./hands";

export type Felt = { ev: "made" | "after" | "hand" | "undo" | "lens" } & Record<string, string | number | boolean>;
export const KEPT_MS = 60_000;

/** the move's main verb, one word (pure) */
export function verbOf(m: HandMove): string {
  return m.beside ? "beside" : m.under ? "under" : m.foot ? "foot" : m.width ? "width" : m.large !== undefined ? "large" : m.chat ? `chat-${m.chat}` : m.go ? "go" : "none";
}

type Watch = { n: number; id: string; at: number; verb: string; t: number };

/** one per space: `made` when a move lands or is skipped, `hand` for every act of the hand, `undo` on ⌥⌘Z */
export function feltWatch(send: (f: Felt) => void, now: () => number = Date.now) {
  let w: Watch | null = null;
  const secs = (at: number) => Math.round((now() - at) / 100) / 10;
  const after = (how: string) => {
    if (!w) return;
    clearTimeout(w.t);
    send({ ev: "after", n: w.n, how, verb: w.verb, secs: secs(w.at) });
    w = null;
  };
  return {
    made(m: HandMove, o: { made: boolean; why?: string; waited?: number; brought?: boolean; kind?: string }) {
      send({ ev: "made", n: m.n, verb: verbOf(m), made: o.made, ...(o.why ? { why: o.why } : {}), ...(o.waited !== undefined ? { waited_ms: Math.round(o.waited) } : {}),
        ...(o.brought ? { brought: true } : {}), ...(o.kind ? { kind: o.kind } : {}), ...(m.go ? { go: true } : {}), ...(m.say ? { say: true } : {}), ...(m.width ? { width: m.width } : {}) });
      if (!o.made) return;
      if (w) after("replaced");   // the agent moved again before the hand did anything
      const at = now();
      w = { n: m.n, id: m.id, at, verb: verbOf(m), t: setTimeout(() => after("kept"), KEPT_MS) as unknown as number };
    },
    hand(d: Did) {
      const on = !!w && (d.id === w.id || d.ev === "widths" || (d.ev.startsWith("chat") && w.id === "talk"));
      send({ ev: "hand", what: d.ev, agent: on, ...(w ? { secs: secs(w.at) } : {}) });
      if (on) after(d.ev);
    },
    undo(by: "agent" | "hand") {
      send({ ev: "undo", by, ...(w ? { secs: secs(w.at) } : {}) });
      if (by === "agent") after("undone");
    },
    lens(o: { page: boolean; found?: boolean }) { send({ ev: "lens", ...o }); },
    dispose() { if (w) clearTimeout(w.t); w = null; },
  };
}
