// Cowork's map, drawn from the spec (#1433; the answer key is mine/look/cowork/o1, approved 2026-11-17).
// Pure: a spec and where a person stands on it (who, which view, which place, the Time window, the Layers) go in; a tree
// of plain SVG nodes comes out (VNode, drawn by Map.tsx), with the numbers the rail and Street View read. Nothing in here
// names a person, a place or a view: a view draws by its `kind`, the way a map knows terrain or transit; which views
// exist, their words, each person's order and pins are the spec's.
import type { MapSpec, Place, MapChange, MapView, MapPin, MapCall, MapPr } from "./spec.ts";
import { SET, NACRE_STOPS, JELLY_STOPS, DEEP } from "./vars.ts";

// ---- the nodes ----

/** what a press on a node does: go one layer down, or open its Street View */
export type Act = { zoom: string } | { street: string };
export type VNode = { t: string; a: Record<string, string | number>; k: VNode[]; x?: string | number; on?: Act };
export const el = (t: string, a: Record<string, string | number> = {}, x?: string | number): VNode => ({ t, a, k: [], ...(x != null ? { x } : {}) });
const add = (g: VNode, ...k: VNode[]) => { g.k.push(...k); return g; };

/** where a person stands on the map; the address of a still */
export type MapState = { who: string; view: string; at: string; hours: number; off: string[]; type: string; open: string | null };
export const SHOW = 8;
/** the map's own space: every shape is laid on a 1000 × 640 sheet, scaled to the box */
export const W = 1000, H = 640;
/** ids of the shared paint (gradients, the drop and the sticker's shadow), drawn once per map */
export const ID = { nacre: "cm-nacre", jelly: "cm-jelly", drop: "cm-drop", stk: "cm-stk" };
const url = (id: string) => `url(#${id})`;

export type Win = { ch: number; by: Record<string, number>; live: number; list: MapChange[] };
export type Model = ReturnType<typeof modelOf>;

// ---- the numbers a view reads ----

export function modelOf(spec: MapSpec, st: MapState) {
  const N = spec.places;
  const persons = new Map(spec.people.filter((p) => p.kind === "person").map((p) => [p.id, p]));
  const view: MapView = spec.views.find((v) => v.id === st.view) ?? spec.views.find((v) => v.default) ?? spec.views[0];
  const kind = view?.kind ?? "change";
  const on = (k: string) => !st.off.includes(k);
  const type = spec.types.find((t) => t.id === st.type) ?? spec.types[0];
  const roots = type?.roots ?? N.root?.kids ?? [];
  /** layer 1 is hand-laid when the spec lays every one of its places (like countries keeping their place) */
  const laidRoot = !!spec.layout && roots.length > 0 && roots.every((r) => spec.layout![r]);
  const atRoot = st.at === "root";
  const full = st.hours >= spec.window;
  const stops = view?.stops ?? [];
  const calls = new Map<number, MapCall>(spec.calls.map((c) => [c.n, c]));
  const prs = new Map<number, MapPr>(spec.prs.map((p) => [p.n, p]));

  const chainOf = (id: string) => { const c: string[] = []; let n: Place | undefined = N[id]; while (n) { c.push(n.id); n = n.parent ? N[n.parent] : undefined; } return c; };
  const WIN: Record<string, Win> = {};
  for (const c of spec.changes) {
    if (c.ago > st.hours * 60) continue;
    for (const id of new Set(c.parts.flatMap(chainOf))) {
      const s = (WIN[id] ||= { ch: 0, by: {}, live: 0, list: [] });
      s.ch++; s.by[c.by + "|" + c.how] = (s.by[c.by + "|" + c.how] || 0) + 1; if (c.ago < 180) s.live++; s.list.push(c);
    }
  }
  const ws = (id: string): Win => WIN[id] || { ch: 0, by: {}, live: 0, list: [] };
  const who = st.who;
  const myCalls = (n: Place) => n.calls.filter((k) => calls.get(k)?.who === who);
  const myPrs = (n: Place) => n.prs.filter((k) => prs.get(k)?.by === who);
  const holderOf = (id: string) => { for (const x of chainOf(id)) if (N[x]?.holder) return N[x].holder!; return null; };
  const myPairs = (n: Place) => Object.entries(n.pairs).filter(([k]) => k.split("+").includes(who)).reduce((a, [, v]) => a + v, 0);
  const onStop = (id: string) => stops.some((r) => chainOf(r.place).includes(id));
  function weight(id: string) {   // what a view ranks by: the busiest few show, the rest fold
    const n = N[id], w = ws(id);
    if (kind === "calls") return n.calls.length * 10 + n.parts / 100;
    if (kind === "clashes") return n.prClash * 6 + n.clash * 2 + w.ch / 10;
    if (kind === "day") return n.broken * 10 + w.ch / 10 + (view.focus && chainOf(id).includes(view.focus) ? 5 : 0);
    if (kind === "court") return myCalls(n).length * 6 + myPrs(n).length * 3 + myPairs(n) + (holderOf(id) === who ? w.ch / 5 : 0);
    if (kind === "route") return onStop(id) ? 100 : w.ch / 10;
    return w.ch * 2 + n.prs.length + n.broken * 4 + n.alone / 4;
  }
  function kidsOf(id: string): { shown: string[]; folded: string[] } {
    if (id === "root" && laidRoot) return { shown: roots, folded: [] };
    const k = (id === "root" ? roots : N[id]?.kids ?? []).filter((x) => N[x]).slice().sort((a, b) => weight(b) - weight(a));
    if (k.length <= SHOW) return { shown: k, folded: [] };
    const shown = k.slice(0, SHOW - 1).filter((x) => weight(x) > 0);
    return { shown, folded: k.filter((x) => !shown.includes(x)) };
  }
  // shade: how much this view's thing sits on a circle (a grey ladder: the rest is grey)
  function shade(id: string) {
    const n = N[id], w = ws(id), sz = Math.max(1, Math.sqrt(n.parts));
    let v = 0;
    if (kind === "change") v = w.ch / (sz * 3);
    else if (kind === "calls") v = n.calls.length / 6;
    else if (kind === "clashes") v = n.prClash / 12 + n.clash / 80;
    else if (kind === "day") v = n.broken / 3;
    else if (kind === "court") v = weight(id) / 20;
    else if (kind === "route") v = onStop(id) ? 0.5 : 0;
    return Math.min(1, v);
  }
  function markOf(id: string) {   // a count is a mark on the map, never a card
    const n = N[id], w = ws(id);
    if (kind === "change") return w.ch ? `${w.ch} moved${n.prs.length ? ` · ${n.prs.length} open` : ""}` : n.prs.length ? `${n.prs.length} open` : "quiet";
    if (kind === "calls") { const st_ = n.calls.map((k) => calls.get(k)).filter((d) => d && d.idle >= 7).length; return n.calls.length ? `${n.calls.length} open call${n.calls.length > 1 ? "s" : ""}${st_ ? ` · ${st_} a week+` : ""}` : ""; }
    if (kind === "clashes") return [n.prClash && `${n.prClash} PR pairs`, n.clash && `${n.clash} night lines`].filter(Boolean).join(" · ");
    if (kind === "day") return n.broken ? `${n.broken} broken` : w.ch ? `${w.ch} moved` : "";
    if (kind === "court") { const a = myCalls(n).length, b = myPrs(n).length; return [a && `${a} your call${a > 1 ? "s" : ""}`, b && `${b} your PR${b > 1 ? "s" : ""}`].filter(Boolean).join(" · "); }
    return "";
  }
  const order = spec.view_order[who] ?? spec.views.map((v) => v.id);
  const top: MapPin[] = spec.surface[who]?.top ?? [];
  return { spec, st, N, persons, view, kind, on, type, roots, laidRoot, atRoot, full, stops, calls, prs, chainOf, ws, who, myCalls, myPrs, holderOf, weight, kidsOf, shade, markOf, order, top };
}

