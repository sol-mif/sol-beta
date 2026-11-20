// next.state (#1604, slices.md "The contract between face and engine"): the new face's whole beside-state in one message,
// { places, pos, zones, diaryToday, needs }, sent when a window asks (the face's wire asks on attach, as it asks
// home.places) and to every window when one of them changes or the switch turns on (parts/next.ts).
//   places      the move-in read's places (carry.ts, read only): the folders the plane can hold, each with its kind
//   pos, zones  SOL_HOME/next/pos.json and zones.json (pos.ts, zones.ts)
//   diaryToday  today's page (diary.ts)
//   needs       7a's ranked list (next/needs.ts, read by parts/next-calls.ts), only in the answer to one of Sol's own
//               windows; a push to every window leaves it out (the face reads next.needs for its asks)
//   notes       a store that could not be read and was set aside, in a person's words (only when one was)
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615); needs joined to 7a by franktsai2008-eng's agent.
import { carry, type Where } from "./carry.js";
import { readPos } from "./pos.js";
import { readZones } from "./zones.js";
import { dayOf, readDay } from "./diary.js";

/** `needs`: the ranked list's reader, given only for one of Sol's own windows (absent: the field is left out) */
export async function stateMsg(w: Where, needs?: () => Promise<unknown[]>) {
  const home = w.home, now = w.now ?? new Date();
  const p = readPos(home), z = readZones(home);
  const notes = [
    ...(p.aside ? [`Your places on the plane could not be read, so they start fresh; yours are kept aside as ${p.aside}.`] : []),
    ...(z.aside ? [`Your folders' zones could not be read, so they start fresh; yours are kept aside as ${z.aside}.`] : []),
  ];
  return {
    type: "next.state" as const,
    places: carry(w).places,
    pos: p.pos,
    zones: z.zones,
    diaryToday: { day: dayOf(now), lines: readDay(home, dayOf(now)) },
    ...(needs ? { needs: await needs().catch(() => []) } : {}),
    ...(notes.length ? { notes } : {}),
  };
}
