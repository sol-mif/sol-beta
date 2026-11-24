// Round 7's scenarios (#1615; merge/lead.js "the scenarios"), the panel's people only (Dev, his AIs, Joon from Dev's own
// Cowork), fixture only: the dev page loads this by one line (dev.tsx), and nothing in a real Sol imports it.
//   dev-launch  Dev's morning and a launch folder: Ada's job of a sticky and a page
//   dev-8       Dev, week one, 8 AIs
//   dev-80      80 AIs under 5 leads, one on its own, a lapsed GitHub sign-in holding 12 of them
//   &r7=join,hand,back,change   the steps, in order, after the load (lead.js STEP; for stills and trying it)
// Dev's own data is dev-morning's (SCEN), so this file never imports the fixture itself (next-imports.test.ts).
// Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { M, SCEN, addScen, hooks, type Data, type Piece, type Routine, type Scen } from "../cv/core.ts";

/** Dev's morning, as the fixture makes it (engine.js devData, with its AIs' routines) */
const devData = (): Data => SCEN["dev-morning"].data();

/** names for the AIs under a lead: made from sounds, deterministic, never one of the panel's own */
export function names(n: number, taken: Set<string>): string[] {
  const C = "BDFGHJKLNPRSTVWZ", V = "aeiou", E = "nxlrs", out: string[] = [];
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  while (out.length < n) { const w = C[Math.floor(rnd() * C.length)] + V[Math.floor(rnd() * V.length)] + E[Math.floor(rnd() * E.length)]; if (!taken.has(w)) { taken.add(w); out.push(w); } }
  return out;
}
const WORK: Record<string, string[]> = {
  api: ["the rate limiter", "the auth tokens", "the session store", "the user search", "the billing hooks", "the export job", "the audit log", "the webhooks", "the cache keys", "the error codes",
    "the pagination", "the admin routes", "the health check", "the retry queue", "the upload limits", "the invite flow", "the API keys", "the password reset", "the org roles", "the sandbox", "the logs", "the metrics"],
  web: ["the checkout", "the nav", "the pricing page", "the sign-up", "the settings page", "the empty states", "the dark theme", "the search box", "the toasts", "the footer", "the 404 page", "the onboarding", "the forms", "the tables", "the charts", "the avatars", "the help menu"],
  mobile: ["the push alerts", "the offline mode", "the login screen", "the share sheet", "the widgets", "the deep links", "the camera", "the app icon", "the haptics", "the store page", "the crash fixes", "the settings", "the tab bar"],
  docs: ["the quick start", "the API reference", "the guides", "the changelog", "the examples", "the search", "the glossary", "the tutorials"],
  growth: ["the welcome emails", "the referral page", "the ads copy", "the landing tests", "the price test", "the newsletter", "the waitlist", "the social posts", "the case study", "the webinar", "the survey", "the SEO pages"],
};
type TeamOpt = { held?: number; done?: number; files?: number; outcome?: string };
function team(d: Data, rid: string, lead: string, copy: string, words: string, n: number, pool: string[], o: TeamOpt = {}): void {
  const id = "run-" + rid, ps: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const ai = pool.shift()!, nm = WORK[rid][i % WORK[rid].length], c = `${copy}-${i + 1}`, st = o.done && i >= n - o.done ? "done" : "working";
    ps.push({ id: `${id}.p${i + 1}`, kind: "session", part: true, region: rid, ai, name: nm, words: nm, copy: c, branch: "ai/" + c, files: 2 + (i * 7) % 11, state: st,
      term: { lines: [`~/${c} $ _`], waiting: null, stateWord: st === "done" ? "tests: all passing" : "tests: running" }, talk: [`${lead}: ${ai}, take ${nm}.`, `${ai}: on it.`], cost: 0,
      ...(o.held && i < o.held ? { blocked: "gh" } : {}) });
    d.ais.push({ name: ai, piece: id, under: lead });
  }
  d.pieces[id] = { id, region: rid, kind: "session", name: `${lead} in ${copy}`, ai: lead, copy, branch: "ai/" + copy, files: o.files || 12, state: "working", words,
    term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: "tests: all passing" }, talk: [`you: ${words}`, `${lead}: split into ${n} parts.`], parts: ps, splitBy: lead, outcome: o.outcome };
  if (!d.ais.some((a) => a.name === lead)) d.ais.push({ name: lead, piece: id });
}
export function eightyData(): Data {
  const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] }, R = (id: string, name: string, kind: "code" | "life") => d.regions.push({ id, name, kind });
  R("api", "api (repo)", "code"); R("web", "web (repo)", "code"); R("mobile", "mobile (repo)", "code"); R("docs", "docs (repo)", "code"); R("growth", "growth", "code"); R("launch", "launch", "code");
  R("infra", "infra (repo)", "code"); R("cli", "cli (repo)", "code"); R("home", "home, errands", "life");
  const taken = new Set(["Ada", "Cole", "Eli", "Fay", "Gus", "Kai", "Lu", "Hal", "Mo", "Rex", "Ned", "Oz", "Pia", "Bo", "June", "Sy", "Joon", "Ana", "Ravi", "Mia", "Dev", "Sol"]), pool = names(80, taken);
  team(d, "api", "Ada", "api-v2", "ship the v2 API", 22, pool, { held: 7, done: 5, files: 41, outcome: "41 parts closed tonight." });
  team(d, "web", "Cole", "web-refresh", "refresh the web app", 17, pool, { held: 5, done: 3, outcome: "The new checkout is in review." });
  team(d, "mobile", "Eli", "mobile-3", "ready mobile 3.0", 13, pool, { done: 4, outcome: "Builds pass on both phones." });
  team(d, "docs", "Fay", "docs-v2", "docs for the v2 API", 8, pool, { done: 2, outcome: "Six guides drafted." });
  team(d, "growth", "Gus", "growth-q4", "the Q4 growth push", 12, pool, { done: 6, outcome: "Two tests ready to start." });
  d.pieces["launch-job"] = { id: "launch-job", region: "launch", kind: "job", name: "the launch", ai: "Ada", copy: "launch", words: "get the launch ready for Thursday", outcome: "Venue booked; the post waits on Joon.",
    parts: [{ id: "launch-job.p1", kind: "sticky", part: true, region: "launch", ai: "Ada", name: "book the venue", text: "Hall B, Thursday 18:00, booked.", state: "done" },
      { id: "launch-job.p2", kind: "page", part: true, region: "launch", ai: "Lu", name: "the launch post", text: "We built hollow for the nights you can’t stop thinking about work.", state: "working" },
      { id: "launch-job.p3", kind: "session", part: true, region: "launch", ai: "Kai", name: "the landing page", words: "the landing page", copy: "launch-landing", branch: "ai/launch-landing", files: 6, state: "working",
        term: { lines: ["~/launch-landing $ _"], waiting: null, stateWord: "tests: all passing" }, talk: ["Kai: on it."], cost: 0 }] };
  d.ais.push({ name: "Kai", piece: "launch-job", under: "Ada" }, { name: "Lu", piece: "launch-job", under: "Ada" });
  d.pieces["s-Hal"] = { id: "s-Hal", region: "infra", kind: "session", name: "Hal in tf-watch", ai: "Hal", copy: "tf-watch", branch: "ai/tf-watch", files: 0, state: "paused", words: "watch the deploy queue",
    term: { lines: ["~/tf-watch $ _"], waiting: null, stateWord: "resting" }, talk: ["Hal: resting until the next deploy."], cost: 0 };
  d.ais.push({ name: "Hal", piece: "s-Hal" });
  d.pieces.relnotes = { id: "relnotes", region: "cli", kind: "doc", name: "release checklist", text: "Nothing changed since Monday." };
  d.pieces.errands = { id: "errands", region: "home", kind: "list", name: "errands", text: "pick up parcel · call bank" };
  const api = d.pieces["run-api"].parts!, web = d.pieces["run-web"].parts!;
  const ask = (id: string, rank: number, pid: string, part: string, source: string, text: string) => { d.asks[id] = { id, rank, piece: pid, part, kind: "code", source, text, how: "inplace", answered: false }; };
  ask("e1", 1, "run-api", "run-api.p9", `${api[8].ai} · migration`, "run the migration on staging now?");
  ask("e2", 2, "run-api", "run-api.p10", `${api[9].ai} · schema`, "drop the old sessions table, or keep it a week?");
  ask("e3", 3, "run-web", "run-web.p7", `${web[6].ai} · copy`, "the checkout button: “Pay” or “Buy now”?");
  d.lapsed = { gh: { since: "05:12", by: "12 AIs in api and web" } };
  // the AIs' routines, as engine.js load() gave every scenario (the panel's AIs have theirs; the rest none)
  const rts = (devData().routines || []) as Routine[];
  d.routines = rts.filter((r) => d.ais.some((a) => a.name === r.ai));
  return d;
}
export function launchData(): Data {
  const d = devData();
  d.regions.push({ id: "launch", name: "launch", kind: "code" });
  d.pieces["launch-job"] = { id: "launch-job", region: "launch", kind: "job", name: "the launch", ai: "Ada", copy: "launch", words: "get the launch ready for Thursday", outcome: "The venue is drafted; the post has a first draft.",
    parts: [{ id: "launch-job.p1", kind: "sticky", part: true, region: "launch", ai: "Ada", name: "book the venue", text: "Hall B, Thursday 18:00, 60 seats. Drafted; it waits for your Send.", state: "done" },
      { id: "launch-job.p2", kind: "page", part: true, region: "launch", ai: "Ada", name: "the launch post", text: "We built hollow for the nights you can’t stop thinking about work. Thursday, Hall B, 18:00.", state: "working" }] };
  d.asks.l1 = { id: "l1", rank: 11, piece: "launch-job", part: "launch-job.p1", kind: "code", source: "Ada · the launch", text: "send the venue booking? Hall B, Thursday 18:00.", how: "inplace", answered: false };
  return d;
}

