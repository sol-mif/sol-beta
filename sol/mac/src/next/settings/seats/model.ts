// Seats and sign-ins, the rules (round 6 · M2, #1615; the mockup's merge/seats.js, ported as it is): the panel's people
// (missing/seats.html's, plus P1 and Sam), what each seat and account stands at now, what is coming up within a week
// (each one a Diary line ahead of time), and the AI a lapsed sign-in blocks (the first ask of Needs you). Pure: the
// state and the AIs on the canvas are passed in. Live, the person is built from home.connections (cv/wire/seats.ts).
// Signed: marcocyl04-ux's agent, slice 6b (#1615).

export type Seat = { id: string; n: string; plan: string; acct: string; st: string; who: string[]; use?: number; useW?: string; own?: boolean; idle?: string; ends?: string; quiet?: string };
export type Blocks = { ai: string; words: string; small: string; btn: string };
export type Acct = { id: string; n: string; sub: string; st: string; by: string; may: string[]; not: string; since?: string; ends?: string; why?: string; way?: string; wayBtn?: string; blocks?: Blocks };
export type Person = { seats: Seat[]; accts: Acct[] };
/** the state pressed on this canvas (a load starts clean): a seat's or account's state, and the snoozed week-ahead lines */
export type Book = { seat: Record<string, string>; acct: Record<string, string>; snooze: Record<string, 1> };
/** round 7's canvas may say a sign-in lapsed (D.lapsed); kept so the rule reads as the mockup's */
export type Lapsed = Record<string, { since: string; by?: string }> | undefined;
export type Soon = { id: string; kind: "seat" | "acct"; g?: "wait" | "done"; t: string; w: string; btn?: string };
export type Blocked = Blocks & { id: string; type: "seat"; a: Acct; target: string };