// ---- the people's marks ----

const nameOf = (m: Model, p: string | null) => (p ? m.persons.get(p)?.name ?? p : "");
/** a person's colour: the viewer is pearl (yours), the others wear the colour set */
/** the colour set as variables, one name each (vars.ts sets them) */
const SETV = ["var(--m-set-0)", "var(--m-set-1)", "var(--m-set-2)", "var(--m-set-3)", "var(--m-set-4)", "var(--m-set-5)"];
export const colourOf = (m: Model, p: string | null) => (p && p === m.who ? "var(--m-pearl)" : SETV[m.persons.get(p ?? "")?.set ?? 0] ?? SETV[0]);
const initial = (m: Model, p: string | null) => (nameOf(m, p) || "?")[0];
/** a face: filled = the person by hand, ringed = their agent on their ask, ✦ = an agent alone */
export function face(m: Model, x: number, y: number, p: string | null, how: string, r = 10): VNode {
  const g = el("g");
  if (how === "alone") return add(g, el("circle", { cx: x, cy: y, r, fill: url(ID.jelly) }), el("text", { x, y: y + r * 0.4, "text-anchor": "middle", "font-size": r * 1.1, "font-weight": 700, style: "fill:var(--m-deep)" }, "✦"));
  const c = colourOf(m, p);
  if (how === "hand") return add(g, el("circle", { cx: x, cy: y, r, style: `fill:${c}` }), el("text", { x, y: y + r * 0.38, "text-anchor": "middle", "font-size": r * 1.05, "font-weight": 600, style: "fill:var(--m-deep)" }, initial(m, p)));
  return add(g, el("circle", { cx: x, cy: y, r: r - 0.9, style: `fill:var(--m-ground);stroke:${c};stroke-width:1.8` }), el("text", { x, y: y + r * 0.38, "text-anchor": "middle", "font-size": r * 1.05, "font-weight": 600, style: `fill:${c}` }, initial(m, p)));
}
function notch(x: number, y: number, r = 7) { return el("path", { d: `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x} ${y - r} L ${x} ${y} Z`, style: "fill:var(--m-wrong)" }); }
/** the shared paint: nacre (yours), jelly (live), the drop under a circle, the sticker's shadow */
export function defs(): VNode {
  const d = el("defs");
  const lg = (id: string, cols: string[]) => add(d, add(el("linearGradient", { id }), ...cols.map((c, i) => el("stop", { offset: i / (cols.length - 1), "stop-color": c }))));
  lg(ID.nacre, NACRE_STOPS); lg(ID.jelly, JELLY_STOPS);
  add(d, add(el("filter", { id: ID.drop, x: "-30%", y: "-30%", width: "160%", height: "170%" }), el("feDropShadow", { dx: 0, dy: 10, stdDeviation: 14, "flood-color": DEEP, "flood-opacity": 0.55 })));
  add(d, add(el("filter", { id: ID.stk, x: "-20%", y: "-20%", width: "140%", height: "160%" }), el("feDropShadow", { dx: 0, dy: 1, stdDeviation: 1, "flood-color": DEEP, "flood-opacity": 0.5 })));
  return d;
}

