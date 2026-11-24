// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// Seats' phrases (round 6 · M2, #1615): open Settings › Seats and sign-ins, at an account or seat when one is named
// ("seats", "my sign-ins", "seats aws"). Signing in itself is never said: it happens on the account's own page.
// Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { M, type Phrase } from "../core.ts";
import { me } from "../moves/seats.ts";

/** the seat or account the words name, by its id or its name */
function rowOf(w: string): string | undefined {
  const p = me(); if (!p) return undefined;
  const t = w.toLowerCase();
  return [...p.seats, ...p.accts].find((x) => x.id === t || x.n.toLowerCase().includes(t))?.id;
}

const phrases: Phrase[] = [
  { hears: /^(?:open |see )?(?:my |the )?(?:seats|seats and sign-?ins|sign-?ins|plans and sign-?ins)$/, run: () => M.see_seats() },
  { hears: /^(?:open |see )?(?:seats|sign-?ins?) (?:for |at )?(.+)$/, run: (m) => { const r = rowOf(m[1]); return r ? M.see_seats(r) : null; } },
];
export default phrases;
