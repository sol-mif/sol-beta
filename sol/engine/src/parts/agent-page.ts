// The folder's agent (MY SOL, agent/), as a part (moved from index.ts when main made the engine's parts, #934):
// GET and POST /agent/<name>, its page (agent/page.ts). The door before every part lets in only Sol's own pages, so a
// form posted from another site never reaches here. POST takes the page's buttons (a form, or JSON) and sends the page
// back. And every agent.* message on a socket: the same type and rid back; agent.show puts its page on a session's stage
import type { Parts, Asked, Heard } from "../parts.js";
import { handleAgent, agentsNow } from "../agent/index.js";
import { compose as composeBlock } from "../work/blocks.js";
import { countError } from "../errcount.js";
import { draftLink } from "../agent/comms.js";   // step 2: the page's "open the draft" goes to the draft

const PAGE = /^\/agent\/([A-Za-z0-9._-]{1,64})\/?$/;

async function page({ req, res, match }: Asked) {
  const a = agentsNow(), name = match![1];
  if (!a || !a.folderOf(name)) { res.writeHead(404, { "content-type": "text/plain" }); res.end(`no folder agent "${name}"`); return; }
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4000) break; }
    let m: Record<string, string> = {};
    try { m = (req.headers["content-type"] ?? "").startsWith("application/json") ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)); } catch {}
    const out = /^agent\.(answer|rule|run|signin)$/.test(String(m.type)) ? await handleAgent({ ...m, folder: name }) : { ok: false, why: "which button? agent.answer, agent.rule, agent.run or agent.signin" };
    if ((req.headers["content-type"] ?? "").startsWith("application/json")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return; }
    res.writeHead(303, { location: draftLink(out as { ticket?: any }) ?? `/agent/${encodeURIComponent(name)}` }); res.end(); return;   // "open the draft": the draft
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(a.page(name));
}

async function heard(m: any, { ws, send, PORT }: Heard) {
  try {
    if (m.type === "agent.show") {
      const name = String(m.folder ?? ""), url = `http://127.0.0.1:${PORT}/agent/${encodeURIComponent(name)}`;
      if (!agentsNow()?.folderOf(name)) send(ws, { type: m.type, rid: m.rid, ok: false, why: `no folder agent "${name}"` });
      else {
        const b = composeBlock({ project: String(m.project ?? "school"), sessionId: String(m.sessionId ?? ""), by: "agent" }, { kind: "page", title: `${name.toUpperCase()}'s agent`, bind: { source: url, watch: "url" } });
        send(ws, { type: m.type, rid: m.rid, ok: true, block: b.id, url });
      }
    } else send(ws, await handleAgent(m));
  } catch (err) {
    countError(err, "work", m.type);   // the folder agent counts with Work (errcount.ts has no kind of its own for it)
    send(ws, { type: m.type, rid: m.rid, ok: false, why: err instanceof Error ? err.message.split("\n")[0] : String(err) });
  }
}

export default function (p: Parts) {
  p.route("GET", PAGE, page);
  p.route("POST", PAGE, page);
  p.on("agent.", heard);
}
