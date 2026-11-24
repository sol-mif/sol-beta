// The fixture (#1604, docs/port/slices.md "Fixture or live"): the mockup's scenarios (mine/look/merge/engine.js SCEN, and
// the three runs.js and agent.js added: fresh, dev-runs, ai-night), ported as data. The panel's people only (Dev,
// Jayden, Denise, Min-ji, Sam and their AIs), never anyone's real data. Imported by the dev page (next/dev.tsx) and by
// tests only: nothing a real Sol loads imports it (next-imports.test.ts holds this), so fixture data never reaches a
// real Sol. What a slice seeds on top (stickies, the diary's book, the night's calls) is the slice's, through hooks.onLoad.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { addScen, type Arrival, type Ask, type Data, type Piece, type Scen } from "./core.ts";

// ---------------------------------------------------------------- the builders (engine.js mk, R, P, A, session)

const mk = (): Data => ({ regions: [], pieces: {}, asks: {}, ais: [] });
const R = (d: Data, id: string, name: string, kind: "code" | "life" | "mixed") => { d.regions.push({ id, name, kind }); };
const P = (d: Data, id: string, region: string, kind: string, name: string, x: Partial<Piece> = {}) => { d.pieces[id] = { id, region, kind, name, ...x }; };
const A = (d: Data, id: string, rank: number, piece: string, kind: "code" | "life", source: string, text: string, how: "inplace" | "near", x: Partial<Ask> = {}) => {
  d.asks[id] = { id, rank, piece, kind, source, text, how, answered: false, ...x };
};
const TERM = (copy: string) => [`~/${copy} $ npm test`, `  ✓ 212 passed`, `  ✕ login › keeps session`, `~/${copy} $ _`];
function session(d: Data, id: string, region: string, ai: string, copy: string, files: number, x: Partial<Piece> = {}) {
  P(d, id, region, "session", `${ai} in ${copy}`, {
    ai, copy, branch: "ai/" + copy, files, state: "working",
    term: { lines: TERM(copy), waiting: null, stateWord: "tests: 1 failing" },
    talk: [`you: take ${copy}`, `${ai}: on it. ${files} files so far.`, `${ai}: tests run on every save.`], ...x,
  });
  d.ais.push({ name: ai, piece: id });
}
function copiesPiece(d: Data, id: string, region: string, n: number, opt: { prefix?: string } = {}) {
  const st: string[] = [];
  const add = (k: number, s: string) => { for (let i = 0; i < k; i++) st.push(s); };
  if (n === 30) { add(9, "uncommitted"); add(6, "merged"); add(4, "other app"); add(3, "behind main"); add(8, "clean"); }
  else { add(Math.min(n, 2), "uncommitted"); add(Math.max(0, n - 2), "clean"); }
  // creation order: shuffled deterministically, the way a week makes them
  const rows = st.map((s, i) => ({ name: `copy-${String(i + 1).padStart(2, "0")}`, state: s }));
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  rows.forEach((r, i) => (r.name = `${opt.prefix || "fix"}-${String(i + 1).padStart(2, "0")}`));
  P(d, id, region, "copies", "side copies", { copies: rows });
}

// ---------------------------------------------------------------- the people (engine.js devData … thirtyData)

