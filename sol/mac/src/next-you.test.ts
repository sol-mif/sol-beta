// node --test src/*.test.ts: How Sol sees you, the face half (BR1, #1615; mine/look/br1/you.html): on each of the five
// panel people (movein/you/fixture.ts, never a real person's setup), the read folds into the ledger newest first with
// each source's state and the places' shares as last sent; the shelf shows only what is on this Mac and says when the
// Mac asks; a key is known by its shape; the rows drop what × took out and carry their questions; the day strip hatches
// the quiet hours; Open Sol's setup leaves out a dropped place and takes the dial as left; and the whole path, pressed
// on the panel's engine, lands on the picture with the felt times kept. Signed: marcocyl04-ux's agent (builder F).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PANEL, PANEL_KEYS } from "./next/movein/you/fixture.ts";
import { DIAL, ago, binWord, bringCount, dayLine, fold, keyOf, listW, macAsks, plainSkill, reading0, rising, setupOf, shapes, shelf, strip, thrownLine, connTiles, connVia, toolsOf } from "./next/movein/you/model.ts";
import { panelPort } from "./next/movein/you/port.ts";
import * as Y from "./next/movein/you/store.ts";
import { EN } from "./next/movein/you/strings.ts";
import type { Ev, Source } from "./next/movein/you/types.ts";
import { aisOf, hoursWord, kindOfKnown, leaves, regionOf } from "./next/movein/you/lens-state.ts";
import { KIND, asksOf, circleOf, fitOf, forming, placesOf } from "./next/movein/you/circle-state.ts";
import { forgettable, ofPart } from "./next/known.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { skip: tellMyself } = Y;   // "Skip: I'll tell Sol myself"

test("the read folds: newest first, every item and thrown line, each source's last state, the places' last shares", () => {
  for (const k of PANEL_KEYS) {
    const p = PANEL[k], r = p.reading.reduce(fold, reading0());
    const lines = p.reading.filter((e) => e.kind === "item" || e.kind === "thrown");
    assert.equal(r.lines.length, lines.length, k);
    if (lines.length) assert.equal(r.lines[0].item, (lines[lines.length - 1] as { item: string }).item, `${k}: newest on top`);
    for (const e of p.reading) if (e.kind === "source") assert.ok(r.sources[e.source], `${k}: ${e.source} known`);
    const last = new Map<string, number>();
    for (const e of p.reading) if (e.kind === "place") last.set(e.id, e.share);
    for (const s of shapes(r)) if (last.has(s.id)) assert.equal(s.share, last.get(s.id), `${k}: ${s.name}`);
    const thrown = p.reading.filter((e) => e.kind === "thrown").reduce((a, e) => a + (e as { n: number }).n, 0);
    assert.equal(thrownLine(r.thrown) === "", thrown === 0, k);
  }
});

test("a making event moves the shares to the rules' places and gives the day before the picture", () => {
  const evs: Ev[] = [
    { kind: "place", id: "a", name: "Alpha", colour: "sky", share: 0.5 },
    { kind: "making", part: "places", line: "Your places: Alpha 70%, Beta 30%", places: [{ id: "a", name: "Alpha", share: 0.7 }, { id: "b", name: "Beta", share: 0.3 }] },
    { kind: "making", part: "day", line: "Your day", hours: Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 17 ? 3 : 0)), quiet: [0, 7] },
  ];
  const r = evs.reduce(fold, reading0());
  assert.deepEqual(shapes(r).map((p) => [p.id, p.share]), [["a", 0.7], ["b", 0.3]]);
  assert.equal(r.places.find((p) => p.id === "a")?.colour, "sky", "a colour given stays");
  assert.equal(r.now, "Your day");
  assert.ok(r.day && r.day.quiet?.[1] === 7);
});

test("Bring's one Mac line: each switch the ticked rows still need, once; none when all are on (scope 07:10)", () => {
  const off = [{ id: "full-disk", name: "Full Disk Access", why: "", link: "", granted: false }];
  const three = shelf({ sources: ["browser", "calendar-store", "notes"], order: [], because: null }, new Set(["browser", "calendar-store", "notes"] as Source[]), off);
  assert.equal(three.filter((r) => r.asks).length, 3, "three rows wait on the Mac");
  assert.deepEqual(macAsks(three).map((p) => p.id), ["full-disk"], "one switch lets all three in: the Mac asks once");
  const row = (source: string, on: boolean, id: string | null) => ({ source: source as Source, name: source, gives: "", icon: "", on, asks: id ? { ...off[0], id } : null });
  assert.deepEqual(macAsks([row("a", true, "one"), row("b", true, "two"), row("c", false, "three"), row("d", true, null)]).map((p) => p.id), ["one", "two"], "an unticked row is not read, so the Mac never asks for it");
  assert.deepEqual(macAsks(shelf({ sources: ["browser"], order: [], because: null }, new Set(["browser"] as Source[]), [{ ...off[0], granted: true }])), []);
  assert.ok(!readFileSync(new URL("./next/movein/you/You.tsx", import.meta.url), "utf8").includes('className="mac"'), "no row carries its own Mac asks");
});

test("the shelf: only what is on this Mac, ticked as suggested; Mac asks only while the switch is off", () => {
  for (const k of PANEL_KEYS) {
    const p = PANEL[k], rows = shelf(p.suggest, new Set(p.suggest.sources), p.perms);
    for (const r of rows) {
      assert.ok(p.suggest.sources.includes(r.source) || p.suggest.order.includes(r.source), `${k}: ${r.source} present`);
      if (r.asks) assert.notEqual(r.asks.granted, true, `${k}: ${r.source}`);
    }
  }
  const on = [{ id: "full-disk", name: "Full Disk Access", why: "", link: "", granted: true }];
  assert.equal(shelf({ sources: ["browser"], order: [], because: null }, new Set(), on)[0].asks, null);
  assert.equal(shelf({ sources: ["browser"], order: [], because: null }, new Set(), [{ ...on[0], granted: false }])[0].asks?.id, "full-disk");
});

test("Bring these in counts the ticked sources, the AIs signed in and the connectors connected", () => {
  const a = { ais: [{ id: "x", name: "X", via: "sign-in" as const, present: true, signedIn: true }, { id: "y", name: "Y", via: "key" as const, present: false, signedIn: false }],
    connectors: [{ name: "C", kind: "mcp" as const, via: "claude" as const, connected: true }] };
  assert.equal(bringCount(new Set<Source>(["apps", "files"]), a), 4);
  assert.equal(bringCount(new Set(), null), 0);
});

