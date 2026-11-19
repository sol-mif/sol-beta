// What a folder says about itself, read from its own files (step 2): the Blackboard course, the class times, the people
// whose messages belong here, the course code, the group chat's name. Everything here is pure on text, with one reader.
//   course   the rule's sentence (_348751_1), else policy.md's optional first line `course: _348751_1`, else the first
//            course id in brain.md
//   class    brain.md: "MWF at 10:10", "Mon/Wed/Fri 10:10", "Tue/Thu", a `class:` line in policy.md wins
//   people   brain.md and policy.md: the professor ("Professor Dionne Lomax", "Prof. Wiles"), names after "with"
//            ("Team 3 with Leslie Garcia, Jiachen Xie, and Londyn Gray"), every e-mail address; policy.md's
//            `people: A, B <b@x.edu>` line adds to them
//   code     the folder's name as a course code (la245 → LA245, also "LA 245"); policy.md `code:` wins
//   group    policy.md `group: Day in Court Team 3`, else the rule's quoted name
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
export type About = { course: string | null; classDays: number[] | null; classTime: string | null; people: Person[]; codes: string[]; group: string | null; name: string };
export type Person = { name: string; first: string; last: string; email?: string; role?: "professor" };

const COURSE_ID = /\b_\d{5,7}_1\b/;
/** a `key: value` line at the top of policy.md (before the first bullet), pure */
export function headerOf(policy: string, key: string): string | null {
  for (const line of policy.split("\n")) {
    if (/^\s*[-*]\s+\[/.test(line)) break;
    const m = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "i").exec(line);
    if (m) return m[1];
  }
  return null;
}

/** the course id for a rule (pure): the rule's own, policy.md's `course:`, then brain.md's first */
export function courseIn(o: { sentence?: string; policy: string; brain: string }): string | null {
  return COURSE_ID.exec(o.sentence ?? "")?.[0] ?? COURSE_ID.exec(headerOf(o.policy, "course") ?? "")?.[0] ?? COURSE_ID.exec(o.brain)?.[0] ?? null;
}

const DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
/** class days and time from text (pure): "MWF at 10:10", "Mon/Wed/Fri 10:10", "Tue/Thu 9:40", "TTh" */
export function classIn(text: string): { days: number[] | null; time: string | null } {
  const t = text;
  let days: number[] | null = null;
  const letters = /\b(MWF|MW|WF|TTh|TR|TuTh|MTWTh|MTWRF)\b/.exec(t)?.[1];
  if (letters) {
    const map: Record<string, number[]> = { MWF: [1, 3, 5], MW: [1, 3], WF: [3, 5], TTh: [2, 4], TR: [2, 4], TuTh: [2, 4], MTWTh: [1, 2, 3, 4], MTWRF: [1, 2, 3, 4, 5] };
    days = map[letters];
  } else {
    const m = /\b((?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?(?:\s*(?:\/|,|and|&)\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?)+)/i.exec(t);
    if (m) days = [...m[1].toLowerCase().matchAll(/(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)/g)].map((x) => DAY[x[1]]).filter((d) => d !== undefined);
  }
  const tm = /\b(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?/i.exec(t.slice(Math.max(0, (letters ? t.indexOf(letters) : 0) - 40)));
  let time: string | null = null;
  if (tm) {
    let h = Number(tm[1]);
    if (tm[3] && /p/i.test(tm[3]) && h < 12) h += 12;
    time = `${String(h).padStart(2, "0")}:${tm[2]}`;
  }
  return { days: days && days.length ? [...new Set(days)].sort() : null, time };
}

const person = (name: string, extra: Partial<Person> = {}): Person => {
  const parts = name.trim().split(/\s+/);
  return { name: name.trim(), first: parts[0], last: parts[parts.length - 1], ...extra };
};
const NAME = "[A-Z][a-zA-Z'’-]+(?:\\s+[A-Z][a-zA-Z'’-]+){0,2}";
/** the people a folder's text names (pure) */
export function peopleIn(text: string): Person[] {
  const out: Person[] = [];
  const same = (a: Person, b: Person) => a.name.toLowerCase() === b.name.toLowerCase() || a.last.toLowerCase() === b.last.toLowerCase() && (a.first === a.last || b.first === b.last || a.first.toLowerCase() === b.first.toLowerCase());
  const add = (p: Person) => {
    const was = out.find((x) => same(x, p) || (p.email && x.email === p.email));
    if (!was) { out.push(p); return; }
    if (p.name.split(" ").length > was.name.split(" ").length) Object.assign(was, { name: p.name, first: p.first, last: p.last });
    if (p.role) was.role = p.role;
    if (p.email && !was.email) was.email = p.email;
  };
  for (const m of text.matchAll(new RegExp(`\\b(?:Professor|Prof\\.?|Dr\\.?)\\s+(${NAME})`, "g"))) add(person(m[1].replace(/['’]s$/, "").replace(/\s+(?:Blackboard|Section|MWF|TTh)\b.*$/, ""), { role: "professor" }));
  for (const m of text.matchAll(new RegExp(`\\bwith\\s+((?:${NAME})(?:\\s*,\\s*(?:and\\s+)?${NAME})*(?:,?\\s+and\\s+${NAME})?)`, "g"))) {
    for (const n of m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) if (/^[A-Z][a-z]+\s+[A-Z]/.test(n) && !/^(Professor|Prof|Section|Team)\b/.test(n)) add(person(n));
  }
  for (const m of text.matchAll(/(?:([A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+)?)\s*)?<?\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b>?/gi)) {
    const email = m[2].toLowerCase(), local = email.split("@")[0];
    const was = out.find((p) => m[1] && p.name.toLowerCase() === m[1].toLowerCase()) ?? out.find((p) => p.last.length > 2 && local.includes(p.last.toLowerCase()));
    if (was) { if (!was.email) was.email = email; }
    else add(person(m[1] ?? local, { email }));
  }
  return out;
}

/** the course codes a folder goes by (pure): la245 → LA245, LA 245 */
export function codesOf(name: string, policy: string): string[] {
  const own = headerOf(policy, "code");
  const m = /^([a-z]{2,4})[ -]?(\d{2,4})$/i.exec(name);
  const out = own ? [own] : [];
  if (m) out.push(`${m[1].toUpperCase()}${m[2]}`, `${m[1].toUpperCase()} ${m[2]}`);
  return [...new Set(out)];
}

/** what a folder says about itself, read from its files */
export function aboutOf(folder: string, sentence = ""): About {
  const policy = read(join(folder, "policy.md")), brain = read(join(folder, "brain.md"));
  const cls = classIn(headerOf(policy, "class") ?? brain);
  const people = peopleIn(brain);
  for (const p of peopleIn(headerOf(policy, "people") ?? "")) if (!people.some((x) => x.name === p.name)) people.push(p);
  const group = headerOf(policy, "group") ?? /"([^"]{2,80})"/.exec(sentence)?.[1] ?? null;
  return { course: courseIn({ sentence, policy, brain }), classDays: cls.days, classTime: cls.time, people, codes: codesOf(basename(folder), policy), group, name: basename(folder) };
}
