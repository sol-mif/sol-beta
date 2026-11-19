// One way to connect a provider to this Sol (#1230, step 3 of #1222), grown from Cowork's "connect Google Drive" (#152):
// a separate, explicit step, never part of signing in to Sol. The same way as that sign-in (cloud.ts, RFC 8252): the
// system browser, a one-off listener on 127.0.0.1 and a port of its own, PKCE, a `state` checked in constant time. The
// code goes to the cloud, which alone holds the provider's client secret, and comes back as a grant: an access token
// for an hour and a refresh token. Kept in `<state>/<provider>/account.json` (0600, its folder 0700): the cloud it came
// through, the refresh token, the scope and the email; never the access token, which lives in memory and is refreshed
// through the same cloud a minute before its hour ends. Disconnecting revokes the grant and forgets it here. Nothing of
// it is ever said in a log, a chat or a face: a face hears `connected`, the email and the scope.
//
// What differs per provider is a row (Provider): its consent page, the scopes it may ask for, its routes on the cloud
// (sol/cloud/src/grant.ts, the same rows keyed the same way), how a grant is revoked, and its words. Drive is the first
// row (drive.ts); its file and its routes are the ones #152 made, so a Drive connected before reads as it was.
//
// A grant whose refresh the provider refuses (revoked, ran out) is forgotten, and, behind SOL_GRANT_RANOUT (#1440, a
// step of #1222), remembered as ran out: beside the grant file, which provider, which account, when. Never a token. A
// face can then say "connect again" rather than "not connected"; connecting again, or letting go, clears it.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { openBrowser, failPage } from "./cloud.js";
import { isQuiet } from "../quiet.js";

export const CONNECT_FOR = 10 * 60_000;
const WAIT = 10_000;
/** a cloud's address: https, or this machine's own (a cloud run here, the tests) */
const CLOUD = /^(https:\/\/|http:\/\/127\.0\.0\.1(:\d+)?\/)/;

export type Provider = {
  id: string;                                    // the key: its folder under <state>/, its routes on the cloud
  name: string;                                  // "Google Drive", what the person reads
  short: string;                                 // "Drive", in "Drive is connected through…"
  by: string;                                    // "Google", whose page and whose answer
  authUrl: string;                               // the provider's consent page
  consent: Record<string, string>;               // what that page is asked besides the code flow (offline access…)
  scopes: readonly string[];                     // what this row may ask for; a cloud asking more is refused
  path: string;                                  // its routes under a cloud's address: GET path, POST path/token, path/refresh
  revoke: { url: string } | { cloud: true };     // revoked at the provider with the refresh token, or through the cloud (path/revoke)
  page: (email: string) => string;               // the tab's page once connected
};
export type Grant = { hub: string; refresh: string; scope: string; email: string; at: number };
export type GrantDeps = {
  file: string;                                  // the grant file
  ticket: (hub: string) => Promise<string>;      // my Sol ticket for that cloud (relay.ts hubTicket); "" when none
  fetch?: typeof fetch;
  open?: (url: string) => void;                  // the system browser (the tests catch the url)
  now?: () => number;
};

/** where this engine keeps a provider's grant (beside its other state) */
export const grantFile = (stateDir: string, p: Provider) => join(stateDir, p.id, "account.json");

// ---- the grant file ----

const cache = new Map<string, Grant | null>();
// each provider's access token, held for the refresh token it came from: a disconnect, or another connect meanwhile,
// never gets it
const held = new Map<string, { access: string; until: number; of: string }>();
const refreshing = new Map<string, Promise<string>>();
const connecting = new Map<string, Promise<Connected>>();

/** a provider's grant on this Sol, read from its file, or null */
export function readGrant(file: string): Grant | null {
  if (cache.has(file)) return cache.get(file)!;
  let a: Grant | null = null;
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as Partial<Grant> | null;
    if (v && typeof v.hub === "string" && CLOUD.test(v.hub) && typeof v.refresh === "string" && v.refresh && v.refresh.length <= 1024 && typeof v.scope === "string")
      a = { hub: v.hub, refresh: v.refresh, scope: v.scope, email: typeof v.email === "string" ? v.email : "", at: typeof v.at === "number" ? v.at : 0 };
  } catch { a = null; }
  cache.set(file, a);
  return a;
}

function keep(p: Provider, file: string, a: Grant | null) {
  try { rmSync(ranOutFile(file), { force: true }); } catch { /* none */ }   // connected anew or let go: no longer ran out
  if (!a) { try { rmSync(file, { force: true }); } catch { /* gone */ } cache.set(file, null); held.delete(p.id); return; }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* written 0600 */ }
  cache.set(file, a);
}

// ---- a grant that ran out (#1440) ----

