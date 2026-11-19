// The person's day (#1298): one helper for every "today" the Room, the tally and "later" read, on this machine's own
// clock, so an evening in ET is never tomorrow already.
/** the local day of a time, YYYY-MM-DD (pure but for the machine's zone) */
export const localDay = (t: number) => new Date(t).toLocaleDateString("sv-SE");
