// The people's data (slices 8+9, #1615): the mockup's merge/people.js setups ported as they are: the team setups T1–T8
// and T4c (Cowork) and the friend circles F0–F8 (Social), each person's default setups (P4). Fixture only: a real Sol
// never draws these (cv/wire/people.ts fills Cowork from team.v3.*; Social has no engine yet). Each colour people.js
// gave as ui.html's nearest value is a role of the `next` set here (paper, ink, card, the aura's three), so no value is
// typed (the look lint holds next/). Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).

/** the colours a group, a thing or a presence takes: roles of the next set and their mixes, never a typed value */
export const ROLE = {
  lilac: "var(--a1)", peach: "var(--a2)", mint: "var(--a3)",
  sky: "color-mix(in srgb, var(--a1) 45%, var(--a3))", blush: "color-mix(in srgb, var(--a2) 55%, var(--card))",
  haze: "color-mix(in srgb, var(--a1) 55%, var(--card))", lime: "color-mix(in srgb, var(--a3) 60%, var(--a2))",
  teal: "color-mix(in srgb, var(--a3) 70%, var(--a1))", amber: "color-mix(in srgb, var(--a2) 65%, var(--ink4))",
  rose: "color-mix(in srgb, var(--a2) 55%, var(--a1))", stone: "var(--ink4)", ink: "var(--ink)", ink3: "var(--ink3)",
} as const;

export type Person = { n: string; h: string; role: string; reach: string; ai: string | null; st: string; me?: boolean };
export type Wait = { id?: string; from?: string; h?: string; kind?: string; text?: string; sub?: string; btns?: string[]; more?: number };
export type Line = { who?: string; h?: string; t?: string; time?: string; kind?: string; ai?: number; you?: number; link?: number; fold?: string; build?: number; makers?: number; people?: number };
export type Thing = { k: string; n: string; s?: string; c: string; makers?: number };
export type Group = {
  id: string; name: string; color: string; due?: string; people: Person[]; main?: Thing; waits: Wait[]; lines: Line[]; shared?: Thing[];
  notes?: string; decided?: { t: string; who: string }[]; last: string; faces?: number; quiet?: number; project?: string;
};
export type Team = { label: string; groups: Group[]; viewer?: { role: string; ai: null }; many?: number; remembered?: number; first?: { opts: string[][] }; live?: boolean };
export type Friend = {
  n: string; h: string; close: number; pres: string | null; line: string; theirs: Record<string, number>; since?: string; via?: string; mine?: Record<string, number>;
  team?: string; teamRole?: string; waiting?: string; isnew?: number; quiet?: number;
  /** live (cv/wire/social.ts): what their AI asked yours, counted, and the last ask with how it went */
  asked?: { n: number; last?: { q: string; how: string } };
};
export type Inbox = { k: string; from: string; h: string; close?: boolean | number; title?: string; need?: string | null; size?: string; file?: string; free?: string; clash?: boolean; clashWith?: string; what?: string; src?: string; known?: number | boolean; rid?: string /* live: #1072's request id (cv/wire/social.ts) */ };
export type Circle = {
  // face and busy, live only (cv/wire/social.ts): the jelly the person keeps, and today's twelve hours from 8 am, busy or not
  label: string; me: { line: string; level: number; badges?: string[]; face?: number; busy?: number[] }; shares: Record<string, number>; friends: Friend[]; inbox: Inbox[];
  fav: { n: number; from: string; used: number }; first?: number; published?: { n: string; k: string; inst: number; rep: number }[];
  reports?: { n: number; on: string }; links?: { name: string; joined: number; of: number; days: number }[]; showLink?: number;
};

const P = (n: string, h: string, o: Partial<Person> = {}): Person => ({ n, h, role: "makes", reach: "app", ai: "Claude", st: "rest", ...o });
const ME = (o: Partial<Person> = {}) => P("You", "sam", { st: "wait", me: true, ...o });
const CROWD = ["Ade", "Bo", "Cyr", "Dee", "Ezra", "Fen", "Gil", "Hana", "Ines", "Jo", "Kofi", "Lars", "Mo", "Nia", "Oli", "Pia", "Quin", "Rae", "Sky", "Tess", "Uma", "Vic", "Wen", "Xia", "Yuri", "Zoe", "Abe", "Bea", "Cal", "Dov", "Eve", "Fay", "Gus", "Hal"];
const crowd = (k: number) => Array.from({ length: k }, (_, i) => P(CROWD[i % 34], "g" + (i % 6), { st: ["work", "done", "rest", "unk"][i % 4], ai: i % 3 ? "Claude" : null, role: i % 5 ? "makes" : "reads" }));
/** the things a group works in, by kind */
const K = { doc: ROLE.sky, sheet: ROLE.mint, figma: ROLE.lilac, cal: ROLE.peach, repo: ROLE.ink, page: ROLE.ink3 };

