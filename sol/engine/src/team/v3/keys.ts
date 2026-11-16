// Cowork v3's keys (fr-30, slice 0; the design brief "Keys per device"). One Ed25519 key per person, one per machine a
// person runs Sol on and one per agent acting for them, each machine and agent key carrying a certificate signed by its
// person's key, so losing a machine revokes one key, never the person. Kept only here, under the engine's state dir
// (`<state>/cowork-v3/keys/<login>/`, folders 0700, files 0600). Sol never writes a key anywhere else: the person key's
// backup is the person's own (Bitwarden, by hand), never Sol's.
// A person's second machine never gets the person key: it pairs (pair.ts), and the first machine signs the second's
// machine and agent keys under the person key; the second keeps those certificates (`<kind>.<name>.cert.json`) and
// signs with them from then on, so both machines write as one person in every project.
// A public key travels as its raw 32 bytes in base64url (the JWK `x`); a writer is the first 16 hex of its SHA-256.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export type KeyKind = "person" | "machine" | "agent";
/** who wrote: a person, on which of their machines, and whose agent when an agent did */
export type By = { person: string; machine?: string; agent?: string };
/** a machine's or an agent's key, vouched for by its person's key */
export type Cert = { person: string; pkey: string; kind: "machine" | "agent"; name: string; pub: string; sig: string };
/** a key that signs: its public half, its writer id, its certificate (none for a person key) */
export type Signer = { person: string; kind: KeyKind; name: string; pub: string; writer: string; cert?: Cert; sign(data: string | Uint8Array): string };

export const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
export const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** a public key's raw bytes in base64url */
export const pubOf = (k: KeyObject): string => String((k.export({ format: "jwk" }) as { x?: string }).x ?? "");
/** the writer id of a public key: the first 16 hex of its SHA-256 (pure) */
export const writerOf = (pub: string): string => createHash("sha256").update(pub).digest("hex").slice(0, 16);
const keyOf = (pub: string): KeyObject => createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pub }, format: "jwk" });

/** whether sig (base64url) is pub's signature of data; never throws */
export function verifySig(pub: string, data: string | Uint8Array, sig: string): boolean {
  try { return typeof pub === "string" && typeof sig === "string" && edVerify(null, Buffer.from(data), keyOf(pub), Buffer.from(sig, "base64url")); }
  catch { return false; }
}

/** the bytes a person key signs to vouch for a machine or agent key (pure) */
export const certBytes = (c: Omit<Cert, "sig">): string => JSON.stringify([1, "sol-cowork-cert", c.person, c.pkey, c.kind, c.name, c.pub]);
/** whether a certificate is whole and its person key really signed it (pure) */
export function certOk(c: unknown): c is Cert {
  if (!c || typeof c !== "object") return false;
  const x = c as Cert;
  return LOGIN.test(String(x.person)) && (x.kind === "machine" || x.kind === "agent") && NAME.test(String(x.name))
    && typeof x.pkey === "string" && typeof x.pub === "string" && x.pkey !== x.pub && verifySig(x.pkey, certBytes(x), x.sig);
}

/** this machine's name as a key's name: the host's first label, lower case (pure on its input) */
export function machineName(h = hostname()): string {
  const n = h.split(".")[0].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return NAME.test(n) ? n : "this-machine";
}

const signerOf = (person: string, kind: KeyKind, name: string, priv: KeyObject, cert?: Cert): Signer => {
  const pub = pubOf(createPublicKey(priv));
  return { person, kind, name, pub, writer: writerOf(pub), ...(cert ? { cert } : {}), sign: (data) => edSign(null, Buffer.from(data), priv).toString("base64url") };
};

/** the keys of the people on this Sol, in one folder */
export class Keys {
  private cache = new Map<string, Signer>();
  constructor(private dir: string, private machine = machineName()) {}

  private folder(login: string): string {
    if (!LOGIN.test(login)) throw new Error("a key needs a GitHub-style login");
    const d = join(this.dir, login.toLowerCase());
    mkdirSync(d, { recursive: true, mode: 0o700 });
    try { chmodSync(this.dir, 0o700); chmodSync(d, 0o700); } catch { /* private enough */ }
    return d;
  }

  /** a private key read from its file, or made and written once (never overwritten) */
  private load(file: string): KeyObject {
    if (existsSync(file)) return createPrivateKey(readFileSync(file, "utf8"));
    const { privateKey } = generateKeyPairSync("ed25519");
    const tmp = file + ".tmp";
    writeFileSync(tmp, privateKey.export({ format: "pem", type: "pkcs8" }) as string, { mode: 0o600 });
    renameSync(tmp, file);
    return privateKey;
  }

  /** the person's own key: the root the others are signed under */
  person(login: string): Signer {
    const k = `p:${login.toLowerCase()}`, had = this.cache.get(k);
    if (had) return had;
    const s = signerOf(login, "person", login, this.load(join(this.folder(login), "person.pem")));
    this.cache.set(k, s);
    return s;
  }

