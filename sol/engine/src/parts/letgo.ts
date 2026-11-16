// POST /letgo (One Sol, #62; moved from index.ts, #934): a page of Sol's own, going back to the NucBox, asks this Mac's
// engine to let go: granted only while quiet, and then no new turn starts here for a moment (busy.ts)
import type { Parts } from "../parts.js";
import { busyList, letGo } from "../busy.js";

export default function (p: Parts) {
  p.route("POST", "/letgo", ({ req, res }) => {
    const origin = req.headers.origin;
    res.writeHead(200, { "content-type": "application/json", ...(typeof origin === "string" ? { "access-control-allow-origin": origin, vary: "origin" } : {}) });
    res.end(JSON.stringify(letGo() ? { ok: true } : { ok: false, busy: busyList() }));
  });
}
