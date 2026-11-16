// The browser block's child web view kept on its block (#699): where the app's view goes and whether it shows, from the
// block's body as the face draws it. Pure, so the face's tests reach it; the shell (thing.rs block_view_*, `clip`) cuts
// the rect to the stage's box. A child web view is drawn above the whole face, so it hides whenever the face must be
// seen over it: the block moving (a drag, a pour), something of the face lying on the body (another block above it, the
// ledger, a menu), or the stage not showing.
export type Box = { x: number; y: number; w: number; h: number };

/** the points the face looks at to see whether something lies on the body: its corners, 2px in, and its middle */
export function samples(b: Box): [number, number][] {
  const l = b.x + 2, t = b.y + 2, r = b.x + b.w - 2, d = b.y + b.h - 2;
  return [[l, t], [r, t], [l, d], [r, d], [b.x + b.w / 2, b.y + b.h / 2]];
}

export type ViewState = { show: boolean; at: Box; clip: Box };
/** the view's place: the body's box, cut by the shell to the stage's; shown only with nothing of the face on it */
export function viewOf(body: Box, stage: Box, o: { moving?: boolean; covered?: boolean; hidden?: boolean }): ViewState {
  const show = !o.hidden && !o.moving && !o.covered && body.w >= 1 && body.h >= 1 && stage.w >= 1 && stage.h >= 1;
  return { show, at: body, clip: stage };
}

/** whether the shell must be told again: the view moved half a pixel or more, or it showed or hid */
export function moved(a: ViewState | null, b: ViewState): boolean {
  if (!a || a.show !== b.show) return true;
  const d = (p: Box, q: Box) => Math.abs(p.x - q.x) >= 0.5 || Math.abs(p.y - q.y) >= 0.5 || Math.abs(p.w - q.w) >= 0.5 || Math.abs(p.h - q.h) >= 0.5;
  return d(a.at, b.at) || d(a.clip, b.clip);
}

/** an address typed in the bar, as the block keeps it: a bare host on this machine gets http, any other https */
export function addressOf(raw: string): string {
  const u = raw.trim();
  if (!u || /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(about|data):/i.test(u)) return u;
  return (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u) ? "http://" : "https://") + u;
}
/** an address as the bar shows it: no scheme, no trailing slash */
export const shownUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