export const PEOPLE: Record<string, Person> = {
  Dev: { seats: [{ id: "cc", n: "Claude Code", plan: "Max plan", acct: "dev@hollow.dev", st: "use", who: ["Ada", "Kai", "Lu", "Mo", "Oz", "Pia"], use: 62, useW: "62% of this week’s limit · resets Monday" },
    { id: "cx", n: "Codex", plan: "Plus plan", acct: "dev@hollow.dev", st: "ends", ends: "Friday 21 November", who: ["Rex", "Ned"], use: 18, useW: "18% of this week’s limit" },
    { id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "in", who: [], own: true, idle: "For a first try, or when a plan runs out" }],
  accts: [{ id: "gh", n: "GitHub", sub: "hollow-dev", st: "on", by: "Ada, Kai, Rex and 5 more", may: ["read your repos", "open pull requests"], not: "merge or delete" },
    { id: "aws", n: "Your AWS sign-in", sub: "the hollow account", st: "lapsed", since: "this morning, 05:12", by: "Mo", may: ["read this month’s spend"], not: "change anything",
      blocks: { ai: "Mo", words: "Mo can’t watch tonight’s cloud spend: your AWS sign-in ended this morning.", small: "infra · Mo · every evening 20:00", btn: "Sign in once" } },
    { id: "goo", n: "Your Google sign-in", sub: "dev@hollow.dev", st: "on", by: "the Diary, Mo", may: ["read calendar", "read mail titles"], not: "send or delete" }] },
  Jayden: { seats: [{ id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "use", who: ["Bo"], use: 95, useW: "38 of 40 free answers today · 40 more at midnight", own: true },
    { id: "cc", n: "Claude Code", plan: "your free Claude account", acct: "", st: "none", who: [] },
    { id: "cx", n: "Codex", plan: "", acct: "", st: "none", who: [] }],
  accts: [{ id: "school", n: "Your school Google sign-in", sub: "jayden.r@lincoln-hs.org", st: "blocked", by: "Bo", may: ["read class emails"], not: "send or delete", way: "Mail on this Mac has a copy of your school mail.", wayBtn: "Use Mail’s copy" },
    { id: "gh", n: "GitHub", sub: "jaydenr", st: "on", by: "Bo", may: ["read the CS 101 repo", "push to your branch"], not: "merge or delete" }] },
  Denise: { seats: [{ id: "cl", n: "Claude", plan: "Pro plan", acct: "denise.okafor@me.com", st: "use", who: ["June"], use: 12, useW: "12% of this week’s limit" },
    { id: "cx", n: "Codex", plan: "", acct: "", st: "none", who: [], quiet: "Not needed for what you do. Nothing to set up." },
    { id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "in", who: [], own: true, idle: "For when your plan runs out" }],
  accts: [{ id: "goo", n: "Your Google sign-in", sub: "denise.okafor@googlemail.com", st: "lapsed", since: "yesterday", by: "June", may: ["read your calendar", "add events"], not: "delete events",
      blocks: { ai: "June", words: "June couldn’t put this morning’s school email in your calendar: your Google sign-in ended yesterday.", small: "kids · June · every morning 7:00", btn: "Sign in once" } },
    { id: "mail", n: "Mail on this Mac", sub: "2 accounts", st: "on", by: "June", may: ["read names, dates and titles"], not: "send or delete" },
    { id: "bank", n: "Your bank", sub: "found on this Mac", st: "never", by: "", may: [], not: "" }] },
  "Min-ji": { seats: [{ id: "cc", n: "Claude Code", plan: "Team plan · Vice studio", acct: "minji@vicestudio.kr", st: "use", who: ["Sy"], use: 41, useW: "41% of this week’s limit" },
    { id: "cx", n: "Codex", plan: "Plus plan", acct: "minji@vicestudio.kr", st: "in", who: [], idle: "Not used in 3 weeks" },
    { id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "in", who: [], own: true, idle: "For when a plan runs out" }],
  accts: [{ id: "drive", n: "The client’s Google Drive", sub: "Bloom workspace", st: "ends", ends: "Monday 24 November", why: "Bloom’s workspace asks every 30 days", by: "Sy", may: ["read the Bloom folder"], not: "share or delete" },
    { id: "slack", n: "Bloom’s Slack", sub: "#site channel", st: "on", by: "Sy", may: ["read #site"], not: "post" },
    { id: "figma", n: "Figma", sub: "", st: "off", by: "", may: ["open files you share", "export frames"], not: "edit or delete" }] },
  P1: { seats: [{ id: "cc", n: "Claude Code", plan: "Pro plan · university licence", acct: "p1@uni.edu", st: "use", who: ["four of your AIs"], use: 48, useW: "48% of this week’s limit" },
    { id: "cx", n: "Codex", plan: "Plus plan", acct: "p1@uni.edu", st: "use", who: ["three of your AIs"], use: 30, useW: "30% of this week’s limit" },
    { id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "use", who: ["the paper’s reader"], use: 20, useW: "8 of 40 free answers today", own: true }],
  accts: [{ id: "uni", n: "Your university sign-in", sub: "p1@uni.edu", st: "on", by: "the paper’s reader", may: ["read the library", "read your course pages"], not: "submit anything" },
    { id: "gh", n: "GitHub", sub: "thesis group, private", st: "on", by: "your AIs", may: ["read the thesis repo", "open pull requests"], not: "merge or delete" }] },
  Sam: { seats: [{ id: "cc", n: "Claude Code", plan: "Pro plan", acct: "sam@murmur.app", st: "in", who: [] },
    { id: "cx", n: "Codex", plan: "", acct: "", st: "none", who: [] },
    { id: "own", n: "Sol’s own", plan: "Free", acct: "", st: "in", who: [], own: true, idle: "Free, always here: for a first try, or when a plan runs out" }],
  accts: [{ id: "goo", n: "Your Google sign-in", sub: "sam@murmur.app", st: "on", by: "Your AI", may: ["read calendar"], not: "add or delete events" }] },
};

export const freshBook = (): Book => ({ seat: {}, acct: {}, snooze: {} });

/** the reads of one canvas: its pressed state and what it says lapsed */
export type Ctx = { b: Book; lapsed?: Lapsed };
export const seatSt = (c: Ctx, x: Seat): string => c.b.seat[x.id] ?? x.st;
export const acctSt = (c: Ctx, a: Acct): string => c.b.acct[a.id] ?? (c.lapsed && c.lapsed[a.id] ? "lapsed" : a.st);
export const sinceOf = (c: Ctx, a: Acct): string => a.since || (c.lapsed && c.lapsed[a.id] ? "this morning, " + c.lapsed[a.id].since : "");
const wasDue = (c: Ctx, a: Acct) => a.st === "lapsed" || a.st === "ends" || !!(c.lapsed && c.lapsed[a.id]);

