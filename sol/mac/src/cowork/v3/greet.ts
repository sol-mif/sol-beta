// Cowork v3 (fr-30): the front's greeting, by the local hour of this Mac. The front reads the clock again every minute. Pure, so the engine's tests read it too
// (sol/engine/test/v3-gap-greeting.test.ts).
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";
/** the part of the day at a local hour: night 22 to 5, morning 5 to 12, afternoon 12 to 18, evening 18 to 22 */
export const partOfDay = (h: number): PartOfDay => (h < 5 || h >= 22 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
/** the greeting's words ("Good night" says goodbye, so the night has its own) */
export const greeting = (d: Date, name = ""): string => {
  const p = partOfDay(d.getHours());
  return `${p === "night" ? "Up late" : `Good ${p}`}${name ? `, ${name}` : ""}.`;
};
