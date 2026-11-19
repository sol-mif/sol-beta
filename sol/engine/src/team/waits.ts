// A wait the night cannot hide (#1128, step 8; Frank's yes with two conditions, 2026-11-16). At the first session a
// person starts after MORNING_HOUR their local time, every wait on them older than a day (People's read, team/people.ts
// `waits`, each with its `since`) becomes a block that asks (#1298's `asks`) at the top of that session's stage, with
// the choices "on it · later · not mine". One block per wait, carried, never copied:
//   hand, offer   the block E4 already made (team/reach.ts heldCard, its id from the item's), carried to the top
//   ask           one block keyed by the ask
//   review,       one block the first morning, keyed by the issue (or the PR); later mornings carry that same block
//   decision
// A block left on "later" comes back the next morning the same way; one answered (on it, not mine) is settled and stays
// where it is. A block of the same key in another project is never copied into this one: it waits in the Room.
// "not mine" goes back to whoever put the wait on the person: a hand or an offer by reach's reply, an ask by a refusal,
// an issue by a signed comment naming its assigner and the person's own unassign, only when the engine is not quiet
// (parts/waits.ts). Behind the switch morning.waits (settings.ts morningWaits), off unless set true.
// The rules are pure; openMorning and notMineOf act through what they are given, and parts/waits.ts gives them People's
// read, the stage, the clock and GitHub.
import type { Wait, PeopleRead, PersonRead } from "./people.js";
import { heldCard, type Held } from "./reach.js";
import type { Routed } from "../work/asks.js";
import type { Block } from "../work/blocks.js";

export const DAY_MS = 86_400_000;
/** the first session from this hour on (the person's own clock) is the morning's */
export const MORNING_HOUR = 5;
export const MORNING_CHOICES = ["on it", "later", "not mine"];

const low = (s: string) => s.toLowerCase();

/** the waits older than a day (pure): a wait with no `since` is never old */
export const olderThanADay = (waits: Wait[], now: number): Wait[] => waits.filter((w) => w.since > 0 && now - w.since > DAY_MS);

/** the morning a session started at `now` opens (pure): its local day when it is from MORNING_HOUR on and no morning
 *  was opened that day yet, else null. `hour` and `day` are the person's clock, given so a test sets them */
export function morningOf(o: { hour: number; day: string; last?: string }): string | null {
  return o.hour >= MORNING_HOUR && o.day !== o.last ? o.day : null;
}

/** the one key of a wait (pure), the block's id: a hand or an offer is E4's block (heldCard's id), an ask its own, an
 *  issue or a PR by its number */
export function waitKey(w: Wait): string {
  if ((w.why === "hand" || w.why === "offer") && w.id) return `${w.why}-${low(w.id)}`.slice(0, 64);
  if (w.why === "ask" && w.id) return `ask-${low(w.id)}`.slice(0, 64);
  return `wait-${w.n ?? 0}`;
}

/** what the press of an issue's block answers: the kind and the number, as a block's ref id holds them (pure) */
export const issueRef = (w: Wait) => `${w.why}-${w.n ?? 0}`;
export const refIssue = (id: string): { why: string; n: number } | null => {
  const m = /^(review|decision)-(\d{1,7})$/.exec(id);
  return m ? { why: m[1], n: Number(m[2]) } : null;
};

/** a block as the plan reads it */
export type Seen = { project: string; state?: string; asks?: { later?: string; answer?: unknown } };
export type Step =
  | { do: "compose"; key: string; wait: Wait }
  | { do: "carry"; key: string; wait: Wait; later: boolean };

/** the morning's steps (pure): for each wait older than a day, once by its key, carry the block that is there (marked
 *  back when it was left on later) or compose one; a settled block and one in another project are left where they are.
 *  A later block already marked with `day` was carried back this session by work/asks.ts startedSession (a carry is not
 *  idempotent: each one is a ledger line), so the morning does not carry it again */
export function morningPlan(waits: Wait[], o: { now: number; project: string; find: (key: string) => Seen | null; day?: string }): Step[] {
  const out: Step[] = [], seen = new Set<string>();
  for (const w of [...olderThanADay(waits, o.now)].sort((a, b) => a.since - b.since)) {
    const key = waitKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    const b = o.find(key);
    if (!b) { out.push({ do: "compose", key, wait: w }); continue; }
    if (b.project !== o.project) continue;                        // never a copy: it waits in the Room
    if (b.state === "dead" || b.asks?.answer || !b.asks) continue;  // settled
    if (o.day && b.asks.later === o.day) continue;                  // later, back already today
    out.push({ do: "carry", key, wait: w, later: !!b.asks.later });
  }
  return out;
}

