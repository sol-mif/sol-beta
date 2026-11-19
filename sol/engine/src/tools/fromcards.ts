// The tools a seat is offered follow their cards (#1589). A card (sol/systems/records) may name the tools it offers an
// AI (`offers`); stations.mjs writes them beside the card's station into stations.json. In a mode its card's station has
// not reached, none of a card's tools is offered, whatever its own switch reads: a tester's Sol (product) is never
// offered a tool for a part still at concept, so its AI cannot name something the tester cannot find. In concept every
// station has been reached, so nothing is dropped there. A tool no card offers is left to its own switch, as before.
// The old way stays beside it: the switch tools.cards (its card stands at product, so it reads on in every mode; env
// SOL_TOOLS_CARDS=off turns it off) decides, and off, the list is exactly what each tool's own switch makes it.
import cards from "../stations.json" with { type: "json" };
import { onFor, stationsFrom, standsOn, type Mode, type Stage } from "../versions.js";
import { versionMode } from "../settings.js";

/** which card offers each tool and where that card stands (pure): from the stations table, a row's `offers`. A row the
 *  versions table leaves out (no station it knows) offers nothing here either */
export function offersFrom(raw: unknown): Map<string, { station: Stage; id: string }> {
  const out = new Map<string, { station: Stage; id: string }>();
  const { stages } = stationsFrom(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.hasOwn(stages, name)) continue;
    const r = row as Record<string, unknown>;
    if (!Array.isArray(r.offers)) continue;
    for (const t of r.offers) if (typeof t === "string") out.set(t, { station: stages[name], id: typeof r.id === "string" ? r.id : name });
  }
  return out;
}
/** each tool a card offers, by its name, with the card's station */
export const OFFERS = offersFrom(cards);

/** whether a tool may be offered in this mode (pure): one no card offers, always; one a card offers, when the card's
 *  station is at or past the mode (settled always; no mode yet: only settled) */
export const offeredIn = (name: string, mode: Mode | null, offers: ReadonlyMap<string, { station: Stage }> = OFFERS): boolean => {
  const o = offers.get(name);
  return !o || standsOn(o.station, mode);
};

/** the tools of `list` this mode may be offered (pure) */
export const keepFor = <T extends { name: string }>(list: T[], mode: Mode | null, offers: ReadonlyMap<string, { station: Stage }> = OFFERS): T[] =>
  list.filter((t) => offeredIn(t.name, mode, offers));

/** whether the cards decide (the switch tools.cards): env SOL_TOOLS_CARDS on/off first, else where its card stands */
export function toolsCards(): boolean {
  const e = (process.env.SOL_TOOLS_CARDS ?? "").trim().toLowerCase();
  if (e === "on" || e === "1" || e === "true") return true;
  if (e === "off" || e === "0" || e === "false") return false;
  return onFor("tools.cards", versionMode(), undefined);
}

/** the list as a seat is offered it now: through the cards while tools.cards is on, untouched while it is off */
export const byCards = <T extends { name: string }>(list: T[]): T[] => (toolsCards() ? keepFor(list, versionMode()) : list);
