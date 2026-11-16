// The Go back row (#18; moved from index.ts, #934): only Sol's own windows. goback.plan says what going back would do;
// goback runs sol/back and ends this engine at once, not at a quiet moment (it is for a broken Sol), so its keeper
// brings the good build up
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts, Hear } from "../parts.js";
import { plan as goBackPlan, goBack } from "../goback.js";

// sol/: from src/parts/ under tsx, dist/parts/ when built
const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const back: Hear = async (msg, { ws, send, everyone, fromSol }) => {
  if (!fromSol) send(ws, { type: "goback.plan", line: "only Sol's own windows can go back" });
  else if (msg.type === "goback.plan") send(ws, { type: "goback.plan", ...(await goBackPlan(SOL)) });
  else {
    console.log("goback: Marco pressed go back");
    const r = await goBack(SOL);
    for (const l of r.lines) console.log(`goback: ${l}`);
    everyone({ type: "goback.done", ok: r.ok, lines: r.lines });
    if (r.ok) setTimeout(() => process.exit(0), 300);   // the word gets out, then the keeper starts the good build
  }
};

export default function (p: Parts) {
  p.on("goback.plan", back);
  p.on("goback", back);
}
