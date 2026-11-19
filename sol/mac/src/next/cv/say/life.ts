// owned by slice 4 (Life and Diary), docs/port/slices.md
// Life's and the diary's phrases for the talk pill (#1604; the mockup's diarySay and lifeSay, ported as they are), tried
// before the shared ones (say/index.ts). The diary's first, as the mockup's say chain had them (diary.js wrapped life.js):
//   diary: "write: …", "don't write this down", "write again", "yesterday", "today", "which AI changed what in the last hour?",
//          "start my day with …", "shorter", "longer", "write everything", "only what mattered", "warmer", "plainer", "my lines first"
//   life:  "sticky: …", "remind me to …", "new sticky", "run it", "finish it", "drop it", "due friday", "send it",
//          "next sticky", "undo"; and while the composer is open, "done", "cancel", and any other words become its words.
// The chain hands the words lower-cased, so a line written by voice keeps its words but not their capitals.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { D, M, done, regionOf, render, type Done, type Phrase } from "../core.ts";
import * as B from "../../diary/book.ts";
import { ask, chosen, closeComposer, commit, compose, composing, here, lifeHere, nextSticky, send, setTake, toToday, undoLast, undoCount } from "../moves/life.ts";

const yes = (r?: Done | null): Done => r || done(true);
const P = (hears: RegExp, run: (m: RegExpMatchArray, words: string) => Done | null | undefined): Phrase => ({ hears, run });
/** the sticky the life phrases act on: the chosen one where the person is, else in the folder of the last one chosen */
function target() {
  const rid = lifeHere() || here();
  return rid ? chosen(rid) : null;
}

const diary: Phrase[] = [
  P(/^(?:write|note|diary)[:,]?\s+(.+)$/, (m) => M.write(m[1])),
  P(/^(?:(?:don'?t|do not) write (?:this|that) down.*|stop writing.*|pause (?:the )?diary)$/, () => (B.book().paused ? done(true) : M.pause_diary())),
  P(/^(?:write again|you can write again|start writing|resume (?:the )?diary)$/, () => (B.book().paused ? M.pause_diary() : done(true))),
  P(/^(?:yesterday|flip back|the day before|previous day)$/, () => M.flip(-1)),
  P(/^(?:today|back to today|flip forward|next day)$/, () => { if (B.book().showing === 0) return null; toToday(); return done(true); }),
  P(/^.*$/, (_m, w) => {
    if (!(/\?$/.test(w) && /which ai|what changed|what did|who changed|what happened/.test(w) || /^(which ai|what changed|who changed)/.test(w))) return null;
    ask(w); return done(true);
  }),
  P(/^start (?:my|the) day with (?:my |the )?(.+)$/, (m, w) => {
    const q = m[1].replace(/e?s$/, ""), r = D.regions.find((x) => x.name.toLowerCase().includes(q)) || regionOf(q);
    return r ? setTake("first", r.id, w) : null;
  }),
  P(/^(?:shorter|write less|keep it short)$/, (_m, w) => setTake("length", "short", w)),
  P(/^(?:longer|every line|write more)$/, (_m, w) => setTake("length", "full", w)),
  P(/^(?:write everything|keep everything)$/, (_m, w) => setTake("keeps", "everything", w)),
  P(/^(?:only what mattered|less detail)$/, (_m, w) => setTake("keeps", "what mattered", w)),
  P(/^(?:warmer|be warmer|more personal)$/, (_m, w) => setTake("tone", "warm", w)),
  P(/^(?:plainer|be plain|just the facts)$/, (_m, w) => setTake("tone", "plain", w)),
  P(/^(?:my lines first|notes first)$/, (_m, w) => setTake("notes", "first", w)),
];

const life: Phrase[] = [
  // the composer open: "done" puts it down, "cancel" closes it
  P(/^(?:done|that's it|put it down|make it|ok)[.!]*$/, () => (composing() ? yes(commit()) : null)),
  P(/^(?:cancel|never ?mind|close)[.!]*$/, () => { if (!composing()) return null; closeComposer(); return done(true); }),
  P(/^(?:(?:write |make |add |new |put down )?(?:a )?sticky(?: note)?[:,]?\s+(.+)|remind me to\s+(.+))$/, (m) => {
    return M.sticky(lifeHere() || here(), m[1] ?? m[2]);
  }),
  P(/^(?:new sticky|write a sticky|a sticky)[.!]*$/, () => { compose(lifeHere()); return done(true); }),
  P(/^undo(?: that| it)?[.!]*$/, () => (undoCount() ? (undoLast(), done(true)) : null)),
  P(/^(?:run it|do it|run this|run the sticky|go)[.!]*$/, () => { const p = target(); return p ? yes(M.run_sticky(p.id)) : null; }),
  P(/^(?:finish it|finished|done with it|mark it done|tick it|it's done|done)[.!]*$/, () => { const p = target(); return p ? yes(M.finish(p.id)) : null; }),
  P(/^(?:drop it|drop this|forget it|never mind it)[.!]*$/, () => { const p = target(); return p ? yes(M.drop(p.id)) : null; }),
  P(/^(?:make it |it's )?due (.+?)[.!]*$/, (m) => { const p = target(); return p ? yes(M.due(p.id, m[1])) : null; }),
  P(/^(?:send it|send)[.!]*$/, () => { const p = target(), w = p && (p.made || []).find((x) => x.state === "waits"); return p && w ? send(p.id, w.id) : null; }),
  P(/^(?:next sticky|next one)[.!]*$/, () => { const p = target(); if (!p) return null; nextSticky(p.region); return done(true); }),
  // said while the composer is open, and no phrase took it: its words
  P(/^(.+)$/, (_m, w) => { const c = composing(); if (!c) return null; c.words = (c.words ? c.words + " " : "") + w.trim(); render(); return done(true); }),
];
const phrases: Phrase[] = [...diary, ...life];
export default phrases;
