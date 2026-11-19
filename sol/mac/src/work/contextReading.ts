// A personal reading of one part of the context (#647 round 5's pins, Marco 2026-11-07: the legend's rows "would be nice
// if they could hover and get personal insights on each part"). One number and a few words: what fills that part in
// this session, from what the face already has (the part's tokens, the turns so far, the session's commands and
// skills). Under it, with work.liveContext on (#683, #1519), the engine's own breakdown of the part from its full count:
// its biggest few (which tools' outputs, which memory files, which skills), each as its share of the part. Without the
// engine's answer the head stands alone, as before.
export type PartId = "talk" | "sys" | "mem" | "kit" | "rest";
export type Reading = { n: string; words: string };
/** the engine's breakdown of one part (work.context.part, overview.ts partOf): tokens, biggest first, the rest summed */
export type PartReading = { part: PartId; lines: { name: string; tokens: number }[]; rest: number; total: number; at: number };
/** the breakdown's rows as the card shows them (pure): each line's share of the part, "<1%" for a sliver, and the rest
 *  as one row when there is any */
export function shares(r: PartReading): { name: string; pct: string }[] {
  const of = (n: number) => { const p = (n / (r.total || 1)) * 100; return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`; };
  return [...r.lines.map((l) => ({ name: l.name, pct: of(l.tokens) })), ...(r.rest > 0 ? [{ name: "the rest", pct: of(r.rest) }] : [])];
}
export type Seen = { tokens: number | null; window: number; turns: number; skills: number; commands: number; guess: boolean };

const pct = (n: number, w: number) => Math.max(0, Math.round((n / (w || 1)) * 100));
// tokens mean nothing to most people ("61k of 200k" confused, Marco 2026-11-06), pages do: a page is about 500 words,
// about 650 tokens. Always an estimate, so always "~".
const pages = (n: number) => `~${Math.max(1, Math.round(n / 650))}`;

/** the reading of part `id` in this session, from what the face has seen (the stub; #683 brings the engine's) */
export function readingOf(id: PartId, s: Seen): Reading {
  if (s.tokens === null) return { n: "?", words: "not split out yet" };
  const t = s.tokens, a = s.guess ? "~" : "";
  switch (id) {
    case "talk":
      return s.turns > 0
        ? { n: `${a}${pct(t / s.turns, s.window) || "<1"}%`, words: `each back-and-forth, of ${s.turns} so far` }
        : { n: `${a}${pct(t, s.window)}%`, words: "the talk so far, with what it read" };
    case "sys":
      return { n: pages(t), words: "pages on how to work and what to use, every session" };
    case "mem":
      return { n: pages(t), words: "pages of your notes, read before your first word" };
    case "kit":
      return { n: String(s.skills || s.commands), words: s.skills ? "skills it can call on here" : "commands it knows here" };
    case "rest":
      return { n: `${a}${pct(t, s.window)}%`, words: "counted, not split by part yet" };
  }
}
