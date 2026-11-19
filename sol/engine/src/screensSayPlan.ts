// Say where (#1090, design JEV 7): the person's words turned into a move on the record. Pure.
// What the person types to the agent is a prompt and stays on this machine (the orchestrator's rule, the night of 13 Nov):
// sayHere matches the words against the open blocks' titles and the windows' names here, with no Jev. sayMove (Jev's
// answer read) stays for a choice asked over titles alone. Never "all of them": a gather is a press, not a sentence.
import { ALL, readSay, type SayWin } from "./screensJevSay.js";

export type SayBlock = { id: string; title: string };
export type SayLive = { win: string; here: boolean; bigger: boolean };
export type SayMove =
  | { kind: "none" }
  | { kind: "put"; block: string; to: string; pick: "act" | "ghost"; title: string }
  | { kind: "gather"; to: string; pick: "act" | "ghost" };

/** the names a window is called by: the larger one is the monitor, the other the laptop (two windows on one screen:
 *  the one typed in is the laptop) */
export function sayWindows(live: SayLive[]): (SayWin & { win: string })[] {
  // no screen larger than the other (two browser windows on one screen, as tonight): the window typed in is the laptop,
  // the other the monitor, the big one (design NOW 06:19 #1)
  const even = !live.some((w) => w.bigger);
  return live.slice(0, 4).map((w) => {
    const big = even ? !w.here : w.bigger;
    return { win: w.win, name: big ? "monitor" : "laptop", here: w.here, bigger: big };
  });
}

/** the open blocks Jev is asked about: eight at most, each title once (two blocks of one title: the first) */
export function sayBlocks(blocks: unknown): SayBlock[] {
  if (!Array.isArray(blocks)) return [];
  const seen = new Set<string>(), out: SayBlock[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const id = (b as any).id, title = (b as any).title;
    if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id) || typeof title !== "string" || !title.trim() || seen.has(title)) continue;
    seen.add(title); out.push({ id, title: title.slice(0, 80) });
    if (out.length === 8) break;
  }
  return out;
}

/** Jev's answers to the move: none when nothing is named, the window is unknown, or the block is already there */
export function sayMove(answers: unknown, blocks: SayBlock[], wins: (SayWin & { win: string })[], whereNow: Record<string, string | undefined>): SayMove {
  const r = readSay(answers);
  if (r.pick === "none" || !r.block || !r.to) return { kind: "none" };
  const w = wins.find((x) => x.name === r.to);
  if (!w) return { kind: "none" };
  if (r.block === ALL) return { kind: "gather", to: w.win, pick: r.pick };
  const b = blocks.find((x) => x.title === r.block);
  if (!b || whereNow[b.id] === w.win) return { kind: "none" };
  return { kind: "put", block: b.id, to: w.win, pick: r.pick, title: b.title };
}

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "onto", "over", "file", "files", "one", "two", "its", "put", "move", "bring", "show", "take", "send", "throw", "please", "can", "you"]);
const TO_BIG = /\b(big one|bigger one|large screen|larger screen|the big screen|monitor|over there|other screen|other window|across)\b/;
const TO_HERE = /\b(back here|here|this screen|this window|laptop|small one|smaller one|by the keyboard)\b/;
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** the person's words read here (never sent anywhere): a block named by a word of its title and a screen named by how a
 *  person calls it; both, or nothing. Eight words or more is talk to the agent, not a move. Already there: nothing */
export function sayHere(said: string, blocks: SayBlock[], wins: (SayWin & { win: string })[], whereNow: Record<string, string | undefined>): SayMove {
  const text = said.toLowerCase().trim();
  if (!text || text.split(/\s+/).length > 8) return { kind: "none" };
  const big = TO_BIG.test(text), here = TO_HERE.test(text);
  if (big === here) return { kind: "none" };   // no screen named, or both
  const to = wins.find((w) => (big ? w.bigger && !w.here : w.here)) ?? (big ? wins.find((w) => !w.here) : undefined);
  if (!to) return { kind: "none" };
  const said_ = new Set(words(text));
  const scored = blocks.map((b) => ({ b, n: words(b.title).filter((w) => said_.has(w)).length })).filter((x) => x.n > 0).sort((a, z) => z.n - a.n);
  if (!scored.length || (scored[1] && scored[1].n === scored[0].n)) return { kind: "none" };   // none named, or two equally
  const b = scored[0].b;
  if (whereNow[b.id] === to.win) return { kind: "none" };
  return { kind: "put", block: b.id, to: to.win, pick: "act", title: b.title };
}
