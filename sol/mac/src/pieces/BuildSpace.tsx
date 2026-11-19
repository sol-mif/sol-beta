// Build as one space (mine, 2026-11-12, behind build.space): the real session's chat, its box and its stage's artifacts as
// pieces of one space (Space.tsx), in place of the talk docked beside the stage (StageColumn.tsx, not mounted while this
// is on). The stage store stays the one truth of what is open: an artifact folded (by the session's `place` with fold,
// or by the hand putting it away) is named at the bottom edge; one closed leaves; one placed in the slot "full" is
// taken large. What leads is read here (lead.ts) until the engine names it. What the hand holds is kept per session
// for the window's life.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Item } from "../work/useWork";
import type { StageStore } from "../stage/store";
import { SIZES, ownHere, type Block, type Place } from "../stage/model";
import { isRunBody } from "../stage/kinds/runs";
import { StageHere } from "../stage/kinds/here";
import { HAND0, Space, type Hand } from "./Space";
import { asksOf, leadOf, saidOf, touched, type Touch } from "./lead";
import type { SeenOff, SeenReport } from "./seen";
import type { HandMove } from "./hands";

/** what the space keeps of a session for the window's life: what the hand holds, the artifact last made or changed, the
 *  blocks as last seen (to tell what changed), the full placements already taken large */
type Mem = { hand: Hand; touch: Touch | null; seen: Map<string, unknown> | null; fulls: Set<string> | null; big: string | null };
const mem = new Map<string, Mem>();
const memOf = (session: string): Mem => {
  let m = mem.get(session);
  if (!m) { m = { hand: HAND0, touch: null, seen: null, fulls: null, big: null }; mem.set(session, m); }
  return m;
};
const NO_BLOCKS: Readonly<Record<string, Block>> = {};
const BY = "you";
type Placed = Place & { slot?: string };

