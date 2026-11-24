// The move-in's state (round 6 · M1, #1615; merge/movein.js EDIT, DONE, OPEN): the choices being made while the screen is
// open, the choices made (applied at every load of that canvas), and which canvas has the screen open. The moves
// (cv/moves/movein.ts) change it; the screen, the seen card, the Settings row and the Needs-you ask read it.
// Live (a real Sol) nothing here is filled until the engine answers next.movein.read (BR1: carry.ts with Claude Code and
// Codex, movein/live.ts): until then `live.ready` is false and every move answers "not yet". Live, the one person is
// "you" (LIVE), never a scenario's name. Signed: marcocyl04-ux's agent, port slice 11 (#1615); live in BR1.
import { MODE, SCN } from "../cv/core.ts";
import { DATA, blank, type Choices, type Person } from "./data.ts";
import type { KeptFolder, Unsorted } from "../place.ts";

export const EDIT: Record<string, Choices> = {};
export const DONE: Record<string, Choices> = {};
export const st = { open: null as string | null };
/** live: the engine's move-in read (next.movein.read), under LIVE; `asked` once a read was asked, `answered` once one came */
export const live = { ready: false, data: {} as Record<string, Person>, asked: false, answered: false, added: [] as string[], at: 0, movedAt: 0, kept: [] as string[], folders: [] as KeptFolder[], batch: null as string | null, words: false, unsorted: new Map<string, Unsorted>() };   // words: the person said how their folders are (movein.json `said`, #1816 round 2), so only the tree is drawn; unsorted: what it left out, the sidebar's "Not sorted yet"   // folders: the engine's one list of folders kept (next.state's `folders`, movein.ts keptFolders), each drawn (BR1)   // batch: the last keep's (BR1 item 7), what the move-in's one Back sends   // movedAt: when the person moved in (movein.json `at`), the "since" of a folder the tree does not hold (#1816)   // added: folders this face made Sol's (work.folder add), drawn though the read did not list them; at: when the first read came (#1758); kept: the kept answer's folders, always drawn (#1615)
/** the live person's key */
export const LIVE = "you";
/** whose move-in this canvas is: the scenario's on the fixture, "you" live */
export const here = (): string => (MODE === "fixture" ? SCN : LIVE);

/** the person's rows: the fixture's panel, or what the engine read */
export const personOf = (name: string | null | undefined): Person | undefined => (name ? (MODE === "fixture" ? DATA[name] : live.ready ? live.data[name] : undefined) : undefined);
/** the read's row for a folder of the plane ("w:<path>", "h:<id>"): its sessions counted per app and what it found there
 *  (the opened folder's head and its badge, first-timer line 1) */
export const rowOfFolder = (rid: string) => personOf(here())?.rows.find((x) => x.k === "place" && (x.id === rid || x.id === `w:${rid}` || rid === `w:${x.id}`));
/** the choices being made for a canvas (made fresh when none) */
export const ed = (k: string): Choices => EDIT[k] || (EDIT[k] = blank());
/** the move-in can run here: on the fixture always, live once the engine reads it */
export const can = () => MODE === "fixture" || live.ready;
/** every choice forgotten and the screen closed (the counts start each person from here) */
export function clear(): void {
  for (const k in DONE) delete DONE[k];
  for (const k in EDIT) delete EDIT[k];
  st.open = null;
}
