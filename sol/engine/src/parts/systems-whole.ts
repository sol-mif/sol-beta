// GET /systems/whole (#1193): the whole of Jelly, read once (work/systemsWhole.ts): the clusters, the wires between them,
// who is in which cluster now, what the last changes reached. The face is told by its socket (work.systems.whole).
import type { Parts } from "../parts.js";
import { readWhole } from "../work/systemsWhole.js";

export default function (p: Parts) {
  p.route("GET", "/systems/whole", async ({ res }) => {
    try {
      const whole = await readWhole();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(whole));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }));
    }
  });
}
