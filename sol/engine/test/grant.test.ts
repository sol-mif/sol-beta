// The grant module (#1230): one way to connect any provider, Drive its first row. A stand-in second provider connects,
// refreshes and disconnects through the same code as Drive, with its own file and its own token; a Drive connected
// before the module (#152's file) reads and refreshes as it did. Nothing here reaches Google or a real cloud.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, token, stale, disconnect, readGrant, grantFile, resetGrants, readRanOut, ranOutFile, RANOUT_ENV, type Provider, type GrantDeps } from "../src/team/grant.js";
import { DRIVE } from "../src/team/drive.js";

const STANDIN: Provider = {
  id: "standin", name: "Stand-in", short: "Stand-in", by: "Stand-in", authUrl: "https://auth.example.com/authorize", consent: { prompt: "consent" },
  scopes: ["read", "write"], path: "/standin", revoke: { cloud: true }, page: (email) => `<p>Stand-in connected ${email}</p>`,
};
const HUB = "http://127.0.0.1:9/relay";

/** a cloud in memory with both rows: what each route was sent, and answers a test can change */
function fakeCloud(clock: { now: number }) {
  const seen: { url: string; auth: string; body: any }[] = [];
  const refreshes: Record<string, string> = { "/standin": "1//standin", "/drive": "1//drive" };
  let refuse = false;
  const fetch = (async (u: string | URL | Request, init: RequestInit = {}) => {
    const url = String(u);
    if (url.startsWith("http://127.0.0.1:") && url.includes("/done")) return globalThis.fetch(url);
    if (url === `${HUB}/standin`) return new Response(JSON.stringify({ client: "standin-client", scopes: "read" }));
    if (!url.startsWith(HUB)) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init.body ?? "{}"));
    seen.push({ url: url.slice(HUB.length), auth: new Headers(init.headers).get("authorization") ?? "", body });
    const m = /^(\/\w+)\/(token|refresh|revoke)$/.exec(url.slice(HUB.length));
    if (!m) return new Response("{}", { status: 404 });
    if (m[2] === "token") return new Response(JSON.stringify({ access: `${m[1].slice(1)}.first`, until: clock.now + 3_600_000, refresh: refreshes[m[1]], scope: "read", email: "f@example.com" }));
    if (m[2] === "revoke") return new Response(JSON.stringify({ ok: true }));
    if (refuse) return new Response(JSON.stringify({ error: "connect again" }), { status: 401 });
    return body.refresh === refreshes[m[1]] ? new Response(JSON.stringify({ access: `${m[1].slice(1)}.${++n}`, until: clock.now + 3_600_000 })) : new Response("{}", { status: 401 });
  }) as typeof globalThis.fetch;
  let n = 1;
  return { fetch, seen, refuse: () => { refuse = true; } };
}

async function connectIn(p: Provider, d: GrantDeps & { opened: () => string }) {
  const out = connect(p, HUB, d);
  while (!d.opened()) await new Promise((r) => setTimeout(r, 5));
  const consent = new URL(d.opened());
  const page = await globalThis.fetch(`${consent.searchParams.get("redirect_uri")}?state=${consent.searchParams.get("state")}&code=4/abc`);
  return { out: await out, consent, page: await page.text() };
}

const depsFor = (file: string, cloud: ReturnType<typeof fakeCloud>, clock: { now: number }) => {
  let opened = "";
  return { file, ticket: async () => "sol1.ticket", fetch: cloud.fetch, now: () => clock.now, open: (u: string) => { opened = u; }, opened: () => opened };
};

