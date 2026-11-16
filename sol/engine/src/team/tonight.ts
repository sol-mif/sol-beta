// The review session (#416, part of #413, team flow v2): at the project's review hour Sol opens a Work session in the
// reviewer's own Sol, in that person's folder for the project, holding the summary of what was handed in that day,
// with the buttons as one card in the talk. The buttons say where a change goes (#477):
//   dev night    every change handed in (for now: an open PR marked ready, not a draft), each with its area, who made
//                it, a risk and what to try; per change: Into sol-dev (the project's own name), or Send back, then
//                slight or severe
//   beta night   yesterday's whole dev release (what went into the project the night before, up to its morning
//                release); two buttons and nothing else: Into beta (whole), or Hold. No button picks single changes
// The hours and the reviewers are the project's rhythm, one file in the project's repository, `.sol/rhythm.json` on
// its default branch, so the whole team reads the same one and a change to it is seen by all (no hour, no name here).
// What a press does is written where everyone sees it: Into sol-dev or a send back as one comment on the PR, Into beta
// or Hold as one comment on the issue "Night digest"; Cowork's feed reads those (feed.ts noteLine, kind "reviewed").
// Into sol-dev is one merge commit and the branch deleted, so one revert undoes it; a conflict or a red check stops it
// first and the change stays on its branch. Only on the reviewer's press in the session: the session's agent never
// does it. Code names stay as they were (the verdict "fold", the state "folded", folds.ts): only the words changed.
// Everything that touches GitHub, the clock or the session is handed in (TonightDeps), so the tests run with fakes.
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { STATE_DIR } from "../work/state.js";
import { fence } from "./start.js";
import { areasOf, LABELS } from "./claims.js";
import type { Item } from "../work/items.js";

export const RHYTHM_PATH = ".sol/rhythm.json";
export const DIGEST_TITLE = "Night digest";
const DAY = 86_400_000;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
export const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// ---- the rhythm (pure) ----

/** a project's rhythm: when each step happens (HH:MM in `zone`, or each machine's own clock when there is none), and
 *  who reviews. `until` ends a review night: a Sol that opens after midnight and before it still opens the night's review.
 *  Each night has a backup (#478): `devBackup` for the dev review, `betaBackup` for the beta review; when the reviewer has
 *  not pressed by `handover` (23:00 unless the project says), the card opens in the backup's Sol. Nobody named: no backup */
export type Rhythm = { handIn: string; review: string; release: string; until: string; zone: string; dev: string[]; beta: string[]; handover: string; devBackup: string[]; betaBackup: string[];
  /** which file this rhythm was read from (rhythmOf), so a refusal can say it */
  from?: RhythmFrom;
  /** read from the record: what `.sol/rhythm.json` says too (null: none, or it could not be read), for `agreeOn` */
  file?: Rhythm | null };
export type RhythmFrom = ".sol/project.json" | ".sol/rhythm.json";
export type Role = "dev" | "beta";

/** the handover hour when the project names none (#478) */
export const HANDOVER = "23:00";
const hhmm = (v: unknown, d: string) => (typeof v === "string" && HHMM.test(v.trim()) ? v.trim().padStart(5, "0") : d);
const logins = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter((x) => LOGIN.test(x)).slice(0, 10);
const zoneOk = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };

/** the file as read (pure): null when it is missing, not JSON, or names no reviewer; unknown words are left out */
export function parseRhythm(text: unknown): Rhythm | null {
  let j: Record<string, unknown>;
  try { const v = JSON.parse(String(text ?? "")); if (!v || typeof v !== "object" || Array.isArray(v)) return null; j = v as Record<string, unknown>; }
  catch { return null; }
  const r: Rhythm = {
    handIn: hhmm(j.handIn, "20:00"), review: hhmm(j.review, "21:00"), release: hhmm(j.release, "09:00"), until: hhmm(j.until, "06:00"),
    zone: typeof j.zone === "string" && zoneOk(j.zone.trim()) ? j.zone.trim() : "",
    dev: logins(j.dev), beta: logins(j.beta),
    handover: hhmm(j.handover, HANDOVER), devBackup: logins(j.devBackup), betaBackup: logins(j.betaBackup),
  };
  return r.dev.length || r.beta.length ? r : null;
}

const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, "0");