  private under(login: string, kind: "machine" | "agent", name: string): Signer {
    if (!NAME.test(name)) throw new Error(`a ${kind} key needs a short lower-case name`);
    const k = `${kind}:${login.toLowerCase()}:${name}`, had = this.cache.get(k);
    if (had) return had;
    const priv = this.load(join(this.folder(login), `${kind}.${name}.pem`)), pub = pubOf(createPublicKey(priv));
    const given = this.adopted(login, kind, name, pub);
    let s: Signer;
    if (given) s = signerOf(login, kind, name, priv, given);
    else {
      const p = this.person(login), body = { person: p.person, pkey: p.pub, kind, name, pub };
      s = signerOf(login, kind, name, priv, { ...body, sig: p.sign(certBytes(body)) });
    }
    this.cache.set(k, s);
    return s;
  }

  /** a certificate another machine of this person signed for one of this machine's keys, when it is whole and still names that key */
  private adopted(login: string, kind: "machine" | "agent", name: string, pub: string): Cert | null {
    const file = join(this.folder(login), `${kind}.${name}.cert.json`);
    if (!existsSync(file)) return null;
    try {
      const c = JSON.parse(readFileSync(file, "utf8")) as Cert;
      return certOk(c) && c.pub === pub && c.kind === kind && c.name === name && c.person.toLowerCase() === login.toLowerCase() ? c : null;
    } catch { return null; }
  }

  /** the public keys this machine would sign with for a person: its machine key and its agents', for pairing (made once) */
  pubsFor(login: string, agents: string[]): { machine: string; agents: Record<string, string> } {
    const pubFile = (kind: string, name: string) => pubOf(createPublicKey(this.load(join(this.folder(login), `${kind}.${name}.pem`))));
    return { machine: pubFile("machine", this.machine), agents: Object.fromEntries(agents.filter((a) => NAME.test(a)).map((a) => [a, pubFile("agent", a)])) };
  }

  /** a person key signs another machine's keys (pairing, on the machine that holds it) (pure but for the key) */
  vouch(login: string, kind: "machine" | "agent", name: string, pub: string): Cert {
    if (!NAME.test(name)) throw new Error(`a ${kind} key needs a short lower-case name`);
    const p = this.person(login), body = { person: p.person, pkey: p.pub, kind, name, pub };
    return { ...body, sig: p.sign(certBytes(body)) };
  }

  /** certificates from this person's other machine, for this machine's own keys: kept, and signed with from now on.
   *  Every one must be whole, under one person key, and name a key this machine holds; else nothing is kept */
  adopt(login: string, certs: unknown[]): number {
    const d = this.folder(login);
    const ok = certs.filter(certOk).filter((c) => c.person.toLowerCase() === login.toLowerCase() && (c.kind !== "machine" || c.name === this.machine));
    if (!ok.length || ok.length !== certs.length || new Set(ok.map((c) => c.pkey)).size !== 1) throw new Error("those certificates are not one person's, for this machine");
    for (const c of ok) {
      const pem = join(d, `${c.kind}.${c.name}.pem`);
      if (!existsSync(pem) || pubOf(createPublicKey(createPrivateKey(readFileSync(pem, "utf8")))) !== c.pub) throw new Error(`that certificate is for a key this machine does not hold (${c.kind} ${c.name})`);
    }
    for (const c of ok) {
      const f = join(d, `${c.kind}.${c.name}.cert.json`), tmp = f + ".tmp";
      writeFileSync(tmp, JSON.stringify(c), { mode: 0o600 });
      renameSync(tmp, f);
      this.cache.delete(`${c.kind}:${login.toLowerCase()}:${c.name}`);
    }
    return ok.length;
  }

  /** the person key this machine's keys are signed under: another machine's when it paired, else its own */
  personKeyOf(login: string): string { return this.machineKey(login).cert?.pkey ?? this.person(login).pub; }

  /** this machine's key for a person (another machine's key never lives here) */
  machineKey(login: string): Signer { return this.under(login, "machine", this.machine); }
  /** an agent's key for a person (claude, codex, ...), signed under the person's key */
  agent(login: string, name: string): Signer { return this.under(login, "agent", name); }

  /** the key that signs for `by`: the agent's when an agent wrote, else this machine's, else the person's */
  signerFor(by: By): Signer {
    if (by.agent) return this.agent(by.person, by.agent);
    if (by.machine !== undefined) {
      if (by.machine !== this.machine) throw new Error(`this Sol holds the key of ${this.machine}, not of ${by.machine}`);
      return this.machineKey(by.person);
    }
    return this.person(by.person);
  }

  /** this Sol's machine name */
  get machineName(): string { return this.machine; }
}