/** a session's space; `session` "" is a new session not sent yet: the box alone. Keyed by the session where it is mounted */
export function BuildSpace({ store, session, items, busy, talk, box, greet }: {
  store: StageStore; session: string; items: Item[]; busy: boolean;
  /** the chat drawn for what is said (Home's talkOf: the same function until the run or the sessions change) */
  talk: (items: Item[]) => ReactNode;
  box: ReactNode;
  /** over the box before anything is said (Home's welcome) */
  greet?: ReactNode;
}) {
  const m = memOf(session);
  const [hand, setHandS] = useState<Hand>(m.hand);
  const setHand = useCallback((f: (h: Hand) => Hand) => setHandS((v) => { const n = f(v); m.hand = n; return n; }), [m]);
  const seen = useSyncExternalStore(useCallback((f: () => void) => (session ? store.subscribe(session, f) : () => {}), [store, session]), () => (session ? store.read(session) : null));

  const live = useMemo(() => (seen?.blocks ?? []).filter((b) => b.state !== "dead"), [seen?.blocks]);
  const placeOf = (id: string) => seen?.stage.blocks.find((p) => p.id === id) as Placed | undefined;
  const z = (id: string) => placeOf(id)?.z ?? Infinity;   // not placed yet: just made, the newest
  const open = live.filter((b) => { const p = placeOf(b.id); return !p || (!p.folded && !p.popped); }).sort((a, b) => z(b.id) - z(a.id)).map((b) => b.id);
  // put away: this session's own folded artifacts (the project's runs and what was carried in stay with the old stage's foot)
  const away = live.filter((b) => { const p = placeOf(b.id); return p && (p.folded || p.popped) && !isRunBody(b.body) && ownHere(b, session); }).sort((a, b) => z(b.id) - z(a.id)).map((b) => b.id);
  const blocks = useMemo(() => (live.length ? Object.fromEntries(live.map((b) => [b.id, b])) : NO_BLOCKS), [live]);

  // what changed since the last read: once the engine has answered, a block new or different is the one just made
  if (seen && seen.ready !== false) {
    const t = touched(m.seen, live);
    if (t.length) m.touch = { id: t[t.length - 1], at: items.length };
    m.seen = new Map(live.map((b) => [b.id, b]));
    // a block the session placed in the slot "full" since is taken large (once per placing)
    const fulls = (seen.stage.blocks as Placed[]).filter((p) => p.slot === "full" && !p.folded && !p.popped && blocks[p.id]);
    const keys = new Set(fulls.map((p) => `${p.id}:${p.z}`));
    const fresh = m.fulls ? fulls.filter((p) => !m.fulls!.has(`${p.id}:${p.z}`)).sort((a, b) => b.z - a.z)[0] : undefined;
    m.fulls = keys;
    if (fresh) m.big = fresh.id;
  }
  useEffect(() => { const id = m.big; if (!id) return; m.big = null; setHand((v) => ({ ...v, large: id })); });
  const lead = leadOf({ open, state: Object.fromEntries(live.map((b) => [b.id, b.state])), touch: m.touch, items });

  const spoken = useMemo(() => (items.length ? talk(items) : null), [talk, items]);
  const said = useMemo(() => saidOf(items, busy), [items, busy]), asks = useMemo(() => asksOf(items, busy), [items, busy]);
  const stage = () => store.read(session).stage;
  const top = () => Math.max(0, ...stage().blocks.map((p) => p.z ?? 0)) + 1;
  const placeFor = (id: string, z: number): Place => { const k = blocks[id]?.kind ?? "page", [w, h] = SIZES[k] ?? SIZES.page; return { id, x: 12, y: 12, w, h, z }; };
  const onAway = (id: string) => {
    const st = stage(), has = st.blocks.some((p) => p.id === id);
    store.place(session, { ...st, blocks: has ? st.blocks.map((p) => (p.id === id ? { ...p, folded: true } : p)) : [...st.blocks, { ...placeFor(id, top()), folded: true }] });
  };
  const onBring = (id: string, out?: string) => {
    const st = stage(), zt = top(), has = st.blocks.some((p) => p.id === id);
    const blocksNow = st.blocks.map((p) => (p.id === id ? { ...p, folded: false, popped: false, pinned: false, z: zt } : p.id === out ? { ...p, folded: true } : p));
    store.place(session, { ...st, blocks: has ? blocksNow : [...blocksNow, placeFor(id, zt)] });
  };
  const here = useMemo(() => ({ store, session }), [store, session]);
  // the agent's eyes (#1435): what this session's space drew, to the engine (a new session not sent yet has none)
  // the agent's hands (#1437): its moves for this session, from the store
  const onFelt = useMemo(() => (session && store.felt ? (f: object) => store.felt!(session, f) : undefined), [store, session]);
  const onHands = useMemo(() => (session && store.onHand ? (f: (m: HandMove) => void) => store.onHand!(session, f) : undefined), [store, session]);
  const onSeen = useMemo(() => (session && store.seen ? (r: SeenReport | SeenOff) => store.seen!(session, r) : undefined), [store, session]);
  const acts = useMemo(() => ({
    act: (id: string) => (patch: Parameters<StageStore["update"]>[2], line?: string) => store.update(session, id, patch, line, BY),
    onFreeze: (id: string) => store.freeze(session, id, BY),
    onClose: (id: string) => store.close(session, id, BY),
  }), [store, session]);

  return (
    <StageHere.Provider value={here}>
      <Space session={session} blocks={blocks} open={open} away={away} lead={lead} empty={!items.length && !live.length && !busy} greet={greet} talk={spoken} said={said} asks={asks} box={box}
        hand={hand} setHand={setHand} onAway={onAway} onBring={onBring} onClose={acts.onClose} act={acts.act} onFreeze={acts.onFreeze}
        ledgerOf={(id) => seen?.ledger[id]} madeOf={(id) => seen?.ledger[id]?.[0]?.at} attrs={{ "data-space": session || "new" }} onSeen={onSeen} onHands={onHands} onFelt={onFelt} />
    </StageHere.Provider>
  );
}
