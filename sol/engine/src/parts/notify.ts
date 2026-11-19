// One notification (#845; moved from index.ts, #1146): a turn done or failed, an ask, a green card become moments, a
// session a face shows while Sol is on screen is in front of him, and "seen" waves one moment (or all) off (notify.ts)
import type { Parts } from "../parts.js";
import { seen, heard, watchViews } from "../notify.js";
import { hearWork, viewed } from "../work/wire.js";

export default function (p: Parts) {
  p.atStart(() => { hearWork(heard); watchViews(viewed); });
  p.on("seen", (m, { face }) => { seen(typeof m.id === "string" ? m.id : undefined, face, m.all === true); });
}
