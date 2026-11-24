// Your own pieces, the people (round 6 · M3, #1615; merge/pieces.js PEOPLE, from missing/customize.html): the panel's
// people only, fixture data, never a real Sol's. `at` is the folder the canvas draws the piece in. A proposal's mockup is
// a still compare, Sol's against yours (rows), then the checks; one that fails names its rule and one way that passes.
// Bloom's colours are drawn with the next set's accents (the visual pass redoes them). Signed: marcocyl04-ux's agent,
// port slice 12 (#1615).

/** one piece of the person's own: stands in for one of Sol's (`for`), by name */
export type Piece = {
  id: string; n: string; for: string; st: "in" | "remade" | "aside"; at: string | null;
  small?: string; why?: string; last?: string; back?: string;
};
/** a row of a proposal's still compare: a key or a time with its words, a heading, or a folder with its colours */
export type Row = { t?: string; b?: string; mine?: boolean; hl?: string; sw?: string; sws?: string[] };
/** a check: passes or not, its words, its small line */
export type Check = [boolean, string, string];
export type Ask = {
  re: RegExp; say: string; for: string; add: Omit<Piece, "for" | "st">;
  sols: Row[]; yours: Row[]; checks: Check[]; seen: string;
  alt?: { say: string; yours: Row[]; checks: Check[] };
};
export type Person = { pieces: Piece[]; ask: Ask };

const R = (t: string, b?: string, mine?: boolean): Row => ({ t, b, mine });

export const PEOPLE: Record<string, Person> = {
  Dev: {
    pieces: [
      { id: "rk", n: "Review keys", for: "Diff keys", st: "remade", at: "api", why: "Sol 2.4 gave its diff its own a and r. Yours used them for approve and reject, so I remade yours on j, k and y, n.", last: "j k a r, from 2 October" },
      { id: "ship", n: "/ship", for: "Commands", st: "in", at: "api", small: "runs the repo’s release script, then opens the pull request" },
      { id: "board", n: "Repo board", for: "Folder view, in Build", st: "in", at: "web", small: "one column per repo, the open pull requests first" },
    ],
    ask: {
      re: /(key|shortcut).*ship|ship.*(key|shortcut)/i, say: "a key that runs /ship in the repo I’m in", for: "Command keys",
      add: { id: "shipkey", n: "⌘⇧S for /ship", at: "api", small: "runs /ship in the repo you are in" },
      sols: [R("⌘K", "open moves"), R("⌘↩", "send"), R("⌘⇧P", "pull request")],
      yours: [R("⌘K", "open moves"), R("⌘↩", "send"), R("⌘⇧P", "pull request"), R("⌘⇧S", "/ship in this repo", true)],
      checks: [[true, "Stands in for Sol’s Command keys, by name", "Only this one piece of Sol’s changes."], [true, "⌘⇧S is free", "Nothing of Sol’s or yours uses it."], [true, "Reads nothing new", "/ship already runs in your repos."], [true, "Back to Sol’s is one press", "In Settings › Your own pieces, kept for good."]],
      seen: "⌘⇧S runs /ship here. It stands in for Sol’s Command keys.",
    },
  },
  Denise: {
    pieces: [{ id: "quiet", n: "Quiet Sundays", for: "What reaches you, on Sundays", st: "in", at: "kids", small: "only the kids folder reaches you on Sundays" }],
    ask: {
      re: /mia.*(top|first)|(top|first).*mia/i, say: "Mia’s things at the top in the morning", for: "Morning order",
      add: { id: "miafirst", n: "Mia first", at: "kids", small: "Mia’s things come first each morning" },
      sols: [{ hl: "Thursday morning" }, R("7:00", "School email: trip form"), R("9:30", "Work draft: section 2"), R("15:00", "Mia’s dentist")],
      yours: [{ hl: "Thursday morning" }, R("15:00", "Mia’s dentist", true), R("7:00", "School email: trip form"), R("9:30", "Work draft: section 2")],
      checks: [[true, "Stands in for Sol’s Morning order, by name", "Only the morning page changes; the rest keeps Sol’s order."], [true, "Mia is in your kids folder", "So I know which things are hers."], [true, "Reads nothing new", ""], [true, "Back to Sol’s is one press", ""]],
      seen: "Mia’s things come first each morning. It stands in for Sol’s Morning order.",
    },
  },
  "Min-ji": {
    pieces: [
      { id: "btype", n: "Bloom’s type", for: "Type, in the studio folder", st: "aside", at: "studio", why: "Sol 2.4 changed how its type sizes are named, and yours pointed at the old names. Rather than half-apply it, I set it aside.", back: "Brought back on 2.4’s sizes. Checked: every page in the folder still reads." },
      { id: "client", n: "Client words", for: "How Sy writes, in the studio folder", st: "in", at: "studio", small: "Bloom’s style sheet: short lines, no exclamation marks" },
      { id: "figma", n: "Frames beside the copy", for: "The page view, in the studio folder", st: "in", at: "studio", small: "the Figma frame sits beside each section of copy" },
    ],
    ask: {
      re: /bloom.*colou?r|colou?r.*bloom/i, say: "the studio folder in Bloom’s colours, the rest left as it is", for: "Folder colours",
      add: { id: "bloomcol", n: "Bloom’s colours", at: "studio", small: "the studio folder only" },
      sols: [{ sw: "lav", b: "studio: Bloom site" }, { sw: "mint", b: "life" }],
      yours: [{ sw: "pink", b: "studio: Bloom site", mine: true, sws: ["pink", "cream", "sea"] }, { sw: "mint", b: "life" }],
      checks: [[true, "Stands in for Sol’s Folder colours, for one folder", "Your other folders keep Sol’s."], [true, "Words still read on it", "Every text on the pink passes the contrast check."], [true, "Reads nothing new", ""], [true, "Back to Sol’s is one press", ""]],
      seen: "The studio folder wears Bloom’s colours. It stands in for Sol’s Folder colours there.",
    },
  },
  Jayden: {
    pieces: [],
    ask: {
      re: /hide.*(needs|waiting|count)|count.*stress/i, say: "hide the Waiting on you count, it stresses me out", for: "Waiting on you count",
      add: { id: "quietcount", n: "A quiet count", at: null, small: "nothing new in it until the morning unless it’s due today" },
      sols: [R("Waiting on you", "3")], yours: [R("Waiting on you", "", true)],
      checks: [[true, "Stands in for Sol’s Waiting on you count, by name", ""], [false, "Fails: what needs you stays visible", "HW3 is due in an hour. A count you can’t see is a deadline you miss, and Sol keeps this one for everyone."], [true, "Reads nothing new", ""]],
      alt: {
        say: "Keep the count, make it quiet: no dark dot, and nothing new in it until the morning unless it’s due today.", yours: [R("Waiting on you", "3 · quiet", true)],
        checks: [[true, "Stands in for Sol’s Waiting on you count, by name", ""], [true, "What needs you stays visible", "The count stays; only its weight changes."], [true, "Something due today still comes through", ""], [true, "Back to Sol’s is one press", ""]],
      },
      seen: "Waiting on you is quiet until the morning, unless something is due today. It stands in for Sol’s Waiting on you count.",
    },
  },
};

/** the update that came in (the fixture's): its version and its day */
export const UPDATE = { v: "2.4", when: "Tuesday" };
