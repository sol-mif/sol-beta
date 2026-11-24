// A folder's setup, read from what it holds (BR1 setup.html, Marco 16:02; #1615): three lines, what it's for, how it's
// organized and how it looks, each with its because and its ×, shown as one SETUP line in the folder's header, ✦ (Sol's
// reading) until the person keeps it. Never a named kind: the lines come from the same signals in every home, the files
// and how they are named, how they sit in subfolders, a rules file, what the chats there are about and the dates ahead.
// Two folders read the same only because they hold the same shape of things. A folder with almost nothing in it gets no
// guessed setup: it says it is too early, a calm state. A field the person set is said as they set it. Meta, designed
// blind: no person's names, words or thresholds; the words are the engine's, so the face words nothing.
// Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { join } from "node:path";
import { fsReader, SKIP, type Reader } from "./carry.js";
import { readFolderSessions } from "./folders.js";
import type { Seen } from "./look.js";

export type LineKey = "for" | "organized" | "looks";
export type ReadLine = { key: LineKey; field: "job" | "order" | "look"; n: string; line: string; short: string; because: string; k: string; by: "sol" | "person" };
/** empty: too early to say (no lines, why says what it holds); sol: Sol's reading, ✦ until kept */
export type SetupRead = { empty: boolean; line: string; sol: boolean; lines: ReadLine[]; why?: string };
type Field = { field: string; name: string; by: string };

export const LINE_N: Record<LineKey, string> = { for: "For", organized: "Organized", looks: "Looks" };
const FIELD_OF: Record<LineKey, ReadLine["field"]> = { for: "job", organized: "order", looks: "look" };
export const lineKey = (folder: string, key: LineKey) => `setup:${folder}:${key}`;
export const TOO_EARLY = "Too early to say what this folder is for";

const LOOK_AT = 400, RULE_LINES = 60, RULE_LEN = 90;
const RULES = ["CLAUDE.md", "AGENTS.md", "RULES.md", "rules.md", ".cursorrules", "README.md"];
const PICTURE = new Set(["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "tif", "tiff", "raw", "dng"]);
const DOCUMENT = new Set(["pdf", "epub", "doc", "docx", "pages", "odt", "ppt", "pptx", "key", "odp"]);
const WRITING = new Set(["md", "markdown", "txt", "org", "rtf"]);
const SHEET = new Set(["csv", "xls", "xlsx", "numbers", "tsv"]);
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(19|20)\d\d[-_. ]?(0[1-9]|1[0-2])\b/i;
const WEEK = /\b(week|wk|w)[-_ ]?\d{1,2}\b/i;
const NUMBERED = /^\d{1,3}[-_. ]|[-_ ]\d{1,3}$/;
/** words a chat title says about anything; what is left is what it is about */
const COMMON = new Set(["the", "and", "for", "with", "from", "into", "onto", "that", "this", "these", "those", "what", "when", "where", "which", "about",
  "make", "made", "making", "add", "adds", "adding", "fix", "fixes", "fixing", "update", "updates", "new", "help", "need", "want", "can", "how", "why",
  "some", "more", "less", "all", "any", "our", "your", "its", "get", "set", "use", "using", "try", "check", "look", "work", "working", "on", "in", "to",
  "of", "a", "an", "is", "are", "be", "do", "does", "it", "up", "out", "one", "two", "first", "next", "last", "again", "still", "just", "please", "session"]);

const extOf = (n: string) => (n.includes(".") ? n.split(".").pop()!.toLowerCase() : "");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const listed = (xs: string[]) => (xs.length <= 3 ? xs.join(", ").replace(/, ([^,]*)$/, " and $1") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);
const lower1 = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upTo = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")}…`);

type Holds = { files: string[]; subs: { name: string; files: number }[]; git: boolean; rule: { file: string; at: number; line: string } | null; chats: string[] };

/** what the folder holds: its names a share deep (never a walk), its subfolders, a rules file's first rule, its chats */
function holdsOf(home: string, folder: string, abs: string | null, r: Reader): Holds {
  const chats = Object.values(readFolderSessions(home)).filter((s) => s.folder === folder).map((s) => s.title).filter(Boolean);
  if (!abs) return { files: [], subs: [], git: false, rule: null, chats };
  const top = r.list(abs) ?? [];
  const git = top.some((x) => x.name === ".git");
  const files = top.filter((x) => !x.dir && !x.name.startsWith(".")).map((x) => x.name);
  const subs = top.filter((x) => x.dir && !x.name.startsWith(".") && !SKIP.has(x.name.toLowerCase())).map((d) => {
    const inside = git || files.length >= LOOK_AT ? [] : (r.list(join(abs, d.name)) ?? []).filter((x) => !x.dir && !x.name.startsWith("."));
    if (files.length < LOOK_AT) files.push(...inside.map((x) => x.name));
    return { name: d.name, files: inside.length };
  });
  let rule: Holds["rule"] = null;
  for (const f of RULES) {
    if (!top.some((x) => !x.dir && x.name === f)) continue;
    const ls = (r.head(join(abs, f), 16_384) ?? "").split("\n").slice(0, RULE_LINES);
    let fence = false;
    const at = ls.findIndex((l) => { if (/^\s*```/.test(l)) { fence = !fence; return false; } const t = l.trim(); return !fence && t.length >= 12 && !/^(#|<|\||---|!\[|\[)/.test(t); });
    if (at >= 0) { rule = { file: f, at: at + 1, line: upTo(ls[at].trim().replace(/^[-*+]\s+|^\d+[.)]\s+/, "").replace(/\*\*|__|`/g, ""), RULE_LEN) }; break; }
  }
  return { files: files.slice(0, LOOK_AT), subs, git, rule, chats };
}

/** the words two chats or more share, most shared first */
function aboutOf(titles: string[]): string[] {
  const by = new Map<string, number>();
  for (const t of titles) for (const w of new Set(t.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]{2,}/gu) ?? [])) if (!COMMON.has(w)) by.set(w, (by.get(w) ?? 0) + 1);
  return [...by].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([w]) => w);
}

