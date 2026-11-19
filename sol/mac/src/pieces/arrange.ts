// Build mode as one space of pieces (mine, 2026-11-12): everything right of the two sidebars is one space. What was said
// (the talk), where you type (the box) and each thing Sol makes (an artifact) are pieces of it, and one rule arranges
// them all. An arrangement is columns of stacks, with at most one piece across the foot: pieces are tiles, so two never
// overlap and no room is left unused. The session names what leads (the talk while you read, an artifact while it is
// made, shown or asked about) and `rule` gives the arrangement for it; a piece moved by the hand is an edit of the same
// arrangement (`move`, `widen`) that is kept until it is let go. `place` turns an arrangement into boxes. Pure: no
// React, no DOM, so the engine's half (`stage.set`, #1067) can name the same arrangement.
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
/** a column: its pieces top to bottom; `w` is set only by the hand (a seam dragged) */
export type Col = { ids: string[]; w?: number };
/** how the chat stands when it gives its column to the artifacts: on the box across the foot, as its last line, its
 *  last lines, or as much as a question to you takes. It is never off the space */
export type Tail = "line" | "lines" | "asks";
export type Layout = { cols: Col[]; foot?: string; tail?: Tail };
export type Drop = { foot: true } | { before: number } | { col: number; at: number };

export const TALK = "talk", BOX = "box";
/** the space's margin and the gap between two pieces; the strip of names; where the talk reads best and its floor */
export const PAD = 12, GAP = 12, NAMES = 28, READ = 720, FLOOR = 360, COL_MIN = 240, ROW_MIN = 120;
/** under this width the space is one column */
export const NARROW = 700;
/** the least an artifact is wide when two columns of them stand side by side */
export const SIDE_BY = 480;
/** a column of only these kinds never grows past NARROW_KIND: a list or a card reads no better wider */
const SLIM = new Set(["list", "card"]), SLIM_W = 440;
/** what such a column may take of room nothing else asks for: its long lines are no longer cut */
const SLIM_MAX = 560;
/** as many artifacts as stand open at once; the rest are put away by name */
export const OPEN_MAX = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isArt = (id: string) => id !== TALK && id !== BOX;
export const shown = (l: Layout): string[] => [...l.cols.flatMap((c) => c.ids), ...(l.foot ? [l.foot] : []), ...(l.tail ? [TALK] : [])];
/** the condensed chat's height: one line; a few lines; a question with its answers */
export const LINE = 36;
export const tailH = (h: number, t: Tail): number => (t === "line" ? LINE : t === "lines" ? clamp(Math.round(h * 0.2), 120, 200) : clamp(Math.round(h * 0.36), 200, 360));
/** the chat condensed: it and the box leave the columns, the box goes across the foot and the chat stands on it. With
 *  nothing else on the space there is nothing to give room to, and the arrangement stays as it is */
export function condense(l: Layout, tail: Tail): Layout {
  const cols = l.cols.map((c) => ({ ...c, ids: c.ids.filter((x) => x !== TALK && x !== BOX) })).filter((c) => c.ids.length);
  return cols.length && l.foot !== TALK ? { cols, foot: BOX, tail } : l;
}

/** the session's arrangement: `open` the artifacts standing open in reading order (OPEN_MAX at most), `lead` the piece
 *  the work is about (TALK or an artifact), `large` one piece taken large, `empty` nothing said yet. The chat is always
 *  on the space, in the form the rest leaves room for: its column while it reads beside the artifacts; condensed on the
 *  box (`Tail`) when one piece is taken large, when the space is too small for both, or when the hand asked (`talk`
 *  false). `asks`: the chat ends on a question to you, so a condensed chat shows it whole. `more`: the hand opened the
 *  one line to a few */
