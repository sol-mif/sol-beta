// A folder card's front line, chosen by its setup (setup.html §3: "the front of each card shows the one thing its setup
// says matters, in one line"). The setup names which of the folder's parts goes on the front, never the words: those
// are the part's own (folder/parts/model.ts, the engine's next.folder.look). What the person set leads (what it shows at
// rest, then how it looks); else Sol's reading, in the order the engine reads a look (setup-read.ts looksOf: pictures,
// dates ahead, a history of changes). A folder too early to read, or with no setup said, keeps the line it had (cardOf).
// Meta, designed blind: part ids and take ids only, no folder's name or words.
// Signed: marcocyl04-ux's agent (builder F10), BR1 (#1615).
import { cardOf, shownOf, type Look, type PartId } from "../parts/model.ts";
import type { FolderSetup } from "../../cv/moves/setup.ts";

/** what a field's take puts on the front, by the engine's take ids (next/setup.ts TAKES) */
const REST: Record<string, PartId[]> = { "next-due": ["coming"], due: ["coming"], open: ["working"], latest: ["changed", "files"], strip: ["photos"] };
const LOOK: Record<string, PartId[]> = { gallery: ["photos"], notebook: ["coming"], desk: ["coming"], workbench: ["changed", "working"], paper: ["files"] };
/** Sol's reading: the engine's own order for how a folder looks */
const READ: PartId[] = ["photos", "coming", "changed"];

export type Front = { line: string; due: boolean; part: PartId | null };

/** one part said in one line: a date as "Next: what · when", pictures by their newest names, a change by what and when */
function said(look: Look, p: PartId): string {
  if (p === "files") return look.files[0] ? `Newest: ${look.files[0].what}` : "";
  const x = look.seen.find((s) => s.part === p);
  if (!x?.items.length) return "";
  const i = x.items[0];
  if (p === "coming") return i.at ? `Next: ${i.what} · ${i.at}` : `Next: ${i.what}`;
  if (p === "photos") return x.items.slice(0, 3).map((y) => y.what).join(" · ");
  if (p === "changed") return i.at && i.at !== "now" ? `${i.what} · ${i.at}` : i.what;
  return x.words;
}

export function frontOf(look: Look | null | undefined, s: FolderSetup | null | undefined): Front {
  const base = cardOf(look);
  if (!look || !s?.read || s.read.empty) return { ...base, part: null };
  const shown = new Set<PartId>([...shownOf(look).parts, "files"]);
  const mine = (f: string, by: Record<string, PartId[]>) => { const x = s.fields.find((y) => y.field === f && y.by === "person"); return x ? by[x.take] ?? [] : []; };
  for (const p of [...mine("rest", REST), ...mine("look", LOOK), ...READ]) {
    if (!shown.has(p)) continue;   // a part the person hid never comes back on the front
    const line = said(look, p);
    if (line) return { line, due: base.due, part: p };
  }
  return { ...base, part: null };
}
