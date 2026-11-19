// Your setup, side by side (#1423; decided 2026-11-17 on #1342). The explorer reads the person's own AI setup
// (explore.mjs readSetup: rules files line by line, the settings Claude Code and Codex run with, hooks, lists, memory,
// MCP servers) into `setup`; this turns it into the rows the onboarding's side-by-side draws, each beside Jelly's own
// layer. Pure, no React; tested in src/onboard-setup.test.ts.
//   agree   both say it: one merged row, nothing to press
//   differ  both speak to it and say different things: the only rows that ask (at most five; the rest wait in Home)
//   mine    theirs alone: it comes in as it is (a team's rules are used and stay in the team's repository)
//   adds    Jelly's alone: shown as what Jelly adds
// Who wins is never a fixed order: the person settles each disagreement (Yours, Jelly's, try both, later), and under
// "later" their own setting holds. Jelly's side is Jelly's own layer, never a judgement of the person's setup; its words
// are what Jelly does, its matchers name only Jelly's own subjects.

export type Owner = "you" | "team";
export type SetupRead = {
  files: { src: string; tool: string; owner: Owner; n: number; lines: { n: number; text: string }[] }[];
  settings: { k: string; v: string; src: string; tool: string; shared: boolean }[];
  hooks: { event: string; on: string | null; what: string; src: string }[];
  lists: { k: string; n: number; src: string }[];
  kept: { k: string; n: number; names?: string[]; src: string }[];
  mcp: { name: string; src: string; tool: string }[];
};
export type Kind = "agree" | "differ" | "mine" | "adds";
export type Row = { id: string; group: string; kind: Kind; yours?: string; src?: string; owner?: Owner; shared?: boolean; jelly?: string; note?: string; later?: boolean };
/** a choice on a disagreement: their own, Jelly's (in Jelly's sessions only, or everywhere for a shared setting), both
 *  tried across new sessions (a recorded trial, judged by what they keep), or later (theirs holds until they press) */
export type Choice = "yours" | "jelly" | "jelly-here" | "jelly-everywhere" | "try" | "later";
/** how far Jelly may change the person's own files from here on: the person's to set, up to "anything and everything" */
export type Reach = "read" | "show" | "do";
export type Setup = { at: string; rows: Row[]; choices: Partial<Record<string, Choice>>; files: Reach };

export const GROUPS = ["How it talks to you", "What it does without asking", "Which model, how hard it thinks", "When a long session gets full", "Your rules", "What it knows and uses", "What Jelly adds"] as const;
/** at most this many disagreements are asked in the onboarding; the others wait in Home's "Your AI" */
export const ASK_AT_MOST = 5;

