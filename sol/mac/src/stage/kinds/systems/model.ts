// The whole of Jelly's model (#1193): the shapes the engine sends (sol/engine/src/work/systemsWhole.ts) and the pure parts
// of drawing them: where each cluster's island sits (the bands of Marco's cluster map, SKETCH systems.html), which wires
// between clusters are drawn, the zoom (the whole, or one cluster in its own drawing), and each drawing's own grouping:
// the engine's in → inside → out, the machines' columns, the app's parts. No DOM, no React: the face's tests run it.

export type Role = "lanes" | "flow" | "machines" | "parts";
export type Cluster = { id: string; name: string; about: string; role: Role; count: number; states: Record<string, number> };
export type ClusterWire = { from: string; to: string; n: number };
export type Sys = { id: string; name: string; kind: string; state: string; parent: string | null; cluster: string; machines: string[]; units: string[] };
export type Here = { cluster: string; systems: string[]; person: string; session: string; title: string; branch: string; at: number };
export type Change = { sha: string; at: number; subject: string; author: string; agent: boolean; clusters: string[]; systems: string[]; reaches: string[] };
export type Whole = {
  at: number; name: string; about: string; clusters: Cluster[]; wires: ClusterWire[]; systems: Sys[]; links: [string, string][];
  who: Here[]; changes: Record<string, Change>; last: Change | null;
};

