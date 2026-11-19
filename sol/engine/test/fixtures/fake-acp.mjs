// A fake ACP agent (test/acp-seat.test.ts): one JSON-RPC message a line on stdin and stdout, no model, nothing started.
// A prompt's words say what it does: "pid" says its process id; "ask" asks to run a command and says whether it ran;
// ("ask odd": its title has a right-to-left override, a newline and invisible characters); "wait" waits for session/cancel; "cancels?" says how many cancels it heard; "read <path>" and "fork" say whether its
// wall let it; "split" says 中文字 in one line written as two writes cut inside 中; "long <pad>" says pad and 40,000 中 in
// one write (the pipe's reads fall where they fall); "env" says its environment's names, its HOME and its PATH; "write
// <path>" says whether its wall let it; "run <program> [args]" starts a program and says whether it ran; "spawn" starts
// two sleeps that go on (one in its own process group, one that left it) and says their pids; "fail" answers the
// prompt with an error whose reason is in its data; "options?" says the model and the effort its session is set to
// (session/new offers them, session/set_config_option sets one; the model "stuck" is offered and will not be set);
// "hide <file>" starts two sleeps that left its group, one of them through a program between that ends 1.5 s later,
// writes their pids in the file and says "hidden" 1.2 s later; "die" ends it (exit 3); "spawn many <n> <file>" starts n
// sleeps, writes their pids in the file and never answers; "swap <name> <to>" moves <name> in its home aside and puts
// a link to <to> in its place; "fail odd" answers the prompt with an error whose message, code and data are objects
// that cannot be said; "lock" makes a folder in its home nobody may open, a file in it; "churn <file>" starts a
// program that left its group, takes no SIGTERM and goes on starting a sleep and killing the one before, and writes
// its pid in the file ("spawn many" starts every other sleep out of its group); "flood" stops reading what Sol writes
// and asks 60,000 times for what Sol does not offer; "words <n>" says n chunks of a million characters; "ask many
// <n>" asks n permissions at once and says how many were a yes and how many a no; "chain <n> <file>" starts a perl
// that, at its SIGTERM, starts a chain of n more, each by the one before, each the head of a group of its own, a
// millisecond apart, their pids in the file (each ends by itself within two minutes); "steps <n>" takes n steps;
// "ask and go" asks a permission and ends its turn without the answer, and "left?" says what answer came after;
// "named late" takes one step it names only in a later note, and says what it spent with the cached parts apart (as
// Claude Code's adapter does); "key <how> <NAME>" passes on what its environment holds under NAME: "say" in its words,
// "split" in two pieces cut inside it, "begin" only its first four characters as its last words, "step" in a step's
// name, "ask" in a permission's line, option and arguments, "fail" in an error's reason, "far" in one after 290 other characters, "kind" as a step's kind, "die" on its stderr as it ends,
// "reach" as the head of a host's name it asks its proxy for, by CONNECT and then as plain http
// (started with "vkey" it says it as its version, with "nokey" in the error it answers hello with);
// anything else is two text chunks, one tool step and what it spent. Started with "v2", it says it speaks ACP version 2;
// with "slow", the first session/new is never answered and the first session/set_config_option is answered 600 ms late.
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, renameSync, symlinkSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { connect } from "node:net";
const tried = (f) => { try { f(); return "yes"; } catch { return "refused"; } };
let n = 0, news = 0, sets = 0, cancels = 0, held = null, model = "big", effort = "medium", left = "none";
const options = () => [
  { id: "model", name: "Model", category: "model", type: "select", currentValue: model, options: [{ value: "big", name: "Big" }, { value: "small", name: "Small" }, { value: "stuck", name: "Stuck" }] },
  { id: "effort", name: "Effort", category: "thought_level", type: "select", currentValue: effort, options: [{ group: "usual", name: "Usual", options: [{ value: "low", name: "Low" }, { value: "medium", name: "Medium" }, { value: "high", name: "High" }] }] },
];
const asked = new Map();
const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const update = (sessionId, u) => out({ method: "session/update", params: { sessionId, update: u } });
const say = (s, text) => update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
const CHAIN = String.raw`my ($log, $n) = @ARGV; setpgrp(0, 0); my $go = 0; $SIG{TERM} = sub { $go = 1 };
sub note { open(my $f, ">>", $log); print $f "$$
"; close $f }
note(); my $t = time; while (!$go) { select(undef, undef, undef, 0.01); exit 0 if time - $t > 30 }
$SIG{TERM} = "IGNORE";
while ($n-- > 0) { select(undef, undef, undef, 0.001); my $k = fork(); last unless defined $k; if ($k == 0) { setpgrp(0, 0); note(); next } last }
sleep 60;`;
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const m = JSON.parse(line), p = m.params ?? {};
  if (m.method === undefined) return asked.get(m.id)?.(m.result);
  if (m.method === "initialize" && process.argv[2] === "vkey") out({ id: m.id, result: { protocolVersion: process.env.BRAIN_TOKEN, agentCapabilities: {}, authMethods: [] } });
  else if (m.method === "initialize" && process.argv[2] === "nokey") out({ id: m.id, error: { code: -32603, message: `${"x".repeat(290)} ${process.env.BRAIN_TOKEN}` } });
  else if (m.method === "initialize") out({ id: m.id, result: { protocolVersion: process.argv[2] === "v2" ? 2 : 1, agentCapabilities: { loadSession: false }, authMethods: [] } });
  else if (m.method === "session/new" && process.argv[2] === "slow" && news++ === 0) return;
  else if (m.method === "session/new") out({ id: m.id, result: { sessionId: `s${++n}`, configOptions: options() } });
  else if (m.method === "session/set_config_option") {
    if (p.value === "stuck") return out({ id: m.id, error: { code: -32602, message: "Invalid params", data: "that model\nis stuck" } });
    if (p.configId === "model") model = p.value; else effort = p.value;
    if (process.argv[2] === "slow" && sets++ === 0) return void setTimeout(() => out({ id: m.id, result: { configOptions: options() } }), 600);
    out({ id: m.id, result: { configOptions: options() } });
  }
  else if (m.method === "session/cancel") { cancels++; if (held !== null) out({ id: held, result: { stopReason: "cancelled" } }); held = null; }
  else if (m.method === "session/prompt") {
    const s = p.sessionId, text = p.prompt[0].text, end = (more = {}) => out({ id: m.id, result: { stopReason: "end_turn", ...more } });
    if (text === "pid") { say(s, String(process.pid)); end(); }
    else if (text === "cancels?") { say(s, String(cancels)); end(); }
    else if (text === "wait") held = m.id;
    else if (text.startsWith("read ")) { say(s, tried(() => readFileSync(text.slice(5)))); end(); }
    else if (text === "split") {
      const line = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: s, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "中文字" } } } }) + "\n");
      const cut = line.indexOf(Buffer.from("中")) + 1;
      process.stdout.write(line.subarray(0, cut), () => setTimeout(() => { process.stdout.write(line.subarray(cut)); end(); }, 100));
    }
    else if (text.startsWith("long ")) { say(s, text.slice(5) + "中".repeat(40000)); end(); }
    else if (text === "env") { say(s, JSON.stringify({ names: Object.keys(process.env).sort(), home: process.env.HOME, path: process.env.PATH })); end(); }
    else if (text === "options?") { say(s, `${model} ${effort}`); end(); }
    else if (text === "fail") out({ id: m.id, error: { code: -32603, message: "Internal error", data: { details: "failed to load\u202e the workspace\nrequirements" } } });
    else if (text === "fail odd") out({ id: m.id, error: { code: { toString: 1 }, message: { toString: 1 }, data: { details: { toString: 1 } } } });
    else if (text === "lock") { say(s, tried(() => { const d = join(process.env.HOME, "shut"); mkdirSync(d); writeFileSync(join(d, "x"), "x"); chmodSync(d, 0o000); })); end(); }
    else if (text.startsWith("churn ")) {
      const k = spawn("node", ["-e", `const { spawn } = require("node:child_process"); process.on("SIGTERM", () => {}); let last = 0; setInterval(() => { const k = spawn("sleep", ["600"], { stdio: "ignore" }); if (last) try { process.kill(last, "SIGKILL"); } catch {} last = k.pid; }, 5);`], { stdio: "ignore", detached: true });
      k.unref();
      writeFileSync(text.slice(6), JSON.stringify([k.pid]));
      setTimeout(() => { say(s, "churning"); end(); }, 400);
    }
    else if (text.startsWith("write ")) { say(s, tried(() => writeFileSync(text.slice(6), "written by the seat"))); end(); }
    else if (text.startsWith("run ")) { const [program, ...args] = text.slice(4).split(" "); say(s, tried(() => { const r = spawnSync(program, args); if (r.error || r.status !== 0) throw new Error("no"); })); end(); }
    else if (text === "spawn") {
      const kids = [spawn("sleep", ["600"], { stdio: "ignore" }), spawn("sleep", ["600"], { stdio: "ignore", detached: true })];
      for (const k of kids) k.unref();
      say(s, JSON.stringify(kids.map((k) => k.pid))); end();
    }
    else if (text.startsWith("hide ")) {
      const a = spawn("sleep", ["600"], { stdio: "ignore", detached: true });
      const between = spawn("node", ["-e", `const k = require("node:child_process").spawn("sleep", ["600"], { stdio: "ignore", detached: true }); k.unref(); console.log(k.pid); setTimeout(() => {}, 1500);`], { stdio: ["ignore", "pipe", "ignore"] });
      a.unref();
      between.stdout.once("data", (b) => { writeFileSync(text.slice(5), JSON.stringify([a.pid, Number(String(b))])); setTimeout(() => { say(s, "hidden"); end(); }, 1200); });
    }
    else if (text === "die") process.exit(3);
    else if (text === "flood") {
      rl.close(); process.stdin.pause(); setInterval(() => {}, 1000);   // reads no more, and stays
      let i = 0;
      const go = () => { while (i < 60000) if (!process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: String(i++).padStart(200, "0"), method: "fs/read_text_file" }) + "\n")) return void process.stdout.once("drain", go); };
      go();
    }
    else if (text.startsWith("steps ")) { for (let i = 0; i < Number(text.slice(6)); i++) update(s, { sessionUpdate: "tool_call", toolCallId: `k${i}`, title: `step ${i}`, kind: "read", status: "pending" }); end(); }
    else if (text === "ask and go") {
      asked.set(950, (r) => { left = r?.outcome?.outcome ?? "none"; });
      out({ id: 950, method: "session/request_permission", params: { sessionId: s, toolCall: { toolCallId: "g1", title: "run and go", kind: "execute" }, options: [{ optionId: "yes", name: "Allow once", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
      end();
    }
    else if (text === "left?") { say(s, left); end(); }
    else if (text === "named late") {
      update(s, { sessionUpdate: "tool_call", toolCallId: "n1", title: "Terminal", kind: "execute", status: "pending" });
      update(s, { sessionUpdate: "tool_call_update", toolCallId: "n1", title: "touch made.txt", status: "in_progress" });
      update(s, { sessionUpdate: "tool_call_update", toolCallId: "n1", status: "completed" });
      end({ usage: { inputTokens: 4, outputTokens: 210, cachedReadTokens: 80070, cachedWriteTokens: 34314, totalTokens: 114598 } });
    }
    else if (text.startsWith("words ")) { for (let i = 0; i < Number(text.slice(6)); i++) say(s, "x".repeat(1 << 20)); end(); }
    else if (text.startsWith("ask many ")) {
      const count = Number(text.slice(9));
      let yes = 0, got = 0;
      for (let i = 0; i < count; i++) {
        asked.set(1000 + i, (r) => { if (r?.outcome?.optionId === "yes") yes++; if (++got === count) { say(s, `${yes} ${count - yes}`); end(); } });
        out({ id: 1000 + i, method: "session/request_permission", params: { sessionId: s, toolCall: { toolCallId: `m${i}`, title: `run ${i}`, kind: "execute" }, options: [{ optionId: "yes", name: "Allow once", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
      }
    }
    else if (text.startsWith("chain ")) {
      const [count, file] = text.slice(6).split(" ");
      spawn("/usr/bin/perl", ["-e", CHAIN, file, count], { stdio: "ignore" }).unref();
      const t = setInterval(() => { if (existsSync(file)) { clearInterval(t); say(s, "chaining"); end(); } }, 20);
    }
    else if (text.startsWith("spawn many ")) {
      const [count, file] = text.slice(11).split(" ");
      writeFileSync(file, JSON.stringify(Array.from({ length: Number(count) }, (_, i) => { const k = spawn("sleep", ["600"], { stdio: "ignore", detached: i % 2 === 1 }); k.unref(); return k.pid; })));
    }
    else if (text.startsWith("swap ")) {
      const [name, to] = text.slice(5).split(" "), at = join(process.env.HOME, name);
      say(s, tried(() => { renameSync(at, `${at}.old`); symlinkSync(to, at); })); end();
    }
    else if (text === "fork") { say(s, tried(() => { const r = spawnSync("/bin/echo", ["x"]); if (r.error || r.status !== 0) throw new Error("no"); })); end(); }
    else if (text.startsWith("key ")) {
      const [how, name] = text.slice(4).split(" "), v = process.env[name] ?? "none";
      if (how === "say") { say(s, `it is ${v}.`); end(); }
      else if (how === "split") { say(s, `it is ${v.slice(0, 5)}`); say(s, `${v.slice(5)}.`); end(); }
      else if (how === "begin") { say(s, `ends ${v.slice(0, 4)}`); end(); }
      else if (how === "step") {
        update(s, { sessionUpdate: "tool_call", toolCallId: "k1", title: `echo ${v}`, kind: "execute", status: "pending" });
        update(s, { sessionUpdate: "tool_call_update", toolCallId: "k1", status: "completed" });
        end();
      }
      else if (how === "ask") {
        asked.set(960, (r) => { say(s, r?.outcome?.optionId === "yes" ? "ran it" : "did not run it"); end(); });
        out({ id: 960, method: "session/request_permission", params: { sessionId: s, toolCall: { toolCallId: "k9", title: `echo ${v}`, kind: "execute", rawInput: { command: `echo ${v}`, env: { [v]: [v, 1] } } }, options: [{ optionId: "yes", name: `Allow ${v}`, kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
      }
      else if (how === "fail") out({ id: m.id, error: { code: -32000, message: "Authentication required", data: { details: `the token ${v} was refused` } } });
      else if (how === "far") out({ id: m.id, error: { code: -32603, message: "Internal error", data: { details: `${"x".repeat(290)} ${v}` } } });
      else if (how === "kind") { update(s, { sessionUpdate: "tool_call", toolCallId: "k2", title: "a step", kind: v, status: "completed" }); end(); }
      else if (how === "reach") {
        const p = new URL(process.env.HTTPS_PROXY ?? "http://127.0.0.1:9");
        const ask = (head) => new Promise((done) => {
          const c = connect(Number(p.port), p.hostname, () => c.write(head));
          c.once("data", (b) => { done(/^HTTP\/1\.1 403/.test(String(b)) ? "refused" : "reached"); c.destroy(); });
          c.once("error", () => done("no proxy"));
        });
        ask(`CONNECT ${v}.example.com:443 HTTP/1.1\r\nHost: ${v}.example.com:443\r\n\r\n`)
          .then((a) => ask(`GET http://${v}.example.com/ HTTP/1.1\r\nHost: ${v}.example.com\r\n\r\n`).then((b) => { say(s, `${a} ${b}`); end(); }));
      }
      else if (how === "die") process.stderr.write(`cannot log in with ${v}\n`, () => process.exit(3));
    }
    else if (text === "ask" || text === "ask odd" || text === "ask or stop") {
      // "ask or stop": refused, it ends its turn as a real agent does (Codex), with the stop reason "cancelled"
      asked.set(900, (r) => { const yes = r?.outcome?.optionId === "yes"; if (!yes && text === "ask or stop") return end({ stopReason: "cancelled" }); say(s, yes ? "ran it" : "did not run it"); end(); });
      out({ id: 900, method: "session/request_permission", params: { sessionId: s, toolCall: { toolCallId: "t9", title: text === "ask odd" ? "run\u202e dliub\nfr- mr\u200b\u2028x" : "run rm -rf build", kind: "execute", rawInput: { command: "rm -rf build" } }, options: [{ optionId: "yes", name: "Allow once", kind: "allow_once" }, { optionId: "always", name: "Always allow", kind: "allow_always" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
    } else {
      say(s, "hello "); say(s, "there");
      update(s, { sessionUpdate: "tool_call", toolCallId: "t1", title: "read notes.md", kind: "read", status: "pending" });
      update(s, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" });
      end({ usage: { inputTokens: 12, outputTokens: 5 } });
    }
  }
});