test("a stand-in second provider connects, refreshes and disconnects through the same code as Drive, in a file of its own", async () => {
  resetGrants();
  const dir = mkdtempSync(join(tmpdir(), "sol-grant-"));
  const clock = { now: 1_000_000 };
  const cloud = fakeCloud(clock);
  const file = grantFile(dir, STANDIN);
  assert.equal(file, join(dir, "standin", "account.json"));
  assert.equal(grantFile(dir, DRIVE), join(dir, "drive", "account.json"), "Drive's file is the one #152 made");
  const d = depsFor(file, cloud, clock);
  const { out, consent, page } = await connectIn(STANDIN, d);
  // its own consent page, its own row's extras, the code with PKCE to its own route
  assert.equal(consent.origin + consent.pathname, "https://auth.example.com/authorize");
  assert.equal(consent.searchParams.get("client_id"), "standin-client");
  assert.equal(consent.searchParams.get("prompt"), "consent");
  assert.equal(consent.searchParams.get("access_type"), null, "Drive's extras stay Drive's");
  assert.match(page, /Stand-in connected f@example.com/);
  assert.deepEqual(out, { ok: true, email: "f@example.com", scope: "read" });
  const sent = cloud.seen.find((x) => x.url === "/standin/token")!;
  assert.equal(sent.auth, "Bearer sol1.ticket");
  assert.match(sent.body.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, "standin")).mode & 0o777, 0o700);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8"))).sort(), ["at", "email", "hub", "refresh", "scope"], "never the access token");
  // held, then refreshed through its own route a minute early; a 401 from the provider's API asks again
  assert.equal(await token(STANDIN, d), "standin.first");
  clock.now += 3_600_000 - 30_000;
  assert.equal(await token(STANDIN, d), "standin.2");
  assert.equal(await token(STANDIN, d), "standin.2");
  stale(STANDIN);
  assert.equal(await token(STANDIN, d), "standin.3");
  assert.deepEqual(cloud.seen.filter((x) => x.url.endsWith("/refresh")).map((x) => x.url), ["/standin/refresh", "/standin/refresh"]);
  // let go: revoked through the cloud with my ticket (its row says so), forgotten here
  assert.equal(await disconnect(STANDIN, d), true);
  const rev = cloud.seen.find((x) => x.url === "/standin/revoke")!;
  assert.deepEqual([rev.auth, rev.body], ["Bearer sol1.ticket", { refresh: "1//standin" }]);
  assert.equal(existsSync(file), false);
  assert.equal(await token(STANDIN, d), "");
  assert.equal(await disconnect(STANDIN, d), false);
  resetGrants();
});

test("two providers hold their tokens apart: one let go of, or refused, leaves the other connected", async () => {
  resetGrants();
  const dir = mkdtempSync(join(tmpdir(), "sol-grant-"));
  const clock = { now: 1_000_000 };
  const cloud = fakeCloud(clock);
  const drive = { file: grantFile(dir, DRIVE), ticket: async () => "sol1.ticket", fetch: cloud.fetch, now: () => clock.now };
  mkdirSync(join(dir, "drive"), { recursive: true });
  writeFileSync(drive.file, JSON.stringify({ hub: HUB, refresh: "1//drive", scope: "openid email https://www.googleapis.com/auth/drive", email: "f@example.com", at: 1 }));
  const s = depsFor(grantFile(dir, STANDIN), cloud, clock);
  await connectIn(STANDIN, s);
  assert.equal(await token(DRIVE, drive), "drive.2");
  assert.equal(await token(STANDIN, s), "standin.first");
  await disconnect(STANDIN, s);
  assert.equal(await token(DRIVE, drive), "drive.2", "Drive's held token was not touched");
  assert.equal(cloud.seen.filter((x) => x.url === "/drive/refresh").length, 1);
  // the stand-in again, then its refresh refused: forgotten; Drive stays
  await connectIn(STANDIN, depsFor(s.file, cloud, clock));
  clock.now += 3_600_000;
  cloud.refuse();
  assert.equal(await token(STANDIN, s), "");
  assert.equal(existsSync(s.file), false);
  assert.ok(readGrant(drive.file), "Drive's grant file is still there");
  resetGrants();
});

