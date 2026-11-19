// node --test src/*.test.ts: the one reader (#1217, onboard/explore.mjs): the AI tools' session files as a source,
// consented by name in the consent record (onboard/consent.ts), each fact with its source, the reading reported live,
// on a made-up person's home. (Home's tour, which took its places from it, went with #1223.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mayRead, withSource, consentIn, emptyConsent, type Consent } from "./onboard/consent.ts";
import { empty, recordOf } from "./onboard/record.ts";
import { sortAll, type Explored, type Found } from "./onboard/sort.ts";

const NOA = "Second year at Westbrook, design major. I freelance for two clients. Training for a half marathon. Don't read my messages.";
const MESSAGE_TEXT = "MESSAGE-TEXT-NEVER-READ";   // what people/seed.mjs writes into each session file's message
const here = new URL("./onboard/", import.meta.url).pathname;

/** Noa seeded once; each run of the explorer on her with the consent given */
const base = mkdtempSync(join(tmpdir(), "ob1-sources-"));
const home = join(base, "noa");
execFileSync(process.execPath, [join(here, "people/seed.mjs"), "noa", home]);
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
let runs = 0;
function explore(consent: Partial<Consent> | null, more: string[] = []): { x: Explored; text: string } {
  mkdirSync(join(home, ".sol", "record"), { recursive: true });
  const me = join(home, ".sol", "record", "me.json");
  if (consent) writeFileSync(me, JSON.stringify({ ...empty(), consent: { ...emptyConsent(), ...consent } }));
  else rmSync(me, { force: true });
  const out = join(base, `out-${++runs}.json`);
  execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", home, "--out", out, ...more]);
  const text = readFileSync(out, "utf8");
  return { x: JSON.parse(text) as Explored, text };
}
const sessions = (x: Explored) => x.stops.flatMap((s) => s.facts).filter((f) => f.kind === "session");
const ai = (x: Explored) => x.stops.find((s) => s.id === "ai")!;

test("sources: the AI tools' session files give what the person worked on, by folder, with titles and dates, each with its source; never a message's text", () => {
  const { x, text } = explore(null);
  const got = sessions(x);
  assert.deepEqual(got.map((f) => `${f.tool} ${f.v} ${f.n}`).sort(), ["Claude Code DES 210 1", "Claude Code portfolio 2", "Codex lumen-site 1"]);
  const portfolio = got.find((f) => f.v === "portfolio")!;
  assert.deepEqual([...portfolio.titles!].sort(), ["Portfolio case study layout", "Portfolio: about page"]);   // the person's own title and Claude's
  assert.equal(portfolio.src, "Claude Code: 2 sessions in ~/code/portfolio");
  assert.equal(got.find((f) => f.tool === "Codex")!.titles![0], "Lumen site nav fix");
  for (const f of got) { assert.ok(f.src && f.when && f.at, `${f.v} has its source and its date`); assert.ok(f.via); }
  assert.ok(!text.includes(MESSAGE_TEXT), "no message's text reaches the explorer's file");
  assert.ok(!text.includes("/elsewhere"), "a cwd inside a message is not taken for the session's folder");
  assert.match(ai(x).line, /4 sessions in 3 folders/);
  assert.ok(ai(x).read! >= 4, "the rows looked at are counted");
});

test("sources: a source the consent record says no to is never opened, and named as left unread, denied", () => {
  const { x } = explore({ sources: { "claude-sessions": "no" } });
  assert.deepEqual(sessions(x).map((f) => f.tool), ["Codex"]);
  assert.deepEqual(ai(x).skips!.filter((s) => s.why === "denied").map((s) => s.what), ["Claude Code's sessions"]);
  const both = explore({ sources: { "claude-sessions": "no", "codex-sessions": "no" } }).x;
  assert.equal(sessions(both).length, 0);
  // a stop left out in the record is skipped whole, whatever the face passed
  const left = explore({ left: ["ai"] }).x;
  assert.equal(ai(left).state, "skipped");
  assert.equal(sessions(left).length, 0);
  // but the stops the person chose in this very run win over an earlier run's (the onboarding passes --stops-said)
  assert.ok(sessions(explore({ left: ["ai"] }, ["--stops-said"]).x).length > 0);
  // --deny from the face is the same no
  assert.deepEqual(sessions(explore(null, ["--deny", "codex-sessions"]).x).map((f) => f.tool).sort(), ["Claude Code", "Claude Code"]);
});

test("sources: after \"only what I tell you\" a session list is read only on its own yes", () => {
  const careful = { agreed: { said: "only what I tell you" as const, at: "2026-11-15T09:00:00Z", by: "the one onboarding" } };
  assert.equal(sessions(explore(careful).x).length, 0);
  assert.deepEqual(sessions(explore({ ...careful, sources: { "codex-sessions": "yes" } }).x).map((f) => f.tool), ["Codex"]);
});

test("sources: the consent's rule, pure: a no is never read, careful reads only a yes; withSource writes it by name and keeps the rest", () => {
  assert.equal(mayRead(null, "claude-sessions"), true);
  assert.equal(mayRead({ ...emptyConsent(), sources: { "claude-sessions": "no" } }, "claude-sessions"), false);
  const careful = { ...emptyConsent(), agreed: { said: "only what I tell you" as const, at: "x", by: "y" } };
  assert.equal(mayRead(careful, "notes"), false);
  assert.equal(mayRead({ ...careful, sources: { notes: "yes" } }, "notes"), true);
  const rec = withSource({ ...empty(), consent: { ...emptyConsent(), off: ["messages"] } }, "codex-sessions", "no", "2026-11-15T10:00:00Z");
  const c = consentIn(rec);
  assert.deepEqual(c.sources, { "codex-sessions": "no" });
  assert.deepEqual(c.off, ["messages"]);
  assert.equal(c.at, "2026-11-15T10:00:00Z");
});

