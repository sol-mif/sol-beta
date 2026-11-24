// The joined blocker as an extra asker (round 7, #1615; merge/lead.js CV.people.EXTRA.unshift): the runs one lapsed
// sign-in holds up join into one ask, first on Needs you ("12 AIs wait on one GitHub sign-in"). It is registered with
// the people's seam (people/extra.ts) and stands first, as the mockup's unshift did. Its button lands on Seats; signing
// in is the person's own, on the provider's page, so an answer here writes nothing (done is empty).
// It also gives the store the badge (hooks.badge, for needWords) and the counts' handle CV.people.needWords.
// Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { createElement } from "react";
import { D, above, dataVer, hooks, needWords, subscribe } from "../cv/core.ts";
import { EXTRA, register, type ExtOpen } from "../people/extra.ts";
import { needsCount, needsCountKept } from "../people/queue.ts";
import { joined, type Joined } from "./rules.ts";
import { JoinRow } from "./Join.ts";

const as = (t: ExtOpen) => t as unknown as Joined;
const provider = {
  items: () => joined(),
  first: (t: ExtOpen) => `holds ${as(t).n} AIs up, in Seats`,
  line: (t: ExtOpen, said: string) => ({ what: `You said “${said}”: ${as(t).n} AIs wait on one ${as(t).cause} sign-in.`, why: `${as(t).n} AIs asked, as one` }),
  done: () => {},
  row: (t: ExtOpen, focus: boolean) => createElement(JoinRow, { t: as(t), focus }),
};
// it asks only while a canvas has a lapsed sign-in (D.lapsed; live, the engine's S22 row is not there yet): registered on
// such a load and taken out on any other, so the queue holds no empty asker. First in the queue, as lead.js's unshift
// (the register's undo finds it wherever it stands)
let off: (() => void) | null = null;
function asker(): void {
  if (D.lapsed && !off) { off = register(provider); EXTRA.splice(EXTRA.indexOf(provider), 1); EXTRA.unshift(provider); }
  else if (!D.lapsed && off) { off(); off = null; }
}
hooks.onLoad.push(() => asker());
asker();

// round 8 · H2: the badge for the store's needWords, and the dev page's CV.people.needWords
hooks.badge = needsCountKept;
const h = hooks as unknown as { people?: Record<string, unknown> };
if (h.people) Object.assign(h.people, { needWords });

// round 8 fixes · F1: the sidebar's Diary row shows its number only when it is the badge's (shell.js `up===nn`). The row
// is the shell's (Next.tsx, not this slice's): until the join puts the condition there (requests/lead.md 1), the page
// says which it is and lead.css hides the number when it is a part only
let markedAt = -1;
function mark(): void {
  if (typeof document === "undefined") return;
  if (dataVer() === markedAt) return;   // the join (#1615): a pan or a zoom changes no count; S32's data version says so
  markedAt = dataVer();
  const v = above() === needsCount() ? "badge" : "parts", r = document.documentElement;
  if (r.dataset.oneCount !== v) r.dataset.oneCount = v;
}
subscribe(mark);

// round 7: the sidebar shows the leads, "leads 25", and no row for an AI under a lead: written in Next.tsx at the join
// (requests/lead.md 2)