const days = (since: number, now: number) => Math.max(1, Math.floor((now - since) / DAY_MS));

/** the block an issue's or an ask's wait becomes (pure): a card that asks, keyed by the wait */
export function waitCard(w: Wait, now: number): { id: string; title: string; body: string; asks: { q: string; choices: string[]; ref: { kind: "issue" | "ask"; id: string }; about?: number; from?: { login: string; agent: boolean } } } {
  const d = days(w.since, now);
  const what = w.why === "review" ? `Review #${w.n}` : w.why === "decision" ? `Decision #${w.n}` : w.why === "ask" ? `${w.from}'s agent asks` : `#${w.n ?? ""}`;
  const title = `${what}: ${w.title}`.replace(/\s+/g, " ").slice(0, 80);
  const body = [`waiting on you ${d} day${d === 1 ? "" : "s"}`, ...(w.from ? [`from ${w.from}`] : []), ...(w.url ? [w.url] : [])].join("\n");
  const ask = w.why === "ask";
  return { id: waitKey(w), title, body,
    asks: { q: `Waiting on you ${d} day${d === 1 ? "" : "s"}`, choices: [...MORNING_CHOICES], ref: ask ? { kind: "ask", id: w.id ?? "" } : { kind: "issue", id: issueRef(w) },
      ...(w.n && !ask ? { about: w.n } : {}), ...(w.from && /^[A-Za-z0-9-]{1,39}$/.test(w.from) ? { from: { login: w.from, agent: ask } } : {}) } };
}

/** the signed comment "not mine" leaves on an issue or a PR (pure): it names whoever put the wait on the person, or
 *  nobody (a bare `now`, a decision given to nobody, an assignment they made themselves) */
export function notMineText(o: { me: string; why: string; n: number; to?: string }): string {
  const back = o.to && low(o.to) !== low(o.me) ? `@${o.to}: it goes back to you. ` : "";
  const off = o.why === "review" ? `${o.me} is taken off its reviewers.` : `${o.me} is unassigned.`;
  const what = o.why === "review" ? "review" : o.why === "decision" ? "decision" : "issue";
  return `**Not mine** (#1128): ${o.me} pressed "not mine" on this ${what}, which waited on them more than a day. ${back}${off}\n\n— ${o.me}'s agent`;
}

/** what a quiet engine says it did not send (pure; condition 2, quiet.ts) */
export const quietSaid = (o: { why: string; n: number; to?: string }) =>
  `quiet (SOL_QUIET): settled here; not sent: the comment on #${o.n}${o.to ? ` naming ${o.to}` : ""} and the ${o.why === "review" ? "review request's removal" : "unassign"}`;

/** the night pass's line (pure): "waited all day: a 2, b 1", each person's waits older than a day, most first */
export function waitedLine(r: Pick<PeopleRead, "people">, now: number): string {
  const n = r.people.map((p) => ({ login: p.login, n: olderThanADay(p.waits, now).length })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.login.localeCompare(b.login));
  return `waited all day: ${n.length ? n.map((x) => `${x.login} ${x.n}`).join(", ") : "nobody"}`;
}

// ---- the morning and "not mine", with what they touch given (parts/waits.ts gives the real ones; a test its own) ----

export type MorningDeps = {
  /** the switch (settings.ts morningWaits) */ on: () => boolean;
  /** the person's clock */ hour: (now: number) => number; day: (now: number) => string;
  last: () => string | undefined; keep: (day: string) => void;
  /** People's read: my card, or null when it is not read */ mine: () => Promise<PersonRead | null>;
  project: (sessionId: string) => Promise<string>;
  find: (key: string) => Seen | null;
  holds: () => Held[];
  /** each settles when its block is placed; a rejection is a block not placed */
  carry: (project: string, key: string, sessionId: string, later: string | null) => void | Promise<unknown>;
  compose: (project: string, sessionId: string, card: { id: string; title: string; body: string; by?: string; asks: Record<string, unknown> }) => void | Promise<unknown>;
};

/** the morning, when this session opens it: each wait older than a day at its top, once by its key. The day is kept only
 *  once every block is placed, so one not placed is tried again at the next session, not the next morning. Returns the
 *  steps taken (none when the switch is off, it is not the morning, or People was not read) */
