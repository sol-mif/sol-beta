// The frame's own routes (#633, and the design's steps 4 to 6; moved from index.ts so it stays under its ceiling, #934):
// GET /things, /things/tools, /things/seats and /keys; a card's press, a key pasted or taken away, back to Sol as it came,
// the after-release card's presses, undo; and the preflight of the two that take JSON. Asked in the order index.ts asked
// them (the release's undo before a block's undo). What none of them answers ends as index.ts ended it: no such route.
// The routes that are the kernel's only (a press, the keys, the seats, factory) answer only while the kernel is there.
import type { IncomingMessage } from "node:http";
import type { Asked, Parts } from "../parts.js";
import { appPage } from "../door.js";
import { contractNow, readThings } from "../things.js";
import { kernelNow, thingTools } from "../kernel.js";
import { passWire, undoPass, closePass } from "../release.js";
import { listKeys, pasteKey, removeKey } from "../keys.js";   // the keys (step 4): pasted on the face, listed without their text
import { appDir } from "../bigroom.js";
import { seatList } from "../seats.js";
import { leftover } from "../leftover.js";

/** a JSON body of at most `max` bytes, sent as application/json (a web page elsewhere cannot without a preflight); null
 *  when it is not that */
async function jsonBody(req: IncomingMessage, max: number): Promise<unknown | null> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return null;
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > max) { req.destroy(); return null; } }
  try { const v = JSON.parse(body || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

async function answer({ HOME, PORT, req, res, path }: Asked) {
  const DOOR = { port: PORT, owner: process.env.SOL_OWNER ?? "" };   // as index.ts's
  if (path === "/things" && req.method === "GET") {
    // what a person's AI made, from their home (#630): the face's frame checks and renders it (mac/src/home/frameRules.ts)
    const origin = req.headers.origin;
    res.writeHead(200, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    const k = kernelNow();   // with the frame on (#633), each thing says what its engine half is doing
    // a block that waits for a person's press says `waiting`: what its card shows (card.ts), drawn by the face
    res.end(JSON.stringify({ contract: contractNow(), things: readThings(HOME).map((t) => (k?.isStable(t.id) ? ((t.record as { off?: unknown } | null)?.off === true ? { ...t, engine: { state: "none", tools: [], off: true } } : t) : k?.state(t.id) ? { ...t, engine: k.state(t.id), ...(k.waiting(t.id) ? { waiting: k.waiting(t.id) } : {}) } : t)), ...(k?.stableBlocks().length ? { stable: k.stableBlocks() } : {}), release: passWire(HOME) }));   // stable: Sol's own blocks (step 7), each with its card when it waits
    return;
  }
  // the kernel's own routes below (a press, the keys, the seats, factory) answer only while the kernel is there: with the
  // frame off none of them is matched, so the engine answers them as main does (no such route), and nothing is written
  if (req.method === "OPTIONS" && kernelNow() && (/^\/things\/[a-z0-9][a-z0-9-]{0,63}\/approve$/.test(path) || /^\/keys(\/[a-z0-9][a-z0-9._-]{0,63}\/delete)?$/.test(path))) {
    // the card's press and a pasted key are JSON, so Sol's window asks first (a preflight): answered for its own pages only
    const origin = req.headers.origin;
    if (!appPage(req.headers, DOOR) || typeof origin !== "string") { res.writeHead(403); res.end(); return; }
    res.writeHead(204, { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "origin" });
    res.end();
    return;
  }
  const approving = /^\/things\/([a-z0-9][a-z0-9-]{0,63})\/approve$/.exec(path);
  if (approving && req.method === "POST" && kernelNow()) {
    // a person's press on a block's card (the design's step 4, card.ts): Sol's own page only (an Origin of the app's; a
    // plain program on this Mac has none), JSON with the print of the card it showed. No seat's tool reaches this
    const origin = req.headers.origin, k = kernelNow();
    const body = await jsonBody(req, 2000);
    const r = !appPage(req.headers, DOOR) ? { ok: false as const, why: "only Sol's own window presses a card" } : body === null ? { ok: false as const, why: "send JSON: { print }" } : k ? await k.approve(approving[1], (body as { print?: unknown }).print) : { ok: false as const, why: "the frame is off on this engine" };
    res.writeHead(r.ok ? 200 : 409, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(r));
    return;
  }
  if (path === "/keys" && req.method === "GET" && kernelNow()) {
    // the keys' notes (keys.ts): name, what it is for, hosts, the blocks using it, when, its scope; never a key's text
    const origin = req.headers.origin;
    res.writeHead(200, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify({ keys: kernelNow()?.keys() ?? listKeys(appDir()) }));
    return;
  }
  const keyGone = /^\/keys\/([a-z0-9][a-z0-9._-]{0,63})\/delete$/.exec(path);
  if ((path === "/keys" || keyGone) && req.method === "POST" && kernelNow()) {
    // a key pasted on the face, straight to the engine and never through a chat (no seat sees it), or taken away: Sol's
    // own page only, JSON. The text is kept 0600 and never said again; one line on the log, without it
    const origin = req.headers.origin, k = kernelNow();
    const body = keyGone ? {} : await jsonBody(req, 16_000);
    let r: { ok: boolean; why?: string; meta?: unknown };
    if (!appPage(req.headers, DOOR)) r = { ok: false, why: "only Sol's own window pastes or takes away a key" };
    else if (body === null) r = { ok: false, why: "send JSON: { name, key, purpose, hosts }" };
    else if (keyGone) { const ok = removeKey(appDir(), keyGone[1]); r = ok ? { ok } : { ok, why: `there is no key ${keyGone[1]}` }; if (ok) k?.append("key.removed", keyGone[1], {}, { person: "person" }); }
    else { const p = pasteKey(appDir(), body as { name: unknown; key: unknown }); r = p.ok ? { ok: true, meta: p.meta } : p; if (p.ok) k?.append("key.pasted", p.meta.name, { hosts: p.meta.hosts }, { person: "person" }); }
    if (r.ok) void k?.sync();   // a block that waited for this key loads; one that used a key taken away waits for it
    res.writeHead(r.ok ? 200 : 409, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(r));
    return;
  }
  if (path === "/things/seats" && req.method === "GET" && kernelNow()) {
    // the seats on the seam (step 6, seats.ts): Sol's own two and any a block provides, with the optional parts each has
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ seats: seatList() }));
    return;
  }
  if (path === "/things/tools" && req.method === "GET") {
    // the tools the loaded blocks registered, for Codex's MCP server (mcp-stdio.ts); none with the frame off (#633)
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ tools: thingTools().map(({ name, description, args }) => ({ name, description, args })) }));
    return;
  }
  if ((path === "/things/release/undo" || path === "/things/release/close") && req.method === "POST") {
    // the after-release card's two presses (#634, release.ts): undo puts the whole pass back in one step, close lets the
    // card go. No body, as /letgo: the door above lets in only Sol's own pages and this machine's programs
    const origin = req.headers.origin;
    const out = path.endsWith("/undo") ? { ok: true, ...(undoPass(HOME) ?? { undone: [], kept: [] }) } : { ok: closePass(HOME) };
    res.writeHead(200, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(out));
    return;
  }
  if (path === "/things/factory" && req.method === "POST" && kernelNow()) {
    // back to Sol as it came (step 5, kernel.ts factory): every block in the home taken out, none deleted. Sol's own page only
    const origin = req.headers.origin, k = kernelNow();
    const r = !appPage(req.headers, DOOR) ? { ok: false, why: "only Sol's own window does this" } : k ? { ok: true, ...(await k.factory()) } : { ok: false, why: "the frame is off on this engine" };
    res.writeHead(r.ok ? 200 : 409, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(r));
    return;
  }
  const undoing = /^\/things\/([a-z0-9][a-z0-9-]{0,63})\/undo$/.exec(path);
  if (undoing && req.method === "POST") {
    // undo (#633): the block one version back, one line on the log, no confirm (the door above lets only Sol's own pages in)
    const origin = req.headers.origin, k = kernelNow();
    const r = k ? await k.undo(undoing[1]) : { ok: false as const, why: "the frame is off on this engine" };
    res.writeHead(r.ok ? 200 : 409, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(r));
    return;
  }
  res.writeHead(404);
  res.end();
}

export default function (p: Parts) {
  if (leftover(import.meta.url)) return;   // built by a later release than the one running: an older engine answers these
  p.route("GET", /^\/(things|things\/tools|things\/seats|keys)$/, answer);
  p.route("POST", /^\/(keys|keys\/[a-z0-9][a-z0-9._-]{0,63}\/delete|things\/release\/(undo|close)|things\/factory|things\/[a-z0-9][a-z0-9-]{0,63}\/(approve|undo))$/, answer);
  p.route("OPTIONS", /^\/(things\/[a-z0-9][a-z0-9-]{0,63}\/approve|keys(\/[a-z0-9][a-z0-9._-]{0,63}\/delete)?)$/, answer);
}
