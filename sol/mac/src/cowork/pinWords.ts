// Pin and go back (#426, engine team/pin.ts, PROTOCOL.md round 79): the face's words and the answer read, pure, so
// the tests read them without a window. Words people see: pin, go back, back to latest, lost; never branch or commit.

export type Pin = { tag: string; sha: string; at: string; back?: boolean };
export type PinRelease = { tag: string; sha: string; at: string; data: number; pins: boolean };   // pins: it has back to latest
export type PinView = { pin: Pin | null; here: { tag: string; sha: string } | null; releases: PinRelease[]; data: number; mine: boolean; going?: string };
export type PinPlan = { tag: string; sha: string; at: string; said: string; sure: string; own: number; lost: { file: string; since: string | null }[] };

/** team.pin read (pure): null for an engine that does not pin yet (an error, or no `releases`) */
export function pinViewOf(m: any): PinView | null {
  if (!m || typeof m !== "object" || m.error || !Array.isArray(m.releases)) return null;
  const pin = m.pin && typeof m.pin.sha === "string" ? { tag: String(m.pin.tag ?? ""), sha: m.pin.sha, at: String(m.pin.at ?? ""), ...(m.pin.back ? { back: true } : {}) } : null;
  const here = m.here && typeof m.here.sha === "string" ? { tag: String(m.here.tag ?? ""), sha: m.here.sha } : null;
  const releases = m.releases.filter((r: any) => r && typeof r.tag === "string" && typeof r.sha === "string")
    .map((r: any) => ({ tag: r.tag, sha: r.sha, at: String(r.at ?? ""), data: Number(r.data) || 0, pins: r.pins !== false }));
  return { pin, here, releases, data: Number(m.data) || 0, mine: !!m.mine, ...(m.going ? { going: String(m.going) } : {}) };
}

/** team.pin.plan read (pure): a plan, or the reason there is none */
export function planOf(m: any): PinPlan | { error: string } {
  if (!m || m.error || typeof m.sure !== "string" || typeof m.said !== "string") return { error: String(m?.error || "Sol could not say what going back would do") };
  return { tag: String(m.tag), sha: String(m.sha), at: String(m.at ?? ""), said: m.said, sure: m.sure, own: Number(m.own) || 0, lost: Array.isArray(m.lost) ? m.lost : [] };
}

const short = (t: string, sha: string) => t || sha.slice(0, 8);
/** the one line for the pin row (pure) */
export function pinLine(v: PinView): string {
  if (v.going) return v.going;
  if (v.pin) return `pinned to ${short(v.pin.tag, v.pin.sha)}${v.pin.back ? ", gone back to" : ""}: no new release until back to latest`;
  return `takes each new release${v.here?.tag ? `; runs ${v.here.tag} now` : ""}`;
}

/** the releases one can go back to (pure): the last thirty days', all but the one it runs, newest first */
export const goable = (v: PinView): PinRelease[] => v.releases.filter((r) => r.sha !== v.here?.sha);

/** a release's day for a list (pure): "Oct 28, 9:00 AM" */
export const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/** whether going back to this one loses saved data (pure): its build knows fewer conversion steps than this home ran */
export const losesData = (v: PinView, r: PinRelease) => r.data < v.data;

/** whether the timeline offers "go back here" on a release (pure): a release (not main), not the one I run, of the last thirty days */
export const backable = (r: { tag: string; kind: string; at: string }, meOn: string | null | undefined, now = Date.now()) =>
  r.kind !== "next" && r.tag !== meOn && /^(dev|stable)-/.test(r.tag) && now - new Date(r.at).getTime() <= 30 * 86_400_000;
