// See what's at work on the dev page (BR1 item 7, #1615): next.html &atwork[=<folder>] opens it, on everything or on
// that folder. The morning's three automations come in (auto/fixture.ts, one of them running), and the working
// sessions get what the engine's work.run would say of them: since when, and one with two invented helpers. The
// morning has every session asking (and failing a test), so three of them have their asks answered and a working word
// here, to be seen at work. Only
// when asked, so the morning's counts (sol/test/e2e/next) stay as they are. Signed: marcocyl04-ux's agent (builder F),
// BR1 item 7 (#1615).
import { hooks } from "../cv/core.ts";
import type { Ask, Piece } from "../cv/types.ts";
import { withAutos } from "../auto/fixture.ts";
import { st } from "./act.ts";

const HELPERS = ["Read the session store's tests", "Find where refresh drops the token"];
const DOING = ["Writing the migration", "Planning the upgrade", "Rewriting the setup page"];

export function withAtwork(): void {
  withAutos();
  hooks.onLoad.push((d) => {
    const sessions = Object.values(d.pieces as Record<string, Piece>).filter((p) => p.kind === "session" && !p.inside && p.state === "working");
    const free = new Set(sessions.filter((_, i) => i % 3 === 1).map((p) => p.id));
    for (const a of Object.values(d.asks as Record<string, Ask>)) if (free.has(a.piece) || sessions.some((p) => free.has(p.id) && (p.parts || []).some((x) => x.id === a.part))) a.answered = true;
    const working = sessions.filter((p) => free.has(p.id));
    working.forEach((p, i) => { p.term = { ...(p.term ?? {}), stateWord: DOING[i % DOING.length] } as Piece["term"]; });
    st.runs = Object.fromEntries(working.map((p, i) => [typeof p.sessionId === "string" && p.sessionId ? p.sessionId : p.id,
      { tasks: i === 0 ? HELPERS : [], since: Date.now() - (12 + i * 9) * 60000, paused: false }]));
  });
}
