// The jobs folder's agent end to end, on a real engine (its own port, home and browser profile), all on fakes: a local
// static "company" site (a team page, a careers page, two postings) and a stand-in Codex (SOL_CODEX) that does what
// each task asks by reading that site, so nothing leaves the machine.
//   the people rule (agent.run) → people/ files + a wouldHave card "N new people: keep / drop", a choice per person
//   keep (the page's form) → a variant each, a draft each → the card shows it whole: sent · edit · skip
//   "sent" ×3 and "replied" (the page's forms) → the numbers on /agent/jobs
//   the postings rule → two folders, each with posting.md, fit.md, answers.md (cover.md where asked) and a card
// Set JOBS_E2E_OUT=<file> to keep what each step answered (REPORT-jobs.md quotes it).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
const PORT = await freePort();   // a port nobody holds (#938): a fixed range of nine met another suite on the same runner
const dir = mkdtempSync(join(tmpdir(), "sol-jobs-e2e-"));
const home = join(dir, "home"), folder = join(home, "jobs");
const record: Record<string, unknown> = {};

// ---- the fake company ----
const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1>${body}</body>`;
const SITE: Record<string, string> = {
  "/team": page("Acme Agents · Team", [
    `<div class="p"><h3>Dana Lee</h3><p>Staff engineer, agent tooling · San Francisco</p><p>Wrote "Evals for tool calls".</p><p>dana@acme.example</p></div>`,
    `<div class="p"><h3>Sam Roe</h3><p>Product lead, developer platform · San Francisco</p><p>BU '19.</p></div>`,
    `<div class="p"><h3>Ana Diaz</h3><p>Founding engineer · Oakland</p><p>Builds the agent runtime.</p></div>`,
  ].join("")),
  "/careers": page("Careers", `<a href="/careers/product-intern">Product engineer intern, summer 2027</a><a href="/careers/infra-intern">Infrastructure intern, summer 2027</a>`),
  "/careers/product-intern": page("Product engineer intern, summer 2027", "<p>San Francisco. Build agent tooling with the product team.</p><h2>Apply</h2><p>Cover letter required.</p><ol><li>Why Acme?</li><li>Tell us about a product you built.</li></ol>"),
  "/careers/infra-intern": page("Infrastructure intern, summer 2027", "<p>Boston or remote. Keep our agent runtime fast.</p><h2>Apply</h2><ol><li>Describe a system you made faster.</li></ol>"),
};
const site: Server = createServer((req, res) => {
  const html = SITE[(req.url ?? "/").split("?")[0].replace(/\/+$/, "")];
  res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
  res.end(html ?? page("Not found", "404"));
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));
const SITE_URL = `http://127.0.0.1:${(site.address() as { port: number }).port}`;

