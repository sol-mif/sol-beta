// A folder's parts (BR1 item 6, picked drawing mine/look/br1/folder.html; #1615): a folder's look is built from what Sol
// saw in it, never from a named kind. Each part is there because of one observed fact, and says it: dates ahead in its
// files → coming up; a history of changes (a .git folder) → what changed; a session open in it → working now; names
// that recur in its mail → with; documents opened and never changed → to read; most of its newest files pictures →
// photos. Files and Coming up are in every folder; with nothing dated, Coming up says so (BR1 hold). At most four show (the face cuts, model.ts MOST), in the order of the
// person's own presses in that folder, a fixed order breaking ties. No fact: plain, and the face says it takes its shape
// from use. A part the person hid is gone from that folder (here), from the folders shown it for the same reason
// (these) or from every folder (everywhere), and the look names the hide so its absence says why and brings it back.
// Every hide and every bring-back is one fix line in what Sol knows (you-known.ts noteFix), and a wider one a rule
// (sameFor). Meta, designed blind: the facts are shares and things seen, never a person's names or words.
// The shapes are the face's (sol/mac/src/next/folder/parts/model.ts): Look { order, seen, files, hid }.
// One file, SOL_HOME/next/looks.json { v: 1, presses: { <folder>: { <part>: n } }, hides: Hide[] }.
//   next.folder.look       { folder } | { folders }           → { looks: { <folder>: Look } }
//   next.folder.press      { folder, part }                   → { look } (a part pressed: it ranks higher there)
//   next.folder.part.hide  { folder, part, reach, to?, folders? } → { look, fix, same }
//   next.folder.part.back  { folder, part }                   → { look, fix }
// Signed: marcocyl04-ux's agent (builder P), BR1 item 6 (#1615).
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename, join } from "node:path";
import { fsReader, SKIP, type Reader } from "./carry.js";
import { nextDir, readJson, writeJson } from "./file.js";
import { readFolderSessions } from "./folders.js";
import { keptFolders, readMoveIn } from "./movein.js";
import { okFolder } from "./notes.js";
import { diskOf } from "./setup.js";
import { noteFix, sameFor, seenWhat, type Same } from "./you-known.js";
import type { Where } from "./you.js";

export type PartId = "files" | "coming" | "changed" | "working" | "with" | "read" | "photos";
export const PARTS: PartId[] = ["working", "coming", "changed", "with", "read", "photos", "files"];
export const PART_W: Record<PartId, string> = { files: "Files", coming: "Coming up", changed: "What changed", working: "Working now", with: "With", read: "To read", photos: "Photos" };
export type Item = { what: string; at?: string; piece?: string };
export type Seen = { part: Exclude<PartId, "files">; k: string; fact: string; words: string; items: Item[] };
export type Reach = "here" | "these" | "everywhere";
export type Hid = { part: PartId; reach: Reach };
export type Look = { order: PartId[]; seen: Seen[]; files: Item[]; hid: Hid[] };
export type Hide = { rid: string; part: PartId; reach: Reach; to: string[]; but?: string[]; k: string; at: number };
type Store = { presses: Record<string, Partial<Record<PartId, number>>>; hides: Hide[] };
export type R<T> = ({ ok: true } & T) | { ok: false; why: string };
/** what a stat says of a file: when it was changed, opened and made (null: it can't be read) */
export type Stat = (path: string) => { mtime: number; atime: number; birth: number } | null;
const fsStat: Stat = (p) => { try { const s = statSync(p); return { mtime: s.mtimeMs, atime: s.atimeMs, birth: s.birthtimeMs || s.ctimeMs }; } catch { return null; } };
/** a repo's last commits from git itself, for a copy whose HEAD log holds no commit of its own (one that only pulls):
 *  subjects and times, newest first, merges left out; nothing when git can't say it at once */