// ---- the whole: islands in bands ----
/** the map's own size; the face scales it to fit */
export const MAP_W = 1400, MAP_H = 900, ISLAND_W = 216, ISLAND_H = 104;
/** the bands of the cluster map and the clusters each holds, left to right (Marco's picture, systems.html) */
export const BANDS: { words: string; x: number; y: number; w: number; h: number }[] = [
  { words: "what a Jelly user meets", x: 40, y: 70, w: 1050, h: 175 },
  { words: "what runs it and ships it", x: 40, y: 300, w: 1050, h: 165 },
  { words: "how the team works", x: 40, y: 530, w: 1050, h: 360 },
  { words: "outward", x: 1110, y: 70, w: 250, h: 640 },
];
export const SPOTS: Record<string, [number, number]> = {
  design: [170, 150], face: [400, 150], product: [630, 150], app: [860, 150],
  mine: [170, 380], engine: [515, 380], releases: [860, 380],
  build: [170, 610], machines: [400, 610], day: [630, 610], team: [860, 610],
  legacy: [170, 810], nights: [400, 810], memory: [860, 810],
  testers: [1235, 150], marketing: [1235, 380], money: [1235, 610],
};
/** each island's centre: its spot on the map, else the free spots of the team's band's last row, then below it (pure) */
export function islandsOf(clusters: Pick<Cluster, "id">[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const free: [number, number][] = [[630, 810], [1235, 810]];
  let extra = 0;
  for (const c of clusters) {
    const at = SPOTS[c.id] ?? free.shift() ?? [170 + (extra % 5) * 230, 1000 + Math.floor(extra++ / 5) * 140];
    out.set(c.id, at);
  }
  return out;
}
/** the map's height: the bands, or lower when an island had to go below them */
export const mapHeight = (at: Map<string, [number, number]>) => Math.max(MAP_H, ...[...at.values()].map(([, y]) => y + ISLAND_H));
/** the wires drawn on the whole: only between clusters, both on the map, at least `min` systems wired (pure); the
 *  thinner ones are in each cluster's own drawing (its in and out) */
export const MIN_WIRE = 5;
export function wiresDrawn(wires: ClusterWire[], at: Map<string, unknown>, min = MIN_WIRE): ClusterWire[] {
  return wires.filter((w) => w.n >= min && w.from !== w.to && at.has(w.from) && at.has(w.to));
}
/** a wire's curve between two centres, bowed to one side so two ways between the same pair never lie on each other */
export function curve([x1, y1]: [number, number], [x2, y2]: [number, number]): string {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  return `M${x1},${y1} Q${(x1 + x2) / 2 + nx * d * 0.12},${(y1 + y2) / 2 + ny * d * 0.12} ${x2},${y2}`;
}
/** a wire's stroke: heavier the more systems it carries */
export const wireWidth = (n: number) => Math.round((0.8 + Math.sqrt(n) * 0.9) * 10) / 10;

// ---- the zoom ----
/** the whole (null) or one cluster opened in its own drawing */
export type Zoom = string | null;
export type ZoomEvent = { press: "cluster"; id: string } | { press: "ground" } | { key: string } | { known: string[] };
/** where a press, a key or a new reading takes the zoom (pure): a cluster opens it; empty ground, Escape or a cluster
 *  that left the registry goes back to the whole */
export function zoomed(z: Zoom, e: ZoomEvent): Zoom {
  if ("press" in e) return e.press === "cluster" ? e.id : null;
  if ("key" in e) return e.key === "Escape" ? null : z;
  return z !== null && !e.known.includes(z) ? null : z;
}
/** the drawing a cluster opens in: design's five lanes are the System kind itself */
export type Drawing = "system" | "flow" | "machines" | "parts";
export const drawingOf = (c: Pick<Cluster, "role">): Drawing => (c.role === "lanes" ? "system" : c.role);
export const DRAWING_WORDS: Record<Drawing, string> = {
  system: "why → rules → source → machine → surface", flow: "what comes in · the parts inside · what goes out",
  machines: "one column a machine, what runs on it", parts: "its parts",
};

// ---- who, and what changed ----
const KNOWN: [RegExp, string][] = [[/marco/i, "Marco"], [/frank/i, "Frank"], [/isaac|w0ngtap|\bwong\b/i, "Isaac"]];
/** a person's name as the team says it, from git's name or a login */
export function personOf(raw: string): string {
  for (const [re, n] of KNOWN) if (re.test(raw)) return n;
  const w = raw.trim().split(/\s+/)[0] ?? "";
  return w ? w[0].toUpperCase() + w.slice(1) : "someone";
}
/** the people in a cluster now, once each, the newest first, with their sessions there */
export function peopleIn(who: Here[], cluster: string): { person: string; sessions: Here[] }[] {
  const by = new Map<string, Here[]>();
  for (const h of who) if (h.cluster === cluster) { const p = personOf(h.person); by.set(p, [...(by.get(p) ?? []), h]); }
  return [...by].map(([person, sessions]) => ({ person, sessions })).sort((a, b) => b.sessions[0].at - a.sessions[0].at);
}
/** the sessions working on a system now */
export const hereOn = (who: Here[], id: string) => who.filter((h) => h.systems.some((s) => s === id || s.startsWith(`${id}/`)));
export function agoWords(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 36 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
/** a commit's subject without its "area:" lead and its "(#n)" tail */
export const cleanSubject = (s: string) => s.replace(/\s*\((?:part of |Part of )?#\d+[^)]*\)?\s*$/i, "").replace(/^[a-z][\w ./-]{0,24}:\s*/i, "");
/** whose change: "Marco's agent", or "Frank" when a person made it by hand */
export const byWords = (c: Pick<Change, "author" | "agent">) => (c.agent ? `${personOf(c.author)}'s agent` : personOf(c.author));
/** an island's one line: its newest change when it is under `fresh` old, else its count and what is not live */
export const FRESH_MS = 6 * 3_600_000;
export function islandLine(c: Cluster, change: Change | undefined, now = Date.now()): string {
  if (change && now - change.at < FRESH_MS) return `${byWords(change)} · ${agoWords(change.at, now)} · ${cleanSubject(change.subject)}`;
  const bits = [`${c.count} system${c.count === 1 ? "" : "s"}`];
  if (c.states.building) bits.push(`${c.states.building} building`);
  if (c.states.broken) bits.push(`${c.states.broken} broken`);
  return bits.join(" · ");
}
/** what a new reading shows moving: the clusters the newest change touched and the ones it reaches, only when the
 *  newest change is not the one already on screen (motion only for a change) (pure) */
export function moved(before: Whole | null, after: Whole): { touched: string[]; reached: string[] } {
  const a = after.last;
  if (!before || !a || before.last?.sha === a.sha) return { touched: [], reached: [] };
  return { touched: a.clusters, reached: a.reaches };
}

// ---- one cluster, by its role ----
const alive = (s: Sys) => s.state !== "legacy";
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
/** an outside cluster's systems on one side of the flow */
export type Side = { cluster: string; systems: { id: string; name: string }[] };
export type Flow = { ins: Side[]; inside: Sys[]; outs: Side[]; wires: [string, string][] };
/** in → inside → out (pure): what comes in (the systems of other clusters that feed one of its own, by cluster), its own
 *  parts (the most wired first), what goes out (the systems of other clusters it feeds); the wires as drawn, an outside
 *  system standing for its side's card ("in:<cluster>", "out:<cluster>") */
export function flowOf(id: string, w: Pick<Whole, "systems" | "links">): Flow {
  const sys = new Map(w.systems.map((s) => [s.id, s]));
  const mine = new Set(w.systems.filter((s) => s.cluster === id && s.id !== id && alive(s)).map((s) => s.id));
  const ins = new Map<string, Map<string, string>>(), outs = new Map<string, Map<string, string>>();
  const deg = new Map<string, number>(), wires = new Map<string, [string, string]>();
  const add = (side: Map<string, Map<string, string>>, s: Sys) => { const m = side.get(s.cluster) ?? new Map(); m.set(s.id, s.name); side.set(s.cluster, m); };
  for (const [a, b] of w.links) {
    const A = sys.get(a), B = sys.get(b);
    if (!A || !B) continue;
    if (mine.has(a) && mine.has(b)) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); wires.set(`${a}>${b}`, [a, b]); }
    else if (mine.has(b) && A.cluster !== id && alive(A)) { add(ins, A); deg.set(b, (deg.get(b) ?? 0) + 1); wires.set(`in:${A.cluster}>${b}`, [`in:${A.cluster}`, b]); }
    else if (mine.has(a) && B.cluster !== id && alive(B)) { add(outs, B); deg.set(a, (deg.get(a) ?? 0) + 1); wires.set(`${a}>out:${B.cluster}`, [a, `out:${B.cluster}`]); }
  }
  const side = (m: Map<string, Map<string, string>>): Side[] => [...m].map(([cluster, s]) => ({ cluster, systems: [...s].map(([sid, name]) => ({ id: sid, name })).sort(byName) }))
    .sort((a, b) => b.systems.length - a.systems.length || (a.cluster < b.cluster ? -1 : 1));
  const inside = [...mine].map((x) => sys.get(x)!).sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || byName(a, b));
  return { ins: side(ins), inside, outs: side(outs), wires: [...wires.values()] };
}
export type Box = { x: number; y: number; w: number; h: number };
export const FLOW = { sideW: 240, tileW: 184, tileH: 48, gap: 10, cols: 3, lane: 72, lineH: 17, perLine: 34 };
/** a side card's height: its head and its names, wrapped */
export const sideH = (s: Side) => 40 + Math.ceil(s.systems.map((x) => x.name).join(" · ").length / FLOW.perLine) * FLOW.lineH;
/** every box of the flow (pure): the ins in the left column, the inside as a grid of FLOW.cols, the outs on the right;
 *  the world's size with them */
export function flowLayout(f: Flow): { boxes: Map<string, Box>; w: number; h: number } {
  const boxes = new Map<string, Box>(), { sideW, tileW, tileH, gap, cols, lane } = FLOW;
  let y = 0;
  for (const s of f.ins) { const h = sideH(s); boxes.set(`in:${s.cluster}`, { x: 0, y, w: sideW, h }); y += h + gap; }
  let h = y;
  const x0 = sideW + lane;
  f.inside.forEach((s, i) => boxes.set(s.id, { x: x0 + (i % cols) * (tileW + gap), y: Math.floor(i / cols) * (tileH + gap), w: tileW, h: tileH }));
  h = Math.max(h, Math.ceil(f.inside.length / cols) * (tileH + gap));
  const x1 = x0 + cols * (tileW + gap) - gap + lane;
  y = 0;
  for (const s of f.outs) { const sh = sideH(s); boxes.set(`out:${s.cluster}`, { x: x1, y, w: sideW, h: sh }); y += sh + gap; }
  return { boxes, w: x1 + sideW, h: Math.max(h, y) };
}
/** a flow wire's path: from the right edge of the one to the left edge of the other, at their middles */
export function flowPath(a: Box, b: Box): string {
  const x1 = a.x + a.w, y1 = a.y + Math.min(a.h / 2, 20), x2 = b.x, y2 = b.y + Math.min(b.h / 2, 20), dx = Math.max(30, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/** the machines' columns (pure): one per machine the machines cluster holds (macbook, nucbox, legion, github, cloud first),
 *  each with the machine's own systems and every system anywhere that names units on it */
export const MACHINE_ORDER = ["macbook", "nucbox", "legion", "github", "cloud"];
export type Column = { machine: string; name: string; systems: Sys[] };
export function machinesOf(id: string, w: Pick<Whole, "systems">): Column[] {
  const own = w.systems.filter((s) => s.cluster === id && s.id !== id && alive(s));
  const names = new Map<string, string>();
  for (const s of own) if (s.kind === "machine" && s.machines[0]) names.set(s.machines[0], s.name);
  const ms = [...new Set([...names.keys(), ...own.flatMap((s) => s.machines)])]
    .sort((a, b) => (MACHINE_ORDER.indexOf(a) + 1 || 99) - (MACHINE_ORDER.indexOf(b) + 1 || 99) || (a < b ? -1 : 1));
  return ms.map((m) => {
    const on = new Map<string, Sys>();
    for (const s of own) if (s.machines[0] === m && s.kind !== "machine") on.set(s.id, s);
    for (const s of w.systems) if (s.units.length && s.machines.includes(m) && alive(s) && s.kind !== "machine") on.set(s.id, s);
    const list = [...on.values()].sort((a, b) => b.units.length - a.units.length || byName(a, b));
    return { machine: m, name: names.get(m) ?? m, systems: list };
  });
}

/** a cluster's parts (pure): every system of it but itself, live ones first, then by name */
export function partsOf(id: string, w: Pick<Whole, "systems">): Sys[] {
  return w.systems.filter((s) => s.cluster === id && s.id !== id).sort((a, b) => Number(!alive(a)) - Number(!alive(b)) || byName(a, b));
}
