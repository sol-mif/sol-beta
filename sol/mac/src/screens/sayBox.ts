// Say where, from the box (#1090, design NOW 06:33 #1c): Composer asks here before it sends. A short line that names an
// open block and a screen (say.ts) moves the block and is not sent; ⌘Z within 8 s takes the move back and the words come
// back into the box ("sol:box-words"). Only with the switch on, two windows live, on the window with the talk.
import { screensOn } from "./flag";
import { ME, many, put, roleNow, screensState, onUndoThis } from "./store";
import { drawnOn } from "./model";
import { saidWhere } from "./say";
import { store as stageStore } from "../stage/engineStore";

export function sayInBox(words: string, session: string | null): boolean {
  if (!screensOn() || !session) return false;
  const s = screensState(), role = roleNow(s);
  if (!many(s) || !(role === "whole" || role === "stage")) return false;
  const seen = stageStore.read(session);
  const blocks = seen.blocks.filter((b) => b.state !== "dead").map((b) => ({ id: b.id, title: b.title }));
  const m = saidWhere(words, blocks, s, ME, (id) => drawnOn(s, id));
  if (!m) return false;
  put(m.block, m.to);
  onUndoThis(() => window.dispatchEvent(new CustomEvent("sol:box-words", { detail: words })));
  return true;
}
