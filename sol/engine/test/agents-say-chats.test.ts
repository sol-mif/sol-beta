// Agents (#1327): Sol's own turns never show among the person's chats. Every a.d.say turn (an offer, a rehearsal) runs
// `internal` (meta/say.ts), so its rollout says originator sol_internal and threads.ts leaves it out of Life's chats
// (Build › Chats) and of the folders' talks. The first grouping runs no turn at all (the calm pass: names are code's).
// Its own HOME, so the Codex folder read is a fixture; the Codex is a stand-in that writes a rollout as the real binary
// does, its originator from the env it was started with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const top = realpathSync(mkdtempSync(join(tmpdir(), "sol-saychats-")));
const me = join(top, "Users", "someone");   // the fixture's own home, never a real one
process.env.HOME = me;
process.env.SOL_STATE = join(top, "work.json");
process.env.TMPDIR = join(me, "tmp");   // the invented homes inside the fixture's home, as a real one would sit
mkdirSync(process.env.TMPDIR, { recursive: true });
const day = join(me, ".codex", "sessions", "2026", "11", "17");
mkdirSync(day, { recursive: true });

const { codexIndex, codexTalks, listThreads, internalEnv, invalidateCodex, ORIGINATOR_ENV } = await import("../src/threads.ts");
const { Agents } = await import("../src/agent/index.ts");
const { ensureWith, loadAgents } = await import("../src/agent/agents.ts");
const { offers } = await import("../src/agent/meta/offer.ts");
const { LETTERS, NOW, NURSE, make } = await import("./agents-fixtures.ts");
/** how the offer's turn starts (offer.ts offerPrompt) */
const OFFER = "A person did the same job";

/** a stand-in Codex: each run writes one rollout in the folder it ran in, originator as the binary picks it (the env's
 *  override, else the SDK's codex_sdk_ts), and answers `said` */
function standIn(said: (prompt: string) => string) {
  const asked: { internal: boolean; prompt: string }[] = [];
  let n = 0;
  const codexFor = (_token: string, o: { internal?: boolean } = {}) => {
    const env = o.internal ? internalEnv() : null;
    return {
      startThread: (opts: { workingDirectory: string }) => ({
        id: null as string | null,
        async run(prompt: string) {
          const id = randomUUID();
          this.id = id;
          writeFileSync(join(day, `rollout-2026-11-17T00-00-${String(++n).padStart(2, "0")}-${id}.jsonl`), [
            { type: "session_meta", payload: { id, cwd: opts.workingDirectory, originator: env?.[ORIGINATOR_ENV] ?? "codex_sdk_ts", source: "exec" } },
            { type: "event_msg", payload: { type: "user_message", message: prompt } },
          ].map((x) => JSON.stringify(x)).join("\n") + "\n");
          asked.push({ internal: !!o.internal, prompt });
          return { finalResponse: said(prompt) };
        },
      }),
    };
  };
  return { codexFor, asked };
}

const runOf = (c: ReturnType<typeof standIn>) => ({ codexFor: c.codexFor as any, turns: new Map(), sandboxMode: "read-only" as const, networkAccessEnabled: false });

test("the first grouping runs no Sol turn and leaves no chat: names are code's", async () => {
  const home = realpathSync(make(LETTERS));
  const c = standIn(() => `["Letters in","Letters out"]`);
  const a = new Agents({ home, ask: async () => null, now: () => NOW, run: runOf(c) });
  await ensureWith(a, async () => null);
  assert.ok(loadAgents(home), "grouped");
  assert.deepEqual(c.asked, [], "no turn asked: nothing is named by a Sol turn");
  invalidateCodex();
  assert.deepEqual((await listThreads(home)).filter((t) => t.seat === "codex"), [], "no chat in Life's list (Build › Chats)");
});

test("the offer's turn runs as Sol's own and leaves no chat in the person's list (Life's chats, a folder's talks)", async () => {
  const home = realpathSync(make(NURSE));
  const c = standIn(() => `I read the traces.\n${JSON.stringify({ name: "Rota", job: "puts each new rota for <place> into your calendar", steps: ["a new rota", "read it", "your shifts into the calendar"], parameter: "the ward", kind: "ward" })}`);
  const a = new Agents({ home, ask: async () => null, now: () => NOW, run: runOf(c) });
  const [o] = (await offers(a)).offers;
  assert.equal(o?.name, "Rota", "the offer is written from the turn's answer");
  const turn = c.asked.find((x) => x.prompt.startsWith(OFFER));
  assert.ok(turn, "the offer's turn ran");
  assert.equal(turn!.internal, true, "as Sol's own turn");
  invalidateCodex();
  const rec = (await codexIndex()).find((t) => t.title.startsWith(OFFER));
  assert.equal(rec?.originator, "sol_internal", "its rollout is there, marked as Sol's own");
  assert.deepEqual((await listThreads(home)).filter((t) => t.seat === "codex"), [], "no chat in Life's list (Build › Chats)");
  assert.ok(!(await codexTalks(join(top, "elsewhere"))).some((t) => t.title.startsWith(OFFER)), "nor a talk in a folder");
});

test("a person's own Codex turn in the same home is still a chat", async () => {
  const home = realpathSync(make(LETTERS));
  const c = standIn(() => "ok");
  await c.codexFor("t").startThread({ workingDirectory: home }).run("what is on today");
  await c.codexFor("t", { internal: true }).startThread({ workingDirectory: home }).run(`${OFFER} 3 times`);
  invalidateCodex();
  const titles = (await listThreads(home)).filter((t) => t.seat === "codex").map((t) => t.title);
  assert.deepEqual(titles, ["what is on today"]);
});

test("internalEnv keeps this process's environment and sets the originator", () => {
  const e = internalEnv({ PATH: "/bin", A: "1", B: undefined });
  assert.deepEqual(e, { PATH: "/bin", A: "1", [ORIGINATOR_ENV]: "sol_internal" });
});

test("a folder agent's own thread is never a talk in Build's home folders, marked or from before the mark (#1430)", async () => {
  const { AGENT_OPENING } = await import("../src/threads.ts");
  const { promptOf } = await import("../src/agent/run.ts");
  const home = realpathSync(make(LETTERS)), place = join(home, "kids", "ana");
  const opening = promptOf({ folder: place, rule: { id: "mail-1", source: "mail", sentence: "the letter's dates into calendar.md" } as any,
    trigger: { source: "mail", kind: "new", at: NOW, data: {} } as any, ticket: { id: "t-1", runs: [], triggers: [], mandate: { mode: "do", rung: "draft" } } as any });
  assert.ok(opening.startsWith(AGENT_OPENING), "the agent's turn opens as threads.ts knows it");
  const c = standIn(() => "ok");
  await c.codexFor("t", { internal: true }).startThread({ workingDirectory: place }).run(opening);   // a run today: marked
  await c.codexFor("t").startThread({ workingDirectory: place }).run(opening);                      // its thread from before the mark
  await c.codexFor("t").startThread({ workingDirectory: place }).run("what does this letter want from us");   // the person's own
  invalidateCodex();
  const here = (await codexTalks(home)).filter((t) => t.real.startsWith(home + "/"));
  assert.deepEqual(here.map((t) => t.title), ["what does this letter want from us"], "only the person's talk is listed");
});
