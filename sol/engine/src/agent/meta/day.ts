// Agents' meta (#1327, the calm pass, 2026-11-17): an agent's desk in the person's words, by code.
//   stepsOf(rules, classDays)   its steps as times of day (07:30 · every hour 08–22 · when a file comes), in the order
//                               of the day: a step with an hour first by its hour, then the ones that wait on something
//   roleOf(rules)               one role line of 12 words or fewer: what its first step does, then its last step's
// Pure: the sentences come in, the place masked by the caller's names.
import { whenOf } from "../sources/clock.js";
import { maskOf } from "./jobs.js";
import { ROLE_WORDS } from "./numbers.js";

export type DayStep = { when: string; at: number | null; what: string; folder: string; rule: string };
type R = { folder: string; rule: string; sentence: string; source: string; names: string[] };

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** what starts a step that is no hour: its source in words */
const ON: Record<string, string> = { folder: "when a file comes", people: "when someone answers", stickies: "when you press a sticky", date: "on its date" };

/** the words of a step (pure): its first clause, the time and the trigger taken out, at most `n` words */
export function whatOf(sentence: string, names: string[], n = 10): string {
  let s = maskOf(sentence, names)
    .replace(/\b(?:at|by)\s+(?=<time>)/gi, "")
    .replace(/<time>(\s*[–—-]\s*<time>)?/g, " ")
    .replace(/\bevery\s+\d+\s*min(ute)?s?\b/gi, " ")
    .replace(/\b(every|each)\s+(night|day|morning|evening)\b|\bon a class day\b|\bthe night before class\b|\bnight before\b|\bat\b(?=\s*[:;,]|\s*$)/gi, " ")
    .replace(/\(.*?\)/g, " ")
    // a masked name says nobody: "from <name>, <name> or about <place>" goes with it ("Dr. Ames", "Team 3" one name)
    .replace(/<name>(?:\.?\s+(?:[A-Z][a-z]+|\d+)\b)+/g, "<name>")
    .replace(/\s*\b(?:from|by|to|for|with|of|about)\s+<\w+>(?:\s*(?:,|or|and)\s*(?:about\s+)?<\w+>)*/gi, "")
    .replace(/(^|\s)<\w+>(?:['’]s)?(?=[\s,.;]|$)/g, "$1")
    .replace(/^[\s:;,–—-]+/, "");
  // its first clause of three words or more (a lone channel's name before a colon says no work); "Prof. X" is no end
  const parts = s.split(/\s*(?:[;:·]|(?<!\b[A-Z][a-z]{0,3})\.\s|→|->)\s*/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  s = (parts.find((p) => p.split(" ").length >= 3) ?? parts[0] ?? "").replace(/\b(at|on|in)\s*$/i, "").trim();
  const w = s.split(" ").filter(Boolean);
  const cut = loose(w.slice(0, n).join(" "));
  return cut ? cut.charAt(0).toUpperCase() + cut.slice(1) : "";
}
/** a cut never ends on a small word ("a new file in") or a comma */
const loose = (s: string) => s.replace(/(?:[,.\s]+|\s+(?:at|on|in|of|for|to|from|the|a|an|and|or|with|into|by|each|every))+$/i, "");

/** its steps as times of day (pure), in the order of the day */
export function stepsOf(rules: R[], classDays: (folder: string) => number[] | null = () => null): DayStep[] {
  const out = rules.map((r) => {
    const w = whenOf(r.sentence, classDays(r.folder));
    let when = ON[r.source] ?? "as it comes", at: number | null = null;
    if (w?.every) { when = `every ${w.every.mins >= 60 ? `${w.every.mins / 60 === 1 ? "hour" : `${w.every.mins / 60} h`}` : `${w.every.mins} min`} ${hm(w.every.from).slice(0, 2)}–${hm(w.every.to).slice(0, 2)}`; at = w.every.from; }
    else if (w?.times.length) { at = w.times[0].h * 60 + w.times[0].m; when = hm(at); }
    return { when, at, what: whatOf(r.sentence, r.names) || r.rule, folder: r.folder, rule: r.rule };
  });
  return out.map((s, i) => ({ s, i })).sort((x, y) => (x.s.at ?? 1e9) - (y.s.at ?? 1e9) || x.i - y.i).map((x) => x.s);
}

const count = (s: string) => s.split(" ").filter(Boolean).length;
/** a step's words whole, within `max` (pure): its first clause (", " · " and " · " then " end one), and when even that
 *  is longer, its last "from …" / "into …" phrases dropped one by one; never a phrase cut in its middle. "" when no
 *  whole phrase fits (orchestrator, 2026-11-17: role lines drop clauses, never cut mid-phrase) */
export function phraseOf(sentence: string, names: string[], max: number): string {
  let s = whatOf(sentence, names, Infinity).split(/\s*(?:,|;|\bthen\b|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean)[0] ?? "";
  for (;;) {
    if (count(s) <= max) return s;
    const i = s.search(/\s+(?:from|into|in|for|to|with|about|on|at|by|of|when|while)\s+(?!.*\s(?:from|into|in|for|to|with|about|on|at|by|of|when|while)\s)/i);
    if (i <= 0) return "";
    s = s.slice(0, i);
  }
}

/** one role line, ROLE_WORDS words or fewer (pure): its first step's first clause, and ", then" its last step's when
 *  that fits whole; a phrase is dropped, never cut */
export function roleOf(rules: R[], max = ROLE_WORDS): string {
  if (!rules.length) return "";
  const first = phraseOf(rules[0].sentence, rules[0].names, max);
  if (!first || rules.length === 1) return first;
  const room = max - count(first) - 1;
  const last = room >= 2 ? phraseOf(rules[rules.length - 1].sentence, rules[rules.length - 1].names, room) : "";
  return last && count(last) >= 2 && last.toLowerCase() !== first.toLowerCase() ? `${first}, then ${last.charAt(0).toLowerCase()}${last.slice(1)}` : first;
}