// ---- packing: size (parts) never moves; laid largest first, nearest the middle ----

export type Packed = { id: string; size: number; x: number; y: number; r: number };
export function pack(items: { id: string; size: number }[], R: number, gap = 3, ax = 1.25, ay = 0.85): Packed[] {
  if (!items.length) return [];
  // the gap is on screen: pack once to learn the scale, then again with the gap in pack units
  const run = (g: number) => {
    const c = items.map((it) => ({ ...it, x: 0, y: 0, r: Math.max(6, Math.sqrt(it.size)) })).sort((a, b) => b.r - a.r);
    const placed: Packed[] = [];
    for (const it of c) {
      if (!placed.length) { placed.push(it); continue; }
      let best: { x: number; y: number } | null = null;
      for (let d = 0; d < 2000 && !best; d += 0.75) for (let a = 0; a < 360; a += 10) {
        const x = Math.cos((a * Math.PI) / 180) * d * ax, y = Math.sin((a * Math.PI) / 180) * d * ay;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + it.r + g)) { best = { x, y }; break; }
      }
      Object.assign(it, best || { x: 0, y: 0 }); placed.push(it);
    }
    const ext = Math.max(...placed.map((p) => (ax === ay ? Math.hypot(p.x, p.y) : Math.max((Math.abs(p.x) * ay) / ax, Math.abs(p.y))) + p.r));
    return { placed, k: R / ext };
  };
  let { k } = run(1);
  for (let i = 0; i < 2; i++) ({ k } = run(gap / k));
  const { placed, k: k2 } = run(gap / k);
  return placed.map((p) => ({ ...p, x: p.x * k2, y: p.y * k2, r: p.r * k2 }));
}
/** a hand-laid layer 1: one scale for every outcome's size */
const ROOTK = 13;

// ---- a name inside a circle reads whole: as few lines as fit the chord, whole words, a touch smaller only if it must ----

const fit = (s: string, w: number) => (s.length * 6.6 > w ? s.slice(0, Math.max(3, Math.floor(w / 6.6) - 1)) + "…" : s);
export const cw = (s: string, fs: number) => s.length * fs * 0.56;
export function splits(s: string, k: number): string[] | null {
  const w = s.split(" "); if (k === 1) return [s]; if (w.length < k) return null;
  let best: { m: number; l: string[] } | null = null;
  const go = (i: number, acc: string[]) => {
    if (acc.length === k - 1) { const l = [...acc, w.slice(i).join(" ")]; const m = Math.max(...l.map((x) => x.length)); if (!best || m < best.m) best = { m, l }; return; }
    for (let j = i + 1; j <= w.length - (k - 1 - acc.length); j++) go(j, [...acc, w.slice(i, j).join(" ")]);
  };
  go(0, []); return best ? (best as { l: string[] }).l : null;
}
type Line = { t: string; fs: number; ink: number; y: number; w: number };
export function circleText(_x: number, y: number, r: number, name: string, mark: string, fs: number, fm: number, short?: string, min = 0): Line[] {
  const marks = mark ? [[mark], mark.split(" · ")] : [[]];
  const tries = ([[name, 1], [name, 0.92], [short, 1], [short, 0.92], [name, 0.84], [short, 0.84]] as [string | undefined, number][]).filter(([t]) => t) as [string, number][];   // the short form only when the whole name would be too small to read
  let last: Line[] = [];
  for (const [nm, sc] of tries) for (const ml of marks) for (let k = 1; k <= 3; k++) {
    const nl = splits(nm, k); if (!nl) continue;
    const lines: Line[] = [...nl.map((t) => ({ t, fs: Math.max(min, fs * sc), ink: 1, y: 0, w: 0 })), ...ml.map((t) => ({ t, fs: Math.max(min, fm * sc), ink: 0, y: 0, w: 0 }))];
    const Ht = lines.reduce((a, l) => a + l.fs * 1.22, 0); let top = y - Ht / 2, ok = true;
    for (const l of lines) {
      l.y = top + (l.fs * 1.22) / 2; top += l.fs * 1.22;
      const dy = Math.abs(l.y - y) + l.fs * 0.55; l.w = cw(l.t, l.fs);
      if (dy >= r || l.w > 2 * Math.sqrt(r * r - dy * dy) - 8) ok = false;
    }
    last = lines; if (ok) return lines;
  }
  return last.map((l) => ({ ...l, t: fit(l.t, r * 1.6) }));
}

// ---- the map ----

type Box = [number, number, number, number];
export type Scene = { root: VNode; pos: Record<string, { x: number; y: number; r: number }>; folded: string[]; shown: string[] };

/** `min` is the smallest a word on the sheet may be, in the sheet's units: the face passes 11 px over the box's scale, so a
 *  name never reads smaller than the label size however narrow the box (a long one ends in an ellipsis instead) */
