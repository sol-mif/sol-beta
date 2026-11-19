// The SF trip's plan, sf-trip/plan.md: one row per person who replied or met, with a day, a place and what to ask.
// The engine keeps the rows (who is in, the day proposed); the run fills "where" and "what to ask" from the person's
// file, and Marco may change any cell by hand: a cell already filled is kept as it is.
//
// The trip is Nov 26–30, 2026. Thanksgiving is Thursday Nov 26, so the days offered are Sat Nov 28, Sun Nov 29,
// Mon Nov 30, then Fri Nov 27; never the 26th.
import type { Person } from "./people.js";

export const TRIP_DAYS = ["Sat Nov 28", "Sun Nov 29", "Mon Nov 30", "Fri Nov 27"];
export const PER_DAY = 3;
export type Row = { slug: string; who: string; day: string; where: string; ask: string; state: string };

/** the rows of a plan.md table, by the person's file name in the "who" link (pure) */
export function parsePlan(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.split("\n")) {
    if (!/^\|/.test(line) || /^\|\s*-/.test(line) || /^\|\s*who\s*\|/i.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 5) continue;
    const slug = /\(\.\.\/people\/([a-z0-9-]+)\.md\)/.exec(c[0])?.[1];
    if (!slug) continue;
    out.push({ slug, who: c[0], day: c[1], where: c[2], ask: c[3], state: c[4] });
  }
  return out;
}

/** the plan, kept (pure): the people who replied or met, each with their row as it was, a new one with a day that
 *  has room (PER_DAY a day, in TRIP_DAYS order) */
export function planRows(people: Person[], before: Row[]): Row[] {
  const going = people.filter((p) => ["replied", "met", "follow-up"].includes(p.state));
  const was = new Map(before.map((r) => [r.slug, r]));
  const used = new Map<string, number>();
  for (const r of before) if (going.some((p) => p.slug === r.slug)) used.set(r.day, (used.get(r.day) ?? 0) + 1);
  return going.map((p) => {
    const old = was.get(p.slug);
    const state = p.state === "replied" ? "replied: to book" : p.state;
    if (old) return { ...old, state };
    const day = TRIP_DAYS.find((d) => (used.get(d) ?? 0) < PER_DAY) ?? "to agree";
    used.set(day, (used.get(day) ?? 0) + 1);
    return { slug: p.slug, who: `[${p.name}](../people/${p.slug}.md)`, day, where: "-", ask: "-", state };
  });
}

const cell = (s: string) => (s || "-").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
export function planMd(rows: Row[]): string {
  return [
    "# SF, Nov 26–30: the plan",
    "",
    "Who said yes, which day, where, what to ask. Thanksgiving is Thu Nov 26: the days offered are Sat 28, Sun 29, Mon 30, then Fri 27.",
    "The agent adds a row when someone replies; a cell you fill is kept.",
    "",
    "| who | day | where | what to ask | state |",
    "|-----|-----|-------|-------------|-------|",
    ...rows.map((r) => `| ${r.who} | ${cell(r.day)} | ${cell(r.where)} | ${cell(r.ask)} | ${cell(r.state)} |`),
    "",
  ].join("\n");
}