export function rule(space: Size, open: string[], lead: string, o: { talk?: boolean; large?: string | null; empty?: boolean; asks?: boolean; more?: boolean } = {}): Layout {
  const arts = open.slice(0, OPEN_MAX), head = arts.includes(lead) ? lead : arts[0], W = space.w - 2 * PAD;
  const tail = (t: Tail): Tail => (o.asks ? "asks" : t === "line" && o.more ? "lines" : t);
  if (o.large && o.large !== BOX) return { cols: [{ ids: [o.large] }], foot: BOX, ...(o.large === TALK || o.empty ? {} : { tail: tail("line") }) };
  // nothing said and nothing made: the box alone
  if (!arts.length) return { cols: [{ ids: o.empty ? [BOX] : [TALK, BOX] }] };
  if (o.talk === false) return { cols: artCols(W, arts, head), foot: BOX, tail: tail("line") };
  // a small space holds one thing: the chat while it leads; else what leads, over the chat's last lines
  if (space.w < NARROW) return lead === TALK ? { cols: [{ ids: [TALK, BOX] }] } : { cols: [{ ids: [head] }], foot: BOX, tail: tail("lines") };
  // an artifact that leads is never left too narrow to read by the chat beside it: the chat gives way to its last lines
  const room = W - talkW(space.w, lead) - GAP;
  if (lead !== TALK && room < SIDE_BY) return { cols: artCols(W, arts, head), foot: BOX, tail: tail("lines") };
  return { cols: [{ ids: [TALK, BOX] }, ...artCols(room, arts, head)] };
}

/** the artifacts' columns in the room left for them: one; two side by side when both still read, else stacked; three as
 *  the leading one beside the other two */
function artCols(room: number, arts: string[], head: string): Col[] {
  const rest = arts.filter((a) => a !== head);
  if (arts.length === 1) return [{ ids: arts }];
  // two columns only where both still read; else the one that leads over one other, and a third waits by name
  return room >= 2 * SIDE_BY + GAP ? [{ ids: [head] }, { ids: rest }] : [{ ids: [head, rest[0]] }];
}

/** the talk's width beside artifacts: where it reads while it leads, its floor while an artifact does */
export function talkW(w: number, lead: string): number {
  const W = w - 2 * PAD;
  return Math.round(lead === TALK ? clamp(0.46 * W, Math.min(400, W), READ) : clamp(0.3 * W, Math.min(FLOOR, W), 440));
}

/** the arrangement as boxes. `boxH` is the box's own height (it is as tall as what is typed), `names` whether the strip
 *  of put-away names is drawn, `kinds` each artifact's kind, `lead` what leads (the wider column, the taller cell) */
