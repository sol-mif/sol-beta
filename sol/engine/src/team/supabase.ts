// Sign-in and the Sol ID on Supabase, this engine's side (#1351; AgDR-0054, the plan on #229; cloud/src/supabase.ts is
// the other). Behind the identity seam (seams/identity.ts) beside the cloud's own Google sign-in (team/cloud.ts), which
// keeps running; SOL_IDENTITY=supabase puts this one in front. The same shape as that one (RFC 8252): the system
// browser, a one-off listener on 127.0.0.1 that Supabase sends the browser back to, PKCE, a `state` checked in constant
// time. What changes is who signs in: Supabase Auth, with Google; its user id is the Sol ID, one for every cloud.
// - signed in before (a name, from Supabase or carried over from the cloud's accounts by the same Google account):
//   done; the done page offers to link GitHub, so a cloud knows the person's GitHub login without ever holding a token;
// - new: the same tab asks for a Sol name and a birth month (Supabase checks both: claim_sol_name), then the same.
// A cloud is shown Supabase's access token at `<hub>/ticket` and gives back its own hour ticket, held in memory.
// Kept in `<state>/cloud/supabase.json` (0600, its folder 0700): the name, the Sol ID, the GitHub login, Supabase's
// refresh token (it turns over at each use, so each is written) and the clouds signed in to. Never the access token,
// never a ticket, and never the provider token Supabase may hand back with a sign-in: it is dropped where it arrives.
// The project's address and its publishable key are public by design (Supabase: safe in any app); the secret key is not
// in Sol at all, and the tables behind the two functions deny everyone (supabase/migrations).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { isQuiet } from "../quiet.js";
import { failPage, namePage, openBrowser, page, SIGN_IN_FOR, type SignedIn } from "./cloud.js";
import { CLOUD_HUB } from "./settings.js";

/** Sol's Supabase project: its address and publishable key, both public (the environment names another) */
export const PROJECT = {
  url: (process.env.SOL_SUPABASE_URL ?? "https://fqoedryzkczvywfrfomo.supabase.co").replace(/\/+$/, ""),
  key: process.env.SOL_SUPABASE_KEY ?? "sb_publishable_cNjSRgJQQz2vlWR0TD3ebg_gLgt4nEa",
};

const WAIT = 10_000;
const LOGIN = /^[a-z][a-z0-9-]{2,23}$/;
const GITHUB = /^[A-Za-z0-9-]{1,39}$/;
const CLOUD = /^(https:\/\/|http:\/\/127\.0\.0\.1(:\d+)?\/)/;

/** the clouds my Supabase token is ever shown to: Sol's own, this machine's, and those SOL_SUPABASE_CLOUDS names (host
 *  names, comma between). A token shown to a cloud could be used by it as me, so no other cloud is ever sent it (pure) */
export function trustedCloud(hub: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!CLOUD.test(hub)) return false;
  let host = "";
  try { const u = new URL(hub); if (u.protocol === "http:") return u.hostname === "127.0.0.1"; host = u.host.toLowerCase(); } catch { return false; }
  const own = new URL(CLOUD_HUB.replace(/^wss:/, "https:")).host;
  return host === own || (env.SOL_SUPABASE_CLOUDS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean).includes(host);
}

export type Project = { url: string; key: string };
export type SupabaseAccount = { id: string; login: string; github: string; refresh: string; at: number; hubs: string[] };
export type SupabaseDeps = {
  file: string;                  // where the account is kept
  project?: Project;
  fetch?: typeof fetch;
  open?: (url: string) => void;  // the system browser (the tests catch the url)
  now?: () => number;
};

// ---- the account file ----

let cache: { file: string; a: SupabaseAccount | null } | null = null;

function read(file: string): SupabaseAccount | null {
  if (cache?.file === file) return cache.a;
  let a: SupabaseAccount | null = null;
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as Partial<SupabaseAccount> | null;
    if (typeof v?.login === "string" && LOGIN.test(v.login) && typeof v.refresh === "string" && v.refresh && v.refresh.length < 512 && typeof v.id === "string")
      a = { id: v.id, login: v.login, github: typeof v.github === "string" && GITHUB.test(v.github) ? v.github : "", refresh: v.refresh,
        at: typeof v.at === "number" ? v.at : 0, hubs: Array.isArray(v.hubs) ? v.hubs.filter((h): h is string => typeof h === "string" && CLOUD.test(h)) : [] };
  } catch { a = null; }
  cache = { file, a };
  return a;
}

