// Home's world (#1093): two pieces for World3D.tsx, written by the designer (n13) on the builder's 6deec3bd. Lift
// each into World3D.tsx (or import them): they pass tsc beside it under the face's settings.
//   keepDay: today's shelf and the wall of days. Call it with the keys of every done sticky (`folder/name`) each
//     time the data changes. It answers `old` (done before today's first look: give those things `old: true`, the
//     scene keeps them off the shelf and on their folder's figure), `days` and `newDay` for `world.set(...)`.
//     The `done` count is then the done things without `old`.
//       const day = keepDay(live ? doneKeys : []);            // the made-up person shows all it has done
//       world.set({ ...data, ...extra, days: day.days, newDay: firstLook.current ??= day.newDay })
//   keepPast: the day pulled back. `past: keepPast(data)` in `world.set(...)`, live data only; nothing else to wire:
//     the bead on the arc is already held and drawn back in the scene, the counts dim while it is held (onPull).
//   Still: the flat fallback, the same places as the scene (model.ts), the same presses.
import { DOCK, ISLAND, PLAZA, SHELF, WORKSHOP, asks, folderSpots, projectSpots, type WorldData } from "./model";
import { EDGE, slotsFor, type Target } from "./scene";

/** the wall of his days and today's shelf: at a day's first look the world notes what was already done (those stay on
 *  their folders' figures); what gets done after that is today's, on the shelf. Each past day is a brick with its count.
 *  Kept in this window's storage. */
const DAYS_KEY = "sol.world.days";
type Days = Record<string, { had: string[]; n: number; names?: string[] }>;   // names: what got done that day, by name only (never a note or a path), 21 at most: the brick pressed lays them on the shelf
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function keepDay(done: string[]): { days: { n: number; day: string; names?: string[] }[]; newDay: boolean; old: Set<string> } {
  let all: Days = {}; try { all = JSON.parse(localStorage.getItem(DAYS_KEY) ?? "{}"); } catch { /* private */ }
  const k = dayKey(), newDay = !all[k] && Object.keys(all).length > 0, had = all[k]?.had ?? done, old = new Set(had);
  const fresh = done.filter((x) => !old.has(x));
  all[k] = { had, n: fresh.length, names: fresh.slice(0, 21).map((x) => x.slice(x.lastIndexOf("/") + 1).slice(0, 40)) };
  try { localStorage.setItem(DAYS_KEY, JSON.stringify(all)); } catch { /* private */ }
  const days = Object.keys(all).filter((d) => d < k).sort().slice(-28).map((d) => ({ n: all[d].n, names: all[d].names, day: new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) }));
  return { days, newDay, old };
}

/** the day pulled back: the island as it was at earlier hours of today, kept in this window's storage, so the bead on
 *  the arc can be drawn back past the moment this window opened. Call it with the live data each time it changes and
 *  give its answer to the scene as `past` (`world.set({ ...data, ...extra, past: keepPast(data) })`). A look is kept
 *  when something changed state and six minutes passed; sixty a day at most and 150 KB in all; a new day starts
 *  empty. Only names and states are kept (slim): never a note, a path or a check. */
const PAST_KEY = "sol.world.past", PAST_MAX = 150_000;
/** only what the scene draws of an earlier hour: names and states. No notes (what a thing asks), no paths, no checks; of
 *  the things done before today at most nine a folder (its figure shows no more). */
