// The frame (Marco 2026-11-08: "a composer layer beneath it that follows all the UI mechanical rules, so you don't
// draw freehand"): the window's geometry as one set of numbers, every one derived, none typed twice.
// The Mac's own facts come from the window's config (src-tauri/tauri.conf.json): the title bar is an overlay, the
// traffic lights are drawn by macOS at `trafficLightPosition`. Apple's lights are 12px dots 8px apart. From those:
//   row   the title row: the lights' bottom plus one s2 of air; everything in it is centred on its middle
//   clear where the first control may start: the lights' right end plus the same inset they have on the left
//   spine the outer column of modes (52: one s2 each side of a 44 slot); its first `row` px are the Mac's
//   side  a mode's second layer; pane the third
// Every piece reads these as CSS vars set on #root by <Frame> (frame.css): --f-row, --f-clear, --f-spine, --f-side.
import conf from "../../src-tauri/tauri.conf.json";

const win = conf.app.windows[0];
export const MAC = { lights: { x: win.trafficLightPosition.x, y: win.trafficLightPosition.y, d: 12, gap: 8 }, minW: win.minWidth, minH: win.minHeight } as const;
const S1 = 4, S2 = 8;
export const FRAME = {
  row: MAC.lights.y + MAC.lights.d + S2,                                               // 44
  clear: MAC.lights.x * 2 + 3 * MAC.lights.d + 2 * MAC.lights.gap + S1,               // 88
  spine: 44 + S2,                                                                     // 52
  side: 264,
} as const;
/** what the head must pad on its left so its first word clears the lights, once the spine has taken its width */
export const headPad = (spine: boolean) => Math.max(FRAME.clear - (spine ? FRAME.spine : 0), S2);
export const frameVars = (spine: boolean): Record<string, string> => ({
  "--f-row": `${FRAME.row}px`, "--f-clear": `${FRAME.clear}px`, "--f-spine": `${spine ? FRAME.spine : 0}px`, "--f-side": `${FRAME.side}px`, "--f-head-pad": `${headPad(spine)}px`,
});