export function drawMap(m: Model, min = 11): Scene {
  const { N, kind, on, st } = m, F = (x: number) => Math.max(min, x);
  const root = el("g"), POS: Scene["pos"] = {}, BOX: Box[] = [], LBL: Box[] = [];
  add(root, defs());
  const { shown, folded } = m.kidsOf(st.at);
  let items: { id: string; x: number; y: number; r: number }[];
  if (m.atRoot && m.laidRoot) items = shown.map((id) => ({ id, x: m.spec.layout![id][0], y: m.spec.layout![id][1], r: ROOTK * Math.sqrt(N[id].parts) }));
  else {
    const list = shown.map((id) => ({ id, size: N[id].parts }));
    if (folded.length) list.push({ id: "~fold", size: Math.min(40, folded.reduce((a, x) => a + N[x].parts, 0) * 0.5 + 4) });
    items = pack(list, 255, 34).map((p) => ({ ...p, x: p.x + 500, y: p.y + 285 }));
  }
  for (const it of items) POS[it.id] = it;
  const layer = el("g"), marks = el("g");
  const rim = (x: number, y: number, r: number, alpha: number) => el("path", { d: `M ${x - r * 0.82} ${y - r * 0.57} A ${r} ${r} 0 0 1 ${x + r * 0.82} ${y - r * 0.57}`, style: `fill:none;stroke:var(--m-white);stroke-opacity:${alpha};stroke-width:1.2` });
  const putText = (g: VNode, lines: Line[], x: number, col: string) => {
    for (const l of lines) {
      add(g, el("text", { x, y: l.y + l.fs * 0.36, "text-anchor": "middle", "font-size": l.fs.toFixed(1), "font-weight": l.ink && col === "ink" ? 500 : 400, style: `fill:${l.ink && col === "ink" ? "var(--m-ink)" : "var(--m-dim)"};font-variant-numeric:tabular-nums` }, l.t));
      LBL.push([x - l.w / 2 - 2, l.y - l.fs * 0.6, x + l.w / 2 + 2, l.y + l.fs * 0.6]);
    }
  };
  const showBroken = kind === "day" || (kind === "change" && on("health"));
  const stopAt = (id: string) => m.stops.some((q) => q.place === id);

  for (const it of items) {
    if (it.id === "~fold") {
      const g = el("g", { style: "cursor:pointer" }); g.on = { street: "~fold" };
      add(g, el("circle", { cx: it.x, cy: it.y, r: it.r, style: "fill:var(--m-well)" }), el("text", { x: it.x, y: it.y + 4, "text-anchor": "middle", "font-size": F(12), style: "fill:var(--m-mute)" }, `${folded.length} quiet`));
      add(layer, g); continue;
    }
    const n = N[it.id], w = m.ws(it.id), { x, y, r } = it;
    const g = el("g", { style: "cursor:pointer", "data-place": it.id });
    g.on = n.kids.length ? { zoom: it.id } : { street: it.id };
    add(g, el("circle", { cx: x, cy: y, r, style: `fill:var(--m-card);filter:${url(ID.drop)}` }), rim(x, y, r, 0.14));
    const sh = m.shade(it.id);
    if (sh > 0) add(g, el("circle", { cx: x, cy: y, r: r - 1, style: `fill:var(--m-white);fill-opacity:${(0.025 + sh * 0.1).toFixed(3)}` }));
    if (m.holderOf(it.id) === m.who && m.atRoot && m.laidRoot) add(g, el("circle", { cx: x, cy: y, r: r + 5, style: `fill:none;stroke:${url(ID.nacre)};stroke-width:2.5;opacity:.8` }));
    // the name of a big circle sits where the chord is wide enough; a long one breaks onto two lines
    let tl = [n.name], tdy = 30;
    const chord = (dy: number) => 2 * Math.sqrt(Math.max(0, r * r - (r - dy) ** 2)) - 28, wide = (t: string) => t.length * 15 * 0.52;
    if (r >= 80 && wide(n.name) > chord(30)) {
      const ws_ = n.name.split(" "); let best: { m: number; l: string[] } | null = null;
      for (let i = 1; i < ws_.length; i++) { const a = ws_.slice(0, i).join(" "), b = ws_.slice(i).join(" "); const mm = Math.max(a.length, b.length); if (!best || mm < best.m) best = { m: mm, l: [a, b] }; }
      if (wide(n.name) <= chord(44)) tdy = 44; else if (best) { tl = best.l; tdy = 26; while (tdy < 60 && wide(tl[0]) > chord(tdy)) tdy += 2; }
    }
    const tTop = tdy + (tl.length - 1) * 18;
    const big = r >= 80, mid = r >= 46, outside = m.atRoot && m.laidRoot && !big;   // a small outcome keeps its layer under; its name sits above
    // the layer under, drawn inside (simple at the top, more under)
    const inner = m.kidsOf(it.id);
    if ((big || outside) && inner.shown.length) {
      const list = inner.shown.map((id) => ({ id, size: N[id].parts }));
      if (inner.folded.length) list.push({ id: "~", size: Math.min(20, inner.folded.reduce((a, k) => a + N[k].parts, 0) * 0.4 + 3) });
      const top = outside ? 0 : tTop + 32, R = outside ? r * 0.78 : (r * 2 - top - 30) / 2, cy = outside ? y : y - r + top + R;
      for (const s of pack(list, R * 0.98, 6, 1, 1)) {
        const sx = x + s.x, sy = cy + s.y;
        if (s.id === "~") { add(g, el("circle", { cx: sx, cy: sy, r: s.r, style: "fill:var(--m-well)" })); continue; }
        POS[s.id] = { x: sx, y: sy, r: s.r };
        const ss = m.shade(s.id);
        add(g, el("circle", { cx: sx, cy: sy, r: s.r, style: "fill:var(--m-control)" }));
        if (ss > 0) add(g, el("circle", { cx: sx, cy: sy, r: s.r, style: `fill:var(--m-white);fill-opacity:${(0.03 + ss * 0.17).toFixed(3)}` }));
        add(g, rim(sx, sy, s.r, 0.12));
        if (kind === "change" && on("live") && m.ws(s.id).live) add(g, el("circle", { cx: sx, cy: sy, r: s.r + 2.5, class: "drift", style: `fill:none;stroke:${url(ID.jelly)};stroke-width:2` }));
        if (N[s.id].broken && showBroken) add(g, notch(sx - s.r * 0.7, sy - s.r * 0.7, 5));
        const stop = kind === "route" && stopAt(s.id) && N[s.id].short;   // a route stop keeps its rim free for its number; the rail names it in full
        if (s.r > 20) putText(g, circleText(sx, sy, s.r, stop || N[s.id].name, "", 11, 11, N[s.id].short, min), sx, "dim");
      }
    }
    const mk = m.markOf(it.id);
    if (big) {
      BOX.push([x - r * 0.75, y - r + tdy - 16, x + r * 0.75, y - r + tTop + 26]);
      tl.forEach((t, i) => add(g, el("text", { x, y: y - r + tdy + i * 18, "text-anchor": "middle", "font-size": F(15), "font-weight": 500, style: "fill:var(--m-ink)" }, t)));
      if (mk) add(g, el("text", { x, y: y - r + tTop + 20, "text-anchor": "middle", "font-size": F(14), "font-weight": 500, style: "fill:var(--m-dim);font-variant-numeric:tabular-nums" }, mk));
    } else if (outside) {
      // the name sits above its circle; it slides along its row, the least it must, until no other rim runs under it
      const hw = cw(n.name, 15) / 2 + 6, rect = (lx: number, dy: number): Box => [lx - hw, y - r - 42 + dy, lx + hw, y - r - 7 + dy];
      const clear = (lx: number, dy: number) => { const b = rect(lx, dy); return Object.entries(POS).every(([k, o]) => k === it.id || !o.r || Math.hypot(Math.max(b[0], Math.min(o.x, b[2])) - o.x, Math.max(b[1], Math.min(o.y, b[3])) - o.y) > o.r + 6) && !BOX.some((o) => b[0] < o[2] + 3 && b[2] > o[0] - 3 && b[1] < o[3] + 3 && b[3] > o[1] - 3); };
      let lx = x, dy = 0;
      find: for (let d = 0; d <= 200; d += 2) for (const v of [0, 2, 4]) for (const s_ of [1, -1]) if (clear(x + s_ * d, v)) { lx = x + s_ * d; dy = v; break find; }
      BOX.push(rect(lx, dy));
      add(g, el("text", { x: lx, y: y - r - 30 + dy, "text-anchor": "middle", "font-size": F(15), "font-weight": 500, style: "fill:var(--m-ink)" }, n.name));
      if (mk) add(g, el("text", { x: lx, y: y - r - 11 + dy, "text-anchor": "middle", "font-size": F(14), "font-weight": 500, style: "fill:var(--m-dim);font-variant-numeric:tabular-nums" }, mk));
    } else if (mid) {
      putText(g, circleText(x, y, r, n.name, mk, 12.5, 12, n.short, min), x, "ink");
    } else {
      add(g, el("text", { x, y: y - r - 20, "text-anchor": "middle", "font-size": F(12), "font-weight": 500, style: "fill:var(--m-ink)" }, fit(n.name, 130)));
      if (mk) add(g, el("text", { x, y: y + 4, "text-anchor": "middle", "font-size": F(12), "font-weight": 500, style: "fill:var(--m-dim);font-variant-numeric:tabular-nums" }, mk.split(" ")[0]));
    }
    if (outside) inner.shown.slice(0, 3).forEach((k, i) => {
      const mk2 = m.markOf(k), t = el("text", { x, y: y + r + 34 + i * 17, "text-anchor": "middle", "font-size": F(12.5), style: "fill:var(--m-dim)" });
      add(t, el("tspan", { style: "fill:var(--m-ink);font-weight:500" }, N[k].name));
      if (mk2 && mk2 !== "quiet") add(t, el("tspan", { style: "font-variant-numeric:tabular-nums" }, "  " + mk2));
      add(marks, t); BOX.push([x - 110, y + r + 20, x + 110, y + r + 30 + i * 17]);
    });
    if (n.broken && showBroken) add(marks, notch(x - r * 0.71, y - r * 0.71, big ? 9 : 7));
    if (kind === "change" && on("live") && w.live) add(g, el("circle", { cx: x, cy: y, r: r + 2, class: "drift", style: `fill:none;stroke:${url(ID.jelly)};stroke-width:2.5` }));
    const bi = badgeItems(m, it.id); if (bi.length) BOX.push([x - bi.length * 34, y + r - 13, x + bi.length * 34, y + r + 13]);
    add(marks, badges(m, x, y + r, bi, kind === "calls" ? "ask" : "pill", min));
    add(layer, g);
  }
  add(root, layer, marks);
  if (kind === "route") drawRoute(m, root, POS, LBL, min);
  drawPins(m, root, POS, BOX, min);
  return { root, pos: POS, folded, shown };
}