const slim = (d: WorldData): WorldData => ({
  who: d.who, mates: d.mates.map((m) => ({ name: m.name, on: m.on })), social: d.social, source: d.source, at: d.at,
  parts: d.parts.map((p) => ({ id: p.id, name: p.name, folders: p.folders.map((f) => { let old = 0; return { id: f.id, name: f.name, part: f.part, rel: f.rel, set: f.set,
    things: f.things.filter((t) => !t.old || old++ < 9).map((t) => ({ id: t.id, name: t.name, mood: t.mood, folder: t.folder, i: t.i, ...(t.old ? { old: true } : {}) })) }; }) })),
  projects: d.projects.map((p) => ({ id: p.id, name: p.name, path: "", health: p.health, ...(p.jelly ? { jelly: true } : {}), sessions: p.sessions.map((x) => ({ id: x.id, title: x.title, busy: x.busy, waiting: x.waiting, failed: x.failed })) })),
});
export function keepPast(data: WorldData): { hour: number; data: WorldData }[] {
  type Kept = { day: string; at: { hour: number; sig: string; data: WorldData }[] };
  let k: Kept = { day: dayKey(), at: [] }; try { const q = JSON.parse(localStorage.getItem(PAST_KEY) ?? "null") as Kept | null; if (q?.day === k.day && Array.isArray(q.at)) k = q; } catch { /* private */ }
  const now = new Date(), hour = now.getHours() + now.getMinutes() / 60, last = k.at[k.at.length - 1];
  const sig = [...data.parts.flatMap((p) => p.folders.flatMap((f) => f.things.map((t) => `${f.id}/${t.name}:${t.mood}`))), ...data.projects.flatMap((p) => [`${p.id}:${p.health}`, ...p.sessions.map((x) => `${x.id}:${+x.busy}${+x.waiting}${+x.failed}`)])].join("|");
  if (!last || (last.sig !== sig && hour - last.hour >= 0.1)) {
    k.at.push({ hour, sig, data: slim(data) }); if (k.at.length > 60) k.at.splice(1, 1);                  // the first look of the day is always kept
    let js = JSON.stringify(k); while (js.length > PAST_MAX && k.at.length > 2) { k.at.splice(1, 1); js = JSON.stringify(k); }   // capped in bytes: the oldest looks after the first go
    try { localStorage.setItem(PAST_KEY, js); } catch { /* private, or full: the scene still keeps this window's own looks */ }
  }
  return k.at.map(({ hour: h, data: d }) => ({ hour: h, data: d }));
}

/** no WebGL: the same island from straight above, the same places (model.ts), the same presses. Outlines, no fills of
 *  its own; pearl squares for folders, their tiles on them; what wants him in a row along the front; the shelf; his jelly. */
