// Copied from MR (origin/marco/mine-run 54e4f636) sol/mac/src/home/whole/today.ts l.125-151 (seed) and sol/mac/src/home-whole.test.ts l.8, l.45-53 (NOW, the order case); not imported: the engine never imports sol/mac.
// The face's first scene: three Things that wait on you and two that move, at NOW (Monday 9 November 2026, 8:40), and
// the six Things of his order test. Values as in his files; the type is the engine's (contract/home/today.ts).
import type { Thing } from "../../../src/contract/home/today.ts";

export const NOW = new Date(2026, 10, 9, 8, 40).getTime();

/** the three things that wait and the two that move, as the design's first scene has them (home/whole.html scene 1) */
export function seed(now: number): Thing[] {
  const day = new Date(now), at = (h: number, m = 0, plus = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + plus, h, m).getTime();
  const base = { links: [], made: [] };
  return [
    { ...base, id: "t-chem-set6", read: "you", folder: "school › chem 110", words: "chem 110 set 6", state: "you", waitsOn: "you", due: at(23, 59), at: now - 5 * 36e5,
      card: { source: "canvas", title: "Chem 110 set 6 is due tonight. Two of eight left.", why: "Problems 7 and 8 are on equilibrium; your notes from lecture 9 cover both. Your evening is free from 19:00.",
        chips: [{ kind: "slot", label: "set 6 · 6 of 8 in" }, { kind: "file", ext: "pdf", label: "lecture 9 notes" }, { kind: "slot", label: "free 19:00–21:00" }],
        answers: ["hold 19–21 for it", "I’ll do it now"],
        touches: [{ source: "canvas", title: "Canvas", note: "set 6 · problems 7, 8" }, { source: "calendar", title: "your calendar", note: "free tonight 19:00–21:00" }, { source: "files", title: "chem 110", note: "lecture 9 notes, your words" }],
        edge: "set 6 due tonight · two of eight left" } },
    { ...base, id: "t-maya-data", read: "you", folder: "work › stats group", words: "Maya asked twice for your data section", state: "asks", waitsOn: "you", at: now - 26 * 36e5, blocks: true,
      card: { source: "mail", title: "Maya asked twice for your data section.", why: "The stats group report is drafted around it; the job that writes the summary waits on your table.",
        chips: [{ kind: "person", label: "Maya" }, { kind: "file", ext: "xlsx", label: "survey data" }, { kind: "slot", label: "group Wed 11" }],
        answers: ["draft it from my sheet", "I’ll send it"],
        touches: [{ source: "mail", title: "Mail", note: "two asks from Maya, since yesterday" }, { source: "files", title: "stats group", note: "the report, drafted" }, { source: "people", title: "Maya", note: "stats 140, the group" }],
        edge: "Maya asked twice for your data section" } },
    { ...base, id: "t-shopify-app", read: "job", folder: "jobs › applications", words: "Shopify application", state: "proposed", waitsOn: "you", at: now - 3 * 36e5,
      card: { source: "sol", title: "Your Shopify application is ready. Send it?", why: "Sol filled it from your CV and the cover letter you kept; the posting closes Saturday.",
        chips: [{ kind: "file", ext: "docx", label: "cover letter" }, { kind: "file", ext: "pdf", label: "CV" }, { kind: "slot", label: "closes Sat 14" }],
        answers: ["send it", "let me read it"],
        touches: [{ source: "sol", title: "the application", note: "filled by Sol, not sent" }, { source: "files", title: "jobs", note: "CV and the cover letter" }],
        edge: "Shopify application · send it?" } },
    { ...base, id: "t-lab-prep", read: "job", folder: "school › chem 110", words: "lab prep", state: "moving", waitsOn: "agent", due: at(12, 0, 1), at: now - 36e5 },
    { ...base, id: "t-bio-notes", read: "job", folder: "school › bio 201", words: "notes from lecture 9", state: "moving", waitsOn: "agent", due: now + 3 * 36e5, at: now - 2 * 36e5 },
  ];
}

/** his order case (home-whole.test.ts l.46-50); the ids keep his names: "due-soon" is in his own test, an id of the
 *  engine is lower case with dashes, which these are */
export function orderCase(now: number): Thing[] {
  const th = (id: string, o: Partial<Thing>): Thing => ({ id, read: "you", folder: "", words: id, state: "you", waitsOn: "you", at: now, links: [], made: [], ...o });
  return [
    th("old", { at: now - 9e6 }), th("young", { at: now - 1e6 }), th("blocks", { at: now, blocks: true }),
    th("due-late", { due: now + 9e6 }), th("due-soon", { due: now + 1e6 }), th("moving", { waitsOn: "agent", state: "moving" }),
  ];
}
/** what his test expects of it (l.51-52) */
export const ORDER = ["due-soon", "due-late", "blocks", "old", "young"];
export const ORDER_LATER = ["due-late", "blocks", "old", "young", "due-soon"];

/** what his tests expect of the first scene (home-whole.test.ts l.14-17, l.42, l.59, l.68-70, l.112) */
export const FIRST = {
  needs: ["t-chem-set6", "t-maya-data", "t-shopify-app"],
  moving: ["t-lab-prep", "t-bio-notes"],
  line: "Three things need you. Two are moving on their own.",
  afterLater: ["t-maya-data", "t-shopify-app", "t-chem-set6"],
  afterSend: { needs: ["t-chem-set6", "t-maya-data"], line: "Two things need you. Three are moving on their own." },
  afterHold: "Two things need you. Two are moving on their own.",
};
