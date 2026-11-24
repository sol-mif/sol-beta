// The persona fixtures (#1617 Harmony slice S30): five persona months and three nights, the same acts every slice's
// node --test reads. Run from sol/engine: `npx tsx src/next/fixtures/make.mjs` (tsx, because the relevance order is port
// S7's own rank, next/needs.ts, imported as it is). Every file comes out byte-for-byte the same on every run: a fixed
// start (2026-10-01, UTC), a seeded generator per person, no clock and no machine read. fixtures.test.ts makes them
// again into a temp folder and compares the bytes.
// The people are the panel's only (docs/marketing/brand/pack/panel.md): their name, age and setting, never the quoted
// source behind them and never a real person's data. What each person does in a month is derived from their panel
// entry plus the acts the Harmony slices' "Works when" lines need (each head line names both, in `from`).
// A file is JSON lines: a head line {fixture, person…, from, named}, one line per act in time order, then one end line
// per month or night {end, acts, open, order}: the asks still open at the end, and the relevance order of the places.
// An act: {id, at (ms, UTC), day, who ("<Person>" | "ai:<seat>" | "sol"), act, place, …its fields}. The kinds:
//   say {words, via}                         piece.split {piece, parts:[{id, kind:"sticky"|"session"|"person", hands, words}]}
//   piece.lead {piece, ai}                   piece.state {piece, line} (written by the lead)     done {piece}
//   plan {seat, run, todos|plan}             (a Claude Code todo list, or a Codex plan, as each seat writes it)
//   run.start {run, part, seat, model, machine}           run.end {run, part, outcome, changed}
//   check {run, what, ok}                    try {piece, n}
//   link {from, to, kind:"made_from"|"part_of"|"uses"|"blocks"|"same_as", by}
//   ask {ask, cause?, run?, need:{src:"perm"|"thing"|"stage"|"draft", …the needs.ts input}}      answer {ask, yes}
//   undo {of}                                fit.set {knob, scope, take, author, reason?}       fit.back {knob, scope}
//   offer {offer, knob, scope, take, mode, structural}    keep {offer}    notnow {offer}
//   fact {fact, source}                      upkeep {kind, finding, blocked}     update {from, to}
//   away {until} · back {} · interrupt {} · pause {}     way.make {way, fits}   way.give {way, to}
// The relevance order is port S7's needs.ts rank: each place takes the best rank of the needs open on it (rankNeeds over
// the open asks), places with none come after; ties by the place's count of acts, most first, then by name.
// Signed: franktsai2008-eng's agent, Harmony slice S30 (#1617).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankNeeds } from "../needs.js";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const MONTHS = ["dev", "denise", "minji", "tomas", "lucy"];
export const FILES = [...MONTHS.map((p) => `${p}-month.jsonl`), "nights-3-40-400.jsonl"];
const START = Date.UTC(2026, 9, 1);   // 2026-10-01, a Thursday
const DAYS = 30;

/** a small seeded generator (mulberry32): the same seed, the same month */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p };
}

/** one story: acts added in any order, written in time order (ties in the order added) */
function story(short, who) {
  const acts = [];
  let k = 0, asks = 0, runs = 0;
  const at = (day, h, m = 0) => START + ((day - 1) * 24 + h) * 3600e3 + m * 60e3;
  const s = {
    short, who, at,
    add(day, h, m, by, act, place, o = {}) { const id = `${short}-${++k}`; acts.push({ id, at: at(day, h, m), day, who: by, act, place, ...o }); return id; },
    run() { return `${short}-r${++runs}`; },
    ask(day, h, m, by, place, need, o = {}) { const id = `${short}-a${++asks}`; s.add(day, h, m, by, "ask", place, { ask: id, ...o, need }); return id; },
    acts: () => acts.map((a, ix) => ({ a, ix })).sort((x, y) => x.a.at - y.a.at || x.ix - y.ix).map((x) => x.a),
  };
  return s;
}

// the needs.ts inputs, as each store has them (needs.ts NeedsIn), with the source named
const perm = (run, item, tool, command) => ({ src: "perm", sessionId: run, item: { id: item, tool, input: { command } } });
const thing = (id, place, words, o = {}) => ({ src: "thing", id, read: "you", folder: place, words, state: "asks", waitsOn: "you", ...o });
const stage = (place, id, title, q, choices, serious) => ({ src: "stage", project: place, id, title, q, choices, ...(serious ? { serious: true } : {}) });
const draft = (place, sticky, line, due) => ({ src: "draft", folder: place, sticky, line, ...(due ? { due } : {}) });

/** a weekly structure offer per mode (S16), kept or not by the person's press only; each week a different knob, so a
 *  Not now is never met by the same offer again. Beside them, Sol's surface writes inside the reach take (fit.set by sol, not capped) */
