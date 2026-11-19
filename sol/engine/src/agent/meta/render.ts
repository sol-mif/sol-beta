// Agents' meta (#1327, pass 2): one place's rule, as written into its policy.md. A kept agent's rule is its trigger's
// phrase and the job with the place put in; a grouped rule keeps the person's own sentence (`base`). Learned lines go
// after it, " Always: …." each, for every place (learned in two places) or for that place only. Nothing here names a
// time a clock would read: a job's "16:00" is written "16h00", so only the place's own trigger fires it.
import type { Agent, PlaceRef } from "../agents.js";
import { appendRule, bulletOf, lineOf, rewriteRule } from "./policy.js";
import { mandateOf } from "./when.js";

const noClock = (s: string) => s.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, "$1h$2");
/** the job for one place (pure): "<place>" filled in, else ", for <place>" after it */
export const jobFor = (template: string, name: string) => (template.includes("<place>") ? template.replace(/<place>/g, name) : `${template}, for ${name}`);

/** the rule's source and sentence for one place (pure) */
export function sentenceFor(ag: Pick<Agent, "template" | "job" | "learned">, ref: Pick<PlaceRef, "place" | "name" | "trigger" | "base">): { source: string; sentence: string } {
  const mine = (ag.learned ?? []).filter((l) => l.place === null || l.place === ref.place);
  const say = (base: string) => mine.filter((l) => !base.toLowerCase().includes(l.line.toLowerCase())).map((l) => ` Always: ${l.line}.`).join("");
  // a line the person's own sentence already says (a grouped rule's extras on top of the job's core) is not said twice
  if (ref.base !== undefined || ref.trigger.kind === "own") { const base = (ref.base ?? "").replace(/\s+Always: .*$/, ""); return { source: "", sentence: `${base}${say(base)}` }; }
  const learned = say("");
  const job = noClock(jobFor(ag.template ?? ag.job, ref.name));
  const t = ref.trigger;
  if (t.kind === "input") return { source: t.source, sentence: `a new file in ./ → ${job}.${learned}` };
  const when = t.leadDays === 0 ? `on each date of ${ref.name}` : `${t.leadDays} day${t.leadDays === 1 ? "" : "s"} before each date of ${ref.name}`;
  return { source: "date", sentence: `${when}, at ${t.hour}h → ${job}.${learned}` };
}
/** write a new place's rule (appended); its rule id and the line written */
export function writePlace(home: string, ag: Agent, ref: Omit<PlaceRef, "rule">, ownSource = "clock"): { rule: string; line: string } {
  const s = sentenceFor(ag, ref), source = s.source || ownSource, sentence = s.sentence;
  const m = mandateOf(ref.first ?? ref.trust);
  const line = bulletOf(m.mode, m.rung, source, sentence);
  return { rule: appendRule(home, ref.folder, line), line };
}
/** write a place's rule again after the agent changed (a learned line, a kept change, a trust lifted); the line before */
export function rewritePlace(home: string, ag: Agent, ref: PlaceRef, withTrust = false, base?: string): string | null {
  // a grouped rule: its sentence as it stands now (the person may have edited it by hand), learned lines after it
  const now = base !== undefined ? base : ref.trigger.kind === "own" ? /\]\s+[a-z][a-z0-9-]*\s*:\s*(.+?)\s*$/i.exec(lineOf(home, ref.folder, ref.rule) ?? "")?.[1] : undefined;
  const { sentence } = sentenceFor(ag, now !== undefined ? { ...ref, base: now } : ref);
  return rewriteRule(home, ref.folder, ref.rule, { sentence, ...(withTrust ? mandateOf(ref.first ?? ref.trust) : {}) });
}