export async function openMorning(sessionId: string, now: number, d: MorningDeps): Promise<Step[]> {
  if (!d.on()) return [];
  const day = morningOf({ hour: d.hour(now), day: d.day(now), last: d.last() });
  if (!day) return [];
  const me = await d.mine();
  if (!me) return [];   // not read: the next session tries again
  const project = await d.project(sessionId);
  const done: Step[] = [], placing: Promise<unknown>[] = [];
  const act = (f: () => void | Promise<unknown>) => placing.push(Promise.resolve().then(f));
  for (const s of morningPlan(me.waits, { now, project, find: d.find, day })) {
    if (s.do === "carry") { act(() => d.carry(project, s.key, sessionId, s.later ? day : null)); done.push(s); continue; }
    if (s.wait.why === "hand" || s.wait.why === "offer") {
      const h = d.holds().find((x) => x.id === s.wait.id);
      if (!h) continue;   // not in this Sol's thread: nothing to answer it with
      const c = heldCard(h);   // E4's block, its id: the same one E4 makes
      act(() => d.compose(project, sessionId, { ...c, by: `${h.from}'s agent`, asks: { ...c.asks, choices: [...MORNING_CHOICES] } }));
    } else act(() => d.compose(project, sessionId, waitCard(s.wait, now)));
    done.push(s);
  }
  if ((await Promise.allSettled(placing)).every((x) => x.status === "fulfilled")) d.keep(day);
  return done;
}

export type NotMineDeps = {
  quiet: () => boolean; me: () => string;
  gh: (args: string[]) => Promise<string>;
  decline: (askId: string, why: string) => string;
};
/** "not mine" on a wait the morning brought (work/asks.ts setNotMine): back to whoever put it on me. Quiet (condition 2):
 *  nothing posted, unassigned or sent; the answer says what was not sent */
export function notMineOf(d: NotMineDeps) {
  /** who assigned `me` to issue `n`, from its events: the last assignment of me by someone else */
  const assigner = async (n: number, me: string) => {
    const out = await d.gh(["api", `repos/{owner}/{repo}/issues/${n}/events`, "--paginate", "--jq",
      `.[] | select(.event == "assigned" and ((.assignee.login // "") | ascii_downcase) == "${me.toLowerCase()}") | .actor.login`]).catch(() => "");
    const who = out.split("\n").map((l) => l.trim()).filter(Boolean).pop();
    return who && low(who) !== low(me) ? who : undefined;
  };
  return async (b: Pick<Block, "asks">, by: string): Promise<Routed> => {
    const a = b.asks!;
    if (a.ref.kind === "ask") {
      if (d.quiet()) return { to: "nowhere", said: `quiet (SOL_QUIET): settled here; not sent: the refusal to ${a.from?.login ?? "the asking"}'s agent` };
      const r = d.decline(a.ref.id, `${by} says it is not theirs`);
      return { to: /^(refused|reach is not)/.test(r) ? "nowhere" : "relay", said: r };
    }
    const it = refIssue(a.ref.id);
    if (!it) return { to: "nowhere", said: "not mine: the block names no issue; settled here" };
    const me = d.me();
    if (!me) return { to: "nowhere", said: "not mine: this Sol does not know its person's login; settled here" };
    if (it.why === "review") {
      const to = a.from?.login;
      if (d.quiet()) return { to: "nowhere", said: quietSaid({ why: it.why, n: it.n, ...(to ? { to } : {}) }) };
      await d.gh(["pr", "comment", String(it.n), "--body", notMineText({ me, why: it.why, n: it.n, ...(to ? { to } : {}) })]);
      await d.gh(["pr", "edit", String(it.n), "--remove-reviewer", me]).catch(() => "");
      return { to: "github", said: `not mine: said on #${it.n}${to ? ` to ${to}` : ""}; off its reviewers` };
    }
    // reads first (a read goes even when quiet), so a quiet answer names whom it would have told
    const given = await d.gh(["issue", "view", String(it.n), "--json", "assignees", "--jq", "[.assignees[].login] | join(\",\")"])
      .then((s) => s.trim().split(",").some((l) => low(l) === low(me))).catch(() => false);
    const to = given ? await assigner(it.n, me) : undefined;
    if (d.quiet()) return { to: "nowhere", said: quietSaid({ why: it.why, n: it.n, ...(to ? { to } : {}) }) };
    await d.gh(["issue", "comment", String(it.n), "--body", notMineText({ me, why: it.why, n: it.n, ...(to ? { to } : {}) })]);
    if (given) await d.gh(["issue", "edit", String(it.n), "--remove-assignee", me]).catch(() => "");
    return { to: "github", said: `not mine: said on #${it.n}${to ? ` to ${to}` : ""}; ${given ? "unassigned" : "nobody to unassign"}` };
  };
}
