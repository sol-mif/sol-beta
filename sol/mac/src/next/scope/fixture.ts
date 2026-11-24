// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// dev-500 (#1615; merge/scope.js fiveHundred and grow, as they are): Dev's own setup, grown to 46 places and exactly 500
// things, by the mockup's generator with its name templates (a seeded stream, so every run is the same canvas). The
// panel's person only, no one else's data. Fixture only: the dev page loads it by one line (dev.tsx), and nothing in a
// real Sol imports it. Dev's own data is dev-morning's (SCEN), so this file never imports the fixture itself.
// Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import { SCEN, addScen, type Data, type Piece, type Scen } from "../cv/core.ts";
import { GROW, VOICE } from "./rules.ts";

const CODE = [["auth", "api: auth", "auth"], ["billing", "api: billing", "billing"], ["search", "api: search", "search"], ["checkout", "web: checkout", "checkout"], ["settings", "web: settings", "settings page"],
  ["onboard", "web: onboarding", "onboarding"], ["queues", "infra: queues", "queue"], ["costs", "infra: costs", "cloud bill"], ["dns", "infra: dns", "dns"], ["plugins", "cli: plugins", "plugin"],
  ["release", "cli: releases", "release"], ["mobile", "mobile (repo)", "mobile app"], ["docs", "docs (repo)", "docs"], ["design", "design system", "design tokens"], ["data", "data pipeline", "pipeline"],
  ["status", "status page", "status page"]];
/** Dev's work that is pages and stickies, not code: drawn as life places */
const LIFE = [["support", "support inbox", "support"], ["launch", "launch", "launch"], ["growth", "growth", "growth"], ["hiring", "hiring", "hiring"], ["car", "car", "car"], ["taxes", "taxes 2026", "tax return"], ["lisbon", "trip to Lisbon", "Lisbon trip"], ["garden", "garden", "garden"], ["gym", "gym", "gym"], ["books", "books", "reading list"],
  ["recipes", "recipes", "recipes"], ["gifts", "gifts", "gifts"], ["insurance", "insurance", "insurance"], ["phone", "phone and internet", "phone plan"], ["school", "Mia’s school", "school"],
  ["move", "the move", "move"], ["friends", "friends", "dinner"], ["photos", "photos", "photo album"], ["bike", "bike", "bike"], ["rust", "course: Rust", "Rust course"], ["side", "side project", "side project"],
  ["volunteer", "volunteering", "food bank shift"], ["visit", "mum’s visit", "mum’s visit"]];
const CT = ["fix the {t} tests", "{t} migration", "{t} rate limits", "clean up the {t} logs", "the {t} error copy", "speed up the {t}", "{t} notes", "{t} on-call runbook", "retry failed {t} jobs", "{t} flags", "{t} review", "{t} metrics", "{t} alerts", "{t} docs pass"];
const LT = ["Plan the {t}", "Pay for the {t}", "Call about the {t}", "Notes on the {t}", "Sort the {t} papers", "{t}: what to buy", "{t}: ideas", "Book a time for the {t}", "Check the {t} dates", "Budget for the {t}", "Ask about the {t}", "{t} checklist", "Find the {t} receipts", "Photos for the {t}"];
const AIN = ["Ada", "Rex", "Kai", "Lu", "Mo", "Ned", "Oz", "Pia"];
type Link = { a: string; b: string; kind: string; by: string };

