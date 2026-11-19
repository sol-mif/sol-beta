// The map's look, read from the kit's tokens (sol/design/system/tokens.json) the way the answer key's build.mjs read them
// (#1433): the five depths, the on-colour's strengths, the colour set, the meaning colours, the pearl and its nacre.
// Each is a variable on the map's root, `--m-<name>`, beside palette.css's scale (--s*, --t-*, --h-*, --r-*); change a
// token and the map follows. The colours here are the tokens' own, never typed.
import tokens from "../../../../design/system/tokens.json" with { type: "json" };

const P = (tokens as any).palette;
const S = P.system, on = P.shade.on, f = P.functional;
const white = (a: number) => `rgb(255 255 255 / ${a})`;
const drop = ([a, y, b]: number[]) => (a ? `0 ${y}px ${b}px rgb(0 0 0 / ${a})` : "none");

/** the colour set, six, in the order a person's `set` picks from */
export const SET: string[] = P.sets[P.sets.default].six;
export const PEARL: string = P.material.colour.pearl.value;
export const DEEP: string = P.material.colour.deep.value;
const pearlHue: number = P.looks.pearl.takes[P.looks.pearl.pick].hue;
/** the nacre's stops: the pearl mixed with each colour of the set (the SVG gradient of "yours") */
export const NACRE_STOPS = SET.map((c) => `color-mix(in srgb, ${PEARL} ${Math.round((1 - pearlHue) * 100)}%, ${c})`);
/** the jelly's stops: the set as it is (the ring of a place that moved in the last 3 h) */
export const JELLY_STOPS = SET;

const vars: Record<string, string> = {
  "--m-ground": DEEP, "--m-deep": DEEP, "--m-pearl": PEARL,
  "--m-well": S.depth.well.fill, "--m-card": S.depth.card.fill, "--m-control": S.depth.control.fill, "--m-lifted": S.depth.lifted.fill,
  "--m-rim-card": white(S.depth.card.rim), "--m-rim-control": white(S.depth.control.rim), "--m-rim-lifted": white(S.depth.lifted.rim),
  "--m-drop-card": drop(S.depth.card.shadow), "--m-drop-control": drop(S.depth.control.shadow), "--m-drop-lifted": drop(S.depth.lifted.shadow), "--m-drop-sticker": drop(S.depth.sticker.shadow),
  "--m-tilt": `${S.depth.sticker.tilt}deg`, "--m-r-sticker": `${S.shape.sticker.radius}px`,
  "--m-ink": white(on.ink), "--m-dim": white(on.dim), "--m-mute": white(on.mute), "--m-line": white(on.line), "--m-edge": white(on.edge), "--m-flat": white(on.flat),
  "--m-white": white(1),
  "--m-ask": f.yellow.soft, "--m-wrong": f.red.soft, "--m-done": f.green.soft,
  "--m-font": P.font.value, "--m-font-display": P.font.display.value, "--m-display-weight": String(P.font.display.weight), "--m-display-track": `${P.font.display.tracking}em`,
  "--m-nacre": `linear-gradient(${P.jelly.angle}deg, ${NACRE_STOPS.map((c, i) => `${c} ${Math.round((i / 5) * 100)}%`).join(", ")})`,
  // the colour set, by the place a person's `set` picks
  "--m-set-0": SET[0], "--m-set-1": SET[1], "--m-set-2": SET[2], "--m-set-3": SET[3], "--m-set-4": SET[4], "--m-set-5": SET[5],
};

/** the variables as a React style for the map's root */
export const MAP_VARS = vars as Record<string, string>;
