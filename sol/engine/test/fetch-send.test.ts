// A big room's request as the engine sends it (bigroom.ts: fetchRefusal, fetchFor, httpsSend), against a real https
// server on this machine (step 0b, after review). Two holes came with node's https in place of fetch, and each is shut
// here: a block's own host header took the request, and a key bound to the declared host, to another name on the same
// server; and a compressed answer, which fetch read out and raw https does not, hid an echoed key from being cut out.
// Two more on the same road (review round 2): a key the 8 MB cut went through left its start in the answer, and a
// block's header that asks for another charset (accept-charset, a-im, want-digest, ...) had the key come back spelled
// so that it was not found. And the rule that ends that list (review round 3): a keyed answer is checked itself, since a
// path or query the block chooses can have a server answer in utf-16 whatever the headers say: strict utf-8, no byte
// order mark, no NUL, a utf-8 label or none; and the block's accept and content-type go out as plain utf-8 asks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { TLSSocket } from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fetchRefusal, fetchFor, httpsSend, useSend, type Send } from "../src/bigroom.ts";
import { columnsOf, type Columns } from "../src/record.ts";
import { freePort } from "./test-engine.ts";

const OPENSSL = "/usr/bin/openssl";
// the port a server here listens on: the system names a free one (#938, #1144)
const PORT = await freePort(), KEY = "ghp_SECRETKEY_999", MAX = 8 * 1024 * 1024;
const cols = (r: Record<string, unknown>) => (columnsOf(r) as { columns: Columns }).columns;
const c = cols({ room: "big", needs: { why: "x", keys: ["github"], domains: [`localhost:${PORT}`] } });

let dir = "", server: Server | null = null, ours: Send | null = null;
type Seen = { path: string; host?: string; sni: string | false; ae?: string; auth?: string; te?: string; ac?: string; accept?: string; ct?: string };
const seen: Seen[] = [];
const last = () => seen[seen.length - 1];