/** the kind of file most of them are (more than half), or null */
function mostlyOf(files: string[]): { what: "pictures" | "documents" | "notes" | "sheets"; n: number } | null {
  const count = (s: Set<string>) => files.filter((f) => s.has(extOf(f))).length;
  const all: { what: "pictures" | "documents" | "notes" | "sheets"; n: number }[] = [
    { what: "pictures", n: count(PICTURE) }, { what: "documents", n: count(DOCUMENT) }, { what: "notes", n: count(WRITING) }, { what: "sheets", n: count(SHEET) }];
  const top = all.sort((a, b) => b.n - a.n)[0];
  return files.length >= 2 && top.n * 2 > files.length ? top : null;
}

/** how the names are dated, when most of them are */
function namedBy(names: string[]): "week" | "month" | "number" | null {
  if (names.length < 2) return null;
  const share = (re: RegExp) => names.filter((n) => re.test(n.replace(/\.[^.]{1,6}$/, ""))).length * 2 > names.length;
  return share(WEEK) ? "week" : share(MONTH) ? "month" : share(NUMBERED) ? "number" : null;
}

type Draft = { line: string; short: string; because: string };

function forOf(h: Holds, seen: readonly Seen[], name: string): Draft | null {
  const about = aboutOf(h.chats);
  if (h.chats.length >= 2 && about.length) return { line: `Work on ${listed(about)}`, short: listed(about), because: `its ${plural(h.chats.length, "chat")} are mostly about ${listed(about)}` };
  const coming = seen.find((x) => x.part === "coming" && x.items.length);
  if (coming) return { line: `What is coming up, next ${coming.items[0].what}`, short: `what's coming up`, because: `${lower1(coming.fact.replace(/\.$/, ""))}, the next one ${coming.items[0].at}` };
  if (h.git) return { line: "Making something, every change kept", short: "making something", because: `${name} keeps a history of its changes (a .git folder)` };
  const most = mostlyOf(h.files);
  if (most) {
    const line = { pictures: "Pictures to keep and look through", documents: "Documents to read and keep", notes: "Notes and writing", sheets: "Figures kept in sheets" }[most.what];
    return { line, short: lower1(line), because: `${most.n} of its ${plural(h.files.length, "file")} are ${most.what}` };
  }
  return null;
}

