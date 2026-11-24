// How Sol sees you (BR1, #1615; next/you.ts, you-read.ts, you-accounts.ts, sieve.ts). The people are the panel's only
// (Dev, Denise, 민지, Tomás, Lucy: docs/marketing/brand/pack/panel.md), each a made-up Mac home in
// a temp folder; nothing here is any real person's. The readers that reach outside the engine (the explorer, the store
// reader, the browsers' history, the Keychain, the network) are stand-ins, so what is tested is what the engine does with
// what they give. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answer, apply, backItem, readAgain, byOf, CLAUDE_ASK, dropPart, forgetFact, setDay, setTalk, talkSeen, dueAgain, digestOf, orderOf, quietOf, read, setAgain, setAims, setKeep, setLevel, sharesOf, synthOf, youHere, youHereTold, firstTurnHere, youOf, refusedAt, DIGEST_MAX, HERE_MAX, placesLine, rulesOf, type Watched, type Where } from "./you.js";
import { checkKey, accountsOf, permsOf, presentSources, underSolApp, type Keychain } from "./you-accounts.js";
import { binOf, makeSieve } from "./sieve.js";
import { addFact, staleFact, wordsAt } from "./context.js";
import { ofPart, becauseFor, becauseOf, dropKnown, fixFact, forgetKnown, inFolder, knownNow, leave, noteFix, noteFixIn, noteStop, NO_FIX_PLACE, NO_FIX_REASON, outcomesOf, place, placedNow, placeOfCwd, readStore, rememberTold, sameFor, seenPlaced, setClaude, setReadSource, sinceOf, toldOf, tryFit } from "./you-known.js";
import { fitsOf, personSet, takeOf } from "./fits.js";
import { keepMoveIn, moveinFile, readMoveIn } from "./movein.js";
import { shelfPut, shelfTake } from "./movein-place.js";
import { readJson } from "./file.js";
import { readDay, dayOf, writeLine, NO_LINE_BECAUSE } from "./diary.js";
import { fileIs, folderIs, namesOf, plainSkill, plainTool, siteGroups, type Deps } from "./you-read.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-next-you-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = new Date(2026, 10, 18, 15, 0).getTime();   // a Wednesday
const at = (daysAgo: number, hour: number) => { const d = new Date(NOW - daysAgo * 864e5); d.setHours(hour, 7, 0, 0); return d.getTime(); };
const BODY = "THE WORDS OF A MESSAGE THAT MUST NEVER LEAVE ITS FILE";
const KEYISH = ["sk", "ant", "api03", "AbCdEfGhIjKlMnOpQrStUv"].join("-");   // a key's shape, made here so none is committed

type Person = { u: string; w: Where };
/** a home: the person's folder, Sol's home inside it (so their record is inside SOL_HOME too) */
function home(name: string, rec: Record<string, unknown> | null): Person {
  const u = join(root, name), sol = join(u, ".sol");
  fs.mkdirSync(join(sol, "record"), { recursive: true });
  if (rec) fs.writeFileSync(join(sol, "record", "me.json"), JSON.stringify({ solHome: sol, areas: [], ...rec }, null, 2));
  return { u, w: { sol, user: u } };
}
const write = (p: string, text = "") => { fs.mkdirSync(join(p, ".."), { recursive: true }); fs.writeFileSync(p, text); };
const recordOf = (p: Person) => JSON.parse(fs.readFileSync(join(p.w.sol, "record", "me.json"), "utf8"));

