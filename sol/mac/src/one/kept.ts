// How the one session is kept (#1002, behind `build.one`): the engine's word (work.one.kept, engine/src/work/one.ts
// `kept()`) as what the face shows. Pure, so the tests read it without a window. Four things a person may ask of a
// session that never ends: how full is it (and where does it renew itself), what happened at each renewal (what crossed
// into the fresh copy, what was left out on purpose), what does it run, and where is each of its facts written.
import { ago, titleOf, type Row } from "./model.ts";

export type Renewal = { at: number; from: string; to: string; why: "full" | "asked"; context: number; window: number; file: string; carried: string[]; dropped: string[]; pieces: number; sessions: number };
export type Kept = {
  sessionId: string | null; madeAt: number | null; cwd: string | null; context: number; window: number; renewAt: number;
  renewing: { at: number; why: "full" | "asked" } | null; failed: { at: number; why: string } | null;
  renewals: Renewal[]; past: string[]; pieces: { open: number; kept: number; cap: number }; did: { kept: number; cap: number };
  runs: string[]; homes: { state: string; handovers: string; long: string };
};

/** the engine asks a handover again after this long with none written (one.ts STALE_MS): the press comes back then */
export const STALE_MS = 10 * 60_000;

export type Fill = { counted: boolean; fill: number; pct: number; at: number; atPct: number; word: string; past: boolean };
/** how full: the fill of the window (0 to 1), its percent, the renewal line, and one word for it. Nothing counted yet
 *  (no window) reads as such, never as empty. */
export function fillOf(k: Pick<Kept, "context" | "window" | "renewAt" | "renewing">): Fill {
  const at = k.renewAt > 0 && k.renewAt < 1 ? k.renewAt : 0.6, atPct = Math.round(at * 100);
  if (!(k.window > 0)) return { counted: false, fill: 0, pct: 0, at, atPct, word: "not counted yet", past: false };
  const fill = Math.max(0, Math.min(1, k.context / k.window)), pct = Math.round(fill * 100);
  const word = k.renewing ? "renewing" : fill >= at ? "renews after this turn" : fill < 0.15 ? "fresh" : fill < 0.45 ? "roomy" : "renews soon";
  return { counted: true, fill, pct, at, atPct, word, past: fill >= at };
}

/** the level of a ring's liquid for a fill, in px from the top of a ring of `size` (kit/Ring.tsx: the disc is 0.42 of
 *  it, the liquid rises from its bottom): where the renewal line is drawn on the ring */
export const RING_DISC = 0.42;
export const levelY = (size: number, fill: number) => size / 2 + RING_DISC * size - 2 * RING_DISC * size * Math.max(0, Math.min(1, fill));

/** a line of a handover as shown: a line ending in ":" heads the lines under it; "Name: the rest" leads with its name
 *  when the name is short; numbered facts stay as written */
export type Line = { head?: true; lead?: string; text: string };
export function linesOf(lines: string[]): Line[] {
  return lines.map((l) => l.trim()).filter(Boolean).map((l) => {
    if (/:$/.test(l) && l.length <= 90) return { head: true, text: l.replace(/:$/, "") };
    const m = /^([A-Z][^:.]{1,28}):\s+(.+)$/.exec(l);
    return m ? { lead: m[1], text: m[2] } : { text: l };
  });
}

export type RenewalView = { n: number; at: number; when: string; why: string; full: string; note: string; carried: Line[]; dropped: Line[]; file: string; with: string };
const clock = (t: number, now: number) => {
  const d = new Date(t), hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now).toDateString() === d.toDateString();
  return today ? hm : `${d.toLocaleDateString("en", { month: "short", day: "numeric" })}, ${hm}`;
};
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
/** the renewals, newest first: when, why, how full it was, and what crossed and what was left out */
export function renewalsOf(rs: Renewal[], now: number): RenewalView[] {
  return rs.map((r, i) => {
    const full = r.window > 0 && r.context > 0 ? `at ${Math.round((r.context / r.window) * 100)}% full` : "fullness not counted";
    return {
      n: i + 1, at: r.at, when: `${clock(r.at, now)} · ${ago(now - r.at)} ago`, why: r.why === "full" ? "it filled up" : "on ask", full,
      note: [full, `${r.carried.length} carried over`, `${r.dropped.length} left out`].join(" · "),
      carried: linesOf(r.carried), dropped: linesOf(r.dropped), file: r.file,
      with: `it crossed with ${many(r.pieces, "piece")} open and ${many(r.sessions, "session")} running`,
    };
  }).reverse();
}

export type State = { kind: "kept" } | { kind: "renewing"; line: string; stale: boolean } | { kind: "failed"; line: string; why: string };
/** a renewal under way (its handover is being written) or the last one that did not go, and why */
export function stateOf(k: Pick<Kept, "renewing" | "failed">, now: number): State {
  if (k.renewing) {
    const stale = now - k.renewing.at >= STALE_MS;
    return { kind: "renewing", stale, line: stale ? `no handover after ${ago(now - k.renewing.at)}; it can be asked again`
      : `${k.renewing.why === "full" ? "it filled up; " : ""}writing its handover · ${ago(now - k.renewing.at)}` };
  }
  if (k.failed) return { kind: "failed", line: `the last renewal did not go · ${ago(now - k.failed.at)} ago`, why: k.failed.why };
  return { kind: "kept" };
}

/** "renew now" can be pressed: there is a one session, no renewal is under way (or the one under way went stale), and
 *  no press is still on its way to the engine */
export const canRenew = (k: Pick<Kept, "sessionId" | "renewing">, now: number, pressing: boolean) =>
  !!k.sessionId && !pressing && (!k.renewing || now - k.renewing.at >= STALE_MS);

/** the press's word: what it does, or why it cannot */
export const renewWord = (k: Pick<Kept, "sessionId" | "renewing">, now: number, pressing: boolean) =>
  pressing ? "asking…" : k.renewing && now - k.renewing.at < STALE_MS ? "renewing…" : "renew now";

/** the sessions it runs: how many, and their titles where the face has them in its roster */
export function runsOf(ids: string[], rows: Row[]): { count: number; line: string; titles: string[] } {
  const titles = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => !!r).map((r) => titleOf(r.title));
  const count = ids.length;
  return { count, titles, line: count ? many(count, "session") : "no sessions now" };
}

/** a path as the eye takes it: under home as ~, and its last two parts after an ellipsis when long */
export const shortPath = (p: string) => {
  const s = p.replace(/^\/(Users|home)\/[^/]+/, "~"), parts = s.split("/");
  return s.length > 40 && parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : s;
};
/** where each fact is written: three homes, a short name, what it holds, the path second */
export function homesOf(h: Kept["homes"]): { name: string; holds: string; path: string; full: string }[] {
  return [
    { name: "what it keeps", holds: "its pieces, what you did, every renewal", path: shortPath(h.state), full: h.state },
    { name: "its handovers", holds: "one letter per renewal, as it wrote it", path: shortPath(h.handovers), full: h.handovers },
    { name: "the long view", holds: "your answers, and since you were here", path: shortPath(h.long), full: h.long },
  ];
}

/** the quiet mark's words (its label, and the line under the name only when something is under way) */
export function quietOf(k: Kept, now: number): { label: string; line: string } {
  const f = fillOf(k), s = stateOf(k, now);
  const label = f.counted ? `${f.pct}% full · renews itself at ${f.atPct}%` : `not counted yet · renews itself at ${f.atPct}%`;
  return { label, line: s.kind === "renewing" ? (s.stale ? "renewal stuck" : "renewing") : s.kind === "failed" ? "renewal did not go" : "" };
}
