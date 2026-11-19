// GET /systems/live (#1156): the work under way now, by system, read once (work/systemsLive.ts). The face is told by its
// socket (work.systems.live); this is the same reading for a script, the board or a test.
import type { Parts } from "../parts.js";
import { liveOnce } from "../work/systemsLive.js";

export default function (p: Parts) {
  p.route("GET", "/systems/live", async ({ res }) => {
    try {
      const live = await liveOnce();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(live));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }));
    }
  });
}