test("Bring's connector tiles are only what the engine found; Connect only where it has a way from here (walk note w2)", () => {
  // no tile without a detection: nothing found, nothing drawn, never a list of names
  assert.deepEqual(connTiles({ ais: [], connectors: [] }), []);
  assert.deepEqual(connTiles(null), []);
  // GitHub through gh shows connected when gh says so, with no Connect
  const gh = { name: "GitHub", kind: "account" as const, via: "gh" as const, connected: true };
  assert.deepEqual(connTiles({ ais: [], connectors: [gh] }), [gh]);
  assert.equal(connVia(gh), "through gh");
  assert.equal(connTiles({ ais: [], connectors: [gh] })[0].at, undefined, "connected: no Connect");
  // no Connect without a way: gh signed out, an MCP server not connected, have none from this card, so no tile
  assert.deepEqual(connTiles({ ais: [], connectors: [{ ...gh, connected: false }, { name: "linear", kind: "mcp", via: "codex", connected: false }] }), []);
  // a Claude account's connector not connected: its own page in the account
  const slack = { name: "Slack", kind: "account" as const, via: "claude-account" as const, connected: false };
  assert.deepEqual(connTiles({ ais: [], connectors: [slack] }), [{ ...slack, at: "https://claude.ai/settings/connectors" }]);
  const src = readFileSync(new URL("./next/movein/you/model.ts", import.meta.url), "utf8");
  assert.ok(!/TO_CONNECT|"Google Drive", "Notion"/.test(src), "no hand-picked names left");
});

test("a pasted key is known by its shape, and an unknown one is not guessed", () => {
  assert.equal(keyOf("sk-ant-abc")?.id, "anthropic");
  assert.equal(keyOf("sk-or-v1-abc")?.id, "openrouter");
  assert.equal(keyOf("sk-proj-abc")?.id, "openai");
  assert.equal(keyOf("AIzaSyabc")?.id, "google");
  assert.equal(keyOf("xai-abc")?.id, "xai");
  assert.equal(keyOf("gsk_abc")?.id, "groq");
  assert.equal(keyOf("hello"), null);
});

test("the places: one per part in the engine's order, × takes one out, every question drawn once and leaves with its place", () => {
  for (const k of PANEL_KEYS) {
    const y = PANEL[k].you, all = placesOf(y, new Set(), true);
    assert.equal(all.shown.length, y.parts.length, k);
    assert.deepEqual(all.shown.map((r) => r.part.id), y.parts.map((p) => p.id), `${k}: the engine's order`);
    assert.deepEqual(asksOf(y, new Set()).map((q) => q.n), y.questions.map((_, n) => n), `${k}: every question drawn once`);
    if (y.parts.length) {
      const out = placesOf(y, new Set([y.parts[0].id]), true);
      assert.equal(out.shown.length, y.parts.length - 1);
      assert.ok(!out.shown.some((r) => r.part.id === y.parts[0].id));
      assert.ok(!asksOf(y, new Set([y.parts[0].id])).some((q) => q.at === 0), `${k}: a question about a place taken out leaves with it`);
    }
  }
});

