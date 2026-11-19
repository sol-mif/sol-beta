// Build becomes yours (#1089): the look of a kept piece's page on the stage. A block's page is HTML in a frame, so it
// cannot draw with the kit; this is the kit's tokens copied in by hand (sol/design/system/tokens.json: shade.on, the
// steps of the one black, curve.radius, type) and nothing else. No colour of its own, no gradient: what is lit in the
// face (the jelly's wash, the pearl's nacre) stays in the face; here a button is raised glass and lifts.
// The page is drawn at the piece's own width (s 232, m 288, l 344: Made.tsx MADE_W) at the frame's top left, at the
// kit's sizes in px, never scaled with the frame; the block's head already says its title, so the page has no h1.
// No color-scheme of its own: the stage frame is "normal", and a dark page in it is painted on an opaque slab.
export const MADE_W = { s: 232, m: 288, l: 344 } as const;
export const PAGE_CSS = `
:root{--on:235 235 232;--ink:rgb(var(--on)/.92);--dim:rgb(var(--on)/.55);--mute:rgb(var(--on)/.32);--line:rgb(var(--on)/.06);--edge:rgb(var(--on)/.10);--lift:rgb(var(--on)/.07);--card:rgb(0 0 0/.25);--raised:rgb(0 0 0/.40);--box:rgb(0 0 0/.55)}
*{box-sizing:border-box}
body{margin:0;padding:16px;font:400 13px/20px -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"Helvetica Neue",sans-serif;color:var(--dim);-webkit-font-smoothing:antialiased;background:transparent}
.piece{width:var(--w,288px);max-width:100%}
.f{display:flex;align-items:center;gap:8px;height:36px;padding:0 14px;margin-bottom:8px;border-radius:14px;background:var(--card);box-shadow:inset 0 0 0 1px var(--edge)}
.f:focus-within{background:var(--box)}
.f span{flex:none;min-width:52px;font-size:11px;color:var(--mute)}
.f .nx{flex:none;font-style:normal;font-size:11px;color:var(--mute)}
.f input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--ink);font:inherit}
.go{height:30px;padding:0 15px;margin-top:4px;border:0;border-radius:12px;background:var(--raised);box-shadow:inset 0 0 0 1px var(--edge);color:var(--ink);font:500 13px/20px inherit;font-family:inherit;cursor:default}
.go:hover{background:var(--lift)}.go:active{transform:scale(.97)}
.go:focus-visible,.row:focus-visible{outline:1px solid var(--dim);outline-offset:2px}
html{height:100%}body{min-height:100%;box-sizing:border-box;display:grid;place-content:center}
.row{display:flex;align-items:center;gap:10px;width:calc(100% + 16px);height:34px;margin:0 -8px;padding:0 12px;border:0;border-radius:12px;background:none;color:var(--dim);font:inherit;text-align:left;cursor:default}
.row:hover{background:var(--line);color:var(--ink)}
.row b{flex:1;min-width:0;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row i{flex:none;font-style:normal;font-size:11px;color:var(--mute)}
.say{margin:0 0 12px;font-size:15px;line-height:24px;color:var(--ink)}
.brief{margin:0 0 12px;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
@media (prefers-reduced-motion:reduce){.go:active{transform:none}}
`;
