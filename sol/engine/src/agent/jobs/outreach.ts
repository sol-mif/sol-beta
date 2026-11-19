// Outreach for the jobs folder: the variants (named recipes for a first message), the drafts, and what he changed
// before he sent. The agent never sends: it writes a draft, he copies it into his own mail or LinkedIn, sends, and
// presses "sent". What he sent is the draft file as it is at that press; the agent's own words are kept beside it.
//
//   outreach/variants/<name>.md        a recipe: status (active, proposed, retired), opener, ask, length, channel,
//                                      what it changes, since, and notes on his voice the Sunday lesson keeps up to date
//   outreach/drafts/<person>.md        the draft he edits and sends (and <person>-follow-up.md, <person>-thanks.md)
//   outreach/drafts/<person>.agent.md  the agent's words, as first written (the difference is the lesson material)
//   outreach/sent/<person>.md          what he sent, kept at his press
//   outreach/edits.jsonl               one line per sent message: the draft, what was sent, and the difference
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export const VARIANT_FIELDS = ["status", "opener", "ask", "length", "channel", "changes", "since"] as const;
export type VariantStatus = "active" | "proposed" | "retired" | "dropped";
export type Variant = { name: string; status: VariantStatus; opener: string; ask: string; length: string; channel: string; changes: string; since: string; notes: string };

