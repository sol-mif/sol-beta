// Cowork's map (#1433, team/map): the spec the face draws, built from the project's setup (.sol/cowork-map.json) and its
// live records. Read-only.
//   GET /team/map[?refresh=1]   → { at, spec?, error? }
//   team.map { rid, refresh? }  → the same type and rid, with the read
// Read on the first ask, never at start; kept five minutes (team/map/read.ts).
import type { Parts } from "../parts.js";
import { readMap } from "../team/map/read.js";

const said = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));
const read = (fresh: boolean) => readMap(fresh).catch((err) => ({ at: Date.now(), error: said(err) }));

export default function (p: Parts) {
  p.on("team.map", async (m, h) => { h.send(h.ws, { type: "team.map", rid: m.rid, ...(await read(m.refresh === true)) }); });
  p.route("GET", "/team/map", async ({ res, req }) => {
    const r = await read(/[?&]refresh=1\b/.test(req.url ?? ""));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
  });
}
