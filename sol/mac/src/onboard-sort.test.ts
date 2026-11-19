// node --test src/*.test.ts: the one onboarding's sorter (onboard/sort.ts, #1088), on the made-up people's sentences and
// on what the explorer reads from their seeded homes (onboard/people/seed.mjs): a folder per part of the life said, each
// thing found in the folder it belongs to, and only the unsure comes back, at most five.
import { test } from "node:test";
import assert from "node:assert/strict";
import { areasOf, brief, offOf, placeOf, readingOf, sortAll, type Explored, type Found } from "./onboard/sort.ts";

const f = (id: string, v: string, kind: Found["kind"], more: Partial<Found> = {}): Found => ({ id, k: "x", v, src: "", kind, sure: true, ...more });
const NOA = "Second year at Westbrook, design major. I freelance for two clients. Training for a half marathon. Don't read my messages.";

test("a few sentences make the parts of a life, and what is off-limits", () => {
  const { areas, off } = areasOf(NOA);
  assert.deepEqual(areas.map((a) => [a.name, a.part]), [["Westbrook", "school"], ["Clients", "work"], ["Half Marathon", "life"]]);
  assert.deepEqual(off, ["messages"]);
});

test("nothing said is no folders, never an error", () => {
  assert.deepEqual(areasOf("").areas, []);
  assert.deepEqual(areasOf("hello").areas, []);
});

