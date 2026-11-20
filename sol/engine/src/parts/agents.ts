// Agents (#1327), the wire: every agents.* message, the same type and rid back. The rules grouped into fixed, dedicated
// agents, one per job across places (agent/agents.ts, agent/meta/); the engine still runs rules (agent/index.ts).
//   agents.list {}                        → { agents, folderRules, offers (how many open), offersKey (changes only
//                                           when a stored offer does: the face reads agents.offers then), joins (open), asks (meta/asks.ts: front, then, more, need, home), shelves, changes, looking } (never
//                                           waits on Jev: agents.json missing, no agents yet and the first grouping by the
//                                           same-job test in the background; there, the late look in the background;
//                                           `looking: true` while either runs, agents.changed when it ends). Each agent also: parameter, kinds, reach,
//                                           places [{place, name, trust, first?, trigger, folder, rule}], learned
//                                           [{id, line, place|null}], asks [{fix, place, before, after, q}], pending?,
//                                           role (≤12 words), steps [{when, at, what, folder, rule}] (times of day),
//                                           waits (its work waiting in Home), stucks [{site, folder, rule, since,
//                                           next?}]. Routines ride in folderRules (helper?, stuck? one such);
//                                           met; intro {ids, agents, sites}
//                                           before the first visit (the sign-in holds Sol made, one undo); jevNote (a
//                                           line, until agents.noted) when the person's own model asked in Jev's place
//   agents.run {id}                       → each of its rules not off, one after another; the tickets
//   agents.mode {id, mode}                → off · watch · do on each rule (policy.md); a change line
//   agents.rest {id, on}                  → holds or wakes all its rules; a change line
//   agents.undo {changeId | changeIds}    → one change reversed, or one cause's changes together
//   agents.meet {}                        → the person saw the floor: the keeper keeps fully from now on
//   agents.switch {on?}                   → the window's agents.mode, kept (agent/switch.ts): off, the keeper and the meta
//                                           rest, the clock skips nothing they held, an agent's runs are chats again → { on }
//   agents.noted {}                       → the line about Jev was read: it is not said again
//   agents.regroup {answer}               → an older Sol's grouping asked about: "regroup" (the agents as Sol groups
//                                           them now, what the person set kept) or "keep" (never asked again); a change line
//   agents.signin {id | folder, rule}     → the sign-in window for the site it is stuck on (a routine by its rule)
//   agents.make {line, folder, time}      → a clock rule in that folder's policy.md and an agent of its own
//   agents.rename {id, name}
//   agents.seen {what, paintMs?, cards?, ids?, raw?} → the face drew a place: whether Agents worked right, counted
//                                           (agent/inuse.ts: never a word, the checks green or red) → {}
//   agents.offers {}                      → { offers: [{ id, name, job, steps, parameter, kind, places: [{place, name,
//                                           checked, why?, ask?}], reach, count, showMe?, seen: [{place, at, text}],
//                                           on: {place, sticky} }] } the open ones (the traces read, the gate run first)
//   agents.offer {id, answer, places?}    → answer keep · later · never; keep writes one rule into each place ticked
//                                           (places, else the checked ones) → { agent, change }; later, never → { change }
//   agents.scope {id, add? | remove?}     → a place added (its first run at drafts at most) or taken out (its rule off)
//                                           → { change }
//   agents.fix {id, place, before, after, always?} → the person rewrote a line it made. First time: { ask: "Always like
//                                           this?" } (always: true learns, false keeps it once); the same fix twice is
//                                           learned anyway → { learned: {id, line, place|null}, redo: [{folder, rule}],
//                                           change }; the open work in redo is run again at once
//   agents.change {id, line, keep?}       → rehearsed on the last real run → { before, after }; keep: written into every
//                                           place → { before, after, change }; a line a learned one already says →
//                                           { same: learned }
//   agents.desk {id}                      → { work: [{place, name, folder, rule, at, made, file?, lines, unread?}] (its last runs
//                                           per place, newest first), more: [{place, name, why?}] (its kind's other places) }
//   agents.trust {id, trust}              → how far: looks · drafts · does on every place (asks stays asks; does refused
//                                           for work others see) → { change }
//   agents.join {id, answer}              → the ask band of the grouping: two rules in places of one kind that Jev
//                                           scored 0.45–0.7 (meta/join.ts). answer together → { agent, change } (one
//                                           agent, undo brings the two back); apart → { change } (never asked again).
//                                           Two rules of one place (inPlace): "One agent for these two steps?", the
//                                           same answers, together making one agent that does both
// The open join asks ride on agents.list as `joins: [{ id, places, names, steps: string[][], p (null: no score, the
// person's own model said yes), agents: [{id, name, turn}], inPlace? }]` (steps: each rule's clauses, its place shown
// as "<place>"), not on agents.offers: an offer is a job Sol
// noticed and its kind's tiles, a join is two agents the floor already shows, so the face reads both from one list.
// With the new face on (seatsOn, ui.next; #1620) each agent in agents.list also carries `seat` (the AI it runs on:
// "codex" for every folder agent today, agent/run.ts) and `blocked`: {by, why} where `by` is a connections row id (its
// seat row lapsed or missing, or a site row it is stuck at), null when nothing blocks it, and ABSENT when not known
// (no `connections {seats: true}` read since the engine started). It reads the kept list and never asks it anew.
//   (pushed) agents.changed               → to every face when agents.json changes (and with agent.changed, index.ts)
import { agentsOn, setAgentsOn } from "../agent/switch.js";   // agents.mode reaches the engine (#18)
import type { Parts, Heard } from "../parts.js";
import { agentsNow } from "../agent/index.js";
import { startSignIn } from "../agent/comms.js";
import { blockedOf, keptWithSeats, seatsOn } from "../connections.js";
import { SITES, nameOf } from "../agent/sites.js";
import { listNow, loadAgents, make, meet, mode, noted, onAgentsChanged, regroup, rename, rest, run, stuckOf, undo, undoMany } from "../agent/agents.js";
import { answerOffer, offers } from "../agent/meta/offer.js";
import { changeJob, fix, scope } from "../agent/meta/learn.js";
import { answerJoin } from "../agent/meta/join.js";
import { makeAsk } from "../agent/meta/jev.js";
import { desk, trust } from "../agent/meta/desk.js";
import { countError } from "../errcount.js";
import { noteSeen } from "../agent/inuse.js";
import { readLedger, readThread } from "../agent/store.js";
import { codexTalks } from "../threads.js";
import { track, trackDir } from "../track.js";
import { join } from "node:path";
import type { Mode } from "../agent/harness.js";