test("the day strip: 24 hours, the quiet ones hatched (wrapping past midnight), the words say both", () => {
  const day = Array.from({ length: 24 }, (_, h) => (h >= 20 || h < 2 ? 5 : h >= 10 && h < 18 ? 1 : 0));
  const s = strip(day, [3, 10]);
  assert.equal(s.length, 24);
  assert.deepEqual(s.map((h, i) => (h.q ? i : -1)).filter((i) => i >= 0), [3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(strip(day, [22, 4]).map((h, i) => (h.q ? i : -1)).filter((i) => i >= 0), [0, 1, 2, 3, 22, 23]);
  assert.match(dayLine(day, [3, 10]), /^Most awake .* · quiet 3–10am$/);
  // a kept record's 23-hour run is said as no quiet part at all: never "quiet 2–1pm" (#1784)
  const one = Array(24).fill(0); one[13] = 40;
  assert.equal(dayLine(one, [14, 13]), "Most awake 10am–2pm");
  assert.ok(!strip(one, [14, 13]).some((h) => h.q), "nothing hatched either");
});

test("Open Sol's setup: a dropped place and its level left out, the dial as the person left it", () => {
  for (const k of PANEL_KEYS) {
    const y = PANEL[k].you;
    const place = y.setup.find((s) => s.kind === "place") as { id: string } | undefined;
    if (!place) continue;
    const out = setupOf(y, new Set([place.id]), {});
    assert.ok(!out.some((s) => (s.kind === "place" && s.id === place.id) || (s.kind === "level" && s.place === place.id)), k);
    const lv = y.setup.find((s) => s.kind === "level") as { place: string } | undefined;
    if (lv) {
      const moved = setupOf(y, new Set(), { [lv.place]: "do" }).find((s) => s.kind === "level" && s.place === lv.place) as { level: string; label: string };
      assert.equal(moved.level, "do");
      assert.ok(moved.label.endsWith(DIAL[2].w));
    }
  }
});

test("AIs, skills and tools: each its own group in words, from a row's more or an older item; a skill's id made plain", () => {
  const r = ([
    { kind: "item", source: "claude-sessions", item: "skill review, used 10 times" },
    { kind: "item", source: "claude-sessions", item: "github, used 4 times" },
    { kind: "item", source: "claude-sessions", item: "grilling, used 3 times", more: { kind: "skill", name: "someones-skills:grilling", adds: "x" } },
    { kind: "item", source: "codex-sessions", item: "linear", more: { kind: "tool", name: "linear", adds: "x" } },
    { kind: "item", source: "browser", item: "Safari: 4 sites, used daily" },
  ] as Ev[]).reduce(fold, reading0());
  assert.deepEqual(toolsOf(r, ["Claude Code", "Claude Code"]), { ais: ["Claude Code"], skills: ["review", "grilling"], tools: ["github", "linear"] });
  assert.equal(plainSkill("a-b:test_driven-dev"), "test driven dev");
  assert.equal(listW(["a", "b", "c"], (x, n) => `${x} and ${n} more`), "a, b, c");
  assert.equal(listW(["a", "b", "c", "d", "e", "f"], (x, n) => `${x} and ${n} more`), "a, b, c, d and 2 more");
  const now = Date.parse("2026-11-22T12:00:00Z");
  assert.deepEqual(["2026-11-22T08:00:00Z", "2026-11-21T08:00:00Z", "2026-11-17T08:00:00Z", "2026-10-25T08:00:00Z", "2026-08-01T08:00:00Z", undefined].map((x) => ago(x, false, now)),
    ["today", "yesterday", "5 days ago", "4 weeks ago", "4 months ago", ""]);
});

test("a read row keeps what it took (its more) for opening, and a thrown row keeps its bin and count, never a name", () => {
  const more = { kind: "folder" as const, name: "shop", adds: "A place for shop on your canvas", is: "a code project", sessions: { claude: 4 } };
  const r = ([
    { kind: "item", source: "claude-sessions", item: "folder shop · 4 sessions", notice: "a code project", more },
    { kind: "thrown", source: "files", item: "3 thrown away: money", bin: "money", n: 3 },
  ] as Ev[]).reduce(fold, reading0());
  assert.deepEqual(r.lines[1].more, more);
  assert.deepEqual([r.lines[0].bin, r.lines[0].binK, r.lines[0].count, r.lines[0].from], [true, "money", 3, "files"]);
  assert.equal(binWord("keys"), "passwords or keys");
});

test("pressed through on a panel engine: Bring → the read → the picture → Open Sol, the felt times kept; nothing asks what Sol is for", async () => {
  for (const k of ["dev", "minji"] as const) {
    const p = PANEL[k];
    Y.start(panelPort(p, 50), { name: p.name, ko: p.lang === "ko" });
    await wait(60);
    assert.ok(Y.get().suggest && Y.get().accounts && Y.get().perms, `${k}: the shelves' answers came`);
    assert.equal(Y.get().step, 1, `${k}: the screens start at Bring (the purpose step is parked)`);
    assert.ok(Y.get().ticked.length > 0, `${k}: pre-ticked`);
    Y.bring();
    assert.equal(Y.get().step, 2);
    await wait(400);
    const s = Y.get();
    assert.equal(s.running, false, `${k}: the read is over`);
    assert.ok(s.you && s.read.lines.length > 0);
    assert.ok(s.felt.first != null && s.felt.picture != null && s.felt.first <= s.felt.picture, `${k}: felt ${JSON.stringify(s.felt)}`);
    Y.go(3);
    Y.open();
    await wait(30);
    assert.equal(Y.get().step, 4, `${k}: Sol opens`);
    assert.ok((Y.get().applied?.items.length ?? 0) > 0);
    const first = Y.get().applied!.items[0].i;
    Y.back(first);
    await wait(20);
    assert.ok(Y.get().applied!.back.includes(first), `${k}: Back per item`);
    Y.stop();
  }
});

test("I'll tell Sol myself reads nothing and the picture comes from what was said", async () => {
  const p = PANEL.denise, sent: string[] = [];
  const port = panelPort(p, 50), spy = { ...port, send: (m: { type?: string; by?: unknown }) => { sent.push(`${m.type}${m.by ? ":" + m.by : ""}`); port.send(m); } };
  Y.start(spy, { name: p.name });
  tellMyself();
  await wait(80);
  assert.ok(sent.includes("next.you.read:none"));
  assert.equal(Y.get().step, 2);
  assert.ok(Y.get().you);
  Y.stop();
});

test("the meta is blind: the panel and the screens carry no one's own name, path or home", () => {
  const dir = new URL("./next/movein/you/", import.meta.url);
  for (const f of ["fixture.ts", "model.ts", "store.ts", "You.tsx", "strings.ts", "mac.ts", "mount.ts", "lens-state.ts", "Lens.tsx", "circle-state.ts", "Circle.tsx", "Claude.tsx"]) {
    const t = readFileSync(new URL(f, dir), "utf8").replaceAll("marcocyl04-ux's agent", "");   // the signature is not data
    assert.doesNotMatch(t, /\/Users\/|\/home\/[a-z]|marco|~\//i, f);
  }
});

test("screen 4 folds the places under 1% into one row, keeps a place with a question, and still sets them all up", () => {
  const base = PANEL.dev.you, part = base.parts[0];
  const tiny = (id: string, share: number) => ({ ...part, id, name: id, share });
  const you = { ...base, parts: [part, tiny("a", 0.004), tiny("b", 0), tiny("c", 0.009)], questions: [{ q: "Still yours?", at: 3, kind: "check" as const }],
    setup: [...base.setup, ...["a", "b"].map((id) => ({ kind: "place" as const, id, name: id, label: `Place: ${id}` }))] };
  const { shown, small } = placesOf(you, new Set(), false);
  assert.deepEqual(small.map((r) => r.part.id), ["a", "b"]);
  assert.deepEqual(shown.map((r) => r.part.id), [part.id, "c"], "a place with a question stays in sight");
  assert.equal(placesOf({ ...you, parts: you.parts.slice(1, 3), questions: [] }, new Set(), false).small.length, 0, "all small: none folded");
  assert.equal(placesOf(you, new Set(), true).shown.length, 4, "and N more opens them all");
  const ids = setupOf(you, new Set(), {}).filter((x) => x.kind === "place").map((x) => (x as { id: string }).id);
  assert.ok(["a", "b"].every((x) => ids.includes(x)), "folded is only drawn so");
});

/** a port the test answers by hand: what the face sends is kept, what the engine says is pushed */
function handPort() {
  const sent: Record<string, unknown>[] = [], subs = new Set<(m: Record<string, unknown>) => void>();
  return { sent, say: (m: Record<string, unknown>) => { for (const f of [...subs]) f(m); },
    port: { live: true, send: (m: Record<string, unknown>) => { sent.push(m); }, subscribe: (f: (m: Record<string, unknown>) => void) => { subs.add(f); return () => { subs.delete(f); }; } } };
}

test("BR1 conform #14: the AIs asked and no answer: said after 15 s or at a refusal, with Ask again; an answer clears it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = handPort();
  Y.start(h.port, {});
  assert.equal(h.sent.filter((m) => m.type === "next.you.accounts").length, 1);
  assert.equal(Y.get().accountsNo, false, "asking");
  t.mock.timers.tick(Y.ACCOUNTS_MS - 1);
  assert.equal(Y.get().accountsNo, false);
  t.mock.timers.tick(1);
  assert.equal(Y.get().accountsNo, true, "no answer in 15 s: said");
  Y.askAccounts();
  assert.equal(Y.get().accountsNo, false, "Ask again: asking again");
  assert.equal(h.sent.filter((m) => m.type === "next.you.accounts").length, 2);
  h.say({ type: "next.refused", asked: "next.you.accounts", why: "not here" });
  assert.equal(Y.get().accountsNo, true, "a refusal: said at once");
  assert.equal(Y.get().said, "", "and not as the screen's own line");
  Y.askAccounts();
  h.say({ type: "next.you.accounts", ok: true, ais: [], connectors: [] });
  t.mock.timers.tick(Y.ACCOUNTS_MS);
  assert.ok(Y.get().accounts && !Y.get().accountsNo, "answered: the timer says nothing");
  Y.stop();
  const src = readFileSync(new URL("./next/movein/you/You.tsx", import.meta.url), "utf8");
  assert.match(src, /<Asking s=\{s\} what="which AIs are signed in" \/>/);
  assert.match(src, /<Asking s=\{s\} what="which connectors you have" \/>/, "the Connectors card is never empty while asking");
});

test("a question is sent as next.you.answer with its key; the picture comes from the reply, never the press", () => {
  const h = handPort(), base = PANEL.dev.you, at = base.parts.length - 1, id = base.parts[at].id;
  const you = { ...base, questions: [{ q: "Still yours?", at, kind: "check" as const, k: `done:${id}` }, { q: "Add it?", at: null, kind: "drift" as const, aim: "Music", k: "drift:Music" }] };
  Y.start(h.port, {});
  h.say({ type: "next.you", you });
  Y.answer(0, "Yes", true);
  assert.deepEqual(h.sent.at(-1), { type: "next.you.answer", k: `done:${id}`, yes: true });
  assert.deepEqual(Y.get().asking, [`done:${id}`]);
  assert.deepEqual(Y.get().answered, {}, "nothing kept from the press");
  h.say({ type: "next.you", ok: false, why: "that question is not asked now" });
  assert.deepEqual(Y.get().asking, [], "a no brings the buttons back");
  assert.equal(Y.get().said, "", "and says no error");
  Y.answer(1, "Add it", true);
  assert.deepEqual(h.sent.at(-1), { type: "next.you.answer", k: "drift:Music", yes: true }, "a drift too, by its key");
  h.say({ type: "next.you", ok: true, you: { ...you, questions: [you.questions[0]] } });
  assert.deepEqual(Y.get().asking, [], "the question left with the reply");
  Y.stop();
});

test("the panel answers as the engine: done yes takes the place out of the picture and the setup; stop with no read is a quiet no", async () => {
  const p = PANEL.dev, k = p.you.questions.find((q) => q.k?.startsWith("done:"))!.k!, id = k.slice(5);
  Y.start(panelPort(p, 50), { name: p.name });
  await wait(40);
  Y.answer(p.you.questions.findIndex((q) => q.k === k), "Yes", true);
  await wait(40);
  assert.ok(!Y.get().you!.parts.some((x) => x.id === id));
  assert.ok(!Y.get().you!.questions.some((q) => q.k === k));
  Y.stopRead();
  await wait(40);
  assert.equal(Y.get().stopping, false);
  assert.equal(Y.get().said, "");
  Y.stop();
});

test("Read this again: the row read again takes its own place (its n, so it stays open); a refusal shows the engine's why", async () => {
  const p = PANEL.rio, row = p.reading.find((e) => e.kind === "item" && !!e.open) as Extract<Ev, { kind: "item" }>;
  const r0 = p.reading.reduce(fold, reading0()), at = r0.lines.findIndex((l) => l.item === row.item);
  const r1 = fold(r0, { ...row, notice: "read again", again: row.item });
  assert.equal(r1.lines.length, r0.lines.length, "no second row");
  assert.equal(r1.lines[at].n, r0.lines[at].n, "same row, same n");
  assert.equal(r1.lines[at].notice, "read again");
  Y.start(panelPort(p, 50), { name: p.name });
  await wait(40);
  Y.readAgain("claude-sessions" as Source, "Old notes");
  await wait(40);
  assert.equal(Y.get().said, "Sol did not read Old notes last time: Look again reads it", "the engine's why, as sent");
  assert.equal(Y.get().running, false, "the refusal starts no read");
  Y.stop();
});

test("after I did it, a switch still off keeps the guide up and says so; on closes it", () => {
  const h = handPort(), perm = { id: "calendar", name: "Calendars", why: "", link: "settings:calendar", granted: false };
  Y.start(h.port, {});
  h.say({ type: "next.you.perms", perms: [perm] });
  Y.guide(perm); Y.guideDone();
  assert.equal(Y.get().guideCheck, "checking");
  assert.equal(h.sent.at(-1)!.type, "next.you.perms");
  h.say({ type: "next.you.perms", perms: [perm] });
  assert.equal(Y.get().guideCheck, "off");
  assert.equal(Y.get().guide?.id, "calendar", "never a dead end: the guide stays, the pane offered again");
  Y.guide(perm);
  assert.equal(Y.get().guideCheck, "idle");
  Y.guideDone();
  h.say({ type: "next.you.perms", perms: [{ ...perm, granted: true }] });
  assert.equal(Y.get().guide, null);
  Y.stop();
});

test("after I did it, Sol.app asks the Mac again, never the answer it kept, and the guide promises nothing it can't (sweep 1)", async () => {
  const h = handPort(), perm = { id: "full-disk", name: "Full Disk Access", why: "", link: "settings:fda", granted: false }, asked: unknown[] = [];
  Y.setHooks({ known: async (fresh?: boolean) => { asked.push(fresh); return { "full-disk": true }; } });
  Y.start(h.port, {});
  h.say({ type: "next.you.perms", perms: [perm] });
  Y.guide(perm); Y.guideDone();
  await new Promise((r) => setTimeout(r, 0));
  Y.setHooks({});
  assert.deepEqual(asked, [true], "fresh");
  assert.deepEqual(h.sent.at(-1)!.known, { "full-disk": true }, "the fresh answer goes to the engine");
  const mac = readFileSync(new URL("./next/movein/you/mac.ts", import.meta.url), "utf8");
  assert.match(mac, /if \(fresh \|\| fullDisk == null\) fullDisk = /, "the kept Full Disk Access answer is dropped on a fresh ask");
  assert.doesNotMatch(EN.mx3, /at once/, "never 'Sol sees it at once'");
  assert.match(EN.mx3, /I did it/);
  Y.stop();
});

test("in Sol.app a connector's Connect opens its page in the browser through the opener plugin, never in Sol's own window (sweep 2)", () => {
  const mac = readFileSync(new URL("./next/movein/you/mac.ts", import.meta.url), "utf8");
  assert.match(mac, /const openOut = \(url: string\) => \{ import\("@tauri-apps\/plugin-opener"\)\.then\(\(o\) => o\.openUrl\(url\)\)/, "the opener plugin, as Sol's other outside links");
  assert.match(mac, /\n\s+connect: openOut,/, "macHooks gives connect");
  const opened: string[] = [];
  Y.setHooks({ connect: (at) => { opened.push(at); } });
  const was = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => { throw new Error("window.open in Sol.app"); }, addEventListener: () => {} } });
  try { Y.connect("https://claude.ai/settings/connectors"); }
  finally { Object.defineProperty(globalThis, "window", { configurable: true, value: was }); Y.setHooks({}); }
  assert.deepEqual(opened, ["https://claude.ai/settings/connectors"], "the hook, never window.open");
});

