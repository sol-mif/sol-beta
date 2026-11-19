// The pause signal (#1597, src/pause.ts): the app's process tells each turn it sees on POST /pause { why }, JSON only,
// which a web page cannot send without a preflight; the answer is { on, paused }. Off, the app hears on: false and
// asks again only a minute later (pause.rs). Every pause is told to every face.
import type { Parts } from "../parts.js";
import { pauseNow, sensed, setPauseFaces } from "../pause.js";

export default function (p: Parts) {
  p.atStart((e) => setPauseFaces(e.everyone));
  p.route("POST", "/pause", async ({ req, res }) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(415); res.end(); return; }
    let body = "";
    for await (const chunk of req) if (body.length <= 500) body += chunk;   // read to the end, so the answer still goes out
    let why: unknown = null;
    if (body.length > 500) body = "";   // past the cap: answered, nothing sensed
    try { why = JSON.parse(body || "{}")?.why; } catch { /* a bad body senses nothing */ }
    const paused = sensed(why);
    const out = JSON.stringify({ on: pauseNow().on, paused });
    // a length, so the app's plain reader (pause.rs tell) gets the body whole, not chunked
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out) });
    res.end(out);
  });
}