const gitLog = (abs: string): { at: number; what: string }[] => {
  try {
    return execFileSync("git", ["-C", abs, "log", "--no-merges", "-n", "40", "--format=%ct%x09%s"], { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").map((l) => { const [t, ...w] = l.split("\t"); return { at: Number(t) * 1000, what: w.join("\t").trim() }; }).filter((c) => c.at > 0 && !!c.what);
  } catch { return []; }
};

/** a look is read from at most this many names, and the text of at most TEXTS small files: a share, never a walk */
const LOOK_AT = 400, TEXTS = 30, TEXT_BYTES = 16_384, ITEMS = 5;
/** a dated line longer than PROSE words is prose about a day, not a thing on it; a day gone by within RECENT days, said
 *  without its year, is that past day (not next year's) */
const PROSE = 24, RECENT = 60, WRAP = 60;   // a line of WRAP characters or more, hard-wrapped, runs on into the next
const DAY = 86_400_000;
const TEXT = new Set(["md", "markdown", "txt", "org", "csv", "ics", "eml", "emlx", "html", "htm", "rtf"]);
const MAIL = new Set(["eml", "emlx"]);
const PICTURE = new Set(["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "tif", "tiff", "raw", "dng", "cr2", "nef", "arw"]);
const DOCUMENT = new Set(["pdf", "epub", "doc", "docx", "pages", "odt", "ppt", "pptx", "key", "odp"]);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const extOf = (n: string) => (n.includes(".") ? n.split(".").pop()!.toLowerCase() : "");
const bare = (n: string) => n.replace(/\.[^.]{1,6}$/, "");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const listed = (xs: string[]) => (xs.length <= 3 ? xs.join(", ").replace(/, ([^,]*)$/, " and $1") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);
const nameOf = (folder: string) => basename(folder.slice(2).replace(/\/+$/, "")) || folder.slice(2);
/** at most n characters, cut after a whole word with "…", never inside one ("as th"); one word longer than n is cut there */
export const upTo = (s: string, n: number) => {
  const t = s.trim();
  if (t.length <= n) return t;
  const sp = t.slice(0, n + 1).lastIndexOf(" ");
  return (sp > 0 ? t.slice(0, sp) : t.slice(0, n)).replace(/[\s,.;:–-]+$/, "") + "…";
};

export const looksFile = (home: string) => join(nextDir(home), "looks.json");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isPart = (v: unknown): v is PartId => PARTS.includes(v as PartId);
function read(home: string): Store {
  const { data } = readJson(looksFile(home));
  const presses: Store["presses"] = {};
  for (const [f, v] of Object.entries(isObj(data.presses) ? data.presses : {})) if (okFolder(f) && isObj(v)) {
    presses[f] = {};
    for (const [p, n] of Object.entries(v)) if (isPart(p) && typeof n === "number" && n > 0) presses[f][p] = Math.min(n, 1e6);
  }
  const hides = (Array.isArray(data.hides) ? data.hides : []).filter((h): h is Hide => isObj(h) && okFolder(h.rid) && isPart(h.part) && ["here", "these", "everywhere"].includes(h.reach as string) && Array.isArray(h.to) && typeof h.k === "string");
  return { presses, hides };
}
const save = (home: string, s: Store) => writeJson(looksFile(home), { v: 1, presses: s.presses, hides: s.hides.slice(-500) });

// ------------------------------------------------------------------------------------------- when, said short

/** a time said as the part's small word: now, 2 h, today, yesterday, a weekday within the week, else "9 Dec" */
export function whenOf(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(d) - day(n)) / DAY);
  if (days === 0) { const h = Math.round((now - at) / 3_600_000); return h <= 0 ? (at > now ? "today" : "now") : h < 12 ? `${h} h` : "today"; }
  if (days === -1) return "yesterday";
  if (days === 1) return "tomorrow";
  if (Math.abs(days) < 7) return d.toLocaleString("en-GB", { weekday: "short" });
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
}

/** what makes a dated line a thing coming (BR1, #1615): it says something happens that day, a quiz, a holiday, a
 *  deadline, never prose that only holds a date. The kinds of thing that happen on a day, in anyone's life */
const HAPPENS = new RegExp("\\b(?:" + [
  "quiz(?:zes)?", "exams?", "midterms?", "finals?", "tests? day", "essay", "homework", "assignments?", "due", "deadlines?", "submit(?:ted|s)?", "submissions?",
  "closes?", "opens?", "starts?", "begins?", "ends?", "launch(?:es)?", "releases?", "demo", "presentations?", "interviews?", "meetings?", "meet(?:ing|s)? up",
  "calls?", "appointments?", "appt", "check-?up", "dentist", "doctor", "visits?", "flights?", "fl(?:y|ies)", "trips?", "travel", "arriv(?:e|es|al)", "depart(?:s|ure)?",
  "holidays?", "vacation", "day off", "birthdays?", "anniversary", "wedding", "party", "concert", "show", "games?", "match", "tournament", "practice", "recital",
  "dinner", "lunch", "breakfast", "coffee", "class(?:es)?", "lectures?", "lessons?", "seminars?", "workshops?", "conference", "events?", "agenda", "itinerary",
  "schedule[ds]?", "reservations?", "booked", "booking", "tickets?", "rsvp", "invit(?:e|ation)", "renew(?:al|s)?", "expir(?:e|es|y)", "payments?", "pay", "rent", "bills?",
  "tax(?:es)?", "term", "semester", "graduation", "moving", "move-?in", "christmas", "thanksgiving", "easter", "new year'?s?", "halloween", "hanukkah", "diwali",
  "eid", "ramadan", "lunar new year", "chuseok", "passover", "kickoff", "reminder", "remind me",
].join("|") + ")\\b", "i");
const WEEKDAY = "(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?";
/** one date in a line said as a day something happens: its weekday or a time beside it, on/by/due before it; never a
 *  day a rule starts from (from, since, as of), which is prose about the date, not a thing on it */
function sayDay(line: string, i: number, len: number): "day" | "from" | null {
  const before = line.slice(Math.max(0, i - 16), i), after = line.slice(i + len, i + len + 16);
  if (/\b(?:from|since|as of|starting|effective)\s*$/i.test(before)) return "from";
  if (new RegExp(`\\b${WEEKDAY}\\.?[,:]?\\s*$`, "i").test(before) || new RegExp(`^\\s*[,(]?\\s*${WEEKDAY}\\b`, "i").test(after)) return "day";
  if (/^,?\s*(?:at\s+)?(?:\d{1,2}(?::\d\d)?\s*(?:am|pm)\b|\d{1,2}:\d\d\b)/i.test(after)) return "day";
  if (/\b(?:on|by|due)\s*$/i.test(before)) return "day";
  return null;
}

/** the dates ahead a text says, with the words around each: "2026-12-09", "Dec 9", "9 December"; a day without its
 *  year is this year's, or next year's when this year's is past. Only a line that says something happens that day
 *  (sayDay, HAPPENS, or a short line that is a name and its date: "Quiz 4 Dec 9"); a date in code (`…`) is none */
export function datesIn(text: string, now: number): { at: number; words: string }[] {
  const out: { at: number; words: string }[] = [], today = new Date(now); today.setHours(0, 0, 0, 0);
  let past = false;   // the line also names a day gone by (said with its year, or this year's within RECENT days)
  const ahead = (y: number, m: number, d: number, yearSaid: boolean) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    let t = new Date(y, m, d).getTime();
    if (t < today.getTime() && (yearSaid || today.getTime() - t <= RECENT * DAY)) past = true;
    if (!yearSaid && t < today.getTime()) t = new Date(y + 1, m, d).getTime();
    return t >= today.getTime() && t <= today.getTime() + 400 * DAY ? t : null;
  };
  const mon = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const forms: [RegExp, (m: RegExpExecArray) => number | null][] = [
    [/\b(20\d\d)-(\d\d)-(\d\d)\b/g, (m) => ahead(+m[1], +m[2] - 1, +m[3], true)],
    [new RegExp(`\\b${mon}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (20\\d\\d))?\\b`, "gi"), (m) => ahead(m[3] ? +m[3] : today.getFullYear(), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2], !!m[3])],
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${mon}\\.?(?: (20\\d\\d))?\\b`, "gi"), (m) => ahead(m[3] ? +m[3] : today.getFullYear(), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1], !!m[3])],
  ];
  // a paragraph hard-wrapped over lines is one line: a long line that ends mid-sentence runs on into the next when that one
  // goes on in lower case
  const paras: string[] = [];
  let wraps = false;
  for (const raw of text.split(/\r?\n/).slice(0, 2000)) {
    if (wraps && /^\s*\p{Ll}/u.test(raw)) paras[paras.length - 1] += " " + raw.trim();
    else paras.push(raw);
    wraps = raw.trim().length >= WRAP && !/[.!?:;)\]}|"'`]$/.test(raw.trim());
  }
  const dates = forms.map(([re]) => re);
  for (let pi = 0; pi < paras.length; pi++) {
    const raw = paras[pi];
    const line = raw.replace(/`[^`]*`/g, " "), ats = new Set<number>(), said: { t: number; day: boolean; i: number; len: number }[] = [];
    // a record, never a thing coming (BR1 hold): a line stamped with today's date and a clock time (a log's; a day ahead
    // with its time is a calendar's), one that points to where the thing lives (a link to another file), or long prose
    const stamp = /^[\s\-*+•·>|]*(20\d\d)-(\d\d)-(\d\d)[ T]\d{1,2}:\d\d/.exec(line);
    if ((stamp && new Date(+stamp[1], +stamp[2] - 1, +stamp[3]).getTime() <= today.getTime()) || /\]\([^)]+\)/.test(line)
      || line.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length > PROSE) continue;
    past = false;
    for (const [re, at] of forms) {
      re.lastIndex = 0;
      for (let m = re.exec(line); m; m = re.exec(line)) { const t = at(m), d = sayDay(line, m.index, m[0].length); if (t !== null && d !== "from") said.push({ t, day: d === "day", i: m.index, len: m[0].length }); }
    }
    if (!said.length || past) continue;   // a line that names a day gone by is a record about dates
    const short = () => wordsOf(line, dates).split(" ").filter((w) => /\p{L}/u.test(w)).length <= 4;
    const happens = HAPPENS.test(line) || short();
    for (const x of said) if (x.day || happens) ats.add(x.t);
    // a line naming more than two days is a list of choices or a report about dates, not one thing on a day
    if (new Set(said.map((x) => x.t)).size > 2) continue;
    if (!ats.size) continue;
    // one line is one thing coming, however many ways it says its day ("Thursday, November 26, 2026 (2026-11-26)"), on its
    // first, titled by the thing (BR1 hold 2): the words its day introduces ("December 7: Team presentation"), else the line
    // without where it was found; a date alone on its line (a calendar's layout) takes the thing on the line under it; a
    // line that names no thing, only its day ("Today — Sunday", "Due date (EST)"), is no line
    const at = Math.min(...ats), first = said.find((x) => x.t === at)!;
    const own = /^\s*:\s*([^·|;]+)/.exec(line.slice(first.i + first.len));
    let words = wordsOf(untail(own ? own[1] : line), dates);
    if (!wordsOf(untail(line), dates)) words = titleBelow(paras, pi, dates);
    if (named(words)) out.push({ at, words });
  }
  return out;
}

/** a line's words without where it was found (" · found: blackboard Announcements", "| source: …"): a place, not the thing */
const untail = (s: string) => s.replace(/\s[·|—–-]\s*(?:found|source|seen|from|via)\s*:.*$/i, "");
/** words that say only when or that a thing is due, never what it is (any language's calendar labels in English) */
const LABEL = /^(?:today|tonight|tomorrow|yesterday|now|due|dates?|deadlines?|time|until|by|on|at|est|edt|cst|cdt|mst|mdt|pst|pdt|utc|gmt|bst|cet|am|pm|this|next|week|day|mon|tues?|wed|thu|thurs?|fri|sat|sun|(?:mon|tues|wednes|thurs|fri|satur|sun)day)$/i;
/** the title names a thing: one word in it is more than a label of time */
const named = (w: string) => w.split(/\s+/).some((x) => { const l = x.replace(/[^\p{L}\p{N}]/gu, ""); return /\p{L}/u.test(l) && !LABEL.test(l); });
/** the thing under a date said alone on its line: the next line with words, when it is a short name, not a sentence or
 *  another date */
function titleBelow(paras: string[], i: number, dates: RegExp[]): string {
  for (let j = i + 1; j < Math.min(paras.length, i + 3); j++) {
    const l = paras[j].trim();
    if (!l) continue;
    if (dates.some((re) => { re.lastIndex = 0; return re.test(l); }) || /[.!?]$/.test(l) || l.split(/\s+/).length > 10) return "";
    return wordsOf(untail(l), dates);
  }
  return "";
}
/** the content words of a title (four letters or more, no label): two lines on one day sharing one are one thing */
const thingWords =(w: string) => new Set(w.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 4 && !LABEL.test(x)));

/** a dated line's words, as a title: every date said in it out; a quoted title when the line is written for a program
 *  (`needs { title "Chapter 11 quiz" due 2026-11-24 }` → Chapter 11 quiz), else the line without its marks and brackets */
function wordsOf(line: string, dates: RegExp[]): string {
  let s = line;
  for (const re of dates) s = s.replace(re, " \u0000");
  // what says the day goes with its date: a range's end ("Nov 27–29"), a time ("at 10:00"), a short weekday ("Sat"); a
  // weekday said in full is words ("Thanksgiving is Thursday")
  s = s.replace(/\u0000\s*[–-]\s*\d{1,2}(?:st|nd|rd|th)?\b/g, "\u0000").replace(/\u0000,?\s*(?:at\s+)?(?:\d{1,2}(?::\d\d)?\s*(?:am|pm)\b|\d{1,2}:\d\d\b)/gi, "\u0000")
    .replace(/\b(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\.?,?\s*\u0000/gi, "\u0000").replace(/\b(?:on|by|at)\s*\u0000\s*$/i, "\u0000").replace(/\u0000/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");   // a link is its words
  const quoted = [...s.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => (m[1] ?? m[2]).trim()).filter((q) => /\p{L}{2}/u.test(q) && q.includes(" "));
  if (quoted.length) s = quoted.sort((a, b) => b.length - a.length)[0];
  s = s.replace(/[{}[\]()<>=`"“”]+/g, " ").replace(/[\s|:;,•*#>_-]+/g, " ").replace(/ [.!?]+(?= |$)/g, "");
  return upTo(s, 48);
}