export function Still({ data, onPress }: { data: WorldData; onPress: (t: Target) => void }) {
  const col = { wait: "var(--c-pearl)", run: "var(--green)", ask: "var(--sun)", done: "var(--mute)" } as const;
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const SL = slotsFor(data.parts.length);
  const hair = { fill: "none", stroke: "var(--c-pearl)", strokeWidth: 0.035 } as const;
  const want = asks(data), ps = projectSpots(data.projects), dones = data.parts.flatMap((p) => p.folders.flatMap((f) => f.things.filter((t) => t.mood === "done" && !(t as { old?: boolean }).old)));
  const things = data.parts.flatMap((p) => p.folders.flatMap((f) => f.things));
  return (
    <svg className="w3-still" viewBox={`${-ISLAND.w / 2 - 0.6} ${-ISLAND.d / 2 - 0.6} ${ISLAND.w + 1.2} ${ISLAND.d + 1.2}`} role="img" aria-label="your world, drawn flat">
      <rect x={-ISLAND.w / 2} y={-ISLAND.d / 2} width={ISLAND.w} height={ISLAND.d} rx={0.5} {...hair} opacity={0.34} />
      {data.parts.slice(0, SL.length).map((p, pi) => { const b = SL[pi], spots = folderSpots(p, b);
        return <g key={p.id}>
          <rect x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} rx={0.16} {...hair} opacity={0.34} />
          <text x={b.x - b.w / 2 + 0.3} y={b.z + b.d / 2 - 0.3} fontSize={0.36} fill="var(--dim)">{p.name}</text>
          {p.folders.map((f) => { const s = spots.get(f.id)!, roof = f.things.filter((t) => t.mood === "wait" || t.mood === "run");
            return <g key={f.id} style={{ cursor: "pointer" }} onClick={() => onPress({ kind: "folder", id: f.id, name: f.name, part: f.part })}>
              <rect x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} rx={0.08} fill={f.set ? "var(--c-pearl)" : "none"} stroke="var(--c-pearl)" strokeWidth={0.035} strokeDasharray={f.set ? undefined : "0.14 0.1"} opacity={f.set ? 0.92 : 0.6} />
              {roof.slice(0, 6).map((t, k) => <rect key={t.id} x={s.x - s.w / 2 + 0.12 + (k % 3) * 0.4} y={s.z - s.d / 2 + 0.12 + Math.floor(k / 3) * 0.4} width={0.3} height={0.3} rx={0.04} fill={t.mood === "run" ? col.run : "var(--c-deep)"} opacity={t.mood === "run" ? 1 : 0.5} />)}
              <text x={s.x} y={s.z + s.d / 2 + 0.5} fontSize={0.36} textAnchor="middle" fill="var(--ink)" opacity={0.62}>{cut(f.name, 12)}</text></g>; })}</g>; })}
      <rect x={WORKSHOP.x - WORKSHOP.w / 2} y={WORKSHOP.z - WORKSHOP.d / 2} width={WORKSHOP.w} height={WORKSHOP.d} rx={0.16} {...hair} opacity={0.34} />
      <text x={WORKSHOP.x - WORKSHOP.w / 2 + 0.3} y={WORKSHOP.z + WORKSHOP.d / 2 - 0.3} fontSize={0.36} fill="var(--dim)">build</text>
      {data.projects.map((p) => { const s = ps.get(p.id)!;
        return <g key={p.id} style={{ cursor: "pointer" }} onClick={() => onPress({ kind: "project", id: p.id, name: p.name, health: p.health })}>
          <rect x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} rx={0.08} fill="var(--c-pearl)" opacity={p.health === "idle" ? 0.36 : 0.92} />
          {p.sessions.slice(0, 4).map((x, k) => <rect key={x.id} x={s.x - s.w / 2 + 0.14} y={s.z - s.d / 2 + 0.14 + k * 0.3} width={s.w - 0.28} height={0.2} rx={0.04} fill={x.waiting ? col.ask : x.busy ? col.run : x.failed ? "var(--ember)" : "var(--c-deep)"} opacity={x.waiting || x.busy || x.failed ? 1 : 0.35} />)}
          <text x={s.x} y={s.z + s.d / 2 + 0.5} fontSize={0.36} fontWeight={600} textAnchor="middle" fill="var(--ink)" opacity={0.62}>{cut(p.name, 12)}</text></g>; })}
      <circle cx={PLAZA.x} cy={PLAZA.z} r={1.5} {...hair} opacity={0.16} /><circle cx={PLAZA.x} cy={PLAZA.z} r={0.62} fill="var(--amber, #f89b2a)" />
      <rect x={SHELF.x - SHELF.w / 2} y={SHELF.z - SHELF.d / 2} width={SHELF.w} height={SHELF.d} rx={0.12} {...hair} opacity={0.16} />
      {dones.slice(0, 21).map((t, k) => <rect key={t.id} x={SHELF.x - SHELF.w / 2 + 0.2 + (k % 7) * 0.46} y={SHELF.z - SHELF.d / 2 + 0.18 + Math.floor(k / 7) * 0.46} width={0.32} height={0.32} rx={0.04} fill={col.done} />)}
      {data.mates.map((m, i) => <circle key={m.name} cx={DOCK.x - 1.7} cy={DOCK.z - 0.9 + i * 1.3} r={0.16} fill="var(--c-pearl)" opacity={m.on ? 0.92 : 0.3} />)}
      <line x1={-ISLAND.w / 2 + 0.7} x2={ISLAND.w / 2 - 0.7} y1={EDGE.z - 0.5} y2={EDGE.z - 0.5} stroke="var(--c-pearl)" strokeWidth={0.03} opacity={0.16} />
      {want.slice(0, 7).map((a, i) => { const x = EDGE.x0 + i * EDGE.step, t = a.kind === "thing" ? things.find((y) => y.id === a.id) : undefined;
        return <g key={a.id} style={{ cursor: "pointer" }} onClick={() => onPress(t ? { kind: "thing", id: t.id, name: t.name, folder: t.folder, mood: t.mood } : { kind: "session", id: a.id, name: a.name, project: a.where })}>
          <rect x={x - 0.3} y={EDGE.z - 0.4} width={0.6} height={0.6} rx={0.06} fill={col.ask} />
          <text x={x} y={EDGE.z + 0.62} fontSize={0.34} fontWeight={600} textAnchor="middle" fill="var(--ink)">{cut(a.name, 14)}</text></g>; })}
    </svg>
  );
}