export const COWORK: Record<string, Team> = {
  T1: { label: "Pair", groups: [
    { id: "essay", name: "History essay", color: ROLE.peach, people: [ME(), P("Mia", "maya", { st: "work" })],
      main: { k: "Doc", n: "Essay: the causes of the First World War", s: "Mia edited 1 h ago · 2,140 words", c: K.doc },
      waits: [{ from: "Mia", h: "maya", kind: "ask", text: "Read my half before Sunday?", sub: "Due Sunday · her part 1 is done", btns: ["Yes", "Not yet", "Open"] }],
      lines: [{ who: "Mia", h: "maya", t: "I did the intro and part 1. Can you take 2 and 3?", time: "Mon" }, { kind: "decided", t: "Mia writes part 1, {me} writes 2 and 3", who: "Mia · Mon" }, { who: "Mia’s AI", h: "maya", ai: 1, kind: "done", t: "Sources for part 1, checked", time: "Tue" }],
      decided: [{ t: "Mia writes part 1, you write 2 and 3", who: "Mia · Mon" }], last: "Mia finished part 1." }] },
  T2: { label: "Class group", groups: [
    { id: "bio", name: "Bio lab report", color: ROLE.mint, due: "Friday 5 pm",
      people: [ME(), P("Ivy", "ivy", { st: "done" }), P("Maya", "maya", { st: "work", ai: "Codex" }), P("Kai", "kai", { reach: "link", ai: null }), P("Noor", "leo", { reach: "link", ai: null })],
      main: { k: "Doc", n: "Lab report", s: "Due Friday 5 pm · 3 of 5 parts written", c: K.doc },
      waits: [{ from: "Kai", h: "kai", kind: "back", text: "Kai hasn’t opened “the results table” for a day", sub: "You asked Tuesday, by link", btns: ["Do it myself", "Hand it to Noor", "Keep waiting"] },
        { from: "Noor", h: "leo", kind: "link", text: "Waiting on Noor by link · the conclusion", sub: "Sent Wed · opened, not answered", btns: ["Nudge", "Take it back"] }],
      lines: [{ who: "Ivy", h: "ivy", t: "Methods are done. Whoever has the numbers, put them in the sheet.", time: "Tue" }, { who: "Noor", h: "leo", link: 1, t: "I can do the conclusion if someone sends me the results.", time: "Wed" }, { fold: "Maya’s AI · 2 updates", h: "maya", makers: 1 }, { who: "Ivy’s AI", h: "ivy", ai: 1, kind: "done", t: "Discussion, first draft", time: "Wed" }],
      shared: [{ k: "Sheet", n: "Results", c: K.sheet }], decided: [{ t: "Due Friday 5 pm; Ivy submits", who: "Ivy · Mon" }], last: "Discussion draft done; results missing." }] },
  T3: { label: "Company", groups: [
    { id: "parcel", name: "Parcel", color: ROLE.sky,
      people: [ME(), P("Ana", "ana", { st: "work" }), P("Joon", "joon", { st: "done" }), P("Ravi", "leo", { st: "work", ai: "Codex" }), P("Eli", "ivy", { st: "rest" }), P("Tom", "kai", { st: "work" })],
      waits: [{ from: "Ana", h: "ana", kind: "ask", text: "Ship the new pricing page tonight?", sub: "Her AI checked the copy and links", btns: ["Ship it", "Not yet", "Open"] },
        { from: "Joon", h: "joon", kind: "hand", text: "Joon handed you: onboarding copy, first pass", sub: "Opens at the top of your next session", btns: ["Take it", "Not mine"] },
        { from: "Your AI", h: "sam", kind: "ai", text: "Two tests are flaky on main", sub: "Raised by your AI · doesn’t count in Waiting on you", btns: ["Look", "Dismiss"] }],
      lines: [{ who: "Ana", h: "ana", you: 1, t: "@You can you read the pricing copy before 6?", time: "10:12" }, { fold: "parcel-web · 14 changes by 3 people", build: 1, makers: 1 }, { fold: "Joon’s AI · 4 updates", h: "joon", makers: 1 }, { who: "Joon’s AI", h: "joon", ai: 1, kind: "done", t: "Checkout fix · before and after", time: "11:41" }, { who: "Ravi", h: "leo", t: "Release Thursday unless someone shouts.", time: "12:30" }, { fold: "Ravi’s AI · 6 updates", h: "leo", makers: 1 }],
      shared: [{ k: "repository", n: "parcel-web", c: K.repo, makers: 1 }, { k: "repository", n: "parcel-api", c: K.repo, makers: 1 }, { k: "Figma", n: "Pricing", c: K.figma }],
      notes: "<b>Doing:</b> pricing, checkout, onboarding. <b>Stuck:</b> flaky tests on main.", decided: [{ t: "Release moves to Thursday", who: "Ravi · Tue" }], last: "Checkout fix landed; pricing waits on you." }] },
  T4: { label: "Agency", groups: [
    { id: "bakery", name: "Bakery website", color: ROLE.blush,
      people: [ME(), P("Ana", "ana", { st: "work" }), P("Joon", "joon", { st: "done" }), P("Lea", "ivy", { st: "rest" }), P("Dana", "leo", { role: "approves", reach: "link", ai: null }), P("Pat", "kai", { role: "reads", reach: "link", ai: null })],
      waits: [{ from: "Dana", h: "leo", kind: "link", text: "Waiting on Dana by link · approve the homepage", sub: "Sent yesterday · opened, not answered", btns: ["Nudge", "Take it back"] }],
      lines: [{ who: "Dana", h: "leo", link: 1, t: "Love the colours. Can the menu be bigger on phones?", time: "Mon" }, { fold: "Ana’s AI · 5 updates", h: "ana", makers: 1 }, { fold: "bakery-site · 9 changes by 2 people", build: 1, makers: 1 }, { who: "Ana’s AI", h: "ana", ai: 1, kind: "done", t: "Homepage v2 · phone and desktop", time: "Tue" }],
      shared: [{ k: "repository", n: "bakery-site", c: K.repo, makers: 1 }, { k: "Doc", n: "Menu and prices", c: K.doc }],
      notes: "<b>Doing:</b> homepage v2. <b>Waiting:</b> Dana’s yes. <b>Stuck:</b> photos of the cakes.", decided: [{ t: "Launch after Dana approves the homepage", who: "Ana · Mon" }], last: "Homepage v2 is with Dana." }] },
  T4c: { label: "Agency, client side", viewer: { role: "approves", ai: null }, groups: [
    { id: "bakery", name: "Bakery website", color: ROLE.blush,
      people: [P("You", "sam", { me: true, role: "approves", ai: null }), P("Ana", "ana", { st: "work" }), P("Joon", "joon", { st: "done" }), P("Lea", "ivy"), P("Pat", "kai", { role: "reads", reach: "link", ai: null })],
      waits: [{ from: "Ana", h: "ana", kind: "approve", text: "Approve the homepage?", sub: "Phone and desktop · 2 pages to look at", btns: ["Approve", "Ask for changes"] }],
      lines: [{ who: "You", h: "sam", t: "Love the colours. Can the menu be bigger on phones?", time: "Mon" }, { fold: "Ana’s AI · 5 updates", h: "ana", makers: 1 }, { fold: "bakery-site · 9 changes", build: 1, makers: 1 }, { who: "Ana", h: "ana", kind: "done", t: "Homepage v2 · phone and desktop", time: "Tue" }],
      shared: [{ k: "repository", n: "bakery-site", c: K.repo, makers: 1 }, { k: "Doc", n: "Menu and prices", c: K.doc }],
      notes: "(makers only)", decided: [{ t: "Launch after you approve the homepage", who: "Ana · Mon" }], last: "Homepage v2 waits for your yes." }] },
  T5: { label: "Open project", groups: [
    { id: "openmaps", name: "openmaps", color: ROLE.haze,
      people: [ME(), P("Ana", "ana", { st: "work" }), P("Joon", "joon", { st: "done" }), P("Ravi", "leo", { st: "work" }), ...crowd(36)],
      waits: [{ from: "Ana", h: "ana", kind: "ask", text: "Review the tile cache change?", sub: "You hold the cache · 2 days old", btns: ["On it", "Later", "Not mine"] },
        { from: "Mia", h: "maya", kind: "join", text: "Mia joined with the code and reads for now", sub: "Let her make?", btns: ["Make", "Read", "Remove"] },
        { from: "Joon", h: "joon", kind: "hand", text: "Joon handed you: the release notes", sub: "Opens at the top of your next session", btns: ["Take it", "Not mine"] },
        { more: 4 }],
      faces: 1,
      lines: [{ who: "Ana", h: "ana", you: 1, t: "@You the cache change is ready, it touches your part.", time: "09:02" }, { fold: "openmaps · 31 changes by 9 people", build: 1, makers: 1 }, { fold: "12 new public issues · bring one to the group", build: 1, makers: 1 }, { fold: "14 lines from 9 people", people: 1 }, { who: "Ravi", h: "leo", kind: "decided", t: "Drop the old tile format in 3.0", time: "Tue" }],
      shared: [{ k: "repository", n: "openmaps", c: K.repo, makers: 1 }, { k: "page", n: "Contributor guide", c: K.page }],
      notes: "<b>Doing:</b> 3.0, tile cache. <b>Stuck:</b> nobody owns Windows builds.", decided: [{ t: "Drop the old tile format in 3.0", who: "Ravi · Tue" }], last: "31 changes today; the cache waits on you." }] },
  T6: { label: "Club", groups: [
    { id: "fair", name: "Spring fair", color: ROLE.lime,
      people: [ME({ ai: null, st: "rest" }), P("Leo", "leo", { ai: null }), P("Ivy", "ivy", { reach: "link", ai: null }), P("Kai", "kai", { reach: "link", ai: null }), P("Noor", "maya", { reach: "link", ai: null }), P("Ana", "ana", { reach: "link", ai: null }), P("Bo", "g1", { reach: "link", ai: null }), P("Tess", "g2", { reach: "link", ai: null })],
      main: { k: "Calendar", n: "Fair calendar", s: "Next: setup, Saturday · 4 dates this month", c: K.cal },
      waits: [{ from: "Leo", h: "leo", kind: "ask", text: "Setup crew: which slot can you do?", sub: "By Thursday", btns: ["Sat 6 pm", "Sun 2 pm", "Neither"] }],
      lines: [{ who: "Leo", h: "leo", t: "Stall list is in the doc. Pick a slot by Thursday please!", time: "Mon" }, { who: "Ivy", h: "ivy", link: 1, t: "I’ll bring the tables.", time: "Tue" }, { who: "Noor", h: "maya", link: 1, t: "Can we have a cake stall?", time: "Tue" }, { kind: "decided", t: "The fair is on 12 April, in the park", who: "Leo · Sun" }],
      shared: [{ k: "Doc", n: "Stall list", c: K.doc }], decided: [{ t: "The fair is on 12 April, in the park", who: "Leo · Sun" }], last: "Slots close Thursday." }] },
  T7: { label: "Many groups", many: 1, groups: [] },
  T8: { label: "Mixed AIs", groups: [
    { id: "thesis", name: "Thesis lab", color: ROLE.teal,
      people: [ME(), P("Ana", "ana", { st: "work", ai: "Codex" }), P("Joon", "joon", { st: "done", ai: "home computer" }), P("Ivy", "ivy", { ai: null }), P("Ravi", "leo", { st: "unk", ai: "Claude" })],
      waits: [{ from: "Ivy", h: "ivy", kind: "ask", text: "Can your AI rerun my figures with the new data?", sub: "She has no AI · asks you", btns: ["Yes", "Not now", "Open"] }],
      lines: [{ who: "Ivy", h: "ivy", t: "New data is in the sheet. I have no AI, can someone run the figures?", time: "Tue" }, { fold: "Ana’s AI (Codex) · 3 updates", h: "ana", makers: 1 }, { who: "Joon’s AI", h: "joon", ai: 1, kind: "done", t: "Chapter 2 references, cleaned", time: "Wed" }, { fold: "Ravi’s AI hasn’t checked in since Monday", h: "leo", makers: 1 }],
      shared: [{ k: "Sheet", n: "Data", c: K.sheet }, { k: "Doc", n: "Thesis draft", c: K.doc }],
      notes: "<b>Doing:</b> chapter 2, the figures. <b>Stuck:</b> Ravi’s AI is silent.", decided: [{ t: "Figures in one style, from the sheet", who: "Ana · Mon" }], last: "Ivy asked for the figures." }],
    first: { opts: [["This Mac", "Claude · on now"], ["Home computer", "Claude · always on"], ["Another AI", "Codex, or one you name"], ["No AI for now", "You take part yourself"]] } },
};
// T7: the many-groups person: nine groups of every kind, four quiet
{
  const g = (k: string): Group => JSON.parse(JSON.stringify(COWORK[k].groups[0]));
  const t3 = g("T3"), t2 = g("T2"), t6 = g("T6"), t1 = g("T1"), t5 = g("T5");
  t5.waits = t5.waits.slice(0, 1); t6.waits = []; t1.waits = [];
  const quiet = (name: string, color: string): Group => ({ id: name.toLowerCase().replace(/ /g, "-"), name, color, people: [ME({ st: "rest" }), P("Ana", "ana"), P("Bo", "g1")], waits: [], lines: [], quiet: 1, last: "Nothing since September" });
  COWORK.T7.groups = [t3, t2, t5, t6, t1, quiet("Robotics club", ROLE.haze), quiet("Family trip", ROLE.amber), quiet("Old startup", ROLE.stone), quiet("Summer job", ROLE.rose)];
  COWORK.T7.remembered = 1;
}

