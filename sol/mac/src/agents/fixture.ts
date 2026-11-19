// Agents mode (#1327) without an engine: invented homes of different shapes and a small engine in memory that answers
// the agents.* wire the way sol/engine/src/parts/agents.ts does, so agents.html (the dev page) and the stills can be
// pressed through every screen of the flow: Home's peek, the offer, the floor, a desk, a fix, a said change, an empty
// home. The people are invented and nothing here is anyone's real data: a baker with a shop
// and two market stalls, a nurse on shifts (her wards are a rota's items), a freelance translator with clients, a parent
// of two (the children are a school's items, the clubs are folders), a student (made-up course codes) and an empty home.
import type { AgentRow, Asks, Blocked, Change, Day, DeskRead, JoinRow, Line, List, Mode, More, Offer, PlaceRow, RuleRow, ShelfWire, SiteRow, Trust, Waits, Work } from "./model";
import { postureOf } from "./model.ts";
import { HEAD, serialize } from "../home/folders/stickies.ts";

/** where the invented home lives on its invented disk: a place's folder is `${HOME_DIR}/${place}` */
export const HOME_DIR = "/home/you/sol-home";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
/** a due line as the engine keeps it (agent/stickies.ts, Today #1487): d days from now's day, at h:00 */
const dueAt = (now: number, d: number, h: number, m = 0) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return `due: ${dayKey(x.getTime())} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
/** an "asked" line as a press writes it (home/folders/stickies.ts stamp), `min` minutes before now */
const askedAgo = (now: number, min: number) => { const d = new Date(now - min * 60_000); return `asked ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toTimeString().slice(0, 5)}`; };
/** what the invented runs made, as work.read answers a made/ file (What was made, #1490) */
const MADE_FILES: Record<string, string> = {
  "ana-week.md": "# Ana's week\n\nWed · PE · trainers in the bag\nThu · library books back\nFri · cake sale · $2 in an envelope\n\nForms set aside for you: the trip form (sign it), the photo order.\n",
  "board-picks.md": "# A chess board for home\n\n1. Folding wooden board, weighted pieces · $34 · the club's size\n2. Roll-up vinyl board + plastic pieces · $18 · what the club uses\n3. Magnetic travel set · $22\n\nThe club says a standard 2.25\" king is what they play on.\n",
  // the trust gate (#1497): a draft (it reaches someone) and an ask (money), made ready and not done
  "teacher-reply.md": "To: Ben's class teacher\nSubject: Re: the trip on Thursday\n\nHello,\n\nThank you for the note. Ben will be there at 8:15 with a packed lunch and his coat. The signed form is in his bag.\n\nBest wishes\n",
  "membership.md": "# Chess club membership, the year from December\n\n$45 by card on the club's page (Members › Renew)\nThe form is filled: Ben, under 12s, Thursday group.\n\nStopped before paying: it waits for your yes.\n",
};
/** how far a press goes, as the engine reads it from the words (agent/meta/when.ts reachOfAsk), near enough for the page */
const reachOf = (t: string) => (/\b(pay|fees?|renew|submit|delete|cancel)\b|[$£€]\s?\d/i.test(t) ? "asks" : /\b(reply|send|e-?mail|tell|book|invite|post)\b/i.test(t) ? "drafts" : "does");
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function week(now: number, runs: number[], made: number[], blocked: number[]): Day[] {
  return runs.map((r, i) => ({ day: dayKey(now - (6 - i) * DAY), runs: r, made: made[i] ?? 0, blocked: blocked[i] ?? 0 }));
}
const line = (at: number, rule: string, read: string, made: string, held = ""): Line => ({ at, rule, read, made, held });
const rule = (folder: string, id: string, source: string, sentence: string, mode: Mode, c: [number, number, number, number], extra: Partial<RuleRow> = {}): RuleRow =>
  ({ folder, rule: id, source, sentence, mode, runs: c[0], made: c[1], blocked: c[2], nothing: c[3], ...extra });
const flat = (now: number, n: number) => week(now, Array(7).fill(n), [], []);
/** a clock time ahead: tomorrow at `h` (today + 24 + h hours from midnight) */
const tomorrowAt = (now: number, h: number) => iso(new Date(new Date(now).setHours(24 + h, 0, 0, 0)).getTime());
const own = (place: string, name: string, folder: string, ruleId: string, trust: Trust): PlaceRow => ({ place, name, folder, rule: ruleId, trust, trigger: { kind: "own" } });
const dated = (place: string, name: string, folder: string, ruleId: string, trust: Trust, leadDays: number, extra: Partial<PlaceRow> = {}): PlaceRow =>
  ({ place, name, folder, rule: ruleId, trust, trigger: { kind: "date", leadDays, hour: 9, learned: "place" }, ...extra });

export type Who = "baker" | "nurse" | "translator" | "parent" | "student" | "empty" | "many";
/** the homes the dev page and the tests can open (?who=…); the first is the default. `many`: every home's agents in one
 *  (past seven, the floor's shelves) */
export const HOMES: Who[] = ["baker", "nurse", "translator", "parent", "student", "empty", "many"];

/** a sticky as Home draws it (home/folders/stickies.ts Made): done, its title, what it asks, its notes */
export type Sticky = { done: boolean; t: string; s: string; notes: string[] };
/** one invented home: what agents.list, agents.offers and agents.desk answer, and each place's stickies for Home */
export type Fixture = { list: List; offers: Offer[]; desks: Record<string, DeskRead>; stickies: Record<string, { name: string; items: Sticky[] }> };
const st = (t: string, ...notes: string[]): Sticky => ({ done: notes.some((n) => n.startsWith("did:")), t, s: "", notes });

// ---- the engine's asks and shelves, in memory (sol/engine/src/agent/meta/asks.ts is the real one; the face only draws them)
const QUEUED = 3, CAST = 7;
/** what needs the person, as agents.list sends it: the blocked asks ranked (a sign-in once for every site, each join, each
 *  agent's fix), the first in front, three under "Then", the rest counted; work waiting in Home apart */
export function asksFor(l: Pick<List, "agents" | "folderRules" | "joins">, now: number, regroup?: { before: number; after: number } | null): Asks {
  const blocked: Blocked[] = [];
  const rows = new Map<string, SiteRow & { since: number; next?: number; who: Set<string> }>();
  const add = (s: { site: string; folder: string; rule: string; since: number; next?: number }, who: string) => {
    const r = rows.get(s.site) ?? { site: s.site, folder: s.folder, rule: s.rule, frees: [], since: s.since, who: new Set<string>() };
    if (!r.frees.includes(who)) r.frees.push(who);
    r.who.add(who); r.since = Math.min(r.since, s.since);
    if (s.next && (!r.next || s.next < r.next)) r.next = s.next;
    rows.set(s.site, r);
  };
  for (const a of l.agents) for (const s of a.stucks ?? []) add(s, a.name);
  for (const r of l.folderRules) if (r.stuck) add(r.stuck, r.name ?? r.folder);
  if (rows.size) {
    const sites = [...rows.values()];
    const freed = new Set(sites.flatMap((s) => [...s.who])).size;
    const due = sites.some((s) => s.next !== undefined && s.next - now <= DAY);
    const age = (now - Math.min(...sites.map((s) => s.since))) / DAY;
    blocked.push({ need: "blocked", kind: "signin", id: "signin", title: sites.length === 1 ? `Sign in to ${sites[0].site}` : `Sign in to ${sites.length} sites`,
      sites: sites.map(({ site, folder, rule, frees }) => ({ site, folder, rule, frees })), freed, score: freed * 2 + (due ? 3 : 0) + Math.max(0, Math.floor(age)) });
  }
  if (regroup) blocked.push({ need: "blocked", kind: "regroup", id: "regroup", title: `Sol groups agents better now: ${regroup.before} → ${regroup.after}`, ...regroup, freed: 0, score: 0 });
  for (const j of l.joins ?? []) blocked.push({ need: "blocked", kind: "join", id: j.id, title: j.inPlace ? "One agent for these two steps?" : `One agent for ${j.names[0]} and ${j.names[1]}?`, join: j.id, freed: 0, score: Math.max(0, Math.floor((now - (Date.parse(j.at) || now)) / DAY)), ...(j.inPlace ? { where: j.names[0] } : {}) });
  for (const a of l.agents) if ((a.asks ?? []).length) blocked.push({ need: "blocked", kind: "fix", id: `fix-${a.id}`, title: `${a.name}: always like this?`, agent: a.id, freed: 0, score: 0 });
  const KIND = { signin: 0, regroup: 1, join: 2, fix: 3 } as const;
  blocked.sort((p, q) => q.score - p.score || KIND[p.kind] - KIND[q.kind]);
  const home: Waits[] = l.agents.filter((a) => (a.waits ?? 0) > 0).map((a) => ({ need: "waits", kind: "work", id: `w-${a.id}`, title: a.needs?.title ?? a.name, folder: a.rules[0]?.folder ?? "", rule: a.rules[0]?.rule ?? "", agent: a.id }));
  return { front: blocked[0] ?? null, then: blocked.slice(1, 1 + QUEUED), more: Math.max(0, blocked.length - 1 - QUEUED), need: blocked.length, all: [...blocked, ...home], home };
}
/** past seven agents, shelves by place; a shelf with a blocked agent opens by itself, its blocked ones first, at most
 *  seven cards standing; null at seven or fewer */
export function shelvesFor(agents: AgentRow[]): ShelfWire[] | null {
  if (agents.length <= CAST) return null;
  return [...new Set(agents.map((a) => a.part || "Other"))].map((part) => {
    const xs = agents.filter((a) => (a.part || "Other") === part);
    const stuck = xs.filter((a) => postureOf(a) === "blocked");
    const first = [...stuck, ...xs.filter((a) => postureOf(a) !== "blocked")];
    return { part, agents: first.map((a) => a.id), blocked: stuck.length, open: stuck.length > 0, shown: Math.min(first.length, Math.max(CAST, stuck.length)) };
  });
}

/** the fixture of one invented home, at `now`, with what the engine sends since the calm pass (a role, its steps as times
 *  of day, its work waiting in Home, the sites it stopped at, each change's cause, met, the asks, the shelves). `o.meet`: the
 *  first open, before the first visit (no met; the sign-in pauses are the intro, one undo). `o.steps`: two steps of one
 *  place asked about (an in-place join, "One agent for these two steps?") as a home with no Jev gets it from the
 *  person's own model, with the floor's one line about Jev */
export function fixtureOf(now = Date.now(), who: Who = "baker", o: { meet?: boolean; steps?: boolean; shelf?: boolean } = {}): Fixture {
  const fx = built(now, who, o);
  if (o.steps) withSteps(fx.list, now);
  // one shelf past seven: a blocked agent and ten others on one place's shelf; its blocked one stands first, seven, N more
  if (o.shelf) {
    const xs = fx.list.agents, b = xs.find((a) => postureOf(a) === "blocked");
    if (b) for (const a of [...xs.filter((a) => postureOf(a) !== "blocked").slice(0, 10), b]) a.part = b.part;
  }
  fx.list.asks = asksFor(fx.list, now);
  fx.list.shelves = shelvesFor(fx.list.agents);
  return fx;
}

/** the one line the engine says once when the person's own model asked in Jev's place (agents.ts JEV_NOTE) */
export const JEV_NOTE = "Your own model asked these. With Jev, Sol would ask you fewer: put its key in ~/.config/sol/jev.env as JEV_API_KEY.";
/** an in-place join on a home (pure on its list): its first agent's first place gets a routine beside it, a step that
 *  may use what the agent makes, asked as the engine asks it with no Jev (no score) */
function withSteps(l: List, now: number) {
  // a step that plainly uses what the agent makes: its invoices, chased when unpaid (else any one-place agent)
  const one = l.agents.filter((x) => (x.places?.length ?? 0) === 1);
  const a = one.find((x) => /invoice/i.test(x.rules[0]?.sentence ?? "")) ?? one[0] ?? l.agents[0];
  if (!a?.places?.length) return;
  const p = a.places[0], name = p.name;
  const sentence = "on the 5th at 09:00 a polite reminder for each invoice not yet paid";
  l.folderRules = [...l.folderRules, { folder: p.folder, name, rule: "clock-9", sentence, mode: "watch", source: "clock" }];
  l.joins = [{ id: "j-steps", inPlace: true, places: [p.place, p.place], names: [name, name], p: null, at: iso(now - DAY),
    steps: [[a.rules[0].sentence], [sentence]], agents: [{ id: a.id, name: a.name, turn: a.turn }, { id: "", name: "Polite reminder", turn: 0 }] }, ...(l.joins ?? [])];
  l.jevNote = JEV_NOTE;
}

/** the translator's Friday update: three steps both clients share, and one that only one client has (the desk's "X only") */
function fridaySteps(a: AgentRow): NonNullable<AgentRow["steps"]> {
  const [harbor, linden] = a.rules;
  const both = (when: string, at: number, what: string) => [harbor, linden].map((r) => ({ when, at, what, folder: r.folder, rule: r.rule }));
  return [
    ...both("Friday 15:00", 900, "Add up the week's hours"),
    ...both("Friday 16:00", 960, "Write the update from the hours and files"),
    { when: "Friday 16:10", at: 970, what: "Attach the glossary changes", folder: harbor.folder, rule: harbor.rule },
    ...both("Friday 16:20", 980, "Leave it as a draft for you to send"),
  ];
}

function built(now: number, who: Who, o: { meet?: boolean }): Fixture {
  if (who === "many") {
    const parts = (["baker", "nurse", "translator", "parent"] as const).map((w) => built(now, w, o));
    const agents = parts.flatMap((p, k) => p.list.agents.map((a) => ({ ...a, id: `${k}-${a.id}` })));
    // a change keeps naming its agent under the agent's new id (what Sol changed names it)
    const changes = parts.flatMap((p, k) => p.list.changes.map((c) => (c.agent ? { ...c, agent: `${k}-${c.agent}` } : c)));
    return { ...parts[0], list: { ...parts[0].list, agents, joins: [], changes } };
  }
  const fx = rawOf(now, who);
  const l = fx.list;
  const words = (s: string, n: number) => { const w = s.split(/\s+/).filter(Boolean); return w.length > n ? `${w.slice(0, n).join(" ")}…` : s; };
  for (const a of l.agents) {
    a.role = words(a.job.charAt(0).toUpperCase() + a.job.slice(1), 12);
    a.steps = a.rules.map((r) => {
      const t = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(r.sentence);
      // a step every hour between two times reads as the engine's day.ts says it: "every hour 07–19"
      const h = /^every hour from ([01]\d|2[0-3]):00 to ([01]\d|2[0-3]):00\s*/i.exec(r.sentence);
      if (h) { const w = r.sentence.slice(h[0].length); return { when: `every hour ${h[1]}–${h[2]}`, at: Number(h[1]) * 60, what: words(w.charAt(0).toUpperCase() + w.slice(1), 10), folder: r.folder, rule: r.rule }; }
      const what = r.sentence.replace(/^(every\s+\w+(\s+at)?|\w+day)?\s*(at\s+)?([01]\d|2[0-3]):[0-5]\d\s*/i, "").replace(/^every \d+ hours\s*/i, "");
      return { when: t ? t[0] : r.source === "mail" ? "when mail comes" : "as it comes", at: t ? Number(t[1]) * 60 + Number(t[2]) : null, what: words(what, 10), folder: r.folder, rule: r.rule };
    }).sort((x, y) => (x.at ?? 1e9) - (y.at ?? 1e9));
    if (a.id === "friday-update") a.steps = fridaySteps(a);
    a.waits = a.state === "needs" ? 1 : 0;
    a.stucks = a.stuck ? [{ site: a.stuck.label.replace(/^sign in to /, ""), folder: a.rules[0].folder, rule: a.rules[0].rule, since: now - 2 * DAY, next: now + 3_600_000 }] : [];
  }
  for (const c of l.changes) { if (c.kind === "held") c.cause = "sign-in"; else if (c.kind === "rested") c.cause = "idle"; }
  for (const r of l.folderRules) r.name ??= r.folder.charAt(0).toUpperCase() + r.folder.slice(1);
  if (o.meet) {
    const ids = l.changes.filter((c) => c.cause === "sign-in").map((c) => c.id);
    if (ids.length) l.intro = { ids, agents: new Set(l.changes.filter((c) => ids.includes(c.id)).map((c) => c.agent)).size, sites: [...new Set(l.agents.flatMap((a) => (a.stucks ?? []).map((s) => s.site)))] };
  } else l.met = iso(now - 3 * DAY);
  return fx;
}

function rawOf(now: number, who: Who): Fixture {
  const h = (n: number) => now - n * 3_600_000;
  const at = (daysAgo: number) => iso(now - daysAgo * DAY);
  if (who === "empty") return { list: { ok: true, agents: [], folderRules: [], changes: [], offers: 0 }, offers: [], desks: {}, stickies: {} };

  if (who === "nurse") {
    const agents: AgentRow[] = [
      { id: "shift-swaps", name: "Shift swaps", job: "watches the ward roster for swap requests that fit your week", turn: 2, part: "work",
        state: "stuck", stuck: { site: "roster", label: "sign in to the ward roster" }, reach: "drafts",
        places: [own("work", "Work", "work", "web-1", "drafts")],
        rules: [rule("work", "web-1", "web", "every 2 hours look at the roster for swap requests", "watch", [50, 0, 47, 3], { rung: "read", last: line(h(2), "web-1", "the roster asked for a sign-in", "nothing (blocked)") })],
        week: week(now, [7, 7, 7, 7, 7, 7, 8], [], [7, 6, 7, 7, 6, 7, 7]) },
      { id: "bills", name: "Bills", job: "reads the bills that arrive and asks before anything is due", turn: 4, part: "home",
        state: "needs", needs: { title: "The water bill is due Friday. Pay it?", ticketId: "t-bill-3", choices: ["I paid it", "remind me tomorrow"] }, reach: "asks",
        places: [own("home", "Home", "home", "clock-1", "asks")],
        rules: [rule("home", "clock-1", "clock", "every morning at 08:00 read new bills in bills/ and ask before one is due", "watch", [7, 2, 0, 5], { rung: "propose", last: line(h(5), "clock-1", "bills/", "a card: water bill") })],
        week: flat(now, 1) },
      { id: "sleep-plan", name: "Sleep plan", job: "plans sleep around next week's shifts", turn: 1, part: "home",
        state: "resting", next: tomorrowAt(now, 18), reach: "does",
        places: [own("home", "Home", "home", "clock-2", "does")],
        rules: [rule("home", "clock-2", "clock", "Sunday 18:00 plan the week's sleep around the shifts in shifts.md", "watch", [2, 2, 0, 0], { rung: "draft" })],
        week: week(now, [1, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 1], []) },
    ];
    const offer: Offer = {
      id: "o-rota", name: "Rota", job: "puts each new rota for a ward into your calendar and sets aside the swaps you need", parameter: "ward", kind: "ward",
      steps: ["a new rota", "read it", "your shifts into the calendar", "clashes with your plans", "swap asks set aside"],
      places: [
        { place: "work#ward-a", name: "Ward A", checked: true },
        { place: "work#ward-c", name: "Ward C", checked: true },
        { place: "work#day-unit", name: "Day Unit", checked: false, why: "no rota here yet" },
      ],
      reach: "does", count: 3,
      seen: [{ place: "work#ward-c", at: at(3), text: "Ward C rota from Dec 1 → my calendar: 14 shifts into my calendar · 1 clash" },
        { place: "work#ward-a", at: at(31), text: "Ward A rota from Nov 1 → my calendar: 15 shifts into my calendar" },
        { place: "work#ward-a", at: at(59), text: "Ward A rota from Oct 1 → my calendar: 13 shifts into my calendar · 2 swap asks set aside" }],
      on: { place: "work#ward-c", sticky: "Ward C rota from Dec 1 → my calendar" },
    };
    return {
      list: { ok: true, agents, folderRules: [], offers: 1, changes: [{ id: "c-1", at: iso(h(30)), kind: "made", agent: "", line: "Sol grouped 3 rules from 2 folders into 3 agents.", undo: null, undone: false }] },
      offers: [offer], desks: {},
      stickies: { work: { name: "Work", items: [
        st("Bring the new badge"),
        st("Ward C rota from Dec 1 → my calendar", "asked Nov 13 21:40", "did: 14 shifts into my calendar · 1 clash · read: rota · 25 min"),
        st("Ward A rota from Nov 1 → my calendar", "asked Oct 16 21:05", "did: 15 shifts into my calendar · read: rota · 20 min"),
      ] } },
    };
  }

  if (who === "translator") {
    const update: Work[] = [
      { place: "clients/harbor-press", name: "Harbor Press", folder: "clients/harbor-press", rule: "date-2", at: h(20), made: "drafts/friday-update.md",
        lines: ["Hello Lena,", "This week: 6.5 h on the catalogue, chapters 3 and 4.", "Files: catalogue-ch3.docx, catalogue-ch4.docx", "Next week: the glossary and chapter 5.", "Kind regards"] },
      { place: "clients/linden", name: "Linden Studio", folder: "clients/linden", rule: "date-1", at: h(22), made: "drafts/friday-update.md",
        lines: ["Hello Tomas,", "This week: 4 h on the museum labels, first pass.", "Files: labels-v1.xlsx", "Kind regards"] },
    ];
    // a run that keeps a markdown table: two rows filled, two the agent has not filled in yet; the run before, none
    const jobs: Work[] = [
      { place: "clients", name: "Clients", folder: "clients", rule: "mail-1", at: h(1), made: "jobs.md", file: "jobs.md",
        lines: ["Jobs", "Each new job from client mail, with its deadline.", "| job | client | words | due | state |", "|-----|--------|-------|-----|-------|",
          "| Brochure, spring | Harbor Press | 2 400 | Nov 21 | started |", "| Museum labels, second pass | Linden Studio | 900 | Nov 28 | new |", "| - | - | - | - | new |", "| - | - | - | - | new |"] },
      { place: "clients", name: "Clients", folder: "clients", rule: "mail-1", at: h(2), made: "jobs.md", file: "jobs.md",
        lines: ["Jobs", "| job | client | words | due | state |", "|-----|--------|-------|-----|-------|", "| - | - | - | - | new |"] },
    ];
    const agents: AgentRow[] = [
      { id: "friday-update", name: "Friday update", job: "writes each client a short Friday update from your hours and files", turn: 3, part: "clients",
        state: "resting", next: tomorrowAt(now, 16), reach: "drafts", parameter: "client", kinds: ["client"],
        places: [dated("clients/harbor-press", "Harbor Press", "clients/harbor-press", "date-2", "drafts", 0), dated("clients/linden", "Linden Studio", "clients/linden", "date-1", "drafts", 0)],
        learned: [], asks: [],
        rules: [rule("clients/harbor-press", "date-2", "date", "on each Friday of Harbor Press, at 16h → a short update from the week's hours and files, drafted to the client", "do", [3, 3, 0, 0], { rung: "draft", last: line(h(20), "date-2", "hours.md", "drafts/friday-update.md") }),
          rule("clients/linden", "date-1", "date", "on each Friday of Linden Studio, at 16h → a short update from the week's hours and files, drafted to the client", "do", [2, 2, 0, 0], { rung: "draft", last: line(h(22), "date-1", "hours.md", "drafts/friday-update.md") })],
        week: week(now, [0, 0, 0, 0, 2, 0, 0], [0, 0, 0, 0, 2, 0, 0], []) },
      { id: "client-mail", name: "Client mail", job: "reads client mail and files each new job with its deadline", turn: 0, part: "clients",
        state: "working", working: { ticketId: "t-mail-12", since: iso(now - 3 * 60_000) }, reach: "does",
        places: [own("clients", "Clients", "clients", "mail-1", "does")],
        rules: [rule("clients", "mail-1", "mail", "every hour from 09:00 to 18:00 read client mail and file new jobs in jobs.md", "do", [70, 22, 0, 48], { rung: "draft", last: line(h(1), "mail-1", "client mail, 2 new", "jobs.md") })],
        week: flat(now, 10) },
      { id: "invoices", name: "Invoices", job: "drafts an invoice for each finished job; you send", turn: 2, part: "admin",
        state: "needs", needs: { title: "The invoice for the brochure job is drafted. Send it?", ticketId: "t-inv-31", choices: ["Send it", "change it"], wouldHave: true }, reach: "asks",
        places: [own("admin", "Admin", "admin", "clock-1", "asks")],
        rules: [rule("admin", "clock-1", "clock", "Friday 16:00 an invoice in invoices/ for each job marked done", "watch", [2, 2, 0, 0], { rung: "draft" })],
        week: week(now, [0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 1, 0, 0, 0], []) },
      { id: "tax-papers", name: "Tax papers", job: "gathers receipts for the quarter's tax return", turn: 5, part: "admin",
        state: "off", reach: "does", places: [own("admin", "Admin", "admin", "clock-2", "does")],
        rules: [rule("admin", "clock-2", "clock", "on the 1st at 09:00 gather the month's receipts into tax/", "off", [3, 3, 0, 0], { rung: "read" })],
        week: flat(now, 0) },
    ];
    const more: More[] = [{ place: "clients/osprey", name: "Osprey Books", why: "nothing logged here in a month" }, { place: "clients/quill", name: "Quill & Co" }];
    return {
      list: { ok: true, agents, offers: 0, folderRules: [{ folder: "clients", rule: "folder-1", sentence: "when a file lands in inbox/, file it by client", mode: "watch", source: "folder" }],
        changes: [{ id: "c-2", at: iso(h(70)), kind: "kept", agent: "friday-update", line: "Friday update kept, in Harbor Press and Linden Studio.", undo: null, undone: false }] },
      offers: [], desks: { "friday-update": { work: update, more }, "client-mail": { work: jobs, more: [] } },
      stickies: {},
    };
  }

  if (who === "parent") {
    const agents: AgentRow[] = [
      { id: "lunch", name: "Lunch money", job: "keeps the school lunch accounts topped up", turn: 4, part: "kids",
        state: "needs", needs: { title: "Ben's lunch account is at $4.", ticketId: "t-lunch-2", choices: ["Top up $30", "Not now"] }, reach: "asks", parameter: "child", kinds: ["child"],
        places: [dated("kids#ana", "Ana", "kids", "date-1", "asks", 0), dated("kids#ben", "Ben", "kids", "date-2", "asks", 0)],
        rules: [rule("kids", "date-1", "date", "each school morning, at 7h → Ana's lunch balance; under $5, ask to top up", "do", [9, 1, 0, 8], { rung: "propose" }),
          rule("kids", "date-2", "date", "each school morning, at 7h → Ben's lunch balance; under $5, ask to top up", "do", [9, 1, 0, 8], { rung: "propose" })],
        week: flat(now, 2) },
      // the clubs' nightly page, written two ways: Sol was not sure they are one job, so it asks (the join ask)
      { id: "chess-news", name: "Chess news", job: "checks the chess club's site each night for anything new", turn: 2, part: "clubs",
        state: "resting", next: tomorrowAt(now, 21), reach: "does", places: [own("clubs/chess", "Chess", "clubs/chess", "clock-1", "does")],
        rules: [rule("clubs/chess", "clock-1", "clock", "every night 21:00 check the chess club's site and note anything new in news.md", "watch", [7, 3, 0, 4], { rung: "read" })],
        week: flat(now, 1) },
      { id: "swim-news", name: "Swim club page", job: "reads the swim club's page each night into news.md and the gala dates", turn: 5, part: "clubs",
        state: "resting", next: tomorrowAt(now, 21), reach: "does", places: [own("clubs/swim", "Swim", "clubs/swim", "clock-1", "does")],
        rules: [rule("clubs/swim", "clock-1", "clock", "every night 21:30 read the club's page into news.md; the new gala dates into dates.md", "watch", [7, 5, 0, 2], { rung: "read" })],
        week: flat(now, 1) },
    ];
    const joins: JoinRow[] = [{
      id: "j-clubs", places: ["clubs/chess", "clubs/swim"], names: ["Chess", "Swim"], p: 0.61, at: iso(now - 2 * DAY),
      steps: [["every night 21:00 check the <place> club's site and note anything new in news.md"], ["every night 21:30 read the club's page into news.md", "the new gala dates into dates.md"]],
      agents: [{ id: "chess-news", name: "Chess news", turn: 2 }, { id: "swim-news", name: "Swim club page", turn: 5 }],
    }];
    const offer: Offer = {
      id: "o-week", name: "Our week", job: "turns each child's Friday letter into the family's week", parameter: "child", kind: "child",
      steps: ["the Friday letter", "dates, forms, things to bring", "the family calendar", "the bag list", "forms set aside for you"],
      places: [{ place: "kids#ana", name: "Ana", checked: true }, { place: "kids#ben", name: "Ben", checked: true }],
      reach: "does", count: 3,
      seen: [{ place: "kids#ana", at: at(2), text: "Ana's Friday letter → our week: 3 dates into our calendar · bag list" },
        { place: "kids#ben", at: at(9), text: "Ben's Friday letter → our week: 5 dates into our calendar · trip money noted" },
        { place: "kids#ana", at: at(16), text: "Ana's Friday letter → our week: 4 dates into our calendar · 2 forms set aside" }],
      on: { place: "kids#ana", sticky: "Ana's Friday letter → our week" },
    };
    return {
      list: { ok: true, agents, folderRules: [], offers: 1, changes: [], joins }, offers: [offer], desks: {},
      stickies: { kids: { name: "Kids", items: [
        st("Book the dentist"),
        st("Sign Ana's trip form", dueAt(now, 0, 18)),
        // made for an open sticky this morning (#1490): clipped under it, new until opened
        { done: false, t: "Ana's week from the school mail", s: "", notes: [askedAgo(now, 40), `did: made/${dayKey(now)}-ana-week.md, 4 dates · 2 forms set aside · read: school · 12 min`] },
        // the trust gate (#1497): it reaches someone, so Sol drafted it; it waits for the person's Send
        { done: false, t: "Reply to Ben's teacher", s: "about the trip day", notes: [`${askedAgo(now, 25)} · drafts: make it ready to send and never send it`, "did: draft: made/teacher-reply.md, three lines · read: school · 4 min"] },
        st("Ana's Friday letter → our week", "asked Nov 13 18:10", "did: 3 dates into our calendar · bag list · read: school · 15 min"),
        st("Ben's Friday letter → our week", "asked Nov 6 18:30", "did: 5 dates into our calendar · trip money noted · read: school · 15 min"),
      ] },
      "clubs/swim": { name: "Swim", items: [st("Swim gala kit in the bag", dueAt(now, 1, Math.max(0, new Date(now).getHours() - 1), 30))] },
      // made yesterday for a sticky already ticked done: on the surface while new, and in the made pile
      "clubs/chess": { name: "Chess", items: [st("Pay the term's chess fees", dueAt(now, -4, 18)),
        // money: Sol made it ready and stopped before paying (#1497)
        { done: false, t: "Renew the club membership", s: "", notes: [`${askedAgo(now, 90)} · asks: make it ready and stop before any payment, submission or deletion`, "did: ask: $45 by card, the form filled in made/membership.md · read: the club's page · 6 min"] },
        st("Find a board for home", askedAgo(now, 60 * 20), "did: made/board-picks.md, 3 boards under $40 · read: the club's page · 8 min")] } },
    };
  }

  // a university student (invented; course codes are made up): seven agents, five things that need her at once, so the
  // floor has one ask in front, three under "Then" and one more: two sign-ins (one ask, a row per site), two join asks
  // (the labs, the readings) and two "always like this?" questions
  if (who === "student") {
    const agents: AgentRow[] = [
      { id: "portal", name: "Grade portal", job: "looks at the university portal for new grades and puts them in grades.md", turn: 0, part: "courses",
        state: "stuck", stuck: { site: "portal", label: "sign in to the university portal" }, reach: "does",
        places: [own("courses/bio101", "BIO101", "courses/bio101", "web-1", "does")],
        rules: [rule("courses/bio101", "web-1", "web", "every hour from 08:00 to 20:00 look at the portal for new grades and note them in grades.md", "watch", [60, 0, 55, 5], { rung: "read", last: line(h(2), "web-1", "the portal asked for a sign-in", "nothing (blocked)"), held: { why: "stuck", until: "signed-in", site: "the university portal" } })],
        week: week(now, [12, 12, 12, 12, 12, 12, 12], [], [11, 12, 11, 12, 12, 11, 11]) },
      { id: "library", name: "Library holds", job: "checks the library site each morning for holds that came in", turn: 3, part: "courses",
        state: "stuck", stuck: { site: "library", label: "sign in to the library site" }, reach: "does",
        places: [own("courses/mat140", "MAT140", "courses/mat140", "web-2", "does")],
        rules: [rule("courses/mat140", "web-2", "web", "every morning at 07:30 check the library site for holds that came in", "watch", [4, 0, 4, 0], { rung: "read", held: { why: "stuck", until: "signed-in", site: "the library site" } })],
        week: week(now, [1, 1, 1, 1, 0, 0, 0], [], [1, 1, 1, 1, 0, 0, 0]) },
      { id: "lab-chem", name: "Chem lab report", job: "writes the chemistry lab report from the lab notes", turn: 2, part: "courses",
        state: "resting", next: tomorrowAt(now, 17), reach: "drafts",
        places: [own("courses/chem110", "CHEM110", "courses/chem110", "clock-1", "drafts")],
        rules: [rule("courses/chem110", "clock-1", "clock", "Friday 17:00 write the CHEM110 lab report from lab-notes.md and put the results in results.xlsx", "watch", [3, 3, 0, 0], { rung: "draft" })],
        week: flat(now, 0) },
      { id: "lab-phy", name: "Physics lab write-up", job: "writes the physics lab write-up from the lab notes", turn: 4, part: "courses",
        state: "resting", next: tomorrowAt(now, 17), reach: "drafts",
        places: [own("courses/phy120", "PHY120", "courses/phy120", "clock-1", "drafts")],
        rules: [rule("courses/phy120", "clock-1", "clock", "Friday 17:00 write the PHY120 lab report from lab-notes.md and put the error bars in figures/", "watch", [3, 3, 0, 0], { rung: "draft" })],
        week: flat(now, 0) },
      { id: "read-bio", name: "Biology reading notes", job: "turns each week's biology reading into a page of notes", turn: 1, part: "courses",
        state: "resting", next: tomorrowAt(now, 19), reach: "does",
        places: [own("courses/bio101", "BIO101", "courses/bio101", "clock-2", "does")],
        asks: [{ fix: "x-1", place: "courses/bio101", before: "Summary", after: "Key points", q: "Always like this?" }],
        rules: [rule("courses/bio101", "clock-2", "clock", "every day at 19:00 turn the week's reading in reading/ into a page of notes", "watch", [6, 6, 0, 0], { rung: "draft" })],
        week: flat(now, 1) },
      { id: "read-mat", name: "Calculus reading notes", job: "turns each week's calculus reading into a page of notes", turn: 5, part: "courses",
        state: "resting", next: tomorrowAt(now, 19), reach: "does",
        places: [own("courses/mat140", "MAT140", "courses/mat140", "clock-2", "does")],
        rules: [rule("courses/mat140", "clock-2", "clock", "every day at 19:30 turn the week's reading in reading/ into a page of notes", "watch", [6, 6, 0, 0], { rung: "draft" })],
        week: flat(now, 1) },
      { id: "deadlines", name: "Deadlines", job: "reads every syllabus and keeps the deadlines in one calendar", turn: 0, part: "courses",
        state: "resting", next: tomorrowAt(now, 7), reach: "does",
        places: [own("courses", "Courses", "courses", "clock-3", "does")],
        asks: [{ fix: "x-2", place: "courses", before: "Due 11/22", after: "Due Fri 22 Nov", q: "Always like this?" }],
        rules: [rule("courses", "clock-3", "clock", "every morning at 07:00 read the syllabi in syllabus/ and update deadlines.ics", "watch", [7, 3, 0, 4], { rung: "draft" })],
        week: flat(now, 1) },
    ];
    const joins: JoinRow[] = [
      { id: "j-labs", places: ["courses/chem110", "courses/phy120"], names: ["CHEM110", "PHY120"], p: 0.58, at: iso(now - 3 * DAY),
        steps: [["every Friday 17:00 write the <place> lab report from lab-notes.md", "the results into results.xlsx"], ["every Friday 17:00 write the <place> lab report from lab-notes.md", "the error bars into figures/"]],
        agents: [{ id: "lab-chem", name: "Chem lab report", turn: 2 }, { id: "lab-phy", name: "Physics lab write-up", turn: 4 }] },
      { id: "j-reads", places: ["courses/bio101", "courses/mat140"], names: ["BIO101", "MAT140"], p: 0.52, at: iso(now - 1 * DAY),
        steps: [["every day 19:00 turn the <place> reading into a page of notes"], ["every day 19:30 turn the <place> reading into a page of notes", "the worked examples into examples.md"]],
        agents: [{ id: "read-bio", name: "Biology reading notes", turn: 1 }, { id: "read-mat", name: "Calculus reading notes", turn: 5 }] },
    ];
    return {
      list: { ok: true, agents, offers: 0, joins, folderRules: [], changes: [{ id: "c-1", at: iso(h(30)), kind: "made", agent: "", line: "Sol grouped 7 rules from 5 folders into 7 agents.", undo: null, undone: false }] },
      offers: [], desks: {}, stickies: {},
    };
  }

  // the baker: a shop, two market stalls and a family
  const agents: AgentRow[] = [
    { id: "orders", name: "Orders", job: "reads the shop's mail for orders and drafts each reply", turn: 0, part: "shop",
      state: "stuck", stuck: { site: "gmail", label: "sign in to the shop's mail" }, reach: "drafts",
      places: [own("shop", "Shop", "shop", "mail-1", "drafts")],
      rules: [rule("shop", "mail-1", "mail", "every hour from 07:00 to 19:00 look at the shop's mail for orders", "watch", [84, 0, 80, 4], { rung: "draft", last: line(h(1), "mail-1", "the shop's mail asked for a sign-in", "nothing (blocked)"), held: { why: "stuck", until: "signed-in", site: "the shop's mail" } })],
      week: week(now, [12, 12, 12, 12, 12, 12, 12], [], [11, 12, 11, 12, 12, 11, 11]) },
    { id: "suppliers", name: "Supplier order", job: "compares the suppliers' price lists each Monday and drafts the week's order; you send", turn: 2, part: "shop",
      state: "needs", needs: { title: "The flour order for Millstone Supply is drafted. Send it?", ticketId: "t-sup-4", choices: ["Send it", "change it", "drop it"], wouldHave: true }, reach: "asks",
      places: [own("shop", "Shop", "shop", "clock-1", "asks")],
      rules: [rule("shop", "clock-1", "clock", "Monday 06:30 compare the price lists in suppliers/ and draft the week's order", "watch", [3, 3, 0, 0], { rung: "draft", last: line(h(9), "clock-1", "suppliers/", "orders/2026-11-16-flour.md") })],
      week: week(now, [1, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 1], []) },
    { id: "reviews", name: "Reviews", job: "reads new reviews each evening and drafts an answer to each", turn: 3, part: "shop",
      state: "working", working: { ticketId: "t-rev-1", since: iso(now - 4 * 60_000) }, reach: "drafts",
      places: [own("shop", "Shop", "shop", "clock-2", "drafts")],
      rules: [rule("shop", "clock-2", "clock", "every evening at 21:00 read new reviews and draft an answer in replies/", "watch", [7, 5, 0, 2], { rung: "draft", last: line(h(20), "clock-2", "new reviews", "replies/2026-11-15.md") })],
      week: week(now, [1, 1, 1, 1, 1, 1, 1], [1, 1, 0, 1, 1, 0, 1], []) },
    { id: "bake-list", name: "Bake list", job: "writes each morning's bake list from the orders", turn: 4, part: "shop",
      state: "resting", next: tomorrowAt(now, 6), reach: "does",
      places: [own("shop", "Shop", "shop", "clock-3", "does")],
      rules: [rule("shop", "clock-3", "clock", "every day at 06:00 the day's bake list in made/<day>-bake.md", "watch", [6, 6, 0, 0], { rung: "read", last: line(h(10), "clock-3", "orders.md", "made/2026-11-16-bake.md") })],
      week: week(now, [1, 1, 1, 0, 1, 1, 1], [1, 1, 1, 0, 1, 1, 1], []) },
    { id: "birthdays", name: "Birthdays", job: "reminds you a week before each birthday and drafts a note", turn: 1, part: "family",
      state: "resting", next: iso(now + 6 * DAY), reach: "drafts",
      places: [own("family", "Family", "family", "clock-1", "drafts")],
      rules: [rule("family", "clock-1", "clock", "every morning at 07:00 look a week ahead in birthdays.md and draft a note", "watch", [7, 0, 0, 7], { rung: "draft", held: { why: "idle", until: iso(now + 6 * DAY) } })],
      week: flat(now, 1) },
    { id: "meals", name: "Week's meals", job: "plans the week's dinners from the pantry list", turn: 5, part: "family",
      state: "off", reach: "does", places: [own("family", "Family", "family", "clock-3", "does")],
      rules: [rule("family", "clock-3", "clock", "Sunday 17:00 the week's dinners in meals.md from pantry.md", "off", [2, 2, 0, 0], { rung: "draft" })],
      week: flat(now, 0) },
  ];
  const offer: Offer = {
    id: "o-market", name: "Market bake", job: "turns each market's pre-orders into that market's bake list and boxes", parameter: "market", kind: "market",
    steps: ["the market's pre-orders", "count each bake", "the bake list for that market", "boxes set aside by name"],
    places: [
      { place: "markets/saturday", name: "Saturday market", checked: true },
      { place: "markets/wednesday", name: "Wednesday market", checked: true },
      { place: "markets/harbour", name: "Harbour fair", checked: false, why: "no pre-orders here yet" },
      { place: "markets/winter", name: "Winter fair", checked: false, ask: true },
    ],
    reach: "does", count: 3,
    seen: [{ place: "markets/saturday", at: at(2), text: "Pre-orders → Saturday's bake list: 9 bakes counted · 6 boxes set aside" },
      { place: "markets/wednesday", at: at(5), text: "Pre-orders → Wednesday's bake list: 7 bakes counted" },
      { place: "markets/saturday", at: at(9), text: "Pre-orders → Saturday's bake list: 11 bakes counted · 8 boxes set aside" }],
    on: { place: "markets/saturday", sticky: "Pre-orders → Saturday's bake list" },
  };
  const changes: Change[] = [
    { id: "c-3", at: iso(h(1)), kind: "held", agent: "orders", line: "Orders stopped at the shop's mail sign-in 3 times in a row; Sol holds it until you sign in.", undo: { unhold: [] }, undone: false },
    { id: "c-2", at: iso(h(26)), kind: "rested", agent: "birthdays", line: "Birthdays made nothing in its last 7 runs over 7 days; Sol rests it for 7 days.", undo: { unhold: [] }, undone: false },
    { id: "c-1", at: iso(h(50)), kind: "made", agent: "", line: "Sol grouped 6 rules from 2 folders into 6 agents.", undo: null, undone: false },
  ];
  return {
    list: { ok: true, agents, offers: 1, changes, folderRules: [
      { folder: "shop", rule: "stickies-1", sentence: "when I press a sticky in Home, do it", mode: "watch", source: "stickies", helper: true },
      // a routine (one step, one place) stopped at a sign-in of its own: the floor's one sign-in ask has two sites
      { folder: "family", rule: "web-1", sentence: "every Friday at 16:00 read the school's letters page and put the week's dates in week.md", mode: "watch", source: "web",
        stuck: { site: "the school's site", folder: "family", rule: "web-1", since: now - 4 * DAY, next: now + 2 * DAY } },
    ] },
    offers: [offer], desks: {},
    stickies: { "markets/saturday": { name: "Saturday market", items: [
      st("Ask the hall about a second table"),
      st("Pre-orders → Saturday's bake list", "asked Nov 14 17:20", "did: 9 bakes counted into made/sat-bake.md · 6 boxes set aside · read: pre-orders.csv · 25 min"),
    ] } },
  };
}

/** a record as the one onboarding leaves it (onboard/record.ts), built and checked: this home's places, each sub-place
 *  (clubs/chess) after its parent (places at any depth, #1481) */
export function recordOf(fx: Fixture) {
  const paths = [...fx.list.agents.flatMap((a) => a.rules.map((r) => r.folder)), ...Object.keys(fx.stickies)].map((p) => p.split("#")[0])
    .flatMap((p) => p.split("/").map((_, i, xs) => xs.slice(0, i + 1).join("/")));
  const ids = [...new Set(paths)].filter((id) => id && id !== "home" && id !== "you");   // "home" and "you" are Home's own places, never a folder's id
  const name = (id: string) => { const leaf = id.split("/").pop()!; return fx.stickies[id]?.name ?? leaf[0].toUpperCase() + leaf.slice(1); };
  const top = (id: string) => id.split("/")[0];
  return { v: 1, made: new Date(0).toISOString(), name: "", said: "", off: [], hands: "show", machine: { screens: [], apps: [] }, ai: [], connectors: [],
    areas: ids.map((id) => ({ id, name: name(id), part: top(id) === "work" || top(id) === "shop" || top(id) === "clients" ? "work" : "life", facts: [] })), facts: [],
    confirmed: {}, visits: {}, built: new Date(0).toISOString(), solHome: HOME_DIR, unchecked: [] };
}

/** the list alone (the tests read it) */
export const fixtureList = (now = Date.now(), who: Who = "baker"): List => fixtureOf(now, who).list;

/** an engine in memory that answers the agents.* wire (and agent.answer, agent.tickets) like the real one; a run lands
 *  its ledger lines one by one and says agents.changed, so the desk can be watched working */
/** `o.looking`: agents.list says Sol is still looking (the engine's late look in the background) for this many ms
 *  after the first list, then agents.changed and a list without it (Infinity: always looking, for a still) */
/** `o.first`: the first grouping is still running for this many ms: agents.list says looking with no agents yet, then
 *  agents.changed and the home's list (Infinity: never ends, for a still) */
/** `o.regroup`: an older Sol grouped this home, one agent per rule: the floor asks "Sol groups agents better now: N → M" */
export function fakeEngine(now = () => Date.now(), who: Who = "baker", o: { looking?: number; first?: number; meet?: boolean; steps?: boolean; shelf?: boolean; regroup?: boolean } = {}) {
  let lookUntil: number | null = null;
  let firstUntil: number | null = null;
  let fx = fixtureOf(now(), who, { meet: o.meet, steps: o.steps, shelf: o.shelf });
  let list = fx.list;
  // an older grouping: each rule its own agent; the home's own agents wait as the regrouping, asked once
  let grouped: AgentRow[] | null = null;
  if (o.regroup) {
    grouped = list.agents;
    list.agents = grouped.flatMap((a) => a.rules.length < 2 ? [a] : a.rules.map((r, i) => ({ ...structuredClone(a), id: `${a.id}-${i + 1}`, turn: (a.turn + i) % 6, rules: [r], places: (a.places ?? []).filter((p) => p.folder === r.folder && p.rule === r.rule) })));
  }
  const subs = new Set<(m: any) => void>();
  const say = (m: object) => setTimeout(() => subs.forEach((f) => f(m)), 120);
  const changed = () => say({ type: "agents.changed" });
  let n = 10;
  const find = (id: string) => list.agents.find((a) => a.id === id);
  const addChange = (agent: string, kind: string, text: string, undo: object | null): Change => {
    const c: Change = { id: `c-${++n}`, at: iso(now()), kind, agent, line: text, undo, undone: false };
    list.changes = [c, ...list.changes].slice(0, 20);
    return c;
  };
  const undos = new Map<string, () => void>();
  const texts = new Map<string, string>();
  const dropped = new Map<string, { i: number; item: Sticky }>();   // a dropped sticky, kept for its undo (#1493)
  /** the whole state as it is, for an undo that puts everything back */
  const snap = () => { const s = structuredClone({ list, offers: fx.offers, desks: fx.desks }); return () => { const keep = list.changes; list = s.list; list.changes = keep; fx = { ...fx, list, offers: s.offers, desks: s.desks }; }; };
  const desk = (id: string): DeskRead => (fx.desks[id] ??= { work: [], more: [] });
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 1));
  const diff = (b: string, a: string) => { const x = words(b), y = words(a); return `${[...y].filter((w) => !x.has(w)).sort()}|${[...x].filter((w) => !y.has(w)).sort()}`; };
  const fixes = new Map<string, { id: string; place: string; before: string; after: string; answer?: string }[]>();
  const learn = (a: AgentRow, fx1: { before: string; after: string }, place: string | null, why: string) => {
    const back = snap();
    const l = { id: `l-${++n}`, line: `instead of “${fx1.before}”, “${fx1.after}”`, place, at: iso(now()) };
    a.learned = [...(a.learned ?? []), l];
    a.asks = [];
    // the open work is redone at once: every line it made like the old one now reads as the new one
    for (const w of desk(a.id).work) if (place === null || w.place === place) w.lines = w.lines.map((x) => (x.trim() === fx1.before.trim() ? fx1.after : x));
    const c = addChange(a.id, "learned", `${a.name} learned${place ? ` for ${a.places?.find((p) => p.place === place)?.name ?? place}` : ""}: ${l.line} (${why}).`, { restore: {} });
    undos.set(c.id, back);
    return { l, c };
  };
  const answer = (m: any): object => {
    const a = m.id ? find(String(m.id)) : undefined;
    const no = { ok: false, why: `no agent "${m.id}"` };
    switch (m.type) {
      case "agents.list": {
        if (o.first) {
          if (firstUntil === null) { firstUntil = Date.now() + o.first; if (Number.isFinite(o.first)) setTimeout(changed, o.first); }
          if (Date.now() < firstUntil) return { ok: true, agents: [], folderRules: [], changes: [], offers: 0, joins: [], looking: true };
        }
        if (o.looking && lookUntil === null) {
          lookUntil = Date.now() + o.looking;
          if (Number.isFinite(o.looking)) setTimeout(changed, o.looking);
        }
        const looking = lookUntil !== null && Date.now() < lookUntil;
        return structuredClone({ ...list, offers: fx.offers.length, asks: asksFor(list, now(), grouped ? { before: list.agents.length, after: grouped.length } : null), shelves: shelvesFor(list.agents), ...(looking ? { looking: true } : {}) });
      }
      // the real engine's offers wait on the first grouping (agents.json first): none while it runs
      case "agents.offers": return { ok: true, offers: firstUntil !== null && Date.now() < firstUntil ? [] : structuredClone(fx.offers) };
      case "agents.desk": return a ? { ok: true, ...structuredClone(desk(a.id)) } : no;
      case "agents.join": {
        const j = (list.joins ?? []).find((x) => x.id === m.id);
        if (!j) return { ok: false, why: `no join ask ${m.id}` };
        if (m.answer !== "together" && m.answer !== "apart") return { ok: false, why: "an answer is together or apart" };
        // two steps of one place: a side may be a routine (no agent yet); it joins as its rule
        const routine = j.inPlace ? list.folderRules.find((r) => r.sentence === j.steps[1]?.[0]) : undefined;
        const one = find(j.agents[0].id), two = find(j.agents[1].id);
        if (!one || (!two && !routine)) return { ok: false, why: "one of the two rules is gone" };
        const back = snap();
        list.joins = (list.joins ?? []).filter((x) => x !== j);
        if (m.answer === "apart") {
          const line = j.inPlace ? `These two steps in ${j.names[0]} stay apart; Sol won't ask about them again.` : `${one.name} (${j.names[0]}) and ${two!.name} (${j.names[1]}) stay two agents; Sol won't ask about these two again.`;
          const c = addChange(one.id, "apart", line, { reask: {} });
          undos.set(c.id, back); changed(); return { ok: true, change: c };
        }
        if (!two && routine) {
          one.rules = [...one.rules, { folder: routine.folder, rule: routine.rule, sentence: routine.sentence, mode: routine.mode, source: routine.source ?? "clock", runs: 0, made: 0, blocked: 0, nothing: 0 }];
          list.folderRules = list.folderRules.filter((r) => r !== routine);
          const c = addChange(one.id, "merged", `${one.name} is one agent now, doing both steps in ${j.names[0]}.`, { unjoin: {} });
          undos.set(c.id, back); changed(); return { ok: true, agent: structuredClone(one), change: c };
        }
        if (!two) return { ok: false, why: "one of the two rules is gone" };
        one.places = [...(one.places ?? []), ...(two.places ?? [])];
        one.rules = [...one.rules, ...two.rules];
        list.agents = list.agents.filter((x) => x !== two);
        const c = addChange(one.id, "merged", `${one.name} is one agent now, on ${j.names.join(" and ")}.`, { unjoin: {} });
        undos.set(c.id, back); changed(); return { ok: true, agent: structuredClone(one), change: c };
      }
      case "agents.offer": {
        const o = fx.offers.find((x) => x.id === m.id);
        if (!o) return { ok: false, why: `no offer ${m.id}` };
        const picked: string[] = Array.isArray(m.places) ? m.places : o.places.filter((p) => p.checked).map((p) => p.place);
        if (m.answer === "keep" && !picked.length) return { ok: false, why: "tick at least one place" };
        const back = snap();
        fx.offers = fx.offers.filter((x) => x !== o);
        if (m.answer === "later" || m.answer === "never") {
          const c = addChange("", "offer", m.answer === "later" ? `Not now: Sol asks about ${o.name} again after 3 more times.` : `Never: Sol won't offer ${o.name} again.`, { offer: {} });
          undos.set(c.id, back); changed(); return { ok: true, change: c };
        }
        const id = o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const ag: AgentRow = { id, name: o.name, job: o.job, turn: (list.agents.length + 2) % 6, part: o.places[0].place.split(/[#/]/)[0], born: { how: "offer", at: iso(now()) },
          state: "resting", reach: o.reach, parameter: o.parameter, kinds: o.kind ? [o.kind] : [], learned: [], asks: [],
          places: picked.map((p, i) => dated(p, o.places.find((x) => x.place === p)?.name ?? p, p.split("#")[0], `date-${i + 1}`, o.reach, 1)),
          rules: picked.map((p, i) => rule(p.split("#")[0], `date-${i + 1}`, "date", `1 day before each date of ${o.places.find((x) => x.place === p)?.name}, at 9h → ${o.job}`, "do", [0, 0, 0, 0], { rung: "draft" })),
          week: week(now(), [0, 0, 0, 0, 0, 0, 0], [], []) };
        list.agents = [ag, ...list.agents];
        fx.desks[id] = { work: [], more: o.places.filter((p) => !picked.includes(p.place)).map((p) => ({ place: p.place, name: p.name, ...(p.why ? { why: p.why } : {}), ...(p.ask ? { ask: true as const } : {}) })) };
        const names = ag.places!.map((p) => p.name);
        const c = addChange(id, "kept", `${o.name} kept, in ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}.`, { unkeep: {} });
        undos.set(c.id, back); changed(); return { ok: true, agent: structuredClone(ag), change: c };
      }
      case "agents.scope": {
        if (!a) return no;
        const back = snap(), d = desk(a.id);
        if (m.add) {
          const p = d.more.find((x) => x.place === m.add);
          if (!p) return { ok: false, why: `no place ${m.add}` };
          d.more = d.more.filter((x) => x !== p);
          const trust = a.reach ?? "drafts";
          a.places = [...(a.places ?? []), dated(p.place, p.name, p.place.split("#")[0], `date-${++n}`, trust, 1, trust === "does" ? { first: "drafts" } : {})];
          const c = addChange(a.id, "scope", `${p.name} added to ${a.name}${trust === "does" ? "; drafts for its first run" : ""}.`, { unscope: {} });
          undos.set(c.id, back); changed(); return { ok: true, change: c };
        }
        if (m.remove) {
          const p = a.places?.find((x) => x.place === m.remove);
          if (!p) return { ok: false, why: `${a.name} does not work in ${m.remove}` };
          a.places = a.places!.filter((x) => x !== p);
          d.more = [{ place: p.place, name: p.name, why: "taken out by you" }, ...d.more];
          const c = addChange(a.id, "scope", `${p.name} taken out of ${a.name}; what it made there stays.`, { rescope: {} });
          undos.set(c.id, back); changed(); return { ok: true, change: c };
        }
        return { ok: false, why: "add or remove a place" };
      }
      case "agents.trust": {
        if (!a) return no;
        const t = String(m.trust);
        if (!["looks", "drafts", "does"].includes(t)) return { ok: false, why: "how far is looks, drafts or does" };
        if (t === "does" && (a.reach === "drafts" || a.reach === "asks")) return { ok: false, why: "what goes to other people always waits for you: drafts at most" };
        const back = snap(), was = a.places?.[0]?.trust ?? "drafts";
        a.places = (a.places ?? []).map((p) => (p.trust === "asks" ? p : { ...p, trust: t as Trust, first: undefined }));
        const c = addChange(a.id, "trust", `${a.name}: how far, ${was} → ${t}.`, { restore: {} });
        undos.set(c.id, back); changed(); return { ok: true, change: c };
      }
      case "agents.fix": {
        if (!a) return no;
        const before = String(m.before ?? "").trim(), after = String(m.after ?? "").trim();
        if (!before || before === after) return { ok: false, why: "the line is the same" };
        const mine = fixes.get(a.id) ?? [];
        fixes.set(a.id, mine);
        // the line itself, changed in its run at once
        const w = desk(a.id).work.find((x) => x.place === m.place && x.lines.includes(before));
        if (w) w.lines = w.lines.map((x) => (x === before ? after : x));
        let fx1 = typeof m.always === "boolean" ? mine.find((x) => !x.answer && x.place === m.place && x.before === before && x.after === after) : undefined;
        if (!fx1) { fx1 = { id: `x-${++n}`, place: String(m.place), before, after }; mine.push(fx1); }
        if (m.always === false) { fx1.answer = "once"; a.asks = []; changed(); return { ok: true, fix: fx1.id, learned: null }; }
        if (m.always === true) fx1.answer = "always";
        const same = mine.filter((x) => x !== fx1 && x.answer !== "once" && diff(x.before, x.after) === diff(before, after));
        if (!same.length && m.always !== true) {
          a.asks = [{ fix: fx1.id, place: fx1.place, before, after, q: "Always like this?" }];
          changed(); return { ok: true, fix: fx1.id, ask: "Always like this?" };
        }
        const where = new Set([fx1, ...same].map((x) => x.place));
        const { l, c } = learn(a, fx1, where.size > 1 ? null : fx1.place, m.always === true ? "you said always" : "you fixed it twice");
        changed(); return { ok: true, fix: fx1.id, learned: l, redo: [], change: c };
      }
      case "agents.change": {
        if (!a) return no;
        const said = String(m.line ?? "").trim();
        if (!said) return { ok: false, why: "say the change in a line" };
        const same = (a.learned ?? []).find((l) => [...words(said)].some((x) => words(l.line).has(x) && x.length > 3));
        if (same) return { ok: true, same };
        const last = desk(a.id).work[0];
        if (!last) return { ok: false, why: "it has not made anything yet: nothing to rehearse on" };
        const before = last.lines.join("\n"), afterLines = [...last.lines, `(${said})`];
        if (!m.keep) return { ok: true, before, after: afterLines.join("\n") };
        const back = snap();
        a.job = `${a.job}; ${said}`;
        for (const w of desk(a.id).work) w.lines = [...w.lines, `(${said})`];
        const c = addChange(a.id, "changed", `${a.name} changed: ${said}.`, { restore: {} });
        undos.set(c.id, back); changed(); return { ok: true, before, after: afterLines.join("\n"), change: c };
      }
      case "agents.mode": {
        if (!a) return no;
        const before = a.rules.map((r) => r.mode), was = a.state;
        if (before.every((x) => x === m.mode)) return { ok: true, line: `${a.name} was already ${m.mode}` };
        a.rules.forEach((r) => { r.mode = m.mode; });
        a.state = m.mode === "off" ? "off" : was === "off" ? "resting" : was;
        const c = addChange(a.id, "mode", `${a.name} set to ${m.mode} (${a.rules.length} rule${a.rules.length > 1 ? "s" : ""}).`, { modes: [] });
        undos.set(c.id, () => { a.rules.forEach((r, i) => { r.mode = before[i]; }); a.state = was; });
        changed(); return { ok: true, change: c };
      }
      case "agents.rest": {
        if (!a) return no;
        const was = a.state, held = a.rules.map((r) => r.held);
        if (m.on) { a.rules.forEach((r) => { r.held = { why: "asked", until: "woken" }; }); a.state = "resting"; }
        else { a.rules.forEach((r) => { delete r.held; }); a.state = a.rules.every((r) => r.mode === "off") ? "off" : "resting"; }
        const c = addChange(a.id, m.on ? "rested" : "woke", m.on ? `${a.name} sleeps until you wake it; its work stays.` : `${a.name} woke; it runs again.`, { hold: [] });
        undos.set(c.id, () => { a.rules.forEach((r, i) => { r.held = held[i]; if (!held[i]) delete r.held; }); a.state = was; });
        changed(); return { ok: true, change: c };
      }
      case "agents.rename": {
        if (!a) return no;
        const name = String(m.name ?? "").trim();
        if (!name) return { ok: false, why: "a name, please" };
        const old = a.name; a.name = name;
        const c = addChange(a.id, "renamed", `${old} is now ${name}.`, { name: old });
        undos.set(c.id, () => { a.name = old; });
        changed(); return { ok: true, change: c };
      }
      case "agents.meet": { list.met ??= iso(now()); delete list.intro; return { ok: true, met: list.met }; }
      // the line about Jev is said once: seen, it is gone for good
      case "agents.noted": { delete list.jevNote; return { ok: true }; }
      // an older grouping answered: regrouped (the home's own agents) or kept; either way one change line with undo
      case "agents.regroup": {
        if (!grouped) return { ok: false, why: "nothing to regroup" };
        const was = list.agents, to = grouped;
        const c = m.answer === "regroup"
          ? addChange("", "regrouped", `Sol regrouped your ${was.length} agents into ${to.length}, one per job; what you set stays as it was.`, { regroup: {} })
          : addChange("", "regrouped", `Your ${was.length} agents stay as they are; Sol won't ask about grouping them again.`, { regroup: {} });
        if (m.answer === "regroup") list.agents = to;
        grouped = null;
        undos.set(c.id, () => { list.agents = was; grouped = to; });
        changed(); return { ok: true, change: c };
      }
      // Agents in use: what each place drew, kept for the dev page (window.agentsSeen) as the engine would count it
      case "agents.seen": { ((globalThis as { agentsSeen?: object[] }).agentsSeen ??= []).push({ ...m }); return {}; }
      case "agents.undo": {
        // one cause's changes together: each undone, newest first; ok when any was
        if (Array.isArray(m.changeIds)) {
          const rs = (m.changeIds as string[]).map((id) => answer({ type: "agents.undo", changeId: id }) as { ok: boolean; why?: string });
          return rs.some((r) => r.ok) ? { ok: true, undone: rs.filter((r) => r.ok).length } : rs[0] ?? { ok: false, why: "nothing to undo" };
        }
        const c = list.changes.find((x) => x.id === m.changeId);
        if (!c) return { ok: false, why: `no change ${m.changeId}` };
        if (c.undone) return { ok: false, why: "already undone" };
        if (!c.undo) return { ok: false, why: "this one has no undo" };
        undos.get(c.id)?.();
        if (c.kind === "held") { const x = find(c.agent); if (x) { x.state = "resting"; delete x.stuck; x.stucks = []; x.rules.forEach((r) => { delete r.held; }); } }
        if (c.kind === "made") list.agents = list.agents.filter((x) => x.id !== c.agent);
        const c2 = list.changes.find((x) => x.id === m.changeId)!;
        c2.undone = true; c2.undoneAt = iso(now());
        changed(); return { ok: true, change: c2 };
      }
      case "agents.signin": {
        // by agent, or by one rule (a routine has no agent): the site it stopped at
        const ref = m.folder && m.rule ? { folder: String(m.folder), rule: String(m.rule) } : null;
        const where = ref
          ? [...list.agents.flatMap((x) => x.stucks ?? []), ...list.folderRules.flatMap((r) => (r.stuck ? [r.stuck] : []))].find((s) => s.folder === ref.folder && s.rule === ref.rule)?.site
          : a?.stucks?.[0]?.site ?? a?.stuck?.label.replace(/^sign in to /, "");
        if (!where) return { ok: false, why: "it is not stuck at a sign-in" };
        // the window opens; a moment later the person has signed in, and every agent and routine stuck there wakes
        setTimeout(() => {
          for (const x of list.agents) if (x.stucks?.some((s) => s.site === where)) { x.state = "resting"; delete x.stuck; x.stucks = x.stucks.filter((s) => s.site !== where); x.rules.forEach((r) => { if (r.held?.why === "stuck") delete r.held; }); }
          for (const r of list.folderRules) if (r.stuck?.site === where) delete r.stuck;
          addChange(a?.id ?? "", "woke", `Signed in to ${where}; the agents held there run again.`, null);
          changed();
        }, 1600);
        return { ok: true, line: `the sign-in window for ${where} is open; sign in there and it wakes by itself` };
      }
      case "agents.run": {
        if (!a) return no;
        const was = a.state;
        a.state = "working"; a.working = { ticketId: `t-${a.id}-${n}`, since: iso(now()) };
        changed();
        a.rules.filter((r) => r.mode !== "off").forEach((r, i) => setTimeout(() => {
          r.runs++; r.made++; r.last = { at: now(), rule: r.rule, read: r.source === "clock" ? "the folder" : r.source, made: `made/${dayKey(now())}-${r.rule}.md`, held: "" };
          changed();
        }, 1400 * (i + 1)));
        setTimeout(() => { a.state = was === "working" ? "resting" : was; delete a.working; changed(); }, 1400 * (a.rules.length + 1));
        return new Promise((res) => setTimeout(() => res({ ok: true, tickets: [], lines: a.rules.map((r) => `${r.rule}: ran`) }), 1400 * (a.rules.length + 1))) as unknown as object;
      }
      case "agents.make": {
        const words1 = String(m.line ?? "").trim();
        if (words1.split(/\s+/).filter(Boolean).length < 4) return { ok: false, why: "a sticky is enough" };
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(m.time ?? ""))) return { ok: false, why: "a time is HH:MM" };
        const name = words1.split(/\s+/).slice(0, 4).join(" ").replace(/^./, (x) => x.toUpperCase());
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const folder = String(m.folder);
        const ag: AgentRow = { id, name, job: words1, turn: list.agents.length % 6, part: folder.split("/")[0], born: { how: "typed", at: iso(now()) }, state: "resting", reach: "does",
          places: [own(folder, folder.split("/").pop()!.replace(/^./, (x) => x.toUpperCase()), folder, `clock-${n + 1}`, "looks")],
          rules: [rule(folder, `clock-${++n}`, "clock", `${m.time} ${words1}`, "watch", [0, 0, 0, 0])], week: week(now(), [0, 0, 0, 0, 0, 0, 0], [], []) };
        list.agents.push(ag);
        const c = addChange(id, "made", `${name}: made from your line, in ${folder}/policy.md at ${m.time}; it looks first.`, { unmake: {} });
        changed(); return { ok: true, agent: ag, change: c };
      }
      case "agent.answer": {
        const x = list.agents.find((y) => y.needs?.ticketId === m.ticketId);
        if (!x) return { ok: false, why: "that card is gone" };
        const title = x.needs!.title;
        delete x.needs; x.state = "resting";
        changed(); return { ok: true, line: `${x.name}: “${m.choice}” — ${title.replace(/\?$/, "")}` };
      }
      case "agent.tickets": return { ok: true, tickets: [], ledger: [], path: `${HOME_DIR}/${m.folder}` };
      // a place's stickies.md, as Home reads and writes it (home/folders/stickies.ts); the person's record (onboard/record.ts),
      // so the real Home (OneHome) can be drawn on this home: its folders are the places its agents and stickies live in
      case "work.read": {
        if (m.path === ".sol/record/me.json") return { text: JSON.stringify(recordOf(fx)) };
        if (String(m.path ?? "").startsWith("made/")) { const f = MADE_FILES[String(m.path).split("/").pop()!.replace(/^\d{4}-\d\d-\d\d-/, "")]; return f ? { text: f } : { error: "no such file" }; }
        const place = String(m.cwd ?? "").replace(`${HOME_DIR}/`, "");
        const k = fx.stickies[place];
        return { text: texts.get(place) ?? (k ? serialize(HEAD(k.name), k.items) : HEAD(place)), hash: `h${(texts.get(place) ?? "").length}` };
      }
      // a place's stickies as the engine keeps them (agent/stickies.ts): read only here, a change answers the same list
      case "agent.stickies": case "agent.sticky": {
        const place = String(m.folder ?? "").replace(`${HOME_DIR}/`, "");
        // a sticky put down (Home's blank sticky, #1483): it lands in the place's list, loose/ made on the way
        if (m.type === "agent.sticky" && m.op === "make") {
          const line = String(m.line ?? "").trim(), k = (fx.stickies[place] ??= { name: place.split("/").pop()!, items: [] });
          k.items = [st(line, ...(m.due ? [`due: ${m.due}`] : [])), ...k.items]; changed(); say({ type: "agent.changed", folder: place }); return { ok: true, items: k.items, key: line };
        }
        const k = fx.stickies[place];
        // finish or drop (#1493): ticked, dropped (kept here for undo), brought back, dated onto Today
        if (m.type === "agent.sticky" && k && ["done", "remove", "undo", "due"].includes(String(m.op))) {
          const i = k.items.findIndex((x) => x.t === m.key);
          let undo: string | undefined;
          if (m.op === "undo") { const r = dropped.get(String(m.id)); if (!r) return { ok: false, why: "nothing to bring back" }; dropped.delete(String(m.id)); k.items.splice(Math.min(r.i, k.items.length), 0, r.item); }
          else if (i < 0) return { ok: false, why: "that sticky is not there any more" };
          else if (m.op === "done") k.items[i] = { ...k.items[i], done: !!m.done };
          else if (m.op === "due") k.items[i] = { ...k.items[i], notes: [...k.items[i].notes.filter((n) => !/^due:/i.test(n)), ...(m.due ? [`due: ${m.due}`] : [])] };
          else { undo = `u${dropped.size + 1}`; dropped.set(undo, { i, item: k.items[i] }); k.items.splice(i, 1); }
          changed(); say({ type: "agent.changed", folder: place });
          return { ok: true, items: k.items, ...(undo ? { undo } : {}) };
        }
        return { ok: true, agent: true, items: (k?.items ?? []).map((x) => ({ ...x, reach: reachOf(`${x.t} ${x.s}`) })) };
      }
      // the person's yes on a draft or an ask (#1497): its one step done, the sticky ticked (the engine's agent.press yes)
      case "agent.press": {
        const place = String(m.folder ?? "").replace(`${HOME_DIR}/`, ""), k = fx.stickies[place], i = k ? k.items.findIndex((x) => x.t === m.key) : -1;
        if (!k || i < 0) return { ok: false, why: "that sticky is not there any more" };
        if (typeof m.yes !== "string" || !k.items[i].notes.includes(m.yes)) return { ok: false, why: "nothing runs on this page" };
        const step = m.yes.replace(/^did:\s*(draft|ask):\s*/i, "");
        k.items[i] = { ...k.items[i], done: true, notes: [...k.items[i].notes, `${askedAgo(Date.now(), 0)} · yes: ${step}`, `did: ${/^did:\s*draft/i.test(m.yes) ? "sent" : "done"} ${step}`] };
        changed(); say({ type: "agent.changed", folder: place });
        return { ok: true };
      }
      // Jev's "which place?" (agent/whereJev.ts), invented for the page: a place named in the words is 0.82; a word of a
      // place's sub-places is 0.55, with the two nearest; nothing, no answer (the sticky stays loose)
      case "agent.where": {
        const words = String(m.sticky ?? "").toLowerCase(), fs = (Array.isArray(m.folders) ? m.folders : []) as { id: string; name: string; things: string[] }[];
        const leaf = (f: { name: string }) => f.name.split(" › ").pop()!.toLowerCase();
        const named = fs.filter((f) => words.includes(leaf(f))).sort((x, y) => y.id.length - x.id.length)[0];
        if (named) return { ok: true, folder: named.id, confidence: 0.82, near: [named.id] };
        // a word that starts like a place's name ("club" for Clubs): its sub-places are the nearest, else the place
        const like = fs.find((f) => words.split(/\W+/).some((w) => w.length > 3 && leaf(f).startsWith(w.slice(0, 4))));
        const near = like ? (fs.filter((f) => f.id.startsWith(`${like.id}/`)).length ? fs.filter((f) => f.id.startsWith(`${like.id}/`)) : [like]) : [];
        if (near.length) return { ok: true, folder: near[0].id, confidence: 0.55, near: near.slice(0, 2).map((f) => f.id) };
        return { ok: true, folder: null };
      }
      case "agent.mkdir": return { ok: true, made: [], refused: [], home: HOME_DIR };   // Home's folders, made by the engine (#1511)
      case "work.write": { texts.set(String(m.cwd ?? "").replace(`${HOME_DIR}/`, ""), String(m.text ?? "")); return { ok: true }; }
      default: return { ok: false, why: `unknown message ${m.type}` };
    }
  };
  return {
    send(o: object) {
      const m = o as any;
      void Promise.resolve(answer(m)).then((r) => say({ type: m.type, rid: m.rid, ...r }));
      return true;
    },
    subscribe(f: (m: any) => void) { subs.add(f); return () => { subs.delete(f); }; },
    /** the fixture as it is now (the tests and the dev page read it) */
    peek: () => list,
    stickies: () => fx.stickies,
    reset: () => { fx = fixtureOf(now(), who, { meet: o.meet, steps: o.steps, shelf: o.shelf }); list = fx.list; },
  };
}
