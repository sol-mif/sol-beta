// A Sol on Codex (#1703): its answering session runs on Claude alone, so where Claude does not start the ask becomes a
// card for the person and the asker hears why; the person's own agent answers it with answer_ask. Its own file: the
// module holds one engine, and the asks other files leave running would keep it busy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReach, heard, couldNotStart, askCard, answerAsk, type ReachDeps } from "../src/team/reach.ts";

const T = Date.UTC(2026, 10, 20, 18);
const msg = (from: string, p: Record<string, unknown>, at = T) => ({ ...p, from: { login: from, agent: true }, at });
function engines() {
  const dir = mkdtempSync(join(tmpdir(), "reach-codex-"));
  const sent: { from: string; p: Record<string, unknown> }[] = [];
  const deps = (me: string, sub: string): ReachDeps => ({
    me: () => me, team: () => ["marco", "frank"], send: (p) => { sent.push({ from: me, p }); return true; },
    say: async () => {}, give: () => {}, name: () => {}, working: () => true, lastWords: async () => "",
    state: async () => "", file: async () => "",
    file_: join(dir, sub, "reach.json"), room: join(dir, sub, "room.md"), home: join(dir, sub, "work"),
  });
  return { dir, sent, deps };
}
test("#1703 a Sol on Codex: Claude does not start, so the ask becomes a card for the person, the asker hears why, and the person's own agent answers with answer_ask", async () => {
  const was = process.env.SOL_REACH;
  process.env.SOL_REACH = "on";
  try {
    const e = engines();
    const shown: { id: string; why: string }[] = [];
    startReach({ ...e.deps("marco", "codex"), where: () => "studio",
      say: async () => { throw new Error("Claude Code is not signed in"); },
      askHere: async (a, why) => { shown.push({ id: a.id, why }); return true; } });
    heard(msg("frank", { type: "ask", id: "ask000071", to: "marco", question: "which release are you on?" }));
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(shown, [{ id: "ask000071", why: "Claude Code is not signed in" }], "the ask is placed where marco is");
    const no = e.sent.at(-1)!.p as any;
    assert.equal(no.type, "refused");
    assert.match(no.why, /^marco's Sol on studio could not start its answering session: it runs on Claude, and Claude did not start there \(Claude Code is not signed in\)\. The ask is shown to marco instead/);
    // marco's own agent answers it, once; the asker's side takes the late answer where it asked
    assert.match(answerAsk("ask000071", "dev-20261120, on Codex"), /^answered/);
    const yes = e.sent.at(-1)!.p as any;
    assert.equal(yes.type, "answer"); assert.equal(yes.re, "ask000071"); assert.equal(yes.to, "frank");
    heard(msg("marco", yes, Date.now() + 1));
    assert.match(answerAsk("ask000071", "again"), /answered already/);
    assert.match(answerAsk("nosuch001", "x"), /no ask with that id/);
    // an ask that was not put in front of marco (refused for being off, a limit, a stranger): answer_ask does not answer it
    process.env.SOL_REACH = "off";
    heard(msg("frank", { type: "ask", id: "ask000074", to: "marco", question: "another?" }));
    await new Promise((r) => setTimeout(r, 30));
    assert.match(String((e.sent.at(-1)!.p as any).why), /SOL_REACH=off/, "refused for being off, never a card");
    assert.deepEqual(shown.map((x) => x.id), ["ask000071"]);
    assert.match(answerAsk("ask000074", "x"), /not put in front of you/);
    assert.match(answerAsk("ask000071 ", ""), /answered already|empty/);
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
});

test("#1703 the words: no session to show it in, the refusal says Claude did not start and nothing more; the card quotes the ask and names answer_ask", () => {
  assert.equal(couldNotStart("marco", undefined, "", false), "marco's Sol could not start its answering session: it runs on Claude, and Claude did not start there (no reason given)");
  const c = askCard({ type: "ask", id: "ASK000072", to: "marco", question: "is the gate\ngreen?", from: "frank", at: T } as never, "not signed in");
  assert.equal(c.id, "ask-ask000072");
  assert.equal(c.title, "frank's agent asks you");
  assert.match(c.body, /^is the gate green\?\n.*Claude did not start here \(not signed in\)[\s\S]*answer_ask with id ASK000072\. Nothing is sent until then\.$/);
});

test("#1703 a session that starts and ends at once with nothing said: its error line is why, and the ask goes to the person the same way", { timeout: 20_000 }, async () => {
  const was = process.env.SOL_REACH;
  process.env.SOL_REACH = "on";
  try {
    const e = engines();
    const shown: string[] = [];
    startReach({ ...e.deps("isaac", "ended"), working: () => false, failedWhy: async () => "Invalid API key · Please run /login",
      askHere: async (a) => { shown.push(a.id); return false; } });
    heard(msg("frank", { type: "ask", id: "ask000073", to: "isaac", question: "where is the site?" }));
    await new Promise((r) => setTimeout(r, 4600));   // answer() looks after 4 s
    assert.deepEqual(shown, ["ask000073"]);
    const no = e.sent.at(-1)!.p as any;
    assert.equal(no.type, "refused");
    assert.equal(no.why, "isaac's Sol could not start its answering session: it runs on Claude, and Claude did not start there (Invalid API key · Please run /login)", "no session took the card: nothing more is promised");
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
});
