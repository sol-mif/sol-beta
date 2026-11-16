// POST /claim (#202; moved from index.ts, #934): the harness (sol/harness/guard), fire and forget, says a file another
// branch changed; a hit becomes a claim ping to the holder (team/wire.ts hearClaim)
import type { Parts } from "../parts.js";
import { hearClaim } from "../team/wire.js";

export default function (p: Parts) {
  p.route("POST", "/claim", async ({ req, res }) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(415); res.end(); return; }
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4000) break; }
    let ok = false;
    try { ok = hearClaim(JSON.parse(body)); } catch {}
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok }));
  });
}
