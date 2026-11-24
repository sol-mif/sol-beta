// Real friends in BR1's Social (#1615): a friend link is a room of two on Sol's cloud, the same rooms by code Cowork's
// groups meet in (sol/cloud, the hub's /rooms routes), kept apart from them. A friend is never in team.json, never the
// room in use and never one of Cowork's groups: the rooms are listed in their own file (STATE_DIR/social/friends.json).
// "Make a link" registers one (named "Friend · <me> · <four>", so the join page says whose it is); the other Sol pastes
// the link or its code in Social, which peeks the name and asks for the room (asking makes a member, as for a group);
// then each Sol reads who else is in each of its friend rooms. Unfriend leaves the room. Both need a Sol account on the
// cloud. Nothing between the two AIs travels here yet: what a friend's AI may answer stays on each Mac (#1072's model).
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { STATE_DIR } from "../work/state.js";
import { sharedHub } from "../team/settings.js";
import { hubHttp, hubTicket } from "../team/relay.js";
import { identity } from "../seams/identity.js";
import { normalCode } from "../hub/index.js";
import { quietFetch } from "../quiet.js";

/** a friend room as this Sol keeps it: its code, the hub's http address, its name, whether my link made it */
export type Friend = { code: string; hub: string; name: string; mine: boolean; at: number };
/** a friend room as the face reads it: the other in it (none yet: my link still waits), and its link; gone when the
 *  cloud no longer has me in it, unknown when the cloud did not answer (people then says nothing) */
export type FriendNow = Friend & { people: string[]; link: string; gone?: true; unknown?: true };
export type FriendsDeps = {
  file: string;
  hub: () => string;                          // the http address friends meet on ("" none)
  login: (hub: string) => string | null;      // my Sol name there, null when not signed in
  ticket: (hub: string) => Promise<string>;   // my ticket there ("" none)
  fetch: typeof fetch;
  now: () => number;
  random: () => string;                       // four letters and digits for a link's name
};

export const FILE = join(STATE_DIR, "social", "friends.json");
export const FRIEND_NAME = /^Friend · /;
export const SIGN_IN = "a friend link lives on Sol's cloud: sign in to Sol first (Settings › me › Sol)";
const WAIT = 8000;
const QUIET = "this Sol is quiet (SOL_QUIET): nothing leaves this Mac";

export const friendsDeps = (file = FILE): FriendsDeps => ({
  file,
  hub: () => { const h = sharedHub(); return h ? hubHttp(h) : ""; },
  login: (hub) => identity().on(hub)?.login ?? null,
  ticket: (hub) => hubTicket(hub),
  fetch: globalThis.fetch,
  now: Date.now,
  random: () => randomBytes(3).toString("hex").slice(0, 4),
});

/** the link a friend opens: the hub's join page (hub/join.ts), which also prints the code and offers Sol */
export const linkOf = (f: Pick<Friend, "hub" | "code">) => `${f.hub.replace(/\/+$/, "")}/j/${f.code}`;

