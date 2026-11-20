// Copied from MR (origin/marco/mine-run fa6becaf, the same as 54e4f636 for these files) sol/mac/src/home-say.test.ts l.12-13, l.19-110 (NOW, THU, TUE, his sentences and the values his tests expect) and sol/mac/src/home/whole/today.ts l.202-216 (the calendar's eight marks of his week); not imported: the engine never imports sol/mac.
// The sentences the rule judge (src/home/judge.ts) is run on against test/fixtures/home/reads-baseline.json. The first
// ones are his test file's; the rest (`his: false`) are the engine's own, added to reach every rule of his judge (each
// read, a clock, today and tomorrow, a folder of each kind). The 54 the design names were not found (specs home-plan
// §7): the list takes them as they come, one line each. The baseline was written from Marco's own reads.ts (readOf,
// receiptLine, thingOf) run on these sentences, not from the port, so the test proves the port answers as his code does.
import type { Mark } from "../../../src/contract/home/today.ts";
import { NOW } from "./seed.ts";

export { NOW };
/** Tuesday 10 November 2026, 8:40 (his #867 F1 test) */
export const TUE = new Date(2026, 10, 10, 8, 40).getTime();
/** Thursday 12 November at an hour */
export const THU = (h: number, m = 0) => new Date(2026, 10, 12, h, m).getTime();
export const DAYS = { mon: NOW, tue: TUE } as const;

/** his week's calendar marks (today.ts weekOf, the `cal` part): the scenes' week, each on its weekday from `now`. The
 *  engine has no calendar source and sends none of them; the tests hand them to the judge as the face would */
export function calendar(now: number): Mark[] {
  const day = new Date(now), at = (plus: number, h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + plus, h, m).getTime();
  const on = (dow: number, h: number, m = 0) => at((dow - day.getDay() + 7) % 7, h, m);
  const cal: Mark[] = [
    { id: "w-bio-lecture", kind: "event", at: on(1, 10), end: on(1, 11, 30), label: "bio 201 lecture" },
    { id: "w-chem-lab", kind: "event", at: on(2, 14), end: on(2, 17), label: "chem lab" },
    { id: "w-stats-group", kind: "event", at: on(3, 16), end: on(3, 17, 30), label: "stats group" },
    { id: "w-study", kind: "proposal", at: on(3, 19), end: on(3, 21), label: "study block?" },
    { id: "w-bio-exam", kind: "big", at: on(4, 10), end: on(4, 12), label: "bio exam" },
    { id: "w-dentist", kind: "you", at: on(5, 9), label: "book the dentist", yours: true },
    { id: "w-shopify", kind: "due", at: on(6, 17), label: "Shopify closes" },
    { id: "w-grandma", kind: "event", at: on(0, 11), end: on(0, 12), label: "call grandma" },
  ];
  return cal.sort((a, b) => a.at - b.at);
}

export type Sentence = { text: string; day: keyof typeof DAYS; week: "calendar" | "none"; his: boolean };
const s = (text: string, day: keyof typeof DAYS, week: "calendar" | "none", his: boolean): Sentence => ({ text, day, week, his });
export const SENTENCES: Sentence[] = [
  // his (home-say.test.ts)
  s("call Sam about the offer Thursday", "mon", "calendar", true),             // l.22
  s("bio exam thursday, make notes from the slides", "mon", "calendar", true), // l.46
  s("bio exam thursday, make notes from the slides; call mum and then book the dentist", "mon", "none", true),   // l.58
  s("call Sam about the offer Thursday", "mon", "none", true),                 // l.59
  s("dinner friday", "mon", "none", true),                                     // l.63
  s("thursday", "mon", "none", true),                                          // l.65
  s("the blue one was nicer", "mon", "none", true),                            // l.67
  s("call Sam about the offer Thursday", "tue", "calendar", true),             // l.101
  s("bio exam thursday, make notes from the slides", "tue", "calendar", true), // l.104
  // the engine's own, for the rules his sentences do not reach
  s("make a tracker for job applications", "mon", "none", false),
  s("summarize the chem lecture tomorrow at 3pm", "mon", "calendar", false),
  s("pay rent today", "mon", "none", false),
  s("stats group meeting wednesday at 16:00", "mon", "calendar", false),
  s("draft a cover letter for the Shopify application", "mon", "none", false),
  s("meet Maya friday 11am", "mon", "none", false),
  s("chem lab tuesday", "mon", "calendar", false),
  s("a deck for the bio presentation", "mon", "none", false),
  s("check the survey data and then text Maya", "tue", "none", false),
  s("lunch with Ana tomorrow", "mon", "none", false),
  s("call grandma sunday", "mon", "calendar", false),
  s("buy a new charger", "mon", "none", false),
  s("remember the wifi password is on the fridge", "mon", "none", false),
  s("outline the essay by friday; book the dentist", "mon", "calendar", false),
  s("homework set 7 thursday", "tue", "calendar", false),
  s("interview with the recruiter on monday at 9", "tue", "none", false),
  s("the midterm is tonight", "mon", "none", false),
];
/** the week a sentence is read against */
export const weekOf = (x: Sentence): Mark[] => (x.week === "calendar" ? calendar(DAYS[x.day]) : []);

/** what his tests expect (home-say.test.ts) */
export const HIS = {
  sam: { read: "you", verdict: "sure", folder: "jobs", at: THU(13), after: "bio exam" },                       // l.25-28
  samLine: "↳ jobs · for you, Thursday 13:00, after your bio exam · it joins this list Thursday morning, prepared",   // l.38
  samRing: { kind: "you", yours: true, at: THU(13), label: "call Sam" },                                       // l.33-36
  scene2: [["bio exam thursday", "date"], ["make notes from the slides", "job"]],                               // l.47
  scene2Found: "w-bio-exam",                                                                                    // l.48
  scene2Folder: "school › bio 201",                                                                             // l.50
  split: ["bio exam thursday", "make notes from the slides", "call mum", "book the dentist"],                   // l.58
  overrideLine: "jobs · a job, started · ready Thursday 13:00",                                                 // l.85
};

/** his own filing rules (#1686): what the engine once held as constants for everyone, now his, in his order, as his
 *  <HOME>/home-rules.json would hold them (src/home/rules.ts) */
export const HIS_RULES = { file: [
  { words: ["bio", "biology", "slides", "midterm"], folder: "school › bio 201" },
  { words: ["chem", "chemistry", "lab", "equilibrium"], folder: "school › chem 110" },
  { words: ["stats", "statistics", "survey", "maya"], folder: "school › stats 140" },
  { words: ["offer", "interview", "application", "cv", "cover letter", "recruiter", "sam", "shopify"], folder: "jobs" },
  { words: ["exam", "lecture", "class", "course", "homework"], folder: "school" },
] };

const TIMES = new Set(["at", "end", "from", "due"]);
const pad = (n: number) => String(n).padStart(2, "0");
const local = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** a value as the baseline keeps it: every time field as local "YYYY-MM-DD HH:mm" (so the file holds on any time zone),
 *  fields left undefined dropped */
export function norm(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).map(([k, v]) => [k, TIMES.has(k) && typeof v === "number" ? local(v) : norm(v)]));
  return x;
}