// ---- the stand-in Codex: reads the task in the prompt, reads the fake site, writes what the task asks ----
writeFileSync(join(dir, "codex"), `#!${process.execPath}
const a = process.argv.slice(2), cd = a[a.indexOf("--cd") + 1] ?? process.cwd();
const fs = require("fs"), path = require("path");
const SITE = ${JSON.stringify(SITE_URL)};
const get = async (p) => (await fetch(SITE + p)).text();
const text = (h) => h.replace(/<[^>]+>/g, "\\n").split("\\n").map((l) => l.trim()).filter(Boolean);
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(cd, rel)), { recursive: true }); fs.writeFileSync(path.join(cd, rel), s); };
let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", async () => {
  fs.appendFileSync(path.join(${JSON.stringify(dir)}, "prompts.txt"), input + "\\n=====\\n");
  const job = (/"job": "([a-z-]+)"/.exec(input) || [])[1] || "";
  const today = "2026-11-10";
  let said = "nothing to do";
  if (job === "people") {
    const html = await get("/team");
    for (const block of html.split('<div class="p">').slice(1)) {
      const [name, roleWhere, note, mail] = text(block);
      const [role, where] = roleWhere.split(" · ");
      const slug = name.toLowerCase().replace(/ /g, "-");
      const reach = mail && mail.includes("@") ? "email " + mail + " (shown on " + SITE + "/team)" : "email " + slug.split("-")[0] + "@acme.example";
      w("people/" + slug + ".md", "# " + name + "\\n- where: " + where + "\\n- company: Acme Agents\\n- role: " + role + "\\n- why: " + note + " That is the layer Sol is built on.\\n- link: " + SITE + "/team\\n- reach: " + reach + "\\n- state: found\\n- variant:\\n\\n## Touches\\n- " + today + " found on " + SITE + "/team\\n");
    }
    said = "Read " + SITE + "/team; wrote three people.";
  } else if (job === "draft") {
    const file = (/Write it to (outreach\\/drafts\\/[^:\\s]+):/.exec(input) || [])[1];
    const person = (/"person": "([a-z0-9-]+)"/.exec(input) || [])[1];
    const variant = (/outreach\\/variants\\/([a-z0-9-]+)\\.md/.exec(input) || [])[1];
    w(file, "# To " + person + " · " + variant + " · email\\nSubject: a question from a BU junior\\n\\nHi, I'm Marco, a BU Questrom junior building Sol. I hope this finds you well. Could we have a 15-minute coffee on Sat Nov 28?\\n\\nMarco\\n");
    said = "Wrote " + file + ".";
  } else if (job === "plan") {
    const f = path.join(cd, "sf-trip", "plan.md");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/\\| - \\| - \\|/g, "| Blue Bottle, Mint Plaza | how they started on agent tooling |"));
    said = "Filled the plan.";
  } else if (job === "postings") {
    for (const [slug, p, score, cover] of [["acme-agents-product-engineer-intern", "/careers/product-intern", 8, "yes"], ["acme-agents-infrastructure-intern", "/careers/infra-intern", 7, "no"]]) {
      const t = text(await get(p));
      const qs = t.slice(t.indexOf("Apply") + 1).filter((l) => l.endsWith("?") || l.startsWith("Describe") || l.startsWith("Tell"));
      w("applications/" + slug + "/posting.md", "# " + t[0] + " at Acme Agents\\n- company: Acme Agents\\n- role: " + t[0] + "\\n- link: " + SITE + p + "\\n- seen: " + today + "\\n- where: " + t[2].split(".")[0] + "\\n- cover: " + cover + "\\n- score: " + score + "\\n- state: found\\n\\n" + t.slice(1).join("\\n") + "\\n\\n## Questions\\n" + qs.map((q) => "- " + q).join("\\n") + "\\n");
      w("applications/" + slug + "/fit.md", "# Fit\\nStrong: builds Sol, an agent tool.\\nThin: [gap: an internship before].\\n");
    }
    said = "Saved two postings.";
  } else if (job === "application") {
    const app = (/"app": "([a-z0-9-]+)"/.exec(input) || [])[1];
    w("applications/" + app + "/answers.md", "# Answers\\n\\n## Why Acme?\\nYou build the layer Sol stands on.\\n");
    if (/- cover\\.md: a cover letter/.test(input)) w("applications/" + app + "/cover.md", "# Cover letter\\nDear Acme, …\\n");
    said = "Answers drafted for " + app + ".";
  }
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
  out({ type: "thread.started", thread_id: a.includes("resume") ? a[a.indexOf("resume") + 1] : "fake-thread-jobs" });
  out({ type: "turn.started" });
  out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: said + "\\n" + JSON.stringify({ report: "ready" }) } });
  out({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
});
`);
chmodSync(join(dir, "codex"), 0o755);

// ---- the home: jobs with its policy (all in watch), me.md and the approach ----
mkdirSync(join(folder, "sf-trip"), { recursive: true });
writeFileSync(join(folder, "policy.md"), readFileSync(join(import.meta.dirname, "fixtures", "jobs-policy.md"), "utf8"));
writeFileSync(join(folder, "me.md"), "# me, in jobs\n- BU Questrom, junior. Building Sol (one window for all your AI).\n- Targets: product / infra / agent tooling; SF and Boston; internships summer 2027.\n");
writeFileSync(join(folder, "sf-trip", "approach.md"), "Who: BU alumni in SF at product/infra/agent-tooling companies.\n");

let engine: ChildProcess | null = null;
const sockets: WebSocket[] = [];
after(async () => {
  for (const s of sockets) s.terminate();
  const e = engine;
  if (e && e.exitCode === null && e.signalCode === null) {
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  site.close();
  if (process.env.JOBS_E2E_OUT) writeFileSync(process.env.JOBS_E2E_OUT, JSON.stringify(record, null, 2) + "\n");
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true }); else console.log("kept:", dir);
});