before(async () => {
  if (!existsSync(OPENSSL)) return;
  dir = mkdtempSync(join(tmpdir(), "sol-fetch-send-"));
  // a certificate for this host and another name, as a server that answers several names on one certificate has
  execFileSync(OPENSSL, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,DNS:other.example,IP:127.0.0.1"], { stdio: "ignore" });
  server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    const path = req.url ?? "/";
    seen.push({ path, host: req.headers.host, sni: (req.socket as TLSSocket).servername, ae: req.headers["accept-encoding"] as string | undefined, auth: req.headers.authorization, te: req.headers["transfer-encoding"] as string | undefined, ac: req.headers["accept-charset"] as string | undefined, accept: req.headers.accept, ct: req.headers["content-type"] });
    const echo = `echo: ${req.headers.authorization ?? ""}`;
    if (path === "/never") return;   // takes the request and never answers
    if (path === "/gzip") { res.writeHead(401, { "content-encoding": "gzip" }); res.end(req.method === "HEAD" ? undefined : gzipSync(echo)); return; }
    if (path === "/asked") {
      const gz = /gzip/.test(String(req.headers["accept-encoding"] ?? ""));
      res.writeHead(200, gz ? { "content-encoding": "gzip" } : {}); res.end(gz ? gzipSync(echo) : echo); return;
    }
    if (path === "/odd") { res.writeHead(401, { "content-encoding": "x-odd" }); res.end(echo); return; }
    if (path === "/bomb") { res.writeHead(200, { "content-encoding": "gzip" }); res.end(gzipSync(Buffer.alloc(9 * 1024 * 1024, 0x61))); return; }
    // the key echoed so that it starts `at` bytes before the 8 MB cut
    const near = /^\/near\/(\d+)$/.exec(path);
    if (near) { const at = Number(near[1]); res.writeHead(200); res.end("a".repeat(MAX - at - "echo: Bearer ".length) + echo + "b".repeat(64)); return; }
    // an answer in another charset, as a server that honours a block's accept-charset gives it
    if (path === "/utf16") { res.writeHead(200, { "content-type": "text/plain; charset=utf-16le" }); res.end(req.method === "HEAD" ? undefined : Buffer.from(echo, "utf16le")); return; }
    // the echo spelled as the query asks and labelled as it says, whatever the request's headers asked: a block chooses
    // the query, so no header rule can stop this answer
    if (path.startsWith("/spell?")) {
      const q = new URL(path, "https://x").searchParams;
      const b = Buffer.from(echo + (q.get("tail") ?? ""), (q.get("enc") ?? "utf8") as BufferEncoding);
      res.writeHead(200, q.get("label") ? { "content-type": `text/plain; charset=${q.get("label")}` } : {});
      res.end(q.get("bom") ? Buffer.concat([Buffer.from(q.get("bom")!, "hex"), b]) : b); return;
    }
    // over 8 MB of two-byte characters, the cut going through one, and the key in the part cut off
    if (path === "/wide") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end("a" + "é".repeat(MAX / 2 + 64) + echo); return; }
    if (path === "/utf8") { res.writeHead(200, { "content-type": "text/plain; Charset=\"UTF-8\"" }); res.end(echo); return; }
    res.writeHead(401); res.end(echo);
  });
  await new Promise<void>((ok) => server!.listen(PORT, "127.0.0.1", ok));
  ours = httpsSend(readFileSync(join(dir, "c.pem"), "utf8"));
  useSend(ours);
});
after(async () => {
  useSend(null);
  if (server) { server.closeAllConnections(); await new Promise((ok) => server!.close(ok)); }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const ask = (path: string, opts: Record<string, unknown> = {}) => fetchRefusal(c, { url: `https://localhost:${PORT}${path}`, opts });
const why = (r: ReturnType<typeof ask>) => ("why" in r ? r.why : "");
/** a request the refusal let through, sent as the kernel sends it */
async function sent(path: string, opts: Record<string, unknown> = {}, ms = 5000) {
  const r = ask(path, opts);
  if ("why" in r) throw new Error(r.why);
  return fetchFor(r, r.key ? KEY : null, ms);
}

test("a block does not say where its request goes or how it is framed, nor send these as its key's header", () => {
  for (const h of ["host", "Host", "content-length", "transfer-encoding", "connection", "upgrade", "te", "trailer", "keep-alive", "expect", "proxy-authorization", "Proxy-Connection"]) {
    assert.match(why(ask("/", { headers: { [h]: "x" } })), new RegExp(`the header ${h} is the engine's to send`), h);
  }
  for (const as of ["host", "Transfer-Encoding", "accept-encoding", "range"]) assert.match(why(ask("/", { key: "github", keyAs: as })), /a key does not go as/, as);
  // with a key on it, no coding and no part of the answer the block picks: the key could not be found in what comes back
  for (const h of ["accept-encoding", "Range", "if-range"]) assert.match(why(ask("/", { key: "github", headers: { [h]: "gzip" } })), /is not sent with a key/, h);
  assert.ok(!("why" in ask("/", { headers: { "accept-encoding": "gzip", "x-api": "1", authorization: "Bearer mine" } })), "without a key a block may ask for a coding, and send its own headers");
  assert.ok(!("why" in ask("/", { key: "github", keyAs: "x-api-key" })));
});

test("the request goes to the host its address names, by Host and by TLS name, whatever host header reaches the sender", { skip: !existsSync(OPENSSL) }, async () => {
  const r = ask("/where", { key: "github" });
  assert.ok(!("why" in r));
  // past the refusal, as if it had let one through: the sender says the host itself
  await fetchFor({ ...r, headers: { host: "other.example", "transfer-encoding": "chunked", connection: "upgrade", upgrade: "x" } }, KEY, 5000);
  assert.equal(last().path, "/where");
  assert.equal(last().host, `localhost:${PORT}`);
  assert.equal(last().sni, "localhost");
  assert.equal(last().auth, `Bearer ${KEY}`, "the key went to the declared host only");
  assert.equal(last().te, undefined);
  // and with no key, where nothing before the sender drops a header: a forged host still goes nowhere but the address,
  // by TLS name (servername) and by Host (the sender's own filter)
  const bare = ask("/where");
  assert.ok(!("why" in bare));
  await fetchFor({ ...bare, headers: { host: "other.example" } }, null, 5000);
  assert.equal(last().path, "/where");
  assert.equal(last().sni, "localhost", "the TLS name is the address's host");
  assert.equal(last().host, `localhost:${PORT}`);
});

test("a compressed answer is read out before the key is cut, and the engine asks for none", { skip: !existsSync(OPENSSL) }, async () => {
  const a = await sent("/gzip", { key: "github" });
  assert.equal(last().ae, "identity", "it asks for no coding");
  assert.equal(a.status, 401);
  assert.equal(a.body, "echo: Bearer [key]", "a server that compresses anyway: read out, and the key cut out of it");
  // without a key a block may ask for a coding; it gets the answer read out, as fetch handed it
  const b = await sent("/asked", { headers: { "accept-encoding": "gzip" } });
  assert.equal(last().ae, "gzip");
  assert.equal(b.headers["content-encoding"], "gzip");
  assert.equal(b.body, "echo: ");
  // a coding the engine cannot read: with a key it is an error, never a body; without one it is the body as it came
  await assert.rejects(sent("/odd", { key: "github" }), /the answer came coded as x-odd, which the engine cannot read to cut the key out of it/);
  assert.equal((await sent("/odd")).body, "echo: ");
  // nothing to read out (a HEAD) is an empty body, not an error
  assert.equal((await sent("/gzip", { method: "HEAD", key: "github" })).body, "");
  // the cap is on what is read out, not on what came: 9 MB of a's in a few kB
  const big = await sent("/bomb");
  assert.equal(big.body.length, 8 * 1024 * 1024 + "\n[cut at 8388608 bytes]".length);
  assert.ok(big.body.endsWith("a\n[cut at 8388608 bytes]"));
});

test("a request past its time is said to be past its time", { skip: !existsSync(OPENSSL) }, async () => {
  await assert.rejects(sent("/never", {}, 300), (e: Error) => e.name === "TimeoutError" && /did not finish within 300 ms/.test(e.message));
});

test("a key the 8 MB cut goes through is cut out whole: no start of it is left in the answer", { skip: !existsSync(OPENSSL) }, async () => {
  const tail = `\n[cut at ${MAX} bytes]`;
  for (const at of [7, 1, 0, KEY.length - 1]) {
    const a = await sent(`/near/${at}`, { key: "github" });
    assert.ok(a.body.endsWith(`echo: Bearer ${tail}`), `the key starts ${at} bytes before the cut: the answer ends where it starts`);
    assert.ok(!a.body.includes(KEY.slice(0, Math.max(1, Math.min(at, 4)))), `${at}: none of the key is left`);
    assert.ok(a.body.length <= MAX + tail.length);
  }
  // a key that ends at the cut, or before it, is in the answer whole and cut out as any other
  for (const at of [KEY.length, KEY.length + 5]) {
    const a = await sent(`/near/${at}`, { key: "github" });
    assert.ok(a.body.includes("echo: Bearer [key]"), `${at}`);
    assert.ok(!a.body.includes("ghp_"));
    assert.ok(a.body.endsWith(tail));
  }
  // without a key the cut is where it always was, at 8 MB to the byte
  const b = await sent("/near/7");
  assert.equal(b.body.length, MAX + tail.length);
  assert.ok(b.body.endsWith(`echo: ${"b".repeat(14)}${tail}`));
});

test("with a key a block sends only the headers that cannot change how the answer is spelled, and gets utf-8 or nothing", { skip: !existsSync(OPENSSL) }, async () => {
  // the headers that ask a server to spell its answer another way: refused with a key, as is a key sent as one of them
  for (const h of ["accept-charset", "A-IM", "want-digest", "want-content-digest", "prefer", "cookie", "x-anything"]) {
    assert.match(why(ask("/", { key: "github", headers: { [h]: "utf-16" } })), /is not sent with a key/, h);
    assert.ok(!("why" in ask("/", { headers: { [h]: "utf-16" } })), `${h} without a key is the block's own`);
  }
  for (const as of ["accept-charset", "a-im", "want-digest", "accept"]) assert.match(why(ask("/", { key: "github", keyAs: as })), /a key does not go as/, as);
  assert.match(why(ask("/", { key: "github", headers: { accept: "text/plain; charset=utf-16" } })), /charset/);
  const ok = ask("/", { key: "github", keyAs: "x-api-key", headers: { Accept: "application/json; charset=utf-8", "content-type": "application/json", "accept-language": "en", "user-agent": "mine", "x-github-api-version": "2022-11-28", "if-none-match": "\"e\"" } });
  assert.ok(!("why" in ok), "why" in ok ? ok.why : "");
  // past the refusal, as if it had let them through: the sender asks for identity, and the rest never leaves
  const r = ask("/utf8", { key: "github" });
  assert.ok(!("why" in r));
  await fetchFor({ ...r, headers: { "accept-encoding": "gzip", "accept-charset": "utf-16" } }, KEY, 5000);
  assert.equal(last().ae, "identity");
  assert.equal(last().ac, undefined);
  // and it is the request's own word, not the sender's habit: a sender that would ask for nothing is still told identity
  let told: Record<string, string> = {};
  useSend(async (_u, o) => { told = o.headers; return { status: 200, headers: {}, body: "" }; });
  try { await fetchFor({ ...r, headers: {} }, KEY, 5000); } finally { useSend(ours); }
  assert.equal(told["accept-encoding"], "identity");
  // an answer that names another charset: with a key an error, never a body
  await assert.rejects(sent("/utf16", { key: "github" }), /the answer came in utf-16le, which the engine cannot read to cut the key out of it/);
  assert.equal((await sent("/utf16", { method: "HEAD", key: "github" })).body, "", "nothing came, nothing to hide");
  assert.equal((await sent("/utf16")).status, 200, "without a key it is the block's to read");
  assert.equal((await sent("/utf8", { key: "github" })).body, "echo: Bearer [key]");
});

test("a keyed answer is utf-8 in its bytes or an error: one in utf-16 is refused even when it says it is utf-8", { skip: !existsSync(OPENSSL) }, async () => {
  const keyed = (q: string) => sent(`/spell?${q}`, { key: "github" });
  const refused = /so the engine cannot be sure to cut the key out of it/;
  // the brief's own case: utf-16 with no byte order mark, labelled utf-8. ascii in utf-16 is valid utf-8 with NULs in it
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(`echo: Bearer ${KEY}`, "utf16le")).replaceAll("\0", ""), `echo: Bearer ${KEY}`);
  await assert.rejects(keyed("enc=utf16le&label=utf-8"), /has a NUL byte in it/);
  await assert.rejects(keyed("enc=utf16le"), /has a NUL byte in it/, "nor with no label at all");
  // a byte order mark, utf-8's own or utf-16's, and bytes that are not utf-8 (latin-1)
  await assert.rejects(keyed("bom=efbbbf&label=utf-8"), /starts with a byte order mark/);
  await assert.rejects(keyed("enc=utf16le&bom=fffe&label=utf-8"), refused);
  await assert.rejects(keyed("enc=latin1&tail=%E9t%E9&label=utf-8"), /is not utf-8/);
  // a label other than utf-8 is an error even when the bytes are ascii: the label is utf-8 or none
  await assert.rejects(keyed("label=us-ascii"), /the answer came in us-ascii/);
  // utf-8, labelled or not, is the answer with the key cut out
  assert.equal((await keyed("label=utf-8&tail=%C3%A9t%C3%A9")).body, "echo: Bearer [key]été");
  assert.equal((await keyed("")).body, "echo: Bearer [key]");
  // without a key every one of them is the block's to read, as before
  for (const q of ["enc=utf16le&label=utf-8", "bom=efbbbf", "enc=latin1&tail=%E9"]) assert.equal((await sent(`/spell?${q}`)).status, 200, q);
  // an 8 MB cut through a two-byte character is the cut, not an error: the half character is left out
  const w = await sent("/wide", { key: "github" });
  assert.ok(w.body.endsWith("é\n[cut at 8388608 bytes]"));
  assert.ok(!w.body.includes("\ufffd") && !w.body.includes("Bearer"));
});