function weeklyOffers(s, r, modes, scope) {
  const knobs = ["tools", "layout", "order", "start"], takes = ["fewer tools at hand", "the last week's tools first", "one tool per part"];
  for (const mode of modes) {
    for (let w = 0; w < 4; w++) {
      const knob = `${mode}.${knobs[w]}`, day = 7 * w + r.int(5, 7), offer = `${s.short}-o${w + 1}-${mode}`;
      s.add(day, 18, r.int(0, 50), "sol", "offer", scope, { offer, knob, scope, take: r.pick(takes), mode, structural: true });
      const press = r.chance(0.5) ? "keep" : "notnow";
      s.add(day, 19, r.int(0, 50), s.who, press, scope, { offer });
    }
    for (let w = 0; w < 4; w++) s.add(7 * w + 2, 8, w, "sol", "fit.set", scope, { knob: `${mode}.density`, scope, take: w % 2 ? "roomy" : "close", author: "sol", reason: `${w + 3} of the last ${w + 4} ${mode} days read this way`, count: w + 3 });
  }
}

/** Dev, panel #2: a solo founder with eight agents across four repositories at night; sees collisions before they land,
 *  asks for takes in words and opens them; brings Claude Code and Codex as they are (S13, S14, S19, S20, S23, S27) */
function dev() {
  const s = story("dev", "Dev"), r = rng(2);
  const repos = ["dev/api", "dev/web", "dev/billing", "dev/infra"], machines = ["desk", "laptop"];
  const tasks = ["move the auth to tokens", "fix the flaky checkout test", "add the usage page", "cut the cold start", "rename the plans", "split the billing worker", "log the webhook retries", "port the cron to the queue"];
  s.add(1, 20, 0, "Dev", "say", "dev", { words: "bring my Claude Code and Codex setup in as it is", via: "words" });
  s.add(1, 20, 5, "sol", "fact", "dev", { fact: "four repositories: api, web, billing, infra", source: "the folders Dev brought in, day 1" });
  s.add(3, 21, 0, "Dev", "fit.set", "dev", { knob: "voice", scope: "dev", take: "quieter while I'm reviewing", author: "person", via: "words" });
  s.add(9, 23, 0, "Dev", "fit.back", "dev", { knob: "voice", scope: "dev" });
  let undone = false;
  for (let day = 1; day <= DAYS; day++) {
    const n = r.int(2, 8), repo = r.pick(repos), task = tasks[(day - 1) % tasks.length], piece = `${repo}/${task.replace(/\s+/g, "-")}-${day}`;
    s.add(day, 21, 10, "Dev", "say", repo, { words: `tonight: ${task}`, via: r.pick(["words", "keys"]) });
    const parts = [{ id: `${piece}#note`, kind: "sticky", hands: "Dev", words: `what done means: ${task}, tests green` }];
    for (let i = 0; i < n; i++) parts.push({ id: `${piece}#s${i + 1}`, kind: "session", hands: i % 2 ? "ai:codex" : "ai:claude", words: `${task}, part ${i + 1} of ${n}` });
    const split = s.add(day, 21, 15, "Dev", "piece.split", repo, { piece, parts });
    s.add(day, 21, 16, "Dev", "piece.lead", repo, { piece, ai: "ai:claude" });
    if (!undone && day === 6) { s.add(day, 21, 17, "Dev", "undo", repo, { of: split }); undone = true; continue; }
    const seat = day % 2 ? "claude" : "codex", planRun = s.run();
    s.add(day, 21, 20, `ai:${seat}`, "plan", repo, seat === "claude"
      ? { seat, run: planRun, todos: parts.slice(1).map((p, i) => ({ content: p.words, status: i ? "pending" : "in_progress", activeForm: `Working on ${p.words}` })) }
      : { seat, run: planRun, plan: parts.slice(1).map((p, i) => ({ step: p.words, status: i ? "pending" : "in_progress" })) });
    const ran = [];
    for (let i = 0; i < n; i++) {
      const part = parts[i + 1], run = i === 0 ? planRun : s.run(), seatI = part.hands.slice(3), place = repos[(repos.indexOf(repo) + (i % 3 === 2 ? 1 : 0)) % 4];
      s.add(day, 21, 30 + i, `ai:${seatI}`, "run.start", place, { run, part: part.id, seat: seatI, model: seatI === "claude" ? "opus" : "gpt-5", machine: r.pick(machines) });
      if (r.chance(0.35)) {
        const a = s.ask(day, 22, i * 3, `ai:${seatI}`, place, perm(run, `${run}-p`, "Bash", r.pick(["npm test", "git push origin HEAD", "npm run migrate"])), { run });
        if (!(day === DAYS && i === 0)) s.add(day, 22, i * 3 + 2, "Dev", "answer", place, { ask: a, yes: "Allow" });
      }
      const changed = [`src/${task.split(" ")[1]}.ts`, ...(r.chance(0.5) ? [`test/${task.split(" ")[1]}.test.ts`] : [])];
      s.add(day, 23, i * 2, `ai:${seatI}`, "run.end", place, { run, part: part.id, outcome: r.chance(0.85) ? "done" : "stopped", changed });
      s.add(day, 23, i * 2 + 1, "sol", "check", place, { run, what: parts[0].words, ok: r.chance(0.8) });
      s.add(day, 23, i * 2 + 1, "sol", "link", place, { from: `${run}:made`, to: part.id, kind: "made_from", by: "sol" });
      ran.push({ run, part, place, changed });
    }
    s.add(day, 23, 50, "ai:claude", "piece.state", repo, { piece, line: `${ran.length} of ${n} parts back, ${task}` });
    // two agents on one file: shown before it lands (panel #2 question 2)
    if (day % 5 === 0 && ran.length > 1) {
      const a = s.ask(day, 22, 40, "sol", ran[1].place, stage(ran[1].place, `clash-${day}`, "two agents, one file", `${ran[0].run} and ${ran[1].run} both change ${ran[0].changed[0]}: keep which?`, [ran[0].run, ran[1].run], true));
      if (day !== DAYS) s.add(day, 22, 45, "Dev", "answer", ran[1].place, { ask: a, yes: ran[0].run });
      s.add(day, 22, 41, "sol", "link", ran[1].place, { from: ran[1].part.id, to: ran[0].part.id, kind: "blocks", by: "sol" });
    }
    if (day % 4 === 1) s.add(day, 23, 55, "sol", "link", repo, { from: piece, to: `${repos[(repos.indexOf(repo) + 1) % 4]}/shared-types`, kind: "uses", by: "sol" });
    if (day % 7 === 3) s.add(day, 21, 25, "Dev", "try", repo, { piece, n: 3 });
    if (r.chance(0.7)) s.add(day + (day < DAYS ? 1 : 0), 9, 0, "Dev", "done", repo, { piece });
  }
  s.ask(28, 10, 0, "Dev", "dev/infra", thing("dev-t-domain", "dev/infra", "Renew the api domain", { due: s.at(31, 0) }));
  s.ask(30, 23, 58, "ai:claude", "dev/infra", perm("dev-r-certs", "dev-r-certs-p", "Bash", "terraform apply"), { run: "dev-r-certs" });
  // one place with a high and a low need open (a permission, 3, and a draft, 6): it takes its best, not its last
  s.ask(30, 23, 58, "ai:codex", "dev", perm("dev-r-setup", "dev-r-setup-p", "Bash", "brew upgrade"), { run: "dev-r-setup" });
  s.ask(30, 23, 59, "ai:codex", "dev", draft("dev", "Night plan", "did: draft: tomorrow night's plan, plan.md"));
  // S20/S23: what each plan has used, as the seat reports it (codex: not priced, "not counted")
  for (let day = 1; day <= DAYS; day++) s.add(day, 23, 59, "sol", "usage", "dev", { seat: "claude", plan: "max", used: Math.min(100, Math.round(day * 3.4)), of: 100, week: Math.ceil(day / 7) });
  for (let day = 7; day <= DAYS; day += 7) s.add(day, 23, 59, "sol", "usage", "dev", { seat: "codex", plan: "pro", used: null, of: null, week: day / 7 });
  s.ask(29, 10, 0, "ai:codex", "dev/web", draft("dev/web", "Release notes", "did: draft: the release notes for the usage page, notes.md"));
  weeklyOffers(s, r, ["build"], "dev");
  return { s, head: { fixture: "dev-month", panel: 2, person: "Dev", age: 34, setting: "solo founder, developer; eight agents across four repositories at night",
    from: ["panel.md #2 Dev", "S13 pieces, parts, lead, seat plans, undo", "S14 clashes and asks", "S19 links", "S20/S23 runs, seats, machines", "S27 checks and Try a few ways", "S16 weekly offers"] } };
}