export function place(l: Layout, space: Size, o: { boxH: number; lead?: string; names?: boolean; kinds?: Record<string, string> }): { rects: Record<string, Rect>; seams: { i: number; x: number }[]; names: Rect | null } {
  const W = space.w - 2 * PAD, rects: Record<string, Rect> = {}, lead = o.lead ?? TALK;
  const footH = l.foot ? (l.foot === BOX ? o.boxH : Math.max(ROW_MIN, Math.round(space.h * 0.3))) : 0;
  // the condensed chat stands on the box with no gap, as it does in a column
  // (and never so tall that the stack over it falls under its least height)
  const deep = Math.max(1, ...l.cols.map((c) => c.ids.length)), least = Math.ceil((deep > 1 ? deep + 0.5 : 1) * ROW_MIN) + (deep - 1) * GAP + (o.names ? NAMES : 0);
  const th = l.tail && l.foot === BOX ? Math.max(LINE, Math.min(tailH(space.h, l.tail), space.h - 2 * PAD - footH - GAP - least)) : 0;
  const bottom = space.h - PAD - (l.foot ? footH + GAP : 0) - th;
  const n = l.cols.length, home = (c: Col) => c.ids.includes(TALK) || c.ids.includes(BOX);
  // widths: a column the hand set keeps its width; the talk's column takes the talk's; the rest share what is left, the
  // leading one a half more, a column of lists and cards no wider than it reads
  const room = W - GAP * (n - 1), ws: (number | null)[] = l.cols.map((c) => (c.w ? clamp(c.w, COL_MIN, room - COL_MIN * (n - 1)) : null));
  l.cols.forEach((c, i) => { if (ws[i] === null && home(c) && n > 1) ws[i] = Math.min(talkW(space.w, lead), room - COL_MIN * (n - 1)); });
  // one column: the talk's width, and a list or a card stacked in it keeps to that width too; any other artifact takes the space
  if (n === 1 && home(l.cols[0]) && l.cols[0].ids.filter(isArt).every((id) => SLIM.has(o.kinds?.[id] ?? ""))) ws[0] = Math.min(READ, W);
  const share = (c: Col) => (c.ids.includes(lead) && n > 2 ? 1.6 : 1);
  let left = room - ws.reduce<number>((s, w) => s + (w ?? 0), 0);
  const flex = l.cols.map((_, i) => (ws[i] === null ? i : -1)).filter((i) => i >= 0), capped: number[] = [];
  // slim columns first take their cap, the others what remains
  for (const i of flex) {
    const c = l.cols[i], slim = c.ids.every((id) => SLIM.has(o.kinds?.[id] ?? "")), others = flex.filter((j) => ws[j] === null && j !== i);
    const total = others.reduce((s, j) => s + share(l.cols[j]), share(c)), fair = (left * share(c)) / total;
    if (slim && fair > SLIM_W) { ws[i] = SLIM_W; left -= SLIM_W; capped.push(i); }
  }
  const open = flex.filter((i) => ws[i] === null), total = open.reduce((s, i) => s + share(l.cols[i]), 0);
  for (const i of open) ws[i] = Math.max(COL_MIN, Math.floor((left * share(l.cols[i])) / total));
  if (!open.length && n > 1 && left > 0 && !l.cols.some((c) => c.ids.every((id) => SLIM.has(o.kinds?.[id] ?? "")))) ws[n - 1] = (ws[n - 1] ?? 0) + left;
  // more asked for than there is (many columns set by the hand): every column gives in proportion
  const asked = ws.reduce<number>((s, w) => s + (w ?? 0), 0);
  if (asked > room) ws.forEach((w, i) => { ws[i] = Math.floor(((w ?? 0) * room) / asked); });
  // room no column asked for is not left as margin while a piece would read better with it: the talk first, up to where
  // it reads best, then the lists and cards, up to SLIM_MAX
  let spare = room - ws.reduce<number>((s, w) => s + (w ?? 0), 0);
  const t = l.cols.findIndex((c) => c.ids.includes(TALK) && !c.w);
  if (spare > 0 && n > 1 && t >= 0 && ws[t]! < READ) { const g = Math.min(spare, READ - ws[t]!); ws[t] = ws[t]! + g; spare -= g; }
  for (const [k, i] of capped.entries()) { const g = Math.max(0, Math.min(Math.floor(spare / (capped.length - k)), SLIM_MAX - ws[i]!)); ws[i] = ws[i]! + g; spare -= g; }
  const used = ws.reduce<number>((s, w) => s + (w ?? 0), 0) + GAP * (n - 1);
  // what the columns do not use is split to both sides: the pieces stand together in the middle
  let x = PAD + Math.max(0, Math.round((W - used) / 2));
  const x0 = x;
  const seams: { i: number; x: number }[] = [];
  // the names stand under the artifacts; with the talk alone, under it
  const alone = !l.cols.some((c) => !home(c));
  let nx = Infinity, nr = 0;
  l.cols.forEach((c, i) => {
    const w = ws[i]!, lower = o.names && (alone || !home(c)) ? NAMES : 0, H = bottom - PAD - lower;
    if (lower) { nx = Math.min(nx, x); nr = Math.max(nr, x + w); }
    const box = c.ids.includes(BOX) ? o.boxH : 0, rest = c.ids.filter((id) => id !== BOX);
    // the box stands against the talk with no gap: they read as one column
    const gaps = rest.length - 1 + (box && rest.length && !(rest[rest.length - 1] === TALK && c.ids[c.ids.length - 1] === BOX) && !(c.ids[0] === BOX && rest[0] === TALK) ? 1 : 0);
    const parts = rest.reduce((s, id) => s + (id === lead && rest.length > 1 ? 1.5 : 1), 0), free = H - box - GAP * Math.max(0, gaps);
    // the box alone (a new session) stands a little above the middle
    let y = n === 1 && c.ids.length === 1 && c.ids[0] === BOX ? Math.max(PAD, Math.round(H * 0.42 - box / 2)) : PAD;
    c.ids.forEach((id, j) => {
      const h = id === BOX ? box : Math.max(ROW_MIN, Math.floor((free * (id === lead && rest.length > 1 ? 1.5 : 1)) / parts));
      rects[id] = { x, y, w, h };
      const next = c.ids[j + 1], snug = (id === TALK && next === BOX) || (id === BOX && next === TALK);
      y += h + (snug ? 0 : GAP);
    });
    if (i < n - 1) seams.push({ i, x: x + w });
    x += w + GAP;
  });
  // the box across the foot is as wide as what stands over it (never under where it reads), so it shares their margins
  const fw = l.foot === BOX ? Math.min(W, Math.max(used, Math.min(READ, W))) : W;
  if (l.foot) rects[l.foot] = { x: l.foot === BOX ? Math.max(PAD, Math.round(x0 + used / 2 - fw / 2)) : PAD, y: bottom + GAP + th, w: fw, h: footH };
  if (th) rects[TALK] = { ...rects[BOX], y: bottom + GAP, h: th };
  return { rects, seams, names: o.names && nr > nx ? { x: nx, y: bottom - NAMES, w: nr - nx, h: NAMES } : null };
}