/** the display names in a mail's From, To and Cc ("Denise Okafor <d@…>" → Denise Okafor); an address alone is no name */
export function namesInMail(head: string): string[] {
  const out = new Set<string>();
  for (const m of head.matchAll(/^(?:from|to|cc):(.*(?:\r?\n[ \t].*)*)/gim)) for (const part of m[1].split(",")) {
    const n = /^\s*"?([^"<@]+?)"?\s*</.exec(part)?.[1]?.trim();
    if (n && /\p{L}/u.test(n) && n.length <= 60) out.add(n);
  }
  return [...out];
}

// ------------------------------------------------------------------------------------------- the facts

type File = { name: string; path: string; mtime: number; atime: number; birth: number };
/** the files a look reads: the top level, then one level down while the names last, newest first; a folder inside that
 *  is kept as its own (inner) is that folder's, never read here (BR1 hold, the same rule as the one count) */
function filesOf(abs: string, r: Reader, stat: Stat, inner: ReadonlySet<string> = new Set()): { files: File[]; git: boolean } {
  const top = (r.list(abs) ?? []).filter((x) => !x.dir || !inner.has(join(abs, x.name)));
  const git = top.some((x) => x.name === ".git");
  const names: { name: string; path: string }[] = top.filter((x) => !x.dir && !x.name.startsWith(".")).map((x) => ({ name: x.name, path: join(abs, x.name) }));
  if (!git) for (const d of top.filter((x) => x.dir && !x.name.startsWith(".") && !SKIP.has(x.name.toLowerCase()))) {
    if (names.length >= LOOK_AT) break;
    for (const x of r.list(join(abs, d.name)) ?? []) if (!x.dir && !x.name.startsWith(".")) names.push({ name: x.name, path: join(abs, d.name, x.name) });
  }
  const files = names.slice(0, LOOK_AT).map((n) => { const s = stat(n.path); return s ? { ...n, ...s } : null; }).filter((x): x is File => !!x);
  return { files: files.sort((a, b) => b.mtime - a.mtime), git };
}

