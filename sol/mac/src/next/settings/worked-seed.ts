// "How Sol worked" on the dev page and in the tests (#1615): a small next.traces answer, a sample, shaped as the engine's
// (sol/PROTOCOL.md "## next") and drawn under a line that says it is one. The panel's people only (dev-morning's Ada,
// Rex and Kai, the lease, home), never anyone's real data. Today has five runs, one of them with what its records do
// not say; yesterday has none, so the empty day is drawn too. A real Sol never shows a line of this: it asks the
// engine (cv/moves/settings.ts stWorked). Signed: franktsai2008-eng's agent, the face half of "How Sol worked" (#1615).

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** the sample engine answer for `day` (today when unsaid), as the engine would send it */
export function sampleTraces(day?: string | null, now = new Date()): Record<string, unknown> {
  const today = dayOf(now), y = new Date(now); y.setDate(y.getDate() - 1);
  const days = [today, dayOf(y)];
  const at = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
  const gaps = [
    { what: "reasoning", say: "What an AI thought to itself is not recorded, so it is not shown." },
    { what: "seat-own", say: "What an AI loads on its own (its instructions, skills and memory) is not recorded." },
    { what: "words", say: "What was asked and answered, and what a tool was given, are kept out of this history on purpose." },
  ];
  if (day && day !== today) return { type: "next.traces", day, days, runs: [], coverage: { log: "none", events: 0, skipped: 0, old: 0, unknown: [{ what: "log", say: "Nothing was recorded on the log that day." }, ...gaps] } };
  const runs = [
    { id: "session:s-Rex", source: { kind: "session", id: "s-Rex", seat: "claude" }, from: at(8, 40), to: at(9, 5),
      provider: { seat: "claude", model: "claude-sonnet", turns: 3, tokens: { in: 18200, out: 2400 }, costTotal: 0.41 },
      tools: [{ tool: "Read", n: 6, ok: 6, failed: 0, unsaid: 0 }, { tool: "Bash", n: 2, ok: 1, failed: 1, unsaid: 0 }],
      result: "waiting", waits: [{ at: at(9, 5), on: "permission", until: null }],
      permissions: [{ at: at(9, 5), act: "run", rung: "ask", answer: null }], steps: new Array(14).fill(null), more: 0, back: { session: "s-Rex" }, unknown: [] },
    { id: "session:s-Ada", source: { kind: "session", id: "s-Ada", seat: "claude" }, from: at(7, 55), to: at(8, 30),
      provider: { seat: "claude", model: "claude-opus", turns: 5, tokens: { in: 52100, out: 7300 }, costTotal: 1.86 },
      tools: [{ tool: "Read", n: 11, ok: 11, failed: 0, unsaid: 0 }, { tool: "Edit", n: 9, ok: 8, failed: 1, unsaid: 0 }, { tool: "Bash", n: 3, ok: 3, failed: 0, unsaid: 0 }],
      result: "done", waits: [{ at: at(8, 2), on: "permission", until: at(8, 6) }],
      permissions: [{ at: at(8, 2), act: "write", rung: "ask", answer: "yes" }], steps: new Array(31).fill(null), more: 0, back: { session: "s-Ada" }, unknown: [] },
    { id: "thing:lease", source: { kind: "thing", id: "lease", seat: null }, from: at(7, 30), to: at(7, 31),
      provider: null, tools: [], result: "waiting", waits: [{ at: at(7, 30), on: "person", until: null }], permissions: [], steps: [null, null], more: 0, back: { thing: "lease" }, unknown: [] },
    { id: "session:s-Kai", source: { kind: "session", id: "s-Kai", seat: "codex" }, from: at(6, 50), to: at(7, 20),
      provider: { seat: "codex", model: null, turns: 2, tokens: null, costTotal: null },
      tools: [{ tool: "Bash", n: 4, ok: 2, failed: 1, unsaid: 1 }], result: "unknown", waits: [], permissions: [],
      steps: new Array(9).fill(null), more: 0, back: { session: "s-Kai" }, unknown: ["model", "tokens", "outcome"] },
    { id: "diary:" + today, source: { kind: "diary", id: today, seat: null }, from: at(6, 30), to: at(6, 45), provider: null, tools: [], result: "done",
      waits: [], permissions: [], steps: [null, null, null], more: 0, back: { day: today }, unknown: [] },
  ];
  return { type: "next.traces", day: today, days, runs, coverage: { log: "read", events: 59, skipped: 0, old: 0, unknown: gaps } };
}