/** what is coming up: anything that ends within a week, or has lapsed (seats.html's soon, unchanged in substance) */
export function soon(c: Ctx, p: Person | null): Soon[] {
  const out: Soon[] = [];
  if (!p) return out;
  for (const x of p.seats) {
    const s = seatSt(c, x), many = x.who.length > 1;
    if (x.st === "ends" && s === "wait") out.push({ id: x.id, kind: "seat", g: "wait", t: `Renewing ${x.n}.`, w: `Sign in on its own page. ${x.who.join(" and ")} keep working meanwhile.` });
    if (x.st === "ends" && s === "renewed") out.push({ id: x.id, kind: "seat", g: "done", t: `${x.n} renewed until 19 February.`, w: `${x.who.join(" and ")} carry on. I’ll tell you a week before the next one.` });
    if (s === "ends" && !c.b.snooze[x.id]) out.push({ id: x.id, kind: "seat", t: `${x.n}’s sign-in ends ${x.ends}.`, w: `${x.who.join(" and ")} ${many ? "work" : "works"} in it. After that ${many ? "they stop" : "it stops"} at the sign-in.`, btn: "Renew now" });
  }
  for (const a of p.accts) {
    const s = acctSt(c, a);
    if (wasDue(c, a) && s === "wait") out.push({ id: a.id, kind: "acct", g: "wait", t: `Signing in to ${a.n.replace(/^Your /, "your ")}.`, w: "Sign in on its own page. I never see your password." });
    if (wasDue(c, a) && s === "done") out.push({ id: a.id, kind: "acct", g: "done", t: `${a.n}: signed in again.`, w: `${a.by} picks up where it stopped.` });
    if (s === "lapsed") out.push({ id: a.id, kind: "acct", t: `${a.n} ended ${sinceOf(c, a)}.`, w: `${a.by} can’t reach it until you sign in once.`, btn: "Sign in once" });
    if (s === "ends" && !c.b.snooze[a.id]) out.push({ id: a.id, kind: "acct", t: `${a.n} ends ${a.ends}.`, w: `${a.why}. ${a.by} reads it.`, btn: "Renew now" });
  }
  return out;
}
/** the items of Coming up as the load finds them (before any press): one Diary line each */
export const ahead = (c: Ctx, p: Person | null): Soon[] => soon(c, p).filter((x) => !x.g);

/** an AI blocked by a lapsed sign-in: only when that AI is on this canvas and the sign-in is still lapsed */
export function blocked(c: Ctx, p: Person | null, person: string, ais: Set<string>): Blocked[] {
  if (!p) return [];
  return p.accts.filter((a) => a.blocks && acctSt(c, a) === "lapsed" && ais.has(a.blocks.ai))
    .map((a) => ({ id: `seat:${person}:${a.id}`, type: "seat" as const, a, target: a.id, ...a.blocks! }));
}

/** the row on Settings' main page, under "How your AIs work": "2 AIs ready to use · 1 plan ends this week" (BR1 words
 *  pass: "seats" and "coming up" said nothing to a first-timer) */
export function rowSub(c: Ctx, p: Person | null): string {
  // live, no seat is read yet (livePerson): "0 AIs ready to use" there was wrong, not news (BR1 lane G); the row keeps its plain words
  if (!p || !p.seats.length) return "";
  const n = p.seats.filter((x) => ["use", "in", "ends"].includes(seatSt(c, x))).length, k = ahead(c, p).length;
  return `${n} AI${n === 1 ? "" : "s"} ready to use · ${k ? `${k} plan${k === 1 ? " ends" : "s end"} this week` : "nothing ends this week"}`;
}

/** the Diary line a finished sign-in writes (sign_in's), or null while its page is open */
export function didLine(x: Seat | undefined, a: Acct | undefined, to: string): string | null {
  if (!["done", "in", "renewed", "via", "off"].includes(to)) return null;
  const n = (x || a)!.n;
  return to === "off" ? `You disconnected ${n}.` : to === "via" ? "School mail now comes through Mail on this Mac."
    : to === "renewed" ? `${n} renewed until 19 February.` : `${n}: signed in again.${a && a.by ? ` ${a.by} picks up where it stopped.` : ""}`;
}

/** live: home.connections' rows as accounts read (a row: { id, name, from, state, since? }); nothing is a seat yet */
export type ConnRow = { id: string; name: string; from?: string; state: string; since?: string; account?: string };
const LIVE_ST: Record<string, string> = { connected: "on", lapsed: "lapsed", missing: "off", unsure: "off" };
export function livePerson(rows: ConnRow[]): Person {
  return { seats: [], accts: rows.map((r) => ({ id: r.id, n: r.name, sub: r.account || r.from || "", st: LIVE_ST[r.state] ?? "off", by: "", may: [], not: "", since: r.since })) };
}