/** Claude Code sessions in a folder: one transcript each, its last write at the hour given, its turns using tools */
function sessions(p: Person, folder: string, times: number[], tools: { skill?: string; mcp?: string } = {}) {
  const cwd = join(p.u, folder);
  fs.mkdirSync(cwd, { recursive: true });
  const dir = join(p.u, ".claude", "projects", folder.replace(/[^A-Za-z0-9]/g, "-"));
  times.forEach((t, i) => {
    const f = join(dir, `s${i}.jsonl`);
    const lines = [
      { type: "user", cwd, timestamp: new Date(t - 40 * 60000).toISOString(), message: { content: BODY } },
      ...(tools.skill ? [{ type: "assistant", message: { content: [{ type: "tool_use", id: `tu${i}`, name: "Skill", input: { skill: tools.skill } }] } }] : []),
      ...(tools.mcp ? [{ type: "assistant", message: { content: [{ type: "tool_use", id: `tm${i}`, name: `mcp__${tools.mcp}__do_thing`, input: { text: BODY } }] } }] : []),
    ];
    write(f, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    fs.utimesSync(f, t / 1000, t / 1000);
  });
}

type Fact = { id: string; k: string; v: string; src?: string; path?: string; at?: string; open?: boolean };
/** stand-ins for the readers outside the engine, from what each person's Mac holds */
function deps(m: { apps?: string[]; open?: string[]; files?: { name: string; path: string; at: number }[]; projects?: { name: string; at: number }[]; hosts?: [string, number, string][]; dates?: { title: string; at: number; repeats?: boolean }[]; notes?: { name: string; items: string[] }[]; calendar?: "switch" }, calls: string[] = []): Deps {
  const facts: Record<string, Fact[]> = {
    machine: (m.apps ?? []).map((v) => ({ id: `app:${v}`, k: "app", v, open: (m.open ?? []).includes(v) })),
    files: (m.files ?? []).map((f) => ({ id: `file:${f.path}`, k: "file", v: f.name, path: f.path, at: new Date(f.at).toISOString() })),
    projects: (m.projects ?? []).map((x) => ({ id: `project:${x.name}`, k: "project", v: x.name, src: `~/Code/${x.name}`, at: new Date(x.at).toISOString() })),
  };
  return {
    explore: async (args, _out, tick) => {
      calls.push("explore");
      const skip = args[args.indexOf("--skip") + 1].split(",");
      const stop = ["machine", "files", "projects"].find((s) => !skip.includes(s))!;
      const all = facts[stop];
      tick({ stops: [{ id: stop, facts: all.slice(0, 1) }] });   // a half-written file first, as the live one is
      tick({ stops: [{ id: stop, facts: all }] });
    },
    store: async () => { calls.push("store"); return (a: Record<string, unknown>) => {
      if (a.store === "calendar") return m.calendar === "switch" ? { ok: false, need: { kind: "switch" } } : { ok: true, groups: [{ name: "Calendar", items: (m.dates ?? []).map((d) => ({ title: d.title, at: new Date(d.at).toISOString(), repeats: !!d.repeats })) }] };
      return { ok: true, groups: (m.notes ?? []).map((g) => ({ name: g.name, items: g.items.map((t, i) => ({ title: t, at: new Date(at(i, 9)).toISOString() })) })) };
    }; },
    hosts: async () => { calls.push("hosts"); return m.hosts ? m.hosts.map(([host, n, browser]) => ({ host, n, browser })) : null; },
    bundle: (app) => `com.example.${app.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    now: () => NOW,
  };
}
const watch = () => { const evs: Watched[] = []; return { evs, emit: (e: Watched) => evs.push(e) }; };

// ------------------------------------------------------------------------------------------------- the five people

/** Dev: a solo founder who builds at night; Claude Code in four folders, code, apps, a browser, a calendar */
function dev(name = "dev"): { p: Person; d: Deps; sources: string[] } {
  const p = home(name, { name: "Dev", said: "go", aims: [{ w: "Building things", said: true, ok: true, at: "2026-11-18" }, { w: "My business", said: true, ok: true, at: "2026-11-18" }], consent: { levels: {} } });
  const night = (n: number) => Array.from({ length: n }, (_, i) => at(i % 9, [21, 22, 23, 0][i % 4]));
  sessions(p, "Code/checkout-app", night(6), { skill: "review", mcp: "github" });
  sessions(p, "Code/pipeline", night(4), { skill: "review" });
  sessions(p, "Code/docs-site", night(2));
  sessions(p, "Code/api-keys", night(2));   // a folder named for what it holds: binned, a count only
  write(join(p.u, "Code/checkout-app/package.json"), "{}"); write(join(p.u, "Code/checkout-app/tsconfig.json"), "{}"); fs.mkdirSync(join(p.u, "Code/checkout-app/.git"), { recursive: true });
  write(join(p.u, "Code/pipeline/pyproject.toml"), ""); write(join(p.u, "Code/pipeline/run.py"), "");
  return {
    p, sources: ["claude-sessions", "projects", "apps", "browser", "calendar-store", "files"],
    d: deps({
      apps: ["Cursor", "Ghostty", "Linear", "Figma", "Spotify", "WhatsApp", "1Password"], open: ["Cursor", "Ghostty"],
      files: [
        { name: "launch plan.md", path: "~/Documents/Launch/launch plan.md", at: at(1, 22) },
        { name: "passwords.txt", path: "~/Documents/Launch/passwords.txt", at: at(1, 22) },
        { name: "Invoice 2026-10.pdf", path: "~/Documents/Admin/Invoice 2026-10.pdf", at: at(3, 11) },
        { name: `${KEYISH}.txt`, path: `~/Downloads/${KEYISH}.txt`, at: at(2, 23) },
      ],
      projects: [{ name: "checkout-app", at: at(0, 23) }, { name: "pipeline", at: at(1, 22) }, { name: "synth", at: at(50, 21) }, { name: "tax-returns", at: at(20, 10) }],
      hosts: [["github.com", 120, "Safari"], ["vercel.com", 40, "Safari"], ["stripe.com", 30, "Safari"], ["linear.app", 25, "Safari"], ["chase.com", 5, "Safari"], ["mail.google.com", 15, "Safari"]],
      dates: [{ title: "Launch", at: at(-17, 10) }, { title: "Deploy", at: at(-2, 16), repeats: true }, { title: "Dentist", at: at(-5, 9) }, { title: "Passport renewal", at: at(-9, 12) }],
    }),
  };
}
/** Denise: "only what I tell you": nothing read, the picture from what she typed */
function denise(): Person {
  const p = home("denise", { name: "Denise", said: "only what I tell you", areas: [{ id: "studio", name: "The studio" }], aims: [{ w: "My studio's price list", said: true, ok: true, at: "2026-11-18" }] });
  addFact(p.w.sol, { place: "studio", fact: "Runs a small wellness studio", source: "you" });
  return p;
}
/** 민지: a studio in Korean; apps, a browser, files in two client folders */
function minji(): { p: Person; d: Deps; sources: string[] } {
  const p = home("minji", { name: "민지", said: "go", aims: [{ w: "일 · 스튜디오", said: true, ok: true, at: "2026-11-18" }, { w: "창작", said: true, ok: true, at: "2026-11-18" }] });
  const f = (folder: string, n: number, h: number) => Array.from({ length: n }, (_, i) => ({ name: `시안 ${i + 1}.png`, path: `~/Documents/${folder}/시안 ${i + 1}.png`, at: at(i % 5, h + (i % 6)) }));
  return {
    p, sources: ["apps", "browser", "files"],
    d: deps({
      apps: ["Figma", "Photoshop", "Notion", "KakaoTalk"], open: ["Figma"],
      files: [...f("하나 브랜드", 8, 10), ...f("오름 카페", 6, 11), { name: "계좌 정보.xlsx", path: "~/Documents/스튜디오 운영/계좌 정보.xlsx", at: at(2, 14) }, { name: "여권 스캔.jpg", path: "~/Downloads/여권 스캔.jpg", at: at(4, 15) }],
      hosts: [["figma.com", 80, "Chrome"], ["pinterest.com", 60, "Chrome"], ["naver.com", 30, "Chrome"], ["kakaobank.com", 4, "Chrome"]],
    }),
  };
}
/** Tomás: blind, VoiceOver; apps, a calendar, files, notes (two about a book) */
function tomas(): { p: Person; d: Deps; sources: string[] } {
  const p = home("tomas", { name: "Tomás", said: "go", aims: [{ w: "Work", said: true, ok: true, at: "2026-11-18" }] });
  return {
    p, sources: ["apps", "calendar-store", "files", "notes"],
    d: deps({
      apps: ["VoiceOver Utility", "Pages", "Mail", "Music"],
      files: [1, 2, 3].map((i) => ({ name: `report ${i}.pages`, path: `~/Documents/Clients/report ${i}.pages`, at: at(i, 9 + i) })),
      dates: Array.from({ length: 11 }, (_, i) => ({ title: `Client call ${i + 1}`, at: at(-i - 1, 10) })),
      notes: [{ name: "The book", items: ["Chapter one", "Chapter two", "Outline", "Characters", "Ending"] }, { name: "Home", items: ["Groceries", "Medication list"] }],
    }),
  };
}
/** Lucy: a branding business, a newsletter, a lot of ideas; calendar, notes, a browser, apps */
function lucy(): { p: Person; d: Deps; sources: string[] } {
  const p = home("lucy", { name: "Lucy", said: "go", aims: [{ w: "My business", said: true, ok: true, at: "2026-11-18" }] });
  return {
    p, sources: ["calendar-store", "notes", "browser", "apps"],
    d: deps({
      apps: ["Figma", "Canva", "Substack"],
      dates: [{ title: "Client A review", at: at(-1, 9) }, { title: "Newsletter out", at: at(-3, 20), repeats: true }, { title: "Therapy", at: at(-2, 17) }],
      notes: [{ name: "Ideas", items: Array.from({ length: 12 }, (_, i) => `idea ${i + 1}`) }, { name: "Newsletter", items: ["issue 12", "issue 13", "subject lines", "sponsors", "drafts"] }, { name: "Clients", items: ["Client A", "Client B", "Client C", "brief A", "brief B", "My bank login"] }],
      hosts: [["canva.com", 50, "Chrome"], ["substack.com", 20, "Chrome"], ["mail.google.com", 30, "Chrome"]],
    }),
  };
}

// ----------------------------------------------------------------------------------------------------- the sieve

test("the sieve: a password-like name is binned, an app's name is judged by its shape, a kept bin passes", () => {
  for (const name of ["passwords.txt", "My bank login", "api-keys", "id_rsa", "recovery codes", KEYISH, "비밀번호 메모"]) assert.ok(binOf({ name }), name);
  assert.equal(binOf({ name: "keyboard shortcuts" }), null);
  assert.equal(binOf({ name: "Monkey island" }), null);
  assert.equal(binOf({ name: "1Password", kind: "app" }), null);
  assert.equal(binOf({ name: "x", host: "chase.com" }), "money");
  assert.equal(binOf({ name: "config", path: "~/.ssh/config" }), "keys");
  const s = makeSieve(["money"]);
  assert.equal(s.pass({ name: "Invoice 2026-10.pdf" }), true);
  assert.equal(s.pass({ name: "passwords.txt" }), false);
  assert.deepEqual(s.thrown, { keys: 1, money: 0, health: 0, talk: 0, id: 0 });
});

test("Dev: a password-like name never reaches the digest, and the counts are right", async () => {
  const { p, d, sources } = dev();
  const { evs, emit } = watch();
  const you = await read(p.w, { sources }, emit, { read: d, now: () => NOW });
  const digest = you.read.digest;
  assert.ok(digest.length > 0 && digest.length <= DIGEST_MAX);
  assert.doesNotMatch(digest.replace("1Password", ""), /password|api-keys|sk-ant|invoice|chase|dentist|passport|tax-returns|mail\.google/i);
  assert.match(digest, /checkout-app/);
  // keys: api-keys (a folder), passwords.txt, the key-shaped name; money: tax-returns, the invoice, chase.com;
  // health: the dentist; talk: the mail host; id: the passport
  assert.deepEqual(you.sieve.thrown, { keys: 3, money: 3, health: 1, talk: 1, id: 1 });
  assert.deepEqual(recordOf(p).sieve.thrown, you.sieve.thrown);
  // the stream's counts are the same counts
  const streamed: Record<string, number> = {};
  for (const e of evs) if (e.kind === "thrown") streamed[e.bin] = (streamed[e.bin] ?? 0) + e.n;
  assert.deepEqual(streamed, { keys: 3, money: 3, health: 1, talk: 1, id: 1 });
  // a bin ticked "keep" passes on the next read
  setKeep(p.w, { keep: ["money"] });
  const again = await read(p.w, { sources: ["files"] }, () => {}, { read: d, now: () => NOW });
  assert.equal(again.sieve.thrown.money, 0);
  assert.match(again.read.digest, /Files: 2 recent names/);   // the plan and the invoice; the two key-like names stay out
});

// BR1 order 1: a folder removed in the move-in ("mac") is never read back as a place, so the reading screen never
// offers "a place for" it again; the setup's places are the folders kept, the canvas's one list
test("a folder removed in the move-in is not read again; the setup offers the folders kept", async () => {
  const { p, d } = dev();
  const pipeline = join(p.u, "Code/pipeline"), checkout = join(p.u, "Code/checkout-app");
  keepMoveIn(p.w.sol, { keep: ["w:" + checkout], fix: { ["w:" + checkout]: { name: "Checkout" } }, drop: ["w:" + pipeline] });
  const you = await read(p.w, { sources: ["claude-sessions"] }, () => {}, { read: d, now: () => NOW });
  assert.ok(you.parts.some((x) => x.id === checkout), "the kept folder is read");
  assert.ok(!you.parts.some((x) => x.id === pipeline), "the removed one is not");
  const places = youOf(p.w).setup.filter((s) => s.kind === "place");
  assert.deepEqual(places.map((s) => [s.id, s.name]), [[checkout, "Checkout"]]);
  fs.rmSync(moveinFile(p.w.sol));   // Dev's home is shared: the later tests read Dev before any move-in
});

test("BR1 holds 1 and 2: once folders are kept the read draws only those, one line per folder with its one count", async () => {
  const { p, d, sources } = dev();
  const checkout = join(p.u, "Code/checkout-app");
  keepMoveIn(p.w.sol, { keep: ["w:" + checkout], fix: { ["w:" + checkout]: { name: "Checkout" } } });
  const { evs, emit } = watch();
  const you = await read(p.w, { sources }, emit, { read: d, now: () => NOW });
  const placeEvs = evs.filter((e) => e.kind === "place") as { id: string }[];
  assert.ok(placeEvs.length > 0 && placeEvs.every((e) => e.id === checkout), `only the kept folder takes shape: ${placeEvs.map((e) => e.id)}`);
  const setups = evs.filter((e) => e.kind === "item" && (e as { setup?: string }).setup?.startsWith("a place for")) as { setup: string }[];
  assert.ok(setups.length > 0 && setups.every((e) => /checkout-app|Checkout/.test(e.setup)), `only the kept folder is offered: ${setups.map((e) => e.setup)}`);
  assert.deepEqual(you.parts.map((x) => x.id), [checkout], "the picture's places are the kept ones");
  // every line about a folder carries its place, and its last count is the folder's one number
  const lines = evs.filter((e) => e.kind === "item" && (e as { place?: string }).place) as { place: string; notice: string }[];
  const last = lines.filter((e) => e.place === checkout).at(-1)!;
  const seen = readJson(join(p.w.sol, "next", "you.json")).data.seen.places.find((x: { id: string }) => x.id === checkout);
  assert.equal(Number(/^(\d+) session/.exec(last.notice)![1]), (seen.sessions.claude ?? 0) + (seen.sessions.codex ?? 0));
  fs.rmSync(moveinFile(p.w.sol));
});

test("BR1 rapid ruling: places with no chats behind them have no share, never an even split; with chats it is unchanged", async () => {
  const Four = home("four", { name: "Four", said: "only what I tell you", areas: ["Work", "Home", "School", "Money"].map((n) => ({ id: n.toLowerCase(), name: n })) });
  const none = await read(Four.w, { by: "none", sources: [] }, () => {}, { now: () => NOW });
  assert.deepEqual(none.parts.map((x) => [x.name, x.share]), [["Work", null], ["Home", null], ["School", null], ["Money", null]]);
  assert.ok(none.parts.every((x) => !x.main) && !none.questions.some((q) => /most of your time/.test(q.q)), "no main place, no question that assumes one");
  assert.deepEqual(youOf(Four.w).parts.map((x) => x.share), [null, null, null, null], "the same when You is opened again");
  assert.ok(!ofPart(youOf(Four.w).parts[0]).some((k) => /of your time/.test(k.fact)), "and no line says it");
  const { p, d, sources } = dev();
  const dv = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.ok(dv.parts.every((x) => typeof x.share === "number") && Math.round(dv.parts.reduce((n, x) => n + x.share!, 0) * 100) === 100);
});

test("BR1 H4: every folder the person keeps is a place in You, one with no session or file read too, its share nothing", async () => {
  const { p, d, sources } = dev();
  const checkout = join(p.u, "Code/checkout-app"), garden = join(p.u, "Garden notes");
  keepMoveIn(p.w.sol, { keep: ["w:" + checkout, "w:" + garden, "h:life"], fix: { "h:life": { name: "Life" } } });
  const you = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(you.parts.map((x) => x.id), [checkout, garden, "h:life"], "the kept folders, in the order kept, each once");
  assert.deepEqual(you.parts.slice(1).map((x) => [x.name, x.share, x.ais]), [["Garden notes", 0, 0], ["Life", 0, 0]]);
  assert.ok(you.parts[0].share > 0);
  assert.deepEqual(youOf(p.w).parts.map((x) => x.id), you.parts.map((x) => x.id), "the same places when You is opened again");
  fs.rmSync(moveinFile(p.w.sol));
});

test("BR1 conform #9: a read that counted nothing never says nothing was read over a picture that has places", async () => {
  assert.equal(rulesOf({ places: [], hours: Array(24).fill(0), skills: [], servers: [], ais: [], apps: [], hosts: [], dates: [], notes: { n: 0, folders: 0 }, files: [], repos: [], thrown: { keys: 0, money: 0, health: 0, talk: 0, id: 0 }, sources: [] } as never).headline, "Sol has nothing read yet: tell it yourself");
  assert.equal(placesLine([{ name: "life", share: 0.25 }]), "You have one place: life");
  assert.equal(placesLine([{ name: "b", share: 0.2 }, { name: "a", share: 0.5 }]), "You have two places: a and b");
  assert.equal(placesLine(["a", "b", "c", "d", "e"].map((name, i) => ({ name, share: 1 - i / 10 }))), "You have five places: a, b, c and 2 more");
  const { p } = dev();
  keepMoveIn(p.w.sol, { keep: ["h:life", "h:school"], fix: { "h:life": { name: "Life" }, "h:school": { name: "School" } } });
  const you = await read(p.w, { sources: ["notes"] }, () => {}, { read: deps({}), now: () => NOW });
  assert.deepEqual(you.parts.map((x) => x.name), ["Life", "School"]);
  assert.equal(you.headline, "You have two places: Life and School", "the read found nothing; the kept places are named");
  fs.rmSync(moveinFile(p.w.sol));
});

test("BR1 H4: a folder on the shelf is no place in You and no setup chip; taken off the shelf it is back", async () => {
  const { p, d, sources } = dev("dev-shelf");
  const checkout = join(p.u, "Code/checkout-app"), pipeline = join(p.u, "Code/pipeline");
  keepMoveIn(p.w.sol, { keep: ["w:" + checkout, "w:" + pipeline, "h:life"] });
  await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.ok(shelfPut(p.w, { folder: "w:" + pipeline, name: "pipeline" }, NOW + 1).ok);
  const y = youOf(p.w, NOW + 2);
  assert.deepEqual(y.parts.map((x) => x.id), [checkout, "h:life"], "the shelved folder leaves the circle");
  assert.ok(!y.setup.some((s) => s.kind === "place" && s.id === pipeline));
  assert.ok(shelfTake(p.w, { folder: "w:" + pipeline }, NOW + 3).ok);
  assert.ok(youOf(p.w, NOW + 4).parts.some((x) => x.id === pipeline), "back off the shelf, back in You");
});

test("the reading stream: every event names a thing, none carries a body, binned items arrive as counts", async () => {
  const { p, d, sources } = dev();
  const { evs, emit } = watch();
  await read(p.w, { sources }, emit, { read: d, now: () => NOW });
  const first = evs[0];
  assert.equal(first.kind, "order");
  if (first.kind === "order") {
    assert.deepEqual(first.order.slice(0, 2), ["claude-sessions", "projects"]);
    assert.match(first.because!.line, /^Because you said Building things, Sol reads Claude Code and your code first$/);
  }
  assert.equal(evs.at(-1)!.kind, "done");
  const text = JSON.stringify(evs.slice(0, -1));
  assert.ok(!text.includes(BODY), "a body left its file");
  assert.doesNotMatch(text, /passwords|api-keys|sk-ant|Invoice|chase|Dentist|Passport|tax-returns/);
  for (const e of evs) {
    if (e.kind === "item") assert.ok(e.item.trim().length > 0 && e.item.length < 200, JSON.stringify(e));
    if (e.kind === "thrown") { assert.match(e.item, /^\d+ thrown away: (keys|money|health|talk|id)$/); assert.ok(e.n > 0); }
    if (e.kind === "source") assert.ok(e.line.trim() && ["waiting", "reading", "done", "skipped"].includes(e.state));
    if (e.kind === "place") { assert.ok(e.name && e.colour); assert.ok(e.share > 0 && e.share <= 1); }
  }
  // each source waits, reads, then is done or skipped, in the order chosen; places take shape mid-read
  for (const s of sources) {
    const states = evs.filter((e) => e.kind === "source" && e.source === s).map((e) => (e as { state: string }).state);
    assert.deepEqual(states.slice(0, 2), ["waiting", "reading"], s);
    assert.ok(["done", "skipped"].includes(states[2]), s);
  }
  assert.ok(evs.findIndex((e) => e.kind === "place") < evs.findIndex((e) => e.kind === "source" && e.source === "projects" && e.state === "reading"));
  assert.ok(evs.some((e) => e.kind === "item" && /^skill review, used 10 times$/.test(e.item)));
  assert.ok(evs.some((e) => e.kind === "item" && e.item === "Safari: 4 sites, mostly code and work"));
  const apps = evs.filter((e) => e.kind === "item" && e.source === "apps");
  assert.ok(apps.some((e) => e.kind === "item" && e.item === "Cursor, open now"));
  // BR1 rapid 13:05: every row opens to what it took and what it added, and says what Sol noticed (never an empty column)
  const items = evs.filter((e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item");
  for (const e of items) {
    assert.ok(e.more && e.more.name && e.more.adds, `a row with nothing to open: ${e.item}`);
    assert.ok(e.notice && e.notice.trim(), `a row with nothing noticed: ${e.item}`);
  }
  const folder = items.find((e) => e.more?.kind === "folder" && e.more.sessions)!.more!;
  assert.ok(folder.is && folder.where?.startsWith("~") && Object.values(folder.sessions!).some((n) => n! > 0), JSON.stringify(folder));
  const sites = items.find((e) => e.item === "Safari: 4 sites, mostly code and work")!.more!;
  assert.deepEqual(sites.groups!.map((g) => g.what).slice(0, 2).sort(), ["code", "work"]);
  assert.ok(sites.groups!.every((g) => g.n > 0 && g.sites.length > 0 && g.sites.length <= 3));
  assert.equal(items.find((e) => e.more?.kind === "skill")!.more!.name, "review");
});

test("a read row's words: a skill's pack prefix goes, a file's kind from its ending, sites grouped by what they are for", () => {
  assert.equal(plainSkill("some-pack:grilling"), "grilling");
  assert.equal(plainSkill("write_a_prd"), "write a prd");
  assert.equal(fileIs("Report 2026.pdf"), "a PDF");
  assert.equal(fileIs("budget.xlsx"), "a spreadsheet");
  assert.equal(fileIs("notes"), "a file");
  assert.equal(folderIs({ repo: false, langs: [], rules: [] }), "a folder you work on with your AI");
  assert.equal(folderIs({ repo: true, langs: ["Python"], rules: [] }), "a code project, mostly Python");
  const g = siteGroups([{ host: "a.com", n: 2, group: "other" }, { host: "github.com", n: 5, group: "code" }, { host: "gitlab.com", n: 1, group: "code" }]);
  assert.deepEqual(g, [{ what: "code", n: 6, sites: ["github.com", "gitlab.com"] }, { what: "other", n: 2, sites: ["a.com"] }]);
});

test("youOf on the five panel people", async () => {
  // Dev: places by share of activity, each with its own day strip and where it was learnt
  const D = dev();
  await read(D.p.w, { sources: D.sources }, () => {}, { read: D.d, now: () => NOW });
  const dv = youOf(D.p.w, NOW);
  assert.equal(dv.who, "Dev");
  assert.deepEqual(dv.aims.map((a) => a.w), ["Building things", "My business"]);
  const names = dv.parts.map((x) => x.name);
  for (const n of ["checkout-app", "pipeline", "docs-site", "synth", "Launch"]) assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => /api-keys|tax-returns|Admin/.test(n)));
  assert.equal(Math.round(dv.parts.reduce((s, x) => s + x.share, 0) * 100), 100);
  const co = dv.parts.find((x) => x.name === "checkout-app")!;
  assert.deepEqual(co.from.sort(), ["claude-sessions", "projects"]);
  assert.equal(co.at.length, 24);
  assert.ok(co.at[22] + co.at[23] + co.at[21] + co.at[0] > 0);
  assert.ok(co.tools.includes("TypeScript") && co.tools.includes("github"));
  assert.equal(co.ais, 1);
  assert.equal(dv.parts.find((x) => x.name === "synth")!.faded, true);
  assert.equal(co.faded, false);
  assert.equal(dv.day.hours.length, 24);
  assert.ok(dv.day.quiet && dv.day.quiet[0] >= 1 && dv.day.quiet[0] <= 9, JSON.stringify(dv.day));
  assert.equal(dv.read.by, "device");
  assert.equal(dv.read.made, "rules");   // no model in the test: rules
  assert.match(dv.headline, /^Sol saw /);
  assert.ok(dv.setup.some((s) => s.kind === "place") && dv.setup.some((s) => s.kind === "date" && /Launch/.test(s.words)));

  // Denise: Skip; the picture is what she told Sol, and Look again stays off
  const Dn = denise();
  const dn = await read(Dn.w, { by: "none", sources: ["notes"] }, () => {}, { now: () => NOW });
  assert.equal(dn.read.by, "none");
  assert.deepEqual(dn.read.sources, []);
  assert.deepEqual(dn.parts.map((x) => [x.id, x.name, x.share, x.facts]), [["studio", "The studio", null, 1]]);   // nothing read: no share, not "all of your time"
  assert.equal(dn.headline, "Sol knows what you tell it");
  assert.equal(dn.day.quiet, null);
  assert.equal(setAgain(Dn.w, { weekly: true }).ok, false);

  // 민지: Korean names kept whole; a bank file and a passport scan only as counts
  const M = minji();
  const mj = await read(M.p.w, { sources: M.sources }, () => {}, { read: M.d, now: () => NOW });
  assert.deepEqual(mj.parts.slice(0, 2).map((x) => x.name), ["하나 브랜드", "오름 카페"]);
  assert.ok(!mj.parts.some((x) => x.name === "스튜디오 운영"), "a folder seen only through a binned file is not a place");
  assert.deepEqual(mj.sieve.thrown, { keys: 0, money: 2, health: 0, talk: 0, id: 1 });
  assert.doesNotMatch(mj.read.digest, /계좌|여권|kakaobank/);
  assert.match(mj.read.digest, /Apps: Figma, Photoshop, Notion, KakaoTalk/);

  // Tomás: clients from his files, the book from his notes; the medication list a count
  const T = tomas();
  const tm = await read(T.p.w, { sources: T.sources }, () => {}, { read: T.d, now: () => NOW });
  assert.deepEqual(tm.parts.map((x) => x.name).sort(), ["Clients", "The book"]);
  assert.equal(tm.sieve.thrown.health, 1);
  assert.match(tm.read.digest, /Calendar: 11 dates/);
  assert.match(tm.read.digest, /Notes: 6 notes in 2 folders/);

  // Lucy: her notes folders are her parts; a bank login and therapy only as counts
  const L = lucy();
  const lc = await read(L.p.w, { sources: L.sources }, () => {}, { read: L.d, now: () => NOW });
  assert.deepEqual(lc.parts.map((x) => x.name), ["Ideas", "Newsletter", "Clients"]);
  assert.deepEqual(lc.parts.map((x) => x.share), [0.54, 0.23, 0.23]);   // 12, 5 and 5 notes (the bank login a count), largest remainder
  assert.deepEqual(lc.sieve.thrown, { keys: 0, money: 1, health: 1, talk: 1, id: 0 });
  assert.doesNotMatch(lc.read.digest, /bank login|Therapy|mail\.google/);
});

test("a skill used deep in a long session is counted, once, even across a chunk's edge", async () => {
  const p = home("long", { name: "Dev", said: "go" });
  const cwd = join(p.u, "Code", "long");
  write(join(cwd, "package.json"), "{}");
  const skill = (k: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `t-${k}`, name: "Skill", input: { skill: k } }] } });
  const filler = (n: number) => JSON.stringify({ type: "user", message: { content: "y".repeat(n) } });
  const before = [JSON.stringify({ type: "user", cwd, timestamp: new Date(at(0, 9)).toISOString(), message: { content: BODY } }), filler(600 * 1024), skill("deep")].join("\n") + "\n";
  // the second skill's mark starts 5 bytes before the scan's 8 MB chunk ends
  const edge = skill("edge"), mark = edge.indexOf('"name":"Skill"');
  const pad = 8 * 1024 * 1024 - 5 - mark - Buffer.byteLength(before) - filler(0).length - 1;
  const f = join(p.u, ".claude", "projects", "long", "s.jsonl");
  write(f, before + filler(pad) + "\n" + edge + "\n" + skill("deep") + "\n");
  fs.utimesSync(f, at(0, 10) / 1000, at(0, 10) / 1000);
  const you = await read(p.w, { sources: ["claude-sessions"] }, () => {}, { read: deps({}), now: () => NOW });
  assert.match(you.read.digest, /Skills used: deep 2, edge 1\n/);
});

test("a source the Mac closes says so in one line, and the read goes on", async () => {
  const L = lucy();
  const d = deps({ calendar: "switch", notes: [{ name: "Ideas", items: ["a", "b", "c", "d", "e"] }] });
  const { evs, emit } = watch();
  const you = await read(L.p.w, { sources: ["calendar-store", "notes", "browser"] }, emit, { read: { ...d, closedBrowsers: () => [] }, now: () => NOW });
  const lines = evs.filter((e) => e.kind === "source" && e.state !== "waiting" && e.state !== "reading").map((e) => (e as { line: string }).line);
  assert.deepEqual(lines.sort(), ["Calendar: skipped, Sol needs Full Disk Access", "Notes: 5 notes in 1 folder", "Your browsers: skipped, no history Sol can open here"]);
  assert.deepEqual(you.parts.map((x) => x.name), ["Ideas"]);
});

test("nothing is skipped quietly: a browser the Mac keeps closed has its own line, and perms says what would open it", async () => {
  const L = lucy();
  // Lucy's Chrome reads; her Safari is closed (macOS keeps its history behind Full Disk Access); her calendar refused
  const d = { ...deps({ calendar: "switch" }), hosts: async () => [{ host: "example.org", n: 4, browser: "Chrome" }], closedBrowsers: () => ["Safari"] };
  const { evs, emit } = watch();
  const you = await read(L.p.w, { sources: ["browser", "calendar-store"] }, emit, { read: d, now: () => NOW });
  const said = evs.filter((e) => e.kind === "item" || (e.kind === "source" && e.state !== "waiting" && e.state !== "reading")) as { line?: string; item?: string; perm?: string }[];
  assert.ok(said.some((e) => e.item === "Safari: skipped, Sol needs Full Disk Access" && e.perm === "full-disk"));
  assert.ok(said.some((e) => e.line === "Your browsers: 1 site; Safari skipped, Sol needs Full Disk Access"));
  assert.ok(said.some((e) => e.line === "Calendar: skipped, Sol needs Full Disk Access" && e.perm === "full-disk"));
  assert.deepEqual(you.read.closed.map((c) => c.what).sort(), ["Safari", "your calendar"]);
  const fda = permsOf(L.p.u, {}, youOf(L.p.w, NOW).read.closed).find((p) => p.id === "full-disk")!;
  assert.deepEqual(fda.opens.sort(), ["Safari", "your calendar"]);
  assert.deepEqual(permsOf(L.p.u, {}, you.read.closed).find((p) => p.id === "screen")!.opens, []);
});

test("the press is the yes; a source the record says no to is not read, and Look again keeps a later no", async () => {
  const L = lucy();
  const calls: string[] = [];
  const d = deps({ notes: [{ name: "Ideas", items: ["a", "b", "c", "d", "e"] }], hosts: [["canva.com", 3, "Chrome"]] }, calls);
  await read(L.p.w, { sources: ["notes", "browser"] }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(recordOf(L.p).consent.sources, { notes: "yes", browser: "yes" });
  const r = recordOf(L.p); r.consent.sources.browser = "no"; fs.writeFileSync(join(L.p.w.sol, "record", "me.json"), JSON.stringify(r));
  calls.length = 0;
  const you = await read(L.p.w, { sources: ["notes", "browser"], again: true }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(you.read.sources, ["notes"]);
  assert.ok(!calls.includes("hosts"));
  assert.equal(recordOf(L.p).consent.sources.browser, "no");
});

// ---------------------------------------------------------------------------------------- Skip reads nothing at all

/** f run with node:fs wrapped: every path any read or write function is handed */
async function opened<T>(f: () => Promise<T>): Promise<{ out: T; paths: string[] }> {
  const paths: string[] = [], kept = new Map<string, unknown>();
  const anyFs = fs as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of Object.keys(fs)) {
    const was = anyFs[name];
    if (typeof was !== "function" || /^[A-Z]/.test(name) || name === "promises") continue;
    kept.set(name, was);
    anyFs[name] = function (this: unknown, ...a: unknown[]) { if (typeof a[0] === "string" || a[0] instanceof URL) paths.push(String(a[0] instanceof URL ? a[0].pathname : a[0])); return was.apply(this, a); };
  }
  syncBuiltinESMExports();
  try { return { out: await f(), paths }; }
  finally { for (const [n, v] of kept) anyFs[n] = v as never; syncBuiltinESMExports(); }
}

test("Skip (read.by none) opens nothing outside SOL_HOME, and runs no reader", async () => {
  const Dn = denise();
  const D = dev();   // a Mac full of things beside it, none of which may be touched
  const calls: string[] = [];
  const spy = deps({ apps: ["Cursor"], hosts: [["github.com", 1, "Safari"]] }, calls);
  const { out, paths } = await opened(async () => {
    const you = await read(Dn.w, { by: "none", sources: ["claude-sessions", "apps", "browser", "notes"] }, () => {}, { read: { ...spy, reader: { text: () => { calls.push("reader"); return null; }, list: () => { calls.push("reader"); return null; }, head: () => { calls.push("reader"); return null; }, time: () => { calls.push("reader"); return null; } } }, now: () => NOW });
    youOf(Dn.w, NOW);
    youHere(Dn.w, join(Dn.w.sol, "studio"));
    return you;
  });
  assert.deepEqual(calls, []);
  assert.ok(paths.length > 0);
  const sols = [Dn.w.sol, fs.realpathSync(Dn.w.sol)];
  const outside = paths.filter((x) => !sols.some((s) => x === s || x.startsWith(s + "/")));
  assert.deepEqual(outside, []);
  assert.equal(out.read.by, "none");
  assert.ok(!paths.some((x) => x.startsWith(D.p.u)));
});

// -------------------------------------------------------------------------------------------- the dial and refusals

test("the dial writes record, draft and do; show is left untouched; a send is refused under draft", () => {
  const p = home("dial", { name: "Dev", areas: [{ id: "work" }], consent: { levels: { home: "show" } } });
  const folder = join(p.w.sol, "work");
  fs.mkdirSync(folder, { recursive: true });
  assert.deepEqual(setLevel(p.w, { place: "work", level: "Gets it ready" }), { ok: true, place: "work", level: "draft", was: null });
  assert.equal(recordOf(p).consent.levels.work, "draft");
  assert.match(refusedAt(p.w, folder, "talk")!, /^refused: talk\./);
  assert.match(refusedAt(p.w, folder, "mcp__sol__browser_click")!, /^refused: browser_click\./);
  assert.equal(refusedAt(p.w, folder, "update_piece"), null);
  assert.equal(setLevel(p.w, { place: "work", level: "Only looks" }).ok, true);
  assert.equal(recordOf(p).consent.levels.work, "record");
  assert.match(refusedAt(p.w, folder, "update_piece")!, /^refused: update_piece\./);
  assert.equal(refusedAt(p.w, folder, "browser_read"), null);
  assert.equal(setLevel(p.w, { place: "work", level: "Does it" }).ok, true);
  assert.equal(refusedAt(p.w, folder, "talk"), null);
  // show is not on the dial: refused, and a show already there stays
  assert.equal(setLevel(p.w, { place: "home", level: "show" }).ok, false);
  assert.equal(recordOf(p).consent.levels.home, "show");
  // a place outside Sol's home, by its own path: the same refusal there
  const outside = join(p.u, "Code", "app");
  fs.mkdirSync(outside, { recursive: true });
  assert.equal(setLevel(p.w, { place: outside, level: "Gets it ready" }).ok, true);
  assert.match(refusedAt(p.w, outside, "ask_agent")!, /^refused: ask_agent\./);
  // no record yet: nothing written, the reason said
  const none = home("dial-none", null);
  assert.deepEqual(setLevel(none.w, { place: "work", level: "Does it" }), { ok: false, why: "there is no record yet: Home's setup makes it" });
  assert.equal(setLevel(p.w, { place: "../x", level: "Does it" }).ok, false);
});

// ----------------------------------------------------------------------------------------------- apply and Back

test("apply lands each item where it lives, and Back takes each one back alone", () => {
  const p = home("apply", { name: "Dev", areas: [{ id: "work" }], consent: { levels: {} } });
  const r = apply(p.w, { setup: [
    { kind: "place", id: "/x/checkout-app", name: "Checkout app", zone: "work" },
    { kind: "level", place: "work", level: "Gets it ready" },
    { kind: "look", knob: "attention", scope: "~", take: "quiet 03:00-10:00", reason: "nothing of yours moves then", count: 41 },
    { kind: "date", words: "Launch, 2026-12-05" },
    { kind: "nonsense" },
  ] }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.items.map((x) => [x.kind, x.ok]), [["place", true], ["level", true], ["look", true], ["date", true], ["nonsense", false]]);
  assert.ok(readMoveIn(p.w.sol)!.keep.includes("w:/x/checkout-app"));
  assert.deepEqual(readMoveIn(p.w.sol)!.fix["w:/x/checkout-app"], { name: "Checkout app", zone: "work" });
  assert.equal(recordOf(p).consent.levels.work, "draft");
  const fit = fitsOf(p.w.sol, "~");
  assert.ok(fit.ok && fit.fits.some((f) => f.knob === "attention" && f.take === "quiet 03:00-10:00" && f.author === "sol" && f.count === 41));
  assert.ok(readDay(p.w.sol, dayOf(new Date(NOW))).some((l) => l.words === "Launch, 2026-12-05"));

  // Back on the level only: the rest stands
  assert.ok(backItem(p.w, { apply: r.apply, item: 1 }, NOW + 1).ok);
  assert.equal(recordOf(p).consent.levels.work, undefined);
  assert.ok(readMoveIn(p.w.sol)!.keep.includes("w:/x/checkout-app"));
  // Back on the others
  for (const i of [0, 2, 3]) assert.ok(backItem(p.w, { apply: r.apply, item: i }, NOW + 2).ok, String(i));
  assert.ok(!readMoveIn(p.w.sol)!.keep.includes("w:/x/checkout-app"));
  assert.equal(readMoveIn(p.w.sol)!.fix["w:/x/checkout-app"], undefined);
  const after2 = fitsOf(p.w.sol, "~");
  assert.ok(after2.ok && !after2.fits.some((f) => f.knob === "attention" && f.take));
  assert.ok(!readDay(p.w.sol, dayOf(new Date(NOW))).some((l) => l.words === "Launch, 2026-12-05"));
  // twice is once; a bad item has no Back; an apply that is not there says so
  assert.ok(backItem(p.w, { apply: r.apply, item: 1 }, NOW + 3).ok);
  assert.equal(backItem(p.w, { apply: r.apply, item: 4 }).ok, false);
  assert.equal(backItem(p.w, { apply: "ya-000000000000", item: 0 }).ok, false);
  // a take the person made is never written over by Sol's apply
  personSet(p.w.sol, { knob: "voice", scope: "~", take: "short" } as never, NOW);
  const r2 = apply(p.w, { setup: [{ kind: "look", knob: "voice", scope: "~", take: "long", reason: "x", count: 3 }] }, NOW);
  assert.ok(r2.ok && !r2.items[0].ok);
});

test("BR1 Quiet: the read's quiet hours are no setup chip and Open Sol writes no Sol fit on attention; the person's own quiet hours stand", async () => {
  const D = dev("dev-quiet");
  await read(D.p.w, { sources: D.sources }, () => {}, { read: D.d, now: () => NOW });
  const y = youOf(D.p.w, NOW);
  assert.ok(y.day.quiet, "the read saw quiet hours, and You still says them");
  assert.ok(!y.setup.some((s) => s.kind === "look"), `no quiet chip: ${JSON.stringify(y.setup.map((s) => s.label))}`);
  const r = apply(D.p.w, { setup: y.setup }, NOW);
  assert.ok(r.ok);
  assert.equal(takeOf(D.p.w.sol, "attention", "~").take, null, "Open Sol sets no quiet hours of its own");
  // the person sets quiet hours themselves: theirs stand, and a read after offers nothing over them
  personSet(D.p.w.sol, { knob: "attention", scope: "~", take: "quiet 23:00-07:00" } as never, NOW + 1);
  const y2 = youOf(D.p.w, NOW + 2);
  assert.ok(!y2.setup.some((s) => s.kind === "look"));
  apply(D.p.w, { setup: y2.setup }, NOW + 3);
  const own = takeOf(D.p.w.sol, "attention", "~");
  assert.deepEqual([own.take, own.author], ["quiet 23:00-07:00", "person"]);
});

// ------------------------------------------------------------------------------------------ the part, the record

test("a part dropped with × stays out of later reads; Back brings it back", async () => {
  const D = dev();
  await read(D.p.w, { sources: D.sources }, () => {}, { read: D.d, now: () => NOW });
  const synth = youOf(D.p.w, NOW).parts.find((x) => x.name === "synth")!;
  assert.ok(dropPart(D.p.w, { id: synth.id }, NOW).ok);
  await read(D.p.w, { sources: D.sources }, () => {}, { read: D.d, now: () => NOW + 1000 });
  assert.ok(!youOf(D.p.w, NOW).parts.some((x) => x.name === "synth"));
  assert.ok(recordOf(D.p).parts.find((k: { id: string }) => k.id === synth.id).dropped);
  assert.ok(dropPart(D.p.w, { id: synth.id, back: true }, NOW).ok);
  assert.ok(youOf(D.p.w, NOW).parts.some((x) => x.name === "synth"));
});

test("new: a part first seen since the read before; a record from before these fields loads as it did", async () => {
  const D = dev();
  await read(D.p.w, { sources: ["projects"] }, () => {}, { read: D.d, now: () => NOW });
  assert.ok(youOf(D.p.w, NOW).parts.every((x) => !x.new));
  const more = deps({ projects: [{ name: "checkout-app", at: at(0, 23) }, { name: "new-thing", at: at(0, 22) }] });
  await read(D.p.w, { sources: ["projects"] }, () => {}, { read: more, now: () => NOW + 864e5 });
  const parts = youOf(D.p.w, NOW + 864e5).parts;
  assert.deepEqual(parts.filter((x) => x.new).map((x) => x.name), ["new-thing"]);

  const old = home("old", { name: "Sam", said: "go", hands: "show", areas: [{ id: "school" }] });
  fs.mkdirSync(join(old.w.sol, "school"));
  const y = youOf(old.w, NOW);
  assert.deepEqual([y.aims, y.read.at, y.again.weekly, y.parts.map((x) => x.id)], [[], null, false, ["school"]]);
  assert.equal(y.parts[0].level, "show");
});

test("aims are the person's: written as said, never rewritten by a read; an aim that meets none of theirs is never asked (no \"Add it as an aim?\")", async () => {
  const p = home("aims", { name: "Lucy" });
  assert.ok(setAims(p.w, { aims: ["My business"] }, NOW).ok);
  const was = recordOf(p).aims;
  await read(p.w, { sources: ["notes"] }, () => {}, { read: deps({ notes: [{ name: "Ideas", items: ["a", "b", "c", "d", "e"] }] }), synth: { device: async () => ({ headline: "You collect ideas in Notes", aims: ["Collecting ideas"], checks: [{ q: "Is Ideas a project?", place: "Ideas" }], names: [{ place: "Ideas", name: "Idea bank" }] }) }, now: () => NOW });
  assert.deepEqual(recordOf(p).aims, was);
  const y = youOf(p.w, NOW);
  assert.equal(y.read.made, "device");
  assert.equal(y.headline, "You collect ideas in Notes");
  assert.deepEqual(y.parts.map((x) => x.name), ["Idea bank"]);
  // one place: no rule asks of it, so the model's check has nothing to reword and is dropped; "Collecting ideas" meets
  // nothing Lucy said, and that is not asked either (#yu calm: aims are parked after BR1)
  assert.deepEqual(y.questions, []);
  assert.ok(!y.questions.some((q) => /aim/i.test(q.q)));
});

test("questions read well: rules first, at most three, each of one place or one aim; a model only rewords, never lists tools or names Sol", async () => {
  const { p, d, sources } = dev();
  const checks = [
    { q: "Do you use Cursor, Ghostty and Linear in checkout-app?", place: "checkout-app" },   // a list of tools: kept to the rule's words
    { q: "Is Sol helping with pipeline?", place: "pipeline" },                                // names Sol: dropped
    { q: "Is checkout-app your main project right now?", place: "checkout-app" },              // a better wording of the rule's: taken
    { q: "Do you want a reminder for the dentist?", place: "" },                               // of no place: dropped
  ];
  await read(p.w, { sources }, () => {}, { read: d, synth: { device: async () => ({ headline: "You build apps at night", aims: ["Shipping apps"], checks, names: [] }) }, now: () => NOW });
  const y = youOf(p.w, NOW);
  assert.ok(y.questions.length <= 3 && y.questions.length > 0);
  for (const q of y.questions) {
    assert.ok(!/\bsol\b/i.test(q.q), q.q);
    assert.ok((q.at === null) !== !q.aim, `one place or one aim: ${JSON.stringify(q)}`);
    assert.ok(!/Cursor.*Ghostty|Ghostty.*Cursor/.test(q.q), q.q);
  }
  const top = y.parts.reduce((a, b) => (b.share > a.share ? b : a));
  const first = y.questions.find((q) => q.at !== null)!;
  assert.equal(y.parts[first.at!].name, top.name);
  assert.equal(first.q, top.name === "checkout-app" ? "Is checkout-app your main project right now?" : `Is ${top.name} where most of your time goes now?`);
  // "Shipping apps" meets "Building things" by no word: never asked, neither as "Add it as an aim?" nor as an aim guess
  assert.ok(!y.questions.some((q) => q.aim === "Shipping apps" || /Add it as an aim/.test(q.q)), JSON.stringify(y.questions));
});

test("the read keeps moving while the words are made: places, the day and the questions as each is decided, a beat while the model works", async () => {
  const { p, d, sources } = minji();
  const w = watch();
  await read(p.w, { sources }, w.emit, { read: d, synth: { device: () => new Promise((ok) => setTimeout(() => ok({ headline: "You design for two clients", aims: [], checks: [], names: [] }), 2300)) }, now: () => NOW });
  const making = w.evs.filter((e): e is Extract<Watched, { kind: "making" }> => e.kind === "making");
  assert.deepEqual([...new Set(making.map((e) => e.part))], ["places", "day", "questions", "words"]);
  const places = making.find((e) => e.part === "places") as any;
  assert.ok(places.places.length >= 2 && /^Your places: /.test(places.line));
  assert.ok((making.find((e) => e.part === "day") as any).line.startsWith("Your day: busiest around "));
  const words = making.filter((e) => e.part === "words") as any[];
  assert.ok(words.length >= 3, "the start, at least one beat, the end");
  assert.equal(words[0].budget, 20000);
  assert.equal(words.at(-1).made, "device");
  assert.match(words.at(-1).line, /^In words on this Mac in \d+\.\d s$/);
  // nothing of the making comes after the picture
  assert.equal(w.evs.at(-1)!.kind, "done");
  assert.ok(w.evs.findIndex((e) => e.kind === "making") > w.evs.findLastIndex((e) => e.kind === "source"));
});

test("Reading's open (reading.html, #1615): every row opens to what Sol looked at, kept and left alone; × on a kept line keeps that thing out of the next read; Read this again reads one source alone", async () => {
  const { p, d, sources } = dev();
  const { evs, emit } = watch();
  await read(p.w, { sources }, emit, { read: d, now: () => NOW });
  const items = evs.filter((e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item");
  for (const e of items) {
    assert.ok(e.open, `a row that opens to nothing: ${e.item}`);
    assert.ok(e.open.left.length > 0 && e.open.left.every((l) => l.trim()), `a row that says nothing it left alone: ${e.item}`);
    for (const k of e.open.kept) assert.ok(k.line && k.from && /^(tool:[^:]+:.+|read:(skill|tool|app|date|sites|notes|file):.+)$/.test(k.k), JSON.stringify(k));
  }
  assert.doesNotMatch(JSON.stringify(items.map((e) => e.open)), new RegExp(BODY));
  // a folder's languages are kept as the picture's knows say them, so × there is the same forget as on How Sol sees you
  for (const e of items.filter((x) => x.more?.kind === "folder" && x.more.kinds?.length && x.place)) assert.ok(e.open!.kept.every((k) => k.k.startsWith(`tool:${e.place}:`)), JSON.stringify(e.open));
  const skill = items.find((e) => e.item === "skill review, used 10 times")!;
  assert.deepEqual(skill.open!.kept, [{ line: "You work with review", from: "from 10 uses in Claude Code", k: "read:skill:review" }]);
  assert.match(skill.open!.looked.join(" · "), /how often your Claude Code sessions used it \(10 times\)/);
  const safari = items.find((e) => e.item === "Safari: 4 sites, mostly code and work")!;
  assert.deepEqual(safari.open!.kept.map((k) => k.k).sort(), ["read:sites:code", "read:sites:work"]);
  // × on the skill: kept in forgot, and the next read neither counts it nor says it
  assert.equal((await forgetFact(p.w, { k: "read:skill:review" }, NOW)).ok, true);
  const w2 = watch();
  await read(p.w, { sources }, w2.emit, { read: d, now: () => NOW });
  assert.ok(!w2.evs.some((e) => e.kind === "item" && /^skill review/.test(e.item)));
  // Read this again: that source alone, its rows marked with the row asked from; no order, no other source
  const w3 = watch();
  const r = await readAgain(p.w, { source: "apps", item: "Cursor, open now" }, w3.emit, { read: d, now: () => NOW });
  assert.equal(r.ok, true);
  assert.ok(w3.evs.length > 0 && w3.evs.every((e) => (e.kind === "item" || e.kind === "source") && e.source === "apps"), JSON.stringify(w3.evs.map((e) => e.kind)));
  assert.ok(w3.evs.filter((e) => e.kind === "item").every((e) => e.kind === "item" && e.again === "Cursor, open now" && e.open));
  assert.ok(r.ok && r.you.parts.length > 0, "the picture stays");
  // a source the last read did not read is Look again's
  await read(p.w, { sources: ["apps"] }, () => {}, { read: d, now: () => NOW });
  const no = await readAgain(p.w, { source: "browser", item: "Safari: 4 sites, mostly code and work" }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(no, { ok: false, why: "Sol did not read your browsers last time: Look again reads it" });
});

test("what Sol knows of a place, each with its source; a forgotten fact stays out of every later read, and Back brings it again", async () => {
  const { p, d, sources } = dev();
  addFact(p.w.sol, { place: "checkout-app", fact: "Ships on Thursdays", source: "you" });
  const co = (y: { parts: { name: string; tools: string[]; knows: { k: string; fact: string; source: string; by: string }[] }[] }) => y.parts.find((x) => x.name === "checkout-app")!;
  const before = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.match(before.read.digest, /github/);
  const first = co(before);
  const gh =first.knows.find((x) => x.fact === "Uses github here")!;
  assert.ok(gh, JSON.stringify(first.knows));
  assert.equal(gh.by, "read");
  assert.equal(gh.source, "Claude Code, your code");
  const told = first.knows.find((x) => x.fact === "Ships on Thursdays")!;
  const { at: toldAt, ...toldWords } = told as typeof told & { at?: string };
  assert.deepEqual({ ...toldWords, k: told.k.slice(0, 5) }, { k: "fact:", fact: "Ships on Thursdays", source: "you", by: "person" });
  assert.ok(toldAt && !isNaN(Date.parse(toldAt)), "a told fact says when");
  // forget what the read saw: out of the picture now, and out of the next read, its digest included
  const now = await forgetFact(p.w, { k: gh.k }, NOW);
  assert.ok(now.ok && !co(now.you).tools.includes("github") && !co(now.you).knows.some((x) => x.k === gh.k));
  const again = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.ok(!co(again).tools.includes("github"));
  assert.ok(!co(again).knows.some((x) => x.k === gh.k));
  assert.doesNotMatch(again.read.digest, /github/);
  // forget what was told: held out of every context too
  const off = await forgetFact(p.w, { k: told.k }, NOW);
  assert.ok(off.ok && !co(off.you).knows.some((x) => x.k === told.k));
  assert.deepEqual(wordsAt(p.w.sol, "checkout-app"), []);
  // Back, each: the told fact at once, the read's at the next read
  assert.ok(co((await forgetFact(p.w, { k: told.k, back: true }, NOW) as any).you).knows.some((x: { k: string }) => x.k === told.k));
  await forgetFact(p.w, { k: gh.k, back: true }, NOW);
  assert.ok(co(await read(p.w, { sources }, () => {}, { read: d, now: () => NOW })).tools.includes("github"));
  assert.equal((await forgetFact(p.w, { k: "anything" }, NOW)).ok, false);
});

test("a place's tools are ones the person would know, in plain words: an app's internal ids and Sol's own are left out", async () => {
  // Lucy, with Claude Code in her newsletter folder: a connector on her account, a plugin's tool, one she set up, the
  // browser her app brings, two of the app's internal ids, and Sol's own
  const { d } = lucy();
  const p = home("lucy-tools", { name: "Lucy", said: "go", aims: [{ w: "My business", said: true, ok: true, at: "2026-11-18" }] });
  const cwd = join(p.u, "Newsletter"), t = at(1, 20);
  fs.mkdirSync(cwd, { recursive: true });
  const ids = ["claude_ai_Figma", "plugin_design_canva", "substack_drafts", "Claude_Browser", "ccd_turn", "ccd_session_mgmt", "sol"];
  const f = join(p.u, ".claude", "projects", "-Newsletter", "s0.jsonl");
  write(f, [{ type: "user", cwd, timestamp: new Date(t).toISOString(), message: { content: BODY } },
    ...ids.map((id, i) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: `tm${i}`, name: `mcp__${id}__do_thing`, input: { text: BODY } }] } }))].map((l) => JSON.stringify(l)).join("\n") + "\n");
  fs.utimesSync(f, t / 1000, t / 1000);
  write(join(p.u, ".claude.json"), JSON.stringify({ mcpServers: { substack_drafts: {} } }));
  const y = await read(p.w, { sources: ["claude-sessions"] }, () => {}, { read: d, now: () => NOW });
  const nl = y.parts.find((x) => x.name === "Newsletter")!;
  assert.deepEqual([...nl.tools].sort(), ["Figma", "canva", "substack drafts", "the browser"]);
  assert.ok(nl.knows.some((x) => x.fact === "Uses Figma here"), JSON.stringify(nl.knows));
  const said = JSON.stringify({ tools: nl.tools, knows: nl.knows.map((x) => x.fact), digest: y.read.digest });
  for (const id of ids) assert.doesNotMatch(said, new RegExp(`\\b${id}\\b`), `${id} reached the person`);
  // the rule is the id's shape and where it came from, never a list of names
  const mine = new Set(["my_notes"]);
  assert.deepEqual(["linear", "my_notes", "acme_internal_x", "Terminal_Tools", "plugin_x_y_z", "SOL"].map((id) => plainTool(id, mine)), ["linear", "my notes", null, "the terminal", "y z", null]);
});

test("how Sol talks: plain with no evidence; what the person set their own AI to when there is; the person's word over both", async () => {
  const T = tomas();
  const plain = await read(T.p.w, { sources: T.sources }, () => {}, { read: T.d, now: () => NOW });
  assert.deepEqual(plain.talk, { style: "plain", by: "default", why: null });
  // Dev set Claude Code to Explanatory; the read sees it only because Claude Code is a source they ticked
  const { p, d, sources } = dev();
  write(join(p.u, ".claude", "settings.json"), JSON.stringify({ outputStyle: "Explanatory" }));
  const seen = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(seen.talk, { style: "explained", by: "read", why: "Your Claude Code is set to Explanatory" });
  assert.equal((await read(p.w, { sources: sources.filter((s) => s !== "claude-sessions") }, () => {}, { read: d, now: () => NOW })).talk.by, "default");
  // two AIs set two ways is no evidence; a custom style is not guessed at
  write(join(p.u, ".codex", "config.toml"), 'model_verbosity = "low"\n');
  assert.equal(talkSeen(p.u, ["claude-sessions", "codex-sessions"], join(p.u, ".codex")), null);
  assert.deepEqual(talkSeen(p.u, ["codex-sessions"], join(p.u, ".codex")), { style: "brief", why: "Your Codex is set to low verbosity" });
  write(join(p.u, ".claude", "settings.json"), JSON.stringify({ outputStyle: "My pirate style" }));
  assert.equal(talkSeen(p.u, ["claude-sessions"]), null);
  // the person's word wins and reaches a new session's first turn; null gives it back
  const mine = setTalk(p.w, { style: "brief" }, NOW);
  assert.ok(mine.ok && mine.you.talk.style === "brief" && mine.you.talk.by === "you");
  assert.match(youHere(p.w, join(p.u, "Code", "checkout-app")), /Talk: brief, the answer first\./);
  assert.equal(setTalk(p.w, { style: "loud" }, NOW).ok, false);
  const back = setTalk(p.w, { style: null }, NOW);
  assert.ok(back.ok && back.you.talk.by !== "you");
});

test("day to day (migration.html A): Lucy's own words kept as she wrote them, held before a record exists and moved into it; You says them; empty words keep nothing", () => {
  const p = home("lucy-day", null);
  const words = "I run a small design studio, mostly websites for restaurants.\u0007 Evenings   a course on typography";
  const r = setDay(p.w, { words }, NOW);
  assert.ok(r.ok);
  assert.equal(r.you.said, "I run a small design studio, mostly websites for restaurants. Evenings a course on typography", "as written: only control characters and runs of spaces go");
  assert.equal(youOf(p.w, NOW).said, r.you.said, "held while there is no record");
  // a record made later takes them at the next write, and its own said (Home's setup) comes first
  fs.mkdirSync(join(p.w.sol, "record"), { recursive: true });
  fs.writeFileSync(join(p.w.sol, "record", "me.json"), JSON.stringify({ solHome: p.w.sol, areas: [] }));
  setTalk(p.w, { style: "brief" }, NOW);
  assert.equal(recordOf(p).day.w, r.you.said, "moved into the record");
  assert.equal(setDay(p.w, { words: 7 }, NOW).ok, false, "words or nothing");
  const none = setDay(p.w, { words: "   " }, NOW);
  assert.ok(none.ok && none.you.said === null && !("day" in recordOf(p)), "empty words take it back");
});

test("whose words: this Mac's model until the person allows their Claude, then their Claude when the ask names none; the ask says what leaves the Mac", async () => {
  const { p, d, sources } = minji();
  const sent: string[] = [];
  const synth = { device: async () => ({ headline: "You design for two clients", aims: [], checks: [], names: [] }), claude: async (digest: string) => { sent.push(digest); return JSON.stringify({ headline: "You design for two clients", aims: [], checks: [], names: [] }); } };
  assert.equal(byOf(p.w), "device", "nobody has allowed their Claude yet");
  const first = await read(p.w, { sources }, () => {}, { read: d, synth, now: () => NOW });
  assert.equal(first.read.by, "device");
  assert.deepEqual(sent, [], "the private fallback sends nothing");
  // the person allows their Claude by pressing a read with it; from then on it is the default
  await read(p.w, { sources, by: "claude" }, () => {}, { read: d, synth, now: () => NOW });
  assert.equal(byOf(p.w), "claude");
  const w = watch();
  const later = await read(p.w, { sources, again: true }, w.emit, { read: d, synth, now: () => NOW });
  assert.equal(later.read.by, "claude");
  assert.equal((w.evs.filter((e) => e.kind === "making" && e.part === "words").at(-1) as any).made, "claude");
  // what reached their Claude is the digest and nothing more: the words "What I used" shows, held to its cap
  assert.equal(sent.length, 2);
  for (const s of sent) { assert.ok(s.length <= DIGEST_MAX); assert.ok(!s.includes(BODY)); }
  // an ask that names this Mac's model is kept to it
  assert.equal((await read(p.w, { sources, by: "device" }, () => {}, { read: d, synth, now: () => NOW })).read.by, "device");
  assert.match(CLAUDE_ASK, /names and counts/);
  assert.match(CLAUDE_ASK, /Never your files/);
  assert.match(CLAUDE_ASK, /stay on this Mac/);
});

test("Stop here, keep what's read: a picture within a second, nothing read after, each unfinished source stopped", async () => {
  const { p, d, sources } = dev();
  const halt = new AbortController();
  const calls: string[] = [];
  let stoppedAt = 0, waited: ReturnType<typeof setTimeout> | undefined;
  // the explorer is slow: the stop comes while it reads, and it ends on the stop as the real child is killed
  const slow: Deps = {
    ...d,
    explore: (_args, _out, _tick, stop) => new Promise<void>((done) => {
      calls.push(`explore ${Date.now()}`);
      setTimeout(() => { stoppedAt = Date.now(); halt.abort(); }, 50);
      waited = setTimeout(done, 10_000);
      stop?.addEventListener("abort", () => { clearTimeout(waited); done(); }, { once: true });
    }),
    store: async () => { calls.push(`store ${Date.now()}`); return d.store!(); },
    hosts: async (...a: any[]) => { calls.push(`hosts ${Date.now()}`); return (d.hosts as any)(...a); },
  } as Deps;
  const w = watch();
  const never = () => new Promise<unknown>(() => {});   // a model that never answers: the stop does not wait for it
  const you = await read(p.w, { sources }, w.emit, { read: slow, synth: { device: never }, now: () => NOW, stop: halt.signal });
  const took = Date.now() - stoppedAt;
  assert.ok(stoppedAt > 0 && took < 1000, `the picture ${took} ms after the stop`);
  // nothing reads after the stop: no reader call starts after it, and no item arrives after it
  assert.deepEqual(calls.filter((c) => Number(c.split(" ")[1]) > stoppedAt), []);
  // what was read before the stop is kept; the sessions finished before it are done, the rest say stopped
  const st = Object.fromEntries(w.evs.filter((e): e is Extract<Watched, { kind: "source" }> => e.kind === "source" && e.state !== "reading").map((e) => [e.source, e.state]));
  assert.equal(st["claude-sessions"], "done");
  const unfinished = sources.filter((s) => s !== "claude-sessions");
  for (const s of unfinished) assert.equal(st[s], "stopped", s);
  assert.deepEqual([...you.read.stopped].sort(), [...unfinished].sort());
  assert.ok(you.parts.some((x) => x.name === "checkout-app"), "the places read before the stop stay in the picture");
  assert.equal(you.read.made, "rules");
  assert.match((w.evs.filter((e) => e.kind === "making").at(-1) as any).line, /^Stopped: in the rules' words$/);
  assert.equal(w.evs.at(-1)!.kind, "done");
  // the next read without a stop finishes every source, and the record forgets the stop
  const again = await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  assert.deepEqual(again.read.stopped, []);
});

test("an answer is kept like an aim: a no corrects what the question claimed, a yes to an aim makes it the person's, and both carry into later reads", async () => {
  const { p, d, sources } = dev();
  const synth = { device: async () => ({ headline: "Most of what you do is checkout-app", aims: ["Shipping apps", "Late nights"], checks: [], names: [] }) };
  await read(p.w, { sources }, () => {}, { read: d, synth, now: () => NOW });
  const y0 = youOf(p.w, NOW);
  const main = y0.questions.find((q) => q.k.startsWith("main:"))!;
  const top = y0.parts[main.at!];
  assert.ok(top.main && y0.parts.filter((x) => x.main).length === 1);
  assert.equal(y0.headline, "Most of what you do is checkout-app");
  // only a question asked now is answered; yes is true or false
  assert.equal(answer(p.w, { k: "main:/nowhere", yes: false }, NOW).ok, false);
  assert.equal(answer(p.w, { k: main.k, yes: "no" }, NOW).ok, false);

  // no to "where most of your time goes": no place is main, the model's headline (about that place) gives way to the counts
  const r1 = answer(p.w, { k: main.k, yes: false }, NOW);
  assert.ok(r1.ok);
  const y1 = (r1 as any).you as ReturnType<typeof youOf>;
  assert.ok(y1.parts.every((x) => !x.main));
  assert.match(y1.headline, /^Sol saw /);
  assert.ok(!y1.questions.some((q) => q.k === main.k), "an answered question is not asked again");
  assert.ok(y1.parts.some((x) => x.id === top.id), "the place stays: its counts are still its counts");

  // no drift question to answer (#yu calm, aims parked after BR1): none is asked, its key is refused, the aim not added
  const drift = { k: "drift:Shipping apps" };
  assert.equal(y1.questions.find((q) => q.k === drift.k), undefined, "no \"Add it as an aim?\"");
  assert.deepEqual(answer(p.w, { k: drift.k, yes: true }, NOW), { ok: false, why: "that question is not asked now" });
  const y2 = youOf(p.w, NOW);
  assert.ok(!y2.aims.some((a) => a.w === "Shipping apps"));

  // a place gone quiet: yes, done with it, takes it out of the picture and the setup
  const done = y2.questions.find((q) => q.k.startsWith("done:"));
  assert.ok(done, JSON.stringify(y2.questions));
  const quiet = y2.parts[done!.at!];
  assert.ok(quiet.faded);
  const y3 = (answer(p.w, { k: done!.k, yes: true }, NOW) as any).you as ReturnType<typeof youOf>;
  assert.ok(!y3.parts.some((x) => x.id === quiet.id));
  assert.ok(!y3.setup.some((s) => s.kind === "place" && s.id === quiet.id));

  // no to an aim Sol saw: it is no longer one Sol sees
  const aimQ = y3.questions.find((q) => q.k === "aim:Late nights");
  assert.ok(aimQ, JSON.stringify(y3.questions));
  const y4 = (answer(p.w, { k: aimQ!.k, yes: false }, NOW) as any).you as ReturnType<typeof youOf>;
  assert.ok(!y4.seenAims.includes("Late nights"));
  assert.ok(!y4.aims.some((a) => a.w === "Late nights"));

  // all of it carries into the next read, as the aims do
  await read(p.w, { sources }, () => {}, { read: d, synth, now: () => NOW + 1000 });
  const y5 = youOf(p.w, NOW + 1000);
  assert.ok(y5.parts.every((x) => !x.main) && /^Sol saw /.test(y5.headline));
  assert.ok(!y5.parts.some((x) => x.id === quiet.id));
  assert.ok(!y5.aims.some((a) => a.w === "Shipping apps") && !y5.seenAims.includes("Late nights"));
  for (const k of [main.k, drift.k, done!.k, aimQ!.k]) assert.ok(!y5.questions.some((q) => q.k === k), k);
});

test("no to a place gone quiet keeps it and stops calling it faded; no to something new stops calling it new", async () => {
  const { p, d, sources } = dev();
  await read(p.w, { sources }, () => {}, { read: d, now: () => NOW });
  const y = youOf(p.w, NOW);
  const done = y.questions.find((q) => q.k.startsWith("done:"))!;
  const id = y.parts[done.at!].id;
  const after = (answer(p.w, { k: done.k, yes: false }, NOW) as any).you as ReturnType<typeof youOf>;
  const kept = after.parts.find((x) => x.id === id)!;
  assert.equal(kept.faded, false);
  // a later read: a place first seen since the read before is new until the person says it is not
  const more = { ...d, explore: async (args: string[], out: string, tick: (j: any) => void) => {
    await d.explore!(args, out, tick);
    if (args[args.indexOf("--skip") + 1].split(",").includes("projects")) return;
    tick({ stops: [{ id: "projects", facts: [{ id: "project:kiosk", k: "project", v: "kiosk", src: "~/Code/kiosk", at: new Date(at(0, 22)).toISOString() }] }] });
  } } as Deps;
  await read(p.w, { sources }, () => {}, { read: more, now: () => NOW + 864e5 });
  const y2 = youOf(p.w, NOW + 864e5);
  const nq = y2.questions.find((q) => q.k.startsWith("new:"));
  assert.ok(nq, JSON.stringify(y2.questions));
  const nid = y2.parts[nq!.at!].id;
  assert.ok(y2.parts.find((x) => x.id === nid)!.new);
  const y3 = (answer(p.w, { k: nq!.k, yes: false }, NOW + 864e5) as any).you as ReturnType<typeof youOf>;
  assert.equal(y3.parts.find((x) => x.id === nid)!.new, false);
  assert.equal(y3.parts.find((x) => x.id === id)!.faded, false, "the earlier no still stands");
});

test("a record that is not there yet: the fields wait in you.json and move into the record when it comes", () => {
  const p = home("later", null);
  assert.ok(setAims(p.w, { aims: ["Building things"] }, NOW).ok);
  assert.ok(!fs.existsSync(join(p.w.sol, "record", "me.json")));
  assert.deepEqual(youOf(p.w, NOW).aims.map((a) => a.w), ["Building things"]);
  fs.writeFileSync(join(p.w.sol, "record", "me.json"), JSON.stringify({ name: "Dev", solHome: p.w.sol, areas: [] }));
  assert.ok(setKeep(p.w, { keep: ["health"] }, NOW).ok);
  assert.deepEqual(recordOf(p).aims.map((a: { w: string }) => a.w), ["Building things"]);
  assert.deepEqual(recordOf(p).sieve.keep, ["health"]);
  assert.equal(recordOf(p).name, "Dev");
});

// ------------------------------------------------------------------------------- the day, the digest, Look again

test("the day strip's quiet run, shares that add up, a digest held to 1,500 characters", () => {
  const h = Array(24).fill(0); for (const x of [9, 10, 11, 14, 15, 16, 20, 21]) h[x] = 5;
  assert.deepEqual(quietOf(h), [22, 9]);
  assert.equal(quietOf(Array(24).fill(0)), null);
  // one busy hour is too little to tell a quiet part of the day: never "quiet 2pm to 1pm" (#1784)
  const one = Array(24).fill(0); one[13] = 40;
  assert.equal(quietOf(one), null);
  const three = Array(24).fill(0); for (const x of [12, 13, 14]) three[x] = 9;
  assert.equal(quietOf(three), null, "a 21-hour run is longer than any quiet part of a day");
  const late = Array(24).fill(0); for (let x = 9; x < 24; x++) late[x] = 3;
  assert.deepEqual(quietOf(late), [0, 9]);
  assert.deepEqual(sharesOf([1, 1, 1]), [0.34, 0.33, 0.33]);
  assert.equal(sharesOf([7, 3, 2, 1]).reduce((a, b) => a + b, 0).toFixed(2), "1.00");
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `/p${i}`, name: `project number ${i} with a long name`, path: `/p${i}`, from: [], hours: Array(24).fill(0), sessions: { claude: i }, minutes: 0, ais: [], tools: [], langs: ["TypeScript"], rules: [], repo: true, last: 0, weight: i }));
  const seen = { places: many, hours: h, skills: many.map((x) => ({ name: x.name, n: 9, app: "claude" })), servers: [], ais: [], apps: many.map((x) => ({ name: x.name, open: false })), hosts: [], dates: [], notes: { n: 0, folders: 0 }, files: [], repos: [], thrown: { keys: 1, money: 0, health: 0, talk: 0, id: 0 }, sources: [] };
  const dg = digestOf(seen as never, new Map());
  assert.ok(dg.length <= DIGEST_MAX && dg.length > 1000);
});

test("Look again: due on a Sunday a week after the last read, never in Skip", () => {
  const sunday = new Date(2026, 10, 22, 10).getTime();
  const f = { again: { weekly: true, last: new Date(sunday - 7 * 864e5).toISOString() }, read: { at: "", sources: [], by: "device" as const, digest: "" } };
  assert.equal(dueAgain(f, sunday), true);
  assert.equal(dueAgain(f, sunday - 864e5), false);
  assert.equal(dueAgain({ ...f, again: { weekly: true, last: new Date(sunday - 864e5).toISOString() } }, sunday), false);
  assert.equal(dueAgain({ ...f, again: { weekly: false, last: null } }, sunday), false);
  assert.equal(dueAgain({ ...f, read: { ...f.read, by: "none" } }, sunday), false);
});

// ------------------------------------------------------------------------------------------- "you, here"

test("a session's first turn: you, here, at most 600 characters", () => {
  const p = home("here", { name: "Dev", areas: [{ id: "work" }], aims: [{ w: "Building things", said: true, ok: true, at: "" }], consent: { levels: { work: "draft" } } });
  fs.mkdirSync(join(p.w.sol, "work"), { recursive: true });
  addFact(p.w.sol, { place: "work", fact: "Deploys on Fridays", source: "you" });
  addFact(p.w.sol, { place: "work", fact: "x".repeat(900), source: "you" });
  personSet(p.w.sol, { knob: "build.density", scope: "work", take: "close" } as never, NOW);
  const s = youHere(p.w, join(p.w.sol, "work"));
  assert.ok(s.length <= HERE_MAX);
  assert.match(s, /^You, here \(work\): Here for: Building things\. Level here: prepares, you approve\. Known here: Deploys on Fridays;/);
  const short = youHere(p.w, join(p.w.sol, "work", "sub"));
  assert.match(short, /Level here|Known here/);
  assert.equal(youHere(home("here-none", null).w, "/tmp"), "");
});

test("you, here: the place the face put the session in reads first, with every folder above it; the cwd only without one", () => {
  const p = home("here-placed", { name: "Denise", areas: [{ id: "denise" }] });
  addFact(p.w.sol, { place: "denise", fact: "Bookings close at noon", source: "you" });
  addFact(p.w.sol, { place: "denise/bookings/2026/march", fact: "March runs late", source: "you" });
  addFact(p.w.sol, { place: "elsewhere", fact: "Not this one", source: "you" });
  personSet(p.w.sol, { knob: "build.density", scope: "denise/bookings", take: "close" } as never, NOW);
  personSet(p.w.sol, { knob: "voice", scope: "session:s-7", take: "short" } as never, NOW);
  const at = { place: "denise/bookings/2026" };
  const s = youHere(p.w, join(p.w.sol, "elsewhere", "deep", "down"), at);
  assert.match(s, /^You, here \(denise\/bookings\/2026\):/, "the place, not the cwd's two segments");
  assert.match(s, /Known here: Bookings close at noon\./, "a fact two folders up is read");
  assert.doesNotMatch(s, /March runs late|Not this one/, "nothing below the place, nothing from the cwd");
  assert.match(s, /Fits here: build\.density close\./);
  const withSession = youHere(p.w, "/tmp", { ...at, session: "s-7" });
  assert.match(withSession, /Fits here: .*voice short/, "the session's own fit is read with the place's");
  assert.match(withSession, /build\.density close/);
  assert.doesNotMatch(s, /voice short/, "no session, no session's fit");
  assert.match(youHere(p.w, join(p.w.sol, "denise", "bookings", "2026", "march")), /^You, here \(denise\/bookings\):/, "no place: the cwd's first two segments");
  assert.match(youHere(p.w, join(p.w.sol, "elsewhere"), { place: "session:s-7" }), /^You, here \(elsewhere\):/, "a session is no place");
});

// --------------------------------------------------------------------------------------------- before the read

test("suggest: the sources present, in the order the aims chose", () => {
  const D = dev();
  fs.mkdirSync(join(D.p.u, "Library", "Group Containers", "group.com.apple.notes"), { recursive: true });
  fs.mkdirSync(join(D.p.u, "Documents"), { recursive: true });
  const present = presentSources(D.p.u);
  for (const s of ["claude-sessions", "notes", "files", "projects"]) assert.ok(present.includes(s as never), s);
  assert.ok(!present.includes("codex-sessions"));
  const o = orderOf([{ w: "My business", said: true, ok: true, at: "" }], present);
  assert.equal(o.because!.aim, "My business");
  assert.deepEqual(o.order.slice(0, 1), present.includes("calendar-store") ? ["calendar-store"] : ["files"]);
  assert.deepEqual(orderOf([], ["notes", "apps"]), { order: ["apps", "notes"], because: null });
});

test("accounts: the AIs and the connections already here, by name; perms with their deep links", async () => {
  const p = home("accounts", { name: "Dev" });
  write(join(p.u, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "dev@example.com" }, mcpServers: { github: {}, linear: {} }, projects: { "/x": { mcpServers: { figma: {} } } } }));
  write(join(p.u, ".codex", "config.toml"), '[mcp_servers.notion]\ncommand = "x"\n[mcp_servers."drive"]\n');
  const kc: Keychain = { has: async (s) => s === "sol-ai-openai", set: async () => true };
  const a = await accountsOf(p.u, { keychain: kc, services: async () => [{ name: "Gmail", status: "connected" }, { name: "Slack", status: "needs-auth" }] });
  const ai = (id: string) => a.ais.find((x) => x.id === id)!;
  assert.equal(ai("claude-code").signedIn, true);
  assert.equal(ai("codex").signedIn, false);
  assert.equal(ai("openai").signedIn, true);
  assert.equal(ai("google").signedIn, false);
  assert.deepEqual(a.connectors.map((c) => [c.name, c.via, c.connected]), [["github", "claude", true], ["linear", "claude", true], ["figma", "claude", true], ["notion", "codex", true], ["drive", "codex", true], ["Gmail", "claude-account", true], ["Slack", "claude-account", false]]);
  assert.ok(!JSON.stringify(a).includes("dev@example.com"));
  const perms = permsOf(p.u, { accessibility: true });
  assert.equal(perms.length, 5);
  for (const x of perms) { assert.match(x.link, /^x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_/); assert.ok(x.why.length > 10); }
  assert.equal(perms.find((x) => x.id === "accessibility")!.granted, true);
  assert.equal(perms.find((x) => x.id === "calendar")!.granted, null);
});

test("accounts: GitHub through gh is a connector only where gh is on this Mac, connected as gh says (walk note w2)", async () => {
  const p = home("accounts-gh", { name: "Dev" });
  const kc: Keychain = { has: async () => false, set: async () => true };
  const gh = async (g: { there: boolean; ok?: boolean } | "slow") => (await accountsOf(p.u, { keychain: kc, gh: async () => { if (g === "slow") throw new Error("no gh"); return g; } })).connectors.filter((c) => c.via === "gh");
  assert.deepEqual(await gh({ there: true, ok: true }), [{ name: "GitHub", kind: "account", via: "gh", connected: true }]);
  assert.deepEqual(await gh({ there: true, ok: false }), [{ name: "GitHub", kind: "account", via: "gh", connected: false }]);
  assert.deepEqual(await gh({ there: false }), [], "no gh: nothing detected, no row");
  assert.deepEqual(await gh("slow"), [], "gh that fails: no row, never faked");
});

test("Full Disk Access is off only when Sol.app started the engine: a refusal to an engine launchd started is can't tell (walk note w1)", () => {
  const eperm = () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); };
  const fda = (at: Parameters<typeof permsOf>[3]) => permsOf("/Users/lucy", {}, [], at).find((p) => p.id === "full-disk")!.granted;
  assert.equal(fda({ list: () => [], underApp: false }), true, "the folder lists: on");
  assert.equal(fda({ list: eperm, underApp: true }), false, "under Sol.app and the Mac refuses: off");
  assert.equal(fda({ list: eperm, underApp: false }), null, "not under Sol.app and the Mac refuses: can't tell");
  assert.equal(permsOf("/Users/lucy", { "full-disk": true }, [], { list: eperm, underApp: false }).find((p) => p.id === "full-disk")!.granted, true, "Sol.app's own word wins");
  // the parents, one pid at a time: node ← bash ← launchd is not Sol; node ← Sol.app's binary is
  const chain = (rows: Record<number, string>) => (pid: number) => rows[pid] ?? "";
  const me = process.ppid;
  assert.equal(underSolApp(chain({ [me]: "1 /bin/bash" })), false);
  assert.equal(underSolApp(chain({ [me]: "500 /usr/local/bin/node", 500: "1 /Applications/Sol.app/Contents/MacOS/face" })), true);
  assert.equal(underSolApp(() => { throw new Error("no ps"); }), false);
});

// -------------------------------------------------------------------------------------------- a key, the Keychain

/** every file under a folder that holds the text */
const holding = (dir: string, text: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.readFileSync(p, "utf8").includes(text)) out.push(p); } };
  walk(dir);
  return out;
};

test("a key goes to the Keychain (mocked), never to a file or a log, and a refusal is the provider's reason", async () => {
  const p = home("key", { name: "Dev" });
  const key = ["sk", "proj", "TESTKEYabcdefghijklmnopqrstuvwxyz0123"].join("-");
  const kept: [string, string][] = [];
  const kc: Keychain = { has: async () => false, set: async (s, k) => { kept.push([s, k]); return true; } };
  const logged: string[] = [];
  const was = { log: console.log, error: console.error, warn: console.warn, info: console.info, out: process.stdout.write, err: process.stderr.write };
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  process.stdout.write = ((c: unknown) => { logged.push(String(c)); return true; }) as never;
  process.stderr.write = ((c: unknown) => { logged.push(String(c)); return true; }) as never;
  let seenUrl = "", seenAuth = "";
  try {
    const ok = await checkKey({ provider: "openai", key }, { keychain: kc, fetch: async (url, init) => { seenUrl = url; seenAuth = init.headers.authorization; return { status: 200, text: async () => "{}" }; } });
    assert.deepEqual(ok, { ok: true, provider: "openai" });
    const no = await checkKey({ provider: "openai", key }, { keychain: kc, fetch: async () => ({ status: 401, text: async () => JSON.stringify({ error: { message: `Incorrect API key provided: ${key}.` } }) }) });
    assert.equal(no.ok, false);
    if (!no.ok) { assert.match(no.why, /^ChatGPT \(OpenAI\) says this key is not valid: Incorrect API key provided: …\.$/); assert.ok(!no.why.includes(key)); }
    const off = await checkKey({ provider: "openai", key }, { keychain: kc, fetch: async () => { throw new Error("offline"); } });
    assert.deepEqual(off, { ok: false, provider: "openai", why: "Sol could not reach ChatGPT (OpenAI); the key was not kept" });
    assert.equal((await checkKey({ provider: "google", key }, { keychain: kc, fetch: async () => ({ status: 200, text: async () => "{}" }) })).ok, false);
    assert.equal((await checkKey({ provider: "nobody", key })).ok, false);
  } finally { Object.assign(console, { log: was.log, error: was.error, warn: was.warn, info: was.info }); process.stdout.write = was.out; process.stderr.write = was.err; }
  assert.equal(seenUrl, "https://api.openai.com/v1/models");
  assert.equal(seenAuth, `Bearer ${key}`);
  assert.deepEqual(kept, [["sol-ai-openai", key]]);
  assert.deepEqual(holding(p.u, key), []);
  assert.deepEqual(holding(p.w.sol, key), []);
  assert.ok(!logged.join("\n").includes(key));
});

test("the headline is said to the person: one about 'this person' or 'the user' is left for the counts' own", () => {
  const names = ["studio"];
  assert.equal(synthOf({ headline: "This person works a lot in the studio.", aims: ["Painting"] }, names)!.headline, "");
  assert.equal(synthOf({ headline: "The user opens many apps." }, names)!.headline, "");
  assert.deepEqual(synthOf({ headline: "This person paints.", aims: ["Painting", "Painting", "Teaching"] }, names)!.aims, ["Painting", "Teaching"]);   // the rest kept, once each
  assert.equal(synthOf({ headline: "You paint most evenings in the studio." }, names)!.headline, "You paint most evenings in the studio.");
  assert.deepEqual(synthOf({ headline: "You paint.", aims: ["You paint a lot in the studio.", "Selling prints"] }, names)!.aims, ["Selling prints"]);   // a sentence is no aim
});

// ------------------------------------------------------------------- what Sol knows, one list (BR1 people p-engine)

/** Denise's bakery, read from her Claude Code chats: an orders folder whose own server is named like it (orders), with
 *  github too, and a cakes folder; a fact she told of orders */
async function bakery(name: string) {
  const { d } = lucy();
  const p = home(name, { name: "Denise", said: "go", aims: [{ w: "My bakery", said: true, ok: true, at: "2026-11-18" }], consent: { levels: {} } });
  sessions(p, "Bakery/orders", [at(1, 7), at(2, 7), at(3, 8)], { mcp: "orders" });
  sessions(p, "Bakery/orders", [at(1, 9)], { mcp: "github" });
  sessions(p, "Bakery/cakes", [at(1, 14)]);
  const y = await read(p.w, { sources: ["claude-sessions"] }, () => {}, { read: d, now: () => NOW });
  return { p, d, y, orders: y.parts.find((x) => x.name === "orders")!, cakes: y.parts.find((x) => x.name === "cakes")! };
}

test("a folder's own name is no tool (\"Uses orders here\" in orders); a tool says which read saw it and when", async () => {
  const { orders } = await bakery("denise-tools");
  assert.ok(orders, "the orders folder is a place");
  assert.ok(!orders.tools.some((t) => t.toLowerCase() === "orders"), JSON.stringify(orders.tools));
  assert.ok(!orders.knows.some((x) => x.fact === "Uses orders here"));
  const gh = orders.knows.find((x) => x.fact === "Uses github here")!;
  assert.ok(gh, JSON.stringify(orders.knows));
  assert.deepEqual([gh.from, gh.at], ["claude-sessions", new Date(NOW).toISOString()]);
  assert.equal(orders.scope, "orders");
  assert.deepEqual([...namesOf([{ name: "Orders", path: "/x/Bakery/orders-2026", label: "Shop" }])].sort(), ["orders", "orders-2026", "shop"]);
});

test("next.known: the person's own first, then each place's, each with its place; at a place, only that place", async () => {
  const { p, orders } = await bakery("denise-known");
  addFact(p.w.sol, { place: "orders", fact: "Orders close at noon", source: "you said" });
  const all = knownNow(p.w, {}, NOW);
  assert.equal(all.at, "you");
  assert.deepEqual(all.facts[0], { k: "aim:My bakery", fact: "You're here for my bakery", source: "you said", by: "person", at: "2026-11-18", place: null });
  const noon = all.facts.find((f) => f.fact === "Orders close at noon")!;
  assert.ok(noon.k.startsWith("fact:") && noon.place === orders.id && noon.by === "person" && !!noon.at);
  assert.ok(all.facts.some((f) => f.k === `seen:${orders.id}:ais` && f.fact === "Claude Code works here" && f.from === "claude-sessions"));
  assert.equal(new Set(all.facts.map((f) => f.k)).size, all.facts.length, "each fact once");
  const here = knownNow(p.w, { at: orders.id }, NOW).facts;
  assert.ok(here.length > 0 && here.every((f) => f.place === orders.id));
  assert.deepEqual(knownNow(p.w, { at: `w:${orders.id}` }, NOW).facts.map((f) => f.k), here.map((f) => f.k), "a path and its folder id are one place");
  assert.deepEqual(knownNow(p.w, { at: "orders" }, NOW).facts.map((f) => f.k), here.map((f) => f.k), "and its scope");
});

test("next.you.source off: what it gave leaves every list now, read.off names it, the record says no; Back puts it as it was", async () => {
  const { p } = await bakery("denise-source");
  const t0 = knownNow(p.w, {}, NOW).facts.filter((f) => f.from === "claude-sessions");
  assert.ok(t0.length >= 2);
  const off = setReadSource(p.w, { source: "claude-sessions", read: false }, NOW);
  assert.ok(off.ok && off.token);
  assert.ok(!knownNow(p.w, {}, NOW).facts.some((f) => f.from === "claude-sessions"));
  const y = youOf(p.w, NOW);
  assert.deepEqual([y.read.off, y.read.sources], [["claude-sessions"], []]);
  assert.equal(recordOf(p).consent.sources["claude-sessions"], "no");
  const orders = y.parts.find((x) => x.name === "orders")!;
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/orders") }).changes!.filter((c) => c.source === "you turned off your AI chats").length,
    t0.filter((f) => f.place === orders.id).length, "a session in orders hears what left there");
  assert.deepEqual(fixFact(p.w, { token: off.token, back: true }), { ok: true, back: true, token: off.token });
  assert.equal(recordOf(p).consent.sources["claude-sessions"], "yes", "the press of the read was its yes");
  assert.deepEqual(youOf(p.w, NOW).read.off, []);
  // the record stays: what was done is still there, and its Back is a fix line of its own (BR1 #1615)
  const kept = sinceOf(p.w, { folder: join(p.u, "Bakery/orders") }).changes!;
  assert.ok(kept.some((c) => c.source === "you turned off your AI chats"), "Back keeps the record");
  assert.ok(kept.some((c) => /^You said no to “/.test(c.source)), "Back says itself");
  const on = setReadSource(p.w, { source: "notes", read: true }, NOW);
  assert.ok(on.ok && on.when === "from the next read");
  assert.equal(setReadSource(p.w, { source: "mail", read: false }, NOW).ok, false);
  // no record yet: the word is held, and read.off says it the same
  const q = home("denise-source-held", null);
  assert.ok(setReadSource(q.w, { source: "browser", read: false }, NOW).ok);
  assert.deepEqual(youOf(q.w, NOW).read.off, ["browser"]);
});

test("next.you.fact.fix: right at once; the rest a preview, then keep or back; a session in the folder hears it once, until it leaves it", async () => {
  const { p, orders, cakes } = await bakery("denise-fix");
  const noon = addFact(p.w.sol, { place: "orders", fact: "Orders close at noon", source: "you said" });
  assert.ok(noon.ok);
  const k = `fact:${noon.fact.id}`;
  // right: a maybe-old fact is not maybe old any more, at once
  staleFact(p.w.sol, { id: noon.fact.id, why: "the file it came from is gone" });
  assert.equal(knownNow(p.w, {}, NOW).facts.find((f) => f.k === k)!.stale, true);
  const right = fixFact(p.w, { k, how: "right" }, NOW);
  assert.ok(right.ok && "saved" in right && right.saved);
  assert.equal(knownNow(p.w, {}, NOW).facts.find((f) => f.k === k)!.stale, undefined);
  // not any more, with its new words: a preview first, nothing changed until keep
  const pre = fixFact(p.w, { k, how: "not-anymore", now: "Orders close at 2pm" }, NOW);
  assert.ok(pre.ok && "preview" in pre);
  assert.deepEqual(pre.preview.changes, [{ what: "Orders close at noon", from: "Orders close at noon", to: "Orders close at 2pm", when: "now" }]);
  assert.ok(knownNow(p.w, {}, NOW).facts.some((f) => f.k === k));
  const kept = fixFact(p.w, { token: pre.preview.token, keep: true }, NOW);
  assert.ok(kept.ok && "kept" in kept);
  const facts = knownNow(p.w, {}, NOW).facts.map((f) => f.fact);
  assert.ok(facts.includes("Orders close at 2pm") && !facts.includes("Orders close at noon"));
  const heard = sinceOf(p.w, { folder: join(p.u, "Bakery/orders"), session: "s-1" }).changes!;
  assert.deepEqual(heard.at(-1), { k, was: "Orders close at noon", now: "Orders close at 2pm", source: "you said it is not so any more", at: new Date(NOW).toISOString() });
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/cakes") }).changes!.length, 0, "cakes heard nothing of orders");
  assert.ok(leave(p.w, { session: "s-1", k }).ok);
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/orders"), session: "s-1" }).changes!.length, 0, "left");
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/orders"), session: "s-2" }).changes!.length, 2, "another session still hears both");
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/orders"), after: NOW }).changes!.length, 0, "after a time, only what came later");
  // Back of a kept fix: the old words stand again, the new ones are held
  assert.ok(fixFact(p.w, { token: pre.preview.token, back: true }).ok);
  const back = knownNow(p.w, {}, NOW).facts.map((f) => f.fact);
  assert.ok(back.includes("Orders close at noon") && !back.includes("Orders close at 2pm"));
  // not true, of a tool the read saw: forgotten, the next read included; a preview dropped by back changes nothing
  const gh = orders.knows.find((x) => x.fact === "Uses github here")!;
  const drop = fixFact(p.w, { k: gh.k, how: "not-true" }, NOW);
  assert.ok(drop.ok && "preview" in drop && drop.preview.changes[0].when === "from the next read");
  assert.deepEqual(fixFact(p.w, { token: drop.preview.token, back: true }), { ok: true, back: true });
  assert.ok(knownNow(p.w, {}, NOW).facts.some((f) => f.k === gh.k));
  const drop2 = fixFact(p.w, { k: gh.k, how: "not-true" }, NOW) as { preview: { token: string } };
  assert.ok(fixFact(p.w, { token: drop2.preview.token, keep: true }).ok);
  assert.ok(!knownNow(p.w, {}, NOW).facts.some((f) => f.k === gh.k));
  // only here: a told fact moves to the place named (a part's id), nothing else does
  const moved = fixFact(p.w, { k, how: "only-here", place: cakes.id }, NOW) as { ok: true; preview: { token: string; changes: { to: string }[] } };
  assert.equal(moved.preview.changes[0].to, "cakes");
  assert.ok(fixFact(p.w, { token: moved.preview.token, keep: true }).ok);
  assert.ok(knownNow(p.w, { at: cakes.id }, NOW).facts.some((f) => f.fact === "Orders close at noon"));
  assert.ok(!knownNow(p.w, { at: orders.id }, NOW).facts.some((f) => f.fact === "Orders close at noon"));
  assert.equal(fixFact(p.w, { k: gh.k, how: "only-here", place: cakes.id }, NOW).ok, false);
  // not true, of what Sol works out (seen:) or the person's own (aim:): gone, and said everywhere
  const aim = fixFact(p.w, { k: "aim:My bakery", how: "not-true" }, NOW) as { preview: { token: string } };
  assert.ok(fixFact(p.w, { token: aim.preview.token, keep: true }).ok);
  assert.ok(!knownNow(p.w, {}, NOW).facts.some((f) => f.k === "aim:My bakery"));
  assert.ok(sinceOf(p.w, { folder: join(p.u, "Bakery/cakes") }).changes!.some((c) => c.k === "aim:My bakery"), "about the person, heard in every folder");
  assert.equal(fixFact(p.w, { k: "nothing:here", how: "not-true" }, NOW).ok, false);
  assert.equal(fixFact(p.w, { k, how: "maybe" }, NOW).ok, false);
});

test("next.you.claude: the person's word on reading with their Claude, said in read.claude, and the next read goes by it", () => {
  const p = home("denise-claude", { name: "Denise", said: "go" });
  assert.equal(youOf(p.w, NOW).read.claude, false);
  const on = setClaude(p.w, { on: true }, NOW);
  assert.ok(on.ok && on.you.read.claude);
  assert.equal(byOf(p.w), "claude");
  assert.ok(setClaude(p.w, { on: false }, NOW).ok);
  assert.equal(byOf(p.w), "device");
  assert.equal(setClaude(p.w, { on: "yes" }, NOW).ok, false);
});

// ------------------------------------------------------------- fit mode and the "because" (BR1 people item 1)

test("next.fit.try: a preview with a token as a fix gives; keep is the person's take there and a session there hears it; Back holds it", async () => {
  const { p } = await bakery("denise-fit");
  personSet(p.w.sol, { knob: "size", scope: "~", take: "l" } as never, NOW);
  // pointed at orders: from is the take that decides there now (all of Sol's), nothing written yet
  const pre = tryFit(p.w, { knob: "size", scope: "orders", take: "xl", by: "point" }, NOW);
  assert.ok(pre.ok && "preview" in pre);
  assert.deepEqual(pre.preview.changes, [{ what: "size", from: "l", to: "xl", when: "now", knob: "size", scope: "orders" }]);
  assert.equal(takeOf(p.w.sol, "size", "orders").take, "l", "a preview changes nothing");
  const kept = tryFit(p.w, { token: pre.preview.token, keep: true }, NOW);
  assert.ok(kept.ok && "fit" in kept && kept.fit.take === "xl" && kept.fit.author === "person" && kept.fit.source === "fit mode: point");
  assert.equal(takeOf(p.w.sol, "size", "orders").take, "xl");
  assert.equal(takeOf(p.w.sol, "size", "cakes").take, "l", "only where it was pointed");
  assert.deepEqual(sinceOf(p.w, { folder: join(p.u, "Bakery/orders") }).changes!.at(-1), { k: "fit:size", was: "l", now: "xl", source: "you pointed at it and kept it", at: new Date(NOW).toISOString() });
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/cakes") }).changes!.length, 0);
  assert.deepEqual(tryFit(p.w, { token: pre.preview.token, keep: true }, NOW), { ok: true, kept: true, again: true }, "a second keep is the same keep");
  assert.equal(tryFit(p.w, { knob: "size", scope: "orders", take: "xl" }, NOW).ok, false, "the take standing there is no change");
  // Back of the kept take: all of Sol's decides again, and the knob is held there (Sol leaves it alone)
  assert.ok(tryFit(p.w, { token: pre.preview.token, back: true }, NOW).ok);
  const f = takeOf(p.w.sol, "size", "orders");
  assert.deepEqual([f.take, f.held], [null, true]);
  const fitLog = sinceOf(p.w, { folder: join(p.u, "Bakery/orders") }).changes!;
  assert.ok(fitLog.some((c) => c.k === "fit:size"), "Back keeps the record");
  assert.ok(fitLog.some((c) => c.source === "You said no to “xl”"), "Back says itself");
  // a preview dropped by Back writes nothing; said and picked keep with their own words
  const said = tryFit(p.w, { knob: "attention", scope: "cakes", take: "quiet", by: "say" }, NOW) as { ok: true; preview: { token: string; changes: { from: string }[] } };
  assert.equal(said.preview.changes[0].from, "default");
  assert.deepEqual(tryFit(p.w, { token: said.preview.token, back: true }, NOW), { ok: true, back: true });
  assert.equal(fitsOf(p.w.sol, "cakes").ok && (fitsOf(p.w.sol, "cakes") as { fits: { knob: string }[] }).fits.some((x) => x.knob === "attention"), false);
  // Customize (#1615): a folder's colour is a fit like any; one of Sol's tries kept says so
  const tried = tryFit(p.w, { knob: "colour", scope: "cakes", take: "mint", by: "try" }, NOW) as { ok: true; preview: { token: string } };
  assert.ok(tryFit(p.w, { token: tried.preview.token, keep: true }, NOW).ok);
  assert.equal(takeOf(p.w.sol, "colour", "cakes").take, "mint");
  assert.equal(sinceOf(p.w, { folder: join(p.u, "Bakery/cakes") }).changes!.find((c) => c.k === "fit:colour")?.source, "you tried Sol’s idea and kept it");
  for (const bad of [{ knob: "Size!", scope: "orders", take: "s" }, { knob: "size", scope: "../x", take: "s" }, { knob: "size", scope: "orders", take: " " }])
    assert.equal(tryFit(p.w, bad, NOW).ok, false, JSON.stringify(bad));
  assert.equal(tryFit(p.w, { token: "nope", keep: true }, NOW).ok, false);
});

test("a first turn's told: the facts its text says, keyed as next.known keys them; kept by session, a session's because", async () => {
  const { p, orders } = await bakery("denise-told");
  addFact(p.w.sol, { place: "orders", fact: "Orders close at noon", source: "you said" });
  addFact(p.w.sol, { place: "orders", fact: "y".repeat(700), source: "you said" });
  setTalk(p.w, { style: "brief" }, NOW);
  const { text, told } = youHereTold(p.w, join(p.w.sol, "orders"));
  assert.equal(text, youHere(p.w, join(p.w.sol, "orders")), "the same words as before");
  const known = new Map(knownNow(p.w, {}, NOW).facts.map((f) => [f.k, f]));
  assert.deepEqual(told.map((t) => t.k).filter((k) => !k.startsWith("fact:")), ["aim:My bakery", "talk"]);
  for (const t of told) { assert.ok(known.has(t.k), t.k); assert.equal(known.get(t.k)!.fact, t.fact, t.k); }
  assert.ok(told.some((t) => t.fact === "Orders close at noon" && t.place === "orders"));
  assert.ok(!told.some((t) => t.fact.startsWith("yyy")), "a fact cut off by the 600 is not told");
  assert.ok(orders);
  // kept by session; the because of what it made is the keys; a session told nothing gives none
  rememberTold(p.w, "s-orders", join(p.w.sol, "orders"), told, NOW);
  const t = toldOf(p.w, { session: "s-orders" });
  assert.ok(t.ok && t.told.length === told.length && t.at === new Date(NOW).toISOString());
  assert.deepEqual(becauseOf(p.w.sol, "s-orders"), told.map((x) => x.k));
  assert.deepEqual(becauseOf(p.w.sol, "s-none"), []);
  rememberTold(p.w, "s-empty", null, [], NOW);
  assert.deepEqual(toldOf(p.w, { session: "s-empty" }), { ok: true, session: "s-empty", at: null, place: null, told: [] });
  assert.equal(toldOf(p.w, {}).ok, false);
  assert.deepEqual(youHereTold(home("told-none", null).w, "/tmp"), { text: "", told: [] });
});

test("a new session's first turn: firstTurnHere is youHereTold on the record's home when on, and nothing when off (index.ts's one line)", async () => {
  const { p } = await bakery("first-turn-here");
  const on = firstTurnHere(p.w.sol, p.w.user, join(p.w.sol, "orders"), {}, true);
  assert.deepEqual({ text: on.text, told: on.told }, youHereTold({ ...p.w, rec: on.w.rec }, join(p.w.sol, "orders")));
  assert.equal(on.w.sol, p.w.sol);
  assert.deepEqual(firstTurnHere(p.w.sol, p.w.user, join(p.w.sol, "orders"), {}, false).text, "");
  assert.deepEqual(firstTurnHere(p.w.sol, p.w.user, join(p.w.sol, "orders"), {}, false).told, []);
});

test("next.known folds in Home's learned lines (learned:<id>, about the person) and next.you.read honours the first pick and says each skip", async () => {
  const { p } = await bakery("denise-learned");
  const facts = knownNow(p.w, {}, NOW, [{ id: "l1", text: "You plan orders on Sunday nights", seen: 3 }, { id: 7, text: "Cakes go out by 9", seen: 1 }]).facts;
  assert.deepEqual(facts.find((f) => f.k === "learned:l1"), { k: "learned:l1", fact: "You plan orders on Sunday nights", source: "seen 3 times", by: "sol", place: null });
  assert.equal(facts.find((f) => f.k === "learned:7")!.source, "seen 1 time");
  assert.ok(!knownNow(p.w, { at: "orders" }, NOW, [{ id: "l1", text: "x" }]).facts.some((f) => f.k.startsWith("learned:")), "a place's list has none");
  // the first pick: read first, said why; what is on this Mac and not picked, skipped with why
  const { d } = lucy();
  const q = home("lucy-first", { name: "Lucy", said: "go", aims: [{ w: "My business", said: true, ok: true, at: "2026-11-18" }] });
  const evs: Watched[] = [];
  await read(q.w, { sources: ["calendar-store", "notes"], first: "notes", present: ["calendar-store", "notes", "browser"] }, (e) => evs.push(e), { read: d, now: () => NOW });
  assert.deepEqual(evs.filter((e) => e.kind === "skip"), [{ kind: "skip", source: "browser", why: "you didn't pick it" }]);
  const order = evs.find((e) => e.kind === "order") as { order: string[]; because: { line: string } | null };
  assert.equal(order.order[0], "notes");
  // a no said since stands on Look again, and says so
  const rec = recordOf(q); rec.consent = { ...rec.consent, sources: { ...rec.consent?.sources, notes: "no" } }; fs.writeFileSync(join(q.w.sol, "record", "me.json"), JSON.stringify(rec));
  const again: Watched[] = [];
  await read(q.w, { sources: ["calendar-store", "notes"], again: true }, (e) => again.push(e), { read: d, now: () => NOW });
  assert.deepEqual(again.filter((e) => e.kind === "skip"), [{ kind: "skip", source: "notes", why: "you said no to your notes" }]);
});

test("one store: every fix the person makes is one scoped line in next.known, a session working there hears it, and an agent's move without a because is refused", async () => {
  const { p, orders, cakes } = await bakery("denise-one-store");
  // a drag, a Stop and a hide: each one line, fix:<id>, the person's own, in its place
  const drag = noteFix(p.w, { how: "drag", what: "cakes", place: cakes.id, now: "Bakery", reason: `placed:${cakes.id}` }, NOW);
  assert.ok(drag.ok);
  assert.deepEqual({ ...drag.fix, k: "fix" }, { k: "fix", fact: "You moved cakes to Bakery", source: "you did it", by: "person", at: new Date(NOW).toISOString(), place: cakes.id, fix: { how: "drag", what: "cakes", reason: `placed:${cakes.id}` } });
  noteFix(p.w, { how: "stop", what: "an automation", place: "everywhere", reason: "auto:a1" }, NOW + 1);
  const facts = knownNow(p.w, {}, NOW).facts;
  assert.ok(facts.some((f) => f.k === drag.fix.k), "the drag is in what Sol knows");
  assert.ok(facts.some((f) => f.fact === "You stopped an automation" && f.place === null));
  assert.ok(knownNow(p.w, { at: cakes.id }, NOW).facts.some((f) => f.k === drag.fix.k), "at its place");
  assert.ok(!knownNow(p.w, { at: orders.id }, NOW).facts.some((f) => f.k === drag.fix.k), "not at another place");
  const heard = sinceOf(p.w, { folder: cakes.id });
  assert.ok(heard.ok && heard.changes.some((c) => c.k === drag.fix.k && c.source === "You moved cakes to Bakery"));
  assert.equal(noteFix(p.w, { how: "shrug", what: "x", place: cakes.id, reason: drag.fix.k }).ok, false);
  assert.equal(noteFix(p.w, { how: "undo", what: "", place: cakes.id, reason: drag.fix.k }).ok, false);
  // a fix says where it holds and why, or it is refused: no place is never everywhere, and no because is no line
  const n = readStore(p.w.sol).fixes.length;
  assert.deepEqual(noteFix(p.w, { how: "hide", what: "cakes", place: undefined, reason: `placed:${cakes.id}` }), { ok: false, why: NO_FIX_PLACE });
  assert.deepEqual(noteFix(p.w, { how: "hide", what: "cakes", place: null, reason: `placed:${cakes.id}` }), { ok: false, why: NO_FIX_PLACE });
  assert.deepEqual(noteFix(p.w, { how: "hide", what: "cakes", place: cakes.id, reason: "" }), { ok: false, why: NO_FIX_REASON });
  assert.deepEqual(noteFix(p.w, { how: "hide", what: "cakes", place: cakes.id, reason: undefined }), { ok: false, why: NO_FIX_REASON });
  assert.equal(readStore(p.w.sol).fixes.length, n, "nothing written for a refused fix");
  assert.ok(readStore(p.w.sol).fixes.every((f) => f.reason && (f.place === null || f.place.length)), "every line kept has its because");
  // where Sol put things: placed:<folder>, unseen until seen; the same reading is what "same" goes by, never a name
  place(p.w, { folder: "w:/h/old-a", to: "the shelf", why: "you used it on one day", reading: "one-day", batch: "mv1" }, NOW);
  place(p.w, { folder: "w:/h/old-b", to: "the shelf", why: "you used it on one day", reading: "one-day", batch: "mv1" }, NOW);
  place(p.w, { folder: "w:/h/old-a-copy", to: "School", why: "it sits inside School", reading: "inside:School", batch: "mv1" }, NOW);
  assert.deepEqual(placedNow(p.w).placed.map((x) => x.folder), ["w:/h/old-a", "w:/h/old-b", "w:/h/old-a-copy"]);
  assert.ok(knownNow(p.w, {}, NOW).facts.some((f) => f.k === "placed:w:/h/old-a" && f.fact === "Sol put old-a in the shelf because you used it on one day" && f.by === "sol"));
  const back = noteFix(p.w, { how: "put-back", what: "old-a", place: "w:/h/old-a", reason: "placed:w:/h/old-a", batch: "mv1" }, NOW);
  assert.ok(back.ok);
  assert.deepEqual(back.same, { reason: "placed:w:/h/old-a", n: 1, these: [{ k: "placed:w:/h/old-b", place: "w:/h/old-b", fact: "Sol put old-b in the shelf because you used it on one day" }] }, "old-a-copy shares a name, not the reading");
  assert.ok(!placedNow(p.w).placed.some((x) => x.folder === "w:/h/old-a"), "a folder put back is seen");
  assert.ok(seenPlaced(p.w, { folder: "w:/h/old-b" }).ok);
  assert.deepEqual(placedNow(p.w).placed.map((x) => x.folder), ["w:/h/old-a-copy"]);
  // "Same for these?": everywhere is a rule:<reason> line agents read; Back takes it away
  const all = sameFor(p.w, { reason: "placed:w:/h/old-a", how: "put-back", reach: "everywhere" }, NOW);
  assert.ok(all.ok && "rule" in all && all.rule.fact === "Everywhere: not moved for the same reason");
  assert.ok(knownNow(p.w, {}, NOW).facts.some((f) => f.k === "rule:placed:w:/h/old-a:put-back"));
  assert.equal(sameFor(p.w, { reason: "x", how: "hide", reach: "these" }).ok, false, "these names its keys");
  assert.deepEqual(sameFor(p.w, { reason: "x", how: "hide", reach: "here" }), { ok: true, reach: "here" });
  assert.ok("token" in all && fixFact(p.w, { token: all.token, back: true }).ok);
  assert.ok(!knownNow(p.w, {}, NOW).facts.some((f) => f.k.startsWith("rule:")));
  // an agent's move: the keys it names that Sol knows, then its session's told keys; neither, refused
  assert.equal(becauseFor(p.w, [], null, NOW), null);
  assert.equal(becauseFor(p.w, ["made:up"], "s-nobody", NOW), null);
  assert.deepEqual(becauseFor(p.w, ["aim:My bakery", "made:up", drag.fix.k], null, NOW), ["aim:My bakery", drag.fix.k]);
  rememberTold(p.w, "s-told", null, [{ k: "talk", fact: "x", place: null }] as never, NOW);
  assert.deepEqual(becauseFor(p.w, undefined, "s-told", NOW), ["talk"]);
  // a fact fixed asks once of the places shown the same for the same reading
  const fx = fixFact(p.w, { k: `seen:${orders.id}:ais`, how: "not-true" }, NOW);
  assert.ok(fx.ok && "same" in fx && fx.same && fx.same.these.some((t) => t.k === `seen:${cakes.id}:ais`) && !fx.same.these.some((t) => t.place === orders.id));
});

test("one store: a Diary line Sol writes for a session carries its because, or is refused; the person's own carries none", async () => {
  const { p } = await bakery("denise-sol-lines");
  const day = new Date(NOW);
  assert.deepEqual(writeLine(p.w.sol, { words: "Sorted the orders" }, day, { session: "s1", because: null }), { ok: false, why: NO_LINE_BECAUSE });
  const r = writeLine(p.w.sol, { words: "Sorted the orders" }, day, { session: "s1", because: ["aim:My bakery"] });
  assert.ok(r.ok);
  const line = readDay(p.w.sol, dayOf(day)).find((l) => l.words === "Sorted the orders")!;
  assert.deepEqual([line.who, line.session, line.because], ["sol", "s1", ["aim:My bakery"]]);
  writeLine(p.w.sol, { words: "mine" }, day);
  const mine = readDay(p.w.sol, dayOf(day)).find((l) => l.words === "mine")!;
  assert.deepEqual([mine.who, "because" in mine], ["person", false]);
});

// builder K (#1615): "every fix the person makes is one scoped line in known(), with its because", path by path
test("one store, every path: Reading's forget and ×, a Stop, the shelf and the move-in's Back, a raise's outcome: each one line with its place and because", async () => {
  const { p, orders, cakes } = await bakery("denise-every-path");
  const fixes = () => readStore(p.w.sol).fixes;
  const last = () => fixes().at(-1)!;
  // Reading's forget of a fact the read saw: at its place, because of its key; Back brings it back, the same way
  const tool = knownNow(p.w, { at: orders.id }, NOW).facts.find((f) => f.k.startsWith("tool:"))!;
  assert.ok(tool, "the read saw a tool in orders");
  assert.ok(forgetKnown(p.w, { k: tool.k }, NOW).ok);
  assert.ok(!knownNow(p.w, {}, NOW).facts.some((f) => f.k === tool.k), "forgotten");
  assert.deepEqual([last().how, last().what, last().place, last().reason], ["hide", `“${tool.fact}”`, tool.place, tool.k]);
  assert.ok(forgetKnown(p.w, { k: tool.k, back: true }, NOW + 1).ok);
  assert.deepEqual([last().how, last().what, last().place, last().reason], ["show", `“${tool.fact}”`, tool.place, tool.k], "Back says it as its forget did");
  // Reading's × on a line a place's fields say (seen:): out of what Sol knows, one line there
  const seen = knownNow(p.w, { at: cakes.id }, NOW).facts.find((f) => f.k.startsWith("seen:"))!;
  assert.ok(forgetKnown(p.w, { k: seen.k }, NOW + 2).ok);
  assert.ok(!knownNow(p.w, {}, NOW + 2).facts.some((f) => f.k === seen.k));
  assert.deepEqual([last().how, last().place, last().reason], ["hide", seen.place, seen.k]);
  assert.equal(forgetKnown(p.w, { k: "seen:nowhere:nothing" }, NOW + 2).ok, false, "a line Sol does not know is no fix");
  // the × on a part: at the part, because of its key; Back the same
  assert.ok(dropKnown(p.w, { id: orders.id }, NOW + 3).ok);
  assert.deepEqual([last().how, last().what, last().place, last().reason], ["hide", "orders", orders.id, orders.id]);
  assert.ok(dropKnown(p.w, { id: orders.id, back: true }, NOW + 4).ok);
  assert.deepEqual([last().how, last().place, last().reason], ["show", orders.id, orders.id]);
  // a Stop: at the folder it worked in, because of the thing stopped; working nowhere, everywhere, said so
  assert.equal(placeOfCwd("/srv/denise/bakery/"), "w:/srv/denise/bakery");
  assert.ok(noteStop(p.w.sol, { what: "“Sort the orders”", reason: "session:s-1", cwd: "/srv/denise/bakery" }, NOW + 5).ok);
  assert.deepEqual([last().how, last().place, last().reason], ["stop", "w:/srv/denise/bakery", "session:s-1"]);
  assert.ok(sinceOf(p.w, { folder: "/srv/denise/bakery" }).changes!.some((c) => c.source === "You stopped “Sort the orders”"), "a session working there hears it");
  assert.ok(noteStop(p.w.sol, { what: "“Weekly invoices”", reason: "auto:a2", cwd: null }, NOW + 6).ok);
  assert.deepEqual([last().place, last().reason], [null, "auto:a2"]);
  // the shelf and the move-in's one Back: hiding and bringing back because of the placement; the Back because of its batch
  assert.ok(shelfPut(p.w, { folder: "w:/srv/denise/old", name: "old" }, NOW + 7).ok);
  assert.deepEqual([last().how, last().place, last().reason], ["hide", "w:/srv/denise/old", "placed:w:/srv/denise/old"]);
  assert.ok(shelfTake(p.w, { folder: "w:/srv/denise/old" }, NOW + 8).ok);
  assert.deepEqual([last().how, last().place, last().reason], ["show", "w:/srv/denise/old", "placed:w:/srv/denise/old"]);
  const { backMoveIn } = await import("./movein-place.js");
  place(p.w, { folder: "w:/srv/denise/a", to: "shelf", why: "you used it on one day", reading: "one-day", batch: "mv-k" }, NOW + 9);
  assert.ok(backMoveIn(p.w, { batch: "mv-k" }, NOW + 10).ok);
  assert.deepEqual([last().how, last().place, last().reason], ["back", null, "movein:mv-k"]);
  // a raise's outcome (Quiet: Later, an answer, passed by), through the helper P and Q call
  assert.ok(noteFixIn(p.w.sol, { how: "later", what: "“the flour order”", place: cakes.id, reason: "raise:r1" }, NOW + 11).ok);
  assert.ok(noteFixIn(p.w.sol, { how: "answer", what: "“the flour order”", place: cakes.id, reason: "raise:r1", now: "order 20kg" }, NOW + 12).ok);
  assert.ok(noteFixIn(p.w.sol, { how: "pass", what: "“the oven check”", place: "everywhere", reason: "raise:r2" }, NOW + 13).ok);
  const words = knownNow(p.w, {}, NOW + 13).facts.filter((f) => f.k.startsWith("fix:")).map((f) => f.fact);
  for (const w of ["You put “the flour order” off till later", "You answered “the flour order”: order 20kg", "You let “the oven check” pass"]) assert.ok(words.includes(w), w);
  assert.equal(noteFixIn(p.w.sol, { how: "pass", what: "x", place: "", reason: "raise:r3" }).ok, false, "the helper asks for a place too");
  // the raise as Q sends it (next.known.fix): an open, carrying the ask's own keys as its because; a pass is said once per ask
  const opened = noteFixIn(p.w.sol, { how: "open", what: "“the flour order”", place: cakes.id, reason: "ask:a1", was: "Order flour?", because: [tool.k, tool.k, " "] }, NOW + 14);
  assert.ok(opened.ok && opened.fix.fact === "You opened “the flour order”", JSON.stringify(opened));
  assert.deepEqual(last().because, [tool.k], "the because keys, once each, the empty ones dropped");
  const again = noteFixIn(p.w.sol, { how: "pass", what: "“the oven check”", place: "everywhere", reason: "raise:r2" }, NOW + 15);
  assert.ok(again.ok, "a second pass is no error");
  assert.equal(fixes().filter((f) => f.how === "pass" && f.reason === "raise:r2").length, 1, "and no second line");
  // and every line the store keeps says where and why
  assert.equal(fixes().length, 14, "one line per act, the refused ones and the second pass none");
  assert.ok(fixes().every((f) => !!f.reason), JSON.stringify(fixes().filter((f) => !f.reason)));
});

test("a raise's outcomes read back for the judging, and a Reading row's × said in the person's words, never its key", async () => {
  const { p, cakes } = await bakery("denise-outcomes");
  const fixes = () => readStore(p.w.sol).fixes;
  // three outcomes on two asks and one fix that is no outcome: outcomesOf gives the three, oldest first, since a time
  noteFixIn(p.w.sol, { how: "open", what: "“the flour order”", place: cakes.id, reason: "ask:a1", because: ["seen:x:hours"] }, NOW + 1);
  noteFixIn(p.w.sol, { how: "answer", what: "“the flour order”", place: cakes.id, reason: "ask:a1", now: "order 20kg" }, NOW + 2);
  noteFixIn(p.w.sol, { how: "stop", what: "a session", place: "everywhere", reason: "session:s1" }, NOW + 3);
  noteFixIn(p.w.sol, { how: "pass", what: "“the oven check”", place: "everywhere", reason: "ask:a2" }, NOW + 4);
  const all = outcomesOf(p.w.sol);
  assert.deepEqual(all.map((o) => [o.how, o.reason, o.place]), [["open", "ask:a1", cakes.id], ["answer", "ask:a1", cakes.id], ["pass", "ask:a2", null]]);
  assert.deepEqual([all[0].because, all[1].now], [["seen:x:hours"], "order 20kg"]);
  assert.deepEqual(outcomesOf(p.w.sol, NOW + 2).map((o) => o.how), ["pass"], "only the ones after the time asked");
  // × on a thing an opened Reading row kept (read:<kind>:<name>): the line says its name and kind, or the kept line's text
  assert.ok(forgetKnown(p.w, { k: "read:app:Figma" }, NOW + 5).ok);
  assert.equal(fixes().at(-1)!.what, "“Figma” (app)");
  assert.ok(forgetKnown(p.w, { k: "read:app:Figma", back: true }, NOW + 6).ok);
  assert.deepEqual([fixes().at(-1)!.how, fixes().at(-1)!.what], ["show", "“Figma” (app)"], "its Back says it the same way");
  assert.ok(forgetKnown(p.w, { k: "read:skill:pdf", what: "Makes PDFs with the pdf skill" }, NOW + 7).ok);
  assert.equal(fixes().at(-1)!.what, "“Makes PDFs with the pdf skill”");
  assert.ok(!fixes().some((f) => f.what.startsWith("read:")), "no line says a key");
});

// BR1 item 6 (#1615), builder P: next.session.since follows the person's nesting (pos.json's `in`) as well as the path
test("a session in a folder Denise nested herself hears that folder's changes, and the parent's session hears it", async () => {
  const { setPos } = await import("./pos.js");
  const p = home("denise-nest", { name: "Denise", said: "go" }), NOW = Date.parse("2026-11-22T08:00:00Z");
  assert.ok(noteFix(p.w, { how: "hide", what: "the price list", place: "h:massage", reason: "seen:h:massage:price list" }, NOW).ok);
  assert.ok(noteFix(p.w, { how: "hide", what: "the old flyer", place: "h:denise", reason: "seen:h:denise:old flyer" }, NOW).ok);
  const heard = (folder: string) => sinceOf(p.w, { folder }).changes!.map((c) => c.was).sort();
  assert.deepEqual(heard("h:denise"), ["the old flyer"], "unnested, massage is not hers by its path");
  assert.ok(setPos(p.w.sol, { id: "h:massage", x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: "h:denise" }).ok);
  assert.deepEqual(heard("h:denise"), ["the old flyer", "the price list"], "put inside it, its changes are the parent's");
  assert.deepEqual(heard("h:massage"), ["the old flyer", "the price list"], "and inside, it hears the folder around it");
  assert.ok(setPos(p.w.sol, { id: "h:massage", x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: null }).ok);
  assert.deepEqual(heard("h:massage"), ["the price list"], "taken to the top, only its own");
});

test("a change kept by the folder's scope follows the nesting pos.json keeps by its id: home/massage in h:health", async () => {
  const { setPos } = await import("./pos.js");
  const p = home("denise-nest-path", { name: "Denise", said: "go" }), NOW = Date.parse("2026-11-22T08:00:00Z");
  assert.ok(noteFix(p.w, { how: "hide", what: "the price list", place: "home/massage", reason: "seen:h:massage:price list" }, NOW).ok);
  assert.ok(noteFix(p.w, { how: "hide", what: "the physio's number", place: "home/health", reason: "seen:h:health:physio" }, NOW).ok);
  const heard = (folder: string) => sinceOf(p.w, { folder }).changes!.map((c) => c.was).sort();
  assert.deepEqual(heard("home/health"), ["the physio's number"], "unnested, massage is not health's by its path");
  assert.ok(setPos(p.w.sol, { id: "h:massage", x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: "h:health" }).ok);
  for (const health of ["home/health", "h:health"]) assert.deepEqual(heard(health), ["the physio's number", "the price list"], `put inside it, ${health} hears massage's`);
  for (const massage of ["home/massage", "h:massage"]) assert.deepEqual(heard(massage), ["the physio's number", "the price list"], `${massage} hears the folder around it`);
  // a w: folder: a change at Dev's site's scope, heard by a session working in his work folder on the disk
  const { nestedIn } = await import("./fits.js");
  assert.equal(inFolder("srv/dev/code/site", "/srv/dev/work", nestedIn(p.w.sol)), false, "unnested, the site is not work's");
  assert.ok(setPos(p.w.sol, { id: "w:/srv/dev/code/site", x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: "w:/srv/dev/work" }).ok);
  for (const work of ["/srv/dev/work", "w:/srv/dev/work", "srv/dev/work"]) assert.equal(inFolder("srv/dev/code/site", work, nestedIn(p.w.sol)), true, work);
});