test("sources: sessions land in the person's folders: a class's by its code, the rest with her projects or her record", () => {
  const { x } = explore(null);
  const said = NOA + " Building my portfolio site on the side.";
  const s = sortAll(said, x);
  const where = (v: string) => s.place[sessions(x).find((f) => f.v === v)!.id];
  assert.equal(where("DES 210"), "westbrook");
  assert.equal(where("portfolio"), "projects");
  // the tool's own name is no clue (Claude Code is not "code" work): a session in the home folder stays with the person
  const athome: Found = { id: "h", k: "sessions", v: "your home folder", src: "Claude Code: 3 sessions in ~", kind: "session", sure: true, path: "~", titles: ["groceries list"] };
  assert.equal(sortAll(said, { v: 1, made: "", home: "", stops: [{ id: "ai", state: "done", line: "", facts: [athome] }] }).place.h, "you");
});

test("sources: ChatGPT is named, never \"none\": its history is reached by its export; the record keeps it apart from a signed-in tool", () => {
  mkdirSync(join(home, "Applications", "ChatGPT.app"), { recursive: true });
  try {
    const { x } = explore(null);
    const gpt = ai(x).facts.find((f) => f.v === "ChatGPT")!;
    assert.equal(gpt.reach, "export");
    assert.match(gpt.ask!, /export/);
    assert.ok(ai(x).skips!.some((s) => /ChatGPT/.test(s.what) && s.why === "unreachable"));
    const rec = recordOf("Noa", NOA, x.stops.flatMap((s) => s.facts), sortAll(NOA, x), [], []);
    assert.deepEqual(rec.ai.find((a) => a.name === "ChatGPT"), { name: "ChatGPT", signed: false, reach: "export" });
  } finally { rmSync(join(home, "Applications", "ChatGPT.app"), { recursive: true, force: true }); }
});

test("sources: what is connected keeps through what: the Claude account (as the engine lists it), Claude Code, Codex, gh", () => {
  const list = join(base, "connected.json");
  writeFileSync(list, JSON.stringify([{ name: "Gmail", status: "connected" }, { name: "Google Calendar", status: "connected" }, { name: "Slack", status: "needs-auth" }]));
  const { x } = explore(null, ["--connected", list]);
  const tools = x.stops.find((s) => s.id === "tools")!;
  const via = Object.fromEntries(tools.facts.map((f) => [f.v, f.via]));
  assert.equal(via.Gmail, "claude account");
  assert.equal(via["Google Calendar"], "claude account");
  assert.equal(via.figma, "claude code");
  assert.equal(via.GitHub, "gh");
  assert.equal(via.Slack, undefined);
  assert.ok(tools.skips!.some((s) => s.what.startsWith("Slack") && s.why === "unreachable"), "a connector that needs a sign-in is named, not dropped");
  const rec = recordOf("Noa", NOA, x.stops.flatMap((s) => s.facts), sortAll(NOA, x), [], []);
  assert.deepEqual(rec.connectors.find((c) => c.name === "Gmail"), { name: "Gmail", via: "claude account", src: "your Claude account" });
});

test("sources: every fact the explorer writes carries its source; a calendar's names its file and its count", () => {
  const { x } = explore(null);
  for (const f of x.stops.flatMap((s) => s.facts)) assert.ok(f.src && f.src.trim(), `${f.k} ${f.v} has a source`);
  const run = x.stops.flatMap((s) => s.facts).find((f) => f.v === "DES 210 Studio")!;
  assert.match(run.src, /westbrook\.ics/);
  assert.equal(run.n, 1);
  // the reading is written as it goes: every stop says what it looked at, and none is left "now" at the end
  for (const s of x.stops) { assert.notEqual(s.state, "now"); assert.equal(s.open, undefined); assert.ok(Array.isArray(s.skips)); }
  // a site that holds messages keeps no titles, and says so
  assert.ok(x.stops.find((s) => s.id === "browser")!.skips!.some((s) => /mail\.google\.com/.test(s.what) && s.why === "denied"));
});

test("only what is still on: an old term's calendar left in Downloads and a date long past are named as over, never read as the person's life", () => {
  const ics = join(home, "Downloads", "Fall 2025 calendar.ics");
  mkdirSync(join(home, "Downloads"), { recursive: true });
  writeFileSync(ics, ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:OLD 101", "DTSTART:20250902T090000", "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20251210T235959", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:Old party", "DTSTART:20250301T200000", "END:VEVENT", "END:VCALENDAR", ""].join("\n"));
  try {
    const { x } = explore(null);
    const cal = x.stops.find((s) => s.id === "calendar")!;
    const names = cal.facts.map((f) => f.v);
    assert.ok(!names.includes("OLD 101") && !names.includes("Old party"));
    assert.ok(names.includes("DES 210 Studio"), "this term's class is still read");
    assert.ok(cal.skips!.some((k) => /2 events already over/.test(k.what)));
  } finally { rmSync(ics, { force: true }); }
});
