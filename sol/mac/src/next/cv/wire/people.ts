// owned by slices 8+9 (Cowork v2 and Social v2, the people), docs/port/slices.md "Night 2, outlined"
// The engine's messages the people read (live only): Cowork from today's team.v3.front (the groups, as tiles) and
// team.v3.needsme (what waits on me), both PROTOCOL.md "Slice 2"; an ask is answered with team.v3.talk.answer, the old
// face's own message. Social reads nothing: its friends, shares, grants and links are not in the engine (Frank's area),
// so live its moves answer "not yet" and its page draws nothing. Read again when the team's talk moves, never on a timer.
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { change } from "../core.ts";
import type { Engine } from "./types.ts";
import { ROLE, type Group, type Team, type Wait } from "../../people/data.ts";
import { live } from "../../people/queue.ts";
import { ensureWalk } from "../moves/people.ts";

type Tile = { project: string; name: string; count: number; next: { label: string } | null; quiet: boolean; faces: string[] };
type Need = { kind: "ask" | "hand" | "yes"; id: string; project: string; from: string; line: string };
const HUES = [ROLE.lilac, ROLE.peach, ROLE.mint, ROLE.sky, ROLE.blush, ROLE.teal];
const BTNS: Record<string, string[]> = { ask: ["Yes", "Not yet", "Open"], hand: ["Take it", "Not mine"], approve: ["Approve", "Ask for changes"] };

/** today's front and needs as one team setup, the shape the fixture's setups have (pure) */
export function teamOf(tiles: Tile[], needs: Need[]): Team {
  const groups: Group[] = tiles.map((t, i) => ({
    id: t.project, project: t.project, name: t.name, color: HUES[i % HUES.length], quiet: t.quiet ? 1 : undefined,
    people: [{ n: "You", h: "sam", role: "makes", reach: "app", ai: "Claude", st: "rest", me: true },
      ...(t.faces ?? []).map((n, j) => ({ n, h: "g" + (j % 6), role: "makes", reach: "app", ai: null, st: "rest" }))],
    waits: needs.filter((n) => n.project === t.project).map((n, j): Wait => {
      const kind = n.kind === "yes" ? "approve" : n.kind;
      return { id: n.id, from: n.from, h: "g" + (j % 6), kind, text: n.line, sub: "", btns: BTNS[kind] };
    }),
    lines: [], last: t.next?.label ?? "",
  }));
  return { label: "live", groups, live: true };
}

export function attach(e: Engine): void | (() => void) {
  ensureWalk();
  let tiles: Tile[] | null = null, needs: Need[] = [];
  const build = () => { if (tiles) change(() => { live.team = teamOf(tiles!, needs); }); };
  const read = () => { e.send({ type: "team.v3.front" }); e.send({ type: "team.v3.needsme" }); };
  const off = e.subscribe((m: { type?: string; tiles?: Tile[]; needs?: Need[] }) => {
    if (m?.type === "team.v3.front" && Array.isArray(m.tiles)) { tiles = m.tiles; build(); }
    else if (m?.type === "team.v3.needsme" && Array.isArray(m.needs)) { needs = m.needs; build(); }
    else if (m?.type === "work.v3.talk.asked" || m?.type === "work.v3.talk.line" || m?.type === "work.v3.join.in") read();
  });
  /** only an ask is answered from here (the old face's message); a hand or a yes opens its group */
  live.answer = (g, w) => (w.kind === "ask" && !!w.id && !!g.project ? (e.send({ type: "team.v3.talk.answer", project: g.project, ask: w.id }), read(), true) : false);
  read();
  return () => { off(); live.team = null; live.answer = null; };
}
