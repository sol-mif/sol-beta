// What mail, Teams and the group chat have in common (step 2), pure: a message, whether it belongs to the folder, whether
// it needs an answer from Marco, what was new since the last look, and where its draft goes.
import type { About } from "../about.js";

export type Message = {
  id: string; site: string;
  from: string; address?: string;
  subject?: string; text: string;
  /** as the site showed it (10:42 AM, Nov 9) */
  at: string;
  /** what it is: a mail, a chat message, a mention */
  kind?: "mail" | "chat" | "mention";
  /** Marco wrote it */
  mine?: boolean;
};

export type Belongs = "yes" | "no" | "unclear";
const BULK = /\b(no-?reply|do-?not-?reply|notifications?|newsletter|digest|mailer-daemon|bounce|marketing|announcements?@)\b/i;

/** does a message belong to this folder (pure)? yes: from one of its people (by address, or by full name), or it names
 *  the course code; unclear: only a first or last name matches, or a person is named in the text; no: anything else */
export function belongs(m: Message, a: Pick<About, "people" | "codes">): Belongs {
  const from = m.from.toLowerCase(), addr = (m.address ?? "").toLowerCase();
  const hay = `${m.subject ?? ""}\n${m.text}`;
  for (const p of a.people) {
    if (p.email && addr && p.email === addr) return "yes";
    if (from.includes(p.name.toLowerCase()) || (from.includes(p.first.toLowerCase()) && from.includes(p.last.toLowerCase()) && p.first !== p.last)) return "yes";
  }
  for (const c of a.codes) if (new RegExp(`\\b${c.replace(/\s+/g, "\\s*")}\\b`, "i").test(hay)) return "yes";
  for (const p of a.people) {
    const last = p.last.length > 2 ? new RegExp(`\\b${p.last.replace(/[^\w'-]/g, "")}\\b`, "i") : null;
    if (last && (last.test(m.from) || last.test(hay))) return "unclear";
    if (p.first !== p.last && p.first.length > 2 && new RegExp(`^${p.first}\\b`, "i").test(m.from)) return "unclear";
  }
  return "no";
}

const ASK = /\?|\b(please|pls|can you|could you|would you|will you|let me know|lmk|reply|respond|confirm|rsvp|are you|do you|send (me|us|it)|when can|by (tonight|tomorrow|tmrw|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|need (you|your)|your (part|section|slides|draft)|marco)\b/i;
/** does a message need an answer from Marco (pure)? From a person (not a mailer), not his own, and it asks something */
export function needsAnswer(m: Message): boolean {
  if (m.mine || BULK.test(m.from) || BULK.test(m.address ?? "")) return false;
  if (m.kind === "mention") return true;
  return ASK.test(`${m.subject ?? ""}\n${m.text}`);
}

/** the messages not seen at the last look (pure); the first look (no last) sees nothing new: a baseline */
export function newSince(last: string[] | null, now: Message[]): Message[] {
  if (!last) return [];
  const was = new Set(last);
  return now.filter((m) => !was.has(m.id));
}

/** the people's word for who wrote it: "Prof. Lomax" for the professor, else the first name (pure) */
export function whoOf(m: Message, a: Pick<About, "people">): string {
  const p = a.people.find((x) => (x.email && x.email === (m.address ?? "").toLowerCase()) || m.from.toLowerCase().includes(x.last.toLowerCase()));
  if (p?.role === "professor") return `Prof. ${p.last}`;
  if (p) return p.first;
  return m.from.replace(/<.*>/, "").trim().split(/\s+/)[0] || "them";
}

const fileWord = (s: string) => s.toLowerCase().replace(/^prof\.?\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "them";
/** where a reply's draft goes: drafts/<date>-<who>.md (pure) */
export const draftPath = (day: string, who: string) => `drafts/${day}-${fileWord(who)}.md`;
export const dayOf = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** one line for the folder's log: time · who · subject · text (pure) */
export const logLine = (m: Message) => `- ${m.at} · ${m.from}${m.subject ? ` · ${m.subject.replace(/\s+/g, " ")}` : ""} · ${m.text.replace(/\s+/g, " ").slice(0, 200)}`;