type Badge = { faces?: [string | null, string][]; text: string | number };
/** what a circle's bottom rim carries in this view: faces with counts (change, court), whose calls, which pairs */
export function badgeItems(m: Model, id: string): Badge[] {
  const n = m.N[id], w = m.ws(id), k = m.kind;
  if ((k === "change" || k === "court") && !m.on("people")) return [];
  if (k === "change" || k === "court") {
    const by: Badge[] = Object.entries(w.by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kk, v]) => ({ faces: [kk.split("|") as [string, string]], text: v }));
    if (n.alone && k === "change" && m.full) by.push({ faces: [[null, "alone"]], text: n.alone });
    return by;
  }
  if (k === "calls") {
    const byw: Record<string, number> = {};
    n.calls.map((c) => m.calls.get(c)).filter(Boolean).forEach((d) => (byw[d!.who] = (byw[d!.who] || 0) + 1));
    return Object.entries(byw).sort((a, b) => b[1] - a[1]).map(([p, v]) => ({ faces: m.persons.has(p) ? [[p, "hand"]] : [], text: v }));
  }
  if (k === "clashes") return Object.entries(n.prPairs).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kk, v]) => ({ faces: kk.split("+").map((p) => [p, "agent"] as [string, string]), text: v }));
  return [];
}
// a badge row sits on a circle's bottom rim: the kit's pill (control fill, rim, drop), faces and numbers inside
function badges(m: Model, x: number, y: number, items: Badge[], kind = "pill", min = 0): VNode {
  const g = el("g"); if (!items.length) return g;
  // a face's initial is its radius × 1.05: the faces grow with the words, so the initial is never under the floor either
  const fs = Math.max(min, 12.5), fr = Math.max(9, min / 1.05), h = Math.max(24, fs * 1.6, fr * 2 + 6);
  const parts = items.map((it) => ({ ...it, w: (it.faces?.length || 0) * (fr * 2 - 3) + (it.faces?.length ? fr : 0) + String(it.text).length * fs * 0.59 + 14 }));
  const Wd = parts.reduce((a, p) => a + p.w, 0) + (parts.length - 1) * 4;
  let cx = x - Wd / 2;
  for (const p of parts) {
    const yel = kind === "ask", gg = el("g", yel ? { transform: `rotate(-2 ${cx + p.w / 2} ${y})` } : {});
    add(gg, el("rect", { x: cx, y: y - h / 2, width: p.w, height: h, rx: yel ? 4 : h / 2, style: `fill:${yel ? "var(--m-ask)" : "var(--m-control)"};filter:${url(ID.stk)}` }));
    if (!yel) add(gg, el("path", { d: `M ${cx + 10} ${y - 11.5} H ${cx + p.w - 10}`, style: "stroke:var(--m-white);stroke-opacity:.12;stroke-width:1" }));
    let fx = cx + 5 + fr;
    (p.faces || []).forEach(([w_, how]) => { add(gg, face(m, fx, y, w_, how, fr)); fx += fr * 2 - 3; });
    add(gg, el("text", { x: fx + (p.faces?.length ? 0 : -6), y: y + fs * 0.36, "font-size": fs, "font-weight": 500, style: `fill:${yel ? "var(--m-deep)" : "var(--m-ink)"};font-variant-numeric:tabular-nums` }, p.text));
    add(g, gg); cx += p.w + 4;
  }
  return g;
}

