// The seam for waking another Sol (#1320; seams/README.md). A wake is a small word to one person's Sol: who, what kind
// (chat, decision, claim…), one line, and where it points (an issue, a repository). Every caller in the engine asks
// wakeUp(), so what carries it (today: the team relay's `ping`, kept by the hub for whoever is away) can be swapped for
// another carrier (a signal through the cloud with no content in it, a backend of our own) by one file. What a wake
// does when it lands (the card, the dial, the agent's list) stays team/pings.ts's; reading GitHub for comments that
// wake my agent stays team/wake.ts's.
// Behind it: the relay's ping, as before; with SOL_WAKE_CARRIER=signal (#1377, the plan on #229), the signal
// (team/signal.ts): who → whom, a kind and a link, never the line. It goes as a signal only to a hub that says it
// carries them and only when the wake points somewhere (an issue, a PR, a Discussion, a link) and is no chat line; else
// the ping, as before. Every Sol hears both, whatever its own switch: the switch is for sending, so a teammate who
// turned it on reaches me, and nothing said either way is lost (a Sol from before this hears pings only).
import { sendRelay, onRelay, relayHub, type RelayMsg } from "../team/relay.js";
import { fetchSignal, signalFor, signalOn } from "../team/signal.js";
import { wakeSignalled } from "../team/wake.js";
import { runGh } from "../team/record/github.js";

export type { RelayMsg };

export interface Wake {
  /** a wake to one person (`{ to, pingKind, line, issue?, repo?, link?, … }`, as the relay's ping); false when it could not go */
  send(p: Record<string, unknown>, agent?: boolean): boolean;
  /** a wake that came, as a ping (a signal's after its link was read) */
  heard(fn: (m: RelayMsg) => void): () => void;
}

export type SignalDeps = {
  send: typeof sendRelay;
  on: typeof onRelay;
  /** whether the hub in use carries signals (its hello said so) */
  carries: () => boolean;
  gh: (args: string[]) => Promise<string>;
  /** a GitHub comment a signal pointed at, to the wake (team/wake.ts) */
  woken: typeof wakeSignalled;
};
const signalDeps = (): SignalDeps => ({ send: sendRelay, on: onRelay, carries: () => relayHub().info?.signal === true, gh: (a) => runGh(a), woken: wakeSignalled });

/** signals kept for me while I was away (#1377): read once a link, the newest READ_KEPT links at most */
export const READ_KEPT = 20;

/** signals heard (#1377), whichever carrier sends mine: each read by a small program and given on as the ping card it
 *  makes, its addressed comments to the wake. Kept ones come back together on a hello: one read a link, and more than
 *  three cards are one, as kept pings are (team/wire.ts missedPings); each is said as live, so the card is made */
function hearSignals(d: SignalDeps, fn: (m: RelayMsg) => void): () => void {
  const woke = (comments: Parameters<typeof wakeSignalled>[0]) => { if (comments.length) void d.woken(comments).catch((e) => console.error("wake: a signalled comment failed", e)); };
  const live = d.on("signal", (m) => {
    if (m.spooled) return;   // in the batch below
    void fetchSignal(m, d.gh).then(({ ping, comments }) => { fn(ping); woke(comments); }, (e) => console.error("wake: a signal could not be read", e));
  });
  const kept = d.on("spooled", (all) => {
    const list = (Array.isArray(all.messages) ? all.messages as RelayMsg[] : []).filter((m) => m?.kind === "signal");
    if (!list.length) return;
    const byLink = new Map<string, RelayMsg>();
    for (const m of list) { byLink.delete(String(m.link)); byLink.set(String(m.link), m); }
    void (async () => {
      const pings: RelayMsg[] = [];
      for (const m of [...byLink.values()].slice(-READ_KEPT)) {
        try { const r = await fetchSignal(m, d.gh); pings.push(r.ping); woke(r.comments); } catch (e) { console.error("wake: a kept signal could not be read", e); }
      }
      if (pings.length <= 3) { for (const p of pings) fn(p); return; }
      const last = pings[pings.length - 1];
      fn({ ...last, issue: undefined, repo: undefined, pingKind: "chat", line: `while you were away: ${list.length} signals` } as RelayMsg);
    })();
  });
  return () => { live(); kept(); };
}

/** today's: the team relay's ping; signals are heard too, so a teammate who sends them reaches me */
export const relayWake = (d: SignalDeps = signalDeps()): Wake => ({
  send: (p, agent = false) => d.send("ping", p, agent),
  heard: (fn) => { const a = d.on("ping", fn), b = hearSignals(d, fn); return () => { a(); b(); }; },
});

/** the signal (#1377): a wake that points somewhere goes as who → whom, a kind and a link to a hub that carries them;
 *  anything else as the ping. Heard as relayWake hears */
export const signalWake = (d: SignalDeps = signalDeps()): Wake => ({
  send: (p, agent = false) => {
    const s = d.carries() ? signalFor(p) : null;
    return s ? d.send("signal", s, agent) : d.send("ping", p, agent);
  },
  heard: relayWake(d).heard,
});

/** which carrier: SOL_WAKE_CARRIER=signal is the signal's; anything else, the relay's ping (read once, at the first ask) */
export const wakeOf = (env: NodeJS.ProcessEnv = process.env): Wake => (signalOn(env) ? signalWake() : relayWake());

let current: Wake | null = null;
/** the wake in use */
export const wakeUp = (): Wake => (current ??= wakeOf());
/** another carrier behind the seam (the tests, later another backend); null is today's again */
export const useWake = (w: Wake | null) => { current = w; };