export function devData(opt: { week?: boolean; morning?: boolean } = {}): Data {
  const d = mk();
  for (const [id, n] of [["api", "api"], ["web", "web"], ["infra", "infra"], ["cli", "cli"]]) R(d, id, n, "code");
  R(d, "home", "home, errands", "life"); R(d, "money", "money", "life"); R(d, "health", "health", "life");
  const pairs: Record<string, [string, string, string, string]> = { api: ["Ada", "fix-login", "Rex", "migrate-db"], web: ["Kai", "main-check", "Lu", "nav-cleanup"], infra: ["Mo", "tf-upgrade", "Ned", "deploy-dir"], cli: ["Oz", "json-flag", "Pia", "docs-sweep"] };
  const files: Record<string, number> = { Ada: 40, Rex: 9, Kai: 3, Lu: 6, Mo: 14, Ned: 5, Oz: 4, Pia: 11 };
  for (const r in pairs) {
    const [a1, c1, a2, c2] = pairs[r];
    session(d, "s-" + a1, r, a1, c1, files[a1]); session(d, "s-" + a2, r, a2, c2, files[a2]);
    copiesPiece(d, "copies-" + r, r, r === "api" && opt.week ? 30 : 3, { prefix: r }); P(d, "arr-" + r, r, "arrivals", "arrivals", { items: [] });
  }
  if (opt.week) { // a week of arrivals: 12 a day from the 8 AIs, 2 a day accepted; today is day 7
    const order = ["Ada", "Rex", "Kai", "Lu", "Mo", "Ned", "Oz", "Pia"], what = ["notes", "a test plan", "a summary", "a sketch", "logs", "a script"];
    for (let day = 1; day <= 7; day++) for (let i = 0; i < 12; i++) {
      const ai = order[i % 8], s = d.ais.find((a) => a.name === ai)!;
      (d.pieces["arr-" + d.pieces[s.piece].region].items as Arrival[]).push({ day, ai, what: what[(day + i) % what.length], accepted: i < 2 });
    }
  }
  P(d, "lease", "home", "doc", "lease renewal", { text: "Landlord: renewal terms attached. Reply by today." });
  P(d, "errands", "home", "list", "errands", { text: "pick up parcel · call bank" });
  P(d, "budget", "money", "doc", "budget", { text: "November: on track." });
  P(d, "mia", "health", "doc", "Mia: dentist", { text: "Dentist moved Mia to 3pm Thursday." });
  if (opt.morning !== false) {
    // a session is named by its task, never its AI (Marco, 2026-11-21 11:51): "Fix login", not "Ada"
    A(d, "a1", 1, "s-Kai", "code", "Main check · check", "check broke on main: revert a1b2c?", "near", { serious: true });
    A(d, "a2", 2, "s-Ada", "code", "Fix login · collision", "collision: Fix login and Migrate db both edit session.ts. Fix login waits?", "inplace", { also: ["s-Rex"] });
    A(d, "a3", 3, "lease", "life", "landlord", "landlord: reply to lease renewal today", "inplace");
    A(d, "a4", 4, "s-Mo", "code", "Tf upgrade · limit", "Tf upgrade hit its spending limit. Raise to $20 or stop?", "inplace");
    A(d, "a5", 5, "s-Rex", "code", "Migrate db · permission", "Migrate db: allow npm run migrate?", "inplace");
    A(d, "a6", 6, "s-Ned", "code", "Deploy dir · permission", "Deploy dir: allow writing to deploy/?", "inplace");
    A(d, "a7", 7, "s-Oz", "code", "Json flag · decision", "Json flag: flag name, --json or --out?", "inplace");
    A(d, "a8", 8, "s-Ada", "code", "Fix login · change", "Fix login: change ready, 40 files. Accept?", "near");
    A(d, "a9", 9, "s-Lu", "code", "Nav cleanup · change", "Nav cleanup: change ready, 6 files. Accept?", "near");
    A(d, "a10", 10, "mia", "life", "Mia", "dentist moved Mia to 3pm. Confirm?", "inplace", { because: ["learned:5"] });   // the because (BR1 item 4): Settings' learned line 5
  }
  return d;
}
/** ✦ landing (inside.html moment 3, BR1 #1615): what a session made while kept beside the canvas, on the canvas and
 *  tied to it by `from` (plane/landed.ts): Fix login left a note in api (builder P9) */