/** Denise, panel #6: a first-timer with a small wellness business; one task in her own words, a larger take offered at
 *  the right moment, a wrong press taken back, a week away and things where she left them (S15, S16, S29) */
function denise() {
  const s = story("denise", "Denise"), r = rng(6);
  const say = (day, h, words, place) => s.add(day, h, 0, "Denise", "say", place, { words, via: "keys" });
  say(1, 10, "help me write my price list", "denise/price-list");
  s.add(1, 10, 1, "sol", "say", "denise", { words: "Your files stay on this computer.", via: "sol" });
  s.add(1, 10, 2, "Denise", "piece.split", "denise/price-list", { piece: "denise/price-list", parts: [{ id: "denise/price-list#s1", kind: "session", hands: "ai:claude", words: "a price list from her notes" }] });
  const r1 = s.run();
  s.add(1, 10, 3, "ai:claude", "run.start", "denise/price-list", { run: r1, part: "denise/price-list#s1", seat: "claude", model: "sonnet", machine: "here" });
  s.add(1, 10, 9, "ai:claude", "run.end", "denise/price-list", { run: r1, part: "denise/price-list#s1", outcome: "done", changed: ["price-list.md"] });
  const d1 = s.ask(1, 10, 10, "ai:claude", "denise/price-list", draft("denise/price-list", "Price list", "did: draft: a price list, price-list.md"));
  s.add(1, 10, 20, "Denise", "answer", "denise/price-list", { ask: d1, yes: "Keep it" });
  s.add(1, 10, 21, "Denise", "done", "denise/price-list", { piece: "denise/price-list" });
  s.add(2, 11, 0, "sol", "offer", "denise", { offer: "denise-o-text", knob: "text.size", scope: "denise", take: "larger", mode: "life", structural: false, why: "this is hard to read: try a larger take?" });
  s.add(2, 11, 1, "Denise", "keep", "denise", { offer: "denise-o-text" });
  s.add(2, 11, 1, "Denise", "fit.set", "denise", { knob: "text.size", scope: "denise", take: "larger", author: "person" });
  s.add(3, 9, 0, "Denise", "fact", "denise", { fact: "open Tuesday to Saturday, 9 to 5", source: "Denise said it, day 3" });
  s.add(3, 9, 1, "Denise", "fact", "denise", { fact: "a massage is 60 or 90 minutes", source: "price-list.md, day 1" });
  for (let i = 1; i <= 50; i++) s.add(3, 12, i, "Denise", "fact", "denise/bookings", { fact: `client ${i}: a note about their visit`, source: `bookings/client-${i}.md`, offLimits: true });
  s.add(24, 9, 0, "Denise", "fact", "denise", { fact: "open Tuesday to Sunday, 9 to 5", source: "Denise said it, day 24", replaces: "open Tuesday to Saturday, 9 to 5" });
  const wrong = s.add(4, 14, 0, "Denise", "say", "denise/bookings", { words: "remove the Saturday bookings", via: "keys" });
  s.add(4, 14, 1, "Denise", "undo", "denise/bookings", { of: wrong });
  s.add(14, 17, 0, "Denise", "away", "denise", { until: 22 });
  s.add(22, 9, 0, "Denise", "back", "denise", {});
  let t = 0;
  for (let day = 1; day <= DAYS; day++) {
    if (day > 14 && day < 22) continue;   // the week away
    if (r.chance(0.6)) {
      const id = `denise-t${++t}`, words = r.pick(["Reply to a booking for Thursday", "Confirm the new client's time", "Move Friday's 3pm"]);
      const a = s.ask(day, 9, 30, "sol", "denise/bookings", thing(id, "denise/bookings", words, { due: s.at(day + 1, 9) }));
      if (day < DAYS) s.add(day, r.int(10, 16), 0, "Denise", "answer", "denise/bookings", { ask: a, yes: "Done" });
    }
    if (day % 7 === 5) {
      say(day, 15, "write this week's newsletter", "denise/newsletter");
      const run = s.run();
      s.add(day, 15, 1, "ai:claude", "run.start", "denise/newsletter", { run, part: "denise/newsletter#s1", seat: "claude", model: "sonnet", machine: "here" });
      s.add(day, 15, 6, "ai:claude", "run.end", "denise/newsletter", { run, part: "denise/newsletter#s1", outcome: "done", changed: [`newsletter-${day}.md`] });
      const a = s.ask(day, 15, 7, "ai:claude", "denise/newsletter", draft("denise/newsletter", `Newsletter ${day}`, `did: draft: this week's newsletter, newsletter-${day}.md`));
      if (day < 26) s.add(day, 16, 0, "Denise", "answer", "denise/newsletter", { ask: a, yes: "Keep it" });
    }
  }
  weeklyOffers(s, r, ["life"], "denise");
  return { s, head: { fixture: "denise-month", panel: 6, person: "Denise", age: 63, setting: "owns a small wellness business; first-timer, reading glasses, slow typist",
    from: ["panel.md #6 Denise", "S15 a fit offered once and kept by her", "S16 weekly offers", "S29 facts with sources", "undo after a wrong press", "a week away"] } };
}