/** the code in what was pasted: a join link (…/j/<code>, sol://join?code=<code>) or the six letters and digits alone */
export function codeIn(text: unknown): string {
  // a pasted link often carries what was around it: a period, a comma, a bracket or quotes, a space or a new line
  const t = typeof text === "string" ? text.trim().replace(/^[\s("'“‘[<]+|[\s.,;:!?)\]}"'’”>]+$/g, "") : "";
  const m = /\/j\/([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(t) ?? /[?&]code=([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(t) ?? /^([A-Za-z0-9]{6})$/.exec(t);
  return m ? normalCode(m[1]) : "";
}

export function readFriends(file: string): Friend[] {
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as { friends?: unknown };
    return Array.isArray(v.friends) ? v.friends.filter((f): f is Friend => !!f && typeof f.code === "string" && typeof f.hub === "string")
      .map((f) => ({ code: f.code, hub: f.hub, name: String(f.name ?? ""), mine: f.mine === true, at: Number(f.at) || 0 })) : [];
  } catch { return []; }
}

function keep(file: string, friends: Friend[]) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ v: 1, friends }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
  if (existsSync(file)) chmodSync(file, 0o600);
}

/** one call to the hub with my ticket: its status and JSON, or null when it did not answer */
export async function api(d: FriendsDeps, hub: string, method: string, path: string, body?: unknown): Promise<{ status: number; v: any } | null> {
  const t = await d.ticket(hub).catch(() => "");
  const headers: Record<string, string> = { ...(t ? { authorization: `Bearer ${t}` } : {}), ...(body ? { "content-type": "application/json" } : {}) };
  const url = `${hub.replace(/\/+$/, "")}${path}`;
  try { quietFetch(url); } catch { return { status: 0, v: { error: QUIET } }; }   // a quiet Sol (src/quiet.ts) asks no cloud and says so
  try {
    const r = await d.fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(WAIT) });
    return { status: r.status, v: await r.json().catch(() => null) };
  } catch { return null; }
}

export const said = (r: { status: number; v: any } | null) => !r ? "the cloud did not answer" : r.status === 0 ? String(r.v?.error ?? QUIET) : typeof r.v?.error === "string" ? `the cloud said: ${r.v.error.slice(0, 160)}` : `the cloud said ${r.status}`;

/** a friend room's two: its maker and the first who opened the link, by when they came in; anyone later is never a
 *  friend through it (a link opened twice must not make two strangers friends of each other) */
function twoOf(v: any): string[] {
  const ms: { login: string; at: number }[] = (Array.isArray(v?.members) ? v.members : [])
    .map((m: any) => (typeof m === "string" ? { login: m, at: 0 } : { login: String(m?.login ?? ""), at: Number(m?.at) || 0 })).filter((m: { login: string }) => m.login);
  const maker = typeof v?.maker === "string" && v.maker ? v.maker : ms.slice().sort((a, z) => a.at - z.at)[0]?.login ?? "";
  const first = ms.filter((m) => m.login.toLowerCase() !== maker.toLowerCase()).sort((a, z) => a.at - z.at)[0]?.login;
  return [maker, ...(first ? [first] : [])].filter(Boolean);
}

/** the other one in a friend room ([] while my link waits), or null when the cloud says it is not there (they left it, or I did) */
async function othersIn(d: FriendsDeps, f: Friend, me: string): Promise<string[] | null | undefined> {
  const r = await api(d, f.hub, "GET", `/rooms/${f.code}/members`);
  if (r?.status === 404) return null;
  if (!r || r.status !== 200 || !Array.isArray(r.v?.members)) return undefined;   // unknown: no answer
  const two = twoOf(r.v);
  if (!two.some((l) => l.toLowerCase() === me.toLowerCase())) return [];   // I came in third: nobody here is my friend
  return two.filter((l) => l.toLowerCase() !== me.toLowerCase());
}

/** "Make a link": my link that still waits for someone, else a new room of two. The cloud keeps at most five rooms a
 *  person made (sol/cloud rooms.ts), groups and friend links together; past that it says so */
export async function makeLink(d: FriendsDeps): Promise<{ ok: true; link: string; code: string; again?: true } | { ok: false; why: string }> {
  const hub = d.hub(), me = hub ? d.login(hub) : null;
  if (!hub || !me) return { ok: false, why: SIGN_IN };
  const all = readFriends(d.file);
  for (const f of all.filter((x) => x.mine && x.hub === hub)) {
    const o = await othersIn(d, f, me);
    if (o && !o.length) return { ok: true, link: linkOf(f), code: f.code, again: true };
  }
  const name = `Friend · ${me} · ${d.random()}`.slice(0, 60);
  const r = await api(d, hub, "POST", "/rooms", { name, provider: "cloud", org: "", repos: [] });
  const code = normalCode(r?.v?.code);
  if (!r || r.status !== 200 || !code) return { ok: false, why: said(r) };
  keep(d.file, [...readFriends(d.file), { code, hub, name, mine: true, at: d.now() }]);
  return { ok: true, link: linkOf({ hub, code }), code };
}

const OWN = "that is your own link: send it to a friend";

/** whose a friend link is, from its room's name "Friend · <login> · <four>" (pure); "" for any other name */
export const whoseLink = (name: string) => FRIEND_NAME.test(name) ? (name.split(" · ")[1] ?? "").trim() : "";

/** a friend link only looked at, never joined (the cloud's peek reads and never writes): whose it is, so Sol can ask
 *  "Add <who> as a friend?" before anything happens; a group's code, my own link or no code says why not */
export async function peekFriend(d: FriendsDeps, text: unknown): Promise<{ ok: true; code: string; who: string; name: string; already?: true } | { ok: false; why: string }> {
  const code = codeIn(text);
  if (!code) return { ok: false, why: "that is not a friend link: paste the link they sent, or its six letters and digits" };
  const hub = d.hub(), me = hub ? d.login(hub) : null;
  if (!hub || !me) return { ok: false, why: SIGN_IN };
  const had = readFriends(d.file).find((f) => f.code === code);
  if (had?.mine) return { ok: false, why: OWN };
  if (had) return { ok: true, code, who: whoseLink(had.name), name: had.name, already: true };
  const peek = await api(d, hub, "GET", `/peek/${code}`);
  const name = typeof peek?.v?.name === "string" ? peek.v.name : typeof peek?.v?.room?.name === "string" ? peek.v.room.name : "";
  if (peek?.status === 404 || (peek?.status === 200 && !name)) return { ok: false, why: "no friend link has that code" };
  if (!name) return { ok: false, why: said(peek) };
  if (!FRIEND_NAME.test(name)) return { ok: false, why: `that link is a group's (${name.slice(0, 40)}): join it in Cowork` };
  if (name.toLowerCase().includes(`· ${me.toLowerCase()} ·`)) return { ok: false, why: OWN };
  return { ok: true, code, who: whoseLink(name), name };
}

/** a friend's link or code pasted in Social, or said yes to: peeked first (a group's code is not a friend's), then
 *  asked for, which makes me a member of the room their link made */
export async function addFriend(d: FriendsDeps, text: unknown): Promise<{ ok: true; friend: Friend; already?: true } | { ok: false; why: string }> {
  const p = await peekFriend(d, text);
  if (!p.ok) return p;
  const hub = d.hub()!, me = d.login(hub)!, code = p.code, name = p.name;
  if (p.already) return { ok: true, friend: readFriends(d.file).find((f) => f.code === code)!, already: true };
  const r = await api(d, hub, "GET", `/rooms/${code}`);
  if (!r || r.status !== 200) return { ok: false, why: r?.status === 404 ? "no friend link has that code" : said(r) };
  // a link is for one friend: someone came in before me, so I leave at once and nobody sees me there
  const m = await api(d, hub, "GET", `/rooms/${code}/members`);
  if (m?.status === 200 && !twoOf(m.v).some((l) => l.toLowerCase() === me.toLowerCase())) {
    await api(d, hub, "DELETE", `/rooms/${code}/members/me`);
    return { ok: false, why: "someone opened that link already: a friend link is for one person, so ask them for a new one" };
  }
  const friend: Friend = { code, hub, name: String(r.v?.room?.name ?? name).slice(0, 60), mine: false, at: d.now() };
  keep(d.file, [...readFriends(d.file), friend]);
  return { ok: true, friend };
}

/** every friend room and who else is in it; a room the cloud no longer has is said gone (and kept until unfriended) */
export async function friendsNow(d: FriendsDeps): Promise<{ ok: true; me: string | null; friends: FriendNow[]; signIn?: string }> {
  const hub = d.hub(), me = hub ? d.login(hub) : null;
  const all = readFriends(d.file);
  if (!me) return { ok: true, me: null, friends: all.map((f) => ({ ...f, people: [], link: linkOf(f) })), signIn: SIGN_IN };
  const out = await Promise.all(all.map(async (f): Promise<FriendNow> => {
    const o = await othersIn(d, f, me);
    return { ...f, people: o ?? [], link: linkOf(f), ...(o === null ? { gone: true as const } : {}), ...(o === undefined ? { unknown: true as const } : {}) };
  }));
  return { ok: true, me, friends: out };
}

/** unfriend: I leave the room (the other keeps it, alone) and it leaves my list */
export async function unfriend(d: FriendsDeps, code: unknown): Promise<{ ok: true } | { ok: false; why: string }> {
  const c = normalCode(code), f = readFriends(d.file).find((x) => x.code === c);
  if (!f) return { ok: false, why: "not a friend here" };
  const r = await api(d, f.hub, "DELETE", `/rooms/${f.code}/members/me`);
  if (r && r.status !== 200 && r.status !== 404) return { ok: false, why: said(r) };
  keep(d.file, readFriends(d.file).filter((x) => x.code !== c));
  return { ok: true };
}