/** one message's answer (no type, no rid) */
export async function answer(m: Record<string, any>): Promise<object> {
  const a = agentsNow();
  if (!a) return { ok: false, why: "the folder agents are not running on this engine" };
  const id = String(m.id ?? "");
  switch (m.type) {
    case "agents.list": { const r = await listNow(a, a.d.ask ?? makeAsk({ home: a.d.home })); return seatsOn() ? seated(r) : r; }
    case "agents.offers": return offers(a);
    case "agents.offer": return answerOffer(a, id, String(m.answer ?? ""), Array.isArray(m.places) ? m.places.map(String) : undefined);
    case "agents.scope": return scope(a, { id, ...(m.add ? { add: String(m.add) } : {}), ...(m.remove ? { remove: String(m.remove) } : {}) });
    case "agents.fix": {
      const r = await fix(a, { id, place: String(m.place ?? ""), before: String(m.before ?? ""), after: String(m.after ?? ""), ...(typeof m.always === "boolean" ? { always: m.always } : {}) });
      // a learned line redoes the open work at once
      for (const x of ("redo" in r && r.redo) || []) void a.runRule(x.folder, x.rule, true).catch(() => {});
      return r;
    }
    case "agents.desk": return desk(a, id);
    case "agents.trust": return trust(a, id, String(m.trust ?? ""));
    case "agents.join": return answerJoin(a, id, String(m.answer ?? ""));
    case "agents.change": return changeJob(a, { id, line: String(m.line ?? ""), keep: m.keep === true });
    case "agents.run": return run(a, id);
    case "agents.mode": return mode(a, id, String(m.mode ?? "") as Mode);
    case "agents.rest": return rest(a, id, m.on !== false);
    case "agents.undo": return Array.isArray(m.changeIds) ? undoMany(a, m.changeIds.map(String)) : undo(a, String(m.changeId ?? ""));
    case "agents.meet": return meet(a);
    case "agents.switch": { if (typeof m.on === "boolean") setAgentsOn(a.d.home, m.on); return { on: agentsOn(a.d.home) }; }
    case "agents.noted": return noted(a);
    case "agents.regroup": return m.answer === "regroup" || m.answer === "keep" ? regroup(a, m.answer) : { ok: false, why: "answer regroup or keep" };
    case "agents.make": return make(a, String(m.line ?? ""), String(m.folder ?? ""), String(m.time ?? ""));
    case "agents.rename": return rename(a, id, String(m.name ?? ""));
    case "agents.seen": {
      const home = a.d.home;
      await noteSeen(m, {
        file: () => loadAgents(home), ledgerOf: (folder) => readLedger(join(home, folder), 100_000),
        threads: () => a.folders().map((f) => readThread(f.path)),
        listed: async () => new Set((await codexTalks(talksHome || home)).map((t) => t.id)),
        trackDir: trackDir(),
      });
      return {};
    }
    case "agents.signin": {
      const s = stuckOf(a, id, m.folder && m.rule ? { folder: String(m.folder), rule: String(m.rule) } : undefined);
      if (!s) return { ok: false, why: "it is not stuck at a sign-in" };
      return startSignIn(a, s.folder, s.site, s.rule);
    }
    default: return { ok: false, why: `unknown message ${m.type}` };
  }
}

/** agents.list with each agent's seat and what blocks it (#1620): folder agents run on Codex (agent/run.ts) */
export function seated<T extends { agents: { stucks: { folder: string; site: string }[] }[] }>(r: T, rows = keptWithSeats()): T {
  const key = (s: string) => SITES.find((x) => nameOf(x) === s || x === s) ?? s;   // a stuck names its site as read
  return { ...r, agents: r.agents.map((x) => {
    const b = blockedOf("codex", x.stucks.map((s) => ({ folder: s.folder, site: key(s.site) })), rows);
    return { ...x, seat: "codex" as const, ...(b === undefined ? {} : { blocked: b }) };
  }) };
}

// where Build's chats list its Codex talks (index.ts's HOME, set at start): an agent's run listed there is a stray chat
let talksHome = "";

async function heard(m: any, { ws, send }: Heard) {
  try {
    const r = await answer(m);
    if (m.type === "agents.list" && (r as { ok?: boolean }).ok === false) track("agents.read.failed");
    send(ws, { type: m.type, rid: m.rid, ...r });
  }
  catch (err) {
    countError(err, "work", m.type);   // Agents count with Work, as the folder agent does (errcount.ts has no kind for it)
    send(ws, { type: m.type, rid: m.rid, ok: false, why: err instanceof Error ? err.message.split("\n")[0] : String(err) });
  }
}

export default function (p: Parts) {
  p.on("agents.", heard);
  p.atStart((e) => { talksHome = e.HOME; onAgentsChanged(() => e.everyone({ type: "agents.changed" })); });
}