test("after I did it, a switch nobody here can see (granted null) is never still off: it says Sol can't tell, Got it moves on (walk note w1)", () => {
  const h = handPort(), fda = { id: "full-disk", name: "Full Disk Access", why: "", link: "settings:fda", granted: null }, cal = { id: "calendar", name: "Calendars", why: "", link: "settings:calendar", granted: false };
  Y.start(h.port, {});
  h.say({ type: "next.you.perms", perms: [fda, cal] });
  Y.guideAll([fda, cal]); Y.guideDone();
  h.say({ type: "next.you.perms", perms: [fda, cal] });
  assert.equal(Y.get().guideCheck, "cant");
  assert.equal(Y.get().guide?.id, "full-disk");
  Y.guideOn();
  assert.equal(Y.get().guide?.id, "calendar", "the person's word stands; the next switch lined up");
  assert.equal(Y.get().guideCheck, "idle");
  Y.guideDone();
  h.say({ type: "next.you.perms", ok: false });
  assert.equal(Y.get().guideCheck, "cant", "no answer is not off");
  Y.stop();
});

test("stopped:the sources not finished come back marked stopped, the done ones stay done", () => {
  const h = handPort(), base = PANEL.dev.you;
  Y.start(h.port, {});
  Y.seed((s) => ({ ...s, step: 2, running: true, read: { ...reading0(), sources: { files: { state: "done", line: "" }, notes: { state: "reading", line: "" } } } }));
  Y.stopRead();
  assert.equal(h.sent.at(-1)!.type, "next.you.stop");
  h.say({ type: "next.you", you: { ...base, read: { ...base.read, stopped: ["files", "notes"] } } });
  assert.equal(Y.get().step, 3);
  assert.equal(Y.get().read.sources.files?.state, "done");
  assert.equal(Y.get().read.sources.notes?.state, "stopped");
  Y.stop();
});