/** Min-ji, panel #8: a small studio with five AI tools on one project; copy, visuals and research side by side; remixes
 *  an authored take into her own and gives it to the studio (S13, S19, S22, S28) */
function minji() {
  const s = story("minji", "Min-ji"), r = rng(8);
  const tools = ["claude", "gemini", "chatgpt", "figma", "midjourney"], kinds = ["copy", "visuals", "research"];
  const piece = "minji/launch";
  s.add(1, 10, 0, "Min-ji", "say", piece, { words: "one place for the launch: copy, visuals, research side by side", via: "words" });
  s.add(1, 10, 1, "Min-ji", "piece.split", piece, { piece, parts: [
    { id: `${piece}#copy`, kind: "session", hands: "ai:claude", words: "event copy" },
    { id: `${piece}#visuals`, kind: "session", hands: "ai:midjourney", words: "promotional visuals" },
    { id: `${piece}#research`, kind: "session", hands: "ai:chatgpt", words: "formats that worked" },
    { id: `${piece}#review`, kind: "person", hands: "Joy", words: "check the copy reads well for clients" }] });
  s.add(1, 10, 2, "Min-ji", "piece.lead", piece, { piece, ai: "ai:claude" });
  for (const k of kinds) s.add(1, 10, 3, "sol", "link", `${piece}/${k}`, { from: `${piece}/${k}`, to: piece, kind: "part_of", by: "sol" });
  s.add(2, 9, 0, "Min-ji", "fit.set", "minji", { knob: "look", scope: "minji", take: "quiet canvas", author: "person" });
  s.add(5, 9, 0, "Min-ji", "fit.set", "minji", { knob: "look.accent", scope: "minji", take: "studio ink", author: "person", reason: "remixed from quiet canvas" });
  s.add(5, 9, 5, "Min-ji", "way.make", "minji/studio", { way: "studio take", fits: ["look=quiet canvas", "look.accent=studio ink", "build.tools=five side by side"] });
  s.add(6, 11, 0, "Min-ji", "way.give", "minji/studio", { way: "studio take", to: { person: "Joy", group: "minji-studio" } });
  s.add(3, 12, 0, "sol", "fact", "minji", { fact: "pays for Claude, Gemini, ChatGPT, Figma and Midjourney", source: "the seats Min-ji connected, day 1" });
  for (let day = 1; day <= DAYS; day++) {
    const n = r.int(1, 4);
    for (let i = 0; i < n; i++) {
      const kind = kinds[(day + i) % 3], place = `${piece}/${kind}`, seat = kind === "copy" ? r.pick(["claude", "gemini"]) : kind === "visuals" ? r.pick(["midjourney", "figma"]) : "chatgpt";
      const run = s.run();
      s.add(day, 10 + i, 0, `ai:${seat}`, "run.start", place, { run, part: `${piece}#${kind}`, seat, model: seat, machine: "studio-mac" });
      s.add(day, 10 + i, 40, `ai:${seat}`, "run.end", place, { run, part: `${piece}#${kind}`, outcome: "done", changed: [`${kind}/${day}-${i + 1}.${kind === "visuals" ? "png" : "md"}`] });
      s.add(day, 10 + i, 41, "sol", "link", place, { from: `${run}:made`, to: `${piece}#${kind}`, kind: "made_from", by: "sol" });
      if (kind === "visuals" && r.chance(0.3)) s.add(day, 10 + i, 42, "sol", "link", place, { from: `${run}:made`, to: `${piece}/visuals/${day}-1.png`, kind: "same_as", by: "sol" });
      if (kind === "visuals" && r.chance(0.4)) {
        const a = s.ask(day, 10 + i, 45, `ai:${seat}`, place, stage(place, `pick-${day}-${i}`, "the poster", "Keep the blue or the coral poster?", ["blue", "coral"]));
        if (day < DAYS - 1) s.add(day, 11 + i, 0, "Min-ji", "answer", place, { ask: a, yes: r.pick(["blue", "coral"]) });
      }
    }
    if (day % 6 === 0) s.add(day, 17, 0, "ai:claude", "piece.state", piece, { piece, line: `copy ${day / 6} of 5 drafts, visuals picked, research in` });
  }
  s.ask(27, 9, 0, "ai:midjourney", `${piece}/visuals`, stage(`${piece}/visuals`, "plan", "Midjourney plan", "Upgrade the Midjourney plan for $30 a month?", ["Upgrade", "Not now"]));
  s.ask(28, 16, 0, "ai:claude", `${piece}/copy`, draft(`${piece}/copy`, "Launch copy", "did: draft: the launch copy, copy/launch.md"));
  s.add(30, 18, 0, "Min-ji", "done", piece, { piece: `${piece}/research` });
  weeklyOffers(s, r, ["build", "life"], "minji");
  return { s, head: { fixture: "minji-month", panel: 8, person: "Min-ji", age: 31, setting: "runs a small design studio; five AI tools on one project",
    from: ["panel.md #8 Min-ji", "S13 parts of three kinds", "S19 part_of, made_from, same_as", "S22 a person part (stub)", "S28 a way made from an authored take and given", "S16 weekly offers"] } };
}