export function landedData(): Data {
  const d = devData();
  P(d, "ada-note", "api", "doc", "session.ts: Migrate db edits it too", { text: "Fix login and Migrate db both change session.ts. I left the login half alone; merge Migrate db first?", from: "s-Ada", by: "ai" });
  return d;
}
function loopData(): Data { // 1.7 at 2am: Rex's check fails the same way seven times
  const d = devData({ morning: false });
  for (let i = 1; i <= 7; i++) A(d, "r" + i, i < 2 ? 1 : 3 + i, "s-Rex", "code", "Migrate db · check login", `Migrate db: check "login" failed again (round ${i}). Retry?`, "inplace", { same: "Rex-check-login" });
  A(d, "c1", 2, "s-Ada", "code", "Fix login · collision", "collision: Fix login and Migrate db both edit session.ts", "inplace", { also: ["s-Rex"] });
  A(d, "c2", 3, "lease", "life", "landlord", "landlord: reply today", "inplace");
  A(d, "c3", 4, "s-Ada", "code", "Fix login · change", "Fix login: change ready, 40 files", "near");
  return d;
}
function focusData(): Data { const d = devData({ morning: false }); A(d, "f1", 5, "s-Lu", "code", "Nav cleanup · change", "Nav cleanup: change ready, 6 files", "near"); return d; }
function jaydenData(): Data {
  const d = mk();
  R(d, "cs", "CS 101 (class + repo)", "mixed"); R(d, "essay", "history essay", "life"); R(d, "reading", "reading", "life"); R(d, "life", "life", "life");
  P(d, "syllabus", "cs", "doc", "syllabus", { text: "HW3: linked lists. Due tonight 11:59pm." });
  session(d, "s-Bo", "cs", "Bo", "hw3", 7);
  P(d, "paper", "essay", "doc", "the paper", { text: "The treaty changed the map of Europe because" });
  P(d, "ch4", "reading", "doc", "chapter 4", { text: "Read for tomorrow 9am." });
  P(d, "phone", "life", "list", "phone plan", { text: "renews Friday" });
  A(d, "j1", 1, "syllabus", "life", "CS 101", "HW3 due 11:59pm: 1 test still failing", "inplace");
  A(d, "j2", 2, "s-Bo", "code", "Bo · permission", "Bo: allow running the tests?", "inplace");
  A(d, "j3", 3, "ch4", "life", "reading", "chapter 4 for 9am, 22 pages", "inplace");
  return d;
}
function deniseData(eleven: boolean): Data {
  const d = mk();
  R(d, "house", "home", "life"); R(d, "kids", "kids", "life"); R(d, "work", "work draft", "life");
  P(d, "cal", "house", "list", "calendar", { text: "Thu: Mia dentist · Fri: bins" });
  P(d, "notes", "house", "doc", "notes", { text: "groceries, call mum" });
  P(d, "mia", "kids", "doc", "Mia", { text: "dentist, school form" });
  P(d, "draft", "work", "doc", "the report", { text: "Q3 summary, second draft." });
  d.ais.push({ name: "June", piece: "cal" });
  A(d, "d1", 1, "mia", "life", "June", "dentist moved Mia to 3pm. Confirm?", "inplace", { because: ["learned:5"] });
  if (eleven) A(d, "d2", 2, "mia", "life", "school", "school form due tomorrow: sign?", "inplace");
  return d;
}
function p1Data(): Data {
  const d = devData({ morning: false }); R(d, "school", "school", "life");
  P(d, "paper9", "school", "doc", "paper due 9am", { text: "Section 3. The results show" });
  A(d, "m1", 1, "s-Mo", "code", "Tf upgrade · migration", "Tf upgrade: run the migration on prod now?", "inplace", { serious: true });
  for (const [i, s] of [["m2", "s-Rex"], ["m3", "s-Ned"], ["m4", "s-Oz"], ["m5", "s-Lu"]]) { const t = String(d.pieces[s].copy).replace(/-/g, " "), T = t[0].toUpperCase() + t.slice(1); A(d, i, +i[1] + 1, s, "code", T, `${T}: allow a command?`, "inplace"); }
  return d;
}
function minjiData(): Data {
  const d = mk(); R(d, "studio", "studio: Bloom site", "mixed"); R(d, "life", "life", "life");
  P(d, "copy", "studio", "doc", "homepage copy (client voice)", { text: "Bloom grows with you." });
  P(d, "visuals", "studio", "list", "visuals", { text: "3 hero options" });
  P(d, "research", "studio", "doc", "research", { text: "competitor notes" });
  session(d, "s-Sy", "studio", "Sy", "site-copy", 5);
  A(d, "n1", 1, "copy", "life", "client", "client: approve the new headline?", "inplace");
  A(d, "n2", 2, "s-Sy", "code", "Sy · permission", "Sy: allow deploy to preview?", "inplace");
  return d;
}
const EIGHT = ["Ada", "Rex", "Kai", "Lu", "Mo", "Ned", "Oz", "Pia"];
function stressData(): Data {
  const d = mk(); R(d, "api", "api", "code");
  for (let i = 0; i < 30; i++) { const ai = i < 8 ? EIGHT[i] : null; session(d, "s" + i, "api", ai || "t" + i, "c" + String(i).padStart(2, "0"), 3); if (!ai) d.ais.pop(); }
  return d;
}
/* thirty sessions and one job split six ways (count 16); the split's parent comes first, its parts sit inside it */
function thirtyData(): Data {
  const d = mk(); R(d, "api", "api", "code");
  session(d, "s-split", "api", "Vi", "split-auth", 12, { parts: [], splitBy: "Vi" }); d.pieces["s-split"].talk!.push("Vi: split this into 6 parts.");
  /* the parts live inside their parent (runs.js's shape: p.parts[], each {id:'<parent>.pN', part:true, …}), never as pieces of their own */
  ["Wu", "Xa", "Yo", "Zed", "Ama", "Bea"].forEach((ai, i) => {
    const copy = "split-auth-" + (i + 1);
    d.pieces["s-split"].parts!.push({
      id: "s-split.p" + (i + 1), kind: "session", part: true, region: "api", ai,
      name: ["the session store", "the login form", "npm deps", "the logout path", "the error copy", "the tests"][i], copy, branch: "ai/" + copy, files: 2 + i, state: i === 5 ? "done" : "working",
      term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: i === 5 ? "tests: all passing" : "tests: 1 failing" }, talk: [`Vi: ${ai}, take part ${i + 1}.`, `${ai}: on it.`], cost: 0,
    });
  });
  for (let i = 0; i < 30; i++) { const ai = i < 8 ? EIGHT[i] : null; session(d, "s" + i, "api", ai || "t" + i, "c" + String(i).padStart(2, "0"), 3); if (!ai) d.ais.pop(); }
  A(d, "t1", 1, "s-split", "code", "Yo · permission", "Yo (part 3 of Vi's split): allow npm install?", "inplace", { part: "s-split.p3" });
  A(d, "t2", 2, "s4", "code", "Mo · limit", "Mo hit its spending limit. Raise to $20 or stop?", "inplace");
  return d;
}