export function fiveHundred(): Data {
  const d = SCEN["dev-morning"].data();
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const P = (id: string, region: string, kind: string, name: string, x: Record<string, unknown> = {}) => (d.pieces[id] = { id, region, kind, name, ...x } as Piece);
  let n = 0;
  const nid = () => "g" + String(++n).padStart(3, "0");
  const doneAt = (days: number) => -Math.round(days * 1440) - ((n * 37) % 600);
  for (const [id, name] of CODE) d.regions.push({ id, name, kind: "code" });
  for (const [id, name] of LIFE) d.regions.push({ id, name, kind: "life" });
  // each grown place: ten to fourteen things, two of three done (some long ago), a few still open
  const place = (rid: string, t: string, code: boolean) => {
    const k = 10 + Math.floor(rnd() * 5), T = code ? CT : LT, ids: string[] = [];
    let base = 0;
    for (let i = 0; i < k; i++) {
      const kind = code ? "session" : i % 3 === 2 ? "doc" : i % 5 === 4 ? "list" : "sticky", x: Record<string, unknown> = {};
      // a name once in its place: the templates walked in turn from a start (round 9 fixes, F3)
      const j = Math.floor(rnd() * 3);
      if (i === 0) base = j;
      const name = T[(base + i) % T.length].replace("{t}", t), done = code || rnd() < 0.68, days = done ? (i > 0 && rnd() < 0.7 ? 8 + rnd() * 80 : rnd() * 6) : null, id = nid();
      if (done) { x.state = "done"; x.ended = doneAt(days as number); }
      if (kind === "session") {
        const ai = pick(AIN), copy = rid + "-" + (i + 1);
        Object.assign(x, { ai, copy, branch: "ai/" + copy, files: 2 + Math.floor(rnd() * 20), state: "done", ended: (x.ended as number | undefined) ?? doneAt(1 + rnd() * 40),
          term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: "tests: all passing" }, talk: [`you: ${ai}, ${name}`, `${ai}: done. All passing.`], cost: 0 });
        x.changes = Array.from({ length: x.files as number }, (_, j) => ({ file: `src/${rid}/file${j + 1}.ts`, a: (j * 7) % 23 + 1, r: (j * 3) % 9, st: "accepted" }));
        P(id, rid, "session", `${ai} in ${copy}`, x);
      } else if (kind === "sticky") P(id, rid, "sticky", name, { words: name, by: "person", state: x.state || "open", at: ((x.ended as number | undefined) ?? -1440) - 1440 * (1 + Math.floor(rnd() * 4)), due: null, allDay: false, ended: x.ended,
        made: rnd() < 0.3 ? [{ id: id + ".m1", by: VOICE, kind: "doc", title: `${name} · a page`, text: `What I found for “${name}”.`, state: "kept", at: ((x.ended as number | undefined) ?? -60) - 30 }] : [] });
      else P(id, rid, kind, name, { text: kind === "list" ? `${t} · first · then · last` : `${name}: where it stands.`, ...x });
      ids.push(id);
    }
    return ids;
  };
  const G: Record<string, string[]> = {};
  for (const [rid, , t] of CODE) G[rid] = place(rid, t, true);
  for (const [rid, , t] of LIFE) G[rid] = place(rid, t, false);
  // Dev reopened two done things later than a week: his span is learned from that (rules.ts span)
  d.pieces[G.taxes[1]].reopened = 9; d.pieces[G.car[2]].reopened = 11;
  // the hub: the v2 launch plan, and what hangs off it (the most-linked thing; count 39 focuses it)
  const hub = "g-hub";
  P(hub, "launch", "doc", "the v2 launch plan", { text: "What ships on launch day, in what order, and who checks it." });
  const links: Link[] = ((d as { links?: Link[] }).links ||= []);
  const L = (a: string, b: string, kind: string, by = "person") => { if (d.pieces[a] && d.pieces[b]) links.push({ a, b, kind, by }); };
  const liveIn = (rid: string) => G[rid].filter((id) => d.pieces[id].state !== "done"), any = (rid: string) => G[rid];
  for (const id of [...liveIn("launch").slice(0, 3), ...liveIn("growth").slice(0, 2), liveIn("support")[0]]) L(id, hub, "part of");
  for (const s of ["s-Ada", "s-Kai", "s-Pia"]) L(s, hub, "uses", "sol");
  L(liveIn("costs")[0] || any("costs")[0], hub, "blocks"); L(liveIn("dns")[0] || any("dns")[0], hub, "blocks");
  P("g-post", "launch", "doc", "the launch post", { text: "From the plan: what we built, and Thursday." }); L("g-post", hub, "made from", "sol");
  P("g-mail", "growth", "doc", "the launch email", { text: "From the plan: three lines and a link." }); L("g-mail", hub, "made from", "sol");
  P("g-old", "support", "doc", "the v2 launch plan (old copy)", { text: "What ships on launch day: the first draft." }); L("g-old", hub, "same as", "sol");
  // the rest: things in a place that use each other, and some that block a thing elsewhere
  for (const rid of Object.keys(G)) { const ids = G[rid]; for (let i = 0; i + 1 < ids.length && i < 4; i += 2) L(ids[i], ids[i + 1], rnd() < 0.5 ? "uses" : "part of", rnd() < 0.4 ? "sol" : "person"); }
  const all = Object.keys(G);
  for (let i = 0; i < 8; i++) { const a = pick(all), b = pick(all); if (a === b) continue; const x = liveIn(a)[0], y = liveIn(b)[0]; if (x && y) L(x, y, "blocks"); }
  // three asks of their own, where a place is waiting on Dev
  const ask = (id: string, rank: number, pid: string, source: string, text: string) => { if (d.pieces[pid]) d.asks[id] = { id, rank, piece: pid, kind: "life", source, text, how: "inplace", answered: false }; };
  ask("g1", 11, G.costs[0], "infra: costs", "the cloud bill is 30% over last month: look now?");
  ask("g2", 12, liveIn("taxes")[0] || "g-hub", "taxes 2026", "the tax return is due Monday: start it?");
  ask("g3", 13, liveIn("school")[0] || "g-hub", "Mia’s school", "the school trip form: sign it?");
  // the plan first in its place's pages, as a person keeps the thing they work from on top
  const ps = d.pieces, first = ["g-hub", "g-post"];
  d.pieces = {};
  for (const id of first) d.pieces[id] = ps[id];
  for (const [id, p] of Object.entries(ps)) if (!first.includes(id)) d.pieces[id] = p;
  return d;
}

/** after the life seeds (life's own, through hooks.onLoad): exactly 500 things */
export function grow(D: Data): void {
  const ids = Object.keys(D.pieces), links = (D as { links?: Link[] }).links || [];
  let k = ids.length;
  const spare = ids.filter((id) => /^g\d/.test(id) && D.pieces[id].state === "done" && !links.some((l) => l.a === id || l.b === id) && !Object.values(D.asks).some((a) => a.piece === id)).reverse();
  while (k > 500 && spare.length) { delete D.pieces[spare.shift()!]; k--; }
  for (let i = 0; k < 500; i++, k++) { const id = "g-x" + i; D.pieces[id] = { id, region: "side", kind: "sticky", name: `Side idea ${i + 1}`, words: `Side idea ${i + 1}`, by: "person", state: "done", at: -1440 * 40, ended: -1440 * (30 + i), due: null, allDay: false, made: [] }; }
}

/** the scenario, for the dev page's table (dev.tsx adds it to FIXTURE, so ?scen= finds it) */
export const SCOPE: Record<string, Scen> = { "dev-500": { label: "Dev · 500 things", data: fiveHundred, start: "far" } };
for (const [name, s] of Object.entries(SCOPE)) addScen(name, s);
GROW["dev-500"] = grow;   // run by the scope's load, after the life seeds and before the links (merge/scope.js CV.onLoad)
