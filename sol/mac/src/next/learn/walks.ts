// The six walks (BR1 #1615; Marco's approved drawing, mine/look/br1/learn.html draft 1, part 2): each a short sequence
// of next/tips played on the real parts of the person's own Sol, their own folders the examples. Ids and step numbers
// (from 0) are the engine's too (sol/engine/src/next/help, Show me's { walk, step }). A step names:
//   head, line   the tip's words, as the drawing has them (a folder's name is filled in from the person's own canvas)
//   at           where it points: the first selector on screen wins; none on screen (no folders yet, a part not drawn
//                here) and the tip stands in the middle of the window, so a walk copes with an empty Sol
//   did          a step that asks for an action moves on when the person does it (the store as it stands, read on
//                every change): Next stays there for anyone who would rather read
// Plain: no view, so the unit tests read it. Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).

export type WalkId = "around" | "folders" | "ai" | "bar" | "needs" | "yours";
/** what a step's `did` reads: the view as it stands */
export type Here = { dist: string; page: string | null; tab: boolean; typed: boolean; folders: number };
export type Step = { head: string; line: string; at: string[]; did?: (h: Here) => boolean };
export type Walk = { id: WalkId; n: string; m: string; steps: Step[] };

/** a folder card on the canvas, else its row in the sidebar */
const FOLDER = ["#pl .pl-card[data-region]", "#pl .pl-area[data-area]"];
const BAR_IN = ["#talk"];
const SETTINGS = ["#side [data-go=settings]"];

export const WALKS: Walk[] = [
  { id: "around", n: "Getting around", m: "canvas · zoom · the sidebar", steps: [
    { head: "Your folders are cards", line: "The sidebar lists the same ones, in the same order. {first} is one of them.", at: FOLDER },
    { head: "⌘↑ zooms out", line: "Press ⌘↑ to see All folders; ⌘↓ goes back in.", at: ["[data-bar-zoom]", "#crumb"], did: (h) => h.dist === "far" },
    { head: "Where", line: "Where shows the whole canvas small; press a spot to go there.", at: ["[data-bar=where]"] },
    { head: "Esc steps back", line: "Esc always steps back one level, wherever you are.", at: ["#crumb"] },
  ] },
  { id: "folders", n: "Your folders", m: "open · folders in folders · Shelf · Arrange", steps: [
    { head: "One press opens a folder", line: "Open {first}: Working now, What changed, Coming up, Files.", at: FOLDER, did: (h) => h.page === "folder" },
    { head: "The path", line: "The path at the top names every level; press one to go up.", at: ["#crumb"] },
    { head: "Drag to put inside", line: "Drag a folder onto another to put it inside.", at: FOLDER },
    { head: "The Shelf", line: "The Shelf puts a folder away. Nothing is deleted, and Undo brings it back.", at: ["[data-holder]", ...FOLDER] },
    { head: "Arrange", line: "Arrange tidies the canvas four ways.", at: ["[data-bar=arrange]"] },
  ] },
  { id: "ai", n: "Working with an AI", m: "a session, start to finish", steps: [
    { head: "New session", line: "⌘N inside a folder: the AI already knows that folder.", at: ["#newrow"], did: (h) => h.tab },
    { head: "As a tab or kept open", line: "A session opens as a tab, or kept open beside the canvas; ‹ or Esc leaves it.", at: ["#tabs"] },
    { head: "An ask", line: "When an AI asks, it sits above the box with the amber dot: Wait, Go ahead, Tell it…", at: ["#line", "#needsrow"] },
    { head: "The model chip", line: "Who answers, how hard it thinks, and whether it asks first.", at: ["[data-port] .model-chip", "[data-port]", "#talk"] },
    { head: "Changes", line: "What it changed, and Pause or Stop at any time.", at: ["[data-port] [data-rail]", "[data-port]", "#aisrow"] },
  ] },
  { id: "bar", n: "The bar", m: "one bar, everywhere", steps: [
    { head: "To:", line: "To says who you're talking to; it slides when that changes.", at: ["#talk .nx-to", ...BAR_IN] },
    { head: "Say what you want here", line: "Ask a question, or tell Sol to move things: \"put {third} next to {first}\". Try it now.", at: BAR_IN, did: (h) => h.typed },
    { head: "Drag a card in", line: "Drop any card on the bar to talk about it; the bar lights with its verb.", at: BAR_IN },
    { head: "Point at things", line: "✦ points at things on screen; \"+N picked\" shows them, × takes one off.", at: ["#talk .mk-att", ...BAR_IN] },
    { head: "Hold fn", line: "Hold fn to talk instead of typing.", at: ["#talk .nx-hint-q", ...BAR_IN] },
  ] },
  { id: "needs", n: "What needs you", m: "Waiting on you · the Diary · At work", steps: [
    { head: "Waiting on you", line: "Every ask, in one list.", at: ["#needsrow"], did: (h) => h.dist === "needs" },
    { head: "The Diary", line: "What happened while you were away; because… says why.", at: ["#pl-dy", "[data-diary]", "[data-diary-near]"] },
    { head: "At work", line: "Now, Next, and what your AI did. Pause finishes the step first.", at: ["#aisrow"] },
  ] },
  { id: "yours", n: "Make it yours", m: "Add · Customize · Settings · How Sol sees you", steps: [
    { head: "Add", line: "Add to a folder: a session, an automation, a note.", at: ["[data-bar=add]"] },
    { head: "Customize", line: "Colours, sizes, Light or Night; Keep or Back.", at: ["[data-bar=customize]", "[data-bar]:last-of-type"] },
    { head: "How Sol sees you", line: "In Settings, each place looks, prepares, or does it for you.", at: SETTINGS, did: (h) => h.page === "settings" },
    { head: "Privacy", line: "Turn a source off and Sol forgets it; Back brings it back.", at: SETTINGS },
  ] },
];

export const walkOf = (id: string | null | undefined): Walk | undefined => WALKS.find((w) => w.id === id);
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** a step's words with the person's own folders in them; with none, plain words in their place */
export function wordsOf(s: string, names: string[]): string {
  const [a, , c] = names;
  return s
    .replace(/\{first\} is one of them\./, a ? `${a} is one of them.` : "Make one with ＋ by Folders.")
    .replace(/Open \{first\}/, a ? `Open ${a}` : "Open a folder")
    .replace(/put \{third\} next to \{first\}/, a && c ? `put ${c} next to ${a}` : a && names[1] ? `put ${names[1]} next to ${a}` : "make a folder for my notes")
    .replace(/\{[a-z]+\}/g, "a folder");
}
