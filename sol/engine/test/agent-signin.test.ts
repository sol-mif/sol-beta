// Step 2, in a real browser (headless Chromium, fake sites on 127.0.0.1, nothing on the screen):
//   signing in   a fake Blackboard whose sign-in is a form post that sets a cookie. The rule meets the sign-in page →
//                the card "Sign in to Blackboard" → his press → the folder's headless browser closes, the same profile
//                opens in "the window" (here headless too, and the test's hand fills the form) → the signed-in page,
//                then the settle time → the window closes → the rule runs again, signed in, from the same profile.
//                No screen: the card says so and nothing opens.
//   the refusals the folder agent's browser tools on fake WhatsApp Web, BU mail and Teams: no typing anywhere there, no
//                click on mail or Teams, on WhatsApp no click on send or the message box, a click on a chat in the list.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const servers: Server[] = [];
async function serve(handler: (path: string, method: string, cookie: string, body: string) => { status?: number; html?: string; headers?: Record<string, string> }): Promise<string> {
  const s = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const r = handler((req.url ?? "/").split("?")[0], req.method ?? "GET", req.headers.cookie ?? "", body);
    res.writeHead(r.status ?? 200, { "content-type": "text/html", ...(r.headers ?? {}) });
    res.end(r.html ?? "");
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body>${body}</body>`;

// the fake Blackboard: everything under /ultra needs the cookie; /login is a form that sets it
const BB = await serve((path, method, cookie) => {
  const inside = /\bbb=1\b/.test(cookie);
  if (path === "/login" && method === "POST") return { status: 303, headers: { location: "/ultra/course", "set-cookie": "bb=1; Path=/; Max-Age=86400" } };
  if (path === "/login") return { html: page("Sign in", `<h1>Sign in</h1><form method="post" action="/login"><input name="user"><input name="password" type="password"><button>Sign in</button></form>`) };
  if (!inside) return { status: 302, headers: { location: "/login" } };
  if (path === "/ultra/course") return { html: page("Courses", "<h1>Courses</h1><p>LA245 _355037_1</p>") };
  return { html: page("LA245", `<h1>${path}</h1><p>Course _355037_1. Week 10. Chapter 11 quiz closes Nov 13 11:59 pm.</p>`) };
});
const WA = await serve(() => ({ html: page("WhatsApp", `<div id="app"><div id="side"><h1>Chats</h1><div id="pane-side" aria-label="Chat list"><div role="listitem"><span title="Day in Court Team 3">Day in Court Team 3</span></div></div></div>
  <div id="main"><div class="message-in"><div data-pre-plain-text="[10:40, 11/9/2026] Leslie Garcia: "><span class="selectable-text">who has the rubric?</span></div></div>
  <footer><div contenteditable="true" aria-label="Type a message" data-tab="10"></div><button aria-label="Send"><span data-icon="send"></span></button></footer></div></div>`) }));
const OUT = await serve(() => ({ html: page("Mail - Inbox", `<h1>Inbox</h1><div role="listbox"><div role="option" data-convid="AAQk1"><span title="dlomax@bu.edu">Dionne Lomax</span><div>Courtroom</div><button>Reply</button></div></div><div contenteditable="true" aria-label="Message body"></div>`) }));
const TEAMS = await serve(() => ({ html: page("Chat | Microsoft Teams", `<h1>Chat</h1><div data-tid="chat-list-item" data-chat-id="c1">Leslie Garcia</div><div contenteditable="true" aria-label="Type a message"></div><button>Send</button>`) }));
process.env.SOL_BLACKBOARD = BB;
process.env.SOL_WHATSAPP = WA;
process.env.SOL_OUTLOOK = OUT;
process.env.SOL_TEAMS = TEAMS;

const { Agents } = await import("../src/agent/index.ts");
const { closeBrowser, runBrowserTool, profileFor, readPage, withPage } = await import("../src/browser.ts");
const { readTickets, readLedger } = await import("../src/agent/store.ts");
const { clickSafe } = await import("../src/agent/guard.ts");

const dir = mkdtempSync(join(tmpdir(), "sol-signin-"));
after(async () => { await closeBrowser(); for (const s of servers) s.close(); rmSync(dir, { recursive: true, force: true }); });

// each test its own folder name: a folder's tabs are its conversation's (agent:<name>), and the browser is one per engine
function home(name: string, policy: string, fname = "la245") {
  const h = join(dir, name), folder = join(h, "school", fname);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "policy.md"), policy);
  writeFileSync(join(folder, "brain.md"), "# LA245\n\nProfessor Dionne Lomax. Blackboard course `_355037_1`. Tue/Thu 9:40.\n");
  return { h, folder };
}
const until = async (f: () => boolean, ms = 30_000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("waited too long"); await new Promise((r) => setTimeout(r, 100)); } };

test("signing in: the card, his press, the window on the same profile, the rule runs signed in", { timeout: 120_000 }, async () => {
  // a screen, as on his Mac: a Linux runner has no DISPLAY, and the card then offers only "later" (the window here is
  // headless either way); the next test says "no screen" with SOL_SIGNIN_SCREEN, which wins over this
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) process.env.DISPLAY = ":0";
  const { h, folder } = home("one", "- [watch] blackboard: every night at 03:00 read the course\n");
  let windows = 0;
  const a = new Agents({
    home: h, jev: null,
    turn: async () => ({ report: "ready", said: "ok", thread: null, ms: 1 }),
    signin: {
      screen: true, settleMs: 400, pollMs: 100,
      // the window: here headless (nothing on the screen in a test); on his Mac it is headless: false
      launch: (profile) => { windows++; return chromium.launchPersistentContext(profile, { headless: true }); },
      // his hand: he types and presses Sign in
      drive: async (ctx) => {
        const p = ctx.pages()[0];
        await p.waitForSelector("input[name=user]", { timeout: 10_000 });
        await p.fill("input[name=user]", "marco");
        await p.fill("input[name=password]", "not-a-real-one");
        await p.click("button");
      },
    },
  });
  // the look in the folder's headless browser meets the sign-in page
  const first = await a.runRule("la245", "blackboard-1");
  assert.equal(first.line, "not signed in");
  const t = first.ticket!;
  assert.equal(t.needs?.title, "Sign in to Blackboard");
  assert.deepEqual(t.needs?.choices, ["sign in to Blackboard", "later"]);
  assert.match(a.page("la245")!, /value="agent.signin"/);   // the page's own button too
  // his press: the window opens on the same profile, he signs in, it closes, the rule runs
  const ans = await a.answer(t.id, "sign in to Blackboard");
  assert.equal(ans.ticket?.state, "ended");
  await until(() => readLedger(folder).some((l) => /baseline/.test(l.made)));
  assert.equal(windows, 1);
  const led = readLedger(folder).map((l) => `${l.read} · ${l.made} · ${l.held}`);
  assert.ok(led.some((l) => /the sign-in window · closed \(signed in\) · runs blackboard-1 now/.test(l)), led.join("\n"));
  // the cookie stayed in the folder's profile: the headless browser reads the course
  const got = await readPage(`${BB}/ultra/courses/_355037_1/outline`, { sessionId: "agent:la245", profile: profileFor(folder) });
  assert.match(got.text, /Course _355037_1/);
});

test("signing in: no screen on this machine, the card says so and nothing opens", { timeout: 60_000 }, async () => {
  const { h, folder } = home("two", "- [watch] blackboard: every night at 03:00 read the course\n", "la246");
  const prev = process.env.SOL_SIGNIN_SCREEN;
  process.env.SOL_SIGNIN_SCREEN = "off";
  try {
    const a = new Agents({ home: h, jev: null, turn: async () => ({ report: "ready", said: "", thread: null, ms: 0 }), signin: { screen: false } });
    const r = await a.runRule("la246", "blackboard-1");
    assert.match(r.ticket!.needs!.line, /no screen/);
    assert.deepEqual(r.ticket!.needs!.choices, ["later"]);
    const s = await a.answer(r.ticket!.id, "sign in to Blackboard");
    assert.equal(s.ticket?.state, "waiting");
    assert.match(s.ticket!.needs!.line, /no screen/);
    assert.equal(readTickets(folder).length, 1);
  } finally { if (prev === undefined) delete process.env.SOL_SIGNIN_SCREEN; else process.env.SOL_SIGNIN_SCREEN = prev; }
});

test("refused in code: no typing, no click on send on WhatsApp Web; nothing but reading on BU mail and Teams", { timeout: 90_000 }, async () => {
  const { h, folder } = home("three", "- [watch, draft] gc: every 30 min 08:00–23:00 read the group\n", "law-project");
  new Agents({ home: h, jev: null });   // sets the guard
  const turn = { sessionId: "agent:law-project", profile: profileFor(folder) };
  const err = (r: { isError?: boolean; content: any[] }) => (r.isError ? String(r.content[0].text) : "");
  // WhatsApp Web
  assert.equal(err(await runBrowserTool("browser_open", { url: WA }, turn)), "");
  assert.match(err(await runBrowserTool("browser_type", { text: "hi all" }, turn)), /refused on WhatsApp Web/);
  assert.match(err(await runBrowserTool("browser_click", { text: "Send" }, turn)), /refused/);
  const found = await runBrowserTool("browser_find", { query: "" }, turn);
  const box = /(\d+)\. [^\n]*Type a message/.exec(String(found.content[0].type === "text" ? found.content[0].text : ""))?.[1];
  assert.ok(box, "the message box is listed");
  assert.match(err(await runBrowserTool("browser_click", { ref: Number(box) }, turn)), /refused/);
  assert.match(err(await runBrowserTool("browser_type", { ref: Number(box), text: "hi" }, turn)), /refused/);
  assert.equal(err(await runBrowserTool("browser_click", { text: "Day in Court Team 3" }, turn)), "");   // a chat in the list: read it
  assert.equal(err(await runBrowserTool("browser_read", {}, turn)), "");
  // the source's own click goes through the same guard
  await assert.rejects(withPage(turn, (p) => clickSafe(p, p.locator('button[aria-label="Send"]'))), /refused/);
  await withPage(turn, (p) => clickSafe(p, p.locator('#pane-side span[title="Day in Court Team 3"]')));
  // BU mail: reading only
  assert.equal(err(await runBrowserTool("browser_open", { url: `${OUT}/mail/inbox` }, turn)), "");
  assert.match(err(await runBrowserTool("browser_click", { text: "Courtroom" }, turn)), /refused on BU mail/);
  assert.match(err(await runBrowserTool("browser_click", { text: "Reply" }, turn)), /refused on BU mail/);
  assert.match(err(await runBrowserTool("browser_type", { text: "Dear Prof" }, turn)), /refused on BU mail/);
  assert.match(err(await runBrowserTool("browser_open", { url: `${OUT}/mail/deeplink/compose` }, turn)), /compose page/);
  assert.equal(err(await runBrowserTool("browser_read", {}, turn)), "");
  // Teams: reading only
  assert.equal(err(await runBrowserTool("browser_open", { url: `${TEAMS}/v2/` }, turn)), "");
  assert.match(err(await runBrowserTool("browser_click", { text: "Leslie Garcia" }, turn)), /refused on Teams/);
  assert.match(err(await runBrowserTool("browser_type", { text: "on it" }, turn)), /refused on Teams/);
  // a tab that is not an agent's (no folder profile) is the person's: not guarded here
  assert.equal(err(await runBrowserTool("browser_open", { url: WA }, { sessionId: "s1" })), "");
});
