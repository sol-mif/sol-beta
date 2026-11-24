// "You, here" on a new session the new face starts (BR1, #1615; work/runs.ts workSay hereFor): the new face starts a
// session with work.say, so workSay, not index.ts's say, gives its first prompt "you, here" with the place the face put
// it in, and keeps what it told by the session's id (rememberTold); an old-face or engine-made session, or a session
// already going, gets none, and a "here" the face sends is never read. A stand-in run takes the message, so no CLI
// starts. The person is Lucy, from the panel, in a made-up home. Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-worksay-here-"));
const user = join(dir, "lucy"), home = join(user, ".sol");
mkdirSync(join(home, "record"), { recursive: true });
mkdirSync(join(user, "studio", "flyers"), { recursive: true });
writeFileSync(join(home, "record", "me.json"), JSON.stringify({ name: "Lucy", said: "go", solHome: home, areas: [], aims: [{ w: "My business", said: true, ok: true, at: "2026-11-18" }] }));
Object.assign(process.env, { HOME: user, SOL_HOME: home, SOL_STATE: join(dir, "work.json"), SOL_PROFILE: join(dir, "profile"), SOL_UI_NEXT: "on" });
after(() => rmSync(dir, { recursive: true, force: true }));

const { workSay } = await import("../src/work/runs.ts");
const { toldOf } = await import("../src/next/you-known.ts");
const { recordHomeOf } = await import("../src/next/you.ts");
type Said = { text: string; here?: string };

/** the message as the run is given it, through a stand-in run */
async function firstPrompt(s: Record<string, unknown>): Promise<Said> {
  let got: Said | null = null;
  const run = { say: async (m: Said) => { got = m; }, inbox: { closed: false } };
  await workSay({ sessionId: `s-${Math.random().toString(36).slice(2)}`, text: "make the flyer", ...s } as never, () => {}, async () => run as never);
  return got!;
}

test("a new session the new face starts gets you, here with its place first, and its told kept by its id", async () => {
  const sessionId = "lucy-flyer-1";
  const m = await firstPrompt({ sessionId, fresh: true, person: true, opening: true, cwd: join(user, "studio", "flyers"), place: "studio/flyers", here: "the face's own words" });
  assert.match(m.here ?? "", /^You, here \(studio\/flyers\): Here for: My business\./, m.here);
  assert.doesNotMatch(m.here ?? "", /the face's own words/, "a here the face sends is never read");
  assert.equal(m.text, "make the flyer", "the person's own line keeps only their words");
  const t = toldOf({ sol: home, user, rec: recordHomeOf(home, user) }, { session: sessionId }) as { ok: boolean; told?: { k: string }[] };
  assert.ok(t.ok && t.told?.some((x) => x.k === "aim:My business"), JSON.stringify(t));
});

test("a session already going, one Sol or an agent starts, or the new face off: no you, here", async () => {
  assert.equal((await firstPrompt({ person: true, cwd: user })).here, undefined, "not fresh");
  assert.equal((await firstPrompt({ fresh: true, cwd: user, place: "studio" })).here, undefined, "not the person's");
  process.env.SOL_UI_NEXT = "off";
  try { assert.equal((await firstPrompt({ fresh: true, person: true, cwd: user, place: "studio" })).here, undefined, "the old face"); }
  finally { process.env.SOL_UI_NEXT = "on"; }
});
