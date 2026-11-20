// The door: who may open the engine's socket or fetch its routes. Pure on the request headers, so `npm test` can knock.
//
// Over the tailnet (`tailscale serve` proxies to this port and adds Tailscale-User-Login): the login must be SOL_OWNER,
// and a request with an Origin must come from a page of Sol's own: the away page this engine serves at its own tailnet
// name (https, the request's Host), or the Mac app and its hot face on an owner device, which dial a far engine when
// Marco moves Sol there (My machines, #32; #49). Any other page on an owner device, Sol's own Playwright browser on the
// NucBox included, carries its own Origin and is refused (#16, blocker 1). No Origin is a program on the tailnet (the
// phone app, curl as the owner).
//
// On loopback (safety pass #11, C1): a browser always sends its page's Origin, and any web page can open a socket to
// 127.0.0.1, so the request must come from Sol's own pages: the app's bundled pages, its hot pages on Vite, or the
// away page this engine serves. No Origin is a local program (it already runs as Marco). WebKit calls the hot face's
// socket (localhost:1420 to 127.0.0.1) "cross-site", so Sec-Fetch-Site only speaks when there is no Origin.
// The Host must name this Mac (#1715): a page whose own hostname is pointed at 127.0.0.1 is same-origin with the engine,
// sends no Origin on a GET, and would read GET /log and every other route; every way Sol dials it says 127.0.0.1 or
// localhost. No Host at all is a program, never a browser.
import type { IncomingHttpHeaders } from "node:http";

export type DoorOpts = { port: number; owner: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// a Host that names this Mac, port or not, a final dot or not: 127.0.0.1, localhost or [::1]
const hostName = (h: string) => h.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const loopbackHost = (h: string | undefined) => h === undefined || LOOPBACK.has(hostName(h));
// a machine's tailnet name (MagicDNS, <machine>.<tailnet>.ts.net), port or not
const tailnetHost = (h: string | undefined) => h !== undefined && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(hostName(h));

export function tailnetOk(headers: IncomingHttpHeaders, opts: DoorOpts): boolean {
  const who = one(headers["tailscale-user-login"]);
  // the Host here, not in doorOpen, so the page pane's keyed assets (index.ts), which ask only this, get it too
  if (who === undefined) return loopbackHost(one(headers.host));
  const owner = opts.owner.trim().toLowerCase();
  // a page pointed at this Mac may send the login header itself (same-origin, no preflight): the Host must still name
  // this Mac or its tailnet name, which `tailscale serve` passes on (#1715)
  return owner !== "" && who.trim().toLowerCase() === owner && (loopbackHost(one(headers.host)) || tailnetHost(one(headers.host)));
}

// The app's own pages, wherever the engine is: the bundled pages and the hot face on Vite. SOL_FACE names one more
// origin, a side copy's hot face on another port, so a worktree's engine and face can be tried together.
const APP = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420", "http://127.0.0.1:1420", ...(process.env.SOL_FACE ? [process.env.SOL_FACE] : [])]);

export function doorOpen(headers: IncomingHttpHeaders, opts: DoorOpts): boolean {
  if (!tailnetOk(headers, opts)) return false;
  const o = one(headers.origin);
  if (one(headers["tailscale-user-login"]) !== undefined) {
    if (o === undefined) return true;
    if (APP.has(o)) return true;
    const host = (one(headers["x-forwarded-host"]) ?? one(headers.host) ?? "").trim().toLowerCase();
    return host !== "" && o.toLowerCase() === `https://${host}`;
  }
  const own = (x: string) => APP.has(x) || x === `http://127.0.0.1:${opts.port}` || x === `http://localhost:${opts.port}`;
  if (typeof o === "string") return own(o);
  if (one(headers["sec-fetch-site"]) !== "cross-site") return true;
  // an image, font or style a page of Sol's own loads (the page pane's assets, #54) carries no Origin, only its page as
  // Referer and "cross-site" (the app's scheme is not the engine's): the Referer's origin must be a page of Sol's own
  return one(headers["sec-fetch-mode"]) === "no-cors" && own(originOf(one(headers.referer)));
}
/** Sol's own app page (#416, the review session's card): an Origin of the app's, never none (a program on this Mac) and
 *  never the engine's own port (the away page). A program may still fake an Origin; this keeps out the plain ones */
export function appPage(headers: IncomingHttpHeaders, opts: DoorOpts): boolean {
  const o = one(headers.origin);
  return typeof o === "string" && APP.has(o) && doorOpen(headers, opts);
}
// the origin of a URL; a custom scheme (tauri://localhost) has none in Node, so it is put together
const originOf = (u: string | undefined) => { try { if (!u) return ""; const x = new URL(u); return x.origin !== "null" ? x.origin : `${x.protocol}//${x.host}`; } catch { return ""; } };
