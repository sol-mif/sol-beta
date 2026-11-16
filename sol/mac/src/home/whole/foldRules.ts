// The evening fold's rules (#797, plan Part C slice 34), pure, for Fold.tsx and the tests: what was missed and what
// tomorrow holds, read from Today (the list's things and the week).
import { lineOf, type Mark, type Thing } from "./today.ts";

const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** what was missed today: a thing that waited on you whose moment passed since this morning, not done (whole.md:
 *  never silently); one due before today was another day's (#873 C34-5) */
export function missedOf(things: Thing[], now: number): Thing[] {
  const d = new Date(now), from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return things.filter((t) => t.due !== undefined && t.due >= from && t.due < now && t.waitsOn === "you" && t.state !== "done");
}
/** what needs you, on the fold too (#873 C34-2, the four on every screen of Home): Today's own one line, and the card
 *  that stands in front of the list, by its edge */
export function needsOf(today: { needs: string[]; moving: string[] } | null, front: Thing | undefined): { line: string; front: string | null } | null {
  if (!today) return null;
  const [a, b] = lineOf(today.needs.length, today.moving.length);
  return { line: [a, b].filter(Boolean).join(" "), front: front ? front.card?.edge ?? front.words : null };
}
/** what tomorrow holds, in one line: the week's marks on tomorrow, in order */
export function tomorrowOf(week: Mark[], now: number): string {
  const d = new Date(now), from = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), to = from + 864e5;
  const ms = week.filter((m) => m.at >= from && m.at < to).sort((a, b) => a.at - b.at);
  return ms.length ? ms.map((m) => `${m.label} ${hm(m.at)}`).join(" · ") : "nothing on it yet";
}

