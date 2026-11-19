// Cowork, whole (#1173): the anchor's tabs ask the engine here (team/cowork-shell.ts says what each read is).
//   cowork.shell.read { what: "foryou" | "who" | "guard", rid } → the same type and rid, with the read or
//   { error }. GET /cowork/shell/<what> is the same reading for a script or a test. Read-only.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { readForYou, readGuard, readWho } from "../team/cowork-shell.js";

// the repository: sol/ is three up from src/parts/ under tsx, dist/parts/ when built; gh and git run there
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const READS: Record<string, () => Promise<unknown> | unknown> = {
  foryou: () => readForYou(TOP), who: () => readWho(TOP), guard: () => readGuard(),
};
const said = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));
async function read(what: unknown): Promise<object> {
  const f = typeof what === "string" && Object.hasOwn(READS, what) ? READS[what] : undefined;
  if (!f) return { error: `nothing called ${String(what)} to read` };
  try { return { what, ...(await f()) as object }; } catch (err) { return { what, error: said(err) }; }
}

export default function (p: Parts) {
  p.on("cowork.shell.read", async (m, h) => { h.send(h.ws, { type: "cowork.shell.read", rid: m.rid, ...(await read(m.what)) }); });
  p.route("GET", /^\/cowork\/shell\/([a-z]+)$/, async ({ res, match }) => {
    const r = await read(match?.[1]);
    res.writeHead("error" in r ? 502 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
  });
}
