// What Sol knows as one picture (BR1 meta layer part 2, #1615; the drawing: mine/look/br1/meta-loop.html scene 7, "the
// circle is your Mac"): pure, so the tests read it and the view only draws what it says. From next.you and the room it
// is given: the Mac as a circle; each place a disc inside it sized by its share of the person's time, with its dial;
// "You" in the middle with what is about the person everywhere (how Sol talks, what they are here for); each fact a chip
// in its place with a thread to where Sol learned it, on the rim; Claude outside, crossed only when the person lets it.
// Nothing here is made up and nothing is fixed to one person's places: they all come from next.you.
// Signed: marcocyl04-ux's agent (builder F).
import { DIAL, dialOf } from "./model.ts";
import { kindOfKnown, type Box, type Kind } from "./lens-state.ts";
import { TALK_W, forgettable, ofPart, ofYou, type Known } from "../../known.ts";
import type { Level, Part, Question, You } from "./types.ts";

/** each source: its words, its dot, where it sits on the rim (degrees, 0 is right, 90 down); the same at every size */
export const KIND: Record<Kind, { w: string; c: string; a: number }> = {
  calendar: { w: "Your calendar", c: "#5b8def", a: -90 },
  chats: { w: "Your AI chats", c: "#9b6bdc", a: 0 },
  told: { w: "You told Sol", c: "#e08a3c", a: 90 },
  noticed: { w: "Sol noticed", c: "#3fb07a", a: 180 },
  mac: { w: "Your Mac", c: "#3a97a6", a: -145 },
  read: { w: "What Sol read", c: "#6d7fa8", a: -35 },
  learned: { w: "An AI learned it", c: "#d0679b", a: 35 },
};
/** the dial in one glyph */
export const GLYPH = ["◔", "◑", "●"] as const;
export const dialGlyph = (l: Level | null | undefined) => `${GLYPH[dialOf(l)]} ${DIAL[dialOf(l)].w.toLowerCase()}`;
/** the dial under a place's name in the circle: its glyph and the caption's first words ("◔ looks", "◑ prepares", "● does
 *  it for you"); the caption beside says the rest, the aria all of it */
export const dialShort = (l: Level | null | undefined) => dialGlyph(l).split(",")[0];

export type Chip = {
  id: string; w: string; full: string; kind: Kind; k?: string; stale?: boolean; from: string;
  place: string | null;   // the place's id; null: about the person, everywhere
  x: number; y: number; wd: number;   // its centre and width
  more?: number;          // "N more": the place's other facts, said in the panel
};
export type Disc = { id: string; name: string; share: number | null; level: Level | null; x: number; y: number; r: number; small: boolean; words: Words; ly: number; i: number; box: Box };
/** where a place's words sit: on its disc when they fit inside it; else beside it (the disc on their left) or, in a tight
 *  room, under it; never printed across the disc's edge (BR1 first-timer 06:48) */
export type Words = "on" | "beside" | "under";
export type Rim = { kind: Kind; x: number; y: number; lx: number; ly: number; anchor: "start" | "middle" | "end" };
export type Picture = {
  w: number; h: number; cx: number; cy: number; R: number;
  you: { x: number; y: number; r: number };
  discs: Disc[]; chips: Chip[]; rim: Rim[];
  threads: { chip: string; kind: Kind; d: string }[];
  claude: Box | null;    // none while the read runs (circleOf's outside)
  fits: boolean;          // every place and chip inside the Mac without covering another
};

const CH = 22, STEP = 27, HEAD = 52, GAP = 10;   // a chip's height, from one to the next, and a place's words above its chips
/** a chip's width, from all its words (the view's font: 11.5px, semibold); a chip is never cut short */
export const chipW = (w: string) => Math.round(w.length * 6.6 + 30);
const overlap = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** a Known as a chip, before it is placed: its id is the fact's k; k is kept only when the engine can forget it */
export const chipOf = (f: Known, w = f.fact): Omit<Chip, "x" | "y" | "wd"> =>
  ({ id: f.k, w, full: f.fact, kind: kindOfKnown(f), ...(forgettable(f.k) ? { k: f.k } : {}), ...(f.stale ? { stale: true } : {}), from: f.source, place: f.place });
/** what Sol knows about the person everywhere, not of a place (known.ts ofYou): how Sol talks, what they're here for */
export function aboutYou(y: Mac | null): Omit<Chip, "x" | "y" | "wd">[] {
  return ofYou(y).map((f) => chipOf(f, f.k === "talk" && y?.talk ? TALK_W[y.talk.style] : f.fact));
}

