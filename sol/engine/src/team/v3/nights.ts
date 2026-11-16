// Cowork v3, slice 6 (fr-30, #559): our dev night, the release and the morning shown as three automations. They are
// read from today's timers and scripts, never stored and never moved: the hours come from where the timers get them
// (the night's from night.json beside team.json, nightfile.ts, as `sol/night --hour` says; the release's and the
// morning's from the project's rhythm, as `sol/release --calendar` and `sol/morning --calendar` say, release.ts
// calendarOf and morning.ts morningCalendar), and the part that does the work calls the script itself (a dry run when
// pressed by hand here; the timers on the NucBox still run the real thing, unchanged, fr-16). The scripts are not
// touched: everything about them is described from this side.
import { calendarOf } from "../release.js";
import { morningCalendar } from "../morning.js";
import { clockIn, dayPlus, momentOf, type Rhythm } from "../tonight.js";
import type { Automation, Night, Step } from "./studio.js";

const pad = (n: number) => String(n).padStart(2, "0");
/** the night job's OnCalendar, as sol-night.timer is filled: every day at the hour, this machine's zone */
export const nightCalendar = (hour: number) => `*-*-* ${pad(hour)}:00:00`;

/** the next moment an OnCalendar line of ours fires after `now` (pure): "*-*-* HH:MM:SS [Zone]"; null if it is not one */
export function nextOf(calendar: string, now: Date): Date | null {
  const m = calendar.trim().match(/^\*-\*-\* (\d{2}):(\d{2})(?::\d{2})?(?: (\S+))?$/);
  if (!m) return null;
  const zone = m[3] ?? "", time = `${m[1]}:${m[2]}`, today = clockIn(now, zone).day;
  for (let k = 0; k < 3; k++) { const t = momentOf(dayPlus(today, k), time, zone); if (t.getTime() > now.getTime()) return t; }
  return null;
}
/** an OnCalendar line in words: "every day 09:00 New York" (pure) */
export function calendarWords(calendar: string): string {
  const m = calendar.trim().match(/^\*-\*-\* (\d{2}):(\d{2})(?::\d{2})?(?: (\S+))?$/);
  if (!m) return calendar;
  return `every day ${m[1]}:${m[2]}${m[3] ? ` ${m[3].split("/").pop()!.replace(/_/g, " ")}` : ""}`;
}

export type NightsIn = {
  project: string;
  /** the night job's hour (nightNow().hour) */
  nightHour: number;
  /** the project's rhythm, null when it has none (then only the night shows: the release and the morning need it) */
  rhythm: Pick<Rhythm, "release" | "zone" | "dev"> | null;
  me: string;
  now: Date;
};

const step = (part: Step["part"], label: string, extra: Partial<Step> = {}): Step => ({ part, label, ...extra });

/** the three nights as automations, in the day's order: the night, the release, the morning */
export function nights(o: NightsIn): Automation[] {
  const owner = o.rhythm && o.rhythm.dev.length && !o.rhythm.dev.some((x) => x.toLowerCase() === o.me.toLowerCase()) ? o.rhythm.dev[0] : o.me;
  const at = o.now.getTime();
  const one = (night: Night, name: string, timer: string, calendar: string, words: string, flow: Step[], note: string): Automation => ({
    id: `night-${night}`, project: o.project, owner, name, words, flow, on: true, spend: { who: owner, limit: 0 }, made: at, changed: at,
    night, timer, calendar, next: nextOf(calendar, o.now)?.toISOString(), readonly: true, note,
  });
  const out: Automation[] = [];
  const nc = nightCalendar(o.nightHour);
  out.push(one("night", "The dev night", "sol-night.timer", nc,
    `${cap(calendarWords(nc))}, gather the open pull requests and the claims, if two of them clash say so on both issues, summarize the night's digest, send it to the Night digest issue on GitHub.`,
    [step("when", calendarWords(nc)),
      step("gather", "open PRs and claims", { call: { script: "sol/night", args: ["--dry-run"] } }),
      step("if", "two PRs clash", { look: "clashes predicted" }),
      step("summarize", "the night's digest", { look: "claims held|merged since the last run" }),
      step("send", "Night digest issue", { place: "github", look: "would post on|posted on|would open the issue" })],
    "sol/night by sol-night.timer on the NucBox; pressed here it is a dry run that posts nothing"));
  if (o.rhythm) {
    const rc = calendarOf(o.rhythm), mc = morningCalendar(o.rhythm);
    out.push(one("release", "The release", "sol-release.timer", rc,
      `${cap(calendarWords(rc))}, gather what went into main overnight, summarize it as the day's dev release, send it to every Sol, if the beta reviewer passed one move it to beta.`,
      [step("when", calendarWords(rc)),
        step("gather", "what went into main", { call: { script: "sol/release", args: ["--dry-run"] } }),
        step("summarize", "as dev-YYYYMMDD", { look: "^release:|would tag|^released|already released|nothing merged" }),
        step("send", "every Sol on the relay", { place: "record", look: "every Sol|relay" }),
        step("if", "the beta reviewer passed one", { look: "beta|stable" })],
      "sol/release by sol-release.timer on the NucBox; pressed here it is a dry run: nothing moves"));
    out.push(one("morning", "The morning", "sol-morning.timer", mc,
      `${cap(calendarWords(mc))}, gather the newest dev release, if the gate is green try the features it touched as a first-timer, summarize it for Sol developers, send it to the Night digest issue.`,
      [step("when", calendarWords(mc)),
        step("gather", "the newest dev release", { call: { script: "sol/morning", args: ["--dry-run"] } }),
        step("if", "the gate is green", { look: "^morning: (?:the )?gate|gate " }),
        step("summarize", "for Sol developers", { look: "^Morning run|feature" }),
        step("send", "Night digest issue", { place: "github", look: "would post on|posted on|not posted|no open" })],
      "sol/morning by sol-morning.timer on the NucBox; pressed here it is a dry run, and the gate and the first-timer take a while"));
  }
  return out;
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