/** Tomás, panel #10: blind, VoiceOver every day, broken by updates before; every act by keyboard or in words, a Sol fit
 *  backed and so held, and updates that must carry what he set (S15, S24) */
function tomas() {
  const s = story("tomas", "Tomás"), r = rng(10);
  const clients = ["tomas/clients/bakery", "tomas/clients/clinic", "tomas/clients/library"];
  s.add(1, 9, 0, "Tomás", "fit.set", "tomas", { knob: "live.output", scope: "tomas", take: "read on request, never over what I navigate", author: "person", via: "keys" });
  s.add(2, 9, 0, "sol", "fit.set", "tomas", { knob: "motion", scope: "tomas", take: "a small flash when a run lands", author: "sol", reason: "4 of his last 5 runs landed while he was elsewhere", count: 4 });
  s.add(2, 9, 2, "Tomás", "fit.back", "tomas", { knob: "motion", scope: "tomas", via: "keys" });
  s.add(3, 10, 0, "Tomás", "fact", "tomas", { fact: "uses VoiceOver on macOS, keyboard only", source: "Tomás said it, day 3" });
  s.add(8, 8, 0, "sol", "update", "tomas", { from: "0.31.0", to: "0.32.0" });
  s.add(8, 8, 1, "sol", "upkeep", "tomas", { kind: "adaptive", finding: "0.32.0 moves the Needs shortcut; his held fits carried over", blocked: false });
  s.add(15, 8, 0, "sol", "update", "tomas", { from: "0.32.0", to: "0.33.0" });
  s.add(15, 8, 1, "sol", "upkeep", "tomas", { kind: "corrective", finding: "after 0.33.0 the Needs list reads as \"button\"", blocked: true });
  const lbl = s.ask(15, 8, 2, "sol", "tomas", stage("tomas", "upkeep-label", "a label lost", "The Needs list lost its label after the update. Go back to 0.32.0?", ["Go back", "Wait for a fix"], true), { cause: "update:0.33.0" });
  s.add(15, 8, 20, "Tomás", "answer", "tomas", { ask: lbl, yes: "Go back" });
  s.add(20, 9, 0, "sol", "upkeep", "tomas", { kind: "preventive", finding: "the Claude sign-in ends on day 27", blocked: false });
  s.add(22, 9, 0, "sol", "upkeep", "tomas", { kind: "perfective", finding: "the audit report is asked for the same way each week: a routine?", blocked: false });
  s.ask(26, 9, 0, "sol", "tomas", thing("tomas-t-signin", "tomas", "Sign in to Claude again before it ends", { due: s.at(27, 9) }), { cause: "signin:claude" });
  for (let day = 1; day <= DAYS; day++) {
    if (day % 7 === 3 || day % 7 === 4) continue;   // weekends
    const place = clients[day % 3], run = s.run();
    s.add(day, 10, 0, "Tomás", "say", place, { words: r.pick(["audit the checkout page", "write up the form findings", "check the new menu against the last audit"]), via: r.pick(["keys", "voice"]) });
    s.add(day, 10, 1, "ai:claude", "run.start", place, { run, part: `${place}#audit`, seat: "claude", model: "opus", machine: "here" });
    s.add(day, 10, 30, "ai:claude", "run.end", place, { run, part: `${place}#audit`, outcome: r.chance(0.9) ? "done" : "failed", changed: [`audits/${day}.md`] });
    s.add(day, 10, 31, "sol", "say", place, { words: "The audit is back: 4 findings, 1 serious.", via: "announce" });
    if (r.chance(0.4)) {
      const a = s.ask(day, 11, 0, "ai:claude", place, draft(place, `Report ${day}`, `did: draft: the client report, report-${day}.md`));
      if (day < DAYS - 2) s.add(day, 11, 30, "Tomás", "answer", place, { ask: a, yes: "Keep it" });
    }
    if (day % 5 === 0) s.add(day, 16, 0, "Tomás", "done", place, { piece: `${place}#audit` });
  }
  weeklyOffers(s, r, ["build"], "tomas");
  return { s, head: { fixture: "tomas-month", panel: 10, person: "Tomás", age: 45, setting: "blind accessibility consultant; VoiceOver, keyboard, broken by updates before",
    from: ["panel.md #10 Tomás", "S15 a Sol fit backed, so held", "S24 upkeep: four kinds, an update carries held fits, a sign-in a week ahead", "S16 weekly offers"] } };
}