function write(file: string, a: SupabaseAccount | null) {
  if (!a) { try { rmSync(file, { force: true }); } catch { /* gone */ } cache = { file, a: null }; return; }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* written 0600 */ }
  cache = { file, a };
}

/** where this engine keeps its Supabase account (beside the cloud accounts) */
export const supabaseFile = (stateDir: string) => join(stateDir, "cloud", "supabase.json");

/** my account, or null */
export const supabaseAccount = (file: string) => read(file);

/** every cloud I signed in to with it, with my name (names and hubs only) */
export const supabaseAccounts = (file: string): { hub: string; login: string }[] => { const a = read(file); return a ? a.hubs.map((hub) => ({ hub, login: a.login })) : []; };

/** for the tests: the file read again, nothing held, no sign-in tab still served */
export const resetSupabase = () => { cache = null; access = null; held.clear(); refreshing = null; for (const c of listening) c(); };
const listening = new Set<() => void>();

// ---- Supabase's session: the access token in memory, the refresh token on disk ----

type Session = { access: string; until: number };
let access: (Session & { file: string }) | null = null;
let refreshing: Promise<string> | null = null;

const project = (d: SupabaseDeps) => d.project ?? PROJECT;
const call = (d: SupabaseDeps, path: string, body: object, bearer = "") => isQuiet() ? Promise.resolve(null)
  : (d.fetch ?? fetch)(`${project(d).url}${path}`, { method: "POST", headers: { "content-type": "application/json", apikey: project(d).key, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(WAIT) }).catch(() => null);

type Tokens = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user?: { id?: unknown; email?: unknown; app_metadata?: Record<string, unknown> } };

/** a token answer kept: the access token in memory, the refresh token (and what the claims say) on disk. Anything
 *  else in it, the provider's own token first, is let go here */
function took(d: SupabaseDeps, v: Tokens | null, hubs?: string[]): SupabaseAccount | { error: string } {
  if (typeof v?.access_token !== "string" || typeof v.refresh_token !== "string" || typeof v.user?.id !== "string") return { error: "Supabase's answer was not a sign-in" };
  const meta = v.user.app_metadata ?? {}, now = (d.now ?? Date.now)();
  const login = typeof meta.sol_login === "string" && LOGIN.test(meta.sol_login) ? meta.sol_login : "";
  access = { file: d.file, access: v.access_token, until: now + (typeof v.expires_in === "number" ? v.expires_in * 1000 : 30 * 60_000) };
  const had = read(d.file);
  const a: SupabaseAccount = { id: v.user.id, login, github: typeof meta.github === "string" && GITHUB.test(meta.github) ? meta.github : "", refresh: v.refresh_token, at: now, hubs: hubs ?? (had?.id === v.user.id ? had.hubs : []) };
  if (login) write(d.file, a);
  return a;
}

/** my access token, renewed a minute before it runs out; "" when I am not signed in, or Supabase did not answer. A
 *  refresh Supabase refuses (signed out elsewhere, the account gone) forgets the account: signing in again is the way */
export function accessToken(d: SupabaseDeps): Promise<string> {
  const now = (d.now ?? Date.now)();
  if (access?.file === d.file && access.until - 60_000 > now) return Promise.resolve(access.access);
  const a = read(d.file);
  if (!a) return Promise.resolve("");
  return refreshing ??= (async () => {
    const r = await call(d, "/auth/v1/token?grant_type=refresh_token", { refresh_token: a.refresh });
    if (!r) return "";
    if (r.status === 400) { if (read(d.file)?.refresh === a.refresh) write(d.file, null); held.clear(); console.log("supabase: my sign-in is over; sign in again"); return ""; }
    const t = took(d, await r.json().catch(() => null) as Tokens | null);
    return "error" in t || !t.login ? "" : access!.access;
  })().finally(() => { refreshing = null; });
}

// ---- a cloud's ticket for it ----

const held = new Map<string, { ticket: string; until: number }>();

/** a cloud refused my ticket: the next ask gets another */
export const dropSupabaseTicket = (hub: string) => { held.delete(hub); };