function organizedOf(h: Holds): Draft | null {
  let d: Draft | null = null;
  const by = namedBy(h.subs.map((s) => s.name)), files = namedBy(h.files);
  if (h.git) d = { line: "As its code is: each subfolder a part of it", short: "as its code is", because: "it keeps a history of its changes, so its subfolders are its code" };
  else if (h.subs.length >= 2 && by) d = { line: `By ${by}, a folder for each`, short: `a folder each ${by}`, because: `its ${plural(h.subs.length, "subfolder")} are named by ${by}` };
  else if (h.subs.length >= 2) {
    const full = h.subs.filter((s) => s.files > 0).length;
    d = { line: "One folder for each thing it holds", short: "one folder each", because: `it holds ${plural(h.subs.length, "subfolder")} (${listed(h.subs.map((s) => s.name))})${full === h.subs.length ? ", each with its own files" : ""}` };
  } else if (files) d = { line: `By ${files}, as the files are named`, short: `by ${files}`, because: `most of its ${plural(h.files.length, "file")} are named by ${files}` };
  else if (h.files.length) d = { line: "Newest first", short: "newest first", because: "nothing in its names or subfolders sets an order" };
  if (h.rule) {
    const rule = `line ${h.rule.at} of its ${h.rule.file}`;
    d = d ? { line: `${d.line}; ${lower1(h.rule.line)}`, short: d.short, because: `${d.because}, and ${rule}` } : { line: h.rule.line, short: "as its rules say", because: rule };
  }
  return d;
}

function looksOf(h: Holds, seen: readonly Seen[]): Draft | null {
  const most = mostlyOf(h.files), coming = seen.find((x) => x.part === "coming" && x.items.length);
  if (most?.what === "pictures") return { line: "Pictures first, as a grid", short: "pictures first", because: `${most.n} of its ${plural(h.files.length, "file")} are pictures` };
  if (coming) return { line: "What is next on the front, the rest by date", short: "what's next first", because: `it has dates ahead, the next ${coming.items[0].at}` };
  if (h.git) return { line: "Its latest changes on the front", short: "latest changes first", because: "it keeps a history of its changes" };
  if (h.subs.length >= 2) return { line: "Each subfolder as a card", short: "shown as cards", because: `it keeps its things in ${plural(h.subs.length, "subfolder")}` };
  if (most?.what === "documents") return { line: "A list to read, newest on top", short: "a list to read", because: `${most.n} of its ${plural(h.files.length, "file")} are documents` };
  if (h.files.length) return { line: "Newest first, as a list", short: "a list", because: "nothing in it asks for more than a list" };
  return null;
}

/** the reading: three lines (fewer when a signal is missing), a field the person set said as they set it, a line the
 *  person took out (×) left out; too early when it holds almost nothing */
export function readOf(home: string, folder: string, a: { abs: string | null; seen: readonly Seen[]; fields: readonly Field[]; kept: boolean; dropped?: readonly string[] }, r: Reader = fsReader): SetupRead {
  const h = holdsOf(home, folder, a.abs, r), name = folder.slice(2).split("/").filter(Boolean).pop() ?? folder;
  const things = h.files.length + h.subs.length + h.chats.length, dated = a.seen.some((x) => x.part === "coming" && x.items.length);
  const person = (key: LineKey) => a.fields.find((f) => f.field === FIELD_OF[key] && f.by === "person");
  const drafts: Record<LineKey, Draft | null> = { for: forOf(h, a.seen, name), organized: organizedOf(h), looks: looksOf(h, a.seen) };
  const lines: ReadLine[] = [];
  for (const key of ["for", "organized", "looks"] as LineKey[]) {
    const mine = person(key), d = drafts[key];
    if (mine) lines.push({ key, field: FIELD_OF[key], n: LINE_N[key], line: mine.name, short: lower1(mine.name).replace(/:.*$/, ""), because: "you set it", k: lineKey(folder, key), by: "person" });
    else if (d && !a.dropped?.includes(key)) lines.push({ key, field: FIELD_OF[key], n: LINE_N[key], ...d, k: lineKey(folder, key), by: "sol" });
  }
  if (!lines.some((l) => l.by === "person") && things < 3 && !h.git && !h.rule && !dated)
    return { empty: true, line: TOO_EARLY, sol: false, lines: [], why: things ? `it holds ${plural(things, "thing")} so far` : "it holds nothing yet" };
  const sol = !a.kept && lines.some((l) => l.by === "sol");
  return { empty: false, line: lines.map((l) => l.short).join(" · "), sol, lines };
}
