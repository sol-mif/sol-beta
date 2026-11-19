// People for the jobs folder: one file a person, people/<slug>.md, that Marco can read and change by hand.
//
//   # Dana Lee
//   - where: San Francisco
//   - company: Acme Agents
//   - role: Staff engineer, agent tooling
//   - why: She wrote the post on tool-calling evals that Sol's own harness copies.
//   - link: https://acme.example/team
//   - reach: email dana@acme.example (shown on https://acme.example/team) · LinkedIn https://… · mutual: none known
//   - state: found
//   - variant: coffee-their-work
//
//   ## Touches
//   - 2026-11-09 found on https://acme.example/team
//
// The states go one way: found → drafted → sent → replied → met → follow-up ("follow-up": met, thanked, the next
// touch is set). "dropped" is his drop or skip, from found or drafted. A press may skip ahead (met without a reply
// pressed first); it never goes back. The parse and the writing are pure; the disk part is at the bottom.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STATES = ["found", "drafted", "sent", "replied", "met", "follow-up"] as const;
export type PersonState = (typeof STATES)[number] | "dropped";
export const FIELDS = ["where", "company", "role", "why", "link", "reach", "state", "variant"] as const;
export type Person = {
  slug: string; name: string; where: string; company: string; role: string; why: string; link: string; reach: string;
  state: PersonState; variant: string;
  /** dated lines, oldest first: `2026-11-09 found on https://…` */
  touches: string[];
  /** anything else in the file (his own notes), kept as written */
  rest: string;
};

/** a file name for a person: lower case, words joined by "-" (pure) */
export const slugOf = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "someone";

