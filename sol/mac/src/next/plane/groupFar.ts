// The infinite canvas at Far (BR1, #1615; three.html "An infinite canvas"; size.ts, group.ts): every folder card drawn
// whole (cull.ts) is held between its smallest and largest size, and cards that would then overlap are drawn as one
// group at their middle, ordered by cull's ladder (what needs the person first), its words group.ts's. A press on the
// group, or Enter, takes the camera to where its folders stand apart (one step, ⌘[ comes back). The answer is kept per
// version of the data and per zoom: a pan moves no card and joins none (C4), so it costs nothing. Cull's count line is
// held too: on a group it joins the group's words, on a card it goes under it. A group's card never covers today's page.
// ← → walk a group as one stop (farStep), ↩ on it is its press (stackAt, cv/moves/plane.ts).
// Written without JSX like cullFar, so the plane calls it the same way. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { cloneElement, createElement, type KeyboardEvent, type ReactElement } from "react";
import { D, S, dataVer, go, parentOf, regionOf } from "../cv/core.ts";
import { ladder, placesNow, type Place } from "./cull.ts";
import { GAP, apartZ, around, group, walk, type Group } from "./group.ts";
import { SIZE, held, type Rect } from "./size.ts";
import { roomUnder } from "./raise-state.ts";
import { DIARY, R_GAP, ZMAX, isOff, safe, viewSize } from "./layout.ts";

/** a group's card on screen, px: as wide as a card at its smallest and no wider than its members' span, as tall as a
 *  count line; its words wrap inside, never cut (the CSS lets it grow) */
const GROUP_W = 240, LINE_H = 44;

type Kept = { d: unknown; pos: unknown; dv: number; z: number; ids: string; q: Map<string, Rect>; of: Map<string, number>; gs: Group[]; at: Rect[]; room?: Map<string, number> };
let kept: Kept | null = null;