/** the wall clock in a zone (or this machine's when ""): the day "YYYY-MM-DD" and the minutes since its midnight (pure) */
export function clockIn(now: Date, zone = ""): { day: string; minutes: number } {
  if (!zone) return { day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, minutes: now.getHours() * 60 + now.getMinutes() };
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** a day moved by n days (pure) */
export const dayPlus = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** the moment a wall-clock time on a day happens in a zone (or this machine's) (pure but for the machine's zone) */
export function momentOf(day: string, time: string, zone = ""): Date {
  const [y, mo, d] = day.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  if (!zone) return new Date(y, mo - 1, d, h, mi);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at a moment, read back from its own wall clock; asked twice, so a night the offset changes lands right
  const wall = (t: number) => { const c = clockIn(new Date(t), zone); const [Y, M, D] = c.day.split("-").map(Number); return Date.UTC(Y, M - 1, D) + c.minutes * 60_000; };
  const off = (t: number) => wall(t) - t;
  const first = guess - off(guess);
  return new Date(guess - off(first));
}

/** the review night a moment belongs to (pure): its day once the review hour has passed, the day before until `until`
 *  the next morning, else none */
export function nightOf(r: Pick<Rhythm, "review" | "until" | "zone">, now: Date): string | null {
  const c = clockIn(now, r.zone);
  if (c.minutes >= mins(r.review)) return c.day;
  if (c.minutes < mins(r.until)) return dayPlus(c.day, -1);
  return null;
}

/** a role's backup in the rhythm (#478) */
export const backupKey = (role: Role) => (role === "dev" ? "devBackup" : "betaBackup");
/** the moment a night's card opens for its backup (pure): the handover hour after that night's review hour, the same
 *  evening or past midnight */
export function handoverOf(r: Pick<Rhythm, "review" | "handover" | "zone">, night: string): Date {
  const h = r.handover || HANDOVER;
  return momentOf(mins(h) >= mins(r.review) ? night : dayPlus(night, 1), h, r.zone);
}
/** the moment a review night ends (pure): `until` on the morning after it */
export const endOf = (r: Pick<Rhythm, "until" | "zone">, night: string) => momentOf(dayPlus(night, 1), r.until, r.zone);
/** whether the handover falls inside the night (pure): after the review hour and before `until` the next morning */
export function handoverFits(r: Pick<Rhythm, "review" | "until" | "handover">): boolean {
  const rel = (t: string) => (mins(t) - mins(r.review) + 1440) % 1440;
  const end = rel(r.until) || 1440;
  const h = rel(r.handover || HANDOVER);
  return h > 0 && h < end;
}
/** the keys of the beta backup that `.sol/rhythm.json` must say as the record does, since the NucBox beta pass and
 *  beta-guard.yml read only that file */
const AGREE = ["betaBackup", "handover", "zone", "review", "until"] as const;
const said = (r: Partial<Rhythm> | null | undefined, k: (typeof AGREE)[number]) =>
  !r ? "nothing" : Array.isArray(r[k]) ? ((r[k] as string[]).map((x) => x.toLowerCase()).sort().join(", ") || "nobody") : String((k === "handover" ? r[k] || HANDOVER : r[k]) || "none");
/** where the record's rhythm and `.sol/rhythm.json` differ on the beta backup (pure): "" when they agree, or the rhythm
 *  is the file's own */
export function agreeOn(r: Rhythm): string {
  if (r.from !== ".sol/project.json" || !(r.betaBackup ?? []).length && !(r.file?.betaBackup ?? []).length) return "";
  const off = AGREE.filter((k) => said(r, k) !== said(r.file, k));
  return off.length ? off.map((k) => `${k}: .sol/project.json says ${said(r, k)}, .sol/rhythm.json says ${said(r.file, k)}`).join("; ") : "";
}
/** why a role's backup does not count (pure, #478), "" when it does: no zone (the handover would be each Mac's own
 *  hour), a handover outside the night, or, for the beta night, the two rhythm files not agreeing */
export function backupOff(r: Rhythm, role: Role): string {
  if (!(r[backupKey(role)] ?? []).length) return "";
  if (!r.zone) return `the rhythm (${r.from ?? RHYTHM_PATH}) names a ${role} backup but no zone, so the handover hour would be each Mac's own`;
  if (!handoverFits(r)) return `the rhythm's handover (${r.handover || HANDOVER}, ${r.from ?? RHYTHM_PATH}) is not between the review hour ${r.review} and ${r.until}`;
  const off = role === "beta" ? agreeOn(r) : "";
  return off ? `the beta backup counts only when .sol/rhythm.json (which the NucBox beta pass reads) says what the project's settings say: ${off}` : "";
}
/** a role's backups as the engine counts them (pure, #478): none while `backupOff` says why */
export const backupsOf = (r: Rhythm, role: Role): string[] => (backupOff(r, role) ? [] : (r[backupKey(role)] ?? []));
/** the rhythm's words for who reviews and backs up, and from which file (pure): for refusals */
export const rhythmWords = (r: Rhythm, role: Role) =>
  `${r.from ?? RHYTHM_PATH}: ${role} ${r[role].join(", ") || "nobody"}, ${role} backup ${(r[backupKey(role)] ?? []).join(", ") || "nobody"}, handover ${r.handover || HANDOVER} ${r.zone || "(no zone)"}`;

/** who I am on a night's review (pure, #478): its reviewer; its backup from the handover until the night ends;
 *  "early", its backup before the handover; "" anyone else (and a backup that does not count), whose Sol shows nothing of it */
export function seatOf(r: Rhythm, role: Role, me: string, night: string, now: Date): "reviewer" | "backup" | "early" | "" {
  const l = me.toLowerCase();
  if (!l) return "";
  if (r[role].some((x) => x.toLowerCase() === l)) return "reviewer";
  if (!backupsOf(r, role).some((x) => x.toLowerCase() === l)) return "";
  const t = now.getTime();
  if (t >= endOf(r, night).getTime()) return "";
  return t >= handoverOf(r, night).getTime() ? "backup" : "early";
}

/** the reviews this person opens now (pure): each role that names them, once a night a project; a role they back up
 *  from its handover hour on (#478) */
export function dueReviews(a: { repo: string; rhythm: Rhythm; me: string; now: Date; opened: (key: string) => boolean }): { role: Role; night: string; key: string; backup?: true }[] {
  const night = nightOf(a.rhythm, a.now);
  if (!night || !a.me) return [];
  return (["dev", "beta"] as Role[])
    .map((role) => ({ role, seat: seatOf(a.rhythm, role, a.me, night, a.now) }))
    .filter((x) => x.seat === "reviewer" || x.seat === "backup")
    .map(({ role, seat }) => ({ role, night, key: openedKey(a.repo, role, night), ...(seat === "backup" ? { backup: true as const } : {}) }))
    .filter((x) => !a.opened(x.key));
}
export const openedKey = (repo: string, role: Role, night: string) => `${repo.toLowerCase()}|${role}|${night}`;

/** what the beta review of a night looks at (pure): the dev release of that morning, made of what went in from the
 *  night before's review hour up to that morning's release */
export function betaWindow(r: Pick<Rhythm, "review" | "release" | "zone">, night: string): { from: Date; to: Date; release: string } {
  return { from: momentOf(dayPlus(night, -1), r.review, r.zone), to: momentOf(night, r.release, r.zone), release: night };
}

// ---- the changes (pure) ----

export type Risk = "low" | "medium" | "high";
export type Change = {
  number: number; title: string; author: string; url: string; sha: string;
  area: string[]; risk: Risk; why: string; felt: "felt" | "silent" | ""; try: string;
  state?: "busy" | "folded" | "slight" | "severe" | "closed"; error?: string; at?: string;
  back?: true;   // sent back on an earlier night (it wears a sent-back label): "back from last night" (#421)
  handIn?: "session" | "earlier";   // handed in during the night's hand-in (#420, handin.ts handInOf), or before it
};
export type RawPr = {
  number: number; title: string; url?: string; body?: string; isDraft?: boolean; headRefOid?: string; mergedAt?: string; baseRefName?: string; createdAt?: string;
  author?: { login?: string }; labels?: { name?: string }[]; files?: { path?: string }[]; additions?: number; deletions?: number;
};
export const PR_FIELDS = "number,title,url,body,isDraft,headRefOid,baseRefName,author,labels,files,additions,deletions,createdAt";

export const oneLine = (s: unknown, n: number) => { const t = String(s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/** "What to try" from a PR's body (pure): the words after the heading or the line that starts with it, up to the next
 *  heading or the felt-or-silent line, a few hundred characters */
export function tryOf(body: string): string {
  const lines = String(body ?? "").replace(/\r\n?/g, "\n").split("\n");
  const at = lines.findIndex((l) => /^\s*(#{1,6}\s*|\*\*)?what to try\b/i.test(l));
  if (at < 0) return "";
  const first = lines[at].replace(/^\s*(#{1,6}\s*|\*\*)?what to try\b[*:.\s-]*/i, "");
  const out: string[] = first.trim() ? [first] : [];
  for (const l of lines.slice(at + 1)) {
    if (/^\s*#{1,6}\s/.test(l) || /^\s*\**felt or silent\b/i.test(l) || /^\s*(—|🤖)/.test(l)) break;
    out.push(l);
  }
  return oneLine(out.join(" "), 420);
}

/** the "Felt or silent:" word of a PR's body (pure); the latest flip comment wins elsewhere (mark.ts), the body here */
export function feltOf(body: string): "felt" | "silent" | "" {
  const m = /felt or silent\**\s*:?\**\s*\**\s*(felt|silent)\b/i.exec(String(body ?? ""));
  return m ? (m[1].toLowerCase() as "felt" | "silent") : "";
}

/** a risk the reviewer can weigh at a glance (pure), with its reason in a few words. High: the base (every mode breaks
 *  with it) or the checks and rules under .github, or a very large change. Medium: felt, two areas or more, or a
 *  sizeable change. Low: the rest */
export function riskOf(c: { area: string[]; files: string[]; lines: number; felt: string }): { risk: Risk; why: string } {
  if (c.area.includes("base")) return { risk: "high", why: "touches the base: every mode runs on it" };
  if (c.files.some((f) => f.startsWith(".github/"))) return { risk: "high", why: "touches the checks and rules" };
  if (c.lines > 1500) return { risk: "high", why: `a very large change (${c.lines} lines)` };
  if (c.area.length > 1) return { risk: "medium", why: `spans ${c.area.join(", ")}` };
  if (c.lines > 400) return { risk: "medium", why: `a sizeable change (${c.lines} lines)` };
  if (c.felt === "felt") return { risk: "medium", why: "felt: a person notices it" };
  return { risk: "low", why: c.files.length ? `${c.files.length} file${c.files.length > 1 ? "s" : ""}, ${c.lines} lines` : "small" };
}

/** a PR as a change on the card (pure): its area from its labels, else from the paths CODEOWNERS gives a label */
export function changeOf(p: RawPr, codeowners: string): Change {
  const files = (p.files ?? []).map((f) => String(f.path ?? "")).filter(Boolean);
  const labelled = (p.labels ?? []).map((l) => String(l.name ?? "").toLowerCase()).filter((l) => LABELS.includes(l));
  const area = labelled.length ? LABELS.filter((l) => labelled.includes(l)) : areasOf(files, codeowners);
  const felt = feltOf(p.body ?? "");
  const lines = (Number(p.additions) || 0) + (Number(p.deletions) || 0);
  const { risk, why } = riskOf({ area, files, lines, felt });
  return {
    number: p.number, title: oneLine(p.title, 160), author: p.author?.login ?? "?", url: String(p.url ?? ""), sha: String(p.headRefOid ?? ""),
    area, risk, why, felt, try: tryOf(p.body ?? ""),
    ...((p.labels ?? []).some((l) => SENT_BACK.includes(String(l.name ?? "").toLowerCase())) ? { back: true as const } : {}),
  };
}

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
/** the changes handed in (pure): open PRs marked ready that would go into the project's default branch (`base`; a PR
 *  stacked on another branch is not handed in, and Into sol-dev must never land it there), the riskiest first, then by number */
export function handedIn(prs: RawPr[], codeowners: string, base: string): Change[] {
  return prs.filter((p) => !p.isDraft && p.baseRefName === base).map((p) => changeOf(p, codeowners))
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.number - b.number);
}

/** the dev release a beta review looks at (pure): what merged into the default branch in the window */
export function released(prs: RawPr[], w: { from: Date; to: Date }, codeowners: string, base: string): Change[] {
  return prs.filter((p) => { if (p.baseRefName !== base) return false; const t = Date.parse(String(p.mergedAt ?? "")); return !Number.isNaN(t) && t >= w.from.getTime() && t < w.to.getTime(); })
    .map((p) => changeOf(p, codeowners)).sort((a, b) => a.number - b.number);
}

// ---- the card and the first turn (pure) ----

// the code names (#477 kept them; PRD §3.11): "fold" is the button Into sol-dev, "pass" is Into beta, "hold" is Hold
export type Verdict = "fold" | "slight" | "severe" | "pass" | "hold";
export type TonightItem = Item & {
  kind: "tonight"; role: Role; repo: string; base: string; night: string; release?: string; reviewers: string[]; mine: boolean; changes: Change[];
  into?: string;       // the project's name on GitHub when the folder's remote says another (an old or moved repository, #477)
  backups?: string[];   // the night's backup (#478): presses too, from the handover on
  backup?: true;        // opened in the backup's Sol at the handover: the reviewer had not pressed
  handoverAt?: string;  // when the backup may press (ISO)
  untilAt?: string;     // when the night ends, and the backup's press with it (ISO)
  from?: RhythmFrom;    // the file the reviewers and backups were read from, for the refusals' words
  handInAt?: string;   // the night's hand-in hour (#420), for the words "handed in at the 8pm hand-in"
  late?: number;       // changes marked ready after the review hour: not handed in tonight, they wait for the next night
  verdict?: { state?: "busy" | "pass" | "hold"; at?: string; error?: string };
  after: string;
};

const dayWords = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const titleOf = (role: Role, night: string) => `${role === "dev" ? "dev review" : "beta review"} · ${dayWords(night)}`;

/** the card: one item a session, drawn right after the first turn (pure) */
export function cardOf(a: { role: Role; repo: string; base?: string; night: string; release?: string; reviewers: string[]; me: string; changes: Change[]; handInAt?: string; late?: number; backups?: string[]; backup?: boolean; handoverAt?: string; untilAt?: string; from?: RhythmFrom }): TonightItem {
  const backups = a.backups ?? [];
  return {
    id: `tonight:${a.role}:${a.night}`, kind: "tonight", role: a.role, repo: a.repo, base: a.base || "main", night: a.night, ...(a.release ? { release: a.release } : {}),
    ...(a.handInAt ? { handInAt: a.handInAt } : {}), ...(a.late ? { late: a.late } : {}),
    ...(backups.length ? { backups } : {}), ...(a.backup ? { backup: true as const } : {}), ...(a.handoverAt ? { handoverAt: a.handoverAt } : {}),
    ...(a.untilAt ? { untilAt: a.untilAt } : {}), ...(a.from ? { from: a.from } : {}),
    reviewers: a.reviewers, mine: [...a.reviewers, ...backups].some((x) => x.toLowerCase() === a.me.toLowerCase()), changes: a.changes, after: "first",
  };
}
/** who presses a card, as the card says it (pure): "marco", "marco or their backup frank" */
export function pressersOf(c: Pick<TonightItem, "reviewers" | "backups">): string {
  // a backup who is a reviewer too is said once, as the reviewer
  const b = (c.backups ?? []).filter((x) => !c.reviewers.some((y) => y.toLowerCase() === x.toLowerCase()));
  return `${c.reviewers.join(" or ") || "the reviewer"}${b.length ? ` or ${c.reviewers.length === 1 ? "their" : "the"} backup ${b.join(" or ")}` : ""}`;
}

/** the session's first turn (pure but for the fence's mark): what Sol opened and why, the summary fenced (it is the
 *  team's words), and what the agent does and never does here */
export function firstWords(c: TonightItem, me: string, nonce?: string): string {
  const list = c.changes.map((x) => [
    `#${x.number} ${x.title}`,
    `  by ${x.author} · area ${x.area.join(", ") || "none named"} · risk ${x.risk} (${x.why})${x.felt ? ` · ${x.felt}` : ""}${handInWord(x, c.handInAt) ? ` · ${handInWord(x, c.handInAt)}` : ""}${x.back ? " · back from last night" : ""}`,
    `  what to try: ${x.try || "the PR does not say"}`,
    `  ${x.url}`,
  ].join("\n")).join("\n\n");
  const head = c.role === "dev"
    ? `This is tonight's dev review of ${c.repo}, the night of ${c.night}. Sol opened it at the project's review hour because the project's rhythm (.sol/rhythm.json) names ${me} as the ${c.backup ? "dev review's backup, and the reviewer had not pressed by the handover hour (these are the changes still waiting)" : "dev reviewer"}. ${c.changes.length} change${c.changes.length === 1 ? " was" : "s were"} handed in.${c.late ? ` ${c.late} more ${c.late === 1 ? "was" : "were"} marked ready after the review hour: not handed in tonight, ${c.late === 1 ? "it waits" : "they wait"} for the next night.` : ""}`
    : `This is tonight's beta review of ${c.repo}, the night of ${c.night}: the dev release of ${c.release ?? c.night}, ${c.changes.length} change${c.changes.length === 1 ? "" : "s"}. Sol opened it at the project's review hour because the project's rhythm (.sol/rhythm.json) names ${me} as the ${c.backup ? "beta review's backup, and the reviewer had not pressed Into beta or Hold by the handover hour" : "beta reviewer"}.`;
  const into = intoWord(c.into || c.repo);
  const buttons = c.role === "dev"
    ? `The buttons are on the card in this session, per change: ${into} (one merge commit, its branch deleted, so one revert undoes it; a conflict or a red check stops it and it stays on its branch), or Send back, then slight (fixed tonight, then it goes into ${intoName(c.into || c.repo)}) or severe (it waits for the next night).`
    : "The buttons are on the card in this session: Into beta (the whole dev release goes to beta), or Hold (it stays off beta). There is no button for single changes, on purpose: beta gets whole days only.";
  return [
    head, "",
    fence(list, nonce), "",
    buttons,
    "Only the reviewer presses them. You never do what a button does yourself (into, send back, hold), and you never merge or change a PR's state: you help the reviewer decide. When asked, read a change (gh pr view / gh pr diff), try it, say plainly what could break.",
    `Start now with a short overview, a few lines: which changes look safe, which deserve a closer look and why. In everything you write, say the buttons' words ("hand in", "into ${intoName(c.into || c.repo)}", "send back", "into beta", "hold"); never "merge" or "push".`,
  ].join("\n");
}

/** "20:00" as people say it (pure): 8pm, 8:30pm */
export function hourWords(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** when a PR was last handed in (pure): its last "ready for review" after its last "convert to draft", else when it was
 *  opened, if it was opened ready and never a draft since; "" when GitHub does not say */
export function readyAt(events: { event?: string; at?: string }[], createdAt = ""): string {
  let at = "", drafted = false;
  for (const e of events) {
    if (e.event === "ready_for_review") { at = String(e.at ?? ""); drafted = false; }
    else if (e.event === "convert_to_draft") { at = ""; drafted = true; }
  }
  return at || (drafted ? "" : createdAt);
}

/** a change as the 9pm summary says it (pure): handed in during the night's hand-in (from its hand-in hour to its review
 *  hour), earlier, or after the review hour (late: not handed in tonight) */
export function handInOf(at: string, r: Pick<Rhythm, "handIn" | "review" | "zone">, night: string): "session" | "earlier" | "late" | undefined {
  const t = Date.parse(at);
  if (!at || Number.isNaN(t)) return undefined;
  if (t >= momentOf(night, r.review, r.zone).getTime()) return "late";
  return t >= momentOf(night, r.handIn, r.zone).getTime() ? "session" : "earlier";
}

/** a change's hand-in as the summary says it (pure, #420): "handed in at the 8pm hand-in", "handed in before the
 *  hand-in", or nothing when GitHub did not say */
export function handInWord(x: Pick<Change, "handIn">, at = "20:00"): string {
  return x.handIn === "session" ? `handed in at the ${hourWords(at)} hand-in` : x.handIn === "earlier" ? "handed in before the hand-in" : "";
}

// ---- what a press writes (pure) ----

// the labels a send back puts on a PR (#421): slight is fixed tonight and re-checked before `until`; severe waits for
// the next night's review, where the change shows "back from last night". Into sol-dev takes them off
export const SENT_SLIGHT = "sent-back:slight";
export const SENT_SEVERE = "sent-back:severe";
export const SENT_BACK = [SENT_SLIGHT, SENT_SEVERE];
/** a label on a PR (any state), made in the repository when it is not there yet */
export const addLabel = (gh: (a: string[]) => Promise<string>, repo: string, n: number, label: string) =>
  gh(["api", "-X", "POST", `repos/${repo}/issues/${n}/labels`, "-f", `labels[]=${label}`]);
/** a label off a PR; one it does not wear is not an error */
export const dropLabel = (gh: (a: string[]) => Promise<string>, repo: string, n: number, label: string) =>
  gh(["api", "-X", "DELETE", `repos/${repo}/issues/${n}/labels/${encodeURIComponent(label)}`]).then(() => {}, () => {});

/** the marker a slight send back leaves in its comment (pure): the night, and the head it was sent back at, so the
 *  re-check reads only what changed since. Hidden in the comment's text, written by the reviewer's own login */
export const sentMark = (night: string, head: string) => `<!-- sol:sent-back slight night=${night} head=${head} -->`;
export const SENT_MARK = /<!-- sol:sent-back slight night=(\d{4}-\d{2}-\d{2}) head=([0-9a-f]{7,40}) -->/;

export const by = (login: string) => `— ${login} (review session)`;
/** where a change goes on the dev night's first button (#477): the project's own name, so sol-mif/sol-dev's button
 *  says "Into sol-dev". The name GitHub gives, once learned (learnName), else the repo's last part: a folder whose
 *  remote still names a moved repository (marcocyl04-ux/ecosystem) still says "Into sol-dev" */
const NAMES = new Map<string, string>();
export const intoName = (repo: string) => NAMES.get(String(repo ?? "").toLowerCase()) ?? (String(repo ?? "").split("/").pop()?.trim() || "main");
/** the repository's own name on GitHub, learned once a run for intoName; nothing changes when GitHub does not say */
export async function learnName(d: Pick<TonightDeps, "gh">, repo: string): Promise<void> {
  if (NAMES.has(repo.toLowerCase())) return;
  try {
    const n = (await d.gh(["api", `repos/${repo}`, "--jq", ".name"])).trim();
    if (/^[A-Za-z0-9_.-]{1,100}$/.test(n)) NAMES.set(repo.toLowerCase(), n);
  } catch { /* the repo's last part stands */ }
}
/** for tests */
export function forgetNames() { NAMES.clear(); }
export const intoWord = (repo: string) => `Into ${intoName(repo)}`;
/** what a dev press writes on the PR (pure). `branch`: why the branch stays, "" when it was deleted */
export function prComment(v: "fold" | "slight" | "severe", night: string, login: string, draft = false, more: { fix?: string; head?: string; repo?: string; branch?: string } = {}): string {
  const into = intoName(more.repo ?? "");
  const text = v === "fold" ? `**Into ${into}** in the dev review of ${night}: one merge commit, so one revert undoes it; ${more.branch ? `its branch stays (${more.branch})` : "its branch is deleted"}.`
    : v === "slight" ? `**Sent back** (slight) in the dev review of ${night}: a small fix tonight, then it goes into ${into}. Fix it, mark it ready again before the morning, and the reviewer's Sol re-checks it and takes it into ${into}.`
    : `**Sent back** (severe) in the dev review of ${night}: it waits for the next night${draft ? ", and is a draft again until it is handed in anew" : ""}.`;
  const fix = more.fix ? `\n\n**What to fix:** ${more.fix}` : "";
  const mark = v === "slight" && more.head ? `\n\n${sentMark(night, more.head)}` : "";
  return `${text}${fix}${mark}\n\n${by(login)}`;
}
/** what the reviewer wrote to fix (pure): one paragraph, a few hundred characters, no markers of ours */
export const fixText = (v: unknown) => oneLine(String(v ?? "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<!--|-->/g, " "), 600);
export function betaComment(v: "pass" | "hold", c: Pick<TonightItem, "release" | "night" | "changes">, login: string): string {
  const which = c.changes.map((x) => `#${x.number}`).join(", ") || "nothing";
  const text = v === "pass" ? `**Beta passed**: the dev release of ${c.release ?? c.night} goes to beta whole (${which}).`
    : `**Beta held**: the dev release of ${c.release ?? c.night} stays off beta (${which}).`;
  return `${text}\n\n${by(login)}`;
}

// ---- kept beside the transcript: the card of each review session, and which nights were opened ----

const DIR = join(STATE_DIR, "tonight");
const write = (file: string, v: unknown) => {
  // written whole or not at all (#11)
  try { mkdirSync(DIR, { recursive: true }); writeFileSync(file + ".tmp", JSON.stringify(v)); renameSync(file + ".tmp", file); } catch { /* it stays live */ }
};
const cards = new Map<string, TonightItem[]>();
export function cardsOf(id: string): TonightItem[] {
  let c = cards.get(id);
  if (c) return c;
  try { c = JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")) as TonightItem[]; if (!Array.isArray(c)) c = []; } catch { c = []; }
  // read from disk, nothing is being done: a press the engine stopped in the middle of is open again (GitHub says, at
  // the next press, what it did)
  for (const card of c) {
    for (const x of card.changes ?? []) if (x.state === "busy") delete x.state;
    if (card.verdict?.state === "busy") delete card.verdict.state;
  }
  cards.set(id, c);
  return c;
}
export function putCard(id: string, it: TonightItem, bus: (m: object) => void) {
  const c = cardsOf(id);
  const i = c.findIndex((x) => x.id === it.id);
  if (i >= 0) c[i] = it; else c.push(it);
  write(join(DIR, `${id}.json`), c);
  bus({ type: "work.item", sessionId: id, item: it });
}

// a card's key: made in this engine's memory, never written down, never in the transcript or the session's words. The
// face asks for it (team.tonight.key, answered to Sol's own window only) and a press must carry it, so the session's own
// agent, which reads the transcript and the disk, cannot press (#416 review)
const keys = new Map<string, string>();
/** the key of a session's card, made once per engine run; "" when the session has no card */
export function keyOf(id: string): string {
  if (!cardsOf(id).length) return "";
  let k = keys.get(id);
  if (!k) { k = randomBytes(16).toString("hex"); keys.set(id, k); }
  return k;
}

/** a thread's items with its review card in place (pure but for the store): right after the first thing said */
export function withTonight(id: string, items: Item[]): Item[] {
  // a card shows only to the night's reviewer and backup (#478): one made for anyone else (a review opened by hand
  // before #478) shows nothing
  const c = cardsOf(id).filter((x) => x.mine !== false);
  if (!c.length) return items;
  const out = items.filter((i) => i.kind !== "tonight");
  const at = out.findIndex((i) => i.kind === "me" && !i.parent);
  return at < 0 ? [...out, ...c] : [...out.slice(0, at + 1), ...c, ...out.slice(at + 1)];
}

// a night's review, once opened: done false while the session exists but its card is not yet beside it, so a retry
// puts the card on that same session instead of making a second
let opened: Record<string, { session: string; at: string; done?: false }> | null = null;
const openedFile = () => join(DIR, "opened.json");
function openedMap() {
  if (opened) return opened;
  try { opened = JSON.parse(readFileSync(openedFile(), "utf8")); if (!opened || typeof opened !== "object") opened = {}; } catch { opened = {}; }
  return opened!;
}
export const wasOpened = (key: string) => { const e = openedMap()[key]; return !!e && e.done !== false; };
export function markOpened(key: string, session: string, now = new Date(), done = true) {
  openedMap()[key] = { session, at: now.toISOString(), ...(done ? {} : { done: false as const }) }; write(openedFile(), openedMap());
}
export const halfOpened = (key: string) => { const e = openedMap()[key]; return e?.done === false && e.session ? e.session : ""; };
/** for tests: everything kept, gone */
export function forgetTonight() { cards.clear(); keys.clear(); looked.clear(); opened = null; rmSync(DIR, { recursive: true, force: true }); }

// ---- the run ----

export type TonightDeps = {
  me: () => string;                                            // my GitHub login
  present?: () => boolean;                                     // the person's window is on this engine (none: yes)
  folders: () => Promise<Record<string, string>>;              // the projects I have a folder for: repo -> folder
  gh: (args: string[]) => Promise<string>;                     // the GitHub CLI
  now: () => Date;
  /** a Work session in the folder, marked cowork, its first turn sent; its id (`id` when given: a re-check's, #421) */
  start: (a: { cwd: string; repo: string; title: string; text: string; id?: string }) => Promise<string>;
  bus: (m: object) => void;                                    // every Work face
  say?: (line: string) => void;
  ping?: (p: { to: string; line: string; issue: number; repo: string }) => void;   // the author hears a send back
};

const rhythms = new Map<string, { r: Rhythm | null; at: number }>();
const RHYTHM_TTL = 10 * 60_000;
// where the rhythm comes from first (#428): the project's settings in its record (project.ts sets this from wire.ts).
// It answers the record's rhythm, or undefined when the record has none of its own (or the repo is in no project
// here): then the committed `.sol/rhythm.json` is the starting value, read as before
let source: ((repo: string) => Promise<unknown | undefined>) | null = null;
export const setRhythmSource = (fn: typeof source) => { source = fn; rhythms.clear(); };
/** the project's rhythm: its record's (#428), else `.sol/rhythm.json` on its default branch; read at most every ten
 *  minutes (a change to the project's settings forgets it at once); null when it has none */
export async function rhythmOf(d: Pick<TonightDeps, "gh" | "now">, repo: string, fresh = false): Promise<Rhythm | null> {
  const had = rhythms.get(repo), t = d.now().getTime();
  if (!fresh && had && t - had.at < RHYTHM_TTL) return had.r;
  let r: Rhythm | null = null;
  let recordDown = false;
  try {
    const own = source ? await source(repo) : undefined;
    if (own !== undefined) {
      r = parseRhythm(JSON.stringify(own));
      // the committed file too (#478): the NucBox beta pass reads only it, so the beta backup counts only when the two
      // agree (agreeOn). Not read, or none: null, and a beta backup named in the record does not count
      if (r) {
        r.from = ".sol/project.json";
        r.file = (r.betaBackup ?? []).length ? await d.gh(["api", `repos/${repo}/contents/${RHYTHM_PATH}`, "-H", "Accept: application/vnd.github.raw"]).then(parseRhythm, () => null) : null;
      }
      rhythms.set(repo, { r, at: t }); return r;
    }
  } catch {
    // the record cannot be read now: what was known stays; with nothing known, the file below, never kept, so the
    // record's own rhythm is asked again on the next read rather than the file's held for ten minutes
    if (had) return had.r;
    recordDown = true;
  }
  try { r = parseRhythm(await d.gh(["api", `repos/${repo}/contents/${RHYTHM_PATH}`, "-H", "Accept: application/vnd.github.raw"])); if (r) r.from = RHYTHM_PATH; }
  catch (e) { if (had && !/404|not found/i.test(String((e as Error)?.message ?? e))) return had.r; }
  if (!recordDown) rhythms.set(repo, { r, at: t });
  return r;
}
export const forgetRhythms = () => rhythms.clear();

async function codeownersOf(d: Pick<TonightDeps, "gh">, repo: string): Promise<string> {
  try { return await d.gh(["api", `repos/${repo}/contents/.github/CODEOWNERS`, "-H", "Accept: application/vnd.github.raw"]); } catch { return ""; }
}

/** the repository's default branch, the one Into sol-dev lands on */
export async function defaultBranchOf(d: Pick<TonightDeps, "gh">, repo: string): Promise<string> {
  const b = (await d.gh(["api", `repos/${repo}`, "--jq", ".default_branch"])).trim();
  if (!/^[A-Za-z0-9._\/-]{1,200}$/.test(b)) throw new Error(`no default branch for ${repo}`);
  return b;
}

// ---- Into sol-dev (#477): one merge commit and the branch deleted; a conflict or a red check stops it first ----

export type HeadView = { headRefName?: string; isCrossRepository?: boolean; mergeable?: string; author?: { login?: string }; statusCheckRollup?: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[] };
/** what `gh pr view` is asked for besides the state, before Into sol-dev */
export const INTO_FIELDS = "headRefName,isCrossRepository,mergeable,statusCheckRollup,author";
const RED = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"];
// STALE: a result GitHub no longer counts for this head (a re-run was asked for), so it is waited on like one running
const RUNNING = ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "STALE"];

/** what stops Into sol-dev (pure): a conflict with the default branch, GitHub not knowing yet whether it merges
 *  cleanly (UNKNOWN), a red check, or (`waitRunning`) checks still running or none passed. No checks at all, or only
 *  SKIPPED / NEUTRAL ones, is no checks yet: a PR whose CI has not started (a fork waiting for Actions approval) never
 *  goes in with no CI on a press. "" when nothing
 *  stops it. Checks are read as the hand-in reads them (handin.ts checksOf) */
export function stopOf(v: HeadView, waitRunning = true): string {
  const m = String(v.mergeable ?? "").toUpperCase();
  if (m === "CONFLICTING") return "it conflicts with the default branch";
  if (m === "UNKNOWN") return "GitHub has not worked out yet whether it merges cleanly; press again in a moment";
  const xs = Array.isArray(v.statusCheckRollup) ? v.statusCheckRollup : [];
  const word = (x: (typeof xs)[number]) => String(x?.conclusion || x?.state || "").toUpperCase();
  const red = xs.filter((x) => RED.includes(word(x)));
  if (red.length) return `${red.length === 1 ? "a check is" : `${red.length} checks are`} red (${red.map((x) => oneLine(x.name || x.context || "?", 60)).slice(0, 3).join(", ")})`;
  if (waitRunning && xs.some((x) => (x?.status && String(x.status).toUpperCase() !== "COMPLETED") || RUNNING.includes(word(x)))) return "its checks are still running; press again when they are done";
  // at least one check passed, as the hand-in's checksOf: none at all, or only SKIPPED / NEUTRAL ones, is no checks yet
  if (waitRunning && !xs.some((x) => word(x) === "SUCCESS")) return "it has no checks yet; press again when they have run";
  return "";
}

const BRANCH = /^[A-Za-z0-9._\/-]{1,200}$/;
const NEVER_DELETED = ["main", "master", "dev", "beta", "stable", "live"];
const EVERYONES = /\/(plan|mine|shots)$/;   // each person's long-lived branches (claims.ts SHARED_BRANCHES)
/** whether `b` is the PR author's own `<prefix>/<name>` branch: the prefix is their login, or the first name whose
 *  habits page (docs/people/<first>.md on the default branch) says `login: <author>`, as sol/take names branches */
async function authorsOwn(gh: (a: string[]) => Promise<string>, repo: string, b: string, author: string): Promise<boolean> {
  const prefix = b.split("/")[0];
  if (!author || !b.includes("/") || !/^[A-Za-z0-9._-]{1,60}$/.test(prefix)) return false;
  if (prefix.toLowerCase() === author.toLowerCase()) return true;
  const page = await gh(["api", `repos/${repo}/contents/docs/people/${encodeURIComponent(prefix)}.md`, "-H", "Accept: application/vnd.github.raw"]).catch(() => "");
  return page.split("\n").some((l) => l.trim().toLowerCase() === `login: ${author.toLowerCase()}`);
}
/** the change's branch deleted, after Into sol-dev: "" when it is gone (GitHub may have deleted it already), else why
 *  it stays. Only the author's own `<prefix>/<name>` branch is ever deleted (never a fork's, the default branch, one
 *  with no prefix such as shots or gh-pages, release/..., or a person's plan/mine/shots), and only when no open PR
 *  has it as its head or its base: deleting a base by the API closes the PRs stacked on it. Only "Reference does not
 *  exist" or a 404 is gone: any other refusal (a ruleset, a protected branch) leaves it, said. sol-dev's own
 *  "delete branch on merge" setting deletes a merged head whatever this says (a person's plan or mine too): that is a
 *  repository setting, Marco's */
export async function dropBranch(gh: (a: string[]) => Promise<string>, repo: string, v: HeadView, base: string): Promise<string> {
  const b = String(v.headRefName ?? "");
  if (v.isCrossRepository) return "it is on a fork";
  if (!b || !BRANCH.test(b) || b.split("/").some((x) => !x || x === "." || x === "..")) return "GitHub did not say which branch it is";
  if (b === base || NEVER_DELETED.includes(b.toLowerCase()) || EVERYONES.test(b.toLowerCase())) return `${b} is a branch Sol never deletes`;
  const author = String(v.author?.login ?? "");
  if (!(await authorsOwn(gh, repo, b, author))) return `${b} is not ${author || "the author"}'s own branch, so Sol leaves it`;
  // another open PR on it, as its head (one sent elsewhere) or stacked on it: it stays. GitHub not answering keeps it too
  for (const side of ["--head", "--base"]) {
    let others: { number?: number }[];
    try { others = JSON.parse(await gh(["pr", "list", "--repo", repo, "--state", "open", side, b, "--json", "number", "--limit", "20"]) || "[]"); }
    catch (e) { return `GitHub did not say whether another PR uses it: ${oneLine(String((e as Error)?.message ?? e).split("\n")[0], 100)}`; }
    if (!Array.isArray(others)) return "GitHub did not say whether another PR uses it";
    if (others.length) return `${others.map((x) => `#${x.number}`).slice(0, 3).join(", ")} ${others.length === 1 ? "is" : "are"} open ${side === "--head" ? "from" : "on"} it`;
  }
  try { await gh(["api", "-X", "DELETE", `repos/${repo}/git/refs/heads/${b.split("/").map(encodeURIComponent).join("/")}`]); return ""; }
  catch (e) {
    const m = String((e as Error)?.message ?? e);
    return /reference does not exist|\b404\b|not found/i.test(m) ? "" : `GitHub would not delete it: ${oneLine(m.split("\n")[0], 120)}`;
  }
}

/** Into sol-dev: the change at the head that was shown, as one merge commit (never squash or rebase, so one revert
 *  undoes it), then its branch deleted. Stopped before anything is done when stopOf says so: the change stays on its
 *  branch. Answers why the branch stays, "" when it was deleted */
export async function intoBase(gh: (a: string[]) => Promise<string>, a: { repo: string; number: number; sha: string; base: string; view: HeadView; waitRunning?: boolean }): Promise<string> {
  const stop = stopOf(a.view, a.waitRunning ?? true);
  if (stop) throw new Error(`#${a.number} stays on its branch: ${stop}`);
  await gh(["pr", "merge", String(a.number), "--repo", a.repo, "--merge", "--match-head-commit", a.sha]);
  return dropBranch(gh, a.repo, a.view, a.base);
}

/** the changes a review shows: handed in today (dev), or yesterday's dev release (beta), both on the default branch */
export async function changesFor(d: Pick<TonightDeps, "gh">, repo: string, role: Role, r: Rhythm, night: string): Promise<{ changes: Change[]; release?: string; base: string; late?: number }> {
  const own = await codeownersOf(d, repo);
  const base = await defaultBranchOf(d, repo);
  if (role === "dev") {
    const raw = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "open", "--base", base, "--limit", "100", "--json", PR_FIELDS]) || "[]") as RawPr[];
    // handed in means ready by the review hour (#420): each change says whether it came in during the hand-in, and one
    // marked ready after the review hour waits for the next night. GitHub not saying leaves a change as it is
    const changes: Change[] = [];
    let late = 0;
    for (const c of handedIn(raw, own, base)) {
      const p = raw.find((x) => x.number === c.number);
      const when = handInOf(readyAt(await readyEvents(d, repo, c.number), p?.createdAt ?? ""), r, night);
      if (when === "late") { late++; continue; }
      changes.push(when ? { ...c, handIn: when } : c);
    }
    return { changes, base, ...(late ? { late } : {}) };
  }
  const w = betaWindow(r, night);
  const since = w.from.toISOString().replace(/\.\d+Z$/, "Z");
  const raw = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "merged", "--limit", "100", "--search", `merged:>=${since}`, "--json", `${PR_FIELDS},mergedAt`]) || "[]") as RawPr[];
  return { changes: released(raw, w, own, base), release: w.release, base };
}

/** a PR's "ready for review" and "convert to draft" moments, oldest first; none when GitHub does not answer */
async function readyEvents(d: Pick<TonightDeps, "gh">, repo: string, n: number): Promise<{ event: string; at: string }[]> {
  try {
    const out = await d.gh(["api", `repos/${repo}/issues/${n}/timeline`, "--paginate", "--jq", '.[] | select(.event == "ready_for_review" or .event == "convert_to_draft") | .event + " " + .created_at']);
    return out.split("\n").map((l) => l.trim().split(" ")).filter((x) => x.length === 2 && x[1]).map(([event, at]) => ({ event, at }));
  } catch { return []; }
}

/** one review session opened: the card read, the session started in the folder, the card put beside it. Null when
 *  there is nothing to review (nothing handed in, an empty release): no session for that */
export async function openReview(d: TonightDeps, a: { repo: string; folder: string; role: Role; night: string; rhythm: Rhythm; force?: boolean; key?: string; backup?: boolean }): Promise<{ session?: string; empty?: true }> {
  const me = d.me();
  // the backup's card (#478) holds what the reviewer has not pressed: on the dev night the changes still handed in (a
  // change taken Into sol-dev or sent back is off GitHub's ready list), on the beta night nothing once Into beta or Hold was pressed
  if (a.backup && a.role === "beta" && !a.force && await decidedOnDigest(d, a.repo, a.night, { reviewers: a.rhythm.beta, backups: backupsOf(a.rhythm, "beta"), from: handoverOf(a.rhythm, a.night).getTime() })) return { empty: true };
  const { changes, release, base, late } = await changesFor(d, a.repo, a.role, a.rhythm, a.night);
  if (!changes.length && !a.force) return { empty: true };
  const card = cardOf({ role: a.role, repo: a.repo, base, night: a.night, release, reviewers: a.rhythm[a.role], me, changes, ...(a.role === "dev" ? { handInAt: a.rhythm.handIn, late } : {}),
    backups: backupsOf(a.rhythm, a.role), backup: a.backup, handoverAt: handoverOf(a.rhythm, a.night).toISOString(), untilAt: endOf(a.rhythm, a.night).toISOString(),
    ...(a.rhythm.from ? { from: a.rhythm.from } : {}) });
  await learnName(d, a.repo);
  if (intoName(a.repo) !== (a.repo.split("/").pop() || "main")) card.into = intoName(a.repo);
  // a try that failed after its session was made: that session gets the card, no second one
  let session = a.key ? halfOpened(a.key) : "";
  if (!session) {
    session = await d.start({ cwd: a.folder, repo: a.repo, title: titleOf(a.role, a.night), text: firstWords(card, me) });
    if (a.key) markOpened(a.key, session, d.now(), false);
  }
  putCard(session, card, d.bus);
  return { session };
}

/** the projects I have a folder for and their rhythms */
export async function projects(d: Pick<TonightDeps, "folders" | "gh" | "now">): Promise<{ repo: string; folder: string; rhythm: Rhythm }[]> {
  const out: { repo: string; folder: string; rhythm: Rhythm }[] = [];
  for (const [repo, folder] of Object.entries(await d.folders())) {
    if (!REPO.test(repo) || !folder) continue;
    const rhythm = await rhythmOf(d, repo);
    if (rhythm) out.push({ repo, folder, rhythm });
  }
  return out;
}

const trying = new Map<string, number>();   // key -> when it last failed: a failed open is tried again after ten minutes
let busy = false;
/** once a minute: every review due for me opens, once a night a project and role */
export async function tick(d: TonightDeps): Promise<string[]> {
  if (busy) return [];
  busy = true;
  const done: string[] = [];
  try {
    const me = d.me();
    if (!me || (d.present && !d.present())) return done;
    for (const p of await projects(d)) {
      for (const due of dueReviews({ repo: p.repo, rhythm: p.rhythm, me, now: d.now(), opened: wasOpened })) {
        const failed = trying.get(due.key);
        if (failed && d.now().getTime() - failed < 10 * 60_000) continue;
        try {
          const r = await openReview(d, { ...p, role: due.role, night: due.night, key: due.key, backup: due.backup });
          markOpened(due.key, r.session ?? "", d.now());
          if (r.session) looked.set(r.session, d.now().getTime());
          trying.delete(due.key);
          d.say?.(r.session ? `tonight: the ${due.role} review of ${p.repo} opened${due.backup ? " for its backup" : ""} (${r.session})` : `tonight: nothing for the ${due.role} review of ${p.repo}`);
          if (r.session) done.push(r.session);
        } catch (e) {
          trying.set(due.key, d.now().getTime());
          d.say?.(`tonight: the ${due.role} review of ${p.repo} did not open: ${String((e as Error)?.message ?? e).split("\n")[0]}`);
        }
      }
    }
    await refreshCards(d).catch(() => 0);
  } finally { busy = false; }
  return done;
}

/** a review opened now, by the person (POST /tonight): the first project whose rhythm has this role (or `repo`),
 *  tonight's night or today's, whether or not one was opened already. Only for its reviewer, or its backup from the
 *  handover on (#478): anyone else is refused, and no card is made */
export async function openNow(d: TonightDeps, a: { role: Role; repo?: string }): Promise<{ session?: string; error?: string }> {
  const all = await projects(d);
  const me = d.me(), now = d.now();
  const nightIn = (p: { rhythm: Rhythm }) => nightOf(p.rhythm, now) ?? clockIn(now, p.rhythm.zone).day;
  const named = a.repo ? all.filter((x) => x.repo.toLowerCase() === a.repo!.toLowerCase()) : all.filter((x) => x.rhythm[a.role].length);
  const p = named.find((x) => seatOf(x.rhythm, a.role, me, nightIn(x), now)) ?? named[0];
  if (!p) return { error: a.repo ? `no folder here holds ${a.repo} with a ${RHYTHM_PATH}` : `no project here has a rhythm with a ${a.role} reviewer (${RHYTHM_PATH})` };
  const night = nightIn(p);
  const seat = seatOf(p.rhythm, a.role, me, night, now);
  const who = { reviewers: p.rhythm[a.role], backups: backupsOf(p.rhythm, a.role) };
  const backs = !!me && (p.rhythm[backupKey(a.role)] ?? []).some((x) => x.toLowerCase() === me.toLowerCase());
  if (!seat && backs && backupOff(p.rhythm, a.role)) return { error: `the ${a.role} review of ${p.repo} does not open for its backup: ${backupOff(p.rhythm, a.role)}` };
  if (!seat && backs) return { error: `the ${a.role} review of ${p.repo} for the night of ${night} has ended (${p.rhythm.until}); as its backup you press only until then (${rhythmWords(p.rhythm, a.role)})` };
  if (!seat) return { error: `the ${a.role} review of ${p.repo} is shown only to ${pressersOf(who)} (${rhythmWords(p.rhythm, a.role)})` };
  if (seat === "early") return { error: `the ${a.role} review of ${p.repo} is ${who.reviewers.join(" or ")}'s until ${hourWords(p.rhythm.handover || HANDOVER)}; it opens for you then if it is still waiting (${rhythmWords(p.rhythm, a.role)})` };
  const r = await openReview(d, { ...p, role: a.role, night, force: true, backup: seat === "backup" });
  return { session: r.session };
}

/** a press on the card: checked (from Sol's own window with the card's key, the reviewer's own, the right button for
 *  the review, not pressed before), then GitHub asked what is true now (a change merged or closed elsewhere, a release
 *  already decided: the card says so and nothing is written twice), then done on GitHub, then said on the card. Errors
 *  stay on the card, and the button can be pressed again */
export async function press(d: TonightDeps, a: { sessionId: string; verdict: Verdict; number?: number; key?: string; window?: boolean; fix?: string }): Promise<{ ok?: true; already?: true; error?: string }> {
  if (!a.window) return { error: "the buttons are pressed in Sol's own window" };
  const card = cardsOf(a.sessionId).find((c) => c.kind === "tonight");
  if (!card) return { error: "this session has no review card" };
  if (!a.key || a.key !== keys.get(a.sessionId)) return { error: "this card was opened again since; press once more" };
  const me = d.me();
  // the night's reviewer, or its backup from the handover on (#478): checked here, whatever the window shows
  const isIn = (l: string[] | undefined) => !!me && (l ?? []).some((x) => x.toLowerCase() === me.toLowerCase());
  const said = card.from ? ` (as ${card.from} said when this card opened)` : "";
  if (!isIn(card.reviewers) && !isIn(card.backups)) return { error: `only ${pressersOf(card)} presses these${said}` };
  if (!isIn(card.reviewers)) {
    // the backup: from the handover until the night ends, never on a card that does not say both
    const t = d.now().getTime();
    if (!card.handoverAt || t < Date.parse(card.handoverAt)) return { error: `it is ${card.reviewers.join(" or ")}'s until the handover hour${card.handoverAt ? ` (${card.handoverAt})` : ""}${said}` };
    if (!card.untilAt || t >= Date.parse(card.untilAt)) return { error: `the night of ${card.night} has ended${card.untilAt ? ` (${card.untilAt})` : ""}: as its backup you press only until then${said}` };
  }
  const put = () => putCard(a.sessionId, card, d.bus);
  const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
  const at = () => d.now().toISOString();
  if (card.role === "dev") {
    const named = card.into || card.repo, into = intoWord(named), lower = `into ${intoName(named)}`;
    if (a.verdict !== "fold" && a.verdict !== "slight" && a.verdict !== "severe") return { error: `the dev night has ${into} or Send back, one change at a time` };
    const c = card.changes.find((x) => x.number === a.number);
    if (!c) return { error: "that change is not on this card" };
    if (c.state === "busy") return { error: `#${c.number} is being done` };
    if (c.state) return { error: `#${c.number} ${c.state === "folded" ? `went ${lower}` : c.state === "closed" ? "was closed" : "was sent back"} already` };
    if (a.verdict === "fold" && !c.sha) return { error: `#${c.number} has no known head on this card, so it cannot go ${lower} from here` };
    // a slight send back says what to fix: the author fixes that, and the re-check holds the fix to it (#421)
    const fix = fixText(a.fix);
    if (a.verdict === "slight" && !fix) return { error: `say what to fix in #${c.number}: the re-check before the morning holds the fix to it` };
    c.state = "busy"; delete c.error; put();
    const comment = (body: string) => d.gh(["pr", "comment", String(c.number), "--repo", card.repo, "--body", body]);
    try {
      // what is true on GitHub now: another Sol's review, or a person on GitHub, may have done it already
      const now = JSON.parse(await d.gh(["pr", "view", String(c.number), "--repo", card.repo, "--json", `state,baseRefName,headRefOid,isDraft,labels,${INTO_FIELDS}`]) || "{}") as HeadView & PrNow;
      const was = doneOnGitHub(now, c);
      if (was) {
        c.state = was; c.at = at(); put();
        return { ok: true, already: true };
      }
      if (a.verdict === "fold") {
        if (now.baseRefName !== card.base) throw new Error(`#${c.number} now goes into ${now.baseRefName ?? "another branch"}, not ${card.base}; nothing was done`);
        if (now.headRefOid !== c.sha) throw new Error(`#${c.number} changed since this summary; nothing was done`);
        // the change as summarised, never one pushed since (GitHub refuses too when the head moved); a conflict or a red
        // check stops it here and it stays on its branch
        const kept = await intoBase(d.gh, { repo: card.repo, number: c.number, sha: c.sha, base: card.base, view: now });
        c.state = "folded"; c.at = at();
        for (const l of SENT_BACK) await dropLabel(d.gh, card.repo, c.number, l);   // back from an earlier night, no more
        // in is in: a comment that does not go is tried once more, then said on the card
        const words = prComment("fold", card.night, me, false, { repo: named, branch: kept });
        try { await comment(words); }
        catch { try { await comment(words); } catch (e) { c.error = `${lower}; the comment on GitHub did not go: ${firstLine(e)}`; } }
        if (kept && !c.error) c.error = `${lower}; its branch stays: ${kept}`;
        put();
        return { ok: true };
      }
      // both make it a draft again (#421): the author marks it ready when it is fixed. A slight one must be a draft,
      // since that ready is what the re-check waits for; a severe one is told on the PR when it could not be
      const draft = now.isDraft === true || await d.gh(["pr", "ready", String(c.number), "--repo", card.repo, "--undo"]).then(() => true, () => false);
      if (a.verdict === "slight" && !draft) throw new Error(`#${c.number} could not be made a draft again, so it was not sent back; try again or send it back severe`);
      // the comment before the label: the re-check (sentback.ts) reads the label first, and a label with no comment
      // of the reviewer's yet must never look like a send back that forgot its words
      const words = prComment(a.verdict, card.night, me, draft, { fix, head: now.headRefOid || c.sha, repo: named });
      await comment(words).catch(() => comment(words));
      await addLabel(d.gh, card.repo, c.number, a.verdict === "slight" ? SENT_SLIGHT : SENT_SEVERE);
      await dropLabel(d.gh, card.repo, c.number, a.verdict === "slight" ? SENT_SEVERE : SENT_SLIGHT);
      if (c.author && c.author !== me) d.ping?.({ to: c.author, line: `#${c.number} was sent back (${a.verdict}) in tonight's dev review`, issue: c.number, repo: card.repo });
      c.state = a.verdict; c.at = at();
      put();
      return { ok: true };
    } catch (e) {
      if (c.state === "busy") delete c.state;
      c.error = firstLine(e); put();
      return { error: c.error };
    }
  }
  if (a.verdict !== "pass" && a.verdict !== "hold") return { error: "the beta night has Into beta or Hold, for the whole release, nothing else" };
  if (card.verdict?.state === "pass" || card.verdict?.state === "hold") return { error: `the release ${card.verdict.state === "pass" ? "went into beta" : "was held"} already` };
  if (card.verdict?.state === "busy") return { error: "it is being done" };
  card.verdict = { state: "busy" }; put();
  try {
    const found = JSON.parse(await d.gh(["issue", "list", "--repo", card.repo, "--state", "open", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title"]) || "[]") as { number: number; title: string }[];
    const n = found.find((i) => i.title.trim() === DIGEST_TITLE)?.number;
    if (!n) throw new Error(`no open issue "${DIGEST_TITLE}" in ${card.repo} to write it on`);
    // decided already, by another Sol's review: the card says so and nothing is written twice
    const told = JSON.parse(await d.gh(["issue", "view", String(n), "--repo", card.repo, "--json", "comments"]) || "{}") as { comments?: DigestComment[] };
    const was = decidedBefore(told.comments ?? [], card.release ?? card.night, decidersOf(card));
    if (was) { card.verdict = { state: was, at: at() }; put(); return { ok: true, already: true }; }
    await d.gh(["issue", "comment", String(n), "--repo", card.repo, "--body", betaComment(a.verdict, card, me)]);
    card.verdict = { state: a.verdict, at: at() }; put();
    return { ok: true };
  } catch (e) {
    const error = firstLine(e);
    card.verdict = { error }; put();
    return { error };
  }
}

/** a comment on the digest as GitHub lists it (`gh issue view --json comments`) */
export type DigestComment = { body?: string; author?: { login?: string }; createdAt?: string; includesCreatedEdit?: boolean; lastEditedAt?: string | null };
/** who may decide a night's release (#478): its reviewers at any hour, its backups from `from` (ms) on */
export type Deciders = { reviewers: string[]; backups?: string[]; from?: number };
export const decidersOf = (c: Pick<TonightItem, "reviewers" | "backups" | "handoverAt">): Deciders =>
  ({ reviewers: c.reviewers, backups: c.backups ?? [], from: c.handoverAt ? Date.parse(c.handoverAt) : Infinity });
/** an edited comment signs nothing (#478): anyone with write access can edit another's comment, and GitHub's author
 *  and time stay the first writer's (pure) */
export const edited = (c: Pick<DigestComment, "includesCreatedEdit" | "lastEditedAt">) => c.includesCreatedEdit === true || !!c.lastEditedAt;
/** a release's beta verdict already written on the digest (pure): the last "Beta passed" or "Beta held" of that release.
 *  With `by` (#478), only one GitHub says a reviewer wrote counts, or a backup at or after the handover; never an
 *  edited one. The words alone, by anyone else or a backup too early, neither close a card nor keep the backup's from
 *  opening, as the NucBox beta pass (beta.ts verdictsOf) counts them */
export function decidedBefore(comments: DigestComment[], release: string, by?: Deciders): "pass" | "hold" | "" {
  let out: "pass" | "hold" | "" = "";
  const low = (l: string[] = []) => new Set(l.map((x) => x.toLowerCase()));
  const rev = low(by?.reviewers), back = low(by?.backups);
  for (const c of comments) {
    if (edited(c)) continue;
    if (by) {
      const who = String(c.author?.login ?? "").toLowerCase();
      const at = Date.parse(String(c.createdAt ?? ""));
      if (!rev.has(who) && !(back.has(who) && at >= (by.from ?? Infinity))) continue;
    }
    const m = /^\*\*Beta (passed|held)\*\*: the dev release of (\S+?) /.exec(String(c.body ?? ""));
    if (m && m[2] === release) out = m[1] === "passed" ? "pass" : "hold";
  }
  return out;
}

// ---- a press by either of the two closes it for both (#478) ----

type PrNow = { state?: string; baseRefName?: string; headRefOid?: string; isDraft?: boolean; labels?: { name?: string }[] };
/** what was done to a change on the card since, as GitHub says it (pure): folded or closed; sent back (a draft again
 *  wearing a send back's label, by the other one of the two); "" when it still waits. A change sent back on an
 *  earlier night already wears the label, so for it only folded or closed counts */
export function doneOnGitHub(now: PrNow, c: Pick<Change, "back">): "folded" | "closed" | "slight" | "severe" | "" {
  if (now.state === "MERGED") return "folded";
  if (now.state === "CLOSED") return "closed";
  if (now.isDraft !== true || c.back) return "";
  const labels = (now.labels ?? []).map((l) => String(l.name ?? "").toLowerCase());
  return labels.includes(SENT_SEVERE) ? "severe" : labels.includes(SENT_SLIGHT) ? "slight" : "";
}

/** the beta verdict of a night's release already on the digest, by either of the two: "" when none (or GitHub does not
 *  say: then the card opens, and a press asks again) */
async function decidedOnDigest(d: Pick<TonightDeps, "gh">, repo: string, release: string, by: Deciders): Promise<"pass" | "hold" | ""> {
  try {
    const found = JSON.parse(await d.gh(["issue", "list", "--repo", repo, "--state", "open", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title"]) || "[]") as { number: number; title: string }[];
    const n = found.find((i) => i.title.trim() === DIGEST_TITLE)?.number;
    if (!n) return "";
    const said = JSON.parse(await d.gh(["issue", "view", String(n), "--repo", repo, "--json", "comments"]) || "{}") as { comments?: DigestComment[] };
    return decidedBefore(said.comments ?? [], release, by);
  } catch { return ""; }
}

const looked = new Map<string, number>();   // a session's card -> when GitHub was last asked about it
const LOOK_EVERY = 5 * 60_000, NIGHT_LONG = 14 * 3_600_000;
/** the cards this Sol opened tonight, looked at again every five minutes from the minute tick once the night has a
 *  backup and its handover has come: what the other one of the two pressed meanwhile shows on this card too, so nobody
 *  reads a change already decided */
export async function refreshCards(d: Pick<TonightDeps, "gh" | "now" | "bus">): Promise<number> {
  const t = d.now().getTime();
  let n = 0;
  for (const e of Object.values(openedMap())) {
    if (!e.session || e.done === false || t - Date.parse(e.at) > NIGHT_LONG || t - (looked.get(e.session) ?? 0) < LOOK_EVERY) continue;
    looked.set(e.session, t);
    const card = cardsOf(e.session).find((c) => c.kind === "tonight");
    // before the handover only the reviewer presses, so there is nothing of the other's to see
    if (!card?.backups?.length || !card.handoverAt || t < Date.parse(card.handoverAt)) continue;
    let changed = false;
    if (card.role === "dev") {
      for (const c of card.changes) {
        if (c.state) continue;
        try {
          const was = doneOnGitHub(JSON.parse(await d.gh(["pr", "view", String(c.number), "--repo", card.repo, "--json", "state,isDraft,labels"]) || "{}") as PrNow, c);
          if (was) { c.state = was; c.at = new Date(t).toISOString(); changed = true; }
        } catch { /* asked again in five minutes */ }
      }
    } else if (!card.verdict?.state) {
      const was = await decidedOnDigest(d, card.repo, card.release ?? card.night, decidersOf(card));
      if (was) { card.verdict = { state: was, at: new Date(t).toISOString() }; changed = true; }
    }
    if (changed) { putCard(e.session, card, d.bus); n++; }
  }
  return n;
}