/** coming up is in every folder (BR1 hold, #1615): with nothing dated it says so plainly, no items, its own reason (so a
 *  "same for these" reaches only folders with nothing dated too) */
const noneComing = (name: string, k: (what: string) => string, sol = false): Seen => ({ part: "coming", k: k("no-dates"),
  fact: sol ? `${name} lives in Sol only, so Sol has no files there to read dates from.` : `Sol found no dates ahead in the file names or notes in ${name}.`,
  words: "Nothing coming up", items: [] });

/** what Sol saw in one folder, a part per fact; nothing it can't look in */
export function seenOf(home: string, folder: string, now = Date.now(), r: Reader = fsReader, stat: Stat = fsStat): { seen: Seen[]; files: Item[] } {
  const seen: Seen[] = [], name = nameOf(folder), k = (what: string) => `seen:${folder}:${what}`;
  // working now: a session open in it (the folders' own record of where each session works)
  const open = Object.values(readFolderSessions(home)).filter((s) => s.folder === folder && s.working).sort((a, b) => b.at - a.at);
  if (open.length) seen.push({ part: "working", k: k("open"), fact: `${open.length === 1 ? "A session is" : `${open.length} sessions are`} open in ${name} right now.`,
    words: open.length === 1 ? "An AI chat is open here" : `${open.length} AI chats open now`, items: open.slice(0, ITEMS).map((s) => ({ what: s.title || "A session", at: "now" })) });
  const abs = diskOf(home, folder);
  if (!abs) return { seen: [...seen, noneComing(name, k, true)], files: [] };
  const inner = new Set(keptFolders(readMoveIn(home)).map((x) => x.path ?? diskOf(home, x.id)).filter((p): p is string => !!p && p !== abs));
  const { files, git } = filesOf(abs, r, stat, inner);
  // what changed: a history of changes (a .git folder), its last commits from the reflog when there is one
  if (git) {
    const log = (r.text(join(abs, ".git", "logs", "HEAD")) ?? "").trim().split("\n").filter(Boolean).slice(-200).map((l) => {
      const m = /^\S+ \S+ .*? (\d{9,11}) [+-]\d{4}\t(?:commit(?: \([^)]*\))?: )?(.*)$/.exec(l);
      return m && /^commit/.test(l.split("\t")[1] ?? "") ? { at: +m[1] * 1000, what: m[2].trim() } : null;
    }).filter((x): x is { at: number; what: string } => !!x && !!x.what).reverse();
    if (!log.length && r === fsReader) log.push(...gitLog(abs));   // a copy that only pulls: what git says it holds (BR1 conform #3)
    const week = log.filter((c) => c.at >= now - 7 * DAY).length;
    seen.push({ part: "changed", k: k("history"), fact: `${name} keeps a history of its changes (a .git folder)${week ? `: ${plural(week, "change")} this week` : ""}.`,
      words: week ? `Saved ${plural(week, "change")} this week` : "Keeps a history of changes", items: log.slice(0, ITEMS).map((c) => ({ what: upTo(c.what, 80), at: whenOf(c.at, now) })) });
  }
  // coming up: dates ahead, in the files' names and in the text of the small ones; each titled by the thing, never by the
  // file it was found in (a date with no thing named is no line, datesIn)
  const dated = new Map<string, { at: number; words: string }[]>();
  let texts = 0;
  for (const f of files) {
    const got = datesIn(bare(f.name).replace(/[_]+/g, " "), now);
    if (TEXT.has(extOf(f.name)) && texts < TEXTS) { texts++; const t = r.head(f.path, TEXT_BYTES); if (t) got.push(...datesIn(t, now)); }
    if (got.length) dated.set(f.name, got);
  }
  if (dated.size) {
    // one line per thing: the same day said in two files (or twice in one) with a word of the thing in common is one thing,
    // said by its fullest title ("Team presentation" and "Business Law Presentation Submissions" on 7 Dec)
    const items: { at: number; words: string }[] = [], same = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    for (const d of [...dated.values()].flat().sort((a, b) => a.at - b.at)) {
      const mine = thingWords(d.words), j = items.findIndex((x) => x.at === d.at && (same(x.words) === same(d.words) || [...thingWords(x.words)].some((w) => mine.has(w))));
      if (j < 0) items.push(d); else if (d.words.length > items[j].words.length) items[j] = d;
    }
    // a day, never an age: a date of today is "today" (its midnight is past, so whenOf would say "10 h")
    const day = (at: number) => (at <= now ? "today" : whenOf(at, now));
    seen.push({ part: "coming", k: k("dates"), fact: `Sol saw dates ahead in ${listed([...dated.keys()])}.`, words: `Next date: ${day(items[0].at)}`,
      items: items.slice(0, ITEMS).map((d) => ({ what: d.words, at: day(d.at) })) });
  } else seen.push(noneComing(name, k));
  // with: names that recur in its mail (two mails or more)
  const mails = files.filter((f) => MAIL.has(extOf(f.name))).slice(0, TEXTS), by = new Map<string, number>();
  for (const f of mails) for (const n of namesInMail(r.head(f.path, 8192) ?? "")) by.set(n, (by.get(n) ?? 0) + 1);
  const recur = [...by].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (recur.length) seen.push({ part: "with", k: k("names"), fact: `${listed(recur.map(([n]) => n))} come${recur.length === 1 ? "s" : ""} up in ${plural(mails.length, "email")} here.`,
    words: `People named in ${plural(mails.length, "email")}`, items: recur.slice(0, ITEMS).map(([n, c]) => ({ what: n, at: plural(c, "email") })) });
  // to read: documents opened since they came and never changed
  const once = files.filter((f) => DOCUMENT.has(extOf(f.name)) && f.atime > f.mtime + 60_000 && Math.abs(f.mtime - f.birth) < 60_000);
  if (once.length) {
    const pdf = once.every((f) => extOf(f.name) === "pdf");
    seen.push({ part: "read", k: k("opened-once"), fact: `You opened ${listed(once.map((f) => f.name))} and never changed ${once.length === 1 ? "it" : "them"}.`,
      words: `${once.length} ${pdf ? (once.length === 1 ? "PDF" : "PDFs") : once.length === 1 ? "file" : "files"} you opened once`, items: once.slice(0, ITEMS).map((f) => ({ what: bare(f.name), at: whenOf(f.atime, now) })) });
  }
  // photos: most of its newest files are pictures (a share of the newest, at least two)
  const newest = files.slice(0, 40), pics = newest.filter((f) => PICTURE.has(extOf(f.name)));
  if (newest.length >= 2 && pics.length * 2 > newest.length) seen.push({ part: "photos", k: k("pictures"), fact: `Most of the newest files in ${name} are pictures (${pics.length} of ${newest.length}).`,
    words: "Most new files are pictures", items: pics.slice(0, ITEMS).map((f) => ({ what: f.name, at: whenOf(f.mtime, now) })) });
  return { seen, files: files.slice(0, ITEMS).map((f) => ({ what: f.name, at: whenOf(f.mtime, now) })) };
}

