// The first run, step by step (Sol ticket #97, on #1855's first run: setup-state.ts, welcome.rs first_run). Five steps, each
// with its own state, read from what is already known: the first three from the install's own lines while the shell runs
// it (where Sol goes, Node, the engine), the last two from the engine and Sol.app once the shell has loaded "/" (Google,
// whose Sol this is; the AI that does the work, Claude and Codex). Plain, so the test reads it (next-firststeps.test.ts);
// the view is Steps.tsx, the mark that carries the last two over the reload is left.ts.

export type StepId = "place" | "node" | "engine" | "google" | "ai";
export type StepState = "todo" | "doing" | "done" | "stopped" | "skipped";
export type Step = { id: StepId; title: string; state: StepState };
/** Google as the engine says it: "?" not answered yet, "none" no cloud to sign in to, "later" left for later by the person */
export type Google = "?" | "out" | "busy" | "failed" | "in" | "none" | "later";
export type AiSt = "?" | "in" | "out" | "missing";
export type Ais = { claude: AiSt; codex: AiSt };

export const TITLES: Record<StepId, string> = { place: "Get this Mac ready", node: "Get Node", engine: "Get Sol and its engine", google: "Sign in with Google", ai: "Connect your AI" };
const ORDER: StepId[] = ["place", "node", "engine", "google", "ai"];

// sol/install's own order (its steps 2 to 8): where Sol goes and Apple's developer tools (the Mac made ready), Node, then
// Sol itself (the clone, Claude Code, sol/setup: packages, the engine, its job). Each install step starts at its first
// line and is done once a later step's line comes, or its own end
const STARTS: [StepId, RegExp][] = [["node", /^(install|setup): fetching Node/], ["engine", /^(install|setup): (cloning Sol|installing Claude Code|bash sol\/setup)/]];
const ENDS: [StepId, RegExp][] = [["node", /^ {2}ok {4}Node v[\d.]+ in /], ["engine", /^ {2}ok {4}(sol\/setup done|the engine answers on )/]];
// how far along the line is at each of the install's own words (never back: the furthest reached counts)
const MARKS: [RegExp, number][] = [
  [/^ {2}ok {4}Sol goes to /, 0.05], [/^ {2}ok {4}Apple's developer tools/, 0.1], [/^(install|setup): fetching Node/, 0.12], [/^ {2}ok {4}Node v[\d.]+ in /, 0.3],
  [/^(install|setup): cloning Sol/, 0.32], [/^ {2}ok {4}Sol is in /, 0.45], [/^install: installing Claude Code/, 0.47], [/^ {2}ok {4}Claude Code installed/, 0.52],
  [/^install: bash sol\/setup/, 0.55], [/^ {2}ok {4}(sol\/setup done|the engine answers on )/, 0.96],
];

/** how far the install is, 0 to 1, from its lines so far */
export function fracOf(lines: readonly string[]): number {
  let f = 0.02;
  for (const l of lines) for (const [re, at] of MARKS) if (re.test(l) && at > f) f = at;
  return f;
}

/** where Sol goes: the install's own words, ~/Sol (its default, SOL_DIR) until it says */
export function placeOf(lines: readonly string[]): string {
  let at = "~/Sol";
  for (const l of lines) {
    const m = /^ {2}ok {4}Sol goes to (\S+)/.exec(l) ?? /^(?:install|setup): cloning Sol into (\S+)/.exec(l) ?? /^ {2}ok {4}Sol is in ([^,\s]+)/.exec(l);
    if (m) at = m[1];
  }
  return at;
}

/** the five steps now. `lines`: the install's lines while the shell runs it, null once it is over (the shell loaded "/");
 *  `error`: why the install stopped; `google`, `ai`: the last two, asked once the engine answers ("later": left for later) */
export function stepsOf(o: { lines: readonly string[] | null; error?: string | null; google?: Google; ai?: Ais | "later" }): Step[] {
  const st: Record<StepId, StepState> = { place: "todo", node: "todo", engine: "todo", google: "todo", ai: "todo" };
  if (o.lines === null) { st.place = st.node = st.engine = "done"; }
  else {
    let reached = 0;   // the furthest install step begun (a step's end implies it began)
    for (const l of o.lines) {
      for (const [id, re] of STARTS) if (re.test(l)) reached = Math.max(reached, ORDER.indexOf(id));
      for (const [id, re] of ENDS) if (re.test(l)) { st[id] = "done"; reached = Math.max(reached, ORDER.indexOf(id)); }
    }
    // every step before the furthest begun is behind us; the first one not done is the one running (or stopped)
    for (let i = 0; i < reached; i++) st[ORDER[i]] = "done";
    const at = ORDER.slice(0, 3).find((id) => st[id] !== "done") ?? (o.error ? "engine" : undefined);   // stopped after all three: the last
    if (at) st[at] = o.error ? "stopped" : "doing";
    return ORDER.map((id) => ({ id, title: TITLES[id], state: st[id] }));
  }
  const g = o.google ?? "?";
  st.google = g === "in" ? "done" : g === "none" || g === "later" ? "skipped" : "doing";
  if (st.google !== "doing") {
    const a = o.ai ?? { claude: "?", codex: "?" };
    st.ai = a === "later" ? "skipped" : a.claude === "in" && a.codex === "in" ? "done" : "doing";
  }
  return ORDER.map((id) => ({ id, title: TITLES[id], state: st[id] }));
}

/** the step the window shows, null when nothing is left (the new face comes next) */
export const currentOf = (s: readonly Step[]): StepId | null => s.find((x) => x.state === "doing" || x.state === "stopped")?.id ?? null;

/** the AI step's own press: Continue once one of them is in, else a quiet later */
/** signed in to only one of them: the seat a new chat starts on (the old onboarding's pick, One.tsx); else null */
export const seatOf = (a: Ais): "claude" | "codex" | null => ((a.claude === "in") === (a.codex === "in") ? null : a.claude === "in" ? "claude" : "codex");

export const aiPress = (a: Ais): string => (a.claude === "in" || a.codex === "in" ? "Continue" : "Later");
