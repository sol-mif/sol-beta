// A wait the night cannot hide (#1128 step 8, team/waits.ts): at the first session I start after 05:00 my time, every
// wait on me older than a day (People's read, parts/people.ts readPeople) becomes a block that asks at the top of that
// session's stage, "on it · later · not mine", one block per wait, carried, never copied (team/waits.ts morningPlan).
// The morning opened is kept as its day in the engine's home folder (morning-waits.json), so it is once a day; a read
// that fails opens no morning and the next session tries again.
// "not mine" (work/asks.ts setNotMine, team/waits.ts notMineOf) goes back to whoever put the wait on me, and asks
// isQuiet() first (Frank's condition 2): under quiet nothing is posted, unassigned or sent, and the block's ledger says
// what was not sent. Behind morning.waits (settings.ts morningWaits): off unless set true (Marco, 2026-11-16 21:07 ET).
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import * as stage from "../work/blocks.js";
import { onSessionStarted, setNotMine } from "../work/asks.js";
import { localDay } from "../day.js";
import { readPeople } from "./people.js";
import { holdsOf, threadNow, decline } from "../team/reach.js";
import { hubLogin } from "../team/relay.js";
import { runGh } from "../team/record.js";
import { isQuiet } from "../quiet.js";
import { morningWaits } from "../settings.js";
import { notMineOf, openMorning, type Seen } from "../team/waits.js";

const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
let FILE = "";

/** the block of this key wherever it is (one block per wait: never a second one in another project) */
function find(key: string): Seen | null {
  for (const p of stage.projects()) { const b = stage.getBlock(p, key); if (b) return { project: p, state: b.state, asks: b.asks }; }
  return null;
}

let opening = false;
async function morning(sessionId: string, now: number) {
  if (!FILE || opening) return;
  opening = true;
  try {
    await openMorning(sessionId, now, {
      on: morningWaits,
      hour: (t) => new Date(t).getHours(), day: localDay,
      last: () => { try { return (JSON.parse(readFileSync(FILE, "utf8")) as { last?: string }).last; } catch { return undefined; } },
      keep: (day) => { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE + ".tmp", JSON.stringify({ last: day })); renameSync(FILE + ".tmp", FILE); },
      mine: async () => {
        const r = await readPeople();
        return r.failed ? null : r.people.find((p) => p.login.toLowerCase() === r.me.toLowerCase()) ?? null;
      },
      project: async (sid) => (await stage.whoFor(sid)).project,
      find,
      holds: () => holdsOf(threadNow()),
      carry: (project, key, sid, later) => {
        const b = stage.getBlock(project, key);
        if (!b) return;
        // marked back only once it is carried, so a carry that failed is tried again (team/waits.ts morningPlan)
        return stage.whoFor(sid).then((w) => { stage.place({ ...w, sessionId: b.sessions[0] ?? sid }, { id: key, carry: sid, slot: "top" }); if (later) stage.laterBack(project, key, later); })
          .catch((err) => { console.error(`waits: ${key} was not carried`, err); throw err; });
      },
      compose: (project, sid, c) => {
        return stage.whoFor(sid).then((w) => stage.compose({ ...w, ...(c.by ? { by: c.by } : {}) },
          { id: c.id, kind: "card", title: c.title, body: c.body, person: true, slot: "top", asks: c.asks }))
          .catch((err) => { console.error(`waits: ${c.id} was not placed`, err); throw err; });
      },
    });
  } catch (err) { console.error("waits: the morning was not opened", err); }
  finally { opening = false; }
}

export default function (p: Parts) {
  p.atStart((e) => {
    FILE = join(e.HOME, "morning-waits.json");
    onSessionStarted((sid, now) => { void morning(sid, now); });
    setNotMine(notMineOf({ quiet: () => isQuiet(), me: hubLogin, gh: (args) => runGh(args, TOP), decline }));
  });
}