// ---- Settings › You as cards on the canvas (lens.ts, Lens.tsx)

test("the places: the ones under 1% behind and N more, every place either shown or folded, the dropped ones out", () => {
  for (const k of PANEL_KEYS) {
    const y = PANEL[k].you, { shown, small } = placesOf(y, new Set(), false);
    assert.equal(shown.length + small.length, y.parts.length, `${k}: each place once`);
    assert.ok(small.every((r) => r.part.share < 0.01), `${k}: only a place under 1% folds`);
    assert.equal(placesOf(y, new Set(), true).shown.length, y.parts.length, `${k}: and N more opens them all`);
    if (y.parts.length) assert.ok(!placesOf(y, new Set([y.parts[0].id]), true).shown.some((r) => r.part.id === y.parts[0].id), `${k}: × takes it out`);
  }
});

test("BR1 rapid ruling: places with no share (no chats read) are drawn equal and whole, none folded, none saying a share; with a share, as before", () => {
  const base = PANEL.dev.you, part = base.parts[0];
  const none = { ...base, parts: ["a", "b", "c", "d"].map((id) => ({ ...part, id, name: id, share: null, main: false })), questions: [] };
  assert.equal(placesOf(none, new Set(), false).small.length, 0, "no share is not 'under 1%'");
  const pic = circleOf(none, { w: 560, h: 420, outside: true });
  assert.deepEqual(pic.discs.map((d) => d.share), [null, null, null, null]);
  assert.ok(pic.discs.every((d) => !d.small && d.r === pic.discs[0].r), "equal discs, each a whole card");
  assert.ok(ofPart(none.parts[0]).every((k) => !/of your time/.test(k.fact)), "no known line of a share");
  const some = ofPart({ ...part, share: 0.25 }).find((k) => /of your time/.test(k.fact));
  assert.equal(some?.fact, "25% of your time", "a place with a share says it as before");
});

test("Taking shape: the circle forms from the read's places, each a disc by its share, no facts and no Claude yet", () => {
  const places = [{ id: "w:/x/band", name: "band", colour: "coral", share: 0.5 }, { id: "w:/x/shop", name: "shop", colour: "sky", share: 0.3 }, { id: "w:/x/tiny", name: "tiny", colour: "sky", share: 0.004 }];
  const pic = circleOf(forming(places), { w: 272, h: 292, outside: false, facts: false });
  assert.equal(pic.claude, null, "no Claude box in the read's column");
  assert.ok(pic.w <= 272 && pic.cx + pic.R <= pic.w, "the Mac inside the column");
  assert.deepEqual(pic.discs.map((d) => d.id), ["w:/x/band", "w:/x/shop"], "biggest first; under 1% folded as on screen 4");
  assert.ok(pic.discs[0].r > pic.discs[1].r, "a bigger share, a bigger disc");
  assert.equal(pic.chips.length, 0, "no facts while it is read");
  assert.equal(circleOf(forming([]), { w: 272, h: 292, outside: false, facts: false }).discs.length, 0, "nothing found yet: an empty Mac");
});

test("Settings › You: every fact says where it came from, and nothing is said that the place does not carry", () => {
  for (const k of PANEL_KEYS) for (const p of PANEL[k].you.parts) {
    const fs = ofPart(p);
    for (const f of fs) { assert.ok(f.fact.trim(), `${k}/${p.name}: a fact has words`); assert.ok(f.source.trim(), `${k}/${p.name}: ${f.fact} has a source`); }
    if (p.tools.length) assert.ok(fs.some((f) => f.fact.includes(p.tools[0])), `${k}/${p.name}: its tools`);
    assert.equal(fs.some((f) => /told Sol/.test(f.fact)), p.facts > 0, `${k}/${p.name}: what you told Sol, only when there is some`);
    assert.equal(fs.some((f) => /^Quiet lately$/.test(f.fact)), p.faded, `${k}/${p.name}: quiet only when faded`);
    const who = aisOf(p);
    assert.equal(who.includes("Claude Code"), p.from.includes("claude-sessions"), `${k}/${p.name}: Claude Code from its sessions`);
    if (!p.ais && !p.from.some((f) => f.endsWith("-sessions"))) assert.equal(who.length, 0, `${k}/${p.name}: no AI yet`);
  }
  const bare = { ...PANEL.dev.you.parts[0], tools: [], ais: 0, from: [], at: Array(24).fill(0), share: 0, facts: 0, faded: false, new: false, main: false };
  assert.deepEqual(ofPart(bare), [], "a place Sol knows nothing of says nothing (the card says Sol learns as you go)");
});

test("Settings › You: the engine's own facts of a place come first, each forgettable; a tool named like an id is not said", () => {
  const p0 = PANEL.dev.you.parts[0];
  const knows = [{ k: `tool:${p0.id}:Figma`, fact: "Uses Figma here", source: "Claude Code sessions", by: "read" as const },
    { k: `tool:${p0.id}:mcp_thing_x`, fact: "Uses mcp_thing_x here", source: "Claude Code sessions", by: "read" as const },
    { k: "fact:7", fact: "Launch is on the 5th", source: "you said", by: "person" as const, stale: true as const }];
  const fs = ofPart({ ...p0, tools: ["Figma", "mcp_thing_x"], facts: 1, knows });
  assert.deepEqual(fs.slice(0, 2).map((f) => [f.fact, f.source, f.k, f.stale]), [["Uses Figma here", "Claude Code sessions", knows[0].k, undefined], ["Launch is on the 5th", "you said", "fact:7", true]]);
  assert.ok(!fs.some((f) => f.fact.includes("_")), "an id-like tool is not said");
  assert.ok(!fs.some((f) => /told Sol/.test(f.fact)), "the told facts are listed, not counted");
  assert.ok(fs.slice(2).every((f) => !forgettable(f.k)), "what the fields say has no ×");
  const old = ofPart({ ...p0, tools: ["Figma", "ccd_turn"], knows: undefined });
  assert.ok(old.some((f) => f.fact.includes("Figma")) && !old.some((f) => f.fact.includes("ccd_turn")), "no knows: the tools said, the id-like one left out");
});