/** the sources a set of facts came from, in the rim's order, each once (the badge's dots) */
export const kindsOf = (ks: readonly Known[]): Kind[] => {
  const have = new Set(ks.map(kindOfKnown));
  return (Object.keys(KIND) as Kind[]).filter((k) => have.has(k));
};
/** a count of facts, the one wording of the badge and the circle (the BR1 words pass; "Sol knows N" read unclear) */
const nFacts = (n: number) => `${n} fact${n === 1 ? "" : "s"}`;
/** a source's words inside a sentence: "your AI chats", "Sol noticed" */
const midWords = (w: string) => (w.startsWith("Sol") ? w : w[0].toLowerCase() + w.slice(1));
/** what a place's badge says (w, then the dial's glyph when asked), and read aloud: its name short, what it opens
 *  (Jev read "Sol knows N things in …" unclear at 0.99), the sources and the dial after it; none when nothing is known
 *  there (never a zero). A narrow place shows w only (known.css); the aria and the circle still say the rest. o.n: the
 *  count said when it is not ks's own (a folder card says what its opened folder lists, folder/knows.ts) */
export function badgeOf(ks: readonly Known[], o: { level?: Level | null; label?: string; n?: number } = {}): { n: number; kinds: Kind[]; w: string; short: string; dial: string | null; aria: string; desc: string } | null {
  const n = o.n ?? ks.length;
  if (!n) return null;
  const kinds = kindsOf(ks), lv = o.level !== undefined;
  return {
    n, kinds, w: `${nFacts(n)} about this folder`, short: nFacts(n), dial: lv ? GLYPH[dialOf(o.level)] : null,
    aria: `Show ${n} fact${n === 1 ? "" : "s"} the AI knows${o.label ? ` about ${o.label}` : ""}`,
    desc: [kinds.length ? `From ${kinds.map((k) => midWords(KIND[k].w)).join(", ")}` : "", lv ? `AIs here ${dialGlyph(o.level).slice(2)}` : ""].filter(Boolean).join("; "),
  };
}

/** what the circle reads of next.you: its places and questions, and what is about the person (none while it is read) */
export type Mac = Pick<You, "parts" | "questions"> & Partial<Pick<You, "talk">>;
export type Placed = { part: Part; i: number };   // i: the part's place in next.you (its colour)
/** the places the circle draws, in next.you's order, the dropped ones out; a place under 1% of the person folds into
 *  "and N more" until that is opened (a rule on share, never a count), unless a question is about it or every place is
 *  that small. Folded is only drawn so: the place is still set up */
export const SMALL = 0.01;
export function placesOf(y: Mac | null, dropped: ReadonlySet<string>, more: boolean): { shown: Placed[]; small: Placed[] } {
  if (!y) return { shown: [], small: [] };
  const asked = new Set(y.questions.map((q) => q.at));
  const all = y.parts.map((part, i) => ({ part, i })).filter((r) => !dropped.has(r.part.id));
  const small = all.filter((r) => r.part.share != null && r.part.share < SMALL && !asked.has(r.i));
  return more || small.length === all.length ? { shown: all, small: [] } : { shown: all.filter((r) => !small.includes(r)), small };
}
/** the questions under the circle: every one once, in next.you's order (n: its place there, sent back with the answer);
 *  one about a place taken out leaves with it */
export const asksOf = (y: Mac | null, dropped: ReadonlySet<string>): (Question & { n: number })[] =>
  (y?.questions ?? []).map((q, n) => ({ ...q, n })).filter((q) => q.at == null || !dropped.has(y!.parts[q.at]?.id ?? ""));
/** the places as the read finds them (next.you.reading's shapes), before next.you comes: a share and a name, nothing known yet */
export const forming = (places: readonly { id: string; name: string; share: number }[]): Mac => ({
  questions: [],
  parts: places.map((p) => ({ id: p.id, name: p.name, share: p.share, tools: [], ais: 0, level: null, faded: false, new: false, at: [], from: [], facts: 0, knows: [] })),
});

/** the picture in a room w wide and at least h tall: the least height from h (by 20) in which every place and chip fits,
 *  for a room that scrolls (the move-in's screen); up to the height where the Mac stops growing (its width holds it), and
 *  the room's own height when none fits */
export function fitOf(y: Mac | null, o: Parameters<typeof circleOf>[1]): Picture {
  const first = circleOf(y, o), top = first.w + 20 - (o.outside === false ? 0 : 236);
  for (let h = first.h + 20; !first.fits && h <= top; h += 20) { const p = circleOf(y, { ...o, h }); if (p.fits) return p; }
  return first;
}