// a pin: its number, then a few words of the decision; it sits on the rim, each at its own angle
const pinWide = (txt: string, fs: number) => 30 + txt.length * fs * 0.655;
function pinW(x: number, y: number, n: number, txt: string, left: boolean, fs = 11): VNode {
  const w = pinWide(txt, fs), x0 = left ? x - w + 11 : x - 11, h = Math.max(22, fs * 2);
  return add(el("g", { transform: `rotate(-3 ${x} ${y})`, "data-pin": n }),
    el("rect", { x: x0, y: y - h / 2, width: w, height: h, rx: 4, style: `fill:var(--m-ask);filter:${url(ID.stk)}` }),
    el("text", { x: x0 + 11, y: y + 5, "text-anchor": "middle", "font-size": Math.max(fs, 14), "font-weight": 700, style: "fill:var(--m-deep)" }, n),
    el("path", { d: `M ${x0 + 22} ${y - 7} V ${y + 7}`, style: "stroke:var(--m-deep);stroke-opacity:.3" }),
    el("text", { x: x0 + 27, y: y + fs * 0.36, "font-size": fs, "font-weight": 600, "font-family": "ui-monospace,SF Mono,Menlo,monospace", "letter-spacing": ".04em", style: "fill:var(--m-deep)" }, txt.toUpperCase()));
}
/** a pin's words in the Time window: a pin that counts changes recounts them for the scrubber's hours, and says which */
export function pinShort(m: Model, t: MapPin) {
  let short = t.short || "";
  if (t.count && m.kind === "change" && !m.full) {
    const { by, under } = t.count;
    const k = m.spec.changes.filter((c) => c.by === by && c.ago <= m.st.hours * 60 && c.parts.some((x) => m.chainOf(x).includes(under))).length;
    short = short.replace(/^\d+/, String(k)) + ` · ${m.st.hours} h`;
  }
  return short;
}
function drawPins(m: Model, root: VNode, POS: Scene["pos"], BOX: Box[], min = 0) {
  const fs = Math.max(min, 11);
  m.top.forEach((t, i) => {
    if (m.kind !== "court" && m.view.id !== t.view && !(m.kind === "change" && m.atRoot)) return;
    const id = t.at.find((a) => POS[a]) || Object.keys(POS).filter((k) => t.at.some((a) => m.chainOf(k).includes(a))).sort((a, b) => POS[b].r - POS[a].r)[0];
    if (!id) return;
    const short = pinShort(m, t);
    const p = POS[id], w = pinWide(short, fs);
    const hit = (b: Box) => BOX.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    let best: { x: number; y: number; left: boolean; b: Box } | null = null;
    for (const deg of [-45, -15, 15, 45, -75, -105, -135, 165, 135]) {   // around the rim, pointing outward, the first free spot
      const a = (deg * Math.PI) / 180, x = p.x + Math.cos(a) * p.r, y = p.y + Math.sin(a) * p.r, left = Math.cos(a) < 0;
      const b: Box = left ? [x - w + 11, y - 13, x + 11, y + 13] : [x - 11, y - 13, x + w - 11, y + 13];
      if (b[0] < 8 || b[2] > 992 || b[1] < 8 || b[3] > 580) continue;
      if (!hit(b)) { best = { x, y, left, b }; break; } best ||= { x, y, left, b };
    }
    if (!best) return; BOX.push(best.b);
    add(root, pinW(best.x, best.y, i + 1, short, best.left, fs));
  });
}
// the route, like directions: the steps numbered, through whatever holds each one (the steps are listed in the rail)
function drawRoute(m: Model, root: VNode, POS: Scene["pos"], LBL: Box[], min = 0) {
  const used: Record<string, number> = {};
  const P = m.stops.map(({ place, step }) => {
    const hit = m.chainOf(place).find((x) => POS[x]); if (!hit) return null;
    const c = POS[hit], k = (used[hit] = (used[hit] || 0) + 1) - 1, at_ = (d: number) => ({ x: c.x + Math.cos((d * Math.PI) / 180) * c.r, y: c.y + Math.sin((d * Math.PI) / 180) * c.r });
    const free = (q: { x: number; y: number }) => !LBL.some((o) => q.x + 12 > o[0] && q.x - 12 < o[2] && q.y + 12 > o[1] && q.y - 12 < o[3]);   // a stop never sits on a name
    const d = [0, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100, -120, 120, -140, 140, 180].map((o) => -60 + k * 38 + o).find((d_) => free(at_(d_))) ?? -60 + k * 38;
    return { ...at_(d), step, id: place };
  }).filter(Boolean) as { x: number; y: number; step: string; id: string }[];
  // a leg is straight when it crosses no name; else it bows to the side, the least it must, like a road around a town
  const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, cx: number, cy: number) => {
    for (let s = 0.04; s <= 0.96; s += 0.02) { const u = 1 - s, px = u * u * a.x + 2 * u * s * cx + s * s * b.x, py = u * u * a.y + 2 * u * s * cy + s * s * b.y; if (LBL.some((o) => px > o[0] - 7 && px < o[2] + 7 && py > o[1] - 7 && py < o[3] + 7)) return true; }
    return false;
  };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
    let c = [mx, my];
    for (let o = 0; o <= 160; o += 4) { if (!crosses(a, b, mx + nx * o, my + ny * o)) { c = [mx + nx * o, my + ny * o]; break; } if (!crosses(a, b, mx - nx * o, my - ny * o)) { c = [mx - nx * o, my - ny * o]; break; } }
    add(root, el("path", { d: `M ${a.x} ${a.y} Q ${c[0]} ${c[1]} ${b.x} ${b.y}`, style: "fill:none;stroke:var(--m-pearl);stroke-width:3;stroke-linecap:round;opacity:.85" }));
  }
  P.forEach((p, i) => {
    add(root, el("circle", { cx: p.x, cy: p.y, r: 9.5, style: `fill:var(--m-pearl);filter:${url(ID.stk)}`, "data-stop": i + 1 }));
    add(root, el("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", "font-size": Math.max(min, 11.5), "font-weight": 600, style: "fill:var(--m-deep)" }, i + 1));
    if (m.N[p.id]?.broken) add(root, notch(p.x + 10, p.y - 10, 6));
  });
}
/** the day as a clock: the view's hours in order round the dial, a broken one red, the focus place's broken count inside */
export function drawClock(m: Model): VNode {
  const cx = 80, cy = 80, R = 52, s = el("svg", { width: 300, height: 160, viewBox: "0 0 300 160" });
  const rows = m.view.clock ?? [];
  add(s, el("circle", { cx, cy, r: R, style: "fill:none;stroke:var(--m-flat);stroke-width:8" }));
  const hr = (t: string) => { const [h, mm] = t.split(":").map(Number); return h + (mm || 0) / 60; };
  const ang = (h: number) => ((h / 24) * 360 - 90) * (Math.PI / 180);
  const arc = (h1: number, h2: number, col: string) => {
    const a1 = ang(h1), a2 = ang(h2 < h1 ? h2 + 24 : h2);
    add(s, el("path", { d: `M ${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R} A ${R} ${R} 0 ${(h2 - h1 + 24) % 24 > 12 ? 1 : 0} 1 ${cx + Math.cos(a2) * R} ${cy + Math.sin(a2) * R}`, style: `fill:none;stroke:${col};stroke-width:8;stroke-linecap:round` }));
  };
  if (rows.length > 1) {
    const first = hr(rows[0].at), lastH = hr(rows[rows.length - 1].at);
    const bad = rows.map((r) => (r.state === "broken" ? hr(r.at) : null)).filter((h): h is number => h != null);
    let from = first;
    for (const b of bad) { arc(from, b, "var(--m-edge)"); arc(b, b + 1.2, "var(--m-wrong)"); from = b + 1.2; }
    arc(from, lastH, "var(--m-edge)");
  }
  rows.forEach((r, i) => {
    const y = 34 + i * 30;
    add(s, el("text", { x: 160, y, "font-size": 12, "font-weight": 500, style: "fill:var(--m-ink);font-variant-numeric:tabular-nums" }, r.at));
    add(s, el("text", { x: 200, y, "font-size": 12, style: "fill:var(--m-dim)" }, r.what));
    add(s, el("text", { x: 200, y: y + 14, "font-size": 11, style: `fill:${r.state === "broken" ? "var(--m-wrong)" : "var(--m-mute)"}` }, r.state));
  });
  const focus = m.view.focus ? m.N[m.view.focus] : undefined;
  add(s, el("text", { x: cx, y: cy - 2, "text-anchor": "middle", "font-size": 22, "font-weight": 500, style: "fill:var(--m-ink);font-variant-numeric:tabular-nums" }, focus?.broken ?? 0));
  add(s, el("text", { x: cx, y: cy + 15, "text-anchor": "middle", "font-size": 11, style: "fill:var(--m-dim)" }, "broken"));
  return s;
}