// Jelly's own layer, in words a person reads. `agrees` and `differs` say when a line of theirs speaks to the same
// subject, with the AI acting (`says` below); a line that matches neither comes in as one of their rules.
const JELLY = {
  recap: { group: GROUPS[0], text: "A short recap when a turn changed files",
    differs: /\b(no|without|skip|never|don'?t)\b[^.]*\b(summar\w*|recap\w*)\b|\bterse\b|\bshort answers?\b/i, agrees: /\b(summar\w*|recap\w*)\b/i },
  showFirst: { group: GROUPS[1], text: "Shows you the change first, then acts",
    differs: /\b(by yourself|on your own|without asking|automatically|don'?t ask)\b/i, agrees: /\b(ask|confirm|check with me|show me)\b[^.]*\b(before|first)\b/i },
  guard: { group: GROUPS[1], text: "Never pushes to main", agrees: /\bnever (force[- ])?push\w*\b[^.]*\b(main|master)\b|\bdon'?t push\b[^.]*\b(main|master)\b/i },
  model: { group: GROUPS[2], text: "Picks the model per kind of work, and learns which you keep" },
  renewal: { group: GROUPS[3], text: "Reads your compaction point and hands over to a fresh copy before it" },
} as const;
// A line speaks to one of Jelly's subjects only when the AI is the one acting in it (#1425): an imperative addressed to
// it ("Commit without asking"), or it as the clause's subject ("You never push", "Claude should ask first"). A clause
// whose subject is someone else ("Test: the reader can act without asking", "a user should confirm first") is the
// person's own rule about something else, whatever words it shares with Jelly's.
/** the clauses of a line: its sentences, and what follows a label's colon or a dash */
const clausesOf = (t: string) => t.split(/[.;:!?]+(?=\s|$)|\s[—–]\s/).map((c) => c.trim()).filter(Boolean);
/** words in front of an imperative that leave it one ("Please never…", "Always ask…", "Don't…") */
const LEAD = /^(please|always|never|just|then|also|only|so|don'?t|do not)\s+/i;
/** the AI as a subject */
const AI = /^((the|your|an?)\s+)?(you|claude|codex|agents?|assistants?|ai|models?)\b/i;
/** a subject that is someone or something else: a determiner or pronoun starts a statement, not an instruction */
const OTHER = /^(the|a|an|this|that|these|those|each|every|any|some|all|our|my|your|their|his|her|its|i|we|they|he|she|it|one|readers?|users?|teams?|people|persons?|someone|somebody|everyone|everybody|anyone|nobody|others|reviewers?|customers?|clients?|humans?|developers?|colleagues?)\b/i;
/** a subject that is a thing: a plural acronym ("PRs merge…") or a plural noun ("Builds run…") (#1530); never a word
 *  ending in -ss, -us or -as ("Process…", "Focus…", "Alias…"), nor an adverb ("Always", "Afterwards", "Nowadays") */
const THING = /^([A-Z]{2,}s|[A-Za-z][a-z]*[^asu's]s)$/;
const NOT_THING = /^(perhaps|unless|otherwise|besides|thus|plus|yes|this|has|does|its|lets)$|(wards|days|times|ways)$/i;
/** an acronym's verb ("CI deploys…", "QA runs…"): the work a tool does, never the person's object ("DM users…") */
const TOOL_VERB = /^(deploys|runs|merges|builds|pushes|commits|ships|releases|publishes|tests|checks|fails|passes|triggers|posts|sends|creates|updates|rebases|approves|blocks|handles|lints|formats|restarts)$/i;
/** a verb that follows a subject ("Users can…", "Reviewers should…") */
const AUX = /^(can|could|should|shall|will|would|may|might|must|is|are|was|were|has|have|had|does|did|needs?|gets?|wants?)$/i;
/** is the AI the one acting in this part of a clause */
export function aiActs(part: string): boolean {
  let c = part.trim().replace(/^["'“‘(\[]+/, "");
  while (LEAD.test(c)) c = c.replace(LEAD, "");
  if (AI.test(c)) return true;
  if (OTHER.test(c)) return false;
  const [first = "", second = ""] = c.split(/\s+/);
  if (THING.test(first) && !NOT_THING.test(first)) return false;
  if (/^[A-Z]{2,}$/.test(first) && TOOL_VERB.test(second)) return false;
  return !AUX.test(second);
}
/** does a line say this, with the AI as the actor: each hit is judged from the start of its own comma-part, so in
 *  "If the tests pass, commit without asking" the actor of "without asking" is the one told to commit */
export function says(re: RegExp | undefined, text: string): boolean {
  if (!re) return false;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return clausesOf(text).some((c) => [...c.matchAll(g)].some((m) => aiActs(c.slice(c.lastIndexOf(",", m.index!) + 1))));
}
const ADDS = ["Long work kept alive across sessions", "Learns what works for you; every change can be undone", "Tells you once when something needs you"];

const SETTING_WORDS: Record<string, (v: string) => string> = {
  model: (v) => `${v[0].toUpperCase()}${v.slice(1)} for everything`,
  effortLevel: (v) => `Thinks at "${v}" effort`,
  model_reasoning_effort: (v) => `Codex thinks at "${v}" effort`,
  autoCompactWindow: (v) => `Compacts at ${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`,
  defaultMode: (v) => `Permission mode "${v}"`,
  approval_policy: (v) => `Codex approvals "${v}"`,
  sandbox_mode: (v) => `Codex sandbox "${v}"`,
  outputStyle: (v) => `Output style "${v}"`,
  alwaysThinkingEnabled: (v) => (v === "true" ? "Always thinks first" : "Thinking off by default"),
};
/** permission modes that let a session act without asking (Claude Code's and Codex's own names) */
const ACTS_ALONE = /^(acceptEdits|bypassPermissions|dontAsk|auto|never|on-failure|danger-full-access)$/;

/** the rows, in the order the person reads them: grouped, and inside the disagreements the one their next session would
 *  meet first (a setting every session starts with, then their own rules, then a repository's) */
export function rowsOf(s: SetupRead | null | undefined): Row[] {
  if (!s) return [];
  const rows: Row[] = [];
  const met = new Set<string>();
  // the settings: every session starts with them, and each one also runs the person's terminal
  for (const x of s.settings) {
    const id = `${x.src}#${x.k}`, yours = (SETTING_WORDS[x.k] ?? ((v: string) => `${x.k}: ${v}`))(x.v);
    if (x.k === "model" || x.k === "effortLevel" || x.k === "model_reasoning_effort") { met.add("model"); rows.push({ id, group: GROUPS[2], kind: "differ", yours, src: x.src, owner: "you", shared: x.shared, jelly: JELLY.model.text }); }
    else if (x.k === "autoCompactWindow") { met.add("renewal"); rows.push({ id, group: GROUPS[3], kind: "agree", yours, src: x.src, owner: "you", jelly: JELLY.renewal.text }); }
    else if (x.k === "defaultMode" || x.k === "approval_policy" || x.k === "sandbox_mode") {
      met.add("showFirst");
      rows.push(ACTS_ALONE.test(x.v) ? { id, group: GROUPS[1], kind: "differ", yours, src: x.src, owner: "you", shared: x.shared, jelly: JELLY.showFirst.text }
        : { id, group: GROUPS[1], kind: "agree", yours, src: x.src, owner: "you", jelly: JELLY.showFirst.text });
    } else rows.push({ id, group: GROUPS[0], kind: "mine", yours, src: x.src, owner: "you", shared: x.shared });
  }
  // the rules files, the person's own before a repository's
  const files = [...s.files].sort((a, b) => (a.owner === b.owner ? 0 : a.owner === "you" ? -1 : 1));
  for (const f of files) for (const l of f.lines) {
    const id = `${f.src}:${l.n}`, base = { id, yours: l.text, src: `${f.src}:${l.n}`, owner: f.owner };
    const hit = (Object.keys(JELLY) as (keyof typeof JELLY)[]).find((k) => { const j = JELLY[k] as { agrees?: RegExp; differs?: RegExp }; return says(j.differs, l.text) || says(j.agrees, l.text); });
    if (!hit) { rows.push({ ...base, group: GROUPS[4], kind: "mine" }); continue; }
    const j = JELLY[hit] as { group: string; text: string; agrees?: RegExp; differs?: RegExp };
    met.add(hit);
    const differs = says(j.differs, l.text);
    // a team's line is used as it is; a difference with it is the team's to settle, never one of the person's presses
    if (differs && f.owner === "team") rows.push({ ...base, group: j.group, kind: "mine", note: "used as it is; a difference with Jelly goes to your team" });
    else rows.push({ ...base, group: j.group, kind: differs ? "differ" : "agree", jelly: j.text });
  }
  // hooks and lists already run in every session Jelly starts (they add up across sources); they come in as they are
  for (const h of s.hooks) rows.push({ id: `${h.src}#hook:${h.event}:${h.what}`, group: GROUPS[1], kind: "mine", yours: `${h.what} runs before ${h.on ?? "every"} ${h.event === "PreToolUse" ? "tool use" : h.event}`, src: h.src, owner: "you", note: "already runs in Jelly's sessions" });
  for (const l of s.lists) rows.push({ id: `${l.src}#${l.k}`, group: GROUPS[1], kind: "mine", yours: `${l.n} command${l.n === 1 ? "" : "s"} ${l.k === "deny" ? "refused" : l.k === "allow" ? "allowed" : `that ask${l.n === 1 ? "s" : ""}`}`, src: l.src, owner: "you", note: "already applies in Jelly's sessions" });
  const mcp = new Map<string, string[]>();
  for (const m of s.mcp) mcp.set(m.tool, [...(mcp.get(m.tool) ?? []), m.name]);
  for (const [tool, names] of mcp) rows.push({ id: `mcp:${tool}`, group: GROUPS[5], kind: "mine", yours: `${names.join(", ")}${tool === "Codex" ? " for Codex" : ""}`, src: s.mcp.find((m) => m.tool === tool)!.src, owner: "you" });
  for (const k of s.kept) rows.push({ id: `kept:${k.k}`, group: GROUPS[5], kind: "mine", yours: k.k === "memory" ? `${k.n} memory note${k.n === 1 ? "" : "s"}` : `${k.n} ${k.k}${k.names?.length ? `: ${k.names.join(", ")}` : ""}`, src: k.src, owner: "you" });
  // what Jelly adds; and a subject of Jelly's their setup never spoke to is added too
  if (!met.has("recap")) rows.push({ id: "jelly:recap", group: GROUPS[6], kind: "adds", jelly: JELLY.recap.text });
  if (!met.has("showFirst")) rows.push({ id: "jelly:show-first", group: GROUPS[6], kind: "adds", jelly: JELLY.showFirst.text });
  ADDS.forEach((t, i) => rows.push({ id: `jelly:add-${i}`, group: GROUPS[6], kind: "adds", jelly: t }));
  // at most five disagreements are asked now, in the order above; the rest wait in Home
  let asked = 0;
  for (const r of rows) if (r.kind === "differ" && ++asked > ASK_AT_MOST) r.later = true;
  return GROUPS.flatMap((g) => rows.filter((r) => r.group === g));
}

/** the choices a disagreement offers: a setting shared with the terminal can also be Jelly's in Jelly's sessions only */
export const choicesOf = (r: Row): Choice[] => (r.shared ? ["yours", "jelly-here", "jelly-everywhere", "try", "later"] : ["yours", "jelly", "try", "later"]);
export const CHOICE_WORDS: Record<Choice, string> = { yours: "Yours", jelly: "Jelly's", "jelly-here": "Jelly's, in Jelly only", "jelly-everywhere": "Jelly's everywhere", try: "Try both, see which I keep", later: "Later: mine holds" };
/** what a settled row says under the two lines: which one won, and what that changes beyond Jelly */
export function settledLine(_r: Row, c: Choice): string {
  if (c === "try") return "Both take turns across your next sessions; in a week Jelly shows which one you kept.";
  if (c === "later") return "Yours holds; Home asks again when you want.";
  if (c === "yours") return "Yours stands.";
  if (c === "jelly-here") return "Jelly's in Jelly's sessions; your terminal keeps yours.";
  if (c === "jelly-everywhere") return "Jelly's everywhere, your terminal too; Home has the undo.";
  return "Jelly's from now; Home has the undo.";
}
/** the disagreements still open in the onboarding (later ones wait in Home, so they are not counted here) */
export const openOf = (rows: Row[], choices: Partial<Record<string, Choice>>) => rows.filter((r) => r.kind === "differ" && !r.later && !choices[r.id]);
/** the setup as the record keeps it: the rows as read, each choice, and the reach. A disagreement nobody pressed is
 *  written as "later": theirs holds */
export function setupOf(rows: Row[], choices: Partial<Record<string, Choice>>, files: Reach, at = new Date().toISOString()): Setup {
  const all: Partial<Record<string, Choice>> = {};
  for (const r of rows) if (r.kind === "differ") all[r.id] = choices[r.id] ?? "later";
  return { at, rows, choices: all, files };
}
export const REACH: [Reach, string, string][] = [
  ["read", "leave them", "I read your AI's rules and settings and never change them."],
  ["show", "ask me first", "I show each change to your AI's rules or settings; you press, I write it, with an undo."],
  ["do", "change them", "I change your AI's rules and settings when I'm sure; each change can be undone."],
];