export function parseVariant(name: string, text: string): Variant {
  const v: Variant = { name, status: "active", opener: "", ask: "", length: "", channel: "", changes: "", since: "", notes: "" };
  const notes: string[] = [];
  let head = true;
  for (const line of text.split("\n")) {
    if (/^#\s+/.test(line) && head) continue;
    const f = head ? /^\s*[-*]\s+([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line) : null;
    const k = f?.[1].toLowerCase();
    if (f && (VARIANT_FIELDS as readonly string[]).includes(k!)) {
      if (k === "status") v.status = (["active", "proposed", "retired", "dropped"].includes(f[2].toLowerCase()) ? f[2].toLowerCase() : "active") as VariantStatus;
      else (v as any)[k!] = f[2];
      continue;
    }
    if (/^##\s+/.test(line)) head = false;
    if (!head || line.trim()) { head = head && !line.trim(); notes.push(line); }
  }
  v.notes = notes.join("\n").trim();
  return v;
}
export function variantMd(v: Variant): string {
  return [`# ${v.name}`, "", ...VARIANT_FIELDS.map((k) => `- ${k}: ${v[k]}`), "", v.notes, ""].join("\n");
}

const VOICE = [
  "## His voice",
  "",
  "- Short. First names. One ask per message. Name one thing the person made or wrote (me.md).",
  "- Say who he is in one line: a BU Questrom junior building Sol, one window for all your AI.",
  "- No flattery, no \"I hope this finds you well\", no list of everything he has done.",
  "- A fact not in me.md or resume/ is not written; it is marked [gap: …] for him to fill.",
].join("\n");
const COFFEE = "a 15-minute coffee near them in SF on Sat Nov 28, Sun Nov 29 or Mon Nov 30 (Fri Nov 27 if those are full); never Thanksgiving, Thu Nov 26";
const QUESTION = "one specific question about their work, answerable in two lines by email; no meeting asked";
const CHANNEL = "email when a public page shows their address, else a LinkedIn message";

/** the four variants he starts with, from sf-trip/approach.md: two asks × two openers, each next to the other by one change */
export function startingVariants(since: string): Variant[] {
  const base = { status: "active" as const, length: "at most 90 words", since, notes: VOICE };
  return [
    { ...base, name: "coffee-their-work", opener: "their work: one sentence on a thing they built or wrote", ask: COFFEE, channel: CHANNEL, changes: "the base" },
    { ...base, name: "coffee-his-project", opener: "his project: one sentence on what Sol does and why it is theirs to care about", ask: COFFEE, channel: CHANNEL, changes: "the opener (his project, not their work) against coffee-their-work" },
    { ...base, name: "question-their-work", opener: "their work: one sentence on a thing they built or wrote", ask: QUESTION, channel: CHANNEL, changes: "the ask (one question by email, not coffee) against coffee-their-work" },
    { ...base, name: "question-his-project", opener: "his project: one sentence on what Sol does and why it is theirs to care about", ask: QUESTION, channel: CHANNEL, changes: "the opener (his project) against question-their-work" },
  ];
}

// ---- the difference between the draft and what he sent (pure) ----
export type Edit = { before: number; after: number; removed: string[]; added: string[] };
const words = (s: string) => s.replace(/\r/g, "").split(/\s+/).filter(Boolean);
/** what he cut and what he added, as runs of words, by the longest common run of words (pure) */
export function editOf(draft: string, sent: string): Edit {
  const a = words(draft), b = words(sent);
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0, rem: string[] = [], add: string[] = [];
  const flush = () => { if (rem.length) removed.push(rem.join(" ")); if (add.length) added.push(add.join(" ")); rem = []; add = []; };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) add.push(b[j++]);
    else rem.push(a[i++]);
  }
  flush();
  return { before: n, after: m, removed, added };
}
/** the edit in a few words, for a ledger line or the lesson (pure) */
export const editLine = (e: Edit) =>
  e.removed.length || e.added.length
    ? `${e.before} → ${e.after} words${e.removed.length ? `; cut "${e.removed.slice(0, 3).join('", "')}"` : ""}${e.added.length ? `; added "${e.added.slice(0, 3).join('", "')}"` : ""}`
    : "sent as drafted";

// ---- on disk ----
export const variantsDir = (folder: string) => join(folder, "outreach", "variants");
export const draftsDir = (folder: string) => join(folder, "outreach", "drafts");
export type DraftKind = "first" | "follow-up" | "thanks";
export const draftName = (slug: string, kind: DraftKind) => (kind === "first" ? `${slug}.md` : `${slug}-${kind}.md`);
export const draftPath = (folder: string, slug: string, kind: DraftKind) => join(draftsDir(folder), draftName(slug, kind));

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export function readVariants(folder: string): Variant[] {
  let names: string[] = [];
  try { names = readdirSync(variantsDir(folder)).filter((n) => n.endsWith(".md")); } catch { return []; }
  return names.map((n) => parseVariant(n.slice(0, -3), readFileSync(join(variantsDir(folder), n), "utf8"))).sort((a, b) => a.name.localeCompare(b.name));
}
export const liveVariants = (folder: string) => readVariants(folder).filter((v) => v.status === "active");
export function saveVariant(folder: string, v: Variant) {
  mkdirSync(variantsDir(folder), { recursive: true });
  writeAtomic(join(variantsDir(folder), `${v.name}.md`), variantMd(v));
}
/** the starting four, written once when the folder has no variants */
export function seedVariants(folder: string, since: string): boolean {
  if (readVariants(folder).length) return false;
  for (const v of startingVariants(since)) saveVariant(folder, v);
  return true;
}

/** the draft as it is now (what he will send), or null */
export function readDraft(folder: string, slug: string, kind: DraftKind): string | null {
  try { return readFileSync(draftPath(folder, slug, kind), "utf8"); } catch { return null; }
}
/** keep the agent's words beside the draft, once: <name>.agent.md */
export function keepAgentWords(folder: string, slug: string, kind: DraftKind) {
  const p = draftPath(folder, slug, kind), q = p.replace(/\.md$/, ".agent.md");
  if (existsSync(p)) copyFileSync(p, q);
}
/** his press "sent": keep what he sent, and the difference from the agent's words */
export function markSent(folder: string, slug: string, kind: DraftKind, variant: string, at: number): Edit | null {
  const sent = readDraft(folder, slug, kind);
  if (sent === null) return null;
  let draft = sent;
  try { draft = readFileSync(draftPath(folder, slug, kind).replace(/\.md$/, ".agent.md"), "utf8"); } catch { /* no agent copy: as drafted */ }
  const e = editOf(stripHead(draft), stripHead(sent));
  mkdirSync(join(folder, "outreach", "sent"), { recursive: true });
  writeAtomic(join(folder, "outreach", "sent", draftName(slug, kind)), sent);
  appendFileSync(join(folder, "outreach", "edits.jsonl"), JSON.stringify({ at, person: slug, variant, kind, draft: stripHead(draft), sent: stripHead(sent), edit: e }) + "\n");
  return e;
}
/** the message itself, without the draft's heading and note lines (`# …`, `> …`) (pure) */
export const stripHead = (s: string) => s.split("\n").filter((l) => !/^#\s|^>\s?/.test(l)).join("\n").trim();

export type EditRecord = { at: number; person: string; variant: string; kind: DraftKind; draft: string; sent: string; edit: Edit };
export function readEdits(folder: string, since = 0): EditRecord[] {
  let text = "";
  try { text = readFileSync(join(folder, "outreach", "edits.jsonl"), "utf8"); } catch { return []; }
  return text.trim().split("\n").flatMap((l) => { try { const r = JSON.parse(l) as EditRecord; return r.at >= since ? [r] : []; } catch { return []; } });
}