/** Lucy, panel #11: dyslexic, ADHD, runs her own branding business; turns "only what needs me today" often, gets
 *  interrupted and comes back. The month is the demand before any gate: the same asks a day in days 1–15 and 16–30, runs
 *  marked likely to ask, one blocking ask a day. S21's gate, not this file, is what lowers asks per finished piece */
function lucy() {
  const s = story("lucy", "Lucy"), r = rng(11);
  const clients = ["lucy/clients/florist", "lucy/clients/gym", "lucy/clients/cafe"];
  s.add(1, 8, 30, "Lucy", "fit.set", "lucy", { knob: "attention", scope: "lucy", take: "only what needs me today", author: "person", via: "pointer" });
  let p = 0;
  for (let day = 1; day <= DAYS; day++) {
    s.add(day, 9, 0, "Lucy", "say", "lucy/thoughts", { words: r.pick(["logo ideas for the florist", "invoice the gym", "colours for the cafe", "call back about the brief"]), via: "pointer" });
    const asks = 4, finished = 2 + (day % 2);
    for (let i = 0; i < asks; i++) {
      const place = clients[(day + i) % 3], run = s.run();
      s.add(day, 9, 30 + i, "ai:claude", "run.start", place, { run, part: `${place}#day-${day}`, seat: "claude", model: "sonnet", machine: "here", likelyToAsk: i < 3 });
      const a = s.ask(day, 10 + i, 0, "ai:claude", place, i % 2
        ? thing(`lucy-t${day}-${i}`, place, r.pick(["Pick one of three logo sketches", "Say yes to the brief", "Choose the cafe's colours"]))
        : draft(place, `Note ${day}-${i}`, `did: draft: ${r.pick(["a reply to the client", "the invoice", "a moodboard"])}, note-${day}-${i}.md`), { run, ...(i === 0 ? { blocking: true } : {}) });
      s.add(day, 10 + i, 1, "ai:claude", "run.end", place, { run, part: `${place}#day-${day}`, outcome: "done", changed: [`note-${day}-${i}.md`] });
      if (day < DAYS) s.add(day, 10 + i, 30, "Lucy", "answer", place, { ask: a, yes: i % 2 ? "Done" : "Keep it" });
    }
    for (let i = 0; i < finished; i++) s.add(day, 16, i * 5, "Lucy", "done", clients[(day + i) % 3], { piece: `lucy-p${++p}` });
    if (r.chance(0.6)) { s.add(day, 11, 50, "Lucy", "interrupt", "lucy", {}); s.add(day, 12, 20, "Lucy", "back", "lucy", {}); }
    s.add(day, 13, 0, "Lucy", "pause", "lucy", {});
    if (day % 3 === 0) {
      s.add(day, 14, 0, "Lucy", "fit.set", "lucy", { knob: "attention", scope: "lucy", take: "everything", author: "person", via: "pointer" });
      s.add(day, 15, 0, "Lucy", "fit.set", "lucy", { knob: "attention", scope: "lucy", take: "only what needs me today", author: "person", via: "pointer" });
    }
  }
  weeklyOffers(s, r, ["life"], "lucy");
  return { s, head: { fixture: "lucy-month", panel: 11, person: "Lucy", age: 41, setting: "branding consultant, her own business; dyslexia and ADHD",
    from: ["panel.md #11 Lucy", "S21 30 days under \"only what needs me today\": steady asks, runs likely to ask, one blocking ask a day", "S16 weekly offers"] } };
}

