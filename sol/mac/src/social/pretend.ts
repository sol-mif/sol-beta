// Pretend friends and builds (fr-31): what Social shows under ?dev=social until the hub carries friends between Macs
// (specs/features/fr-31-social/backend.md). Sample numbers; credits and prizes are pretend. Marco's side of the dinner
// flow is played from here too: his agent asks, proposes and invites, so the path can be walked end to end on one Mac.
import { emptyState, type Build, type CalEvent, type Friend, type Me, type Request, type State } from "./model.ts";

const H = 3_600_000;
/** the start of the next given weekday (0 Sunday … 4 Thursday), from now; today counts only before 6pm */
export function nextDay(now: number, weekday: number): number {
  const d = new Date(now); const today = new Date(d); today.setHours(0, 0, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d.getHours() >= 18) add = 7;
  today.setDate(today.getDate() + add);
  return today.getTime();
}

export const ME: Me = { sol: "w0ngtap", name: "Isaac", jelly: { preset: 1 }, presence: "online", working: "the launch post for the first hundred", agent: 1 /* does, then tells: answers from grants */,
  published: { builds: 3, downloads: 412, wins: 1, helped: 4 }, premium: true, partner: true };

export const FRIENDS: Friend[] = [
  { sol: "marco", name: "Marco", jelly: { preset: 4 }, presence: "online", working: "the stage, round 4", agent: 1, level: 23, circle: "close", grants: { freebusy: true, profile: true, working: true, calendar: true } },
  { sol: "frank", name: "Frank", jelly: { preset: 2 }, presence: "away", working: "the hub's spool", agent: 2, level: 31, circle: "friend", grants: { freebusy: true, profile: true, working: true } },
  { sol: "ana-k", name: "Ana", jelly: { preset: 0 }, presence: "online", working: "orgo problem set 6", agent: 1, level: 14, circle: "close", grants: { freebusy: true, profile: true, working: true } },
  { sol: "jev", name: "Jev", jelly: { preset: 5 }, presence: "offline", agent: 0, level: 9, circle: "friend", grants: { freebusy: true, profile: true } },
];

export function calendarFor(now: number): CalEvent[] {
  const thu = nextDay(now, 4);
  return [
    { title: "CHEM 241 lecture", start: thu + 10 * H, end: thu + 11.5 * H, place: "Hall B" },
    { title: "Sol stand-up", start: thu + 14 * H, end: thu + 14.5 * H },
    { title: "Gym", start: thu + 17 * H, end: thu + 18 * H },
  ];
}

export function pretendRequests(now: number): Request[] {
  return [
    { id: "p-friend", kind: "friend", from: "lena-v", fromName: "Lena", jelly: { preset: 3 }, at: now - 40 * 60_000, state: "open",
      summary: "Lena wants to be friends", note: "we met at the hackathon, the jelly made me laugh", full: "Sol name: lena-v · friends in common: Marco, Ana" },
    { id: "p-data", kind: "data", from: "ana-k", fromName: "Ana", jelly: { preset: 0 }, ask: "projects", at: now - 25 * 60_000, state: "open",
      summary: "Ana's agent asks to see your current projects", note: "planning a study group around everyone's deadlines",
      full: "what: current projects\nwhy: \"plan a study group around deadlines\"\nnot shared with Ana yet" },
    { id: "p-help", kind: "help", from: "frank", fromName: "Frank", jelly: { preset: 2 }, at: now - 10 * 60_000, state: "open",
      help: { summary: "tidy the hub's error words", note: "you write better words than me; no rush", size: "about a 20-minute job",
        prompt: "Read sol/hub/src/relay-hub.ts and rewrite every error a person can see in plain words, one line each. Keep the codes. Open a draft PR naming the issue." },
      summary: "Frank asks for a hand: tidy the hub's error words", note: "you write better words than me; no rush",
      full: "Read sol/hub/src/relay-hub.ts and rewrite every error a person can see in plain words, one line each. Keep the codes. Open a draft PR naming the issue." },
  ];
}

