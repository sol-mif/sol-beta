// The team strip's words (#1167): what the engine's reading (iteration.team, sol/engine/src/team/strip.ts) says of each
// person, in plain lines. Pure, so a test or a still can read them without a socket.
import type { Live } from "./model";

export type StripRun = { machine: string; tag: string; behind: number; branch: "dev" | "mine"; at: number };
export type StripPerson = {
  login: string; name: string; prefix: string; on: boolean; why?: string; runs: StripRun[];
  drift: { off: number; iterations: number; openOff: number; openIterations: number; prs: number | null; files: { path: string; age: number }[] | null; open: { pr: number; files: number }[] | null } | null;
};
export type Strip = {
  iteration: { name: string; sha: string; at: number } | null; driftAt: number | null; driftOld: string | null;
  people: StripPerson[]; next: { drift: string; integrate: string; zone: string } | null; at: number;
};

const n = (k: number, w: string, ws = `${w}s`) => `${k} ${k === 1 ? w : ws}`;

/** how long ago, in one short word: "just now", "12 min ago", "3 h ago", "2 days ago" */
export function agoWords(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** where they stand against the iteration: ✓, or the release their furthest-behind Sol runs and how far, or none heard,
 *  or no iteration yet (the engine has no dev-* tag) */
export function standWords(p: StripPerson): { mark: "on" | "off" | "none"; words: string } {
  if (p.on) return { mark: "on", words: "on the iteration" };
  if (p.why === "no iteration") return { mark: "none", words: "no iteration yet" };
  // the Sol furthest behind explains it (runs come newest first, so a tie names the newest)
  const r = p.runs.reduce<StripRun | undefined>((b, x) => (!b || x.behind > b.behind ? x : b), undefined);
  if (!r) return { mark: "none", words: "no Sol heard this week" };
  if (p.why === "build") return { mark: "off", words: `${r.tag}, waiting on a build` };
  if (p.why === "restart") return { mark: "off", words: `${r.tag}, waiting on a restart` };
  return { mark: "off", words: r.behind > 0 ? `runs ${r.tag} · ${n(r.behind, "iteration")} behind` : `runs ${r.tag}` };
}

/** their drift: files in their mine branch off the iteration and the iterations missed, as the drift word says it */
export function driftWords(p: StripPerson): string {
  const d = p.drift;
  if (!d) return "drift not measured yet";
  if (d.off === 0) return "nothing off";
  return `${n(d.off, "file")} off · ${n(d.iterations, "iteration")} missed`;
}

/** their open PRs, as drift.json measured them; "" when not known */
export function prWords(p: StripPerson): string {
  const k = p.drift?.prs;
  return typeof k === "number" ? n(k, "open PR") : "";
}

/** what they touched last, from the work under way this view already holds (work.systems.live): their newest session
 *  by branch (`<prefix>/…`), else by the name git gives them; null when none is in sight */
export function touchedBy(p: StripPerson, live: Live | null): { what: string; title: string; at: number; session: string } | null {
  const mine = (branch: string, person: string) =>
    (!!p.prefix && branch.toLowerCase().startsWith(`${p.prefix.toLowerCase()}/`)) || person.toLowerCase().split(/\s+/).includes(p.name.toLowerCase());
  let best: { what: string; title: string; at: number; session: string } | null = null;
  for (const w of live?.work ?? []) if (mine(w.branch, w.person) && (!best || w.at > best.at)) best = { what: w.system, title: w.title, at: w.at, session: w.session };
  for (const u of live?.uncovered ?? []) if (mine(u.branch, u.person) && (!best || u.at > best.at)) best = { what: u.folder, title: u.title, at: u.at, session: u.session };
  return best;
}

/** the quiet line: when the next drift and integrate runs are, every day */
export function clockWords(s: Strip): string {
  if (!s.next) return "";
  return `Drift is measured daily at ${s.next.drift}, the open PRs integrated at ${s.next.integrate}${s.next.zone ? ` (${s.next.zone.split("/").pop()!.replace(/_/g, " ")} time)` : ""}.`;
}
