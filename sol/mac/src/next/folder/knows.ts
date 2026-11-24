// What every session in one folder knows, read once for both places that say it (BR1 #1615, "one place, one summary"):
// the opened folder lists it (folder/index.tsx Knows) and the folder card's badge counts it (movein/you/Badge.tsx), so
// the two never say different numbers. Signed: marcocyl04-ux's agent (builder F).
import { D, piecesIn } from "../cv/index.ts";
import { youNow } from "../cv/wire/you.ts";
import { forgotNow } from "../cv/wire/because.ts";
import { titleOf } from "../plane/layout.ts";
import { knownInRegion } from "../movein/you/lens-state.ts";
import { rowOfFolder } from "../movein/state.ts";
import type { Known } from "../known.ts";
import type { Folder, Notes } from "../notes/read.ts";
import { knowsCount, knowsRows, pagesOf, pathOf, type KnowRow } from "./head.ts";

export type FolderKnows = { f: Folder | undefined; ks: Known[]; pages: string[]; at: string | null; notes: Notes["notes"]; rows: KnowRow[]; n: number };

/** the folder's facts (its own, what the move-in read found, what You placed here), pages and pinned notes; at: its place
 *  on disk as a path (a folder only in Sol has none). rows say the place as given: say() it as the screen shows it */
export function folderKnows(rid: string, say: (at: string) => string = (at) => at, d = D): FolderKnows {
  const f = (d.notes as Notes | undefined)?.folders?.[rid];
  const regions = d.regions.map((r) => ({ id: r.id, name: r.name, ...(typeof r.path === "string" ? { path: r.path } : {}) }));
  const found = rowOfFolder(rid)?.found;
  // a fact forgotten here is out of the list and the badge as soon as the one store says so, before the folder's re-read
  const forgot = forgotNow();
  const ks = knownInRegion(rid, regions, { you: youNow(), ...(f ? { folders: { [rid]: f } } : {}), ...(found ? { found: [found] } : {}), ...(forgot ? { forgot } : {}) });
  const pages = pagesOf(piecesIn(rid), titleOf);
  const at = f?.place ?? (rid.startsWith("w:") ? pathOf(rid) : null);
  const notes = ((d.notes as Notes | undefined)?.notes ?? []).filter((x) => x.folder === rid && x.text.trim());
  const rows = knowsRows(at ? say(at) : null, ks, pages);
  return { f, ks, pages, at, notes, rows, n: knowsCount(rows, notes.length, f?.backs.length ?? 0) };
}
