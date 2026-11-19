// Blackboard as a source, through the engine's browser (browser.ts readPage) in the folder's own profile: open the
// course, read its outline, announcements and calendar, then every page the course links to inside itself (each
// content folder, each assignment's page), two links deep, at most 60 pages. What was seen is kept in
// <folder>/.agent/blackboard-last.json; the difference from last time is the trigger. The first look keeps a baseline
// and makes no trigger. Not signed in (a sign-in page, or the course never appears): the trigger is `needs-sign-in`.
//
// Step 2: the course is the folder's (agent/about.ts: the rule, policy.md's `course:`, brain.md), not a constant. A page
// read can carry `panels`: what opened in place when the walk clicked a control without a link (Ultra's peek panels;
// agent/panels.ts clicks them, at most 40 clicks a walk). Each panel is kept as a page of its own, under the page it
// opened on. Every page keeps its click path (Course › Week 10 › Chapter 11 quiz) and its text, so a rule can quote
// the fine print; blackboardMd() writes them to the folder's blackboard.md. Tried on fakes, not on the real course.
import { createHash } from "node:crypto";
import type { PageRead } from "../../browser.js";
import { datesIn, type Dated } from "../calendar.js";

/** LA245's course: only a fallback for a folder that names none (step 1 had it as the only course) */
export const COURSE = "_355037_1";
/** where Blackboard is: SOL_BLACKBOARD for a test's fake course, else BU's */
export const blackboardBase = () => (process.env.SOL_BLACKBOARD ?? "https://learn.bu.edu").replace(/\/+$/, "");

export type Seen = { url: string; title: string; kind: string; hash: string; excerpt: string; path?: string; text?: string; panel?: boolean };
export type Snapshot = { course: string; at: number; pages: Record<string, Seen> };
export type Change = { key: string; kind: string; title: string; how: "new" | "changed" | "gone"; excerpt: string; url: string };
/** a panel: what a click on a control without a link opened in place */
export type Panel = { label: string; text: string; links: { text: string; href: string }[]; url?: string };
export type Read = (url: string) => Promise<PageRead & { panels?: Panel[] }>;
const TEXT_CAP = 4000;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "panel";

/** the kind of a course page by its address (pure) */
export function kindOf(url: string): string {
  const u = url.toLowerCase();
  if (/announcement/.test(u)) return "announcement";
  if (/calendar|due/.test(u)) return "calendar";
  if (/assignment|assessment|test|quiz|exam/.test(u)) return "assignment";
  if (/\.(pptx?|pdf|docx?)(\?|$)|\/file|deck|slides/.test(u)) return "file";
  if (/outline$|outline\/?$/.test(u)) return "outline";
  return "content";
}
/** a page's key: its path, no query or hash (pure) */
export const keyOf = (url: string) => { try { const u = new URL(url); return u.pathname.replace(/\/+$/, ""); } catch { return url; } };

/** a sign-in page instead of the course (pure) */
export function signedOut(page: { url: string; text: string }, base: string, course: string): boolean {
  let host = "", baseHost = "";
  try { host = new URL(page.url).host; baseHost = new URL(base).host; } catch { return true; }
  if (host !== baseHost) return true;   // sent to the university's sign-in
  if (!page.url.includes(course) && /\b(sign in|log in|login|kerberos|password)\b/i.test(page.text)) return true;
  return /\b(sign in|log in)\b/i.test(page.text.slice(0, 400)) && !page.text.includes(course) && page.text.length < 1500;
}

const hash = (s: string) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

/** walk the course: the outline, announcements and calendar, then its own links (and the panels a page opens in
 *  place), breadth first, two deep, at most `limit` pages */