test("Settings › You: a place's hours in a word, and what may leave the Mac by its dial", () => {
  const at = (hs: number[]) => Array.from({ length: 24 }, (_, h) => (hs.includes(h) ? 5 : 0));
  assert.equal(hoursWord(at([19, 20, 21])), "evenings");
  assert.equal(hoursWord(at([23, 0, 1, 2])), "nights");
  assert.equal(hoursWord(at([8, 13, 19, 23])), "any time");
  assert.equal(hoursWord(Array(24).fill(0)), "", "no hours: none said");
  assert.equal(leaves("do"), "asks you first");
  for (const l of ["record", "draft", "show", null] as const) assert.equal(leaves(l), "never");
});

test("Settings › You: a place finds its own folder by id, path or name, and none when the canvas has none", () => {
  const regions = [{ id: "w:/work/shop", name: "shop", path: "/work/shop" }, { id: "h:notes", name: "Notes" }, { id: "area-1", name: "Garden" }];
  assert.equal(regionOf({ id: "/work/shop", name: "Shop app" }, regions), "w:/work/shop");
  assert.equal(regionOf({ id: "notes", name: "x" }, regions), "h:notes");
  assert.equal(regionOf({ id: "area-1", name: "x" }, regions), "area-1");
  assert.equal(regionOf({ id: "/elsewhere", name: "garden" }, regions), "area-1", "by name, any case");
  assert.equal(regionOf({ id: "/elsewhere", name: "Pond" }, regions), null);
});

test("How Sol sees you: the circle beside the card fits its room for every panel person, places and chips clear, same every time", () => {
  const over = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const w of [480, 560, 660]) for (const k of PANEL_KEYS) for (const more of [false, true]) {
    const y = PANEL[k].you, o = { w, h: 500, outside: false, more }, pic = fitOf(y, o), at = `${k} ${w}${more ? " more" : ""}`;
    assert.ok(pic.fits, `${at}: it fits (the room grows down, never wider)`);
    assert.deepEqual(fitOf(y, o), pic, `${at}: the same every time`);
    assert.equal(pic.claude, null, `${at}: no Claude box beside the card`);
    assert.ok(pic.w <= w && pic.h >= 500, `${at}: as wide as its room, at least as tall`);
    assert.equal(pic.discs.length, placesOf(y, new Set(), more).shown.length, `${at}: a disc for each place kept`);
    for (const d of pic.discs) assert.ok(Math.hypot(d.x - pic.cx, d.y - pic.cy) + d.r <= pic.R, `${at}: ${d.name} inside the Mac`);
    for (const a of pic.discs) for (const b of pic.discs) if (a !== b) assert.ok(!over(a.box, b.box), `${at}: ${a.name} clear of ${b.name}`);
    const boxes = pic.chips.map((c) => ({ id: c.id, x: c.x - c.wd / 2, y: c.y - 11, w: c.wd, h: 22 }));
    for (const a of boxes) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= pic.w && a.y + a.h <= pic.h, `${at}: ${a.id} in the room`);
      for (const b of boxes) if (a !== b) assert.ok(!over(a, b), `${at}: ${a.id} clear of ${b.id}`);
    }
  }
  const y = PANEL.dev.you, gone = new Set([y.parts[0].id]), pic = fitOf(y, { w: 560, h: 500, outside: false, dropped: gone });
  assert.ok(!pic.discs.some((d) => gone.has(d.id)), "a place taken out leaves the circle");
});

test("Taking shape: at any height of the read's column the forming circle stays inside it, discs clear, same every time", () => {
  const over = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const h of [268, 300, 341, 420]) for (const k of PANEL_KEYS) {
    const places = PANEL[k].you.parts.map((p) => ({ id: p.id, name: p.name, colour: "sky", share: p.share }));
    const o = { w: 338, h, outside: false, facts: false }, pic = circleOf(forming(places), o), at = `${k} 338×${h}`;
    assert.ok(pic.fits, `${at}: it fits`);
    assert.deepEqual(circleOf(forming(places), o), pic, `${at}: the same every time`);
    assert.ok(pic.w <= 338 && pic.h <= h, `${at}: inside the column`);
    assert.equal(pic.claude, null, `${at}: no Claude box`);
    assert.equal(pic.chips.length, 0, `${at}: no facts while it is read`);
    assert.equal(pic.discs.length, placesOf(forming(places), new Set(), false).shown.length, `${at}: under 1% folded as on screen 4`);
    for (const d of pic.discs) assert.ok(Math.hypot(d.x - pic.cx, d.y - pic.cy) + d.r <= pic.R, `${at}: ${d.name} inside the Mac`);
    for (const a of pic.discs) for (const b of pic.discs) if (a !== b) assert.ok(!over(a.box, b.box), `${at}: ${a.name} clear of ${b.name}`);
    for (const a of pic.discs) for (const b of pic.discs) if (a.share > b.share && !a.small && !b.small) assert.ok(a.r >= b.r, `${at}: ${a.name}'s bigger share, a disc as big or bigger`);
  }
});

test("Settings › You: a bin kept goes to the engine and the panel shows what the engine kept; nothing writes an aim", async () => {
  const p = PANEL.dev;
  Y.watch(panelPort(p, 50), { name: p.name });
  await wait(30);
  assert.ok(Y.get().you, "the picture is asked");
  assert.equal(Y.get().step, 3);
  assert.equal("addAim" in Y || "hereFor" in Y, false, "no press writes what the person is here for");
  const was = Y.get().you!.sieve.keep.includes("health");
  Y.keepBin("health");
  await wait(30);
  assert.equal(Y.get().you!.sieve.keep.includes("health"), !was);
  Y.keepBin("health");
  await wait(30);
  assert.equal(Y.get().you!.sieve.keep.includes("health"), was, "pressed twice: as it was");
  Y.stop();
});

test("Settings › You: × forgets one fact and Back brings a told one back; how Sol talks is picked and given back", async () => {
  const d = PANEL.dev, p0 = d.you.parts[0];
  const knows = [{ k: `tool:${p0.id}:Figma`, fact: "Uses Figma here", source: "Claude Code sessions", by: "read" as const },
    { k: "fact:7", fact: "Launch is on the 5th", source: "you said", by: "person" as const }];
  const you = { ...d.you, parts: [{ ...p0, tools: [...p0.tools, "Figma"], knows }, ...d.you.parts.slice(1)], talk: { style: "explained" as const, by: "read" as const, why: "Your Claude Code is set to Explanatory" } };
  Y.watch(panelPort({ ...d, you }, 50), { name: d.name });
  await wait(30);
  const part = () => Y.get().you!.parts.find((x) => x.id === p0.id)!;
  Y.forget("fact:7", "Launch is on the 5th");
  assert.deepEqual(Y.get().forgot, { k: "fact:7", fact: "Launch is on the 5th", back: false }, "the banner has it at once");
  await wait(30);
  assert.ok(!part().knows!.some((f) => f.k === "fact:7"), "out of the card");
  Y.unforget();
  await wait(30);
  assert.ok(part().knows!.some((f) => f.k === "fact:7"), "a told fact is back now");
  assert.equal(Y.get().forgot!.back, true);
  Y.forget(knows[0].k, knows[0].fact);
  await wait(30);
  assert.ok(!part().knows!.some((f) => f.k === knows[0].k) && !part().tools.includes("Figma"), "a read fact leaves the place and its tools");
  Y.forget("fact:nothing", "No such thing");
  await wait(40);
  assert.equal(Y.get().forgot, null, "a key the engine does not know: quiet, the banner clears");
  assert.equal(Y.get().said, "", "and no error text");
  Y.talk("brief");
  assert.equal(Y.get().you!.talk!.style, "brief", "picked at once");
  await wait(30);
  assert.deepEqual(Y.get().you!.talk, { style: "brief", by: "you", why: null });
  Y.talk(null);
  await wait(30);
  assert.notEqual(Y.get().you!.talk!.by, "you", "given back");
  Y.stop();
});