// ---- the words around it ----

export const ago = (mins: number) => (mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`);
/** a person's name; an agent's is "<name>'s agent" */
export const personName = (m: Model, p: string | null) => nameOf(m, p);
/** the view's little picture on its pill, by kind (a map's layer button shows terrain or transit) */
export const THUMB: Record<string, string> = {
  change: "linear-gradient(90deg,var(--m-set-1) 0 34%,var(--m-set-2) 34% 67%,var(--m-flat) 67%)",
  court: "radial-gradient(circle at 50% 50%,var(--m-ask) 0 4px,transparent 4.5px)",
  calls: "linear-gradient(var(--m-ask),var(--m-ask))",
  clashes: "radial-gradient(circle at 35% 50%,var(--m-set-1) 0 3.5px,transparent 4px),radial-gradient(circle at 65% 50%,var(--m-set-2) 0 3.5px,transparent 4px)",
  day: "conic-gradient(var(--m-wrong) 0 25%,var(--m-flat) 25%)",
  route: "linear-gradient(135deg,transparent 42%,var(--m-pearl) 42% 58%,transparent 58%)",
};
/** the scrubber's ticks: one per change in the whole window, where it falls, in its author's colour, filled by hand */
export const ticksOf = (m: Model) => m.spec.changes.map((c) => ({ left: 100 - (c.ago / (m.spec.window * 60)) * 100, colour: colourOf(m, c.by), hand: c.how === "hand", h: c.h }));
/** a still's address: #who=&view=&at=&open=&off=&type=&t= (pure both ways) */
export function readAddress(hash: string, spec: MapSpec, who0: string): MapState {
  const q = new URLSearchParams(hash.replace(/^#/, "").replace(/^map&?/, ""));
  const who = q.get("who") && spec.surface[q.get("who")!] ? q.get("who")! : who0;
  const order = spec.view_order[who] ?? spec.views.map((v) => v.id);
  const asked = q.get("view");
  const view = asked && spec.views.some((v) => v.id === asked) ? asked : spec.surface[who]?.default_view ?? order[0] ?? spec.views[0]?.id ?? "change";
  const at = q.get("at") && spec.places[q.get("at")!] ? q.get("at")! : "root";
  const t = Number(q.get("t") || spec.window);
  const type = spec.types.some((x) => x.id === q.get("type")) ? q.get("type")! : spec.types[0]?.id ?? "outcomes";
  const open = q.get("open");
  return { who, view, at, hours: Math.max(1, Math.min(spec.window, t || spec.window)), off: (q.get("off") || "").split(",").filter(Boolean), type, open: open && (spec.places[open] || open === "~fold") ? open : null };
}
export function writeAddress(st: MapState, spec: MapSpec) {
  const q = [`who=${st.who}`, `view=${st.view}`];
  if (st.at !== "root") q.push(`at=${st.at}`); if (st.off.length) q.push(`off=${st.off.join(",")}`);
  if (st.type !== (spec.types[0]?.id ?? "outcomes")) q.push(`type=${st.type}`); if (st.open) q.push(`open=${st.open}`); if (st.hours !== spec.window) q.push(`t=${st.hours}`);
  return "#" + q.join("&");
}
/** the person a login is, on this spec (the viewer's seat); the first person when the login is none of them */
export const seatOf = (spec: MapSpec, login: string) => spec.people.find((p) => p.kind === "person" && (p.logins ?? []).some((l) => l.toLowerCase() === login.toLowerCase()))?.id ?? spec.people.find((p) => p.kind === "person")?.id ?? "";
export const SET_COUNT = SET.length;

// ---- the map as a Cowork place (#1416): its path is the chain of places down to where you stand ----

/** where you stand, from the place's path (pure) */
export function stateOf(spec: MapSpec, path: string[], base: Omit<MapState, "at" | "open">, fold: boolean): MapState {
  const ids = path.filter((x) => spec.places[x]);
  const last = ids[ids.length - 1];
  if (!last) return { ...base, at: "root", open: fold ? "~fold" : null };
  if (spec.places[last].kids.length) return { ...base, at: last, open: fold ? "~fold" : null };
  return { ...base, at: spec.places[last].parent ?? "root", open: last };
}
/** the place's path for where you stand (pure): the chain from layer 1 down, and the open place when it has none under it */
export function pathOf(spec: MapSpec, st: MapState): string[] {
  const chain: string[] = []; let id: string | null = st.at;
  while (id && id !== "root" && spec.places[id]) { chain.unshift(id); id = spec.places[id].parent; }
  if (st.open && st.open !== "~fold" && spec.places[st.open] && !spec.places[st.open].kids.length) chain.push(st.open);
  return chain;
}