/** the picture in a room w×h (same input, same answer). outside: Claude's box beside the Mac (off while the read runs,
 *  where the room is one column); facts: the chips in the places (off while the read runs: the places are still moving) */
export function circleOf(y: Mac | null, o: { w: number; h: number; dropped?: ReadonlySet<string>; more?: boolean; levels?: Record<string, Level>; outside?: boolean; facts?: boolean }): Picture {
  const outside = o.outside !== false, withFacts = o.facts !== false, least = outside ? 320 : 240;   // the least room: one column holds the Mac alone
  const w = Math.max(least, o.w), h = Math.max(least, o.h);
  // the Mac: as big as the room allows, with Claude's box and the arrow to it on the right, under the rim's "Your AI chats"
  const side = outside ? 236 : 0, R = Math.max(outside ? 130 : 100, Math.floor(Math.min((h - 44) / 2, (w - side - 24) / 2)));
  const cx = Math.round(12 + R + Math.max(0, (w - side - 24 - 2 * R) / 2)), cy = Math.round(30 + R + Math.max(0, (h - 44 - 2 * R) / 2));
  const claude: Box | null = outside ? { x: cx + R + 92, y: cy + 44, w: 132, h: 52 } : null;

  // You, in the middle: how Sol talks, what the person is here for
  const youChips = aboutYou(y);
  const youCap = 3, you = { x: cx, y: cy - 18, r: Math.round(Math.min(28, R * 0.11)) };
  const shownYou = youChips.length > youCap ? youChips.slice(0, youCap - 1) : youChips;
  const chips: Chip[] = shownYou.map((c, i) => ({ ...c, x: cx, y: cy + 30 + i * STEP, wd: chipW(c.w) }));
  if (youChips.length > youCap) chips.push({ id: "you:more", w: `${youChips.length - shownYou.length} more`, full: "", kind: "told", from: "", place: null, x: cx, y: cy + 30 + shownYou.length * STEP, wd: chipW(`${youChips.length - shownYou.length} more`), more: youChips.length - shownYou.length });
  const youBox: Box = (() => {
    const ws = [you.r * 2, ...chips.map((c) => c.wd)], wd = Math.max(...ws), bottom = chips.length ? chips[chips.length - 1].y + CH / 2 : you.y + you.r;
    return { x: cx - wd / 2, y: you.y - you.r, w: wd, h: bottom - (you.y - you.r) };
  })();

  // the places (placesOf: the small ones only once "and N more" is open), largest first
  const { shown: cards } = placesOf(y, o.dropped ?? new Set(), !!o.more);
  // no share (nothing read to say it): every place the same size, none called small
  const wt = (p: Part) => p.share ?? 1;
  const rows = [...cards].sort((a, b) => wt(b.part) - wt(a.part));

  // the rim: a node per source anything here came from; a node and its words are kept clear like You is
  const rimAt = (k: Kind): Rim => {
    const a = (KIND[k].a * Math.PI) / 180, x = cx + (R - 24) * Math.cos(a), y = cy + (R - 24) * Math.sin(a);
    const c = Math.cos(a), s = Math.sin(a);
    return { kind: k, x: Math.round(x), y: Math.round(y), lx: Math.round(x - c * 20), ly: Math.round(y - s * 22 + (Math.abs(s) < 0.5 ? 4 : 0)), anchor: c > 0.5 ? "end" : c < -0.5 ? "start" : "middle" };
  };
  const rimBox = (r: Rim): Box => {
    const lw = KIND[r.kind].w.length * 6.3 + 4, lx = r.anchor === "end" ? r.lx - lw : r.anchor === "start" ? r.lx : r.lx - lw / 2;
    const x0 = Math.min(r.x - 12, lx), x1 = Math.max(r.x + 12, lx + lw), y0 = Math.min(r.y - 12, r.ly - 12), y1 = Math.max(r.y + 12, r.ly + 4);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const top = Math.max(0.0001, ...rows.map((r) => wt(r.part)));
  let scale = 1, discs: Disc[] = [], placeChips: Chip[] = [], fits = false;
  for (let attempt = 0; attempt < 8 && !fits; attempt++) {
    const rMax = R * 0.3 * scale, rMin = R * 0.13 * scale;
    const plan = rows.map((row, n) => {
      const p = row.part, small = p.share != null && p.share < 0.01;
      const r = small ? Math.max(9, R * 0.04) : Math.round(rMin + (rMax - rMin) * Math.sqrt(wt(p) / top));
      // the last two tries, when even one "N facts" each still overlaps (nine places at 852×734, BR1 conform row 8): no chip
      // on any place, its name, share and dial only; its facts are one press away, in its panel
      const facts = small || !withFacts || attempt >= 6 ? [] : ofPart(p);
      // fewer chips as the room shrinks; in the smallest, one "N more" per place (the panel says them all)
      const cap = small || attempt >= 5 ? 0 : Math.max(1, Math.min(r > R * 0.24 ? 4 : r > R * 0.18 ? 3 : 2, Math.floor((2 * r - 34) / STEP) + 1) - (attempt >= 2 ? 1 : 0) - (attempt >= 4 ? 1 : 0));
      const shown = facts.length > cap ? facts.slice(0, cap > 1 ? cap - 1 : cap) : facts;
      const more = facts.length - shown.length, moreW = shown.length ? `${more} more` : nFacts(more);
      // its words: the name (13px), under it the share, then the dial (10px; the widest dial words, so a press never moves it); while it is read, the name only
      const head = small ? Math.round(p.name.length * 6.6 + 14) : !withFacts ? Math.round(p.name.length * 8.2 + 14) : Math.round(Math.max(p.name.length * 8.2, "100% of your time".length * 5.4, "● does it for you".length * 5.4) + 14);
      const wds = [...shown.map((f) => chipW(f.fact)), ...(more ? [chipW(moreW)] : []), head];
      const lines = shown.length + (more ? 1 : 0);
      const headH = small ? 0 : HEAD;
      // its words (Words): on its disc when they fit inside it, set down from its top to where the disc is as wide as they
      // are; else beside it, wider by the disc; from the fourth try, when the room is tight, under it, taller by the disc.
      // Only the forming circle's last tries, in a column too short for any other (338×268), keep a name on its disc as before
      const tall = withFacts ? HEAD - 6 : 20, inset = head < 2 * r ? Math.ceil(r - Math.sqrt(r * r - (head / 2) ** 2)) + 2 : r;
      const onIt = small || 2 * inset + tall <= 2 * r || (!withFacts && attempt >= 5);
      const words: Words = onIt ? "on" : attempt < 3 ? "beside" : "under";
      const side = words === "beside" ? 2 * r + GAP : 0, drop = words === "under" ? 2 * r + 4 : words === "on" && !small && 2 * inset + tall <= 2 * r ? inset - 2 : 0;
      const body = (lines ? headH : words === "under" ? (withFacts ? HEAD : 18) : 0) + lines * STEP;
      const fw = side + Math.max(words === "beside" ? 0 : 2 * r, ...wds), fh = small ? 2 * r + 22 : words === "under" && !withFacts ? 2 * r + 28 : Math.max(2 * r, drop + body + 8);
      // BR1 scope (d), nothing over text: the footprint holds the words as drawn, so a place clear of the others is clear of
      // their dots and words too: a small place's name 2px under its disc, 14px tall and 2px each way (you.css .yk-place.small b); a
      // name alone under its disc (the forming circle) 6px under it, 16px and 2px each way
      return { row, n, p, r, small, words, side, drop, shown, more, moreW, fw, fh };
    });
    const kindsNow = new Set<Kind>([...chips.filter((c) => !c.more).map((c) => c.kind), ...plan.flatMap((q) => q.shown.map(kindOfKnown))]);
    const fixed: Box[] = [youBox, ...[...kindsNow].map((k) => rimBox(rimAt(k)))];
    // a first place for each: around You, the largest at the top left, each taking a slice of the ring by its size
    const ring = R * 0.52, total = plan.reduce((a, q) => a + q.fw + 24, 0) || 1;
    let ang = -Math.PI * 0.75;
    const at = plan.map((q) => { const span = (2 * Math.PI * (q.fw + 24)) / total; const a = ang + span / 2; ang += span; return { x: cx + ring * Math.cos(a), y: cy + ring * Math.sin(a) * 0.92 }; });
    // then apart: each footprint pushed off the others and off You, and kept inside the Mac and the room
    const fp = (i: number): Box => ({ x: at[i].x - plan[i].fw / 2, y: at[i].y - plan[i].r, w: plan[i].fw, h: plan[i].fh });
    const inside = (i: number) => {
      const b = fp(i), lim = R - 34;
      for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
        if (d > lim) { const k = (d - lim) / d; at[i].x -= dx * k * 0.6; at[i].y -= dy * k * 0.6; }
      }
    };
    for (let it = 0; it < 320; it++) {
      let moved = false;
      for (let i = 0; i < plan.length; i++) {
        for (let j = i + 1; j < plan.length; j++) {
          const a = fp(i), b = fp(j);
          if (!overlap(a, b, 8)) continue;
          moved = true;
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 8, oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + 8;
          if (ox < oy) { const s = (a.x + a.w / 2 < b.x + b.w / 2 ? -1 : 1) * ox / 2; at[i].x += s; at[j].x -= s; }
          else { const s = (a.y + a.h / 2 < b.y + b.h / 2 ? -1 : 1) * oy / 2; at[i].y += s; at[j].y -= s; }
        }
        for (const f of fixed) {
          const a = fp(i);
          if (!overlap(a, f, 10)) continue;
          moved = true;
          const ox = Math.min(a.x + a.w, f.x + f.w) - Math.max(a.x, f.x) + 10, oy = Math.min(a.y + a.h, f.y + f.h) - Math.max(a.y, f.y) + 10;
          if (ox < oy) at[i].x += a.x + a.w / 2 < f.x + f.w / 2 ? -ox : ox; else at[i].y += a.y + a.h / 2 < f.y + f.h / 2 ? -oy : oy;
        }
        inside(i);
      }
      if (!moved && it > 4) break;
    }
    // what is still stuck (between the rim and You, say) goes to the free spot nearest where it was, largest first
    const inMac = (b: Box) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([px, py]) => Math.hypot(px - cx, py - cy) <= R - 6);
    const settled: Box[] = [];
    for (let i = 0; i < plan.length; i++) {
      const free = (b: Box) => inMac(b) && !fixed.some((f) => overlap(b, f, 6)) && !settled.some((c) => overlap(b, c, 4));
      let b = fp(i);
      if (!free(b)) {
        let best: { x: number; y: number; d: number } | null = null;
        for (let gy = cy - R; gy <= cy + R; gy += 10) for (let gx = cx - R; gx <= cx + R; gx += 10) {
          const c = { x: gx - b.w / 2, y: gy - plan[i].r, w: b.w, h: b.h }, d = Math.hypot(gx - at[i].x, gy - at[i].y);
          if ((!best || d < best.d) && free(c)) best = { x: gx, y: gy, d };
        }
        if (best) { at[i] = { x: best.x, y: best.y }; b = fp(i); }
      }
      settled.push(b);
    }
    const boxes = plan.map((_, i) => fp(i));
    const clear = boxes.every((b, i) => !fixed.some((f) => overlap(b, f, 6)) && boxes.every((c, j) => j <= i || !overlap(b, c, 4)));
    fits = clear && boxes.every(inMac);
    discs = plan.map((q, i) => ({ id: q.p.id, name: q.p.name, share: q.p.share, level: o.levels?.[q.p.id] ?? q.p.level, x: Math.round(at[i].x - (q.words === "beside" ? q.fw / 2 - q.r : 0)), y: Math.round(at[i].y), r: q.r, small: q.small, words: q.words, ly: Math.round(q.small ? at[i].y + q.r + 2 : at[i].y - q.r + 2 + q.drop), i: q.row.i, box: boxes[i] }));
    placeChips = plan.flatMap((q, i) => {
      const y0 = Math.round(at[i].y - q.r + q.drop + HEAD + CH / 2), left = at[i].x - q.fw / 2 + q.side;
      // beside its disc, the chips start where the words do; on it or under it, they stand under its middle
      const x = (wd: number) => Math.round(q.words === "beside" ? left + wd / 2 : at[i].x);
      const cs: Chip[] = q.shown.map((f, j) => ({ ...chipOf(f), x: x(chipW(f.fact)), y: y0 + j * STEP, wd: chipW(f.fact) }));
      if (q.more) cs.push({ id: `${q.p.id}:more`, w: q.moreW, full: "", kind: "read", from: "", place: q.p.id, x: x(chipW(q.moreW)), y: y0 + q.shown.length * STEP, wd: chipW(q.moreW), more: q.more });
      return cs;
    });
    scale *= 0.86;
  }
  const all = [...chips, ...placeChips];

  // the rim: only the sources something came from
  const kinds = [...new Set(all.filter((c) => !c.more).map((c) => c.kind))];
  const rim: Rim[] = kinds.map(rimAt);
  const rimOf = new Map(rim.map((r) => [r.kind, r]));
  const threads = all.filter((c) => !c.more).map((c) => {
    const r = rimOf.get(c.kind)!, x = c.x - c.wd / 2 + 11, y = c.y;
    const qx = (x + r.x) / 2 + (cy - y) * 0.15, qy = (y + r.y) / 2 + (x - cx) * 0.1;
    return { chip: c.id, kind: c.kind, d: `M${x} ${y} Q ${Math.round(qx)} ${Math.round(qy)} ${r.x} ${r.y}` };
  });
  return { w, h, cx, cy, R, you, discs, chips: all, rim, threads, claude, fits };
}