test("each found thing goes where it will live", () => {
  const { areas } = areasOf(NOA);
  const at = (x: Found) => areas.find((a) => a.id === placeOf(x, areas))?.name ?? "you";
  assert.equal(at(f("1", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm" })), "Westbrook");
  assert.equal(at(f("2", "Lumen invoice 014", "file", { hint: "client", src: "Documents/Clients/Lumen" })), "Clients");
  assert.equal(at(f("3", "Long run", "event", { repeats: true })), "Half Marathon");
  assert.equal(at(f("4", "strava.com", "place", { titles: ["Dashboard | Strava"] })), "Half Marathon");
  assert.equal(at(f("5", "canvas.westbrook.edu", "place")), "Westbrook");
  assert.equal(at(f("6", "Figma", "machine")), "you");
  assert.equal(at(f("7", "Claude", "ai")), "you");
});

test("only the unsure comes back: a clash, a guessed client, a routine, the off-limits, an unsigned tool", () => {
  const ex: Explored = { v: 1, made: "", home: "", stops: [{ id: "all", state: "done", line: "", facts: [
    f("a", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm" }),
    f("b", "DES 210 crit", "event", { when: "Thu, Nov 19 3pm" }),
    f("c", "Okra", "file", { k: "folder", hint: "client", src: "Documents/Clients" }),
    f("d", "Long run", "event", { repeats: true, when: "Sun 8am" }),
    f("e", "mail.google.com", "place", { titles: ["Inbox (4)"] }),
    f("g", "Codex", "ai", { signed: false }),
  ] }] };
  const s = sortAll(NOA, ex);
  assert.deepEqual(s.confirms.map((c) => c.kind), ["conflict", "guess", "routine", "private"], "an AI tool not signed in is a place under the box now (places.ts), not a question");
  assert.match(s.confirms[0].q, /DES 210 crit/);
  assert.match(s.confirms[1].q, /Okra is a client/);
  assert.match(s.confirms[3].q, /Gmail/);
});

test("a careful person who says nothing gets no folders and no confirms beyond the machine's", () => {
  const ex: Explored = { v: 1, made: "", home: "", stops: [{ id: "machine", state: "done", line: "", facts: [f("m", "Pages", "machine")] }] };
  const s = sortAll("", ex);
  assert.equal(s.areas.length, 0);
  assert.deepEqual(s.you, ["m"]);
  assert.equal(s.confirms.length, 0);
});

test("a startup is named from its clause, a climb is Climbing, a bakery is its own part", () => {
  assert.deepEqual(areasOf("I'm building Kite, a startup with two friends. I climb twice a week.").areas.map((a) => [a.name, a.part]), [["Kite", "work"], ["Climbing", "life"]]);
  const sam = areasOf("I run a bakery and I'm a parent of two kids. Don't open my WhatsApp.");
  assert.deepEqual(sam.areas.map((a) => [a.name, a.part]), [["Bakery", "work"], ["Kids", "life"]]);
  assert.deepEqual(sam.off, ["WhatsApp"]);
  assert.equal(placeOf(f("m", "Market stall", "event", { repeats: true, when: "Sat 7am" }), sam.areas), "bakery");
});

test("a word and a year is not a course code: resume 2026 stays with you", () => {
  const { areas } = areasOf(NOA);
  assert.equal(placeOf(f("r", "resume 2026", "file", { src: "Downloads" }), areas), "you");
  assert.equal(placeOf(f("c", "ART 140 notes", "file", { src: "Downloads" }), areas), "westbrook");
});

test("Jev's answers: 0.7 acts, 0.45 is a ghost, under that nothing; a torn answer is no answer", async () => {
  const { bandOf, readAnswers, jevBody } = await import("./onboard/jev.ts");
  assert.deepEqual([0.96, 0.7, 0.6, 0.45, 0.4, undefined].map(bandOf), ["acts", "acts", "ghost", "ghost", "none", "none"]);
  const cs = [{ id: "c-a", kind: "guess", q: "Okra is a client?", why: "", yes: "yes", no: "no" }, { id: "c-b", kind: "routine", q: "Long run?", why: "", yes: "keep", no: "not" }] as any;
  const r = readAnswers({ c0: { choice: "yes", confidence: 0.78 }, c1: { choice: "maybe", confidence: 0.9 }, level: { choice: "record", confidence: 0.59 } }, cs);
  assert.deepEqual(r.picks, { "c-a": { choice: "yes", confidence: 0.78 } });
  assert.deepEqual(r.level, { choice: "record", confidence: 0.59 });
  assert.deepEqual(readAnswers(null, cs), { picks: {}, level: undefined });
  const cs2 = [...cs, { id: "c-p", kind: "private", q: "Keep Gmail closed to me?", why: "you said: don't read my messages", yes: "keep closed", no: "names only" }] as any;
  const body = jevBody("Don't read my messages. Second year at Westbrook.", cs2, new Map());
  assert.deepEqual(Object.keys(body.questions), ["c0", "c1", "level"]);   // the private one is never asked
  const sent = JSON.stringify(body);
  for (const word of ["Okra", "Long run", "Westbrook", "messages", "Gmail"]) assert.ok(!sent.includes(word), `${word} left the machine`);
  assert.equal(body.state.careful_words, "yes");
});

test("a project joins a work folder only when it names it, or it is a client's under Clients", () => {
  const kite = areasOf("I'm building Kite, a startup with two friends.").areas;
  assert.equal(placeOf(f("a", "kite-api", "project", { owner: "kite-labs" }), kite, "maxo"), "kite");
  assert.equal(placeOf(f("b", "sol-dev", "project", { owner: "sol-mif" }), kite, "maxo"), "you");
  const noa = areasOf(NOA).areas;
  assert.equal(placeOf(f("c", "lumen-site", "project", { owner: "lumen-studio" }), noa, "noa-makes"), "clients");
  assert.equal(placeOf(f("d", "portfolio", "project", { owner: "noa-makes" }), noa, "noa-makes"), "you");
});

test("a folder's ground.json is written only when the engine said it is missing; a timeout never writes", async () => {
  const { groundMissing } = await import("./onboard/record.ts");
  assert.equal(groundMissing({ error: "ENOENT: no such file or directory" }), true);
  assert.equal(groundMissing(null), false);          // no answer: a timeout, the engine restarting
  assert.equal(groundMissing(undefined), false);
  assert.equal(groundMissing({ text: "{}" }), false);  // there
  assert.equal(groundMissing({ error: "EACCES" }), false);
});

test("a second run keeps what the person did since: answers, parts made with +, visits, routines, the level", async () => {
  const { mergeRecords, empty } = await import("./onboard/record.ts");
  const old = { ...empty(), built: "2026-11-13T01:00:00Z", hands: "draft" as const, confirmed: { "c-a": "no" as const }, visits: { build: { at: "x", kept: "kite" } }, routines: ["r1"],
    areas: [{ id: "school", name: "School", part: "school" as const, facts: [] }, { id: "spanish", name: "Spanish", part: "life" as const, facts: ["f9"] }],
    facts: [{ id: "f9", k: "x", v: "Duolingo", src: "", kind: "place" as const, sure: true, st: "read" as const, area: "spanish" }] };
  const next = { ...empty(), built: "2026-11-13T03:00:00Z", hands: "show" as const, confirmed: { "c-b": "yes" as const }, areas: [{ id: "school", name: "School", part: "school" as const, facts: [] }] };
  const m = mergeRecords(old, next, false);
  assert.deepEqual(m.confirmed, { "c-a": "no", "c-b": "yes" });
  assert.deepEqual(m.areas.map((a) => a.id), ["school", "spanish"]);
  assert.equal(m.facts.length, 1);
  assert.equal(m.hands, "show");   // nobody moved it in this run: the more careful of the two (reviewer 03:44, after 1)
  assert.equal(mergeRecords({ ...old, hands: "show" }, { ...next, hands: "record" }, false).hands, "record");   // Jev's record-only stands
  assert.deepEqual(m.visits, { build: { at: "x", kept: "kite" } });
  assert.deepEqual(m.routines, ["r1"]);
  assert.equal(mergeRecords(old, next, true).hands, "show");
  assert.equal(mergeRecords(null, next, false), next);
});

test("names from disk are taken as themselves: Invoices (2025) and C++ never break a pattern", () => {
  const ex: Explored = { v: 1, made: "", home: "", stops: [{ id: "files", state: "done", line: "", facts: [
    f("a", "Invoices (2025)", "file", { k: "folder", hint: "client", src: "Documents/Clients" }), f("b", "C++", "file", { k: "folder", hint: "client", src: "Documents/Clients" })] }] };
  assert.doesNotThrow(() => sortAll(NOA, ex));
  assert.equal(sortAll(NOA, ex).confirms.filter((c) => c.kind === "guess").length, 2);
});

test("recordOf keeps every found thing with where it lives and marks the unsure; groundOf copies no level (the consent's alone, #1227)", async () => {
  const { recordOf, groundOf } = await import("./onboard/record.ts");
  const found = [f("a", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm" }), f("b", "DES 210 crit", "event", { when: "Thu, Nov 19 3pm" }), f("m", "Figma", "machine", { k: "app" }), f("g", "Claude", "ai", { signed: true })];
  const s = sortAll(NOA, { v: 1, made: "", home: "", stops: [{ id: "all", state: "done", line: "", facts: found }] });
  const rec = recordOf("Noa Patel", NOA, found, s, [{ id: "main", w: 1512, h: 982, scale: 2, main: true, x: 0, y: 0 }], []);
  assert.equal(rec.facts.length, 4);
  assert.equal(rec.facts.find((x) => x.id === "b")!.st, "unsure");
  assert.equal(rec.facts.find((x) => x.id === "a")!.area, "westbrook");
  assert.deepEqual(rec.machine.screens.map((x) => x.main), [true]);
  assert.deepEqual(rec.ai, [{ name: "Claude", signed: true }]);
  const school = rec.areas.find((a) => a.id === "westbrook")!;
  for (const h of ["record", "show", "draft", "do"] as const) assert.deepEqual(Object.keys(groundOf({ ...rec, hands: h }, school).may).sort(), ["said", "src"], "the level lives in one place");
  assert.ok(!("setup" in groundOf(rec, school)), "no setup step: the folder is landed filled");
  assert.equal(groundOf(rec, school).facts.find((x) => x.id === "b")!.st, "question");
});

test("#1223: a folder's ground lands with a piece for every thing found for it, each with where it was read; a no is left out", async () => {
  const { recordOf, groundOf } = await import("./onboard/record.ts");
  const found = [f("a", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm", src: "your calendar", via: "calendar" }), f("b", "DES 210 crit", "event", { when: "Thu, Nov 19 3pm", src: "your calendar" }),
    f("c", "DES 210 syllabus.pdf", "file", { src: "Documents/School" })];
  const s = sortAll(NOA, { v: 1, made: "", home: "", stops: [{ id: "all", state: "done", line: "", facts: found }] });
  const rec = recordOf("Noa Patel", NOA, found, s, [], []);
  const school = rec.areas.find((a) => a.id === "westbrook")!;
  const g = groundOf(rec, school);
  assert.ok(g.pieces.length >= 2, "the folder is not empty");
  assert.ok(g.pieces.every((p) => p.src && p.s.startsWith("read in ")), "each piece names where it was read");
  assert.equal(g.pieces.find((p) => p.id === "p-a")!.when, "Tue/Thu 2pm");
  assert.deepEqual(g.connectors.map((c) => c.nm), ["calendar"]);
  const no = { ...rec, facts: rec.facts.map((x) => (x.id === "a" ? { ...x, st: "no" as const } : x)) };
  assert.ok(!groundOf(no, school).pieces.some((p) => p.id === "p-a"), "a thing the person said no to is not a piece");
});

test("#1223: a folder worked in often with an AI tool, that no told part takes, is surmised as its own folder and asked once", () => {
  const s = (id: string, v: string, n: number, path: string): Found => f(id, v, "session", { k: "sessions", src: `Claude Code: ${n} sessions in ${path}`, path, n, titles: ["a title"] });
  const ex: Explored = { v: 1, made: "", home: "", stops: [{ id: "ai", state: "done", line: "", facts: [s("p", "pottery-shop", 5, "~/pottery-shop"), s("q", "scratch", 1, "~/scratch"), s("h", "your home folder", 9, "~")] }] };
  const out = sortAll(NOA, ex);
  const pot = out.areas.find((a) => a.id === "pottery-shop");
  assert.ok(pot, "surmised from the sessions");
  assert.equal(pot!.part, "found");
  assert.deepEqual(pot!.facts, ["p"]);
  assert.ok(!out.areas.some((a) => a.id === "scratch"), "once is not a part");
  assert.equal(out.place.h, "you", "the home folder is never a part");
  const ask = out.confirms.find((x) => x.id === "c-area-pottery-shop")!;
  assert.equal(ask.kind, "found");
  // the question says the choice, and a project can go inside the folder they named for work (Marco's try 2026-11-17)
  assert.equal(ask.q, "Give Pottery shop its own folder?");
  const work = out.areas.find((a) => a.part === "work")!;
  assert.deepEqual(ask.into, { area: work.id, label: `put it in ${work.name}` });
  // a person who said they build things keeps their projects folder: nothing is surmised beside it
  assert.ok(!sortAll(NOA + " Building an app on the side.", ex).areas.some((a) => a.part === "found"));
});

test("the explorer reads a seeded home: weekly times from the calendar, file kinds by name, no titles from mail, the same ids twice", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, readdirSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-explore-"));
  try {
    const here = new URL("./onboard/", import.meta.url).pathname;
    execFileSync(process.execPath, [join(here, "people/seed.mjs"), "noa", join(dir, "noa")]);
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "noa"), "--out", join(dir, "out.json")]);
    const x = JSON.parse(readFileSync(join(dir, "out.json"), "utf8")) as Explored;
    const all = x.stops.flatMap((s) => s.facts);
    assert.equal(all.find((f) => f.v === "DES 210 Studio")?.when, "Tue/Thu 2pm");
    assert.equal(all.find((f) => f.v === "Long run")?.repeats, true);
    assert.equal(all.find((f) => f.v === "Lumen invoice 014")?.hint, "client");
    assert.equal(all.find((f) => f.v === "DES 210 syllabus")?.hint, "class");
    assert.deepEqual(all.find((f) => f.v === "mail.google.com")?.titles, []);
    assert.equal(all.find((f) => f.k === "name")?.v, "Noa Patel");
    // a seeded home is read alone: every app is one in its own Applications folder, none from the machine's or its running ones
    const own = readdirSync(join(dir, "noa", "Applications")).map((n) => n.replace(/\.app$/, ""));
    const apps = all.filter((f) => f.k === "app");
    assert.ok(apps.length > 0);
    assert.deepEqual(apps.filter((f) => !own.includes(f.v) || (f as any).open).map((f) => f.v), []);
    // the same thing has the same id on a second run, so an answer keyed by it ("c-<id>") stays with that thing
    execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", join(dir, "noa"), "--out", join(dir, "out2.json")]);
    const again = (JSON.parse(readFileSync(join(dir, "out2.json"), "utf8")) as Explored).stops.flatMap((s) => s.facts);
    assert.deepEqual(again.map((f) => `${f.id} ${f.v}`).sort(), all.map((f) => `${f.id} ${f.v}`).sort());
    assert.equal(new Set(all.map((f) => f.id)).size, all.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a folder the onboarding makes is a folder agent: its policy.md has the stickies rule the engine reads, at the level's rung", async () => {
  const { policyOf, empty } = await import("./onboard/record.ts");
  // the engine's own rule pattern (sol/engine/src/agent/store.ts BULLET; its module loads .js paths node cannot run here)
  const BULLET = /^(\s*[-*]\s+)\[([a-z]+)(?:\s*,\s*([a-z]+))?\]\s+([a-z][a-z0-9-]*)\s*:\s*(.+?)\s*$/i;
  const parsePolicy = (text: string) => text.split("\n").map((l) => BULLET.exec(l)).filter((m): m is RegExpExecArray => !!m)
    .map((m, i) => ({ id: `${m[4].toLowerCase()}-${i + 1}`, mode: m[2].toLowerCase(), rung: (m[3] ?? "read").toLowerCase() }));
  const rec = { ...empty(), name: "Noa Patel", said: NOA, hands: "record" as const, areas: [{ id: "westbrook", name: "Westbrook", part: "school" as const, facts: [] }] };
  const rules = parsePolicy(policyOf(rec, rec.areas[0]));
  assert.deepEqual(rules.map((r) => [r.id, r.mode, r.rung]), [["stickies-1", "watch", "read"]]);
  assert.equal(parsePolicy(policyOf({ ...rec, hands: "do" }, rec.areas[0]))[0].rung, "draft");
  assert.ok(!policyOf(rec, rec.areas[0]).includes("Marco"));
});

test("the record is read in three: a record, missing (ENOENT), or unknown; unknown is never written over", async () => {
  const { recordFrom, answerOf } = await import("./onboard/record.ts");
  assert.equal((recordFrom({ text: '{"name":"Noa","built":"x"}' }) as any).rec.name, "Noa");
  assert.deepEqual(recordFrom({ error: "ENOENT: no such file or directory, open '/h/.sol/record/me.json'" }), { missing: true });
  assert.ok("unknown" in recordFrom(null));                     // a timeout, the engine restarting
  assert.ok("unknown" in recordFrom({ text: "{ half a file" })); // will not parse
  assert.ok("unknown" in recordFrom({ text: "" }));             // empty: not a record, and not missing
  assert.ok("unknown" in recordFrom({ text: "[1]" }));
  assert.ok("unknown" in recordFrom({ error: "EACCES: permission denied" }));
  // the same three for any file the onboarding writes into (stickies.md, ground.json, policy.md)
  assert.deepEqual(answerOf({ text: "" }), { text: "" });       // an empty stickies.md is read, so it may be added to
  assert.equal(answerOf({ error: "ENOENT" }), "missing");
  assert.equal(answerOf(null), "unknown");
  assert.equal(answerOf({ tooBig: true, size: 3e6 } as any), "unknown");   // over 2 MB: never replaced by one line
  assert.equal(answerOf({ binary: true } as any), "unknown");
});

test("landAll writes a folder's files only where the engine said missing; no answer holds the folder and names it", async () => {
  const { landAll, empty } = await import("./onboard/record.ts");
  const writes: string[] = [];
  const ask = async (o: any) => {
    if (o.type === "work.write") { writes.push(o.path); return { ok: true } as any; }
    if (o.path === "a" || o.path.startsWith("a/")) return { error: "ENOENT" } as any;
    if (o.path === "b") return { dir: true, entries: ["ground.json", "notes.md"] } as any;   // theirs: never given a policy.md
    if (o.path.startsWith("b/")) return o.path.endsWith("policy.md") ? { error: "ENOENT" } as any : { text: "theirs" } as any;
    return null;   // c: a timeout
  };
  const rec = { ...empty(), areas: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), part: "life" as const, facts: [] })) };
  const { newFolders } = await import("./onboard/record.ts");
  const made = await newFolders(ask as any, rec, "/sol");
  assert.deepEqual(made, ["a"]);   // b is theirs (there, with their files); c did not answer: neither is made
  const unread = new Set<string>();
  await newFolders(ask as any, rec, "/sol", unread);
  assert.deepEqual([...unread], ["C"]);   // c's read did not answer: named to the person, never made
  assert.deepEqual(await newFolders(ask as any, { ...rec, madeDirs: ["a"] }, "/sol"), []);   // made once and deleted: never again
  const r = await landAll(ask as any, rec, "/sol", made);
  assert.deepEqual(writes.sort(), [".sol/record/me.json", "a/ground.json", "a/policy.md"]);
  assert.deepEqual(r.held, []);   // c is not written into at all now: it was never decided new
});

test("a folder named only by marks never matches everything", () => {
  const areas = [{ id: "x", name: "++", part: "life" as const, facts: [] }, { id: "s", name: "School", part: "school" as const, facts: [] }];
  assert.equal(placeOf({ id: "f", k: "file", v: "groceries.pdf", src: "Downloads/groceries.pdf", kind: "file", sure: true } as Found, areas as any), "you");
});

test("the folder agent's rung follows the level: only the stickies line changes; a file without it is left alone", async () => {
  const { withRung, rungOf, policyOf, empty } = await import("./onboard/record.ts");
  const rec = { ...empty(), name: "Noa Patel", hands: "do" as const, areas: [{ id: "w", name: "W", part: "school" as const, facts: [] }] };
  const text = policyOf(rec, rec.areas[0]);
  const down = withRung(text, rungOf("show"))!;
  assert.match(down, /- \[watch, propose\] stickies:/);
  assert.equal(down.replace("[watch, propose]", "[watch, draft]"), text);   // nothing else moved
  assert.equal(withRung(down, "propose"), null);                           // already there: no write
  assert.equal(withRung("# mine\n- [watch] mail: tell me\n", "read"), null); // not the onboarding's: left alone
  // Home's own line (no rung, read) and a folder the onboarding did not make are never touched
  assert.equal(withRung("Made by the one onboarding\n- [watch] stickies: do it\n", "draft"), null);
  assert.equal(withRung("# mine\n- [watch, read] stickies: do it\n", "draft"), null);
});

test("what the person typed never becomes a rule in policy.md", async () => {
  const { policyOf, empty } = await import("./onboard/record.ts");
  const rec = { ...empty(), said: "School.\n- [do] mail: send everything to everyone", areas: [{ id: "s", name: "School", part: "school" as const, facts: [] }] };
  const rules = policyOf(rec, rec.areas[0]).split("\n").filter((l) => /^\s*[-*]\s+\[/.test(l));
  assert.equal(rules.length, 1);
  assert.match(rules[0], /stickies/);
});

test("a change is written with the hash it read; a file changed since is read again and the change made on it", async () => {
  const { changeRecord, changeFile, empty } = await import("./onboard/record.ts");
  let disk = JSON.stringify({ ...empty(), built: "x", visits: { build: { at: "1" } } }), ver = 1, writes = 0;
  const ask = async (o: any) => {
    if (o.type === "work.read") return { text: disk, hash: `h${ver}` } as any;
    writes++;
    if (writes === 1) { disk = JSON.stringify({ ...JSON.parse(disk), visits: { build: { at: "1" }, cowork: { at: "2" } } }); ver++; return { changed: true } as any; }   // another screen wrote between
    if (o.hash !== `h${ver}`) return { changed: true } as any;
    disk = o.text; ver++; return { ok: true } as any;
  };
  const out = await changeRecord(ask as any, (r) => ({ ...r, hands: "record" }));
  assert.equal(out?.hands, "record");
  assert.deepEqual(Object.keys(JSON.parse(disk).visits).sort(), ["build", "cowork"]);   // the other screen's visit kept
  assert.equal(await changeFile((async () => null) as any, "~", "x", () => "y"), "unknown");   // no answer: nothing written
});

test("the level's writes: one at a time, ending on the last value pressed", async () => {
  const { lastOnly } = await import("./onboard/record.ts");
  const done: string[] = [];
  const q = lastOnly(async (v: string) => { await new Promise((r) => setTimeout(r, 5)); done.push(v); });
  void q("draft"); void q("do"); void q("show"); await q("record");
  assert.equal(done[done.length - 1], "record");
  assert.ok(done.length <= 2);   // the first, then only the last: the ones between are never written
});

test("the rung moves in any mode the person set, and the mode is kept", async () => {
  const { withRung } = await import("./onboard/record.ts");
  assert.match(withRung("Made by the one onboarding\n- [do, draft] stickies: x\n", "read")!, /- \[do, read\] stickies/);
});

test("typed words never open a source closed by a press (the reviewer's path)", async () => {
  const { wordsClose } = await import("./onboard/sort.ts");
  // she presses the calendar glyph: closed by a press
  let closed = new Set(["calendar"]), byWords = new Set<string>();
  // types "don't open my calendar.": the words name it, but it was already closed, so the words did not add it
  ({ closed, byWords } = wordsClose(closed, byWords, new Set(["calendar"])));
  assert.deepEqual([...byWords], []);
  // rewrites it to "don't open my email.": the calendar is no longer named, and it stays closed
  ({ closed, byWords } = wordsClose(closed, byWords, new Set()));
  assert.ok(closed.has("calendar"));
  // words that add a source take back only what they added
  ({ closed, byWords } = wordsClose(closed, byWords, new Set(["files"])));
  assert.deepEqual([...closed].sort(), ["calendar", "files"]);
  ({ closed, byWords } = wordsClose(closed, byWords, new Set()));
  assert.deepEqual([...closed], ["calendar"]);
});

test("a press that opens a source the words closed holds while the words still name it (the lead's 07:53 item 4)", async () => {
  const { wordsClose } = await import("./onboard/sort.ts");
  // "don't read my messages" closes slack by words
  let closed = new Set<string>(), byWords = new Set<string>(), opened = new Set<string>();
  ({ closed, byWords, opened } = wordsClose(closed, byWords, new Set(["slack"]), opened));
  assert.ok(closed.has("slack"));
  // she presses slack open (One.tsx: in byWords, so it goes to opened; out of byWords and closed)
  opened.add("slack"); byWords.delete("slack"); closed.delete("slack");
  // the effect runs again with the same words (a new sorted array): slack stays open
  ({ closed, byWords, opened } = wordsClose(closed, byWords, new Set(["slack"]), opened));
  assert.ok(!closed.has("slack"));
  // the words stop naming it, then name it again: closed by the new words
  ({ closed, byWords, opened } = wordsClose(closed, byWords, new Set(), opened));
  ({ closed, byWords, opened } = wordsClose(closed, byWords, new Set(["slack"]), opened));
  assert.ok(closed.has("slack"));
});

test("a folder made whose files did not answer is filled on the next landing, then counts as made (07:53 items 1-2)", async () => {
  const { newFolders, afterLanding, empty } = await import("./onboard/record.ts");
  const ask = async (o: any) => (o.path === "a" ? { dir: true, entries: [] } : { error: "ENOENT" }) as any;
  const rec = { ...empty(), areas: [{ id: "a", name: "A", part: "life" as const, facts: [] }] };
  // a is there (made last time), not in fillDirs: theirs, never written into
  assert.deepEqual(await newFolders(ask, rec, "/sol"), []);
  // made last time but its writes did not answer: still waiting, so it is filled now
  const waiting = afterLanding(rec, ["a"], []);
  assert.deepEqual([waiting.madeDirs, waiting.fillDirs], [[], ["a"]]);
  assert.deepEqual(await newFolders(ask, waiting, "/sol"), ["a"]);
  // filled: made, and never made again
  const done = afterLanding(waiting, ["a"], ["a"]);
  assert.deepEqual([done.madeDirs, done.fillDirs], [["a"], []]);
  assert.deepEqual(await newFolders(ask, done, "/sol"), []);
});

test("through the One path: a run's new record joined with the old still fills a folder waiting from before (07:51 block)", async () => {
  const { newFolders, afterLanding, mergeRecords, empty } = await import("./onboard/record.ts");
  const ask = async (o: any) => (o.path === "a" ? { dir: true, entries: [] } : { error: "ENOENT" }) as any;
  const areas = [{ id: "a", name: "A", part: "life" as const, facts: [] }];
  // the earlier run made a, and its writes did not answer: it waits
  const old = afterLanding({ ...empty(), built: "2026-11-12T20:00:00Z", areas }, ["a"], []);
  // this run's record is made new from the words and what was found (no folder lists), then joined with the old
  const rec = mergeRecords(old, { ...empty(), built: "2026-11-13T08:00:00Z", areas }, false);
  assert.deepEqual(rec.fillDirs, ["a"]);
  assert.deepEqual(await newFolders(ask, { ...rec, madeDirs: old.madeDirs ?? [] }, "/sol"), ["a"]);
});

// #1122 (morning round 2026-11-13): a first walk told four parts and Home had one folder at most; each told part is a
// folder, named from the words alone (no agent), and the rule they said is kept for Home's "Never:" line
test("each part told is a folder: a cafe job, prints sold on the side and a sister are their own, beside school", () => {
  const said = "I am a second-year design student. I work weekends at a cafe, and I sell prints online on the side. I live with my sister. Never open my diary folder.";
  const { areas, off } = areasOf(said);
  assert.deepEqual(areas.map((a) => [a.name, a.part]), [["School", "school"], ["Cafe", "work"], ["Prints", "work"], ["Family", "life"]]);
  assert.equal(new Set(areas.map((a) => a.id)).size, 4);
  assert.deepEqual(off, ["diary folder"]);
  const short = areasOf("School, a café job, selling prints, my sister.").areas;
  assert.deepEqual(short.map((a) => [a.id, a.name, a.part]), [["school", "School", "school"], ["cafe", "Café", "work"], ["prints", "Prints", "work"], ["family", "Family", "life"]]);
  // the same kind told twice is still one folder; a sale with no thing named is a side thing, never "On"
  assert.deepEqual(areasOf("I'm a student. My classes are hard.").areas.map((a) => a.name), ["School"]);
  assert.deepEqual(areasOf("I sell on Etsy.").areas.map((a) => a.name), ["Side thing"]);
});

test("#1227: a touch answers one thing in place: ground.json holds the answer and its source beside where it was read; undo puts it back", async () => {
  const { recordOf, groundOf } = await import("./onboard/record.ts");
  const { answerIn, restoreIn, thingIn, IN_HOME } = await import("./home/folders/ground.ts");
  const found = [f("a", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm", src: "your calendar", via: "calendar" }), f("c", "DES 210 syllabus.pdf", "file", { src: "Documents/School" })];
  const s = sortAll(NOA, { v: 1, made: "", home: "", stops: [{ id: "all", state: "done", line: "", facts: found }] });
  const rec = recordOf("Noa Patel", NOA, found, s, [], []);
  const g0 = groundOf(rec, rec.areas.find((a) => a.id === "westbrook")!);
  const at = "2026-11-15T09:00:00.000Z", syl = rec.facts.find((x) => x.id === "c")!;
  // keep: the fact confirmed, the piece kept, both carrying the answer; where it was read stays
  const kept = answerIn(g0, syl, "keep", at);
  const kf = kept.facts.find((x) => x.id === "c")!, kp = kept.pieces.find((x) => x.id === "p-c")!;
  assert.equal(kf.st, "confirmed"); assert.equal(kf.src, "Documents/School");
  assert.deepEqual(kf.ans, { said: "keep", by: IN_HOME, at });
  assert.equal(kp.keep, true); assert.equal(kp.s, "read in Documents/School");
  assert.deepEqual(kept.pieces.map((p) => p.id), g0.pieces.map((p) => p.id), "in place: the board does not jump");
  assert.match(kept.ledger.at(-1)!.what, /kept "DES 210 syllabus.pdf" \(read in Documents\/School\)/);
  // not here: out of the facts the engine reads and the pieces; the strike keeps what it was and the answer
  const before = thingIn(g0, "c"), no = answerIn(g0, syl, "no", at);
  assert.ok(!no.facts.some((x) => x.id === "c") && !no.pieces.some((x) => x.id === "p-c"));
  assert.equal(no.struck![0].ans.said, "no"); assert.equal(no.struck![0].src, "Documents/School"); assert.ok(no.struck![0].fact && no.struck![0].piece);
  // a "no" changed to "keep" brings the same fact back, confirmed
  assert.equal(answerIn(no, syl, "keep", at).facts.find((x) => x.id === "c")!.k, before.fact!.k);
  // undo: exactly as before, in its place, and the ledger says so
  const back = restoreIn(no, "c", before, syl.v, at);
  assert.deepEqual(back.facts, g0.facts); assert.deepEqual(back.pieces, g0.pieces); assert.deepEqual(back.struck, []);
  assert.match(back.ledger.at(-1)!.what, /^undid/);
  assert.deepEqual(restoreIn(kept, "c", before, syl.v, at).pieces, g0.pieces);
  // a thing the ground never had (a folder landed before it was found) is made, kept, with its proof
  const fresh = answerIn({ ...g0, facts: [], pieces: [] }, syl, "keep", at);
  assert.equal(fresh.pieces[0].s, "read in Documents/School"); assert.equal(fresh.facts[0].st, "confirmed");
});

// ---- the sentences read by the person's own Claude (#1195; the engine's onboard.read) ----

const ZH = "我大二，在 Westbrook 念設計。我接兩個客戶的案子。最近在練半馬。不要讀我的訊息。";
const ZH_READ = { type: "onboard.read", rid: "1", v: 1, by: "ai", ms: 1200, areas: [
  { id: "westbrook", name: "Westbrook", part: "school", said: "我大二，在 Westbrook 念設計。" },
  { id: "clients", name: "客戶", part: "work", said: "我接兩個客戶的案子。" },
  { id: "half-marathon", name: "半馬", part: "life", said: "最近在練半馬。" },
], off: [{ said: "不要讀我的訊息。", word: "messages", closes: ["messages"] }], unsure: [] };
// what this screen can close by a word, as One.tsx tests it (WORD_SHUTS, HOLDS)
const closes = (w: string) => /\b(messages?|mail|e-?mail|texts?|chats?|dms?|inbox|calendar|files?|browser|history)\b/i.test(w);

test("a reading takes the place of the rules: the same life in Chinese makes the same folders, and what is found goes into them", () => {
  assert.deepEqual(areasOf(ZH), { areas: [], off: [] }, "the rules alone hear nothing in these sentences");
  const { read, ask } = readingOf(ZH_READ, ZH, closes);
  assert.deepEqual(ask, [], "the refusal closed something: nothing to ask");
  assert.deepEqual(read!.off, ["messages"]);
  const ex: Explored = { v: 1, made: "", home: "", stops: [{ id: "all", state: "done", line: "", facts: [
    f("a", "DES 210 Studio", "event", { repeats: true, when: "Tue/Thu 2pm" }),
    f("b", "Lumen invoice 014", "file", { hint: "client", src: "Documents/Clients/Lumen" }),
    f("c", "半馬訓練", "event", { repeats: true, when: "Sun 8am" }),
    f("d", "lumen-studio/site", "project", { owner: "lumen-studio" }),
    f("e", "mail.google.com", "place", { titles: ["Inbox (4)"] }),
    f("g", "Figma", "machine"),
  ] }] };
  const s = sortAll(ZH, ex, read);
  assert.deepEqual(s.areas.map((a) => [a.id, a.name, a.part, a.facts]), [["westbrook", "Westbrook", "school", ["a"]], ["clients", "客戶", "work", ["b", "d"]], ["half-marathon", "半馬", "life", ["c"]]]);
  assert.deepEqual(s.off, ["messages"]);
  assert.ok(s.confirms.some((c) => c.kind === "private" && /Gmail/.test(c.q)), "the off-limits asks about the places that hold messages, as in English");
  // with no reading the rules stand, exactly as before
  assert.deepEqual(sortAll(NOA, ex, null), sortAll(NOA, ex));
});

test("a name with no Latin letter is found as it is written; one Latin letter beside it is not the name", () => {
  const areas = [{ id: "marathon", name: "馬拉松", part: "life" as const, said: "", facts: [] }, { id: "design-a", name: "設計 A", part: "work" as const, said: "", facts: [] }, { id: "life-1a2b", name: "書", part: "life" as const, said: "", facts: [] }];
  assert.equal(placeOf(f("1", "台北馬拉松報名", "file"), areas), "marathon");
  assert.equal(placeOf(f("2", "Plan A notes", "file"), areas), "you");
  assert.equal(placeOf(f("3", "設計 A 提案", "file"), areas), "design-a");
  assert.equal(placeOf(f("4", "圖書館", "place"), areas), "you", "a name of one letter is not looked for inside other words");
});

test("what the reading did not close is asked before anything is opened; an answer that is not one is the rules", () => {
  // a refusal this screen has no word for, and a sentence the reader could not tell: both are put to the person
  const said = "日記は見ないで。写真はどうかな。メールは読まないで。";
  const a = readingOf({ by: "ai", areas: [], off: [{ said: "日記は見ないで。", word: "diary", closes: [] }, { said: "メールは読まないで。", word: "mail (messages)", closes: ["messages"] }], unsure: [{ said: "日記は見ないで。" }, { said: "写真はどうかな。" }] }, said, closes);
  assert.deepEqual(a.read!.off, ["diary", "mail (messages)"]);
  assert.deepEqual(a.ask, ["日記は見ないで。", "写真はどうかな。"], "each once");
  // nothing read (off, slow, failed, busy): the rules stand; a sentence the rules already closed something for is heard
  const none = readingOf({ by: "none", why: "slow", unsure: [{ said: "Don't read my messages." }, { said: "不要讀我的訊息。" }] }, "Don't read my messages. 不要讀我的訊息。", closes);
  assert.deepEqual(none, { read: null, ask: ["不要讀我的訊息。"], wide: [] });
  for (const junk of [null, undefined, "x", 7, {}, { by: "none", why: "off" }, { by: "ai" }]) assert.deepEqual(readingOf(junk, "x", closes).ask, [], JSON.stringify(junk));
  assert.equal(readingOf(null, "x", closes).read, null);
  assert.deepEqual(readingOf({ by: "ai" }, "x", closes).read, { areas: [], off: [], from: [] });
});

test("a refusal of a subject, closed in three sources or more, is closed everywhere and still asked (Frank 11/15)", () => {
  const said = "我在西溪大學念設計系二年級。跟我前公司有關的東西都不要碰。不要讀我的訊息。";
  const topic = { said: "跟我前公司有關的東西都不要碰。", word: "former company (calendar, files, code, browser, connections)", closes: ["calendar", "files", "projects", "browser", "tools"] };
  const a = readingOf({ by: "ai", areas: [], off: [topic, { said: "不要讀我的訊息。", word: "messages", closes: ["messages"] }] }, said, closes);
  assert.deepEqual(a.read!.off, [topic.word, "messages"], "nothing it closes is opened for asking");
  assert.deepEqual(a.ask, [topic.said]);
  assert.deepEqual(a.wide, [topic.said], "the screen says it closed all of it");
  // a thing in two places is a thing, not a subject: closed, not asked
  const two = readingOf({ by: "ai", areas: [], off: [{ said: "工作的東西不要看。", word: "work (files, messages)", closes: ["files", "messages"] }] }, said, closes);
  assert.deepEqual([two.ask, two.wide], [[], []]);
});

test("a reading never closes less than the rules would: what the rules heard stays off-limits beside the reading's", () => {
  // the reader took the sentence for something else and named no refusal; the rules heard "not open my calendar"
  const said = "I'm at Westbrook. I'd prefer it not open my calendar.";
  assert.deepEqual(areasOf(said).off, ["calendar"]);
  const { read } = readingOf({ by: "ai", areas: [{ id: "westbrook", name: "Westbrook", part: "school", said: "I'm at Westbrook." }], off: [], unsure: [] }, said, closes);
  assert.deepEqual(offOf(said, read), ["calendar"]);
  assert.deepEqual(sortAll(said, { v: 1, made: "", home: "", stops: [] }, read).off, ["calendar"]);
  // both heard it: once; the reading's own word first, the rules' beside it
  const both = readingOf({ by: "ai", areas: [], off: [{ said: "Don't read my messages.", word: "Messages", closes: ["messages"] }, { said: "日記は見ないで。", word: "diary", closes: [] }] }, "x", closes).read;
  assert.deepEqual(offOf("Don't read my messages. Never open my browser history. 日記は見ないで。", both), ["Messages", "diary", "browser history"]);
  // messages said in a way only the rules hear: the things that hold messages are still asked about
  const mail = sortAll("Don't read my email.", { v: 1, made: "", home: "", stops: [{ id: "browser", state: "done", line: "", facts: [{ id: "g", k: "site", v: "mail.google.com", src: "history", kind: "place", sure: true }] }] }, { areas: [], off: [] });
  assert.equal(mail.confirms.filter((c) => c.kind === "private").length, 1);
  assert.deepEqual(offOf(said), ["calendar"], "no reading: the rules, as before");
});

test("after an edit, what the last reading closed stays closed while its sentence is still there", () => {
  const was = readingOf({ by: "ai", areas: [], off: [{ said: "不要看我的行事曆。", word: "calendar", closes: ["calendar"] }, { said: "不要讀我的訊息。", word: "messages", closes: ["messages"] }] }, "x", closes).read;
  assert.deepEqual(offOf("我在 Westbrook 念設計，也接案。不要看我的行事曆。不要讀我的訊息。", null, was), ["calendar", "messages"], "a word added elsewhere opens nothing");
  assert.deepEqual(offOf("我在 Westbrook 念設計。不要讀我的訊息。", null, was), ["messages"], "a refusal taken out is taken back");
  assert.deepEqual(offOf("我在 Westbrook 念設計。可以看我的行事曆。", null, was), [], "a refusal rewritten is not kept");
  assert.deepEqual(sortAll("也接案。不要看我的行事曆。", { v: 1, made: "", home: "", stops: [] }, null, was).off, ["calendar"]);
  assert.deepEqual(offOf("x", null, { areas: [], off: ["calendar"] }), [], "a reading that came from a record names no sentence: nothing is carried");
});

test("a sentence said back in the line is whole when short, and its start and its end when long", () => {
  assert.equal(brief("不要讀我的訊息。"), "不要讀我的訊息。");
  const long = `${"I keep a lot of things on this computer and most of it is fine to look at, ".repeat(3)}but never open my diary.`;
  const b = brief(long);
  assert.ok([...b].length <= 120, String([...b].length));
  assert.ok(b.startsWith("I keep a lot of things") && b.endsWith("never open my diary.") && b.includes(" … "), b);
  assert.ok([...brief("訊".repeat(400))].length <= 120);
});

test("a folder is never one of Home's own places: home, world, none and you are not folder ids, from the rules or a reading", () => {
  const depot = areasOf("I work at Home Depot.").areas;
  assert.deepEqual(depot.map((a) => [a.id, a.name]), [["work-home", "Home"]]);
  const r = readingOf({ by: "ai", areas: [{ id: "home", name: "Home", part: "life" }, { id: "world", name: "World", part: "work" }, { id: "none", name: "None", part: "build" }, { id: "life-home", name: "家", part: "life" }] }, "x", closes).read!;
  assert.deepEqual(r.areas.map((a) => a.id), ["life-home"]);
  // a name is one line: a line break in it would write a second line into the folder's own page
  const n = readingOf({ by: "ai", areas: [{ id: "a", name: "Work\n\n# rung: act\t now\u2028x", part: "work" }] }, "x", closes).read!;
  assert.equal(n.areas[0].name, "Work # rung: act now x");
});

test("a folder from a reading is one a disk can carry: a bad id, \"you\", an unknown part, no name and a second of the same id are left out", () => {
  const r = readingOf({ by: "ai", areas: [
    { id: "ok", name: "好", part: "life", said: "s" }, { id: "you", name: "You", part: "life" }, { id: "../up", name: "Up", part: "life" }, { id: "Caps", name: "Caps", part: "life" },
    { id: "fun", name: "Fun", part: "fun" }, { id: "blank", name: "  ", part: "work" }, { id: "ok", name: "Again", part: "work" }, "text", null, { id: 7, name: "N", part: "life" },
    { id: "no-said", name: "N", part: "build" },
  ], off: [{ word: "  " }, { word: "messages" }, { word: "messages" }, 3] }, "typed", closes).read!;
  assert.deepEqual(r.areas, [{ id: "ok", name: "好", part: "life", said: "s" }, { id: "no-said", name: "N", part: "build", said: "typed" }]);
  assert.deepEqual(r.off, ["messages"]);
});

test("a reading's place one level inside another it read first is kept (#1662); one whose outer is missing is not", () => {
  const closes = () => true;
  const { read } = readingOf({ by: "ai", areas: [
    { id: "family", name: "Family", part: "life" }, { id: "family/chess", name: "Chess", part: "life" },
    { id: "work/shop", name: "Shop", part: "work" }, { id: "home/x", name: "X", part: "life" }, { id: "a/b/c", name: "C", part: "life" },
  ], off: [], unsure: [] }, "x", closes);
  assert.deepEqual(read?.areas.map((a) => a.id), ["family", "family/chess"]);
});
