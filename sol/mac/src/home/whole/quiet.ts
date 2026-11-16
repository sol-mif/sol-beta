// Calm (#795, plan Part C slice 32; home/whole.md pain 6, scene 10, pick 4 a), behind sol.home.whole. The pure half:
// when Home is calm (nothing waits on you), and the one quiet line under "Nothing needs you.": what is moving on its
// own, then the next thing on your week. Nothing here draws; Calm.tsx does. (calm.ts until the fix for #859: beside
// Calm.tsx it was the same name on a Mac's disk, which does not tell case apart.)
import { JELLY, LOOKS, SHADE } from "../../kit/tokens.ts";
import { dur, ease } from "../../motion.ts";
import type { Mark, Thing, Today } from "./today";

/** the breath, 4800 ms ease-in-out (system/ui.md "Motion": breath 4800, NEW; "halo at rest, Home's line → breath").
 *  Read by name from motion.ts (#763), the one place timing lives, so the ×4 slow toggle slows it too. */
export const BREATH = { get ms() { return dur("breath"); }, ease: ease("breath") } as const;

/** Home is calm when the list has loaded and nothing on it waits on you (home/whole.md "Healthy things take no space") */
export const isCalm = (today: Today | null | undefined): boolean => !!today && today.needs.length === 0;

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

/** a time on the week as the person says it: "today 14:00", "tomorrow 14:00", "Thursday 14:00" */
export function dayOf(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 864e5);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${day} ${hm(d)}`;
}

/** the next thing on the week that is yours to be at or do: an event, the big one, or a thing for you, from now on */
export function nextOf(week: Mark[], now: number): Mark | null {
  return week.filter((m) => (m.kind === "event" || m.kind === "big" || m.kind === "you" || m.kind === "kept") && m.at >= now).sort((a, b) => a.at - b.at)[0] ?? null;
}

/** the quiet line under "Nothing needs you." (scene 10: "Bio notes are being made, 9 of 12. Your next thing is the chem
 *  lab, Thursday 14:00."): what moves on its own, nearest due first, then the next thing on the week. Empty when there
 *  is neither, and Home is the one line alone. */
export function calmLine(today: Today, things: Map<string, Thing>, now: number): string {
  const moving = today.moving.map((id) => things.get(id)).filter((t): t is Thing => !!t)
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  const parts: string[] = [];
  if (moving.length === 1) parts.push(`${cap(moving[0].words)} is moving on its own.`);
  else if (moving.length > 1) {
    const rest = moving.length - 1;
    parts.push(`${cap(moving[0].words)} and ${rest === 1 ? moving[1].words : `${(WORDS[rest] ?? String(rest)).toLowerCase()} more`} are moving on their own.`);
  }
  const next = nextOf(today.week, now);
  // the mark's label as it is, no article (#859 C32-4: "the Mum's birthday" read wrong)
  if (next) parts.push(`Your next thing: ${next.label}, ${dayOf(next.at, now)}.`);
  return parts.join(" ");
}

/** the kit's breath (#859 C32-1): the halo's take at rest (LOOKS.halo.states.rest, "breath") gives the glow its light,
 *  and the glass's blur (SHADE.blur) its softness; nothing here is typed by eye but the pools' fall from the centre */
const TAKE = LOOKS.halo.takes[LOOKS.halo.states.rest];
export const GLOW = { blur: SHADE.blur, light: TAKE.light } as const;
// each pool's stops as shares of the take's light: the shape of the fall, not its strength
const WARM_FALL = [1 / 3, 1 / 5, 1 / 12] as const, GREEN_FALL = [1 / 6, 1 / 10] as const;

/** the glow the glass breathes: the jelly's colours as two soft pools (pick 4 a), the warm one wide and the green one
 *  smaller and off-centre, a half breath behind it; `a` scales their light */
export function breathOf(a = 1): [string, string] {
  const [, pink, orange, , yellow, green] = JELLY.six;
  const al = (h: string, share: number) => `${h}${Math.round(Math.min(1, GLOW.light * share * a) * 255).toString(16).padStart(2, "0")}`;
  return [
    `radial-gradient(closest-side, ${al(pink, WARM_FALL[0])}, ${al(orange, WARM_FALL[1])} 45%, ${al(yellow, WARM_FALL[2])} 70%, transparent)`,
    `radial-gradient(closest-side, ${al(green, GREEN_FALL[0])}, ${al(yellow, GREEN_FALL[1])} 55%, transparent)`,
  ];
}