/** the switch, a name of ours: on unless it says off (#691). Off, a refused refresh only forgets the grant, as before */
export const RANOUT_ENV = "SOL_GRANT_RANOUT";
export function ranOutOn(): boolean {
  const env = (process.env[RANOUT_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}
export type RanOut = { provider: string; email: string; at: number };
/** where a grant's ran-out record is kept: beside its file (`<state>/<provider>/account.ranout.json`) */
export const ranOutFile = (file: string) => file.replace(/(\.json)?$/, ".ranout.json");

/** whether a provider's grant ran out here (its refresh refused), and when; null when it did not, or with the switch off */
export function readRanOut(file: string): RanOut | null {
  if (!ranOutOn()) return null;
  try {
    const v = JSON.parse(readFileSync(ranOutFile(file), "utf8")) as Partial<RanOut> | null;
    if (v && typeof v.provider === "string" && typeof v.at === "number") return { provider: v.provider, email: typeof v.email === "string" ? v.email : "", at: v.at };
  } catch { /* none */ }
  return null;
}

function ranOut(file: string, r: RanOut) {
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const out = ranOutFile(file), tmp = `${out}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(r, null, 2), { mode: 0o600 });
    renameSync(tmp, out);
  } catch { /* the grant is forgotten either way; only the word for it is lost */ }
}

/** for the tests: every file read again, nothing held */
export const resetGrants = () => { cache.clear(); held.clear(); refreshing.clear(); connecting.clear(); };
/** the provider refused the access token (401): the next ask refreshes */
export const stale = (p: Provider) => { held.delete(p.id); };

const post = async (p: Provider, d: GrantDeps, hub: string, path: string, body: object) => {
  const t = await d.ticket(hub).catch(() => "");
  if (!t) return { status: 403, v: { error: `sign in to Sol first: ${p.short} is connected through your Sol account` } as Record<string, unknown> };
  if (isQuiet()) return { status: 403, v: { error: "this Sol is quiet (SOL_QUIET): it connects nothing" } as Record<string, unknown> };
  const r = await (d.fetch ?? fetch)(`${hub}${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(WAIT) }).catch(() => null);
  if (!r) return { status: 503, v: { error: "the cloud did not answer" } as Record<string, unknown> };
  return { status: r.status, v: await r.json().catch(() => ({})) as Record<string, unknown> };
};

/** my access token for a provider: the one held while it lasts another minute, else a refresh through the cloud. ""
 *  when it is not connected or the refresh failed. A refresh the provider refuses (revoked, ran out) forgets the grant
 *  here and, with the switch on, remembers it ran out (readRanOut): connecting again is the way back */
export function token(p: Provider, d: GrantDeps): Promise<string> {
  const now = (d.now ?? Date.now)();
  const a = readGrant(d.file);
  if (!a) return Promise.resolve("");
  const h = held.get(p.id);
  if (h?.access && h.of === a.refresh && h.until - 60_000 > now) return Promise.resolve(h.access);
  const out = refreshing.get(p.id);
  if (out) return out;
  const r = (async () => {
    const r = await post(p, d, a.hub, `${p.path}/refresh`, { refresh: a.refresh });
    if (r.status === 401) {
      if (readGrant(d.file)?.refresh === a.refresh) {
        keep(p, d.file, null);
        if (ranOutOn()) ranOut(d.file, { provider: p.id, email: a.email, at: (d.now ?? Date.now)() });
      }
      console.log(`${p.id}: ${p.by} would not refresh my ${p.short} access; connect ${p.name} again`);
      return "";
    }
    if (r.status !== 200 || typeof r.v.access !== "string" || !r.v.access) return "";
    // let go of, or connected anew, while the refresh was out: this answer is for a grant that is no longer mine here
    if (readGrant(d.file)?.refresh !== a.refresh) return "";
    held.set(p.id, { access: r.v.access, until: typeof r.v.until === "number" ? r.v.until : now + 30 * 60_000, of: a.refresh });
    return r.v.access;
  })().finally(() => { refreshing.delete(p.id); });
  refreshing.set(p.id, r);
  return r;
}

/** this Sol lets go of a provider: the grant revoked (a refresh token revokes the whole grant), then forgotten here.
 *  The provider or the cloud not answering still forgets it here: the person asked, and the grant can be removed at
 *  the provider's own account page too. One that ran out has nothing left to revoke: letting go forgets that it ran out */
export async function disconnect(p: Provider, d: GrantDeps): Promise<boolean> {
  const a = readGrant(d.file);
  if (!a && !isQuiet()) try { rmSync(ranOutFile(d.file), { force: true }); } catch { /* none */ }
  if (!a || isQuiet()) return false;   // a quiet Sol never revokes the person's own connection (#1293)
  if ("url" in p.revoke) await (d.fetch ?? fetch)(p.revoke.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: a.refresh }), signal: AbortSignal.timeout(WAIT) }).catch(() => null);
  else await post(p, d, a.hub, `${p.path}/revoke`, { refresh: a.refresh });
  keep(p, d.file, null);
  return true;
}

// ---- connecting ----

