// Cowork v3 (fr-30, #574 gap 10): a person's second machine, paired by a one-time code through Sol's cloud trail. The
// person key never leaves the machine that holds it (keys.ts); instead:
//   1. machine A (it holds the person key) offers a code, 8 letters and digits, good for ten minutes: `XXXX-XXXX`;
//   2. on machine B the person types it: B puts its ask in the cloud's mailbox, at the slot SHA-256("sol-pair-slot\n" +
//      code): its name, the login and its public keys (its machine key and its agents'), sealed with an HMAC under the
//      code, so the cloud (which only keeps the two sides, for the ticket's own login, ten minutes) can read nothing
//      that matters and change nothing unseen;
//   3. A, looking at the slot, checks the seal, signs B's keys under the person key and answers, sealed the same way,
//      and vouches for B on the floor of each project (floor.ts certify: a "machine" event, so "my devices" lists it);
//   4. B checks the seal and keeps the certificates (keys.ts adopt): from then on it writes as the same person.
// Why the cloud trail and not the relay: the relay passes live lines between Sols that are on at the same time and
// keeps nothing; a pairing must wait while the person walks from one machine to the other, and the cloud trail is
// already where a person's machines meet, by their own ticket. The mailbox is the cloud's route /relay/pair/<slot>
// (sol/cloud/src/trail.ts); until the cloud trail is deployed, the code pairs nothing (the PR says so).
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { canonical } from "./trail.js";
import { certOk, LOGIN, NAME, type Cert, type Keys } from "./keys.js";

/** where the two sides wait: the cloud's /relay/pair, or memory in the tests */
export type Mailbox = {
  put(slot: string, side: "ask" | "answer", body: unknown): Promise<string>;
  get(slot: string, side: "ask" | "answer"): Promise<unknown>;
};
export const PAIR_TTL = 10 * 60_000;
/** the agents whose keys a paired machine gets signed with its machine key */
export const PAIR_AGENTS = ["sol", "claude", "codex"];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** a new code: 8 of 32 signs (40 bits), as XXXX-XXXX */
export function newCode(): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
/** a code as typed: capitals, no spaces or dashes, O as 0 and I as 1 never (they are not in the alphabet) */
export const cleanCode = (typed: string): string => typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codeOk = (typed: string): boolean => cleanCode(typed).length === 8 && [...cleanCode(typed)].every((ch) => ALPHABET.includes(ch));
export const slotOf = (code: string): string => createHash("sha256").update(`sol-pair-slot\n${cleanCode(code)}`).digest("hex");
const seal = (code: string, body: unknown): string => createHmac("sha256", `sol-pair\n${cleanCode(code)}`).update(canonical(body)).digest("base64url");
const sealOk = (code: string, body: unknown, mac: unknown): boolean => {
  const want = Buffer.from(seal(code, body)), got = Buffer.from(String(mac ?? ""));
  return want.length === got.length && timingSafeEqual(want, got);
};
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

export type Ask = { login: string; name: string; machine: string; agents: Record<string, string>; at: number };
export type Answer = { login: string; certs: Cert[]; by: string; at: number };

/** the pairing of one person's machines, on either machine */
export class Pairing {
  private offered: { code: string; until: number } | null = null;
  private asked: { code: string; until: number } | null = null;
  private now: () => number;
  constructor(private o: { keys: Keys; mailbox: Mailbox; login: string; now?: () => number }) { this.now = o.now ?? Date.now; }