export function pretendState(now: number): State {
  return { ...emptyState(ME), friends: FRIENDS, calendar: calendarFor(now), requests: pretendRequests(now), installed: ["focus"], owned: ["focus"],
    favours: { week: "", n: 0 } };
}

export const BUILDS: Build[] = [
  { id: "night", kind: "look", name: "Night Shift", by: "marco", price: 0, downloads: 1840, look: { color: "#0d0f1a", alpha: 0.86 }, tags: ["night", "late", "focus"] },
  { id: "peach", kind: "look", name: "Peach Fuzz", by: "ana-k", price: 120, downloads: 612, look: { color: "#2a1a17" }, tags: ["warm", "study"] },
  { id: "focus", kind: "preset", name: "Focus preset", by: "frank", price: 0, downloads: 2210, look: { bubble: "glass", text: 16 }, what: "glass bubbles, 16px words", tags: ["focus", "study"] },
  { id: "rail", kind: "rail", name: "Student rail", by: "w0ngtap", price: 80, downloads: 298, what: "calendar, Canvas and the browser on the rail", tags: ["school", "study"] },
  { id: "canvas", kind: "button", name: "Canvas due-dates", by: "jev", price: 200, downloads: 155, what: "a button that lists what's due this week", tags: ["school"] },
  { id: "gold", kind: "look", name: "Gold Jelly · 1 of 50", by: "frank", price: 900, downloads: 41, stock: 9, look: { color: "#1a160a" }, tags: ["rare"] },
];

export type Challenge = { id: string; host: string; title: string; prize: string; ends: string; entries: number; champ?: true };
export const CHALLENGES: Challenge[] = [
  { id: "c1", host: "Frank", title: "The best rail for students", prize: "$200 (pretend)", ends: "2 days", entries: 14 },
  { id: "c2", host: "Marco", title: "A look that feels like rain", prize: "2,000 sol-credits (pretend)", ends: "5 days", entries: 31 },
  { id: "c3", host: "a sponsor's unused credits", title: "A Canvas button that saves an hour a week", prize: "$500 of usage credits (pretend)", ends: "12 days", entries: 7, champ: true },
];
// Community (#1214): a Research Partner's perks (docs/beta/welcome.md), and the credits: asks that changed Sol, and who
// asked (a name only with their yes). Sample words and names; the real list is the team's board.
export const PERKS = [
  { id: "price", icon: "💸", name: "The founding price", line: "The lowest price we'll ever offer, for as long as you keep Sol." },
  { id: "first", icon: "⚡", name: "First in line", line: "New features reach you before anyone else." },
  { id: "say", icon: "📋", name: "A real say", line: "Your top asks go onto our board. We build the change, fix it, or tell you what happened." },
  { id: "badge", icon: "🌱", name: "The badge", line: "On your profile, and beside your name here." },
  { id: "room", icon: "💬", name: "A private channel", line: "In the beta Discord, with the three of us." },
] as const;
export const CREDITS = [
  { id: "cr1", ask: "Blackboard in Home", by: "Ana", partner: true, state: "shipped", when: "12 Nov" },
  { id: "cr2", ask: "The notch over full-screen apps", by: "Jev and Lena", partner: false, state: "fixed", when: "13 Nov" },
  { id: "cr3", ask: "Theme packs", by: "Lena and 2 others", partner: false, state: "on the board", when: "" },
  { id: "cr4", ask: "Sign in without Terminal", by: "Jev", partner: false, state: "answered", when: "Claude's own page opens now" },
] as const;
export const HAPPENINGS = [
  { id: "h1", line: "Marco published Night Shift, a look", tab: "market" },
  { id: "h2", line: "Frank's challenge ends in 2 days: the best rail for students", tab: "challenges" },
  { id: "h3", line: "3 friends installed Focus preset this week", tab: "upgrades" },
] as const;