const b64 = (b: Buffer) => b.toString("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** the provider's consent page (pure): the code flow with PKCE, and what its row asks besides */
export function consentUrl(p: Provider, client: string, scopes: string, redirect: string, state: string, challenge: string): string {
  const q = new URLSearchParams({ client_id: client, redirect_uri: redirect, response_type: "code", scope: scopes, state, code_challenge: challenge,
    code_challenge_method: "S256" });
  // what the row asks besides, never in place of the flow's own fields
  for (const [k, v] of Object.entries(p.consent)) if (!q.has(k)) q.set(k, v);
  return `${p.authUrl}?${q}`;
}

export type Connected = { ok: true; email: string; scope: string } | { ok: false; error: string };

/** connect a provider through a cloud (its http address) I have a Sol account on: done when the person finished in the
 *  tab, or after ten minutes. One at a time per provider */
export function connect(p: Provider, hub: string, d: GrantDeps): Promise<Connected> {
  if (!CLOUD.test(hub)) return Promise.resolve({ ok: false, error: `${p.short} is connected through a cloud over https only` });
  const out = connecting.get(p.id);
  if (out) return out;
  const r = run(p, hub, d).finally(() => { connecting.delete(p.id); });
  connecting.set(p.id, r);
  return r;
}

async function run(p: Provider, hub: string, d: GrantDeps): Promise<Connected> {
  const f = d.fetch ?? fetch;
  const res = await f(`${hub}${p.path}`, { signal: AbortSignal.timeout(WAIT) }).catch(() => null);
  const cfg = await res?.json().catch(() => null) as { client?: unknown; scopes?: unknown; error?: unknown } | null;
  if (!res?.ok || typeof cfg?.client !== "string" || typeof cfg.scopes !== "string") return { ok: false, error: typeof cfg?.error === "string" ? cfg.error : `that cloud has no ${p.name}` };
  if (!(await d.ticket(hub).catch(() => ""))) return { ok: false, error: "sign in to Sol first: Settings › me › Sol" };
  // the cloud names the scopes; the row says which it may: a cloud never widens what this Sol asks the person for
  if (cfg.scopes.split(/\s+/).some((s) => s && !p.scopes.includes(s))) return { ok: false, error: `that cloud asks more of ${p.name} than Sol does` };
  const verifier = b64(randomBytes(32)), challenge = b64(createHash("sha256").update(verifier).digest());
  const state = b64(randomBytes(24));
  let redirect = "", came = false;

  return new Promise<Connected>((resolve) => {
    let finished = false;
    const finish = (v: Connected) => { if (finished) return; finished = true; clearTimeout(timer); setTimeout(() => { server.close(); server.closeAllConnections(); }, 500).unref(); resolve(v); };
    const send = (res: ServerResponse, status: number, html: string) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      res.end(html);
    };
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      try {
        if (u.pathname !== "/done" || req.method !== "GET") { res.writeHead(404); res.end(); return; }
        const s = u.searchParams.get("state") ?? "", code = u.searchParams.get("code") ?? "";
        if (!s || !same(s, state)) { send(res, 400, failPage("This page was not the one Sol opened.")); return; }   // not ours: keep waiting
        if (came) { send(res, 409, failPage("This already came back; look at the first tab.")); return; }
        came = true;
        if (u.searchParams.get("error") || !code) { send(res, 200, failPage(`${p.name} was not connected.`)); finish({ ok: false, error: `${p.name} was not connected` }); return; }
        const r = await post(p, d, hub, `${p.path}/token`, { code, verifier, redirect });
        const v = r.v;
        if (r.status !== 200 || typeof v.refresh !== "string" || !v.refresh || typeof v.access !== "string") {
          const why = typeof v.error === "string" ? v.error.slice(0, 200) : "the cloud did not answer";
          send(res, 200, failPage(`The cloud said: ${why}.`)); finish({ ok: false, error: why }); return;
        }
        const scope = typeof v.scope === "string" ? v.scope : "", email = typeof v.email === "string" ? v.email : "";
        const at = (d.now ?? Date.now)();
        keep(p, d.file, { hub, refresh: v.refresh, scope, email, at });
        held.set(p.id, { access: v.access, until: typeof v.until === "number" ? v.until : at + 30 * 60_000, of: v.refresh });
        send(res, 200, p.page(email));
        finish({ ok: true, email, scope });
      } catch {
        if (!res.headersSent) send(res, 500, failPage("Something went wrong in Sol."));
        finish({ ok: false, error: "the connect page failed" });
      }
    });
    const timer = setTimeout(() => finish({ ok: false, error: `${p.name} was not connected in ten minutes` }), CONNECT_FOR);
    timer.unref?.();
    server.on("error", () => finish({ ok: false, error: `Sol could not listen for ${p.by}'s answer` }));
    server.listen(0, "127.0.0.1", () => {
      redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/done`;
      (d.open ?? openBrowser)(consentUrl(p, cfg.client as string, cfg.scopes as string, redirect, state, challenge));
    });
  });
}