test("with a key a block's accept goes as its media types alone, and its content-type as utf-8", { skip: !existsSync(OPENSSL) }, async () => {
  assert.match(why(ask("/", { key: "github", headers: { "content-type": "application/json; charset=utf-16" } })), /content-type names charset utf-16/);
  assert.ok(!("why" in ask("/", { headers: { "content-type": "application/json; charset=utf-16" } })), "without a key it is the block's own");
  // past the refusal, as if it had let them through: what the server hears is plain
  const r = ask("/utf8", { key: "github", method: "POST", body: "{}" });
  assert.ok(!("why" in r));
  await fetchFor({ ...r, headers: { Accept: "text/plain; q=0.9; format=utf16, application/json;charset=utf-16, nonsense", "Content-Type": "application/json; charset=utf-16; x=y" } }, KEY, 5000);
  assert.equal(last().accept, "text/plain, application/json");
  assert.equal(last().ct, "application/json; charset=utf-8");
  await fetchFor({ ...r, headers: { "content-type": "multipart/form-data; boundary=zz; charset=utf-16" } }, KEY, 5000);
  assert.equal(last().ct, "multipart/form-data; boundary=zz; charset=utf-8", "a boundary spells nothing and stays");
  // an accept with no media type left is not sent, and the sender's own */* goes
  await fetchFor({ ...r, headers: { accept: "; charset=utf-16" } }, KEY, 5000);
  assert.equal(last().accept, "*/*");
  // without a key, the block's headers go as it wrote them
  await fetchFor({ ...r, headers: { accept: "text/plain; q=0.9", "content-type": "application/json; charset=utf-16" } }, null, 5000);
  assert.equal(last().accept, "text/plain; q=0.9");
  assert.equal(last().ct, "application/json; charset=utf-16");
});