/** three nights of 3, 40 and 400 acts: Denise's one draft, Min-ji's studio, Dev's eight agents with one lapsed sign-in
 *  across 12 runs (S14, S25) */
function nights() {
  const s = story("night", "Dev"), r = rng(340);
  const night = (label) => (o) => ({ ...o, night: label });
  // night 3: one AI drafts Denise's price list for the morning
  const n3 = night("3");
  s.add(31, 22, 0, "ai:claude", "run.start", "denise/price-list", n3({ run: "night-3-r1", part: "denise/price-list#s1", seat: "claude", model: "sonnet", machine: "here" }));
  s.add(31, 22, 20, "ai:claude", "run.end", "denise/price-list", n3({ run: "night-3-r1", part: "denise/price-list#s1", outcome: "done", changed: ["price-list.md"] }));
  s.add(31, 22, 21, "ai:claude", "ask", "denise/price-list", n3({ ask: "night-3-a1", need: draft("denise/price-list", "Price list", "did: draft: the winter price list, price-list.md") }));
  // night 40: Min-ji's studio, ten runs of four acts
  const n40 = night("40"), studio = ["minji/launch/copy", "minji/launch/visuals", "minji/launch/research"];
  for (let i = 0; i < 10; i++) {
    const place = studio[i % 3], seat = ["claude", "midjourney", "chatgpt"][i % 3], run = `night-40-r${i + 1}`;
    s.add(32, 22, i * 4, `ai:${seat}`, "run.start", place, n40({ run, part: `minji/launch#${place.split("/")[2]}`, seat, model: seat, machine: "studio-mac" }));
    s.add(32, 23, i * 4, `ai:${seat}`, "run.end", place, n40({ run, part: `minji/launch#${place.split("/")[2]}`, outcome: "done", changed: [`${place.split("/")[2]}/night-${i + 1}.md`] }));
    s.add(32, 23, i * 4 + 1, "sol", "link", place, n40({ from: `${run}:made`, to: `minji/launch#${place.split("/")[2]}`, kind: "made_from", by: "sol" }));
    if (i % 3 === 1) s.add(32, 23, i * 4 + 2, `ai:${seat}`, "ask", place, n40({ ask: `night-40-a${i + 1}`, need: stage(place, `night-${i + 1}`, "a poster", "Keep this poster for the launch?", ["Keep", "Redo"]) }));
    else s.add(32, 23, i * 4 + 2, "sol", "check", place, n40({ run, what: "on brief", ok: true }));
  }
  // night 400: Dev's eight agents across four repositories; the Claude sign-in lapses at 01:00 and 12 runs stop on it
  const n400 = night("400"), repos = ["dev/api", "dev/web", "dev/billing", "dev/infra"];
  let acts = 0, k = 0;
  const add = (min, by, act, place, o) => { s.add(33, 22 + Math.floor(min / 60), min % 60, by, act, place, n400(o)); acts++; };
  const lapsed = [];
  while (acts < 400) {
    const i = k++, place = repos[i % 4], seat = i % 2 ? "codex" : "claude", run = `night-400-r${i + 1}`, min = Math.min(i * 3, 470);
    add(min, `ai:${seat}`, "run.start", place, { run, part: `${place}#night-${i + 1}`, seat, model: seat === "claude" ? "opus" : "gpt-5", machine: i % 3 ? "desk" : "laptop" });
    if (acts >= 400) break;
    if (seat === "claude" && min >= 180 && lapsed.length < 12) {
      lapsed.push(run);
      add(min + 1, "ai:claude", "ask", place, { ask: `night-400-a${i + 1}`, cause: "signin:claude", run, need: stage(place, `signin-${i + 1}`, "the Claude sign-in", "Claude's sign-in has ended. Sign in again?", ["Sign in"]) });
      continue;
    }
    if (acts >= 400) break;
    add(min + 2, `ai:${seat}`, "run.end", place, { run, part: `${place}#night-${i + 1}`, outcome: r.chance(0.9) ? "done" : "stopped", changed: [`src/n${i + 1}.ts`] });
    if (acts >= 400) break;
    add(min + 2, "sol", i % 7 === 3 ? "link" : "check", place, i % 7 === 3 ? { from: `${run}:made`, to: `${place}#night-${i + 1}`, kind: "made_from", by: "sol" } : { run, what: "tests green", ok: r.chance(0.85) });
  }
  return { s, head: { fixture: "nights-3-40-400", days: "counted from 2026-10-01: 31 is Oct 31, 32 Nov 1, 33 Nov 2; a night keeps the day it began", nights: { "3": "Denise (panel #6)", "40": "Min-ji (panel #8)", "400": "Dev (panel #2)" },
    from: ["panel.md #2, #6, #8", "S14 one lapsed sign-in across 12 runs", "S25 replay over three nights"] } };
}

