// The because's dev page person (because/dev.tsx; mine/look/br1/because.html): Ana, a student who also builds a
// website for a client. An invented person: no name, path or habit of a real one. What Sol knows of her, and the
// things Sol did that carry a why. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Known } from "../known.ts";
import type { Change } from "./fix.ts";

export const ANA: Known[] = [
  { k: "fact:1", fact: "You write on your thesis before 11 most weekdays.", source: "you said", by: "person", at: "2026-11-18T10:00:00Z", place: null },
  { k: "tool:/u/ana/thesis:zotero", fact: "Zotero holds your sources", source: "your apps", by: "read", place: "/u/ana/thesis" },
  { k: "fact:2", fact: "Your client usually writes after lunch.", source: "14 sessions in studio-site", by: "sol", at: "2026-11-16T15:00:00Z", place: "/u/ana/studio-site" },
  { k: "learned:3", fact: "You want an invoice sent the day a page goes live.", source: "your pick on 12 Nov", by: "person", place: "/u/ana/studio-site" },
  { k: "seen:/u/ana/taxes:quiet", fact: "Taxes has been quiet for three weeks", source: "when you work", by: "sol", place: "/u/ana/taxes" },
  // where Sol put folders at the move-in (P's ofPlaced words): one nested by the disk, three on the shelf by one reading
  { k: "placed:w:/u/ana/thesis/figures", fact: "Sol put figures in thesis because it sits inside thesis on disk", source: "where Sol put it", by: "sol", at: "2026-11-20T09:00:00Z", place: "w:/u/ana/thesis/figures" },
  { k: "placed:w:/u/ana/kite-sketch", fact: "Sol archived kite-sketch because it was changed on one day only, and three in four of your folders were used more", source: "where Sol put it", by: "sol", at: "2026-11-20T09:00:00Z", place: "w:/u/ana/kite-sketch" },
];
/** the folders on the shelf, Sol's, with the same reading as kite-sketch (the dev page's "Same for these 2?") */
export const SHELF = ["w:/u/ana/kite-sketch", "w:/u/ana/garden-plan", "w:/u/ana/old-poster"];

/** what Sol did, each with the why the engine sends (the keys of the facts that made it) */
export type Did = { id: string; where: string; what: string; why?: string[]; here?: string };
export const DID: Did[] = [
  { id: "diary", where: "Diary · Monday", what: "Thesis first this morning: chapter 3’s draft is open where you left it.", why: ["fact:1", "tool:/u/ana/thesis:zotero"], here: "/u/ana/thesis" },
  { id: "front", where: "studio-site", what: "Waits for the afternoon · 1 thing from the client", why: ["fact:2"], here: "/u/ana/studio-site" },
  { id: "week", where: "studio-site · this week", what: "Left Thursday afternoon open for the client’s notes.", why: ["fact:2"], here: "/u/ana/studio-site" },
  { id: "ask", where: "studio-site asks", what: "The home page is live. Send the invoice now?", why: ["learned:3"] },
  { id: "plan", where: "taxes", what: "Kept quiet and left off this morning’s list.", why: ["seen:/u/ana/taxes:quiet"] },
  { id: "plain", where: "life", what: "Moved the grocery list to the top: you opened it last.", },
  { id: "forgot", where: "Diary · Monday", what: "Put the gym bag reminder at 7.", why: ["fact:404"] },
  { id: "nested", where: "figures", what: "figures · 12 files", why: ["placed:w:/u/ana/thesis/figures"], here: "w:/u/ana/thesis/figures" },
  { id: "shelved", where: "kite-sketch", what: "kite-sketch · 3 files", why: ["placed:w:/u/ana/kite-sketch"], here: "w:/u/ana/kite-sketch" },
];

/** what a fix of Ana's would change, as the engine's preview says it (next.you.fact.fix) */
export function previewOf(k: string, how: string, now?: string): Change[] {
  if (how === "right") return [];
  if (k === "fact:1") return how === "only-here" ? [{ what: "Writing before 11", from: "everywhere", to: "thesis only", when: "now" }] : [
    { what: "studio-site", from: "the afternoon", to: "first in the morning", when: "tomorrow" },
    { what: "thesis", from: "first, before 11", to: how === "not-anymore" && now ? "the evening, from 19:00" : "in the order you open things", when: "tomorrow" },
  ];
  if (k === "fact:2") return [{ what: "studio-site", from: "waits for the afternoon", to: "in the order you open things", when: "tomorrow" }];
  if (k === "learned:3") return [{ what: "An invoice", from: "asked the day a page goes live", to: "never asked; you send it yourself", when: "the next page" }];
  return [{ what: "Your list", to: "drawn without it", when: "now" }];
}
