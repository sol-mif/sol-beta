// A Sol account on a cloud, over HTTP (moved from index.ts, #934). A program of this Mac's or a page of Sol's own (the
// door let it in), and JSON, which a web page cannot send without a preflight.
//   POST /cloud/signin, /cloud/signout (#214, team/cloud.ts): sign in with Google in the system browser, or sign this
//     machine out. Waits for the person, up to ten minutes. { hub } names the cloud; none is SOL_HUB
//   POST /cloud/move (#216, C15; team/move.ts): a GitHub room of mine moved to the cloud, backed up here first, then
//     copied and read back. { room: <id>, as?: <a name on the cloud> }
//   GET /cloud/accounts: names and hubs only, never a token
import type { Parts, Route } from "../parts.js";
import { hubHttp, restartRelay, CLOUD_FILE } from "../team/relay.js";
import { signIn, signOut, accounts as cloudAccounts } from "../team/cloud.js";
import { sharedHub } from "../team/settings.js";
import { moveNow } from "../team/wire.js";

const sign: Route = async ({ req, res, path }) => {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(415); res.end(); return; }
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 2000) break; }
  let given = "";
  try { const v = JSON.parse(body || "{}"); if (typeof v?.hub === "string") given = v.hub.trim(); } catch {}
  const hub = hubHttp(given || sharedHub());
  const out = !/^https:\/\//.test(hub) ? { ok: false, error: "which cloud? (SOL_HUB, or { hub: \"wss://…/relay\" })" }
    : path === "/cloud/signin" ? await signIn(hub, { file: CLOUD_FILE })
    : { ok: await signOut(hub, { file: CLOUD_FILE }) };
  if (out.ok) restartRelay();   // the next knock carries the new ticket, or none
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(out));
};

export default function (p: Parts) {
  p.route("POST", "/cloud/signin", sign);
  p.route("POST", "/cloud/signout", sign);
  p.route("POST", "/cloud/move", async ({ req, res }) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(415); res.end(); return; }
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 2000) break; }
    let v: Record<string, unknown> = {};
    try { const x = JSON.parse(body || "{}"); if (x && typeof x === "object") v = x; } catch {}
    const out = await moveNow(v.room, v.as).catch((e) => ({ error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify("error" in out ? { ok: false, error: out.error } : { ok: true, ...out }));
  });
  p.route("GET", "/cloud/accounts", ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ accounts: cloudAccounts(CLOUD_FILE) }));   // names and hubs only, never a token
  });
}