test("the circle draws a thread only for a picked place or fact, never at rest, so no thread runs over another place's words (#1787)", () => {
  const circle = readFileSync(new URL("./next/movein/you/Circle.tsx", import.meta.url), "utf8");
  assert.match(circle, /\{chipSel \|\| placeSel \? pic\.threads\.map\(/, "nothing picked: no threads");
  assert.match(circle, /return lit\(c\.place, c\.id\) \? <path /, "picked: only the picked one's threads");
  assert.equal(circle.match(/pic\.threads/g)?.length, 1, "no other place draws them");
});

test("the circle: every place inside the Mac, no chip on another, every thread ends on its source's dot, same every time", () => {
  const over = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [w, h] of [[840, 760], [1900, 1300], [720, 640]]) for (const k of PANEL_KEYS) for (const more of [false, true]) {
    const y = PANEL[k].you, pic = circleOf(y, { w, h, more }), at = `${k} ${w}×${h}${more ? " more" : ""}`;
    assert.ok(pic.fits, `${at}: it fits`);
    assert.deepEqual(circleOf(y, { w, h, more }), pic, `${at}: the same every time`);
    assert.equal(pic.discs.length, placesOf(y, new Set(), more).shown.length, `${at}: a disc for each place screen 4 keeps`);
    for (const d of pic.discs) assert.ok(Math.hypot(d.x - pic.cx, d.y - pic.cy) + d.r <= pic.R, `${at}: ${d.name} inside the Mac`);
    const boxes = pic.chips.map((c) => ({ id: c.id, x: c.x - c.wd / 2, y: c.y - 11, w: c.wd, h: 22 }));
    for (const a of boxes) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= pic.w && a.y + a.h <= pic.h, `${at}: ${a.id} in the room`);
      for (const b of boxes) if (a !== b) assert.ok(!over(a, b), `${at}: ${a.id} clear of ${b.id}`);
    }
    for (const r of pic.rim) {
      const lw = KIND[r.kind].w.length * 6.3, lx = r.anchor === "end" ? r.lx - lw : r.anchor === "start" ? r.lx : r.lx - lw / 2;
      const words = { x: lx, y: r.ly - 11, w: lw, h: 14 }, dot = { x: r.x - 11, y: r.y - 11, w: 22, h: 22 };
      for (const d of pic.discs) assert.ok(!over(d.box, words) && !over(d.box, dot), `${at}: ${d.name} clear of ${KIND[r.kind].w}`);
    }
    for (const t of pic.threads) {
      const r = pic.rim.find((x) => x.kind === t.kind);
      assert.ok(r && t.d.endsWith(` ${r.x} ${r.y}`), `${at}: ${t.chip}'s thread ends on ${KIND[t.kind].w}`);
    }
    assert.equal(pic.threads.length, pic.chips.filter((c) => !c.more).length, `${at}: one thread per fact`);
    for (const c of pic.chips) assert.ok(!c.w.endsWith("…") && (c.more || c.place === null || c.w === c.full), `${at}: ${c.id} says all its words`);
    assert.ok(pic.claude && pic.claude.x > pic.cx + pic.R && pic.claude.x + pic.claude.w <= pic.w, `${at}: Claude outside the Mac, in the room`);
  }
  assert.equal(circleOf(null, { w: 840, h: 760 }).discs.length, 0, "no picture yet: an empty Mac");
});

test("the circle: nothing over text, a place's words as drawn are inside its own footprint, on a home of twelve places, seven under 1% (BR1 scope (d))", () => {
  // an invented home of the shape try 5 walked: one big place, a few small ones, seven kept folders with no time yet
  const part = (name: string, share: number, n: number) => ({ id: `/u/lucy/${name}`, name, share, tools: [], ais: 1, level: null, faded: false, new: false, at: [], from: ["claude-sessions"], facts: 0,
    knows: Array.from({ length: n }, (_, i) => ({ k: `fact:${name}${i}`, fact: `What Lucy said of ${name}, ${i}`, source: "you said", by: "person" as const })) });
  const y = { questions: [], parts: [part("garden", 0.85, 12), part("orders", 0.11, 5), part("taxes", 0.02, 4), part("mac", 0.01, 5), part("misc", 0.01, 3),
    ...["recipes", "is223", "law-project", "la245", "life", "cards", "World Building"].map((n) => part(n, 0, 0))] };
  const inside = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  for (const [w, h] of [[720, 640], [852, 734], [1800, 1500]]) for (const facts of [true, false]) {
    const pic = circleOf(y, { w, h, more: true, facts, outside: facts }), at = `${w}×${h}${facts ? "" : " forming"}`;
    assert.equal(pic.discs.length, 12, `${at}: all twelve drawn`);
    for (const d of pic.discs.filter((x) => x.small || (!facts && x.words === "under"))) {
      // as you.css draws them, measured in a browser: a small name 11px (5.6px a letter) in 2px 6px, 14px tall; a name alone 13px/16px
      const ww = d.small ? d.name.length * 6 + 12 : d.name.length * 8.2 + 12, wh = d.small ? 18 : 20;
      assert.ok(inside({ x: d.x - ww / 2, y: d.ly, w: ww, h: wh }, d.box), `${at}: ${d.name}'s words inside its own place`);
    }
  }
});

test("the circle: nine places with their facts never overlap, in the room at 1440 with Claude's box and at 1280 without it (BR1 conform row 8, walk 11)", () => {
  // an invented freelancer's home, Dev's: nine places of 21% down to 2%, six to nine facts each, the shape the panel home walked
  const part = (name: string, share: number, n: number) => ({ id: `/u/dev/${name}`, name, share, tools: [], ais: 2, level: null, faded: false, new: false, at: [], from: ["claude-sessions"], facts: 0,
    knows: Array.from({ length: n }, (_, i) => ({ k: `fact:${name}${i}`, fact: `What Dev said of ${name}, ${i}`, source: "you said", by: "person" as const })) });
  const y = { questions: [], parts: [part("newsletter", 0.21, 9), part("booking-app", 0.19, 7), part("orders-api", 0.18, 8), part("portfolio", 0.12, 7), part("brand-site", 0.11, 7),
    part("storefront", 0.09, 7), part("Cedar Studio", 0.05, 6), part("Birch & Co", 0.03, 6), part("Acme Corp", 0.02, 6)] };
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [w, h, outside] of [[852, 734, true], [852, 734, false], [720, 640, false], [1827, 1257, false]] as const) {
    const pic = circleOf(y, { w, h, outside }), at = `${w}×${h}${outside ? " with Claude's box" : ""}`;
    assert.ok(pic.fits, `${at}: it fits`);
    assert.equal(pic.discs.length, 9, `${at}: all nine drawn`);
    for (const [i, a] of pic.discs.entries()) for (const b of pic.discs.slice(i + 1)) assert.ok(!overlap(a.box, b.box), `${at}: ${a.name} clear of ${b.name}`);
  }
});

