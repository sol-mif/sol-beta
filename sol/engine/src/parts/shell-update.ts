// The shell's own update (J4 of #1824, team/shell.ts): Sol.app asks on POST /shell/update, JSON only (a web page cannot
// send it without a preflight), whether `pause updates` is on and whether it may relaunch now, and says what its updater
// did; the answer is { paused, relaunch, why? }. The word goes to every face as team.shell; team.shell.get is the standing one.
import type { Parts } from "../parts.js";
import { setShellFaces, shellHeard, shellNow } from "../team/shell.js";

export default function (p: Parts) {
  p.atStart((e) => setShellFaces(e.everyone));
  p.route("POST", "/shell/update", async ({ req, res }) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(415); res.end(); return; }
    let body = "";
    for await (const chunk of req) if (body.length <= 500) body += chunk;   // read to the end, so the answer still goes out
    if (body.length > 500) body = "";   // past the cap: answered, nothing heard
    let parsed: unknown = null;
    try { parsed = JSON.parse(body || "{}"); } catch { /* a bad body says nothing */ }
    let out: string;
    try { out = JSON.stringify(shellHeard(parsed)); }
    catch (e) { console.log(`shell-update: no answer (${(e as Error).message})`); res.writeHead(500); res.end(); return; }   // not a 200: the shell reads it as a no
    // a length, so the shell's plain reader (as pause.rs tell) gets the body whole, not chunked
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out) });
    res.end(out);
  });
  p.on("team.shell.get", (m, h) => { h.send(h.ws, { ...shellNow(), ...(m.rid !== undefined ? { rid: m.rid } : {}) }); });
}
