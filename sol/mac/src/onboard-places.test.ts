// node --test src/*.test.ts: the places a person can sign in to, under the box on the first screen (#1423,
// onboard/places.ts): what the explorer finds signed in before anything is read (explore.mjs stop 0, presence only) on
// the made-up people's homes (onboard/people/seed.mjs), and what is suggested, with its reason, for each of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { placesOf, placesLine, type PlacesIn, type Reach } from "./onboard/places.ts";
import type { Explored } from "./onboard/sort.ts";
import type { StopId } from "./onboard/Lens.tsx";

const here = new URL("./onboard/", import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), "ob1-places-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
/** a made-up person's reach, as the onboarding's first run at open reads it (every stop but the machine skipped) */
function reachOf(who: string): Reach {
  const home = join(base, who), out = join(base, `${who}.json`);
  execFileSync(process.execPath, [join(here, "people/seed.mjs"), who, home]);
  execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", home, "--out", out, "--skip", "ai,tools,calendar,files,projects,browser", "--stops-said"]);
  return (JSON.parse(readFileSync(out, "utf8")) as Explored).reach!;
}
// the places as they were before Sol's own sign-in stood first (#1608): a Sol with no cloud has none
const run = (reach: Reach, more: Partial<PlacesIn> = {}) => placesOf({ reach, services: [], said: "", off: [], closed: new Set<StopId>(), careful: false, cloud: false, ...more });
const st = (ps: ReturnType<typeof placesOf>) => Object.fromEntries(ps.map((p) => [p.id, p.st]));

test("the reach is presence only: no name inside an account, no token, nothing read before the ask", () => {
  const r = reachOf("noa");
  assert.deepEqual(r, { gh: true, gog: false, code: ["figma", "notion", "google-drive"], codex: [], ai: { claude: true, codex: false }, apps: ["Notion", "Slack"] });
  const text = readFileSync(join(base, "noa.json"), "utf8");
  assert.ok(!text.includes("noa-makes"), "gh's user is not in the reach");
  assert.ok(!text.includes("made_up"), "no credential file's content");
});

test("Noa: what is signed in is shown with its way; two suggestions, each with its reason", () => {
  const ps = run(reachOf("noa"), { said: "Second year at Westbrook, design major. I freelance for two clients." });
  const by = Object.fromEntries(ps.map((p) => [p.id, p]));
  assert.equal(by.github.via, "gh");
  assert.equal(by.notion.via, "Claude Code's notion");
  assert.equal(by.drive.via, "Claude Code's google-drive");
  assert.equal(by.codex.st, "hint");
  assert.equal(by.codex.why, "Codex is on this Mac, not signed in");
  assert.equal(by.slack.st, "hint");
  assert.equal(by.slack.why, "Slack is on this Mac");
  assert.equal(by.gmail.st, "off", "two at most: her words come after an AI tool and an app");
  assert.equal(ps.filter((p) => p.st === "hint").length, 2);
  assert.deepEqual(ps.map((p) => p.st), [...ps.map((p) => p.st)].sort((a, b) => ["on", "late", "hint", "off"].indexOf(a) - ["on", "late", "hint", "off"].indexOf(b)), "reached first, the rest last");
});

test("Ines, careful: nothing is suggested; Lee, a new Mac: nothing is reached and nothing pushed", () => {
  const ines = run(reachOf("ines"), { said: "Just what I tell you. Work at the clinic, shifts Monday to Wednesday.", careful: true });
  assert.equal(ines.filter((p) => p.st === "hint").length, 0);
  const lee = run(reachOf("lee"));
  assert.ok(lee.every((p) => p.st === "off"), JSON.stringify(st(lee)));
  assert.equal(placesLine(lee), "I read only this Mac. Sign in later in Settings › your Home.");
});

test("Sam: Google is reached through gog, so nothing of Google is asked", () => {
  const ps = run(reachOf("sam"), { said: "I run a small bakery and have customers every Saturday." });
  assert.deepEqual([st(ps).gmail, st(ps).gcal, st(ps).drive], ["on", "on", "on"]);
  assert.equal(ps.find((p) => p.id === "gmail")!.via, "gog");
  assert.equal(placesLine(ps), "I read this Mac and 3 places. Sign in later in Settings › your Home.");
});

test("their words suggest a place only when not put off-limits, and a closed stop is never suggested", () => {
  const none: Reach = { gh: false, gog: false, code: [], codex: [], ai: {}, apps: [] };
  assert.equal(st(run(none, { said: "I freelance for clients." })).gmail, "hint");
  assert.equal(run(none, { said: "I freelance for clients." }).find((p) => p.id === "gmail")!.why, "you wrote “freelance”");
  assert.equal(st(run(none, { said: "I freelance for clients.", off: ["my clients' mail"] })).gmail, "off");
  const shut = run(none, { said: "I write code with my team.", closed: new Set<StopId>(["projects"]) });
  assert.equal(st(shut).github, "off");
  assert.equal(shut.find((p) => p.id === "github")!.shut, true);
  assert.equal(st(shut).slack, "hint");
});

test("a service in the Claude account: connected reaches its place; needing a sign-in again says so", () => {
  const none: Reach = { gh: false, gog: false, code: [], codex: [], ai: {}, apps: [] };
  const ps = run(none, { services: [{ name: "Gmail", status: "connected" }, { name: "Google Calendar", status: "needs-auth" }] });
  const by = Object.fromEntries(ps.map((p) => [p.id, p]));
  assert.equal(by.gmail.via, "your Claude account");
  assert.equal(by.gcal.st, "late");
  assert.equal(by.gcal.why, "Google Calendar in your Claude account needs signing in again");
  assert.equal(ps[1].id, "gcal", "run out comes right after what is reached");
});

test("Sol first (#1608): the Google sign-in on Sol's cloud stands before every place, asked of a careful person too; the name once signed in; none without a cloud", () => {
  const none: Reach = { gh: false, gog: false, code: [], codex: [], ai: {}, apps: [] };
  const before = run(none, { cloud: true, said: "I freelance for clients." });
  assert.equal(before[0].id, "sol");
  assert.deepEqual([before[0].way, before[0].st, before[0].why, before[0].shut], ["google", "hint", "before I look around", undefined]);
  assert.equal(before.filter((p) => p.st === "hint" && p.id !== "sol").length, 1, "Sol is not one of the two suggestions");
  const after = run(none, { cloud: true, me: "frank" });
  assert.deepEqual([after[0].st, after[0].via], ["on", "frank"]);
  assert.equal(placesLine(after), "I read only this Mac. Sign in later in Settings › your Home.", "Sol is not a place that is read");
  assert.equal(run(none, { cloud: true, careful: true })[0].id, "sol");
  assert.equal(run(none, { cloud: true, closed: new Set<StopId>(["projects", "tools"]) })[0].shut, undefined);
  assert.ok(!run(none).some((p) => p.id === "sol"), "no cloud to sign in to: no Sol place");
  assert.equal(run(none, { cloud: true, me: null })[0].st, "hint", "nobody signed in is the same as not yet said");
});
