// What the watch moment says while the one reader works (#1223, Marco 2026-11-15 ~01:45: "there should be an actual
// screen where you can visually see what it's checking through"). The reader reports each stop as it goes (explore.mjs:
// the source open, the rows looked at, each fact found, each skip with its reason, #1217); this turns one stop's report
// into the rows the watch draws under the lens: the source open now, each thing found with where it was read (its proof),
// and each thing left unread with why. Pure, no React; tested in src/onboard-watch.test.ts.
import type { Found, Stop } from "./sort";

export type Row = { k: "open" | "fact" | "skip"; id: string; text: string; proof: string };
type Why = NonNullable<Stop["skips"]>[number]["why"];
const WHY: Record<Why, string> = { denied: "left closed, as you said", unreachable: "could not be reached", nothing: "nothing there" };

/** the rows for the stop being read: what is open, the last things found (at most `n`, newest last), what was skipped */
export function watchRows(stop: Pick<Stop, "state" | "open" | "read" | "skips"> | null | undefined, shown: Found[], n = 5): Row[] {
  const rows: Row[] = [];
  if (stop?.state === "refused") return [{ k: "skip", id: "refused", text: "this whole place", proof: "the computer said no; it stays out" }];
  if (stop?.open) rows.push({ k: "open", id: "open", text: stop.open, proof: stop.read ? `open now · ${stop.read} looked at` : "open now" });
  for (const f of shown.filter((x) => x.k !== "name").slice(-n))
    rows.push({ k: "fact", id: f.id, text: f.when ? `${f.v}, ${f.when}` : f.v, proof: `read in ${f.src || "this computer"}${f.via && f.via !== f.src ? `, through ${f.via}` : ""}` });
  for (const s of stop?.skips ?? []) rows.push({ k: "skip", id: `skip-${s.what}`, text: s.what, proof: WHY[s.why] ?? s.why });
  return rows;
}