const NAMED = {
  dev: ["usage", "say", "piece.split", "piece.lead", "piece.state", "plan", "run.start", "run.end", "ask", "answer", "undo", "link", "check", "try", "fit.set", "fit.back", "offer", "done", "fact"],
  denise: ["say", "run.start", "run.end", "ask", "answer", "offer", "keep", "fit.set", "fact", "undo", "away", "back", "done"],
  minji: ["say", "piece.split", "piece.lead", "piece.state", "run.start", "run.end", "link", "ask", "answer", "fit.set", "way.make", "way.give", "offer", "fact", "done"],
  tomas: ["say", "fit.set", "fit.back", "update", "upkeep", "ask", "answer", "run.start", "run.end", "fact", "done", "offer"],
  lucy: ["say", "fit.set", "run.start", "run.end", "ask", "answer", "done", "interrupt", "back", "pause", "offer"],
};
/** the acts each person's month must hold (the head line's `named`, checked by fixtures.test.ts) */
export { NAMED };

/** the asks still open at the end of a list of acts, in act order */
export function openAsks(acts) {
  const answered = new Set(acts.filter((a) => a.act === "answer").map((a) => a.ask));
  return acts.filter((a) => a.act === "ask" && !answered.has(a.ask));
}
const needId = (n) => n.src === "perm" ? `p:${n.sessionId}:${n.item.id}` : n.src === "thing" ? `t:${n.id}` : n.src === "stage" ? `s:${n.project}/${n.id}` : `d:${n.folder}:${n.sticky}`;
/** the open asks as needs.ts takes them (NeedsIn), each list in act order */
export function needsIn(acts) {
  const i = { things: [], perms: [], stage: [], drafts: [] }, key = { thing: "things", perm: "perms", stage: "stage", draft: "drafts" };
  for (const a of openAsks(acts)) { const { src, ...rest } = a.need; i[key[src]].push(rest); }
  return i;
}
/** the relevance order of the places: port S7's rank of the needs open on each (best first), then its count of acts */
export function relevance(acts, rank = rankNeeds) {
  const placeOf = new Map(openAsks(acts).map((a) => [needId(a.need), a.place]));
  const best = new Map(), count = new Map();
  for (const n of rank(needsIn(acts))) { const p = placeOf.get(n.id); if (p !== undefined && !best.has(p)) best.set(p, n.rank); }
  for (const a of acts) count.set(a.place, (count.get(a.place) ?? 0) + 1);
  return [...count.keys()].sort((x, y) => (best.get(x) ?? Infinity) - (best.get(y) ?? Infinity) || count.get(y) - count.get(x) || (x < y ? -1 : x > y ? 1 : 0));
}

const endLine = (end, acts) => ({ end, acts: acts.length, open: openAsks(acts).map((a) => a.ask), order: relevance(acts) });

/** every fixture's text, by file name */
export function make() {
  const out = {};
  for (const [name, f] of [["dev", dev], ["denise", denise], ["minji", minji], ["tomas", tomas], ["lucy", lucy]]) {
    const { s, head } = f(), acts = s.acts();
    out[`${name}-month.jsonl`] = [{ ...head, start: "2026-10-01", days: DAYS, named: NAMED[name] }, ...acts, endLine("month", acts)].map((l) => JSON.stringify(l)).join("\n") + "\n";
  }
  const { s, head } = nights(), acts = s.acts();
  out["nights-3-40-400.jsonl"] = [{ ...head, start: "2026-10-01" }, ...acts, ...["3", "40", "400"].map((n) => endLine(n, acts.filter((a) => a.night === n)))].map((l) => JSON.stringify(l)).join("\n") + "\n";
  return out;
}

/** a fixture read back: its head, its acts, its end lines */
export function read(file, dir = HERE) {
  const lines = readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { head: lines[0], acts: lines.filter((l) => typeof l.act === "string"), ends: lines.filter((l) => "end" in l) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf("--out"), dir = at > 0 ? process.argv[at + 1] : HERE;
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(make())) writeFileSync(join(dir, file), text);
  console.log(`made ${FILES.length} fixtures in ${dir}`);
}
