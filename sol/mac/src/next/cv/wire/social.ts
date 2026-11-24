// Social's wire (BR1, #1615): slice 9's pages drawn live from Isaac's Social (fr-31, PR #1072), carried as it is in
// sol/mac/src/social/: its model (model.ts) holds the person's Social and its store (store.ts) keeps it on this Mac. The
// drawing (merge/views/social.js) reads a Circle (people/data.ts); circleOf shapes #1072's State into one, and the presses
// go back through #1072's own moves (accept, decline, setCircle, setGrant, pickJelly, addFriend). Friends between two
// Macs ride Cowork's cloud (engine social/friends.ts, next.social.friend.*): "Make a link" makes a room of two there, the
// friend pastes the link (or its code) in Social, and whoever is in my friend rooms becomes a friend in #1072's State,
// with the usual shares. Asks by name, what a friend shares and their AI's asks still stay on this Mac (backend.md's hub
// is not built). Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { act, change, hooks } from "../core.ts";
import type { Engine } from "./types.ts";
import { FACES, type Circle, type Friend, type Inbox } from "../../people/data.ts";
import { live } from "../../people/queue.ts";
import {
  accept, addFriend, badgesOf, clock, decline, freeBusy, levelOf, openRequests, pickJelly, setCircle, setGrant, weekOf, xpOf,
  COMMON, JELLIES, granted, type Friend as SocialFriend, type GrantKey, type Grants, type Request, type State,
} from "../../../social/model.ts";
import { setSocial, socialNow, startSocial } from "../../../social/store.ts";
import { partsOf, tookLine, type Got, type Part, type Took } from "../../social/setup.ts";

/** the drawing's share keys and #1072's grants: "when you're around" is presence, which every friend hears (backend.md §2) */
export const GRANT_OF: Record<string, GrantKey | null> = { fb: "freebusy", pr: "profile", wo: "working", ar: null, cal: "calendar", proj: "projects", loc: "location" };
const PRES = { online: "here", away: "away", offline: "gone" } as const;
const KIND: Record<Request["kind"], string> = { friend: "request", data: "beyond", invite: "invite", help: "help" };
const face = (preset: number) => FACES[preset % FACES.length];
const GRANT_WORD: Record<GrantKey, string> = { freebusy: "free/busy", profile: "profile", working: "working on", calendar: "calendar", projects: "projects", location: "location" };

/** one request as the drawing's inbox row; rid carries #1072's id, so a press answers the request itself */
function inboxOf(s: State, r: Request): Inbox & { rid: string } {
  const f = s.friends.find((x) => x.sol === r.from), x: Inbox & { rid: string } = { rid: r.id, k: KIND[r.kind], from: r.fromName, h: face(r.jelly.preset), close: f?.circle === "close" ? 1 : 0 };
  if (r.kind === "help" && r.help) return { ...x, title: r.help.summary, size: r.help.size };
  if (r.kind === "invite" && r.invite) return { ...x, title: `${r.invite.title} · ${r.invite.place}`, free: `${clock(r.invite.start)}–${clock(r.invite.end)}` };
  if (r.kind === "data") return { ...x, title: r.summary, what: r.ask ? GRANT_WORD[r.ask] : "" };
  return { ...x, title: r.fromName, known: !!f };
}

const SAID: Partial<Record<Request["state"], string>> = { accepted: "you said yes", declined: "you said no", open: "waits on you" };
/** what a friend's AI asked yours: answered on its own (the told lines that name them), and the last ask that became a request */
function askedOf(s: State, sol: string, name: string): NonNullable<Friend["asked"]> {
  const n = (s.told ?? []).filter((t) => t.line.includes(name)).length;
  const r = s.requests.filter((x) => x.from === sol && x.kind === "data").sort((a, z) => z.at - a.at)[0];
  return { n, ...(r ? { last: { q: r.summary, how: `became an ask to you · ${SAID[r.state] ?? r.state}` } } : {}) };
}
/** today's twelve hours from 8 am, 1 where the person's calendar is busy (#1072's freeBusy: blocks, never names) */
function busyOf(s: State, now: number): number[] {
  const d = new Date(now); d.setHours(8, 0, 0, 0);
  const from = d.getTime(), H = 3_600_000, bs = freeBusy(s.calendar, from, from + 12 * H);
  return Array.from({ length: 12 }, (_, i) => (bs.some((b) => b.start < from + (i + 1) * H && b.end > from + i * H) ? 1 : 0));
}