test("a refresh the provider refuses is remembered as ran out (#1440): who, when, never a token; connecting again or letting go clears it; off, forgotten as before", async () => {
  const was = process.env[RANOUT_ENV];
  try {
    for (const on of [true, false]) {
      resetGrants();
      if (on) delete process.env[RANOUT_ENV]; else process.env[RANOUT_ENV] = "off";
      const dir = mkdtempSync(join(tmpdir(), "sol-grant-"));
      const clock = { now: 1_000_000 };
      const cloud = fakeCloud(clock);
      const d = depsFor(grantFile(dir, STANDIN), cloud, clock);
      await connectIn(STANDIN, d);
      assert.equal(readRanOut(d.file), null, "a grant that works has not run out");
      clock.now += 3_600_000;
      cloud.refuse();
      assert.equal(await token(STANDIN, d), "");
      assert.equal(existsSync(d.file), false, "the grant is forgotten either way");
      if (!on) { assert.equal(existsSync(ranOutFile(d.file)), false, "off: nothing kept, as before"); assert.equal(readRanOut(d.file), null); continue; }
      assert.equal(ranOutFile(d.file), join(dir, "standin", "account.ranout.json"));
      assert.deepEqual(readRanOut(d.file), { provider: "standin", email: "f@example.com", at: clock.now });
      assert.equal(statSync(ranOutFile(d.file)).mode & 0o777, 0o600);
      assert.doesNotMatch(readFileSync(ranOutFile(d.file), "utf8"), /1\/\/standin|standin\.first/, "never a token");
      // the switch turned off afterwards: the record is not read
      process.env[RANOUT_ENV] = "off";
      assert.equal(readRanOut(d.file), null);
      delete process.env[RANOUT_ENV];
      // connecting again clears it
      resetGrants();
      const fresh = fakeCloud(clock);
      const d2 = depsFor(d.file, fresh, clock);
      await connectIn(STANDIN, d2);
      assert.equal(readRanOut(d.file), null);
      assert.equal(existsSync(ranOutFile(d.file)), false);
      // ran out again, then let go of (nothing left to revoke): cleared too, and nothing sent
      clock.now += 3_600_000;
      fresh.refuse();
      assert.equal(await token(STANDIN, d2), "");
      assert.ok(readRanOut(d.file));
      const sent = fresh.seen.length;
      assert.equal(await disconnect(STANDIN, d2), false);
      assert.equal(readRanOut(d.file), null);
      assert.equal(fresh.seen.length, sent, "no revoke for a grant that is already gone");
    }
  } finally {
    if (was === undefined) delete process.env[RANOUT_ENV]; else process.env[RANOUT_ENV] = was;
    resetGrants();
  }
});

test("a Drive connected before the grant module (#152's file) reads and refreshes as it did, through /drive/refresh", async () => {
  resetGrants();
  const dir = mkdtempSync(join(tmpdir(), "sol-grant-"));
  const file = join(dir, "drive", "account.json");
  mkdirSync(join(dir, "drive"), { recursive: true, mode: 0o700 });
  const before = { hub: "https://cloud.example.com/relay", refresh: "1//kept", scope: "openid email https://www.googleapis.com/auth/drive.file", email: "frank@example.com", at: 1_700_000_000_000 };
  writeFileSync(file, JSON.stringify(before, null, 2), { mode: 0o600 });
  assert.deepEqual(readGrant(file), before);
  const asked: string[] = [];
  const d = { file, ticket: async () => "sol1.t", fetch: (async (u: string, init: RequestInit) => {
    asked.push(`${u} ${JSON.parse(String(init.body)).refresh}`);
    return new Response(JSON.stringify({ access: "ya29.again", until: Date.now() + 3_600_000 }));
  }) as typeof fetch };
  assert.equal(await token(DRIVE, d), "ya29.again");
  assert.deepEqual(asked, ["https://cloud.example.com/relay/drive/refresh 1//kept"]);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), before, "the file is read, never rewritten");
  resetGrants();
});

test("a cloud that asks for more than the row may is refused before any page opens", async () => {
  resetGrants();
  const dir = mkdtempSync(join(tmpdir(), "sol-grant-"));
  const d = { file: grantFile(dir, STANDIN), ticket: async () => "sol1.t", open: () => assert.fail("no browser"),
    fetch: (async () => new Response(JSON.stringify({ client: "c", scopes: "read admin" }))) as typeof fetch };
  assert.deepEqual(await connect(STANDIN, "https://cloud.example.com/relay", d), { ok: false, error: "that cloud asks more of Stand-in than Sol does" });
  assert.deepEqual(await connect(STANDIN, "http://example.com/relay", d), { ok: false, error: "Stand-in is connected through a cloud over https only" });
  resetGrants();
});