// ------------------------------------------------------------------------------------------- the look

/** the hides in effect for one folder: made there, or reaching it (these, everywhere), unless brought back there */
export function hidIn(rid: string, hides: readonly Hide[]): Hid[] {
  const out = new Map<PartId, Hid>();
  for (const h of hides) if ((h.rid === rid || h.reach === "everywhere" || h.to.includes(rid)) && !h.but?.includes(rid)) out.set(h.part, { part: h.part, reach: h.reach });
  return [...out.values()];
}
/** the parts in the order of the person's own presses in that folder; the fixed order breaks ties */
export const orderOf = (presses: Partial<Record<PartId, number>> = {}): PartId[] => [...PARTS].sort((a, b) => (presses[b] ?? 0) - (presses[a] ?? 0) || PARTS.indexOf(a) - PARTS.indexOf(b));

export function lookOf(home: string, folder: string, now = Date.now(), r: Reader = fsReader, stat: Stat = fsStat, s = read(home)): Look {
  const { seen, files } = seenOf(home, folder, now, r, stat);
  return { order: orderOf(s.presses[folder]), seen, files, hid: hidIn(folder, s.hides).filter((h) => seen.some((x) => x.part === h.part)) };
}
export function looksOf(home: string, folders: readonly string[], now = Date.now(), r: Reader = fsReader, stat: Stat = fsStat): Record<string, Look> {
  const s = read(home), out: Record<string, Look> = {};
  for (const f of folders.filter(okFolder).slice(0, 200)) out[f] = lookOf(home, f, now, r, stat, s);
  return out;
}