// ---------------------------------------------------------------- runs.js's two: Sam's empty plane, Dev's runs mid-night

const STOP = new Set(["the", "a", "an", "in", "on", "of", "to", "for", "and", "with", "please", "our", "my", "this", "that", "it"]);
const slug = (w: string) => String(w || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x)).slice(0, 3).join("-") || "task";
function machineOf(p: Piece, d: Data): string {
  if (typeof p.machine === "string") return p.machine;
  const r = d.regions.find((x) => x.id === p.region);
  if (!r || r.kind === "life") return "this Mac";
  const code = d.regions.filter((x) => x.kind !== "life");
  return code.indexOf(r) % 2 ? "the second box" : "the build server";
}
function partOf(parent: Piece, i: number, ai: string, words: string, d: Data): Piece {
  const id = `${parent.id}.p${i + 1}`, copy = `${parent.copy}-${slug(words).split("-")[0]}`;
  return { id, kind: "session", part: true, region: parent.region, ai, name: words, words, copy, branch: "ai/" + copy, files: 0, state: "working",
    term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: "just started" }, talk: [`${parent.ai}: ${ai}, take “${words}”.`, `${ai}: on it.`], cost: 0, machine: machineOf(parent, d) };
}
const NOTES = { code: ["session.ts: the token stays after logout", "login.test.ts: one case is still skipped", "flags.ts: --out is never read"] };
function freshData(): Data {
  const d = mk();
  d.regions.push({ id: "api", name: "api", kind: "code" }, { id: "notes", name: "notes", kind: "life" });
  d.crew = [{ name: "Ada", region: "api" }, { name: "Rex", region: "api" }, { name: "June", region: "notes" }];
  return d;
}
function devRunsData(): Data {
  const d = devData({ morning: false }), Pc = d.pieces;
  // api: Ada split the login job four ways; Rex works the same file, so one collision ask sits on both faces
  Object.assign(Pc["s-Ada"], { words: "fix the login bug", touch: ["src/auth/session.ts"] });
  Object.assign(Pc["s-Rex"], { words: "move sessions to the new table", touch: ["src/auth/session.ts", "src/db/migrate.ts"] });
  const parts: [string, string, number, string][] = [["Ada", "keep the session after refresh", 14, "working"], ["Rex", "write the login tests", 6, "working"], ["Kai", "fix the logout path", 9, "working"], ["Lu", "reword the error copy", 3, "done"]];
  const ada = Pc["s-Ada"];
  ada.parts = parts.map(([ai, w, files, st], i) => Object.assign(partOf(ada, i, ai, w, d), {
    files, state: st,
    term: { lines: [`~/${ada.copy}-${w.split(" ")[0]} $ npm test`, `  ✓ ${40 + files * 3} passed`, ...(st === "done" ? [] : [`  ✕ ${w.split(" ").slice(-2).join(" ")} › still fails`]), `~/${ada.copy}-${w.split(" ")[0]} $ _`], waiting: null, stateWord: st === "done" ? "tests: all passing" : "tests: 1 failing" },
  }));
  ada.splitBy = "Ada";
  d.asks.k1 = { id: "k1", rank: 1, piece: "s-Ada", part: "s-Ada.p2", kind: "code", source: "Rex · write the login tests", text: "write the login tests: allow npm run migrate?", how: "inplace", answered: false };
  d.asks.k2 = { id: "k2", rank: 2, piece: "s-Ada", kind: "code", source: "Fix login · collision", text: "Fix login and Migrate db both edit session.ts. Migrate db waits?", how: "inplace", answered: false, also: ["s-Rex"], collide: ["s-Ada", "s-Rex"], act: { move: "wait", args: ["s-Rex"] } };
  // web: Kai is done, checked by Rex, its changes wait one at a time; Lu made a page that is placed beside it, and stills still in arrivals
  Object.assign(Pc["s-Kai"], { state: "done", words: "make the main check green", checked: { by: "Rex", notes: NOTES.code.slice(0, 2) } });
  const nav = "Six links became four. “Docs” and “Guides” are one menu now; the search moved to the right.";
  Object.assign(Pc["s-Lu"], { words: "clean up the nav", arrivals: [{ id: "blk-1", kind: "page", title: "The nav, before and after", text: nav, by: "Lu", placed: true },
    { id: "blk-2", kind: "stills", title: "The nav on three phone sizes", text: "", by: "Lu", placed: false }] });
  Pc["blk-1"] = { id: "blk-1", region: "web", kind: "block", block: "page", name: "The nav, before and after", text: nav, by: "Lu", joined: "s-Lu" };
  // infra: Mo's machine stopped answering at 2:14
  d.machines = { "the second box": { up: false, since: "2:14" } }; Pc["s-Mo"].machine = "the second box"; Pc["s-Ned"].machine = "the build server";
  d.asks.k3 = { id: "k3", rank: 3, piece: "s-Mo", kind: "code", source: "Tf upgrade · limit", text: "Tf upgrade hit its spending limit. Raise to $20 or stop? (its machine is out of reach since 2:14)", how: "inplace", answered: false };
  // cli: a row that runs, kept as a way of working; Oz and Pia on the same branch, so a group is offered with its evidence
  Object.assign(Pc["s-Oz"], { touch: ["docs/flags.md"], branch: "ai/flags" }); Object.assign(Pc["s-Pia"], { touch: ["docs/flags.md"], branch: "ai/flags" });
  Pc["row-1"] = { id: "row-1", region: "cli", kind: "row", name: "Ship a flag", steps: [{ what: "Write the flag", st: "done" }, { what: "Update the docs", st: "running" }, { what: "Open a pull request", st: "waits" }], kept: true, when: "Fridays 16:00", running: true };
  d.asks.k4 = { id: "k4", rank: 4, piece: "s-Oz", kind: "code", source: "grouping", text: "Group Oz and Pia? same files: docs/flags.md · same branch: ai/flags.", how: "inplace", answered: false, also: ["s-Pia"],
    evidence: ["same files: docs/flags.md", "same branch: ai/flags"], act: { move: "group", args: [["s-Oz", "s-Pia"], ["same files: docs/flags.md", "same branch: ai/flags"], { confirmed: true }] } };
  return d;
}