/** a person's file, read (pure). Unknown states read as found, so a hand-made file still counts */
export function parsePerson(slug: string, text: string): Person {
  const p: Person = { slug, name: slug, where: "", company: "", role: "", why: "", link: "", reach: "", state: "found", variant: "", touches: [], rest: "" };
  let part: "head" | "touches" | "rest" = "head";
  const rest: string[] = [];
  for (const line of text.split("\n")) {
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h1 && part === "head" && p.name === slug) { p.name = h1[1]; continue; }
    if (/^##\s+touches\s*$/i.test(line)) { part = "touches"; continue; }
    if (/^##\s+/.test(line)) part = "rest";
    if (part === "head") {
      const f = /^\s*[-*]\s+([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(line);
      const k = f?.[1].toLowerCase();
      if (f && (FIELDS as readonly string[]).includes(k!)) {
        if (k === "state") p.state = ([...STATES, "dropped"] as string[]).includes(f[2].toLowerCase()) ? (f[2].toLowerCase() as PersonState) : "found";
        else (p as any)[k!] = f[2];
        continue;
      }
      if (line.trim()) rest.push(line);
    } else if (part === "touches") {
      const t = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
      if (t) p.touches.push(t[1]);
    } else rest.push(line);
  }
  p.rest = rest.join("\n").trim();
  return p;
}

/** a person's file, written (pure) */
export function personMd(p: Person): string {
  const head = FIELDS.map((k) => `- ${k}: ${String(p[k] ?? "").replace(/\s*\n\s*/g, " ")}`);
  return [`# ${p.name}`, "", ...head, "", "## Touches", "", ...p.touches.map((t) => `- ${t}`), ...(p.rest ? ["", p.rest] : []), ""].join("\n");
}

/** may a person move from one state to the next? Forward only; dropped from found or drafted (pure) */
export function canMove(from: PersonState, to: PersonState): boolean {
  if (from === to) return false;
  if (from === "dropped") return false;
  if (to === "dropped") return from === "found" || from === "drafted";
  return STATES.indexOf(to as any) > STATES.indexOf(from as any);
}

/** the day as YYYY-MM-DD, local time (pure) */
export const dayOf = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** a person moved to a state, with the touch that says so; null when the move is not allowed (pure) */
export function move(p: Person, to: PersonState, at: number, words?: string): Person | null {
  if (!canMove(p.state, to)) return null;
  return { ...p, state: to, touches: [...p.touches, `${dayOf(at)} ${words ?? to}`] };
}
/** a dated touch, the state unchanged (pure) */
export const touch = (p: Person, at: number, words: string): Person => ({ ...p, touches: [...p.touches, `${dayOf(at)} ${words}`] });

/** the day a touch starting with these words was made, or null (pure): the last one */
export function touchedOn(p: Person, words: string): string | null {
  const t = [...p.touches].reverse().find((x) => x.slice(11).startsWith(words));
  return t ? t.slice(0, 10) : null;
}
export const hasTouch = (p: Person, words: string) => touchedOn(p, words) !== null;

/** counts by state, every state present (pure) */
export function byState(people: Person[]): Record<PersonState, number> {
  const out = Object.fromEntries([...STATES, "dropped"].map((s) => [s, 0])) as Record<PersonState, number>;
  for (const p of people) out[p.state]++;
  return out;
}

/** has this person been sent a first message? (any state from sent on) (pure) */
export const wasSent = (p: Person) => STATES.indexOf(p.state as any) >= STATES.indexOf("sent");
export const didReply = (p: Person) => STATES.indexOf(p.state as any) >= STATES.indexOf("replied");
export const didMeet = (p: Person) => STATES.indexOf(p.state as any) >= STATES.indexOf("met");
/** a person as the A/B test counts them (ab.ts tally) */
export const abRow = (p: Person) => ({ variant: p.variant, sent: wasSent(p), replied: didReply(p), met: didMeet(p), dropped: p.state === "dropped" });

/** the people sent a first message `days` or more days ago, with no reply and no follow-up yet (pure) */
export function followUpsDue(people: Person[], today: string, days = 5): Person[] {
  const t = Date.parse(`${today}T12:00:00`);
  return people.filter((p) => {
    if (p.state !== "sent" || hasTouch(p, "follow-up")) return false;
    const sent = touchedOn(p, "sent");
    return !!sent && (t - Date.parse(`${sent}T12:00:00`)) / 86_400_000 >= days;
  });
}

// ---- on disk ----
export const peopleDir = (folder: string) => join(folder, "people");
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function readPerson(folder: string, slug: string): Person | null {
  if (!SLUG.test(slug)) return null;
  try { return parsePerson(slug, readFileSync(join(peopleDir(folder), `${slug}.md`), "utf8")); } catch { return null; }
}
export function readPeople(folder: string): Person[] {
  let names: string[] = [];
  try { names = readdirSync(peopleDir(folder)).filter((n) => n.endsWith(".md") && !n.startsWith(".")); } catch { return []; }
  return names.map((n) => readPerson(folder, n.slice(0, -3))).filter((p): p is Person => !!p).sort((a, b) => a.slug.localeCompare(b.slug));
}
export function savePerson(folder: string, p: Person) {
  mkdirSync(peopleDir(folder), { recursive: true });
  const file = join(peopleDir(folder), `${p.slug}.md`), tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, personMd(p));
  renameSync(tmp, file);
}
export const personExists = (folder: string, slug: string) => existsSync(join(peopleDir(folder), `${slug}.md`));

const EMAIL = /(?:e-?mail\s+)?[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
/** an address is kept only where the line names the public page that shows it: `email x@y (shown on https://…)`.
 *  Any other address is taken out (pure): the agent never guesses one */
export function checkReach(reach: string): { reach: string; removed: string[] } {
  const removed: string[] = [];
  const out = reach.replace(EMAIL, (m, at: number, all: string) => {
    if (/^\s*\(shown on https?:\/\/[^\s)]+\)/i.test(all.slice(at + m.length))) return m;
    removed.push(m.replace(/^e-?mail\s+/i, ""));
    return "";
  }).replace(/\s*·\s*(?=·|$)/g, "").replace(/^\s*·\s*/, "").replace(/\s{2,}/g, " ").trim();
  return { reach: out || "none found", removed };
}
