// What Sol reads, by the person's word (#1656, src/reads.ts): set_reading exists only while reads.voice is on, writes the
// same "not here" Settings › home writes, only on the person's own words this turn; and the refusal (connectors.ts, read
// through consent.ts) stands whether the switch is on or off. A made-up person's home and settings file (temp folders).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

const DIR = mkdtempSync(join(tmpdir(), "sol-reads-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
process.env.SOL_VERSION = "complete";
delete process.env.SOL_READS_VOICE;
after(() => { delete process.env.SOL_READS_VOICE; delete process.env.SOL_VERSION; rmSync(DIR, { recursive: true, force: true }); });

const R = await import("../src/reads.ts");
const S = await import("../src/settings.ts");
const T = await import("../src/tools.ts");
const { connectorsGuard, servicesOff } = await import("../src/connectors.ts");

const home = join(DIR, "home"), REC = join(home, ".sol", "record", "me.json");
mkdirSync(join(home, ".sol", "record"), { recursive: true });
const record = { v: 1, solHome: "/x", areas: [{ id: "mail" }], consent: { v: 1, sources: { "claude-sessions": "yes" }, levels: { mail: "show" }, at: "2026-11-01T00:00:00Z" } };
writeFileSync(REC, JSON.stringify(record));
const onDisk = () => JSON.parse(readFileSync(REC, "utf8"));
const services = async () => ["Gmail", "Google Calendar"];
const run = (args: object, said: string) => R.runReadsTool("set_reading", args, { said }, { home, services });
const txt = (r: { content: { type: string; text?: string }[] }) => String(r.content[0]?.text ?? "");
const base: CanUseTool = async (_n, input) => ({ behavior: "allow", updatedInput: input });
const ask = (g: CanUseTool, name: string) => g(name, {}, { signal: new AbortController().signal, toolUseID: "t" } as Parameters<CanUseTool>[2]);

test("off (unset): set_reading is not offered, a call is refused, and the record is untouched", async () => {
  assert.equal(S.readsVoice(), false);
  assert.ok(!T.solToolsNow().some((t) => t.name === "set_reading"));
  const r = await run({ name: "Gmail", read: false, yes: "stop reading my Gmail" }, "stop reading my Gmail");
  assert.equal(r.isError, true);
  assert.deepEqual(onDisk(), record);
});

test("on (the setting or the env): offered; the person's words stop a service and the guard refuses it by name", async () => {
  S.patchSettings({ reads: { voice: true } });
  assert.equal(S.readsVoice(), true);
  assert.ok(T.solToolsNow().some((t) => t.name === "set_reading"));
  const r = await run({ name: "my gmail", read: false, yes: "stop reading my Gmail" }, "Please stop reading my Gmail.");
  assert.equal(r.isError, undefined, txt(r));
  const rec = onDisk();
  assert.equal(rec.consent.sources["account:Gmail"], "no");   // the account's own name, as Settings › home writes it
  assert.equal(rec.consent.sources["claude-sessions"], "yes");   // the rest of the record kept
  assert.deepEqual(rec.consent.levels, { mail: "show" });
  assert.deepEqual(rec.areas, record.areas);
  assert.notEqual(rec.consent.at, record.consent.at);
  const g = connectorsGuard(base, new Map(), servicesOff(home));
  assert.equal((await ask(g, "mcp__claude_ai_Gmail__list_threads")).behavior, "deny");
  assert.equal((await ask(g, "mcp__claude_ai_Google_Calendar__list_events")).behavior, "allow");
  S.patchSettings({ reads: { voice: false } });
  process.env.SOL_READS_VOICE = "on";
  assert.equal(S.readsVoice(), true, "the env wins over the setting");
});

test("only on the person's words this turn, and only a source Sol reads", async () => {
  const before = onDisk();
  let r = await run({ name: "Gmail", read: true, yes: "read my Gmail again" }, "what is on my calendar?");
  assert.equal(r.isError, true);
  assert.match(txt(r), /not in what the person said/);
  r = await run({ name: "Fax", read: false, yes: "stop reading my fax" }, "stop reading my fax");
  assert.equal(r.isError, true);
  assert.match(txt(r), /nothing Sol reads is called Fax/);
  r = await run({ name: "Gmail", yes: "stop reading my Gmail" }, "stop reading my Gmail");
  assert.equal(r.isError, true);
  assert.deepEqual(onDisk(), before);
});

test("resumed by voice (in Chinese too): read again, and the guard lets it read", async () => {
  let r = await run({ name: "Gmail", read: true, yes: "可以再讀我的信" }, "好，可以再讀我的信了");
  assert.equal(r.isError, true, "reading again needs the source named in the person's own words");
  assert.match(txt(r), /names it in their own words/);
  r = await run({ name: "Gmail", read: true, yes: "stop reading my Gmail" }, "stop reading my Gmail");
  assert.equal(r.isError, true, "words that say stop never read it again");
  assert.match(txt(r), /ask to stop/);
  assert.equal(onDisk().consent.sources["account:Gmail"], "no");
  r = await run({ name: "Gmail", read: true, yes: "read my Gmail again" }, "Don\u2019t read my Gmail again");
  assert.equal(r.isError, true, "a quote cut short of its don't is no yes: the whole turn is read");
  assert.equal(onDisk().consent.sources["account:Gmail"], "no");
  r = await run({ name: "Gmail", read: true, yes: "可以再讀我的 Gmail" }, "好，可以再讀我的 Gmail 了");
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(onDisk().consent.sources["account:Gmail"], "yes");
  assert.equal((await ask(connectorsGuard(base, new Map(), servicesOff(home)), "mcp__claude_ai_Gmail__list_threads")).behavior, "allow");
});

test("a source by the person's words: GitHub, Claude Code's sessions; a name that fits two is both", () => {
  assert.deepEqual(R.sourceIds("my Claude Code sessions", []), ["claude-sessions"]);
  assert.deepEqual(R.sourceIds("calendar", ["Google Calendar"]), ["account:Google Calendar"]);
  assert.deepEqual(R.sourceIds("gmail", [], ["account:Gmail"]), ["account:Gmail"]);   // the account could not answer: the record's name stands
  assert.deepEqual(R.sourceIds("Slack", ["Gmail"]), []);
  assert.deepEqual(R.sourceIds("GitHub", ["GitHub"]), ["github", "account:GitHub"]);
  assert.equal(R.names("read my Google Calendar again", "account:Google Calendar"), true);
  assert.equal(R.names("read my calendar again", "account:Google Calendar"), true);
  assert.equal(R.names("read it again", "account:Gmail"), false);
  assert.equal(R.names("read my gmailx again", "account:Gmail"), false);
});

test("a name that fits two: stopping stops both; reading again asks which", async () => {
  const two = async () => ["GitHub", "Gmail"];
  let r = await R.runReadsTool("set_reading", { name: "GitHub", read: false, yes: "stop reading GitHub" }, { said: "stop reading GitHub" }, { home, services: two });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(onDisk().consent.sources.github, "no");
  assert.equal(onDisk().consent.sources["account:GitHub"], "no");
  r = await R.runReadsTool("set_reading", { name: "GitHub", read: true, yes: "read GitHub again" }, { said: "read GitHub again" }, { home, services: two });
  assert.equal(r.isError, true);
  assert.match(txt(r), /both fit that name/);
  assert.equal(onDisk().consent.sources.github, "no");
});

test("the switch off: a \"not here\" in the record is still refused (rolled back or never on, the person's no holds)", async () => {
  delete process.env.SOL_READS_VOICE;
  S.patchSettings({ reads: { voice: false } });
  writeFileSync(REC, JSON.stringify({ ...record, consent: { ...record.consent, sources: { "account:Gmail": "no" } } }));
  assert.equal(S.readsVoice(), false);
  const g = connectorsGuard(base, new Map(), servicesOff(home));
  assert.equal((await ask(g, "mcp__claude_ai_Gmail__search_threads")).behavior, "deny");
  assert.equal((await ask(g, "mcp__claude_ai_gmail__search_threads")).behavior, "deny", "matched without case");
});

test("no record yet, or one that will not read: nothing is written, and it says why", async () => {
  process.env.SOL_READS_VOICE = "on";
  const none = join(DIR, "nobody");
  let r = await R.runReadsTool("set_reading", { name: "Gmail", read: false, yes: "stop reading Gmail" }, { said: "stop reading Gmail" }, { home: none, services });
  assert.equal(r.isError, true);
  assert.match(txt(r), /no record yet/);
  writeFileSync(REC, "{ not json");
  r = await run({ name: "Gmail", read: false, yes: "stop reading Gmail" }, "stop reading Gmail");
  assert.equal(r.isError, true);
  assert.match(txt(r), /will not read/);
  assert.equal(readFileSync(REC, "utf8"), "{ not json");
  // and the guard: a record that will not read refuses every service of the account, never reads past a "no" it lost
  const g = connectorsGuard(base, new Map(), servicesOff(home));
  const d = await ask(g, "mcp__claude_ai_Google_Calendar__list_events");
  assert.equal(d.behavior, "deny");
  assert.match((d as { message: string }).message, /will not read/);
  assert.equal(servicesOff(none).size, 0, "no record at all: nothing was ever said, nothing refused by name");
});

test("the record's own spelling stands: a service the account now spells otherwise keeps one entry", async () => {
  writeFileSync(REC, JSON.stringify({ ...record, consent: { ...record.consent, sources: { "account:Gmail": "no" } } }));
  const r = await R.runReadsTool("set_reading", { name: "gmail", read: true, yes: "read GMAIL again" }, { said: "ok, read GMAIL again" }, { home, services: async () => ["GMAIL"] });
  assert.equal(r.isError, undefined, txt(r));
  assert.deepEqual(onDisk().consent.sources, { "account:Gmail": "yes" });
});