const F = (n: string, h: string, o: Partial<Friend> = {}): Friend => ({ n, h, close: 0, pres: "here", line: "", theirs: { fb: 1, pr: 1, wo: 1, ar: 1 }, ...o });
export const SH: Record<string, string> = { fb: "free/busy", pr: "profile", wo: "working on", ar: "when you’re around" };
export const CLOSE_SH: Record<string, string> = { cal: "Full calendar, with names", proj: "Current projects", loc: "Location" };
const NAMES = ["Ade", "Bo", "Cyr", "Dee", "Ezra", "Fen", "Gil", "Hana", "Ines", "Jo", "Kofi", "Lars", "Mo", "Nia", "Oli", "Pia", "Quin", "Rae", "Tess", "Uma", "Vic", "Wen", "Xia", "Yuri", "Zoe", "Abe", "Bea", "Cal", "Dov", "Eve", "Fay", "Gus", "Hal", "Ida", "Jon", "Kim", "Lou", "Max", "Ned", "Ona"];
const many = (k: number, seed = 0, o: Partial<Friend> = {}) => Array.from({ length: k }, (_, i) => F(NAMES[(i + seed) % 40] + ((i + seed) >= 40 ? " " + String.fromCharCode(65 + ((i + seed) % 26)) + "." : ""), "g" + ((i + seed) % 6),
  { pres: ["here", "away", "gone", "gone"][(i + seed) % 4], line: ["", "studying for finals", "a pixel game", "—", "the thesis"][(i + seed) % 5], ...o }));
