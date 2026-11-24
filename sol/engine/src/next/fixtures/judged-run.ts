// Run the judged cases for real (BR1 quiet canvas, #1615): each case through the one judgment on the person's own Claude
// (its cheapest family, in the bare seat next/raise.ts uses live), then read cold by Jev: "would this person care to be
// told this now?". Writes judged-result.json beside it: the number for the team's checks, and every case's row.
// Run from sol/engine on a machine signed in to Claude with ~/.config/sol/jev.env: `npx tsx src/next/fixtures/judged-run.ts`.
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cheapest, seatTurn } from "../../agent/meta/own.js";
import { claudeModels } from "../../models.js";
import { JEV_URL, jevKey } from "../../agent/jev.js";
import { JUDGE_SYSTEM } from "../raise.js";
import { isQuiet } from "../../quiet.js";
import { cases, runCases, type Cold } from "./judged.js";

/** the cold read (pure): the situation and what Sol showed, one noul question */
export function coldBody(situation: string, shown: string) {
  return {
    model: "jev-latest",
    state: { situation: situation.slice(0, 1500), what_sol_did: shown.slice(0, 600) },
    questions: {
      would_care: {
        type: "noul",
        instructions: "A person's assistant either raised a waiting item on their screen or stayed silent about it. From the situation only: would this person genuinely care to be told about this item now?",
        criteria: { true: "not knowing now would cost them: work is stopped on them, a promise or deadline is close, something broke and will break again, or they asked for it and are coming back to it", false: "it is routine, already answered by what they have, something that only happened, or it can wait without cost" },
      },
    },
  };
}

const jev: Cold = async (situation, shown) => {
  const key = jevKey();
  if (isQuiet() || !key) return null;   // a quiet machine reads no case cold
  try {
    const r = await fetch(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(coldBody(situation, shown)) });
    const v = Number((await r.json())?.answers?.would_care?.noul);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const model = process.env.JUDGE_MODEL || cheapest(claudeModels()), turn = seatTurn(JUDGE_SYSTEM);
  const all = cases();
  const out = await runCases(all, (p) => turn(model, p, 60_000), jev, { each: (r) => console.log(`${r.ok ? "ok  " : "FAIL"} ${r.id.padEnd(14)} ${r.got.padEnd(8)} cold ${r.cold ?? "-"} ${r.why}`) });
  const head = { at: new Date().toISOString(), model, reader: "jev-latest", n: out.n, raised: out.raised, worth: out.worth, silent: out.silent, missed: out.missed, drawing: out.drawing, passed: out.passed };
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "judged-result.json"), JSON.stringify({ ...head, rows: out.rows }, null, 1) + "\n");
  console.log(JSON.stringify(head));
}
