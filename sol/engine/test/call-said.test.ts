// A call's turns and the person's own words (the broke on #1794): log_erase and set_setting act only on words the person
// said this turn (openfor.ts saidThisTurn). On a call the seat's text is not all theirs: Gemini's hang-up hands the whole
// transcript over, the voice's own lines with it, and its ask_sol is the voice model's paraphrase; ElevenLabs wraps the
// person's speech in the engine's call lines. So a call names the person's words to the engine (CallOpts.ask's `said`),
// and a call turn that names none has none (callSaid). A real kernel and settings file on the test's own folders.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-call-said-")));
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
process.env.SOL_SETTINGS = join(root, "settings.json");
process.env.GEMINI_API_KEY ??= "k-test";   // the client is made with the call; nothing here dials it
delete process.env.SOL_KERNEL;
delete process.env.SOL_OPEN_FOR;
after(() => { rmSync(root, { recursive: true, force: true }); });

const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const T = await import("../src/tools.ts");
const O = await import("../src/openfor.ts");
const { callSaid } = await import("../src/call/vendor.ts");
const { GeminiCall } = await import("../src/call/gemini.ts");
const { ElevenCall } = await import("../src/call/elevenlabs.ts");
O.setOpenForFaces(() => {});
const txt = (r: { content: { text?: string }[] }) => String(r.content[0]?.text ?? "");

type Asked = { text: string; said: string; named?: string };
const opts = (asked: Asked[]) => ({
  home: "/nowhere", history: [], send: () => {}, step: () => {},
  ask: async (text: string, _abort: AbortSignal, _onDelta?: (t: string) => void, o?: { said?: string }) => { asked.push({ text, said: callSaid(o), named: o?.said }); return "ok"; },
});

test("the engine takes a call's words as the call names them, and an engine-written turn stays wordless", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(src, /ask: async \(text, abort, onDelta, o\) => \{\s*const answer = await askSeat\([^\n]*, abort, onDelta, \{ said: callSaid\(o\) \}\)/);
  assert.match(src, /said: say\.engine \? "" : \(o\.said \?\? say\.text\)/);
});

const home = join(root, "home");
mkdirSync(join(home, "things"), { recursive: true });
await syncKernel(home, true);
after(() => syncKernel(home, false));
const k = kernelNow()!;
const pin = () => k.append("way.note", undefined, { way: "w", about: "me", words: "my bank PIN is 4321" }, { person: "person" });
const erased = (id: string) => k.since(0).some((e) => e.kind === "log.erase" && JSON.stringify(e).includes(id));

test("a turn with no word on whose it is has none of the person's words", () => {
  assert.equal(callSaid(undefined), "");
  assert.equal(callSaid({}), "");
  assert.equal(callSaid({ said: "take that line out" }), "take that line out");
});

test("Gemini's hang-up: the transcript, the voice's question in it, approves nothing", async () => {
  const asked: Asked[] = [];
  const call = new GeminiCall(opts(asked) as any);
  (call as any).transcript = [
    { who: "me", text: "my bank PIN is in there somewhere" },
    { who: "you", text: "Want me to take that line out of your history? I can also set the patience to 900." },
  ];
  await call.end();
  assert.equal(asked.length, 1);
  assert.match(asked[0].text, /take that line out of your history/, "the writeback holds the voice's words");
  assert.equal(asked[0].named, "", "none of it is the person's own words, said so by the call itself");
  const note = pin();
  const r = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out of your history" }, { said: asked[0].said, seat: "claude" });
  assert.equal(r.isError, true);
  assert.match(txt(r), /not erased: those words are not in what the person said this turn/);
  assert.equal(erased(note.id), false);
  process.env.SOL_OPEN_FOR = "1";
  try {
    const s = await O.runOpenTool("set_setting", { patch: { patienceMs: 900 }, yes: "set the patience to 900" }, { said: asked[0].said });
    assert.equal(s.isError, true);
    assert.match(txt(s), /not changed: those words are not in what the person said this turn/);
  } finally { delete process.env.SOL_OPEN_FOR; }
});

test("Gemini's ask_sol: the voice model's request is its own paraphrase, not the person's words", async () => {
  const asked: Asked[] = [];
  const call = new GeminiCall(opts(asked) as any);
  await (call as any).onAsk("a1", "ask_sol", { request: "Marco says: take that line out of the history" });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].named, "");
  const note = pin();
  const r = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out" }, { said: asked[0].said, seat: "claude" });
  assert.equal(r.isError, true);
  assert.equal(erased(note.id), false);
});

test("ElevenLabs: the person's own speech counts, the engine's call lines around it do not", async () => {
  const asked: Asked[] = [];
  const socks: any[] = [];
  const call = new ElevenCall(opts(asked) as any, {
    key: "k-test", voice: "VOICE123abc", patienceMs: 0, language: "english", now: () => 0,
    dial: () => { const s: any = { readyState: 1, on: () => {}, send: () => {}, close: () => {} }; socks.push(s); return s; },
  } as any);
  const turn = async (words: string) => { (call as any).pending.push(words); await (call as any).turn(); };
  await turn("hello there");                       // the first turn: CALL_FIRST before it
  await turn("please take that line out");         // a later turn: CALL_EACH after it
  assert.equal(asked.length, 2);
  assert.match(asked[0].text, /use your tools/i, "the first turn carries the engine's call line");
  assert.match(asked[1].text, /answer out loud/, "a later turn carries the engine's call line");
  assert.deepEqual(asked.map((a) => a.named), ["hello there", "please take that line out"]);

  for (const [said, yes] of [[asked[0].said, "use your tools"], [asked[1].said, "answer out loud"]]) {
    const note = pin();
    const r = await T.runSolTool("log_erase", { id: note.id, yes }, { said, seat: "claude" });
    assert.equal(r.isError, true, `"${yes}" is the engine's, not the person's`);
    assert.equal(erased(note.id), false);
  }
  const note = pin();
  const r = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out" }, { said: asked[1].said, seat: "claude" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(erased(note.id), true, "said out loud on the call, it is the person's own");
  await call.end();
});