test("the circle: where Sol learned each fact, by who said it and, once the engine says, which source", () => {
  const p0 = PANEL.lucy.you.parts[0];
  const knows = [{ k: "fact:1", fact: "Rehearsal on Fridays", source: "you said", by: "person" as const },
    { k: "fact:2", fact: "Opens the Diary first", source: "Sol noticed", by: "sol" as const },
    { k: `tool:${p0.id}:Figma`, fact: "Uses Figma here", source: "Claude Code", by: "read" as const, from: "claude-sessions" as const },
    { k: `tool:${p0.id}:Numbers`, fact: "Uses Numbers here", source: "the read", by: "read" as const },
    { k: "fact:3", fact: "Exports to PDF", source: "Codex", by: "seat" as const }];
  const kinds = ofPart({ ...p0, knows }).slice(0, 5).map(kindOfKnown);
  assert.deepEqual(kinds, ["told", "noticed", "chats", "read", "learned"]);
});

test("the Claude switch: off until by says Claude, the person's press wins, the read sends what it says", () => {
  const h = handPort();
  Y.start(h.port, {});
  h.say({ type: "next.you.suggest", sources: ["notes"], order: ["notes"], because: null, by: "device", claudeAsk: "May Sol send Claude a short summary?" });
  assert.equal(Y.claudeOn(Y.get()), false, "by device: off");
  h.say({ type: "next.you.suggest", sources: ["notes"], order: ["notes"], because: null, by: "claude" });
  assert.equal(Y.claudeOn(Y.get()), true, "by claude: on");
  Y.claude(false);
  assert.equal(Y.claudeOn(Y.get()), false, "pressed off");
  assert.ok(!h.sent.some((m) => m.type === "next.you.claude"), "an engine that does not hold the switch is never asked");
  Y.bring();
  assert.equal(h.sent.find((m) => m.type === "next.you.read")?.by, "device", "the read sends the switch");
  Y.claude(true);
  Y.bring();
  assert.equal(h.sent.filter((m) => m.type === "next.you.read").at(-1)?.by, "claude");
  h.say({ type: "next.you", ok: true, you: { ...PANEL.dev.you, read: { ...PANEL.dev.you.read, claude: true } } });
  Y.claude(false);
  assert.deepEqual(h.sent.at(-1), { type: "next.you.claude", on: false }, "an engine that holds it is told");
  Y.stop();
});

// BR1 first-timer 06:48 (#1615): names were printed over their bubbles, half on the disc and half off. A place's words sit
// on its disc only where the disc is as wide as they are; else beside it or under it, never across its edge
test("How Sol sees you: no place's words cross its disc's edge, at any room, for every panel person", () => {
  const headW = (name: string) => Math.round(Math.max(name.length * 8.2, "100% of your time".length * 5.4, "● does it for you".length * 5.4) + 14);
  for (const [w, h] of [[840, 760], [1900, 1300], [720, 640], [1160, 594], [1700, 950]]) for (const k of PANEL_KEYS) {
    const pic = circleOf(PANEL[k].you, { w, h }), at = `${k} ${w}×${h}`;
    for (const d of pic.discs.filter((x) => !x.small)) {
      const hw = headW(d.name), tall = 46;
      if (d.words === "on") {
        // its words' top and bottom rows both inside the disc
        for (const y of [d.ly, d.ly + tall]) assert.ok(Math.hypot(hw / 2, y - d.y) <= d.r + 1, `${at}: ${d.name}'s words inside its disc`);
      } else if (d.words === "beside") {
        for (const c of pic.chips.filter((c) => c.place === d.id)) assert.ok(c.x - c.wd / 2 >= d.x + d.r, `${at}: ${d.name}'s ${c.w} right of its disc`);
      }
      else assert.ok(d.ly > d.y + d.r, `${at}: ${d.name}'s words under its disc`);
    }
  }
});

test("BR1 hold 2: a folder read by two AIs is one line with its one count, said as still rising until both are read", () => {
  const evs: Ev[] = [
    { kind: "order", order: ["claude-sessions", "codex-sessions"], because: null },
    { kind: "source", source: "claude-sessions", state: "reading", line: "Claude Code: reading" },
    { kind: "item", source: "claude-sessions", place: "/u/sol", item: "folder sol, from Claude Code", notice: "488 sessions", setup: "a place for sol" },
    { kind: "item", source: "claude-sessions", place: "/u/home", item: "folder home, from Claude Code", notice: "63 sessions", setup: "a place for home" },
    { kind: "source", source: "claude-sessions", state: "done", line: "Claude Code: 551 sessions in 2 folders" },
    { kind: "source", source: "codex-sessions", state: "reading", line: "Codex: reading" },
  ];
  let r = evs.reduce(fold, reading0());
  assert.ok(rising(r, r.lines[0]), "Codex is still to read: the count says it is rising");
  r = fold(r, { kind: "item", source: "codex-sessions", place: "/u/sol", item: "folder sol, from Claude Code and Codex", notice: "495 sessions", setup: "a place for sol" });
  assert.deepEqual(r.lines.filter((l) => l.place === "/u/sol").map((l) => l.notice), ["495 sessions"], "one line for sol, its one count");
  assert.equal(r.lines.length, 2, "no third line");
  r = fold(r, { kind: "source", source: "codex-sessions", state: "done", line: "Codex: 7 sessions in 1 folder" });
  assert.ok(!r.lines.some((l) => rising(r, l)), "both read: no count says it is still rising");
});

test("BR1 hold 1: Taking shape's count is the discs it draws, and its room is never shorter than the picture", () => {
  const places = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, name: `place ${i}`, share: i < 4 ? 0.22 : 0.01 / 13 }));
  const pic = circleOf(forming(places), { w: 272, h: 180, outside: false, facts: false });
  assert.equal(pic.discs.length, placesOf(forming(places), new Set(), false).shown.length, "the count says what is drawn");
  const css = readFileSync(new URL("./next/movein/you/known.css", import.meta.url), "utf8");
  const min = Number(/\.kn-forming \{[^}]*min-height: (\d+)px/.exec(css)?.[1] ?? 0);
  assert.ok(min >= pic.h, `the forming room (${min}px) holds the picture (${pic.h}px), so it covers no words under it`);
});