async function up() {
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_CODEX: join(dir, "codex"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
      SOL_AGENT_CLOCK: "off", JEV_API_KEY: "",
    },
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the test engine did not come up");
}

type Msg = { type: string; [k: string]: any };
async function ask(m: object & { type: string }, ms = 90_000): Promise<Msg> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  sockets.push(ws);
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const rid = Math.random().toString(36).slice(2);
  const got = new Promise<Msg>((ok, no) => {
    const t = setTimeout(() => no(new Error(`no answer to ${m.type}`)), ms);
    ws.on("message", (raw) => { const x = JSON.parse(raw.toString()) as Msg; if (x.type === m.type && x.rid === rid) { clearTimeout(t); ok(x); } });
  });
  ws.send(JSON.stringify({ ...m, rid }));
  const x = await got;
  ws.close();
  return x;
}
/** a press on the page: a form post, as the button sends it */
async function press(fields: Record<string, string>) {
  const r = await fetch(`http://127.0.0.1:${PORT}/agent/jobs`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
  assert.equal(r.status, 303);
}
async function until<T>(what: string, f: () => Promise<T | null | undefined | false>, ms = 60_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const x = await f();
    if (x) return x;
    if (Date.now() - t0 > ms) throw new Error(`waited ${ms / 1000} s for ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const cards = async () => (await ask({ type: "agent.tickets", folder: "jobs" })).cards as any[];
const html = async () => (await fetch(`http://127.0.0.1:${PORT}/agent/jobs`)).text();
const person = (slug: string) => readFileSync(join(folder, "people", `${slug}.md`), "utf8");

test("the jobs folder's agent: people → keep → drafts → sent and replied → the numbers; postings → folders and cards", { timeout: 300_000 }, async () => {
  await up();

  // the people rule: three files, one card with a choice per person, held (watch)
  const run = await ask({ type: "agent.run", folder: "jobs", ruleId: "clock-2" });
  assert.equal(run.ok, true, JSON.stringify(run));
  const card = run.ticket.needs;
  record.peopleCard = card;
  assert.equal(card.title, "3 new people: keep / drop");
  assert.equal(card.wouldHave, true);
  assert.deepEqual(card.items.map((i: any) => i.key), ["ana-diaz", "dana-lee", "sam-roe"]);
  assert.match(person("dana-lee"), /- reach: email dana@acme\.example \(shown on http:\/\/127\.0\.0\.1:\d+\/team\)/);
  assert.match(person("sam-roe"), /- reach: none found/);   // the guessed address, taken out
  assert.match(person("sam-roe"), /address taken out \(no public page shown for it\): sam@acme\.example/);
  assert.equal(readdirSync(join(folder, "outreach", "variants")).length, 4);
  let page = await html();
  assert.match(page, /3 new people: keep \/ drop/);
  assert.match(page, /would have shown \(watch\)/);
  assert.match(page, /name="choice" value="keep · dana-lee"/);

  // keep all three from the page
  for (const s of ["dana-lee", "sam-roe", "ana-diaz"]) await press({ type: "agent.answer", ticketId: card.ticketId, choice: `keep · ${s}` });
  const drafts = await until("three draft cards", async () => { const cs = (await cards()).filter((c) => /^Draft to /.test(c.title)); return cs.length === 3 && cs; });
  record.draftCard = drafts.find((c: any) => c.title.includes("Dana"));
  const variants = ["dana-lee", "sam-roe", "ana-diaz"].map((s) => /- variant: (\S+)/.exec(person(s))![1]);
  assert.equal(new Set(variants).size, 3, variants.join(" "));   // balanced: three people, three variants
  for (const c of drafts) { assert.deepEqual(c.choices, ["sent", "edit", "skip"]); assert.match(c.body, /15-minute coffee on Sat Nov 28/); }
  page = await html();
  assert.match(page, /<div class="jb-body"># To dana-lee/);

  // he trims the draft and presses sent, three times; Dana replies
  writeFileSync(join(folder, "outreach", "drafts", "dana-lee.md"), readFileSync(join(folder, "outreach", "drafts", "dana-lee.md"), "utf8").replace(" I hope this finds you well.", ""));
  for (const c of drafts) await press({ type: "agent.answer", ticketId: c.ticketId, choice: "sent" });
  await until("three sent", async () => ["dana-lee", "sam-roe", "ana-diaz"].every((s) => /- state: sent/.test(person(s))));
  const edits = readFileSync(join(folder, "outreach", "edits.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  record.edits = edits.map((e) => ({ person: e.person, variant: e.variant, edit: e.edit }));
  assert.deepEqual(edits.find((e) => e.person === "dana-lee").edit.removed, ["I hope this finds you well."]);
  const danaT = drafts.find((c: any) => c.title.includes("Dana")).ticketId;
  page = await html();
  assert.match(page, new RegExp(`name="ticketId" value="${danaT}"><input type="hidden" name="choice" value="replied"`));
  await press({ type: "agent.answer", ticketId: danaT, choice: "replied" });
  await until("Dana replied and the plan", async () => /- state: replied/.test(person("dana-lee")) && existsSync(join(folder, "sf-trip", "plan.md")) && /Blue Bottle/.test(readFileSync(join(folder, "sf-trip", "plan.md"), "utf8")));
  record.plan = readFileSync(join(folder, "sf-trip", "plan.md"), "utf8").split("\n").filter((l) => l.startsWith("| ["));
  page = await html();
  const dv = variants[0];
  assert.match(page, /<span><b>2<\/b>sent<\/span><span><b>1<\/b>replied<\/span>/);
  assert.match(page, new RegExp(`<b>${dv}</b><span>1 sent · 1 replied · 0 met · \\d+ % likely the best</span>`));
  // four variants, three people: the one nobody drew may be named first ("x has 0 sent, y has 1 sent, …")
  assert.match(page, /No winner yet: (?:[a-z-]+ has 0 sent, )?[a-z-]+ has 1 sent/);
  record.board = page.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/>\s*</g, ">\n<").split("\n").filter((l) => /jb-counts|<b>[a-z-]+<\/b><span>|No winner|<td>/.test(l)).slice(0, 20);

  // the postings rule: two folders, Jev not there (no key): the run's score decides; each gets its answers and a card
  const apps = await ask({ type: "agent.run", folder: "jobs", ruleId: "clock-1" });
  assert.equal(apps.ok, true, JSON.stringify(apps));
  const applyCards = await until("two Apply cards", async () => { const cs = (await cards()).filter((c) => /^Apply: /.test(c.title)); return cs.length === 2 && cs; });
  record.applyCards = applyCards;
  const prod = join(folder, "applications", "acme-agents-product-engineer-intern"), infra = join(folder, "applications", "acme-agents-infrastructure-intern");
  assert.deepEqual(readdirSync(prod).sort(), ["answers.md", "cover.md", "fit.md", "posting.md"]);
  assert.deepEqual(readdirSync(infra).sort(), ["answers.md", "fit.md", "posting.md"]);   // no cover asked, none written
  assert.match(readFileSync(join(prod, "posting.md"), "utf8"), /- state: drafted/);
  for (const c of applyCards) { assert.deepEqual(c.choices, ["open the form", "applied", "skip"]); assert.equal(c.wouldHave, true); }
  const board = readFileSync(join(folder, "applications", "board.md"), "utf8");
  record.applicationsBoard = board.split("\n").filter((l) => l.startsWith("| "));
  assert.match(board, /\| Product engineer intern, summer 2027 \| Acme Agents \| drafted \| 2026-11-10 \| open the form, apply yourself, press applied \|/);
  // resume/ is empty: one card asks for it
  assert.ok((await cards()).some((c) => c.title === "Put your résumé PDF in jobs/resume/"));
  // he applied to one
  await press({ type: "agent.answer", ticketId: applyCards.find((c: any) => c.title.includes("Product")).ticketId, choice: "applied" });
  await until("applied on the board", async () => /\| Product engineer intern, summer 2027 \| Acme Agents \| applied \|/.test(readFileSync(join(folder, "applications", "board.md"), "utf8")));
  page = await html();
  assert.match(page, /<td>Product engineer intern, summer 2027<\/td><td>Acme Agents<\/td><td>applied<\/td>/);

  // every run's prompt said: never type, never sign in, never send
  const prompts = readFileSync(join(dir, "prompts.txt"), "utf8");
  assert.match(prompts, /browser_type is refused here/);
  assert.doesNotMatch(prompts.split("=====").find((p) => /"job": "draft"/.test(p)) ?? "", /send it for him/i);
  record.ledger = readFileSync(join(folder, "ledger.md"), "utf8").trim().split("\n").filter((l) => l.startsWith("- "));
});