async function exchange(hub: string, d: SupabaseDeps, token: string): Promise<{ ticket: string; until: number; github: string } | { error: string; status: number }> {
  if (!trustedCloud(hub)) return { error: "Sol signs in to its own cloud only (SOL_SUPABASE_CLOUDS names others)", status: 0 };
  const r = isQuiet() ? null : await (d.fetch ?? fetch)(`${hub}/ticket`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supabase: token }), signal: AbortSignal.timeout(WAIT) }).catch(() => null);
  const v = await r?.json().catch(() => null) as { ticket?: unknown; until?: unknown; github?: unknown; error?: unknown } | null;
  if (!r || !r.ok || typeof v?.ticket !== "string" || !v.ticket.startsWith("sol1.")) return { error: typeof v?.error === "string" ? v.error : "the cloud did not answer", status: r?.status ?? 0 };
  return { ticket: v.ticket, until: typeof v.until === "number" ? v.until : (d.now ?? Date.now)() + 30 * 60_000, github: typeof v.github === "string" ? v.github : "" };
}

/** my ticket for a cloud I signed in to: the one held while it lasts another minute, else Supabase's token shown to it
 *  again. "" when there is none */
export async function supabaseTicket(hub: string, d: SupabaseDeps): Promise<string> {
  const now = (d.now ?? Date.now)(), h = held.get(hub);
  if (h && h.until - 60_000 > now) return h.ticket;
  if (!read(d.file)?.hubs.includes(hub)) return "";
  const token = await accessToken(d);
  if (!token) return "";
  const t = await exchange(hub, d, token);
  if ("error" in t) return "";
  held.set(hub, t);
  return t.ticket;
}

/** this machine leaves a cloud; leaving the last one also signs out of Supabase here (its refresh token is ended there
 *  and the file goes) */
export async function supabaseSignOut(hub: string, d: SupabaseDeps): Promise<boolean> {
  const a = read(d.file);
  if (!a?.hubs.includes(hub)) return false;
  held.delete(hub);
  const hubs = a.hubs.filter((h) => h !== hub);
  if (hubs.length) { write(d.file, { ...a, hubs }); return true; }
  const token = await accessToken(d);
  if (token) { const r = await call(d, "/auth/v1/logout?scope=local", {}, token); if (!r || (!r.ok && r.status !== 401 && r.status !== 403)) return false; }
  write(d.file, null);
  access = null;
  return true;
}

// ---- signing in ----

