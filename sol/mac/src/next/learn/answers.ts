// Help's answers on the dev page and in the tests (BR1 #1615; mine/look/br1/learn.html part 3): the FAQ's first set,
// the words a first-timer stumbled on, and a "how do I…" for each walk's step, each ending with Show me's { walk, step }.
// Live the engine answers (sol/engine/src/next/help, its README the contract); this is the same shape, so the face draws
// one or the other alike. Plain words for every Sol user: no one person's folders, names or words.
// Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import type { WalkId } from "./walks.ts";

export type Show = { walk: WalkId; step: number };
export type Answer = { text: string; show?: Show; replay?: WalkId };
type Entry = { q: string; words: string[]; a: Answer };

/** the questions Help offers before anything is asked (the drawing's chips, after "Replay a walk ›") */
export const ASKED = ["What does “Sol knows 12” mean?", "What’s a seat?", "Why does it ask first?", "What can Sol see?"];

const E: Entry[] = [
  // the FAQ, first set
  { q: "What does “Sol knows 12” mean?", words: ["knows", "sol knows"], a: { text: "Sol has read 12 things in this folder (notes, files, chats), so a session here starts already knowing them." } },
  { q: "What’s a seat?", words: ["seat", "coming up"], a: { text: "An AI plan you’re signed into, like Claude or Codex. “1 coming up” means one is still signing in." } },
  { q: "What do “only looks”, “prepares” and “does it” mean?", words: ["only looks", "prepares", "does it"], a: { text: "How much Sol may do in a place: read only, get things ready for your OK, or act on its own.", show: { walk: "yours", step: 2 } } },
  { q: "What is “What every session here knows”?", words: ["every session here knows", "session here knows"], a: { text: "The folder’s notes every new session reads first. Edit them and every session after uses the change." } },
  { q: "What does Unfold do?", words: ["unfold", "stack"], a: { text: "It shows what’s inside a stack of folders, card by card. Press again to stack them back." } },
  { q: "What are MCP tools?", words: ["mcp", "tools"], a: { text: "Extra abilities your AI can use, like reading your calendar. You add them in Claude or Codex, and Sol shows the ones you have." } },
  { q: "What’s the digest?", words: ["digest"], a: { text: "A short summary of what happened while you were away, at the top of the Diary.", show: { walk: "needs", step: 1 } } },
  { q: "Why does the AI ask first?", words: ["ask first", "asks first", "why does it ask"], a: { text: "Asks first is on for that session. Switch it in the model chip, under “Before acting”.", show: { walk: "ai", step: 3 } } },
  { q: "Is anything deleted when I tidy?", words: ["deleted", "tidy", "lose"], a: { text: "No. The Shelf and Arrange only move things, and Undo brings them back.", show: { walk: "folders", step: 3 } } },
  { q: "What can Sol see?", words: ["see", "privacy", "forget", "source"], a: { text: "Only what you let it: each source is in Settings, under Privacy. Turn one off and Sol forgets what it read there; Back brings it back.", show: { walk: "yours", step: 3 }, replay: "yours" } },
  // how do I… one per walk's step that does something
  { q: "How do I put a folder inside another one?", words: ["inside", "into another", "folder in a folder", "put a folder in", "nest"], a: { text: "Drag it onto the other folder on the canvas, and it goes inside. To take it out, open the outer folder and drag it back onto the canvas.", show: { walk: "folders", step: 2 }, replay: "folders" } },
  { q: "How do I open a folder?", words: ["open a folder", "open folder"], a: { text: "One press on its card, or its row in the sidebar. It opens on Working now, What changed, Coming up and Files.", show: { walk: "folders", step: 0 }, replay: "folders" } },
  { q: "How do I put a folder away?", words: ["put away", "shelf", "archive", "hide a folder"], a: { text: "Drag it to the Shelf. Nothing is deleted, and Undo brings it back.", show: { walk: "folders", step: 3 }, replay: "folders" } },
  { q: "How do I tidy the canvas?", words: ["arrange", "tidy", "messy", "sort"], a: { text: "Arrange, on the bar under the canvas, lays your folders out again four ways.", show: { walk: "folders", step: 4 }, replay: "folders" } },
  { q: "How do I zoom out?", words: ["zoom", "all folders", "see everything"], a: { text: "⌘↑ zooms out to All folders; ⌘↓ goes back in.", show: { walk: "around", step: 1 }, replay: "around" } },
  { q: "How do I find my way around?", words: ["where", "map", "minimap", "lost"], a: { text: "Where, on the bar under the canvas, shows the whole canvas small; press a spot to go there. Esc always steps back one level.", show: { walk: "around", step: 2 }, replay: "around" } },
  { q: "How do I go back?", words: ["go back", "step back", "escape", "esc"], a: { text: "Esc steps back one level, wherever you are. The path at the top goes up any number of levels.", show: { walk: "around", step: 3 }, replay: "around" } },
  { q: "How do I start a session?", words: ["new session", "start a session", "talk to an ai", "start an ai"], a: { text: "⌘N, or New session in the sidebar. Started inside a folder, the AI already knows that folder.", show: { walk: "ai", step: 0 }, replay: "ai" } },
  { q: "How do I keep a session open beside the canvas?", words: ["beside", "keep open", "side by side", "tab"], a: { text: "A session opens as a tab; ◧ keeps it open beside the canvas instead. ‹ or Esc leaves it.", show: { walk: "ai", step: 1 }, replay: "ai" } },
  { q: "How do I answer when an AI asks?", words: ["answer", "asks me", "waiting", "amber"], a: { text: "The ask sits above the box with the amber dot: Wait, Go ahead, or Tell it… Every ask is also in Waiting on you.", show: { walk: "ai", step: 2 }, replay: "ai" } },
  { q: "How do I choose which AI answers?", words: ["model", "which ai", "think harder", "effort"], a: { text: "The model chip: who answers, how hard it thinks, and whether it asks first.", show: { walk: "ai", step: 3 }, replay: "ai" } },
  { q: "How do I stop an AI?", words: ["stop", "pause", "changed"], a: { text: "Changes shows what it changed, with Pause and Stop. Pause finishes the step it is on first.", show: { walk: "ai", step: 4 }, replay: "ai" } },
  { q: "How do I move things with words?", words: ["move", "next to", "bar", "type"], a: { text: "Type it into the bar: “put this next to that”, or ask a question. Drop any card on the bar to talk about it.", show: { walk: "bar", step: 1 }, replay: "bar" } },
  { q: "How do I point at something?", words: ["point", "pick", "✦"], a: { text: "✦ on the bar points at things on screen; “+N picked” shows them, and × takes one off.", show: { walk: "bar", step: 3 }, replay: "bar" } },
  { q: "How do I talk instead of typing?", words: ["voice", "speak", "talk instead", "fn"], a: { text: "Hold fn and talk; let go and Sol hears it.", show: { walk: "bar", step: 4 }, replay: "bar" } },
  { q: "How do I see what needs me?", words: ["needs me", "waiting on you", "asks"], a: { text: "Waiting on you, at the top of the sidebar, gathers every ask in one list.", show: { walk: "needs", step: 0 }, replay: "needs" } },
  { q: "How do I see what happened while I was away?", words: ["away", "diary", "happened", "yesterday"], a: { text: "The Diary: what happened while you were away, and because… says why.", show: { walk: "needs", step: 1 }, replay: "needs" } },
  { q: "How do I see what my AIs are doing?", words: ["at work", "working now", "doing"], a: { text: "Working now in the sidebar; ↗ opens At work: Now, Next, and what your AI did.", show: { walk: "needs", step: 2 }, replay: "needs" } },
  { q: "How do I add something to a folder?", words: ["add", "automation", "note"], a: { text: "Add, on the bar under the canvas: a session, an automation, or a note, in the folder in the middle of the view.", show: { walk: "yours", step: 0 }, replay: "yours" } },
  { q: "How do I change how Sol looks?", words: ["colour", "color", "look", "dark", "night", "customize", "size"], a: { text: "Customize, on the bar under the canvas: colours, sizes, Light or Night. Keep or Back when you’re done.", show: { walk: "yours", step: 1 }, replay: "yours" } },
];

/** is this a question for Help rather than a move: "how do I…", "what is…", "why does…", "where…" */
export const isHowTo = (s: string): boolean => /^\s*(how\s+(do|can|does|to)\b|what('s|\s+is|\s+are|\s+does|\s+do)\b|why\b|where\b|help\b)/i.test(s);

const norm = (s: string) => s.toLowerCase().replace(/[“”"’'?.,!]/g, " ").replace(/\s+/g, " ").trim();
/** the answer to a question, from the set above: the entry whose words meet the question most (longest words first) */
export function answerOf(q: string): Answer {
  const n = ` ${norm(q)} `;
  let best: Entry | null = null, score = 0;
  for (const e of E) {
    if (norm(e.q) === norm(q)) return e.a;
    const s = e.words.reduce((t, w) => t + (n.includes(` ${norm(w)}`) ? norm(w).length : 0), 0);
    if (s > score) { score = s; best = e; }
  }
  return best ? best.a : { text: "I don’t know that one yet. The six walks show the main parts: Replay a walk, above, plays any of them." };
}