/** the three scenarios, for the dev page's table (dev.tsx adds them to FIXTURE, so ?scen= finds them) */
export const LEAD: Record<string, Scen> = {
  "dev-launch": { label: "Dev · a launch across kinds", data: launchData, start: "far" },
  "dev-8": { label: "Dev · week one, 8 AIs", data: devData, start: "far" },
  "dev-80": { label: "Dev · 80 AIs", data: eightyData, start: "far" },
};
for (const [name, s] of Object.entries(LEAD)) addScen(name, s);

/** the steps, for stills and trying it: &r7=join,hand,back,change */
export const STEP: Record<string, () => unknown> = {
  join: () => M.join_piece("launch-job", "Kai", "the landing page"),
  hand: () => M.hand_part("launch-job", "launch-job.p2", "Joon"),
  back: () => M.part_returns("launch-job", "launch-job.p2", "tightened the opening and put the date first", "Thursday, Hall B, 18:00. hollow is for the nights work won’t leave you alone."),
  change: () => M.change_lead("launch-job", "Kai"),
};
// the dev page's first load takes the address's steps, once it has drawn
let booted = false;
hooks.onLoad.push(() => {
  if (booted || typeof location === "undefined") return;
  booted = true;
  const steps = (new URLSearchParams(location.search).get("r7") || "").split(",").filter((s) => STEP[s]);
  if (steps.length) queueMicrotask(() => { for (const s of steps) STEP[s](); });
});
(hooks as unknown as { leadSteps?: unknown }).leadSteps = STEP;