  // ---- machine A, the one with the person key ----
  /** a code to type on the other machine; a new offer replaces the last */
  offer(): { code: string; until: number } {
    if (!LOGIN.test(this.o.login)) throw new Error("sign in to GitHub first: a machine pairs as you");
    this.offered = { code: newCode(), until: this.now() + PAIR_TTL };
    return this.offered;
  }
  /** look at the slot once: the other machine's ask, checked, its keys signed and answered */
  async take(): Promise<{ state: "none" | "waiting" | "gone" } | { state: "paired"; name: string; pub: string } | { error: string }> {
    const off = this.offered;
    if (!off) return { state: "none" };
    if (this.now() > off.until) { this.offered = null; return { state: "gone" }; }
    const got = await this.o.mailbox.get(slotOf(off.code), "ask");
    if (!isObj(got)) return { state: "waiting" };
    const ask = got.ask as Ask;
    if (!isObj(ask) || !sealOk(off.code, ask, got.mac)) return { error: "that ask is not sealed with this code" };
    if (String(ask.login).toLowerCase() !== this.o.login.toLowerCase()) return { error: `that machine pairs as ${ask.login}, not as you` };
    if (!NAME.test(String(ask.name)) || ask.name === this.o.keys.machineName) return { error: "that machine needs a name of its own" };
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(ask.machine))) return { error: "that is not a machine key" };
    const certs: Cert[] = [this.o.keys.vouch(this.o.login, "machine", ask.name, ask.machine)];
    for (const [a, pub] of Object.entries(isObj(ask.agents) ? ask.agents : {})) {
      if (NAME.test(a) && /^[A-Za-z0-9_-]{43}$/.test(String(pub))) certs.push(this.o.keys.vouch(this.o.login, "agent", a, String(pub)));
    }
    const answer: Answer = { login: this.o.login, certs, by: this.o.keys.machineName, at: this.now() };
    const why = await this.o.mailbox.put(slotOf(off.code), "answer", { answer, mac: seal(off.code, answer) });
    if (why) return { error: why };
    this.offered = null;
    return { state: "paired", name: ask.name, pub: ask.machine };
  }

  // ---- machine B, the new one ----
  /** the code typed here: this machine's keys asked to be signed */
  async ask(typed: string): Promise<{ ok: true; until: number } | { error: string }> {
    if (!codeOk(typed)) return { error: "a code is 8 letters and digits, as the other machine shows it" };
    if (!LOGIN.test(this.o.login)) return { error: "sign in to GitHub first: a machine pairs as you" };
    const pubs = this.o.keys.pubsFor(this.o.login, PAIR_AGENTS);
    const ask: Ask = { login: this.o.login, name: this.o.keys.machineName, machine: pubs.machine, agents: pubs.agents, at: this.now() };
    const why = await this.o.mailbox.put(slotOf(typed), "ask", { ask, mac: seal(typed, ask) });
    if (why) return { error: why };
    this.asked = { code: cleanCode(typed), until: this.now() + PAIR_TTL };
    return { ok: true, until: this.asked.until };
  }
  /** look at the slot once: the answer, checked, and its certificates kept */
  async done(): Promise<{ state: "none" | "waiting" | "gone" } | { state: "paired"; by: string; pkey: string } | { error: string }> {
    const a = this.asked;
    if (!a) return { state: "none" };
    if (this.now() > a.until) { this.asked = null; return { state: "gone" }; }
    const got = await this.o.mailbox.get(slotOf(a.code), "answer");
    if (!isObj(got)) return { state: "waiting" };
    const ans = got.answer as Answer;
    if (!isObj(ans) || !sealOk(a.code, ans, got.mac)) return { error: "that answer is not sealed with this code" };
    if (!Array.isArray(ans.certs) || !ans.certs.every(certOk)) return { error: "those certificates do not hold" };
    try { this.o.keys.adopt(this.o.login, ans.certs); } catch (e) { return { error: String((e as Error).message) }; }
    this.asked = null;
    return { state: "paired", by: String(ans.by), pkey: ans.certs[0].pkey };
  }
}

/** a mailbox in memory (tests): what the cloud's route keeps, with its rules */
export function memoryMailbox(): Mailbox & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    async put(slot, side, body) {
      if (rows.has(`${slot}:${side}`)) return "that side was said already";
      if (side === "answer" && !rows.has(`${slot}:ask`)) return "nothing asked on that code yet";
      rows.set(`${slot}:${side}`, JSON.parse(JSON.stringify(body)));
      return "";
    },
    async get(slot, side) { return rows.get(`${slot}:${side}`) ?? null; },
  };
}

/** the cloud's mailbox, /relay/pair/<slot>, with this person's ticket */
export function httpMailbox(o: { base: string; ticket: () => string | Promise<string>; fetch?: typeof fetch }): Mailbox {
  const f = o.fetch ?? fetch;
  const url = (slot: string, side: string) => `${o.base.replace(/\/+$/, "")}/relay/pair/${slot}?side=${side}`;
  return {
    async put(slot, side, body) {
      const r = await f(url(slot, side), { method: "POST", headers: { authorization: `Bearer ${await o.ticket()}`, "content-type": "application/json" }, body: JSON.stringify({ body }), signal: AbortSignal.timeout(15_000) });
      if (r.ok) return "";
      const v = await r.json().catch(() => null) as { error?: string } | null;
      return v?.error ?? `the cloud answered ${r.status}`;
    },
    async get(slot, side) {
      const r = await f(url(slot, side), { headers: { authorization: `Bearer ${await o.ticket()}` }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`the cloud answered ${r.status}`);
      return ((await r.json().catch(() => null)) as { body?: unknown } | null)?.body ?? null;
    },
  };
}
