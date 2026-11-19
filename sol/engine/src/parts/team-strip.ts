// The team strip (#1167, team/strip.ts): the top of Cowork's system view, where each person stands against the
// iteration (#1153). Asked by the face as `iteration.team` (answered with the same type and rid), and the same reading
// at GET /team/strip for a script or a test. The face asks again whenever a `team.runs` count comes (a `runs` or a
// `drift` word landed: parts/runs.ts, parts/drift.ts), so nothing here pushes. Read-only: it reads the checkout's tags,
// docs/people, .sol/rhythm.json, the kept words and, on the machine that measured it, drift.json.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { devTagsIn, iterationOf } from "../team/iteration.js";
import { driftKept } from "../team/drift.js";
import { peopleOf, runsNow } from "../team/runs.js";
import { stripOf, driftFileHere, rhythmHere, type Strip } from "../team/strip.js";

// the repository: four up from src/parts/ (parts, src, engine, sol) under tsx, dist/parts/ when built
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const errorOf = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));

// any part may throw (no docs/people in this checkout, an unreadable kept word): the caller answers an error, never crashes
async function readStrip(): Promise<Strip> {
  const tags = await devTagsIn(TOP).catch(() => []);
  return stripOf({
    people: peopleOf(TOP), iteration: iterationOf(tags), tags, words: runsNow(), word: driftKept(),
    file: driftFileHere(), rhythm: rhythmHere(TOP),
  });
}

export default function (p: Parts) {
  p.on("iteration.team", async (msg, { ws, send }) => {
    try { send(ws, { type: "iteration.team", rid: msg.rid, strip: await readStrip() }); }
    catch (err) { send(ws, { type: "iteration.team", rid: msg.rid, error: errorOf(err) }); }
  });
  p.route("GET", "/team/strip", async ({ res }) => {
    let body: string, code = 200;
    try { body = JSON.stringify(await readStrip()); } catch (err) { code = 500; body = JSON.stringify({ error: errorOf(err) }); }
    res.writeHead(code, { "content-type": "application/json" });
    res.end(body);
  });
}