/** a friend room as the engine says it (next.social.friends): who else is in it, my link's address, gone when the cloud dropped it */
export type Room = { code: string; name: string; mine: boolean; people: string[]; link: string; gone?: true; unknown?: true };

/** the code in what was pasted: a friend link (…/j/<code>, sol://join?code=<code>) or the six letters and digits alone
 *  (the engine's social/friends.ts codeIn, the same three forms); "" for a name */
export function codeIn(text: string): string {
  // a pasted link often carries what was around it: a period, a comma, a bracket or quotes, a space or a new line
  const t = text.trim().replace(/^[\s("'“‘[<]+|[\s.,;:!?)\]}"'’”>]+$/g, "");
  const m = /\/j\/([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(t) ?? /[?&]code=([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(t) ?? (/\d/.test(t) ? /^([A-Za-z0-9]{6})$/.exec(t) : null);
  return m ? m[1].toUpperCase() : "";
}
/** what was pasted looks like a link (an address, or the cloud's /relay/), whether or not a code could be read in it */
export const looksLikeLink = (text: string) => /:\/\/|\/relay\/|^www\.|\/j\//i.test(text.trim());
/** said when a pasted link has no code to read: the person sees why, never a name check */
export const LINK_UNREAD = "That link didn’t read: paste the whole link they sent.";

/** who my friend rooms hold now, by login, lower case; null when a room's answer is unknown (then nobody is taken out) */
export const metNow = (rooms: Room[]): string[] | null => (rooms.some((r) => r.unknown) ? null : [...new Set(rooms.filter((r) => !r.gone).flatMap((r) => r.people.map((l) => l.toLowerCase())))]);

/** everyone in my friend rooms as #1072's friends: one met there and not yet a friend here becomes one, with the usual
 *  shares (accept()'s), and leaves the asked-by-name list; one met there before (before) and no longer, who unfriended
 *  me or whose room went, is a friend no more. Friends made on this Mac by #1072's own moves are never touched (pure) */
export function withRooms(s: State, rooms: Room[], before: string[] = []): State {
  const has = (l: string) => s.friends.some((f) => f.sol.toLowerCase() === l.toLowerCase());
  const met = [...new Set(rooms.filter((r) => !r.gone && !r.unknown).flatMap((r) => r.people))].filter((l) => !has(l));
  const now = metNow(rooms), left = now ? before.filter((l) => !now.includes(l.toLowerCase())).map((l) => l.toLowerCase()) : [];
  if (!met.length && !left.some(has)) return s;
  const grants: Grants = Object.fromEntries(COMMON.map((k) => [k, true]));
  const hue = (l: string) => [...l].reduce((a, c) => a + c.charCodeAt(0), 0) % JELLIES.length;
  const add: SocialFriend[] = met.map((l) => ({ sol: l, name: l, jelly: { preset: hue(l) }, presence: "offline", agent: 0, circle: "friend", grants }));
  return { ...s, friends: [...s.friends.filter((f) => !left.includes(f.sol.toLowerCase())), ...add],
    outgoing: s.outgoing.filter((o) => !met.some((l) => l.toLowerCase() === o.toLowerCase())) };
}

/** #1072's State as the Circle slice 9 draws (pure); rooms: my friend rooms, for who is met there and my waiting links */
export function circleOf(s: State, now: number, rooms: Room[] = []): Circle {
  const metHere = new Set(rooms.flatMap((r) => r.people.map((l) => l.toLowerCase())));
  const p = s.me.published, lv = levelOf(xpOf(p)).level, used = s.favours.week === weekOf(now) ? s.favours.n : 0;
  const friends: Friend[] = s.friends.map((f) => ({
    // one met in a friend room: where they are is not carried yet, so it is not said
    n: f.name, h: face(f.jelly.preset), close: f.circle === "close" ? 1 : 0, pres: metHere.has(f.sol.toLowerCase()) ? null : PRES[f.presence], line: f.working ?? "",
    ...(metHere.has(f.sol.toLowerCase()) ? { via: "your link" } : {}),
    // what they share with you comes from their own Sol over the hub; until it does, only presence and their line, as heard
    theirs: { fb: 0, pr: 1, wo: f.working ? 1 : 0, ar: 1 },
    mine: Object.fromEntries(Object.entries(GRANT_OF).filter(([, g]) => g).map(([k, g]) => [k, granted(f, g!, now) ? 1 : 0])),
    asked: askedOf(s, f.sol, f.name),
  }));
  const asked: Friend[] = s.outgoing.map((sol) => ({ n: sol, h: face(0), close: 0, pres: null, line: "", theirs: {}, waiting: "asked by name" }));
  // my link nobody has opened yet: the drawing's "invited, waiting"
  if (rooms.some((x) => x.mine && !x.gone && !x.people.length)) asked.push({ n: "Your friend link", h: face(0), close: 0, pres: null, line: "", theirs: {}, waiting: "for whoever opens it" });
  return {
    label: "live",
    me: { line: s.me.working ?? "", level: p.builds || p.downloads || p.wins || p.helped ? lv : 0, badges: badgesOf(p, s.me.premium).map((b) => b.t), face: s.me.jelly.preset, busy: busyOf(s, now) },
    // the usual shares a new friend gets: #1072's three common grants (accept() gives them unless turned off on the card)
    shares: { fb: 1, pr: 1, wo: 1, ar: 1 },
    friends: [...friends, ...asked],
    inbox: openRequests(s).filter((r) => r.state === "open").map((r) => inboxOf(s, r)),
    fav: { n: s.favour.perWeek, from: s.favour.from === "close" ? "close friends" : "any friend", used },
    first: s.friends.length ? undefined : 1,
  };
}

/** the said word as #1072's move: a yes accepts, the rest decline ("Later" never reaches here: queue.ts keeps it) */
export const isYes = (said: string) => /^(accept|run it|allow once|always for|share|yes)/i.test(said);

const now = () => Date.now();
// the friend rooms the engine last said, my link as it last answered, and the engine to ask (attach)
let rooms: Room[] = [];
let link: { url?: string; why?: string; asking?: true } = {};
let eng: Engine | null = null;
const flash = (t: string) => hooks.flash?.(t);
// share a setup (BR1 meta part 5, engine social/setup.ts): the cards friends gave me, my own card as the engine drafts it,
// the last take (for its Back), and the friend a give is on its way to (for the words when it lands)
let setups: Got[] = [];
let draft: { parts?: Part[]; why?: string; asking?: true } = {};
let took: Took | null = null;
let giving = "";
let taking: string[] = [];
// the last answer to a friend added by link or name, drawn under the box (its words also flash)
let added = "";
const saidAdd = (t: string) => { added = t; change(() => {}); return t; };
// a friend link opened from a browser (the join page's sol://join?code=…, the app's sol-url): peeked, then asked
// "Add <who> as a friend?" on Social; nothing joins before the yes
let peeking = "";
let opened: { code: string; who: string } | null = null;
/** the friend room I share with a person, by their login; "" when we met another way (a name on this Mac) */
const roomWith = (name: string) => rooms.find((r) => !r.gone && r.people.some((l) => l.toLowerCase() === name.toLowerCase()))?.code ?? "";
// who my friend rooms held when last read, kept beside #1072's own "sol.social": one gone from them since is unfriended here
const MET = "sol.social.met";
const metBefore = (): string[] => { try { const v = JSON.parse(localStorage.getItem(MET) ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
/** one change to #1072's State, then the drawing again; its told words, when it has them, are the flash */
function apply(f: (s: State) => { s: State; told?: string; error?: string }): string | null {
  let said: string | null = null;
  setSocial((s) => { const r = f(s); said = r.error ?? r.told ?? null; return r.s; });
  change(() => { live.circle = circleOf(socialNow(), now(), rooms); });
  return said;
}

/** the moves slice 9's pages make live (people/queue.ts live.social, cv/moves/people.ts) */
export const social = {
  /** a card or one row answered: ids are #1072's request ids */
  answer(rids: string[], said: string) { const yes = isYes(said); for (const id of rids) apply((s) => (yes ? accept(s, id, now()) : decline(s, id))); return true; },
  face(n: number) { apply((s) => ({ s: { ...s, onboarded: true, me: { ...s.me, jelly: pickJelly(s.me.jelly, n) } } })); },
  close(name: string) { return apply((s) => { const f = s.friends.find((x) => x.name === name); return { s: f ? setCircle(s, f.sol, f.circle === "close" ? "friend" : "close") : s }; }); },
  grant(name: string, k: string) {
    const g = GRANT_OF[k];
    if (!g) return "Everyone you’re friends with hears when you’re around";
    return apply((s) => { const f = s.friends.find((x) => x.name === name); return f ? setGrant(s, f.sol, g, !f.grants[g]) : { s }; });
  },
  /** a friend's link or code goes to the engine (it answers later, then the flash); a name stays an ask on this Mac */
  add(v: string) {
    if (codeIn(v)) { if (!eng) return saidAdd("Sol is not connected"); eng.send({ type: "next.social.friend.add", text: v.trim() }); return saidAdd("Asked: opening their link…"); }
    // a group's link pasted here asks into that group, as opened from the browser would
    if (live.join?.(v)) return saidAdd("That is a group’s link: asking to join it in Cowork…");
    // a link with no code in it never falls to the name check: the person reads why
    if (looksLikeLink(v)) return saidAdd(LINK_UNREAD);
    return saidAdd(apply((s) => { const r = addFriend(s, v); return r.error ? r : { s: r.s, told: "Asked. A name reaches them once friends travel by name; a link works now (Make a link)." }; }) ?? "Asked");
  },
  /** the last answer to an add, kept as a line under the box until the next (the flash fades; this does not) */
  addLine(): string { return added; },
  /** a link Sol was opened with (sol-url): its code peeked; a friend's link then asks on Social. false when it is no link of ours */
  opened(url: unknown): boolean {
    if (typeof url === "string" && live.join?.(url)) return true;   // a group's link (sol://join?project=…): Cowork asks in (cv/wire/people.ts)
    const code = typeof url === "string" ? codeIn(url) : "";
    if (!code || !eng) return false;
    peeking = `link:${code}`; eng.send({ type: "next.social.friend.peek", rid: peeking, text: code });
    return true;
  },
  /** the friend link waiting on "Add <who> as a friend?" */
  asking(): { code: string; who: string } | null { return opened; },
  /** Yes: the friend added as a pasted link would be; Not now: the ask goes, nothing joined */
  answerLink(yes: boolean): string | null {
    const o = opened;
    opened = null;
    change(() => {});
    return o && yes ? social.add(o.code) : null;
  },
  /** Unfriend on a friend met through a link: I leave our room and they are a friend here no more; null for anyone else
   *  (the drawing's own flash then) */
  unfriend(name: string): string | null {
    const mine = rooms.filter((r) => r.people.some((l) => l.toLowerCase() === name.toLowerCase()));
    if (!mine.length || !eng) return null;
    for (const r of mine) eng.send({ type: "next.social.friend.unfriend", code: r.code });
    rooms = rooms.filter((r) => !mine.includes(r));
    apply((s) => ({ s: { ...s, friends: s.friends.filter((f) => f.sol.toLowerCase() !== name.toLowerCase()) } }));
    return `Unfriended ${name}. What you shared with ${name} stopped.`;
  },
  /** the link page opened: my link that waits, else a new one, asked of the engine once */
  makeLink() { if (eng && !link.url && !link.asking) { link = { asking: true }; eng.send({ type: "next.social.friend.link" }); change(() => {}); } },
  /** my link for Copy (a press, so the clipboard takes it), or null with why not yet */
  link(): string | null { return link.url ?? null; },
  linkWhy(): string { return link.why ?? (link.asking ? "Making your link… press Copy again in a moment" : "Open Make a link first"); },

  /** the give page opened: my card as it would go, asked of the engine at each open (Home changes between opens) */
  askDraft() { if (eng && !draft.asking) { draft = { ...draft, asking: true }; eng.send({ type: "next.social.setup.draft" }); } },
  draft(): { parts?: Part[]; why?: string } { return draft.parts || draft.why ? draft : { why: eng ? "Reading how you work…" : "Sol is not connected" }; },
  /** the picked parts into our friend room: what to say now (the engine's answer is the flash), or why not */
  give(name: string, picks: string[]): { ok: boolean; said: string } {
    const code = roomWith(name);
    if (!code) return { ok: false, said: `Giving works with a friend met through a link, for now; ${name} was asked by name` };
    if (!picks.length) return { ok: false, said: "Pick at least one part to give" };
    if (!eng) return { ok: false, said: "Sol is not connected" };
    giving = name; eng.send({ type: "next.social.setup.send", code, picks });
    return { ok: true, said: `Giving ${name} how you work…` };
  },
  /** every card a friend gave me; the one in a room; the one a person gave me */
  setups(): Got[] { return setups; },
  setupOf(code: string): Got | null { return setups.find((c) => c.code === code) ?? null; },
  setupFrom(name: string): Got | null { return setups.find((c) => c.from.toLowerCase() === name.toLowerCase()) ?? null; },
  /** take a card (all of it, or the picked parts): one change marked from its giver; the engine's answer is the flash */
  take(code: string, picks: string[] = []): string | null {
    const c = setups.find((x) => x.code === code);
    if (!c) return "That card is gone: open Social again";
    if (!eng) return "Sol is not connected";
    taking = picks.length ? picks : c.parts.map((p) => p.id);
    eng.send({ type: "next.social.setup.take", code, sha: c.sha, picks });
    return null;
  },
  /** the last take, while it can be taken back */
  took(): Took | null { return took; },
  back(): string | null {
    if (!took) return "Nothing to take back";
    if (!eng) return "Sol is not connected";
    eng.send({ type: "next.social.setup.back", plan: took.plan, fits: took.fits });
    return null;
  },
};

type Said = { type?: string; rid?: string; login?: string; ok?: boolean; why?: string; link?: string; code?: string; who?: string; friends?: Room[]; friend?: { name?: string }; already?: boolean;
  card?: { parts?: unknown }; cards?: unknown[]; sent?: number; plan?: string; fits?: unknown[]; made?: number; from?: string };

/** the engine's cards (next.social.setup.cards) as the face keeps them: only well-formed ones, their parts read (pure) */
export function setupsOf(v: unknown): Got[] {
  return (Array.isArray(v) ? v : []).flatMap((c): Got[] => c && typeof c.code === "string" && typeof c.sha === "string" && typeof c.from === "string"
    ? [{ code: c.code, sha: c.sha, from: c.from, at: Number(c.at) || 0, parts: partsOf(c.parts) }] : []);
}

/** the links Sol is opened with (src-tauri link.rs: `sol-url` as they come, `sol_url_take` for the one that launched it),
 *  in the main window only, as Cowork's JoinAsk hears them in the old face; in vite dev a page's own `sol-url` event
 *  (its detail the link) stands in, so the ask can be shot in a browser. Returns its undo */
function hearLinks(f: (url: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let off: (() => void) | undefined, gone = false;
  const dev = (ev: Event) => f((ev as CustomEvent).detail);
  if (import.meta.env?.DEV) window.addEventListener("sol-url", dev);
  if ("__TAURI_INTERNALS__" in window) {
    const take = () => import("@tauri-apps/api/core").then(({ invoke }) => invoke<string[]>("sol_url_take"));
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (getCurrentWindow().label !== "main") return;
      return import("@tauri-apps/api/event").then(({ listen }) => listen<string>("sol-url", (ev) => { f(ev.payload); void take().catch(() => {}); }))
        .then((u) => { if (gone) u(); else off = u; })
        .then(() => (gone ? [] : take()))
        .then((urls) => { for (const u of urls ?? []) f(u); });
    }).catch(() => {});
  }
  return () => { gone = true; off?.(); window.removeEventListener("sol-url", dev); };
}

export function attach(e: Engine): void | (() => void) {
  startSocial(false);
  eng = e;
  const draw = () => change(() => { live.circle = circleOf(socialNow(), now(), rooms); live.social = social; });
  const off = e.subscribe((m: Said) => {
    // the person's Sol name, for their link: the login the engine says this Sol is (settings, #1224); kept in #1072's me
    if (m?.type === "settings" && m.login && socialNow().me.sol !== m.login) { setSocial((s) => ({ ...s, me: { ...s.me, sol: m.login! } })); draw(); }
    if (m?.type === "next.social.friends" && Array.isArray(m.friends)) {
      rooms = m.friends.filter((r) => r && typeof r.code === "string").map((r) => ({ code: r.code, name: String(r.name ?? ""), mine: !!r.mine,
        people: Array.isArray(r.people) ? r.people.map(String) : [], link: String(r.link ?? ""), ...(r.gone ? { gone: true as const } : {}), ...(r.unknown ? { unknown: true as const } : {}) }));
      const s = socialNow(), next = withRooms(s, rooms, metBefore()), now = metNow(rooms);
      if (next !== s) setSocial(() => next);
      if (now) try { localStorage.setItem(MET, JSON.stringify(now)); } catch { /* kept next time */ }
      draw();
    }
    if (m?.type === "next.social.friend.link") { link = m.ok && m.link ? { url: m.link } : { why: m.why ?? "No link this time" }; if (!m.ok) flash(link.why!); draw(); }
    if (m?.type === "next.social.friend.add") {
      const who = /^Friend · (.+?) · /.exec(m.friend?.name ?? "")?.[1];
      flash(saidAdd(!m.ok ? (m.why ?? "That link did not open") : m.already ? "Already a friend link here" : `${who ?? "They"} and you are friends now`));
    }
    // the link Sol was opened with, peeked: a friend's asks on Social; mine, a group's or a used one says why there
    if (m?.type === "next.social.friend.peek" && peeking && m.rid === peeking) {
      peeking = "";
      if (m.ok && !m.already && m.code) opened = { code: m.code, who: m.who || "Someone" };
      else saidAdd(m.ok ? `${m.who || "They"} and you are friends already` : (m.why ?? "That link did not open"));
      act("page:social");
      draw();
    }
    // share a setup: my card drafted, a give landed, the cards friends gave, a take and its Back
    if (m?.type === "next.social.setup.draft") { draft = m.ok ? { parts: partsOf(m.card?.parts) } : { why: m.why ?? "Sol could not read how you work" }; draw(); }
    if (m?.type === "next.social.setup.send") { flash(m.ok ? `${giving || "Your friend"} has how you work now: ${m.sent} ${m.sent === 1 ? "part" : "parts"}` : (m.why ?? "That did not go")); giving = ""; }
    if (m?.type === "next.social.setup.cards" && m.ok) { setups = setupsOf(m.cards); draw(); }
    if (m?.type === "next.social.setup.take") {
      const c = setups.find((x) => x.from === m.from);
      if (m.ok) { took = { code: c?.code ?? "", sha: c?.sha ?? "", plan: m.plan, fits: (m.fits ?? []).map(String), made: Number(m.made) || 0, from: m.from ?? "", parts: taking }; flash(`${tookLine(took)} · Back is on the card`); }
      else flash(m.why ?? "That did not take");
      draw();
    }
    if (m?.type === "next.social.setup.back") { if (m.ok) { flash(took ? `Taken back: ${tookLine(took)}` : "Taken back"); took = null; } else flash(m.why ?? "That did not go back"); draw(); }
  });
  // who opened my link shows within the minute: the cloud tells nobody, so this Sol asks (the members of each friend room)
  // and what a friend gave me, the same way: their card is a file in our room, and nothing tells me it came
  const ask = () => { e.send({ type: "next.social.friends" }); e.send({ type: "next.social.setup.cards" }); };
  ask();
  const every = setInterval(ask, 60_000);
  const unhear = hearLinks((u) => social.opened(u));
  draw();
  return () => { off(); clearInterval(every); unhear(); eng = null; rooms = []; link = {}; setups = []; draft = {}; took = null; giving = ""; taking = []; added = ""; peeking = ""; opened = null; live.circle = null; live.social = null; };
}
