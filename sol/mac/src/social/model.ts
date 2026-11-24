// Social's model (fr-31, specs/features/fr-31-social/prd.md): pure, no DOM, no React, so it is tested alone
// (src/social.test.ts) and can move to the engine when the hub carries friends (backend.md). A friend is Cowork's
// person (#725): someone with their own agent and the one setting for what it may do. Social adds the grant: what a
// friend may see of you. Every change returns a new state; a press that has already landed changes nothing.
// Nothing here counts use: levels come only from what a person publishes.

// ---- people and their jelly
export type Presence = "online" | "away" | "offline";
export type AgentLevel = 0 | 1 | 2;
/** Cowork's three words (#725 LEVELS), the same setting, not a second one */
export const AGENT_LEVELS = ["asks first", "does, then tells", "does"] as const;
export type Circle = "friend" | "close";
/** a person's picture: one of the preset jellies, or their own image over it */
export type Picture = { preset: number; img?: string };
/** the presets: pairs from the jelly's six (kit/tokens.ts JELLY.six) and a pace; the first is the default */
export const JELLIES = [
  { name: "coral", a: "#ff4888", b: "#fb7129", pace: 4.5 },
  { name: "sun", a: "#f4c82a", b: "#f89b2a", pace: 5 },
  { name: "lime", a: "#70df45", b: "#f4c82a", pace: 6 },
  { name: "ember", a: "#ff2e4e", b: "#ff4888", pace: 5.5 },
  { name: "dusk", a: "#a46cff", b: "#ff4888", pace: 7 },
  { name: "sea", a: "#3ec6e0", b: "#70df45", pace: 8 },
] as const;
export type Style = { a: string; b: string; pace: number };
/** a person's style, drawn from their jelly: wherever their agent is shown working, its box takes this */
export function styleOf(p: { jelly: Picture }): Style {
  const j = JELLIES[p.jelly.preset] ?? JELLIES[0];
  return { a: j.a, b: j.b, pace: j.pace };
}
export const DEFAULT_PICTURE: Picture = { preset: 0 };
/** pick a preset (drops an uploaded image) or bring an image (keeps the preset under it, for its colours) */
export function pickJelly(p: Picture, preset: number): Picture { return { preset: preset >= 0 && preset < JELLIES.length ? preset : p.preset }; }
export function uploadJelly(p: Picture, img: string): Picture { return /^data:image\/|^https:\/\//.test(img) ? { ...p, img } : p; }

export type Person = { sol: string; name: string; jelly: Picture; presence: Presence; working?: string; agent: AgentLevel; level?: number; premium?: boolean };

// ---- grants: what a friend may see of you
export type GrantKey = "freebusy" | "profile" | "working" | "calendar" | "projects" | "location";
export const GRANTS: { k: GrantKey; name: string; why: string; common?: true; close?: true }[] = [
  { k: "freebusy", name: "free / busy", why: "your calendar as busy blocks, never what they are", common: true },
  { k: "profile", name: "profile", why: "your jelly, level, badges and what you published", common: true },
  { k: "working", name: "what you're working on", why: "your one \"working on…\" line", common: true },
  { k: "calendar", name: "full calendar", why: "event names and places", close: true },
  { k: "projects", name: "current projects", why: "the projects you are in", close: true },
  { k: "location", name: "location", why: "where you are, until the time you set; then it turns itself off", close: true },
];
export const COMMON: GrantKey[] = GRANTS.filter((g) => g.common).map((g) => g.k);
const CLOSE_ONLY = new Set(GRANTS.filter((g) => g.close).map((g) => g.k));
export type Grants = Partial<Record<GrantKey, boolean>>;
export type Friend = Person & { circle: Circle; grants: Grants; locUntil?: number };

/** whether a grant holds right now: close-only ones need a close friend, location needs its end in the future */
export function granted(f: Friend, k: GrantKey, now: number): boolean {
  if (!f.grants[k]) return false;
  if (CLOSE_ONLY.has(k) && f.circle !== "close") return false;
  if (k === "location") return (f.locUntil ?? 0) > now;
  return true;
}

// ---- the calendar Sol reads (Google Calendar, the classes picked out by name) and free/busy
export type CalEvent = { title: string; start: number; end: number; place?: string };
export type Block = { start: number; end: number };
/** busy blocks between from and to, merged, with no titles: what a friend's agent gets for free/busy */
export function freeBusy(cal: CalEvent[], from: number, to: number): Block[] {
  const bs = cal.filter((e) => e.end > from && e.start < to).map((e) => ({ start: Math.max(e.start, from), end: Math.min(e.end, to) })).sort((x, y) => x.start - y.start);
  const out: Block[] = [];
  for (const b of bs) { const last = out[out.length - 1]; if (last && b.start <= last.end) last.end = Math.max(last.end, b.end); else out.push({ ...b }); }
  return out;
}
/** classes, picked out of a calendar by name (lecture, seminar, lab, a course code) */
export const isClass = (e: CalEvent) => /\b(lecture|seminar|lab|tutorial|recitation|class)\b|\b[A-Z]{2,4}\s?\d{3}\b/i.test(e.title);

// ---- requests: every kind, one list, one green button on the notch
export type RequestKind = "friend" | "data" | "invite" | "help";
export type RequestState = "open" | "accepted" | "declined" | "taken" | "sent";
export type Invite = { title: string; place: string; start: number; end: number };
export type HelpAsk = { summary: string; note?: string; prompt: string; context?: string; size: string };
/** the prompt as the helper's session gets it: the task, then the context it needs, in words */
export const helpText = (h: HelpAsk) => h.context?.trim() ? `${h.prompt.trim()}\n\nContext:\n${h.context.trim()}` : h.prompt.trim();
export type Request = {
  id: string; kind: RequestKind; from: string; fromName: string; jelly: Picture; summary: string; note?: string; full: string; at: number;
  state: RequestState; ask?: GrantKey; invite?: Invite; help?: HelpAsk; share?: Grants; result?: string;
};
export const openRequests = (s: Pick<State, "requests">) => s.requests.filter((r) => r.state === "open" || r.state === "taken");
/** the notch's green button: how many wait, and whose jelly is on top */
export function notchButton(s: Pick<State, "requests">): { count: number; top?: Picture } {
  const o = s.requests.filter((r) => r.state === "open");
  return { count: o.length, top: o[0]?.jelly };
}

// ---- the whole of one person's Social
export type Favour = { perWeek: number; from: "close" | "friends" };
export type Published = { builds: number; downloads: number; wins: number; helped: number };
// partner: a Research Partner (#1214), who said yes to the invite in their Beta inbox; their perks show in Community
export type Me = Person & { published: Published; premium: boolean; partner?: boolean };
export type Sent = { to: string; summary: string; at: number; said: string };
export type State = {
  me: Me; onboarded: boolean; friends: Friend[]; outgoing: string[]; requests: Request[]; calendar: CalEvent[];
  favour: Favour; favours: { week: string; n: number }; sent: Sent[]; credits: number; installed: string[]; owned: string[];
  stock: Record<string, number>; skipped: string[]; was?: Record<string, unknown>; seen: string[];
  /** what your agent did on its own and told you ("does, then tells"), newest first */
  told?: { at: number; line: string }[];
  /** pretend only (?dev=social): each friend's own favour count, so the limit can be reached in play */
  theirFavours?: Record<string, { week: string; n: number }>;
};
export const emptyState = (me: Me): State => ({
  me, onboarded: false, friends: [], outgoing: [], requests: [], calendar: [], favour: { perWeek: 3, from: "close" },
  favours: { week: "", n: 0 }, sent: [], credits: 1200, installed: [], owned: [], stock: {}, skipped: [], seen: [],
});
const friendOf = (s: State, sol: string) => s.friends.find((f) => f.sol === sol);
const withFriend = (s: State, sol: string, f: (x: Friend) => Friend): State => ({ ...s, friends: s.friends.map((x) => (x.sol === sol ? f(x) : x)) });
const withRequest = (s: State, id: string, f: (r: Request) => Request): State => ({ ...s, requests: s.requests.map((r) => (r.id === id ? f(r) : r)) });
let n = 0;
const rid = (p: string, now: number) => `${p}-${now.toString(36)}-${(++n).toString(36)}`;

// ---- friends
/** a Sol name: 3 to 24 of a-z 0-9 -, starting with a letter (the cloud's rule, sol/cloud/README.md) */
export const isSolName = (v: string) => /^[a-z][a-z0-9-]{2,23}$/.test(v);
export const inviteLink = (sol: string, k: string) => `sol://social/invite/${sol}?k=${encodeURIComponent(k)}`;
export function parseInvite(v: string): { sol: string; k: string } | null {
  const m = /^sol:\/\/social\/invite\/([a-z][a-z0-9-]{2,23})\?k=([A-Za-z0-9_-]{1,64})$/.exec(v.trim());
  return m ? { sol: m[1], k: m[2] } : null;
}
/** add by Sol name or invite link: an outgoing request (the hub delivers it, backend.md §1) */
export function addFriend(s: State, v: string): { s: State; error?: string } {
  const sol = parseInvite(v)?.sol ?? v.trim().toLowerCase().replace(/^@/, "");
  if (!isSolName(sol)) return { s, error: "a Sol name is 3 to 24 letters, digits or -, starting with a letter" };
  if (sol === s.me.sol) return { s, error: "that's you" };
  if (friendOf(s, sol)) return { s, error: "already a friend" };
  if (s.outgoing.includes(sol)) return { s, error: "already asked; waiting for them" };
  return { s: { ...s, outgoing: [...s.outgoing, sol] } };
}
/** a friend moved in or out of close friends; out turns every close-only grant off */
export function setCircle(s: State, sol: string, circle: Circle): State {
  return withFriend(s, sol, (f) => ({ ...f, circle, grants: circle === "close" ? f.grants : Object.fromEntries(Object.entries(f.grants).filter(([k]) => !CLOSE_ONLY.has(k as GrantKey))) as Grants, ...(circle === "close" ? {} : { locUntil: undefined }) }));
}
export const LOCATION_FOR = { "1 hour": 3_600_000, "4 hours": 4 * 3_600_000 } as const;
/** midnight after now, for "until midnight" */
export const midnightAfter = (now: number) => { const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime(); };
/** turn one grant on or off for one friend; close-only ones are refused for a friend who is not close; location needs an end */
export function setGrant(s: State, sol: string, k: GrantKey, on: boolean, until?: number): { s: State; error?: string } {
  const f = friendOf(s, sol);
  if (!f) return { s, error: "not a friend" };
  if (on && CLOSE_ONLY.has(k) && f.circle !== "close") return { s, error: `${f.name} isn't a close friend; make them one first` };
  if (on && k === "location" && !until) return { s, error: "location needs a time it turns itself off" };
  return { s: withFriend(s, sol, (x) => ({ ...x, grants: { ...x.grants, [k]: on }, ...(k === "location" ? { locUntil: on ? until : undefined } : {}) })) };
}

// ---- agents asking each other (a2a): yours answers from what you granted, and only that
export type Ask = { what: "freebusy" | "calendar" | "working" | "profile" | "projects" | "location"; from: number; to: number; why?: string };
export type Answer =
  | { answer: { freebusy: Block[] } | { calendar: CalEvent[] } | { working: string } | { profile: { name: string; level: number; jelly: Picture } } | { projects: string[] } | { location: string }; told?: string }
  | { request: Request }
  | { refused: string };
/** a friend's agent asks yours. Granted: answered on its own from what you shared. Not granted: a request to you. */
export function answerAsk(s: State, fromSol: string, ask: Ask, now: number, mine: { projects?: string[]; location?: string } = {}): Answer {
  const f = friendOf(s, fromSol);
  if (!f) return { refused: "not a friend" };
  const ok = granted(f, ask.what, now);
  if (ok && s.me.agent > 0) {
    // "does, then tells" (1): the answer, and a line for you; "does" (2): the answer alone
    const told = s.me.agent === 1 ? `${f.name}'s agent read your ${GRANTS.find((x) => x.k === ask.what)!.name}${ask.why ? ` (${ask.why})` : ""}` : undefined;
    const give = (answer: Extract<Answer, { answer: unknown }>["answer"]): Answer => (told ? { answer, told } : { answer });
    switch (ask.what) {
      case "freebusy": return give({ freebusy: freeBusy(s.calendar, ask.from, ask.to) });
      case "calendar": return give({ calendar: s.calendar.filter((e) => e.end > ask.from && e.start < ask.to) });
      case "working": return give({ working: s.me.working ?? "" });
      case "profile": return give({ profile: { name: s.me.name, level: levelOf(xpOf(s.me.published)).level, jelly: s.me.jelly } });
      case "projects": return give({ projects: mine.projects ?? [] });
      case "location": return give({ location: mine.location ?? "" });
    }
  }
  const g = GRANTS.find((x) => x.k === ask.what)!;
  const why = ok ? `you share it with ${f.name}, and your agent asks first` : g.close && f.circle !== "close" ? `${f.name} is not a close friend; this is only for close friends.` : `not shared with ${f.name} yet`;
  return { request: { id: rid("data", now), kind: "data", from: f.sol, fromName: f.name, jelly: f.jelly, ask: ask.what, at: now, state: "open",
    summary: `${f.name}'s agent asks to see your ${g.name}`, note: ask.why, full: `what: ${g.name}\n${ask.why ? `why: "${ask.why}"\n` : ""}${why}` } };
}
/** what your agent answered on its own lands as a line for you ("does, then tells"); nothing for "does" */
export function noteTold(s: State, a: Answer, now: number): State {
  if (!("answer" in a) || !a.told) return s;
  return { ...s, told: [{ at: now, line: a.told }, ...(s.told ?? [])].slice(0, 20) };
}
/** an answer that became a request lands in your list once */
export function receive(s: State, r: Request): State { return s.requests.some((x) => x.id === r.id) ? s : { ...s, requests: [r, ...s.requests] }; }

// ---- the dinner flow: the inviter's agent reads free/busy, proposes a time, the inviter types the place
/** the first free start, from the preferred hours in order, where `len` fits between busy blocks on that day */
export function proposeTime(busy: Block[], day: number, len: number, hours: number[] = [19.5, 19, 20, 18.5, 20.5]): { start: number; end: number } | null {
  for (const h of hours) {
    const start = day + h * 3_600_000, end = start + len;
    if (!busy.some((b) => b.start < end && start < b.end)) return { start, end };
  }
  return null;
}
export function makeInvite(from: Person, inv: Invite, note: string | undefined, now: number): Request {
  const t = new Date(inv.start);
  const when = `${t.toLocaleDateString("en-US", { weekday: "long" })} ${clock(inv.start)}`;
  return { id: rid("invite", now), kind: "invite", from: from.sol, fromName: from.name, jelly: from.jelly, invite: inv, at: now, state: "open", note,
    summary: `${from.name} invites you to ${inv.title.toLowerCase()} at ${inv.place}, ${clock(inv.start)}`,
    full: `what: ${inv.title}\nwhere: ${inv.place} (${from.name} typed it)\nwhen: ${when}–${clock(inv.end)}\nhow ${from.name}'s agent knew you were free: your free/busy, which you share with ${from.name}` };
}
export function clock(ms: number): string { const d = new Date(ms); const h = d.getHours(), m = d.getMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`.replace(":00", ""); }
/** Google Calendar's own add-event page, filled in: no key, one press there to save (prd Decisions) */
export function calendarUrl(inv: Invite): string {
  const z = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(inv.title)}&location=${encodeURIComponent(inv.place)}&dates=${z(inv.start)}/${z(inv.end)}`;
}

// ---- settling a request: once, whatever is pressed twice
export type Settled = { s: State; calendar?: string; prompt?: string; told?: string };
export function accept(s: State, id: string, now: number): Settled {
  const r = s.requests.find((x) => x.id === id);
  if (!r || r.state !== "open") return { s };
  if (r.kind === "friend") {
    if (friendOf(s, r.from)) return { s: withRequest(s, id, (x) => ({ ...x, state: "accepted" })) };
    const grants: Grants = Object.fromEntries(COMMON.map((k) => [k, r.share?.[k] !== false]));
    const f: Friend = { sol: r.from, name: r.fromName, jelly: r.jelly, presence: "online", agent: 0, circle: "friend", grants };
    return { s: { ...withRequest(s, id, (x) => ({ ...x, state: "accepted" })), friends: [...s.friends, f], outgoing: s.outgoing.filter((o) => o !== r.from) }, told: `${r.fromName} is a friend` };
  }
  if (r.kind === "data" && r.ask) {
    const until = r.ask === "location" ? now + LOCATION_FOR["1 hour"] : undefined;
    const g = setGrant(s, r.from, r.ask, true, until);
    if (g.error) return { s, told: g.error };
    return { s: withRequest(g.s, id, (x) => ({ ...x, state: "accepted" })), told: `shared with ${r.fromName}` };
  }
  if (r.kind === "invite" && r.invite) {
    const inv = r.invite;
    return { s: { ...withRequest(s, id, (x) => ({ ...x, state: "accepted" })), calendar: [...s.calendar, { title: inv.title, start: inv.start, end: inv.end, place: inv.place }] }, calendar: calendarUrl(inv), told: `${r.fromName}'s agent heard yes` };
  }
  if (r.kind === "help") return takeOn(s, id);
  return { s };
}
/** what the yes on a data request says, or null when it can't be given (a close-only thing to a friend not close) */
export function shareWord(s: State, r: Request): string | null {
  if (r.kind !== "data" || !r.ask) return null;
  const f = friendOf(s, r.from);
  if (!f || (CLOSE_ONLY.has(r.ask) && f.circle !== "close")) return null;
  return r.ask === "location" ? "Share for 1 hour" : "Share";
}
export function decline(s: State, id: string): Settled {
  const r = s.requests.find((x) => x.id === id);
  if (!r || (r.state !== "open" && r.state !== "taken")) return { s };
  return { s: withRequest(s, id, (x) => ({ ...x, state: "declined" })), told: r.kind === "help" ? `${r.fromName}'s agent was told: not this time` : undefined };
}
/** the friend request's three commonly shared switches, turned on the accept card before Accept */
export function shareOnAccept(s: State, id: string, k: GrantKey, on: boolean): State {
  return COMMON.includes(k) ? withRequest(s, id, (r) => ({ ...r, share: { ...r.share, [k]: on } })) : s;
}

// ---- asking a friend for help: a message, never a run. The helper takes it on in their own session, by hand.
/** the week an ask counts in (Monday's date) */
export function weekOf(now: number): string { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export const favourWords = (f: Favour) => `up to ${f.perWeek} ask${f.perWeek === 1 ? "" : "s"} a week, from ${f.from === "close" ? "close friends only" : "all friends"}`;
/** on the helper's side: an ask arrives. Over the limit, or from someone the limit leaves out, it never reaches them. */
export function receiveHelp(s: State, fromSol: string, ask: HelpAsk, now: number): { s: State; refused?: string } {
  const f = friendOf(s, fromSol);
  if (!f) return { s, refused: "not a friend" };
  if (s.favour.from === "close" && f.circle !== "close") return { s, refused: `${s.me.name} takes asks from close friends only` };
  const week = weekOf(now), used = s.favours.week === week ? s.favours.n : 0;
  if (used >= s.favour.perWeek) return { s, refused: `${s.me.name}'s favours are used up this week` };
  const r: Request = { id: rid("help", now), kind: "help", from: f.sol, fromName: f.name, jelly: f.jelly, help: ask, at: now, state: "open",
    summary: `${f.name} asks for a hand: ${ask.summary}`, note: ask.note, full: helpText(ask) };
  return { s: { ...s, requests: [r, ...s.requests], favours: { week, n: used + 1 } } };
}
/** Run it, or Open it first: nothing runs by itself. It gives the prompt for a new session of the helper's own; Run it
 *  sends it there on the helper's press, Open it first leaves it in the box to edit. */
export function takeOn(s: State, id: string): Settled {
  const r = s.requests.find((x) => x.id === id);
  if (!r || r.kind !== "help" || r.state !== "open") return { s };
  return { s: withRequest(s, id, (x) => ({ ...x, state: "taken" })), prompt: `${r.help ? helpText(r.help) : r.full}\n\n(A favour for ${r.fromName}. When it's done, Send back from Social's Requests.)` };
}
/** Send back: the result goes to the asker, and it counts one friend helped on the helper's profile */
export function sendBack(s: State, id: string, text: string): { s: State; to?: string; error?: string } {
  const r = s.requests.find((x) => x.id === id);
  if (!r || r.kind !== "help" || r.state !== "taken") return { s };
  if (!text.trim()) return { s, error: "write what you send back first" };
  return { s: { ...withRequest(s, id, (x) => ({ ...x, state: "sent", result: text.trim() })), me: { ...s.me, published: { ...s.me.published, helped: s.me.published.helped + 1 } } }, to: r.from };
}

// ---- levels: XP only from what a person publishes (prd 8); never usage
export const xpOf = (p: Published) => p.builds * 100 + p.downloads * 5 + p.wins * 500 + p.helped * 50;
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1, need = 100, left = Math.max(0, Math.floor(xp));
  while (left >= need) { left -= need; level++; need = Math.round(need * 1.15); }
  return { level, into: left, need };
}
export function badgesOf(p: Published, premium: boolean): { g: string; t: string }[] {
  return [
    ...(p.builds >= 1 ? [{ g: "★", t: "first build" }] : []),
    ...(p.downloads >= 100 ? [{ g: "⬇", t: `${Math.floor(p.downloads / 100) * 100} downloads` }] : []),
    ...(p.wins >= 1 ? [{ g: "♛", t: p.wins === 1 ? "challenge winner" : `${p.wins} challenges won` }] : []),
    ...(p.helped >= 1 ? [{ g: "♥", t: `helped ${p.helped} friend${p.helped === 1 ? "" : "s"}` }] : []),
    ...(premium ? [{ g: "◆", t: "champions league" }] : []),
  ];
}

// ---- the market: looks and presets install for real (they are settings), buttons are code and pretend
export type LookPatch = { color?: string; alpha?: number; blur?: number; bubble?: string; text?: number; skin?: string };
export type Build = { id: string; kind: "look" | "preset" | "rail" | "button"; name: string; by: string; price: number; downloads: number; look?: LookPatch; what?: string; stock?: number; tags?: string[] };
export const isReal = (b: Build) => b.kind === "look" || b.kind === "preset";
/** buy with the pretend balance; a rivalrous build counts down and runs out */
export function buy(s: State, b: Build): { s: State; error?: string } {
  if (s.owned.includes(b.id)) return { s };
  if (s.credits < b.price) return { s, error: "not enough sol-credits (pretend)" };
  const left = b.stock === undefined ? undefined : (s.stock[b.id] ?? b.stock);
  if (left !== undefined && left <= 0) return { s, error: "all gone" };
  return { s: { ...s, credits: s.credits - b.price, owned: [...s.owned, b.id], ...(left !== undefined ? { stock: { ...s.stock, [b.id]: left - 1 } } : {}) } };
}
/** install: a look or preset gives the look patch to write (real) and keeps the look it replaced, for its own Undo;
 *  code is refused, and a rail arrangement is pretend until the rails take presets */
export function install(s: State, b: Build, lookNow: unknown): { s: State; patch?: LookPatch; error?: string } {
  if (b.price > 0 && !s.owned.includes(b.id)) return { s, error: "buy it first" };
  if (b.kind === "button") return { s, error: "buttons are code: install is pretend until builds are reviewed" };
  if (b.kind === "rail") return { s, error: "rail arrangements are pretend until the rails take presets" };
  if (s.installed.includes(b.id)) return { s };
  return { s: { ...s, installed: [...s.installed, b.id], was: { ...s.was, [b.id]: lookNow } }, patch: b.look ?? {} };
}
/** Undo: the build out, and the look it replaced back */
/** Undo: the build out, and the look it replaced back. Looks and presets stack: one under a later one is undone after it,
 *  so the restore never wipes a look still on (the card says which to undo first) */
export function uninstall(s: State, b: Build, all: Build[] = []): { s: State; patch?: unknown; error?: string } {
  if (!s.installed.includes(b.id)) return { s };
  if (b.look) {   // a look or a preset: both write the look, so both stack
    const later = s.installed.slice(s.installed.indexOf(b.id) + 1).map((id) => all.find((x) => x.id === id)).find((x) => !!x?.look);
    if (later) return { s, error: `undo ${later.name} first; it came after` };
  }
  const { [b.id]: back, ...was } = s.was ?? {};
  return { s: { ...s, installed: s.installed.filter((id) => id !== b.id), was }, patch: back };
}

// ---- suggested upgrades: popular + what you installed; the "use everything" signal only when it is on
/** signals: words Sol saw on this Mac (session names, calendar, installs), passed only when the switch is on */
export function suggest(builds: Build[], s: Pick<State, "installed" | "skipped">, signals: string[] | null): Build[] {
  const kinds = new Set(builds.filter((b) => s.installed.includes(b.id)).map((b) => b.kind));
  const words = (signals ?? []).map((w) => w.toLowerCase());
  const score = (b: Build) => Math.log10(b.downloads + 1) + (kinds.has(b.kind) ? 1 : 0) + (words.length ? 2 * (b.tags ?? []).filter((t) => words.includes(t)).length : 0);
  return builds.filter((b) => isReal(b) && !s.installed.includes(b.id) && !s.skipped.includes(b.id)).sort((x, y) => score(y) - score(x) || x.id.localeCompare(y.id));
}
