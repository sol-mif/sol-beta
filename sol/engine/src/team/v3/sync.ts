// Cowork v3's sync (fr-30, slice 0): the trail reaches Sol's cloud when it can, and comes back from it. Local first:
// a write is on this Sol's trail at once and folds at once; it is "waiting to send" until the cloud has kept it. A push
// sends a project's waiting events oldest first; the cloud keeps each by id, so a push repeated after a lost answer
// makes no duplicate. A pull asks for what the cloud kept after the cursor and merges it (trail.merge checks every
// signature and chain again: the cloud is never trusted to fold). The cloud away is not an error: the events wait.
import type { Bad, Trail, TrailEvent } from "./trail.js";

/** what Sync needs of the cloud: append and since for a project, nothing else */
export type Cloud = {
  append(project: string, events: TrailEvent[]): Promise<{ kept: string[]; refused: { id: string; why: string }[] }>;
  since(project: string, seq: number): Promise<{ events: TrailEvent[]; seq: number; more?: boolean }>;
};
export type SyncState = { waiting: number; away: string; pushedAt: number; pulledAt: number };
export type PushResult = { sent: number; waiting: number; refused: { id: string; why: string }[]; away?: string };
export type PullResult = { added: TrailEvent[]; bad: Bad[]; away?: string };

const BATCH = 200;
const line = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160);

/** the cloud's trail over HTTP (sol/cloud/src/trail.ts): base is the cloud's https origin, ticket the hub ticket a
 *  member signs in with. A project is a cloud room's code */
export function httpCloud(o: { base: string; ticket: () => string | Promise<string>; fetch?: typeof fetch }): Cloud {
  const f = o.fetch ?? fetch;
  const url = (project: string, q = "") => `${o.base.replace(/\/+$/, "")}/relay/rooms/${encodeURIComponent(project)}/trail${q}`;
  const call = async (u: string, init: RequestInit = {}) => {
    const r = await f(u, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await o.ticket()}` }, signal: AbortSignal.timeout(15_000) });
    const v = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!r.ok) throw new Error(typeof v?.error === "string" ? v.error : `the cloud answered ${r.status}`);
    return v ?? {};
  };
  return {
    async append(project, events) {
      const v = await call(url(project), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) });
      return { kept: Array.isArray(v.kept) ? v.kept.map(String) : [], refused: Array.isArray(v.refused) ? v.refused as { id: string; why: string }[] : [] };
    },
    async since(project, seq) {
      const v = await call(url(project, `?since=${seq}`));
      return { events: Array.isArray(v.events) ? v.events as TrailEvent[] : [], seq: Number(v.seq) || seq, more: v.more === true };
    },
  };
}

/** one Sol's sync with the cloud */
export class Sync {
  private st = new Map<string, SyncState>();
  private now: () => number;
  constructor(private trail: Trail, private cloud: Cloud, o: { now?: () => number } = {}) { this.now = o.now ?? Date.now; }

  private s(project: string): SyncState {
    let x = this.st.get(project);
    if (!x) { x = { waiting: 0, away: "", pushedAt: 0, pulledAt: 0 }; this.st.set(project, x); }
    x.waiting = this.trail.waiting(project, 100_000).length;
    return x;
  }
  /** a project's sync as the face shows it: how many wait to send, and why when the cloud is away */
  state(project: string): SyncState { return { ...this.s(project) }; }
  /** whether one event is still waiting to send (the item's "waiting to send" chip) */
  isWaiting(id: string): boolean { return this.trail.isWaiting(id); }

  /** the project's waiting events to the cloud, oldest first, a batch at a time; kept ones are marked sent, refused ones
   *  stop waiting with their line, and nothing is lost when the cloud is away */
  async push(project: string): Promise<PushResult> {
    const s = this.s(project), refused: PushResult["refused"] = [];
    let sent = 0;
    for (let round = 0; round < 1000; round++) {
      const out = this.trail.waiting(project, BATCH);
      if (!out.length) break;
      let r: Awaited<ReturnType<Cloud["append"]>>;
      try { r = await this.cloud.append(project, out); }
      catch (e) { s.away = line(e); return { sent, waiting: this.s(project).waiting, refused, away: s.away }; }
      s.away = "";
      const mine = new Set(out.map((e) => e.id));
      const kept = r.kept.filter((id) => mine.has(id));
      this.trail.markSent(kept);
      for (const x of r.refused) if (mine.has(x.id)) { this.trail.markRefused(x.id, String(x.why)); refused.push(x); }
      sent += kept.length;
      if (!kept.length && !r.refused.length) break;   // a cloud that answers nothing: try again later
    }
    s.pushedAt = this.now();
    return { sent, waiting: this.s(project).waiting, refused };
  }

  /** what the cloud kept after the cursor, merged; the cursor moves only past what was read */
  async pull(project: string): Promise<PullResult> {
    const s = this.s(project), added: TrailEvent[] = [], bad: Bad[] = [];
    for (let round = 0; round < 1000; round++) {
      let r: Awaited<ReturnType<Cloud["since"]>>;
      try { r = await this.cloud.since(project, this.trail.cursor(project)); }
      catch (e) { s.away = line(e); return { added, bad, away: s.away }; }
      s.away = "";
      const m = this.trail.merge(r.events.filter((e) => e && e.project === project), { sent: true });
      added.push(...m.added); bad.push(...m.bad);
      this.trail.markSent(r.events.map((e) => e.id).filter((id) => typeof id === "string"));   // mine came back: the cloud has them
      if (r.seq > this.trail.cursor(project)) this.trail.setCursor(project, r.seq);
      if (!r.more || !r.events.length) break;
    }
    s.pulledAt = this.now();
    return { added, bad };
  }

  /** push, then pull */
  async run(project: string): Promise<{ push: PushResult; pull: PullResult }> {
    const push = await this.push(project);
    return { push, pull: await this.pull(project) };
  }
}