const without = (l: Layout, id: string): Layout => ({ cols: l.cols.map((c) => ({ ...c, ids: c.ids.filter((x) => x !== id) })).filter((c) => c.ids.length), ...(l.foot && l.foot !== id ? { foot: l.foot } : {}), ...(l.tail && id !== TALK && id !== BOX ? { tail: l.tail } : {}) });

/** the box is never left a column to itself by another piece's leaving: it goes under the talk, or across the foot */
function tidy(l: Layout): Layout {
  const lone = l.cols.findIndex((c) => c.ids.length === 1 && c.ids[0] === BOX);
  if (l.cols.length < 2 || lone < 0) return l;
  const cols = l.cols.filter((_, i) => i !== lone), t = cols.findIndex((c) => c.ids.includes(TALK));
  if (t >= 0) return { ...l, cols: cols.map((c, i) => (i === t ? { ...c, ids: c.ids.flatMap((x) => (x === TALK ? [TALK, BOX] : [x])) } : c)) };
  return l.foot ? l : { cols, foot: BOX };
}

/** a piece moved by the hand: across the foot, as a new column, or into a column's stack. What stood at the foot goes
 *  back to the first column's end */
export function move(l: Layout, id: string, to: Drop): Layout {
  const next = put(l, id, to);
  // the condensed chat stands on the box: the box moved off the foot takes the chat with it, as a column's pair again
  if (id === BOX && l.tail) return next.foot === BOX ? { ...next, tail: l.tail } : { ...next, cols: next.cols.map((c) => ({ ...c, ids: c.ids.flatMap((x) => (x === BOX ? [TALK, BOX] : [x])) })) };
  return id === BOX ? next : tidy(next);
}
function put(l: Layout, id: string, to: Drop): Layout {
  if ("foot" in to) {
    const was = l.foot && l.foot !== id ? l.foot : null, next = without(l, id);
    const cols = was ? next.cols.map((c, i) => (i === 0 ? { ...c, ids: [...c.ids, was] } : c)) : next.cols;
    return { cols: cols.length ? cols : [{ ids: [was ?? id] }], foot: id };
  }
  if ("before" in to) {
    const mark = l.cols[to.before], next = without(l, id), at = mark ? next.cols.findIndex((c) => c.ids.some((x) => mark.ids.includes(x))) : -1;
    const cols = [...next.cols]; cols.splice(at < 0 ? (to.before <= 0 ? 0 : cols.length) : at, 0, { ids: [id] });
    return { ...next, cols };
  }
  const target = l.cols[to.col]; if (!target) return l;
  const after = target.ids.slice(0, to.at).filter((x) => x !== id), next = without(l, id);
  const ci = next.cols.findIndex((c) => c.ids.some((x) => target.ids.includes(x)));
  if (ci < 0) return { ...next, cols: [...next.cols, { ids: [id] }] };
  const ids = [...next.cols[ci].ids]; ids.splice(after.length, 0, id);
  return { ...next, cols: next.cols.map((c, i) => (i === ci ? { ...c, ids } : c)) };
}

/** a seam dragged: the column on its left takes that width; the one on its right gives or takes the difference */
export function widen(l: Layout, i: number, w: number): Layout {
  return { ...l, cols: l.cols.map((c, j) => (j === i ? { ...c, w: Math.round(w) } : j === i + 1 ? { ids: c.ids } : c)) };
}

/** an artifact the session opens into an arrangement the hand holds: on the shortest stack that is not the talk's, or
 *  a column of its own */