const ALL = { fb: 1, pr: 1, wo: 1, ar: 1 };
export const SOCIAL: Record<string, Circle> = {
  F0: { label: "Nobody yet", me: { line: "", level: 0 }, shares: { ...ALL }, friends: [], inbox: [], fav: { n: 3, from: "close friends", used: 0 }, first: 1 },
  F1: { label: "One friend", me: { line: "a recipe app", level: 1 }, shares: { ...ALL },
    friends: [F("Maya", "maya", { line: "the bio lab report", since: "today", via: "her link" })],
    inbox: [{ k: "invite", from: "Maya", h: "maya", title: "Coffee Saturday, 11:00, Blue Door", free: "Saturday 11:00" }],
    fav: { n: 3, from: "close friends", used: 0 } },
  F2: { label: "Five", me: { line: "a recipe app, the login page", level: 7, badges: ["First build", "Helper"] }, shares: { ...ALL },
    friends: [F("Maya", "maya", { close: 1, line: "the bio lab report", since: "March", mine: { cal: 1 } }), F("Leo", "leo", { close: 1, pres: "away", line: "interview prep", since: "January" }), F("Ana", "ana", { line: "pricing page", since: "May" }), F("Joon", "joon", { pres: "gone", theirs: { fb: 1, pr: 1, wo: 0, ar: 1 }, since: "May" }), F("Kai", "kai", { pres: null, theirs: { fb: 0, pr: 1, wo: 0, ar: 0 }, since: "June" })],
    inbox: [{ k: "help", from: "Leo", h: "leo", close: 1, title: "Fix the layout of my resume: the two columns break on page 2.", need: "Monday", size: "about 20 minutes", file: "resume.docx" },
      { k: "invite", from: "Maya", h: "maya", close: 1, title: "Dinner Thursday, 7:30, The Grotto", free: "Thursday 7:30: free" },
      { k: "beyond", from: "Leo", h: "leo", close: 1, title: "See where you are, to meet you after class", what: "location" },
      { k: "request", from: "Ivy", h: "ivy", src: "from Bio lab group", known: 1 }],
    fav: { n: 3, from: "close friends", used: 1 } },
  F3: { label: "Eighty", me: { line: "the climbing app", level: 12, badges: ["Helper", "Night owl", "10 builds"] }, shares: { ...ALL },
    friends: [F("Maya", "maya", { close: 1, line: "the bio lab report" }), F("Leo", "leo", { close: 1, pres: "away", line: "interview prep" }), F("Ana", "ana", { close: 1, line: "pricing page" }), F("Joon", "joon", { close: 1, pres: "gone" }), F("Ivy", "ivy", { close: 1, line: "a comic" }), F("Kai", "kai", { close: 1, pres: "away" }), ...many(33, 0, {}), ...many(3, 33, { isnew: 1 }), ...many(38, 5, { quiet: 1, pres: "gone" })],
    inbox: [
      ...["Leo", "Ana", "Bo", "Cyr", "Dee", "Ezra", "Fen", "Gil", "Hana"].map((n, i): Inbox => ({ k: "help", from: n, h: ["leo", "ana", "g1", "g2", "g3", "g4", "g5", "g0", "g1"][i], close: i < 2, title: ["Fix the layout of my resume", "Check my pricing copy", "Translate my poster", "Debug my spreadsheet formula", "Summarise a paper", "Name my band", "Clean my bibliography", "Tidy my slides", "Make my CV one page"][i], need: i === 0 ? "Monday" : i === 3 ? "next week" : null, size: "about 20 minutes" })),
      ...["Maya", "Ivy", "Bo", "Uma"].map((n, i): Inbox => ({ k: "invite", from: n, h: ["maya", "ivy", "g1", "g4"][i], close: i < 2, title: ["Dinner Thursday 7:30", "Study group Thursday 7:00", "Climbing Saturday", "Film night Friday"][i], free: i < 2 ? "Thursday evening" : "free", clash: i < 2 })),
      ...["Leo", "Leo", "Leo", "Leo", "Kofi"].map((n, i): Inbox => ({ k: "beyond", from: n, h: i < 4 ? "leo" : "g2", title: "See where you are", what: "location" })),
      ...Array.from({ length: 12 }, (_, i): Inbox => ({ k: "request", from: ["Nia", "Oli", "Pia", "Quin", "Rae", "Tess", "Vic", "Wen", "Xia", "Yuri", "Zoe", "Abe"][i], h: "g" + (i % 6), src: i < 7 ? "friend of Ana" : "from your link “Climbing”", known: i >= 7 }))],
    fav: { n: 3, from: "close friends", used: 3 } },
  F4: { label: "Also teammates", me: { line: "pricing page review", level: 5 }, shares: { ...ALL },
    friends: [F("Ana", "ana", { close: 1, line: "pricing page", team: "Parcel", teamRole: "maker" }), F("Joon", "joon", { line: "checkout", team: "Parcel", teamRole: "maker", pres: "away" }), F("Maya", "maya", { close: 1, line: "the bio lab report", team: "Bio lab report", teamRole: "maker" }), F("Leo", "leo", { pres: "gone" }), F("Ivy", "ivy")],
    inbox: [{ k: "help", from: "Ana", h: "ana", close: 1, title: "Look over my slides for Friday’s demo", size: "about 15 minutes", src: "friend and teammate" },
      { k: "invite", from: "Maya", h: "maya", close: 1, title: "Dinner Thursday 7:00", free: "Thursday 7:00", clashWith: "Parcel: release check-in 7:00" }],
    fav: { n: 3, from: "close friends", used: 0 } },
  F5: { label: "A maker", me: { line: "Night look v3", level: 21, badges: ["Top 10 builds", "Helper", "Challenge winner"] }, shares: { ...ALL },
    published: [{ n: "Night look", k: "look", inst: 312, rep: 7 }, { n: "Focus preset", k: "preset", inst: 88, rep: 0 }, { n: "Three panes", k: "arrangement", inst: 41, rep: 1 }],
    friends: [F("Maya", "maya", { close: 1 }), F("Leo", "leo", { pres: "away" }), F("Ana", "ana"), F("Joon", "joon", { pres: "gone" }), F("Ivy", "ivy"), F("Kai", "kai", { pres: "gone" }), F("Bo", "g1"), F("Cyr", "g2", { pres: "away" })],
    inbox: [{ k: "request", from: "Dee", h: "g3", src: "installed your build “Night look”" }, { k: "request", from: "Ezra", h: "g4", src: "installed your build “Night look”" }, { k: "request", from: "Fen", h: "g5", src: "installed your build “Focus preset”" }, { k: "request", from: "Gil", h: "g0", src: "name typed, no one in common" },
      { k: "help", from: "Maya", h: "maya", close: 1, title: "Can you make my look work in dark mode?", size: "about 30 minutes" }],
    reports: { n: 8, on: "Night look" }, fav: { n: 3, from: "close friends", used: 1 } },
  F6: { label: "Private", me: { line: "a song", level: 3 }, shares: { fb: 0, pr: 0, wo: 0, ar: 0 },
    friends: [F("Maya", "maya", { close: 1 }), F("Leo", "leo", { pres: "away" }), F("Ana", "ana"), F("Joon", "joon", { pres: "gone" })],
    inbox: [{ k: "beyond", from: "Leo", h: "leo", title: "See when you’re free", what: "free/busy" }, { k: "beyond", from: "Maya", h: "maya", title: "See when you’re free", what: "free/busy" }, { k: "beyond", from: "Ana", h: "ana", title: "See what you’re working on", what: "working on" }],
    fav: { n: 0, from: "nobody", used: 0 } },
  F7: { label: "No app yet", me: { line: "a birthday video", level: 2 }, shares: { ...ALL },
    friends: [F("Maya", "maya", { close: 1, line: "the bio lab report" }), F("Leo", "leo", { pres: "away", line: "interview prep" }), F("Dad", "g5", { waiting: "link “Dad” · sent yesterday · not opened", pres: null })],
    inbox: [], fav: { n: 3, from: "close friends", used: 0 }, showLink: 1 },
  F8: { label: "A class in a day", me: { line: "the bio lab report", level: 4 }, shares: { ...ALL },
    links: [{ name: "Bio class", joined: 24, of: 30, days: 6 }],
    friends: [F("Maya", "maya", { close: 1 }), F("Leo", "leo"), ...many(24, 10, { isnew: 1, via: "Bio class" })],
    inbox: [...["Ines", "Jo", "Kofi", "Lars", "Mo", "Nia"].map((n, i): Inbox => ({ k: "request", from: n, h: "g" + i, src: "from Bio lab group", known: 1 })),
      ...["Jo", "Lars", "Nia"].map((n, i): Inbox => ({ k: "help", from: n, h: "g" + (i + 1), title: ["Check my lab table", "Proofread my method", "Explain question 4"][i], need: i === 0 ? "Friday" : null, size: "about 10 minutes" }))],
    fav: { n: 3, from: "any friend", used: 2 } },
};
export const KIND: Record<string, [string, string]> = { help: ["help ask", "help asks"], invite: ["invite", "invites"], beyond: ["ask for more than you share", "asks for more than you share"], request: ["friend request", "friend requests"] };

/** P4: each person's own setups (panel.md). Anyone else: the small company and eighty friends */
export const DEFAULTS: Record<string, { s: string; f: string }> = { Dev: { s: "T5", f: "F2" }, Jayden: { s: "T2", f: "F8" }, Denise: { s: "T4c", f: "F7" }, "Min-ji": { s: "T4", f: "F5" }, P1: { s: "T8", f: "F6" }, Sam: { s: "T1", f: "F0" } };
export const FALLBACK = { s: "T3", f: "F3" };
/** S1's six faces: the person's own first */
export const FACES = ["me", "ana", "joon", "maya", "leo", "ivy"];
/** presence, as roles: here, away, gone */
export const PRES: Record<string, string> = { here: ROLE.mint, away: ROLE.amber, gone: ROLE.stone };