export async function walk(read: Read, base = blackboardBase(), course = COURSE, limit = 60): Promise<{ signedOut: true } | { signedOut: false; snapshot: Snapshot }> {
  const root = `${base}/ultra/courses/${course}`;
  const seeds = [`${root}/outline`, `${root}/announcements`, `${root}/calendar`];
  const first = await read(seeds[0]);
  if (signedOut(first, base, course)) return { signedOut: true };
  const pages: Record<string, Seen> = {};
  type Q = { url: string; depth: number; path: string; got?: PageRead & { panels?: Panel[] } };
  const queue: Q[] = [{ url: seeds[0], depth: 0, path: "Course Content", got: first }, { url: seeds[1], depth: 1, path: "Announcements" }, { url: seeds[2], depth: 1, path: "Calendar" }];
  const queued = new Set(queue.map((q) => keyOf(q.url)));
  const follow = (links: { text: string; href: string }[], q: Q) => {
    if (q.depth >= 2) return;
    for (const l of links) {
      if (!l.href.startsWith(base) || !l.href.includes(course)) continue;
      const lk = keyOf(l.href);
      if (queued.has(lk)) continue;
      queued.add(lk);
      queue.push({ url: l.href, depth: q.depth + 1, path: `${q.path} › ${(l.text || lk.split("/").pop() || "").slice(0, 60)}` });
    }
  };
  while (queue.length && Object.keys(pages).length < limit) {
    const q = queue.shift()!;
    let got: PageRead & { panels?: Panel[] };
    try { got = q.got ?? (await read(q.url)); } catch { continue; }
    if (signedOut(got, base, course)) continue;
    const k = keyOf(got.url);
    if (pages[k]) continue;
    const text = got.text.trim();
    if (!text || /\b(404|not found)\b/i.test(text.slice(0, 200)) && text.length < 300) continue;
    pages[k] = { url: got.url, title: got.title || text.split("\n")[0].slice(0, 80), kind: kindOf(got.url), hash: hash(text), excerpt: text.replace(/\s+/g, " ").slice(0, 400), path: q.path, text: text.slice(0, TEXT_CAP) };
    follow(got.links, q);
    for (const pn of got.panels ?? []) {
      if (Object.keys(pages).length >= limit) break;
      const pk = pn.url && keyOf(pn.url) !== k ? keyOf(pn.url) : `${k}#${slug(pn.label)}`;
      if (pages[pk] || !pn.text.trim()) continue;
      queued.add(pk);
      const kind = kindOf(pn.url && keyOf(pn.url) !== k ? pn.url : `/${pn.label}`);
      pages[pk] = { url: pn.url ?? `${got.url}#${slug(pn.label)}`, title: pn.label.slice(0, 80), kind, hash: hash(pn.text), excerpt: pn.text.replace(/\s+/g, " ").slice(0, 400), path: `${q.path} › ${pn.label.slice(0, 60)}`, text: pn.text.slice(0, TEXT_CAP), panel: true };
      follow(pn.links, { ...q, path: `${q.path} › ${pn.label.slice(0, 60)}` });
    }
  }
  return { signedOut: false, snapshot: { course, at: Date.now(), pages } };
}

/** the dated things on the course's pages (pure), each with the page's click path as its source */
export function datesOfCourse(s: Snapshot, ref: Date): Dated[] {
  const out: Dated[] = [];
  for (const p of Object.values(s.pages)) {
    // on an item's own page (a panel, an assignment) its lines rarely name it: the title goes in front
    const named = p.kind !== "announcement" && p.kind !== "calendar" && p.kind !== "outline";
    for (const d of datesIn(p.text ?? p.excerpt, ref, `blackboard ${p.path ?? p.title}`)) out.push(named && !d.what.toLowerCase().includes(p.title.toLowerCase()) ? { ...d, what: `${p.title}: ${d.what}`.slice(0, 120) } : d);
  }
  return out;
}

/** the folder's blackboard.md (pure): every page the walk saw, its click path, its kind and its text, for the rules
 *  that quote the fine print (IS223's 08:00 today.md) */
export function blackboardMd(s: Snapshot, name: string): string {
  const when = new Date(s.at).toISOString().slice(0, 16).replace("T", " ");
  const pages = Object.values(s.pages).sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));
  return [`# Blackboard, ${name.toUpperCase()} (${s.course})`, ``, `What the last walk saw (${when} UTC), ${pages.length} pages. The agent rewrites this file each walk.`, ``,
    ...pages.flatMap((p) => [`## ${p.path ?? p.title}`, ``, `${p.kind}${p.panel ? ", opened in place" : ""} · ${p.url}`, ``, "```", (p.text ?? p.excerpt).trim(), "```", ``])].join("\n");
}

/** what changed between two looks (pure): new pages, pages whose text changed, pages gone */
export function diff(before: Snapshot | null, after: Snapshot): Change[] {
  if (!before) return [];
  const out: Change[] = [];
  for (const [k, p] of Object.entries(after.pages)) {
    const was = before.pages[k];
    if (!was) out.push({ key: k, kind: p.kind, title: p.title, how: "new", excerpt: p.excerpt, url: p.url });
    else if (was.hash !== p.hash) out.push({ key: k, kind: p.kind, title: p.title, how: "changed", excerpt: p.excerpt, url: p.url });
  }
  for (const [k, p] of Object.entries(before.pages)) if (!after.pages[k]) out.push({ key: k, kind: p.kind, title: p.title, how: "gone", excerpt: "", url: p.url });
  return out;
}

/** one line for the ledger and the prompt: what changed (pure) */
export const changeLine = (cs: Change[]) => cs.length ? cs.slice(0, 8).map((c) => `${c.how} ${c.kind} "${c.title}"`).join("; ") + (cs.length > 8 ? `; and ${cs.length - 8} more` : "") : "nothing changed";
