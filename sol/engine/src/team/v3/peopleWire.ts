// Cowork v3, slice 3 (fr-30, #556): the three wire cases, team.v3.people, team.v3.window and team.v3.running. wire.ts
// imports this file only when the switch is on (F7), and hands it what it already reads today (the roster, the board's
// PRs, the timeline, the rhythm, the review opener), so nothing here reads GitHub or a file of its own.
import * as P from "./people.js";
import { nowLine, devFace, isDevProject, type Red, type Run, type Rhythm, type PrLike, type ReleaseLike, type PlacedLike, type WaitingLike, type RunningAnswer } from "./running.js";

export type V3Deps = {
  me: () => string;
  machine?: () => string;
  project: () => { id: string; repos: string[]; owners: string[]; members: string[]; modules?: string[] };
  roster: () => P.Roster[];
  prs: () => PrLike[];
  timeline: () => Promise<{ waiting: WaitingLike[]; releases: ReleaseLike[]; people: PlacedLike[] } | null>;
  rhythm: (repo: string) => Promise<Rhythm | null>;
  reds?: () => Red[] | Promise<Red[]>;
  runs?: () => Run[];
  /** the review opener the night's timer uses (wire.ts tonightNow), pressed by the person in Sol's own window */
  openReview: (repo: string) => Promise<{ session?: string; error?: string }>;
  /** the review session open now for the repo, if any: its card holds the verdict presses */
  reviewOpen?: (repo: string) => Promise<string | null>;
};

const seedOf = (d: V3Deps) => { const pr = d.project(); return { owners: pr.owners.length ? pr.owners : [d.me()], editors: pr.members, by: d.me() }; };
const actorOf = (d: V3Deps): P.Actor => ({ who: d.me(), ...(d.machine ? { machine: d.machine() } : {}) });

/** one answer per message; an unknown op answers with an error, never silence */
export async function handleV3(d: V3Deps, m: any): Promise<object> {
  const pr = d.project(), project = pr.id, me = d.me(), op = String(m.op ?? "");
  P.peopleOf(project, seedOf(d));   // the trail names this project's people before any answer reads it
  const role = P.roleOf(P.peopleOf(project), me);
  switch (m.type) {
    case "team.v3.people": {
      if (!op) return P.people(project, me, d.roster());
      if (op === "layer") return P.setLayer(project, actorOf(d), m.layer, String(m.key ?? ""), m.value === null ? null : String(m.value ?? ""));
      if (op === "role") return P.setRole(project, actorOf(d), String(m.who ?? ""), m.role);
      if (op === "hand") return P.hand(project, actorOf(d), { id: String(m.item ?? ""), title: String(m.title ?? "") }, String(m.to ?? ""));
      if (op === "hand.send") return P.handSend(m.card, actorOf(d));
      if (op === "hand.undo") return P.handUndo(project, actorOf(d), String(m.undo ?? ""));
      if (op === "leave") return P.leave(project, actorOf(d), String(m.who ?? ""));
      return { error: "no such op" };
    }
    case "team.v3.window": {
      if (!op) return P.window(project, String(m.whose ?? me) || me, me, factsOf(d, String(m.whose ?? me) || me));
      if (op === "move") return P.moveChip(project, actorOf(d), String(m.chip ?? ""), m.ring);
      if (op === "undo") return P.undoMove(project, actorOf(d), String(m.undo ?? ""));
      return { error: "no such op" };
    }
    case "team.v3.running": {
      const repo = pr.repos[0] ?? "";
      if (op === "review") {
        if (!P.abilities(role).presses) return { error: P.GUEST_NO };
        if (m.fromSol !== true) return { error: "only Sol's own window" };   // set by index.ts from the socket, never the message
        return d.openReview(String(m.repo ?? repo));
      }
      if (op) return { error: "no such op" };
      const rhythm = repo ? await d.rhythm(repo).catch(() => null) : null;
      const reds = await Promise.resolve(d.reds?.() ?? []).catch(() => [] as Red[]);
      const line = nowLine({ reds, runs: d.runs?.() ?? [], rhythm, now: new Date(), role });
      let dev: RunningAnswer["dev"] = null;
      if (repo && isDevProject(pr.repos, pr.modules)) {
        const t = await d.timeline().catch(() => null);
        dev = devFace({ repo, me, role, prs: d.prs(), waiting: t?.waiting ?? [], releases: t?.releases ?? [], people: t?.people ?? [], rhythm, reviewOpen: (await d.reviewOpen?.(repo).catch(() => null)) ?? null });
      }
      return { project, role, line, dev } satisfies RunningAnswer;
    }
  }
  return { error: "no such message" };
}

/** what a person's work facts say, read from what Sol already knows of them (the roster) */
function factsOf(d: V3Deps, whose: string): Record<string, string> {
  const r = d.roster().filter((x) => x.who.toLowerCase() === whose.toLowerCase());
  const person = r.find((x) => !x.agent);
  const on = person?.session?.title || person?.thing?.name || "";
  return { on: on || "nothing open", presence: person && person.state !== "away" ? "here now" : "away" };
}
