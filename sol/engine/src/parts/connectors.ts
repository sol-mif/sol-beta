// "connectors" (moved from index.ts, #1146): the services connected in the person's Claude account, each with the tools
// a read turn may use; answered as home.connectors, which the face passes on to whoever asked by rid (useEngine.ts).
// `fresh: true` asks the account again now (Settings › home after a renew, #1229)
import type { Parts } from "../parts.js";
import { connectedServices } from "../connectors.js";

export default function (p: Parts) {
  p.on("connectors", async (msg, { HOME, ws, send }) => {
    send(ws, { type: "home.connectors", rid: msg.rid, list: await connectedServices(HOME, msg.fresh === true).catch((e) => ({ error: String(e?.message ?? e).split("\n")[0] })) });
  });
}
