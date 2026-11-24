// How Sol sees you (BR1, #1615; next/you.ts, next/you-read.ts, next/you-accounts.ts; sol/PROTOCOL.md "next.you"):
//   next.you {}                         → next.you { you }
//   next.you.read { sources[], by?, from?, first? } → next.you.reading { kind, at, … } per step (a source left out:
//                                         { kind: "skip", source, why }; first, read first), the last { kind: "done", you };
//                                         then next.you { you }. One read at a time
//   next.you.read.again { source, item } → next.you.reading per step, that one source alone (each row with `again`: item),
//                                         then next.you { you }; one a reason refuses is next.refused with its why
//   next.you.stop {}                    → next.you { you } now: what was read so far, each unfinished source `stopped`
//   next.you.answer { k, yes }          → next.you { you }: a question's answer kept; a no corrects what it claimed
//   next.you.fact.forget { k, back?, what? } → next.you { you }: a fact of a place (parts[].knows) out of every later read
//   next.you.talk { style }             → next.you { you }: how Sol talks, the person's choice (null: the read's or plain)
//   next.you.day { words }              → next.you { you }: what the person does day to day, as they wrote it (you.said)
//   next.you.suggest {}                 → next.you.suggest { sources[], order[], because, by, claudeAsk }
//   next.you.accounts {}                → next.you.accounts { ais[], connectors[] }
//   next.you.key { provider, key }      → next.you.key { ok, provider } | { ok:false, why }
//   next.you.perms { known? }           → next.you.perms { perms[] }
//   next.you.apply { setup[] }          → next.you.applied { apply, items[] }
//   next.you.back { apply, item }       → next.you.applied { apply, item, back: true }
//                                     (an apply or a Back that moves a folder: next.state to every window, its `folders`)
//   next.you.level { place, level }     → next.you.level { place, level, was }
//   next.you.part.drop { id, back? }    → next.you.part { id, dropped }
//   next.you.aims { aims[] } · next.you.sieve { keep[] } · next.you.again { weekly } → the same type, the field written
//   next.known { at? }                  → next.known { at, facts: Known[] }: what Sol knows, one list (next/you-known.ts)
//   next.known.fix { how, what, place, reason, was?, now?, batch?, because? } → { fix: Known, same }: a fix the person made, one line
//   next.known.same { reason, how, reach: here|these|everywhere, to? } → { rule, token }: "Same for these?" answered
//   next.known.same.of { reason, place?, folders? } → { reason, same }: read only, the things like it by reading (F's similar)
//   next.placed {} → { placed[] } the folders Sol placed and not yet seen · next.placed.seen { folder }
//   next.you.source { source, read }    → next.you.source { token, … }: off now (read.off) or on from the next read; Back
//   next.you.fact.fix { k, how, now?, place? } → { preview: { changes, token } } | { saved } (right); { token, keep|back }
//   next.you.claude { on }              → next.you { you }: read with the person's Claude (you.read.claude)
//   next.session.since { folder, session?, after? } → { folder, changes[] } · next.session.leave { session, k }
//   next.fit.try { knob, scope, take, by?, folder? } → { preview: { changes, token } }; { token, keep|back } (fit mode)
//   next.session.told { session }       → { at, place, told: Known[] }: what its first turn told (the "because")
//   next.markup.read { marks[], text? } → next.markup { marks: Marked[], text }: Mark up's marks, each a thing and its
//                                         words, with what Sol knows of it, as the message a session gets (next/markup.ts)
//   next.attach.put { kind, name, data } → { path }; next.attach.shot → { path, url }: the attach menu's file, photo or
//                                         the Sol window's shot, kept under SOL_HOME/next/attach for the message (next/attach.ts)
// Behind ui.next (uiNext(), read on every message): off, nothing here is answered and nothing is read or written. On, only
// Sol's own windows are answered (a person's picture is their own); any other connection hears {ok:false, why}. Look
// again: with again.weekly on, an hourly look re-reads on a Sunday (the sources of the last read, quietly).
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { homedir } from "node:os";
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { answer, apply, backItem, readAgain, byOf, CLAUDE_ASK, recordHomeOf, setDay, setTalk, orderOf, read, realSynth, setAgain, setAims, setKeep, setLevel, youOf, dueAgain, fieldsOf, type Where } from "../next/you.js";
import { accountsOf, checkKey, permsOf, presentSources } from "../next/you-accounts.js";
import { looksOf } from "../next/look.js";
import { marksOf } from "../next/markup.js";
import { putOf, shotOf } from "../next/attach.js";
import { dropKnown, fixFact, forgetKnown, knownNow, leave, noteFix, placedNow, sameFor, sameNow, seenPlaced, setClaude, setReadSource, sinceOf, toldOf, tryFit, type Learned } from "../next/you-known.js";
import { learnedOf } from "../home/sources.js";
import { homeNow } from "../home/wire.js";
import { readRecord } from "../consent.js";
import { stateMsg } from "../next/state.js";
import { whereOf } from "./next.js";