export function add(l: Layout, id: string): Layout {
  if (shown(l).includes(id)) return l;
  const arts = l.cols.map((c, i) => ({ c, i })).filter(({ c }) => !c.ids.includes(TALK) && !c.ids.includes(BOX));
  if (!arts.length) return { ...l, cols: [...l.cols, { ids: [id] }] };
  const to = arts.reduce((a, b) => (b.c.ids.length < a.c.ids.length ? b : a));
  return { ...l, cols: l.cols.map((c, i) => (i === to.i ? { ...c, ids: [...c.ids, id] } : c)) };
}
/** every piece stands once: a second mention of a piece is dropped, and a column left empty by that goes */
export function once(l: Layout): Layout {
  const seen = new Set<string>(l.foot ? [l.foot] : []);
  const cols = l.cols.map((c) => ({ ...c, ids: c.ids.filter((id) => !seen.has(id) && (seen.add(id), true)) })).filter((c) => c.ids.length);
  return cols.length === l.cols.length && cols.every((c, i) => c.ids.length === l.cols[i].ids.length) ? l : tidy({ ...l, cols });
}
export const drop = (l: Layout, id: string): Layout => (id === BOX ? l : tidy(without(l, id)));

/** an arrangement the hand holds, kept true to what stands open now: an artifact no longer open (put away, closed) leaves
 *  it, one opened since (made by the session, brought back) is added; the talk and the box are the hand's alone */
export function keep(l: Layout, open: readonly string[]): Layout {
  let next = l;
  for (const id of shown(l)) if (isArt(id) && !open.includes(id)) next = drop(next, id);
  for (const id of open) next = add(next, id);
  return next;
}

/** where a piece carried to (x, y) would land, read against the boxes as they stood when it was picked up (so the
 *  ground does not shift under the hand): the space's foot, a column's side, or the upper or lower half of a piece */
export function dropAt(l: Layout, rects: Record<string, Rect>, space: Size, id: string, x: number, y: number): Drop | null {
  // every band is a share of the space or of the piece under the hand, so it reads the same on a laptop and on a wide screen
  const edge = Math.max(24, space.w * 0.05);
  if (y > space.h * 0.9 && (id === BOX || (id === TALK && !l.tail))) return { foot: true };
  // the condensed chat is carried out of the foot: nothing is aimed at until the hand is up among the columns
  if (l.tail && id === TALK && y > Math.max(0, ...l.cols.flatMap((c) => c.ids).map((p) => (rects[p] ? rects[p].y + rects[p].h : 0)))) return null;
  if (x < edge) return { before: 0 };
  if (x > space.w - edge) return { before: l.cols.length };
  for (let ci = 0; ci < l.cols.length; ci++) for (let at = 0; at < l.cols[ci].ids.length; at++) {
    const pid = l.cols[ci].ids[at], r = rects[pid];
    if (!r || pid === id || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    const side = r.w * 0.3;
    if (x < r.x + side) return { before: ci };
    if (x > r.x + r.w - side) return { before: ci + 1 };
    return { col: ci, at: y < r.y + r.h / 2 ? at : at + 1 };
  }
  // over no piece (the margins beside the columns, a gap between two, the room under a short column): no place is dead.
  // Past the outer columns is the side; a gap is between its two columns; over or under a column is its top or its end
  const span = l.cols.map((c) => c.ids.map((p) => rects[p]).filter(Boolean)).map((rs) => (rs.length ? { a: Math.min(...rs.map((r) => r.x)), b: Math.max(...rs.map((r) => r.x + r.w)), top: Math.min(...rs.map((r) => r.y)) } : null));
  const first = span.find(Boolean), last = [...span].reverse().find(Boolean);
  if (!first || !last) return null;
  const own = (ci: number) => l.cols[ci].ids.length === 1 && l.cols[ci].ids[0] === id;
  if (x < first.a) return own(0) ? null : { before: 0 };
  if (x > last.b) return own(l.cols.length - 1) ? null : { before: l.cols.length };
  for (let ci = 0; ci < span.length; ci++) {
    const s = span[ci]; if (!s) continue;
    if (x < s.a) return { before: ci };
    if (x <= s.b) return own(ci) || l.cols[ci].ids.includes(id) ? null : { col: ci, at: y < s.top ? 0 : l.cols[ci].ids.length };
  }
  return null;
}