/** next.folder.press: a part pressed in a folder ranks higher there */
export function pressPart(home: string, a: { folder?: unknown; part?: unknown }, now = Date.now()): R<{ look: Look }> {
  if (!okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
  if (!isPart(a.part)) return { ok: false, why: `a part is one of ${PARTS.join(", ")}` };
  const s = read(home);
  s.presses[a.folder] = { ...s.presses[a.folder], [a.part]: (s.presses[a.folder]?.[a.part] ?? 0) + 1 };
  save(home, s);
  return { ok: true, look: lookOf(home, a.folder, now, fsReader, fsStat, s) };
}

/** the other folders shown this part for the same reason (the same reading of its fact), never a shared name */
export function similarOf(looks: Readonly<Record<string, Look>>, rid: string, k: string): { folder: string; part: string; k: string; fact: string }[] {
  const what = seenWhat(k);
  return Object.entries(looks).filter(([f]) => f !== rid).flatMap(([folder, l]) => l.seen.filter((x) => seenWhat(x.k) === what).map((x) => ({ folder, part: x.part, k: x.k, fact: x.fact })));
}

/** next.folder.part.hide: the person hid a part. here: in that folder; these: also in the folders named (kept only
 *  those shown it for the same reason); everywhere: in every folder, later ones too. A wider hide replaces the narrower
 *  one of that part made there. Answers "same for these?" from the folders the window has (folders), by reading */
export function hidePart(w: Where, a: { folder?: unknown; part?: unknown; reach?: unknown; to?: unknown; folders?: unknown }, now = Date.now(), r: Reader = fsReader, stat: Stat = fsStat): R<{ look: Look; fix: unknown; same: Same | null }> {
  if (!okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
  const folder = a.folder, reach = a.reach ?? "here";
  if (reach !== "here" && reach !== "these" && reach !== "everywhere") return { ok: false, why: "reach is here, these or everywhere" };
  if (a.part === "files") return { ok: false, why: "Files is in every folder; it can't be hidden" };
  if (!isPart(a.part)) return { ok: false, why: `a part is one of ${PARTS.join(", ")}` };
  const part = a.part, s = read(w.sol);
  const look = lookOf(w.sol, folder, now, r, stat, s), fact = look.seen.find((x) => x.part === part);
  if (!fact) return { ok: false, why: `${PART_W[part]} isn't shown in ${nameOf(folder)}` };
  const others = (Array.isArray(a.folders) ? a.folders : Array.isArray(a.to) ? a.to : []).filter(okFolder).filter((f) => f !== folder);
  const similar = similarOf(looksOf(w.sol, others, now, r, stat), folder, fact.k);
  const to = reach === "these" ? (Array.isArray(a.to) ? a.to : []).filter((f): f is string => similar.some((x) => x.folder === f)) : [];
  if (reach === "these" && !to.length) return { ok: false, why: "to is the folders shown this part for the same reason" };
  s.hides = [...s.hides.filter((h) => !(h.rid === folder && h.part === part)), { rid: folder, part, reach, to, k: fact.k, at: now }];
  save(w.sol, s);
  const f = noteFix(w, { how: "hide", what: `“${PART_W[part]}” in ${nameOf(folder)}`, place: folder, reason: fact.k }, now, similar);
  if (reach !== "here") sameFor(w, { reason: fact.k, how: "hide", reach, to: similar.filter((x) => reach === "everywhere" || to.includes(x.folder)).map((x) => x.k) }, now);
  return { ok: true, look: lookOf(w.sol, folder, now, r, stat), fix: f.ok ? f.fix : null, same: reach === "here" && f.ok ? f.same : null };
}

/** next.folder.part.back: a hidden part brought back in that folder only; the folders it reached keep their hide */
export function backPart(w: Where, a: { folder?: unknown; part?: unknown }, now = Date.now(), r: Reader = fsReader, stat: Stat = fsStat): R<{ look: Look; fix: unknown }> {
  if (!okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
  if (!isPart(a.part)) return { ok: false, why: `a part is one of ${PARTS.join(", ")}` };
  const folder = a.folder, part = a.part, s = read(w.sol);
  const was = s.hides.find((h) => h.part === part && (h.rid === folder || h.reach === "everywhere" || h.to.includes(folder)) && !h.but?.includes(folder));
  if (!was) return { ok: false, why: `${PART_W[part]} isn't hidden in ${nameOf(folder)}` };
  // the hide made here goes; one that reached here from elsewhere is lifted here only
  s.hides = s.hides.filter((h) => !(h.rid === folder && h.part === part)).map((h) => (h.part === part && (h.reach === "everywhere" || h.to.includes(folder)) ? { ...h, but: [...(h.but ?? []), folder] } : h));
  save(w.sol, s);
  const f = noteFix(w, { how: "show", what: `“${PART_W[part]}” in ${nameOf(folder)}`, place: folder, reason: was.k }, now);
  return { ok: true, look: lookOf(w.sol, folder, now, r, stat), fix: f.ok ? f.fix : null };
}