// ---------------------------------------------------------------- agent.js's: Dev's morning after the one voice ran the night

/** the one voice's name (agent.js VOICE) */
export const VOICE = "Your AI";
/** the data only: the morning's asks gone (the night makes its own), Dev's reach settings, Ada's files. The night itself
 *  (agent.js handPlaced, night) is slice 5's: it runs from a hooks.onLoad when SCN is "ai-night" */
function aiNightData(): Data {
  const d = devData();
  for (const k of Object.keys(d.asks)) delete d.asks[k];
  d.aiSet = { [VOICE]: { reach: "goes ahead", limit: 10 }, Ada: { reach: "goes ahead" }, Kai: { reach: "goes ahead" }, Lu: { reach: "goes ahead" }, Pia: { reach: "goes ahead" } };
  Object.assign(d.pieces["s-Ada"], { words: "fix the login bug", touch: ["src/auth/session.ts"] });
  return d;
}

// ---------------------------------------------------------------- routines (engine.js ROUTINES): what each AI does on a clock

const ROUTINES: Record<string, [string, string][]> = {
  Ada: [["Run the login tests on every push", "every push"], ["Sum up last night's changes in api", "every morning 7:30"]],
  Rex: [["Check the database backups restore", "every night 2:00"], ["Retry failed migrations once", "when one fails"]],
  Kai: [["Check main builds", "every hour"], ["Tell you when main breaks", "when it breaks"]],
  Lu: [["Tidy unused styles in web", "Fridays 16:00"], ["Screenshot the nav on phone sizes", "every push"]],
  Mo: [["Plan the infra changes, never apply", "every morning 6:00"], ["Watch this month's cloud spend", "every evening 20:00"]],
  Ned: [["Sweep the deploy folder for old builds", "Sundays 3:00"], ["Check certificates expire in time", "every Monday 9:00"]],
  Oz: [["Run the cli on the sample files", "every push"], ["Note new flags in the changelog", "every Friday 17:00"]],
  Pia: [["Fix broken links in the docs", "every night 1:00"], ["Keep the README examples running", "every push"]],
  Bo: [["Run the HW tests before each deadline", "an hour before due"], ["Sum up the lecture notes", "after each class"], ["List what is due this week", "Sundays 18:00"]],
  June: [["School mail into the calendar", "every morning 7:00"], ["Remind you of the bins", "Thursdays 20:00"], ["Gather the week's appointments", "Sundays 17:00"]],
  Sy: [["Check the preview site loads", "every deploy"], ["Collect client comments into one list", "every evening 18:00"]],
};
/** a scenario's data with its AIs' routines, as engine.js load() added them */
const withRoutines = (f: () => Data) => (): Data => {
  const d = f();
  d.routines = d.routines || d.ais.flatMap((a) => (ROUTINES[a.name] || []).map(([what, when]) => ({ ai: a.name, what, when })));
  return d;
};

