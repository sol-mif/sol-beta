// The log's news, told to the person once (#1678, gate one q2): what an older version of Sol wrote that was carried into
// the history at this start, or what was found wrong that nothing here mends. One moment (notify.ts), never a console
// line only.
import type { Parts } from "../parts.js";
import { logNews, onLogNews, newsLine, type LogNews } from "../log.js";
import { moment } from "../notify.js";

export default function (p: Parts) {
  let last = "";
  const tell = (n: LogNews) => { const line = newsLine(n); if (!line || line === last) return; last = line; moment("ping", line, { seat: "sol", key: "log.news" }); };
  p.atStart(() => { onLogNews(tell); tell(logNews()); });
}