const REFUSED = "only Sol's own windows";
let reading: { halt: AbortController; run: Promise<unknown> } | null = null;

export default function (p: Parts) {
  // the record follows the run's home (recordHomeOf): a run on a fresh SOL_HOME never writes the person's own record
  const where = (sol: string): Where => { const user = process.env.HOME || homedir(); return { sol, user, rec: recordHomeOf(sol, user) }; };
  const hear = (type: string, f: (msg: any, w: Where, h: Parameters<Parameters<Parts["on"]>[1]>[1]) => unknown, reply = type) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type: reply, ...rid, ok: false, why: REFUSED });
      try { const out = await f(msg ?? {}, where(h.HOME), h); if (out) h.face.send({ type: reply, ...rid, ...(out as object) }); }
      catch (e) { h.face.send({ type: "next.refused", asked: type, ...rid, why: (e as Error).message }); }
    });

  hear("next.you", (_m, w) => ({ ok: true, you: youOf(w) }));
  hear("next.you.suggest", (_m, w) => {
    const sources = presentSources(w.user);
    const rec = readRecord(w.rec);
    const f = fieldsOf(rec === "missing" || rec === "broken" ? {} : rec);
    return { ok: true, sources, ...orderOf(f.aims ?? [], sources), by: byOf(w), claudeAsk: CLAUDE_ASK };
  });
  hear("next.you.read", async (m, w, h) => {
    if (reading) return { ok: false, why: "a read is running" };
    const halt = new AbortController();
    const t0 = Date.now();
    const run = read(w, { sources: m.sources, by: m.by, from: m.from, first: m.first, present: presentSources(w.user) }, (e) => h.face.send({ type: "next.you.reading", at: Date.now() - t0, ...e }), { synth: realSynth(w.sol), stop: halt.signal });
    reading = { halt, run };
    try { return { ok: true, you: await run }; } finally { reading = null; }
  }, "next.you");
  // Read this again, on an opened row (Reading, BR1 #1615): one source, alone; a Stop ends it as it ends a read
  hear("next.you.read.again", async (m, w, h) => {
    if (reading) throw new Error("a read is running");
    const halt = new AbortController();
    const t0 = Date.now();
    const run = readAgain(w, m, (e) => h.face.send({ type: "next.you.reading", at: Date.now() - t0, ...e }), { stop: halt.signal });
    reading = { halt, run: run.then((r) => (r.ok ? r.you : youOf(w))) };
    try { const r = await run; if (!r.ok) throw new Error(r.why); return r; } finally { reading = null; }
  }, "next.you");
  // Stop here, keep what's read: the read ends now and its picture is what was read so far; the read's own answer
  // (also next.you) carries the same picture, so the face may take whichever comes first
  hear("next.you.stop", async () => {
    if (!reading) return { ok: false, why: "no read is running" };
    const { halt, run } = reading;
    halt.abort();
    return { ok: true, you: await run };
  }, "next.you");
  hear("next.you.accounts", async (_m, w) => ({ ok: true, ...(await accountsOf(w.user, {
    services: async () => (await (await import("../connectors.js")).connectedServices(w.user)) as { name: string; status: string }[],
    gh: async () => (await import("../connections.js")).checkTool("gh"),
  })) }));
  hear("next.you.key", async (m) => checkKey({ provider: m.provider, key: m.key }));
  hear("next.you.perms", (m, w) => ({ ok: true, perms: permsOf(w.user, m.known, youOf(w).read.closed) }));
  // a place kept, renamed or removed here is the move-in's answer too: every canvas hears the one list (BR1)
  const tellState = async (h: { HOME: string; everyone: (m: object) => void }) => h.everyone(await stateMsg(whereOf(h.HOME)));
  hear("next.you.apply", async (m, w, h) => { const r = apply(w, m); await tellState(h); return r; }, "next.you.applied");
  hear("next.you.back", async (m, w, h) => { const r = backItem(w, m); if (r.ok) await tellState(h); return r.ok ? { ...r, back: true } : r; }, "next.you.applied");
  hear("next.you.level", (m, w) => setLevel(w, m));
  hear("next.you.part.drop", (m, w) => dropKnown(w, m), "next.you.part");
  hear("next.you.aims", (m, w) => setAims(w, m));
  hear("next.you.answer", (m, w) => answer(w, m), "next.you");
  hear("next.you.fact.forget", (m, w) => forgetKnown(w, m), "next.you");
  hear("next.you.talk", (m, w) => setTalk(w, m), "next.you");
  hear("next.you.day", (m, w) => setDay(w, m), "next.you");
  // Home's learned lines join the one list while Home is on (home.sources' learnedOf); off, the list is without them
  hear("next.known", (m, w) => { const ctx = homeNow(); let learned: Learned[] = []; try { learned = ctx ? learnedOf(ctx) : []; } catch { learned = []; } return knownNow(w, m, Date.now(), learned); });
  hear("next.fit.try", (m, w) => tryFit(w, m));
  hear("next.session.told", (m, w) => toldOf(w, m));
  hear("next.you.source", (m, w) => setReadSource(w, m));
  hear("next.you.fact.fix", (m, w) => fixFact(w, m));
  // one store (#1615): every fix the person makes is one scoped line in next.known; "Same for these?" once; where Sol put things
  hear("next.known.fix", (m, w) => noteFix(w, m));
  hear("next.known.same", (m, w) => sameFor(w, m));
  // read only (F's "similar by reading"): the folders it names lend their parts, so a part's reading reaches them too
  hear("next.known.same.of", (m, w) => {
    const folders = Array.isArray(m.folders) ? m.folders.filter((f: unknown): f is string => typeof f === "string").slice(0, 200) : [];
    const looks = folders.length ? Object.entries(looksOf(w.sol, folders)).flatMap(([folder, l]) => l.seen.map((x) => ({ folder, part: x.part, k: x.k, fact: x.fact }))) : [];
    return sameNow(w, m, Date.now(), looks);
  });
  // Mark up (BR1, #1615): the marks read into the message a session gets, with what Sol knows of each thing; read only
  hear("next.markup.read", (m, w) => marksOf(w, m), "next.markup");
  hear("next.attach.put", (m, w) => putOf(w.sol, m), "next.attach");
  hear("next.attach.shot", (_m, w) => shotOf(w.sol), "next.attach");
  hear("next.placed", (_m, w) => placedNow(w));
  hear("next.placed.seen", (m, w) => seenPlaced(w, m));
  hear("next.you.claude", (m, w) => setClaude(w, m), "next.you");
  hear("next.session.since", (m, w) => sinceOf(w, m));
  hear("next.session.leave", (m, w) => leave(w, m));
  hear("next.you.sieve", (m, w) => setKeep(w, m));
  hear("next.you.again", (m, w) => setAgain(w, m));

  // Look again: the Sunday re-read, the last read's sources (consent read again inside read()), heard by every window
  p.atStart((e) => {
    const look = async () => {
      if (!uiNext() || reading) return;
      const w = where(e.HOME);
      const rec = readRecord(w.rec);
      const f = fieldsOf(rec === "missing" || rec === "broken" ? {} : rec);
      if (!dueAgain(f) || !f.read?.sources.length) return;
      const halt = new AbortController();
      const run = read(w, { sources: f.read.sources, by: f.read.by, again: true }, () => {}, { synth: realSynth(w.sol), stop: halt.signal });
      reading = { halt, run };
      try { const you = await run; e.everyone({ type: "next.you", ok: true, you, again: true }); }
      catch { /* the next hour */ } finally { reading = null; }
    };
    setInterval(() => { void look(); }, 3600_000).unref();
  });
}