const b64 = (b: Buffer) => b.toString("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pkce = () => { const verifier = b64(randomBytes(32)); return { verifier, challenge: b64(createHash("sha256").update(verifier).digest()) }; };

/** Supabase's page that signs in with a provider and comes back to `redirect` with a code (pure) */
export function authorizeUrl(url: string, provider: string, redirect: string, challenge: string): string {
  const q = new URLSearchParams({ provider, redirect_to: redirect, code_challenge: challenge, code_challenge_method: "s256" });
  return `${url}/auth/v1/authorize?${q}`;
}

/** a name to offer for an email (pure): its part before @, made a name (the cloud's suggestName, accounts.ts) */
export function suggestName(email: string): string {
  let s = (email.split("@")[0] ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+/g, "-").slice(0, 24).replace(/-+$/, "");
  if (s.length < 3) s = s ? `${s}-sol`.slice(0, 24) : "";
  return LOGIN.test(s) ? s : "";
}

export const donePage = (login: string, form: string, github: string) => page("You can go back to Sol", `<p>You are signed in as <b>${esc(login)}</b>. This tab can close.</p>${github
  ? `<p class="small">GitHub: ${esc(github)}.</p>`
  : `<form method="post" action="/link"><input type="hidden" name="form" value="${esc(form)}"><p class="small">Link your GitHub account, so your teammates' Sols know which GitHub login is yours. Sol asks GitHub only who you are, and keeps no GitHub key.</p><button type="submit">Link GitHub</button></form>`}`);
export const linkedPage = (github: string) => page("GitHub is linked", `<p>Your Sol name now goes with GitHub <b>${esc(github)}</b>. This tab can close.</p>`);

const signingIn = new Map<string, Promise<SignedIn>>();

/** sign in to a cloud (its http address) with Supabase: at once when this machine is signed in already, else in the
 *  system browser, done when the person finished in the tab or after ten minutes. One at a time a cloud */
export function supabaseSignIn(hub: string, d: SupabaseDeps): Promise<SignedIn> {
  if (!CLOUD.test(hub)) return Promise.resolve({ ok: false, error: "a cloud is signed in to over https only" });
  if (!trustedCloud(hub)) return Promise.resolve({ ok: false, error: "Sol signs in to its own cloud only (SOL_SUPABASE_CLOUDS names others)" });
  const r = signingIn.get(hub);
  if (r) return r;
  const p = run(hub, d).finally(() => signingIn.delete(hub));
  signingIn.set(hub, p);
  return p;
}

/** the cloud takes my sign-in: its ticket held, the cloud kept among mine */
async function enter(hub: string, d: SupabaseDeps): Promise<SignedIn> {
  const token = await accessToken(d), a = read(d.file);
  if (!token || !a) return { ok: false, error: "Supabase did not answer" };
  const t = await exchange(hub, d, token);
  if ("error" in t) return { ok: false, error: t.status === 404 ? "that cloud does not take this sign-in yet" : t.error };
  held.set(hub, t);
  if (!a.hubs.includes(hub)) write(d.file, { ...a, hubs: [...a.hubs, hub] });
  return { ok: true, login: a.login };
}

async function run(hub: string, d: SupabaseDeps): Promise<SignedIn> {
  if (read(d.file)) { const j = await enter(hub, d); if (j.ok || !/Supabase/.test(j.error)) return j; }
  const { url } = project(d);
  const state = b64(randomBytes(24)), form = b64(randomBytes(32));
  const sign = pkce();
  let link = pkce(), origin = "", came = false, linked = false, email = "", token = "";

  return new Promise<SignedIn>((resolve) => {
    let finished = false;
    const close = () => { listening.delete(close); clearTimeout(timer); setTimeout(() => { server.close(); server.closeAllConnections(); }, 500).unref(); };
    listening.add(close);
    // the sign-in is over for Sol at once; the tab stays served a while longer, for its GitHub link
    const finish = (v: SignedIn, keepOpen = false) => { if (finished) return; finished = true; resolve(v); if (!keepOpen) close(); };
    const send = (res: ServerResponse, status: number, html: string) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
      res.end(html);
    };
    const named = async (res: ServerResponse) => {
      const r = await call(d, "/auth/v1/token?grant_type=refresh_token", { refresh_token: pendingRefresh });   // the ticket again, now with the name in it
      const a = took(d, await r?.json().catch(() => null) as Tokens | null);
      if ("error" in a || !a.login) { send(res, 502, failPage("Supabase did not give the name back.")); finish({ ok: false, error: "no name in the sign-in" }); return; }
      const j = await enter(hub, d);
      if (!j.ok) { send(res, 200, failPage(`The cloud said: ${j.error}.`)); finish(j); return; }
      send(res, 200, donePage(a.login, form, a.github));
      finish(j, !a.github);
    };
    let pendingRefresh = "";
    const ours = (req: IncomingMessage, q: URLSearchParams) => (req.headers.origin === origin || req.headers.origin === "null") && same(q.get("form") ?? "", form);
    const posted = async (req: IncomingMessage) => { let body = ""; for await (const chunk of req) { body += chunk; if (body.length > 4000) break; } return new URLSearchParams(body); };

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      try {
        if (u.pathname === "/done" && req.method === "GET") {
          if (!same(u.searchParams.get("s") ?? "", state)) { send(res, 400, failPage("This page was not the one Sol opened.")); return; }
          if (came) { send(res, 409, failPage("This sign-in already came back; look at the first tab.")); return; }
          came = true;
          const code = u.searchParams.get("code") ?? "";
          if (u.searchParams.get("error") || !code) { send(res, 200, failPage("Google did not sign you in.")); finish({ ok: false, error: "Google did not sign in" }); return; }
          const r = await call(d, "/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: sign.verifier });
          const v = await r?.json().catch(() => null) as Tokens | null;
          if (!r?.ok || typeof v?.access_token !== "string" || typeof v.refresh_token !== "string") { send(res, 200, failPage("Supabase did not sign you in.")); finish({ ok: false, error: "Supabase did not sign in" }); return; }
          token = v.access_token; pendingRefresh = v.refresh_token; email = typeof v.user?.email === "string" ? v.user.email : "";
          const n = await call(d, "/rest/v1/rpc/sol_name", {}, token);
          const got = await n?.json().catch(() => null) as { login?: unknown; error?: unknown } | null;
          if (!n?.ok || !got) { send(res, 200, failPage("Supabase did not answer.")); finish({ ok: false, error: "Supabase did not answer" }); return; }
          if (typeof got.error === "string") { send(res, 200, failPage(got.error[0].toUpperCase() + got.error.slice(1) + ".")); finish({ ok: false, error: got.error }); return; }
          if (typeof got.login === "string") { await named(res); return; }
          send(res, 200, namePage(form, suggestName(email), email));
          return;
        }
        if (u.pathname === "/name" && req.method === "POST") {
          const q = await posted(req);
          if (!token || !ours(req, q)) { send(res, 403, failPage("This form was not the one Sol showed.")); return; }
          const name = (q.get("name") ?? "").trim().toLowerCase();
          const r = await call(d, "/rest/v1/rpc/claim_sol_name", { p_name: name, p_year: Number(q.get("year")) || null, p_month: Number(q.get("month")) || null }, token);
          const v = await r?.json().catch(() => null) as { login?: unknown; error?: unknown; suggest?: unknown; gone?: unknown } | null;
          if (r?.ok && typeof v?.login === "string") { await named(res); return; }
          const why = typeof v?.error === "string" ? v.error : "Supabase did not answer";
          // under 13 (the sign-in is gone), or no answer: the end. A taken or wrong name: the form again, with a free one offered
          if (!r?.ok || v?.gone === true || /13|disabled|sign in/.test(why)) { send(res, 200, failPage(why[0].toUpperCase() + why.slice(1) + ".")); finish({ ok: false, error: why }); return; }
          send(res, 200, namePage(form, typeof v?.suggest === "string" && v.suggest ? v.suggest : name, email, why[0].toUpperCase() + why.slice(1) + "."));
          return;
        }
        if (u.pathname === "/link" && req.method === "POST") {
          const q = await posted(req);
          const t = await accessToken(d);
          if (!t || !ours(req, q) || linked) { send(res, 403, failPage("This form was not the one Sol showed.")); return; }
          link = pkce();
          const qs = new URLSearchParams({ provider: "github", redirect_to: `${origin}/linked?s=${state}`, skip_http_redirect: "true", code_challenge: link.challenge, code_challenge_method: "s256" });
          const r = isQuiet() ? null : await (d.fetch ?? fetch)(`${url}/auth/v1/user/identities/authorize?${qs}`, { headers: { apikey: project(d).key, authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(WAIT) }).catch(() => null);
          const v = await r?.json().catch(() => null) as { url?: unknown } | null;
          if (!r?.ok || typeof v?.url !== "string" || !v.url.startsWith("https://")) { send(res, 200, failPage("Supabase would not start the GitHub link.")); close(); return; }
          res.writeHead(303, { location: v.url, "cache-control": "no-store" }); res.end();
          return;
        }
        if (u.pathname === "/linked" && req.method === "GET") {
          if (!same(u.searchParams.get("s") ?? "", state) || linked) { send(res, 400, failPage("This page was not the one Sol opened.")); return; }
          linked = true;
          const code = u.searchParams.get("code") ?? "";
          const why = u.searchParams.get("error_description") ?? "";
          if (!code) { send(res, 200, failPage(why ? `GitHub was not linked: ${why}` : "GitHub was not linked.")); close(); return; }
          const r = await call(d, "/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: link.verifier });
          const a = took(d, await r?.json().catch(() => null) as Tokens | null);
          if ("error" in a || !a.github) { send(res, 200, failPage("Supabase did not say the GitHub login.")); close(); return; }
          held.clear();   // the clouds' next tickets carry it
          send(res, 200, linkedPage(a.github));
          close();
          return;
        }
        res.writeHead(404); res.end();
      } catch {
        if (!res.headersSent) send(res, 500, failPage("Something went wrong in Sol."));
        finish({ ok: false, error: "the sign-in page failed" });
      }
    });
    const timer = setTimeout(() => { finish({ ok: false, error: "the sign-in was not finished in ten minutes" }); close(); }, SIGN_IN_FOR);
    timer.unref?.();
    server.on("error", () => finish({ ok: false, error: "Sol could not listen for the sign-in" }));
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      (d.open ?? openBrowser)(authorizeUrl(url, "google", `${origin}/done?s=${state}`, sign.challenge));
    });
  });
}