const near = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** the cards and their groups at zoom z, for the whole ones (`whole`, cull's answer); `at` is each group's card, plane units */
function groupsAt(whole: (id: string) => boolean, z: number): Kept {
  const ids = D.regions.filter((r) => D.pos?.[r.id] && !parentOf(r.id) && !isOff(r.id) && whole(r.id)).map((r) => r.id), key = ids.join("\n");
  if (kept && kept.d === D && kept.pos === D.pos && kept.dv === dataVer() && kept.z === z && kept.ids === key) return kept;
  const P = new Map<string, Place>(placesNow().map((p) => [p.id, p])), q = new Map<string, Rect>();
  const boxes = ids.map((id) => {
    // a folder folded to its tab is one line (its name and its state), held as a line, never widened to a card
    const b = held(D.pos![id], z, D.pos![id].folded ? "line" : "card");
    q.set(id, { x: b.x, y: b.y, w: b.w, h: b.h });
    return { id, r: { x: b.x * z, y: b.y * z, w: b.w * z, h: b.h * z }, name: regionOf(id)?.name ?? id, asks: P.get(id)?.asks ?? 0 };
  });
  const order = (a: { id: string }, b: { id: string }) => { const pa = P.get(a.id), pb = P.get(b.id); return pa && pb ? ladder(pa, pb) : 0; };
  const gs = group(boxes, order, GAP, "folders");
  // today's page is drawn at its own scale (plane/index.tsx #pl-dy) inside its zone: a group's card that would cover it
  // goes to the nearest side of it
  const pg = D.zones?.page && !isOff(DIARY) && !D.pos?.[DIARY]?.folded ? D.zones.page : null, g8 = GAP / z;
  const at = gs.map((g) => {
    const w = Math.max(SIZE.card.min, Math.min(GROUP_W, g.r.w)), h = Math.min(g.r.h, 2 * LINE_H);
    const r = { x: (g.r.x + (g.r.w - w) / 2) / z, y: (g.r.y + (g.r.h - h) / 2) / z, w: w / z, h: h / z };
    if (!pg || !near(r, pg)) return r;
    const off = [{ ...r, x: pg.x + pg.w + g8 }, { ...r, x: pg.x - r.w - g8 }, { ...r, y: pg.y + pg.h + g8 }, { ...r, y: pg.y - r.h - g8 }];
    return off.sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
  });
  kept = { d: D, pos: D.pos, dv: dataVer(), z, ids: key, q, of: new Map(gs.flatMap((g, i) => g.ids.map((id) => [id, i] as const))), gs, at };
  return kept;
}

/** a group's press: the camera on its folders, at the smallest zoom where they stand apart (the largest when none does),
 *  their middle at the middle of what the bars leave free, or the first of them when they do not fit there */
export function apart(g: Pick<Group, "ids">): void {
  const qs = g.ids.map((id) => D.pos?.[id]).filter((q): q is NonNullable<typeof q> => !!q);
  if (!qs.length) return;
  const z = apartZ(qs, "card", S.cam.z, ZMAX) ?? ZMAX, sa = safe("far"), { w, h } = viewSize();
  // all of them when they fit in what the bars leave free; otherwise the first, what needs the person most, the rest a pan away
  const all = around(qs.map((q) => held(q, z, "card"))), b = all.w * z <= w - sa.l - sa.r && all.h * z <= h - sa.t - sa.b ? all : held(qs[0], z, "card");
  go({ cam: { x: b.x + b.w / 2 - (sa.l - sa.r) / 2 / z, y: b.y + b.h / 2 - (sa.t - sa.b) / 2 / z, z } }, "group");
}

/** ← → at Far (cv/moves/plane.ts choose): `step` stops on from the place chosen (S.sel, in D.regions' order), each card
 *  drawn one stop and a group one stop, as last drawn; a card wholly under the bar is not shown (plane/index.tsx
 *  data-under) and is no stop till a pan lifts it */
export function farStep(sel: number, step: number): number {
  const n = D.regions.length, k = kept;
  if (!n || !k) return Math.max(0, sel + step);
  const under = new Set(typeof document === "undefined" ? [] : [...document.querySelectorAll<HTMLElement>("#pl .pl-card[data-under]")].map((e) => e.dataset.region));
  return walk(n, (i) => { const id = D.regions[i].id, g = k.of.get(id); return !k.q.has(id) || under.has(id) ? null : g == null ? id : "grp:" + g; }, sel, step);
}
/** the group the choice is on at Far (its press is ↩'s there), or null */
export function stackAt(sel: number): Group | null {
  const n = D.regions.length, g = n && kept ? kept.of.get(D.regions[sel % n].id) : undefined;
  return g == null ? null : kept!.gs[g];
}

/** the plane's one call at Far (plane/index.tsx), after cullFar: the groups go into `items`, and cull's count line is
 *  held there; answers whether a card is drawn alone (not in a group) and the box it is drawn at, held (plane units;
 *  the same object while the zoom holds), and the room under it for its raise, px (raise.ts roomUnder: the cards drawn
 *  alone and the groups' cards under it) */
export function groupFar(items: ReactElement[], whole: (id: string) => boolean, vis: (q: Rect) => Rect | null): { alone: (id: string) => boolean; at: (id: string) => Rect | undefined; room: (id: string) => number } {
  const z = S.cam.z, k = groupsAt(whole, z), more: string[] = k.gs.map(() => "");
  // cull's count line, held as a line and kept off what is drawn: on a group it is said by the group, on a card it goes under it
  const li = items.findIndex((e) => e.key === "cull");
  if (li >= 0) {
    const e = items[li] as ReactElement<{ style: { left: number; top: number; width: number }; children: string }>, s = e.props.style;
    let r = held({ x: s.left, y: s.top, w: s.width / z, h: LINE_H / z }, z, "line");
    const gi = k.at.findIndex((a) => near(a, r));
    if (gi >= 0) { more[gi] = ` · ${e.props.children}`; items.splice(li, 1); }
    else {
      const cards = [...k.q].filter(([id]) => !k.of.has(id)).map(([, q]) => q);
      for (let n = 0, hit; n < cards.length && (hit = cards.find((c) => near(c, r))); n++) r = { ...r, y: hit.y + hit.h + R_GAP };
      items[li] = cloneElement(e, { style: { ...s, left: r.x, top: r.y, width: +(r.w * z).toFixed(1) } });
    }
  }
  const { w: vw } = viewSize(), chosen = stackAt(S.sel);
  k.gs.forEach((g, i) => {
    const q = k.at[i];
    if (!vis(q)) return;
    // the choice's one Tab stop, as a folder card's (Folder.tsx): a group the choice is on takes it
    items.push(createElement("div", {
      key: "grp:" + g.ids[0], className: `pl-group${g.asks ? " pl-asks" : ""}${chosen === g ? " pl-sel" : ""}`, "data-group": i, "data-members": g.ids.length,
      role: "button", tabIndex: chosen === g ? 0 : -1, "aria-label": `${g.words}${more[i]}: show them apart`,
      onClick: () => apart(g),
      onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); apart(g); } },
      // under the plane's camera (#1633): at its place in the plane's units, at screen size, so a pan leaves it as it was
      style: { left: q.x, top: q.y, width: +Math.min(q.w * z, vw).toFixed(1), minHeight: +(q.h * z).toFixed(1), transform: `scale(${1 / z})` },
    }, createElement("b", { className: "pl-gn" }, `${g.ids.length} folders`), createElement("span", null, g.words + more[i])));
  });
  const room = (id: string): number => {
    const q = k.q.get(id);
    if (!q || k.of.has(id)) return Infinity;
    if (!k.room) k.room = new Map();
    let r = k.room.get(id);
    if (r == null) k.room.set(id, (r = roomUnder(q, [...[...k.q].filter(([o]) => o !== id && !k.of.has(o)).map(([, o]) => o), ...k.at], z)));
    return r;
  };
  return { alone: (id) => !k.of.has(id), at: (id) => k.q.get(id), room };
}
