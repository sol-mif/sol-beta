// A glyph (#764, ui.md Components, ui.html (f)): one set for every act on a block's head, every source and every kind of
// block, drawn once on a 20 grid with a 2 px stroke and round ends, set in a 24 px box. The paths are ui.html's own,
// ported as they are (its `G`), never redrawn. Acts are glyphs, always there at mute, dim on hover; never words that
// appear on hover. Size, grid and stroke are tokens.json's palette.glyph; the colour is the on colour at mute or dim.
import { createElement, useState } from "react";
import { dim, mute } from "./paint";
import { GLYPH, TIMED } from "./tokens";

/** ui.html's paths, each on the 20 grid; constants, never anything typed by a person */
const PATHS = {
  // acts: on a block's head
  hold: '<path d="M6 4H4v12h2M14 4h2v12h-2"/><path d="M10 8v4"/>',
  fold: '<path d="M5 9l5-4 5 4"/><path d="M5 15h10"/>',
  freeze: '<path d="M10 3v14M4 6.5l12 7M4 13.5l12-7"/>',
  focus: '<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  pin: '<path d="M10 13v4"/><path d="M7 3h6l-1 4 3 4H5l3-4z"/>',
  pop: '<path d="M9 4H4v12h12v-5"/><path d="M12 3h5v5M17 3l-7 7"/>',
  // sources
  calendar: '<rect x="3.5" y="5" width="13" height="11.5" rx="3"/><path d="M3.5 9h13M7 3v3.5M13 3v3.5"/>',
  mail: '<rect x="3" y="5" width="14" height="10.5" rx="3"/><path d="M4 6.5l6 5 6-5"/>',
  files: '<path d="M3.5 6.5a2 2 0 0 1 2-2h3l2 2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/>',
  github: '<circle cx="6" cy="5" r="1.6"/><circle cx="6" cy="15" r="1.6"/><circle cx="14" cy="6.5" r="1.6"/><path d="M6 6.6v6.8M14 8.1c0 3.4-8 2.2-8 5.3"/>',
  canvas: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="6.2" r=".6"/><circle cx="10" cy="13.8" r=".6"/><circle cx="6.2" cy="10" r=".6"/><circle cx="13.8" cy="10" r=".6"/>',
  web: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c-3 4-3 10 0 14M10 3c3 4 3 10 0 14"/>',
  messages: '<path d="M4 5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3a1.5 1.5 0 0 1-1-1.5z"/>',
  // kinds: what a block is
  page: '<path d="M5.5 3h6l3.5 3.5V17h-9.5z"/><path d="M8 10h4.5M8 13h4.5"/>',
  list: '<path d="M8.5 6h8M8.5 10h8M8.5 14h8"/><circle cx="4.5" cy="6" r=".5"/><circle cx="4.5" cy="10" r=".5"/><circle cx="4.5" cy="14" r=".5"/>',
  stills: '<rect x="3" y="4.5" width="14" height="11" rx="2.5"/><path d="M3.5 13.5l4-3.5 3 2.5 2-1.5 4 3"/><circle cx="13" cy="8" r=".8"/>',
  diff: '<path d="M10 3.5v6M7 6.5h6M7 15h6"/>',
  terminal: '<rect x="3" y="4" width="14" height="12" rx="2.5"/><path d="M6.5 8l2.5 2-2.5 2M11 12.5h3"/>',
  run: '<path d="M6.5 4.5l9 5.5-9 5.5z"/>',
  browser: '<rect x="3" y="4" width="14" height="12" rx="2.5"/><path d="M3 7.5h14"/><circle cx="5.5" cy="5.8" r=".3"/>',
  note: '<path d="M4 4h12v7.5L11.5 16H4z"/><path d="M11.5 16v-4.5H16"/>',
} as const;

export type GlyphName = keyof typeof PATHS;
/** the 22, in ui.html's three sets, each with what it means (its caption there) */
export const GLYPH_SETS: readonly { title: string; glyphs: readonly (readonly [GlyphName, string])[] }[] = [
  { title: "acts: on a block's head", glyphs: [["hold", "keep it from changing"], ["fold", "to its head"], ["freeze", "keep as is, versioned"], ["focus", "fill the stage"], ["close", "off the stage; ⌘Z"], ["pin", "to the notch"], ["pop", "into its own window"]] },
  { title: "sources", glyphs: [["calendar", "Calendar"], ["mail", "Mail"], ["files", "Files"], ["github", "GitHub"], ["canvas", "Canvas"], ["web", "the web"], ["messages", "Messages"]] },
  { title: "kinds: what a block is", glyphs: [["page", "page"], ["list", "list"], ["stills", "stills"], ["diff", "diff"], ["terminal", "terminal"], ["run", "run"], ["browser", "browser"], ["note", "note"]] },
];
export const GLYPHS = Object.keys(PATHS) as GlyphName[];

/** the glyph's colour (pure): `hover` set holds it (true dim, false mute); unset, the pointer decides (`over`) */
export const glyphColour = (hover: boolean | undefined, over: boolean) => ((hover ?? over) ? dim : mute);

/** a glyph at 24, mute at rest and dim under the pointer; `hover` set holds it at dim or at mute, unset follows the pointer */
/** `color` sets its ink for a holder on another ground (the rail on cream); otherwise the glyph's own grey, lit on hover */
export function Glyph({ name, hover, title, color }: { name: GlyphName; hover?: boolean; title?: string; color?: string }) {
  const [over, setOver] = useState(false), pad = (GLYPH.size - GLYPH.grid) / 2;
  // one element, written without JSX so the engine's tests (tsx, their own tsconfig) load it as the face's build does
  return createElement("svg", {
    "data-glyph": name,
    width: GLYPH.size,
    height: GLYPH.size,
    viewBox: `${-pad} ${-pad} ${GLYPH.size} ${GLYPH.size}`,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: GLYPH.stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: title ? "img" : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
    onPointerEnter: () => setOver(true),
    onPointerLeave: () => setOver(false),
    style: { display: "block", flex: "none", color: glyphColour(hover, over), ...(color ? { color } : {}), transition: `color ${TIMED.turn}ms ease-out` },
    // ui.html's own markup, a constant above: ported, not redrawn
    dangerouslySetInnerHTML: { __html: PATHS[name] },
  });
}