// ---------------------------------------------------------------- the table (engine.js SCEN, in its order, then the added three)

export const FIXTURE: Record<string, Scen> = {
  "dev-morning": { label: "Dev · morning, 10 asks", data: () => devData(), start: "far" },
  "dev-landed": { label: "Dev · Fix login left a note on the canvas (✦)", data: () => landedData(), start: "far" },
  "dev-focus": { label: "Dev · 40-file diff, tests", data: focusData, start: { piece: "s-Ada" } },
  "dev-week": { label: "Dev · a week, 30 copies", data: () => devData({ week: true, morning: false }), start: { region: "api" } },
  "loop": { label: "Dev · 2am check loop", data: loopData, start: "far" },
  "p1": { label: "P1 · 11pm, 8 AIs + paper", data: p1Data, start: { piece: "paper9" } },
  "jayden": { label: "Jayden · 11pm", data: jaydenData, start: "far" },
  "denise": { label: "Denise · morning", data: () => deniseData(false), start: "far" },
  "denise11": { label: "Denise · 11pm", data: () => deniseData(true), start: "far" },
  "minji": { label: "Min-ji · studio (P5)", data: minjiData, start: { piece: "copy" } },
  "stress": { label: "30 terminals, 8 AIs", data: stressData, start: { region: "api" } },
  "thirty": { label: "Dev · 30 sessions and a split", data: thirtyData, start: { region: "api" } },
  "fresh": { label: "Sam · a fresh plane", data: freshData, start: "far" },
  "dev-runs": { label: "Dev · runs on the plane", data: devRunsData, start: { region: "api" } },
  "ai-night": { label: "Dev · morning, after the one voice ran the night", data: aiNightData, start: "far" },
};
for (const [name, s] of Object.entries(FIXTURE)) addScen(name, { ...s, data: withRoutines(s.data) });
