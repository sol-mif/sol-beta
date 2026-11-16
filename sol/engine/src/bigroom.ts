// The big room (the design's step 3, 2026-11): a block whose record asks for `room: "big"` runs in a process of its own,
// walled by macOS's sandbox, and only while it is used. The small room (kernel-worker.ts) is untouched.
//   the wall      sandbox-exec with a profile made here from the record: deny by default; the node that runs the engine
//                 and the libraries it links (walked with otool, each Homebrew keg by name, not the whole Cellar); its own
//                 folder, read only; the folders it declares and a scratch folder of its own, read and written; the names
//                 of the folders above those (metadata only, to walk down to them); one port on this machine, its proxy.
//                 `(deny process-fork)`: it starts nothing, so nothing it starts can slip out of the engine's hands.
//                 Everything else is unreadable, though a name guessed still tells whether a file is there (RESULT.md 1).
//   the proxy     one per room, opened when it wakes and closed, with every tunnel through it, when it sleeps. CONNECT to a
//                 declared host (port 443 unless the record names one) passes; anything else is refused, with the host
//                 on the log. A connection that skips the proxy is the sandbox's to refuse: the system log sees it, the
//                 engine does not.
//   used, then put away  a big room's tools, schedules and the kinds it hears come from its record (needs.tools,
//                 needs.every, hears), so the engine lists its tools, counts its times and keeps its events while no process
//                 runs. A call, a time or an event wakes it; idle for a few minutes it is put away (what it held in memory
//                 goes; what it keeps, it writes through sol.write).
//   the door      what a room asks of the engine goes over its IPC channel: a read, a write, a line (as in the small room,
//                 but awaited: sol.read and sol.write return promises in the big room), and four of its own: sol.run (a
//                 declared program, run by the engine beside the room, in a wall of its own), sol.fetch (a request to a
//                 declared host, sent by the engine), sol.call (one of Sol's own tools the record names) and sol.every and
//                 sol.listen, which only say what to run when the engine says the time has come or an event is here.
//   keys          a key the record names is read by the engine (keys.ts) and put into the program's environment or the
//                 request's header there; it never enters the room. `gh auth` is refused (it prints the key); what comes
//                 back has the key's text cut out. One line on the log for each run and fetch, never the arguments.
//   limits        10 s to load, 60 s a call, 256 MB (node's own heap ceiling, and the engine looks at its size every two
//                 seconds and stops it past that); a room that breaks one is broken, said in its place, as the small room.
// macOS only: elsewhere a big room is broken with that reason (Windows isolation is its own piece of work).
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect, isIP, type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import type { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { tmpdir, platform, homedir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { lstatSync } from "node:fs";
import type { Columns } from "./record.js";

export const SANDBOX = "/usr/bin/sandbox-exec";
/** the big room's limits (the design's loader, "timeouts and ceilings"): numbers to look at again later */
export type Limits = { loadMs: number; callMs: number; idleMs: number; memMb: number; watchMs: number; sandbox: string };
export const BIG: Limits = { loadMs: 10_000, callMs: 60_000, idleMs: 3 * 60_000, memMb: 256, watchMs: 2000, sandbox: SANDBOX };
/** the most a room may keep waiting for it while it wakes: events past this are dropped, the oldest first */
const QUEUE = 1000;
/** the most a run or a fetch hands back */
const OUT_MAX = 8 * 1024 * 1024;

// ---- where the approvals and keys live: beside the log, where no seat's folder reaches ----

/** Sol's own folder on this machine: SOL_APPDIR first (a stage, a test), else ~/Library/Application Support/Sol */
export function appDir(): string {
  const env = (process.env.SOL_APPDIR ?? "").trim();
  if (env) return resolve(env);
  return platform() === "darwin" ? join(homedir(), "Library", "Application Support", "Sol") : join(homedir(), ".local", "share", "sol");
}
// the press (pressedFile, widerThan) moved to card.ts with the card itself (step 4)

// ---- what a program needs to start: itself and the libraries it links ----

const SYSTEM = (p: string) => p.startsWith("/usr/lib/") || p.startsWith("/System/");
const linked = new Map<string, { files: string[]; kegs: string[]; etc: string[] }>();
/** the files a program reads to start, walked with otool -L: system libraries are under /usr/lib and /System (allowed
 *  whole); every other one is named, and a Homebrew keg (Cellar/<name>/<version>) is allowed whole, since a library reads
 *  its own data beside it (ICU). OpenSSL's keg brings its etc folder (openssl.cnf). Cached per file and its size and time */
export function startFiles(exe: string): { files: string[]; kegs: string[]; etc: string[] } {
  const real = realpathSync(exe);
  const st = statSync(real), key = `${real}:${st.size}:${st.mtimeMs}`;
  const had = linked.get(key);
  if (had) return had;
  const files = new Set<string>([real, exe]), kegs = new Set<string>(), etc = new Set<string>();
  const keg = (p: string) => {
    const m = /^(.*)\/Cellar\/([^/]+)\/[^/]+(?=\/)/.exec(p);
    if (!m) return;
    kegs.add(m[0]);
    if (/^openssl@\d+$/.test(m[2]) && existsSync(join(m[1], "etc", m[2]))) etc.add(join(m[1], "etc", m[2]));
  };
  keg(real);
  const walk = (f: string, rpaths: string[]) => {
    let out = "";
    try { out = execFileSync("/usr/bin/otool", ["-L", f], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return; }
    for (const line of out.split("\n").slice(1)) {
      const p0 = line.trim().split(" (")[0];
      if (!p0 || SYSTEM(p0)) continue;
      const tries = p0.startsWith("@rpath/") ? rpaths.map((r) => join(r, p0.slice(7)))
        : p0.startsWith("@loader_path/") ? [join(dirname(f), p0.slice(13))]
        : p0.startsWith("@executable_path/") ? [join(dirname(real), p0.slice(17))] : [p0];
      for (const p of tries) {
        let r: string;
        try { r = realpathSync(p); } catch { continue; }
        files.add(p);
        if (files.has(r)) break;
        files.add(r);
        keg(r);
        walk(r, [dirname(r), ...rpaths]);
        break;
      }
    }
  };
  walk(real, [join(dirname(real), "..", "lib"), dirname(real)]);
  const got = { files: [...files], kegs: [...kegs], etc: [...etc] };
  linked.set(key, got);
  return got;
}

/** a declared program's name to the file that runs: the engine's PATH and the usual places, the first that is there */
export function findProgram(name: string): string | null {
  const dirs = [...(process.env.PATH ?? "").split(delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].filter((d) => d.startsWith("/"));
  for (const d of new Set(dirs)) {
    const p = join(d, name);
    try { if (statSync(p).isFile()) return realpathSync(p); } catch { /* not here */ }
  }
  return null;
}

/** a declared folder that would reach what the wall is for (Sol's own folder with the keys and presses, the log, the
 *  home with every block and its data): the first such, said; folders are compared as they resolve now */
export function folderClash(folders: string[], guarded: { path: string; what: string }[]): string | null {
  const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const inside = (a: string, b: string) => a === b || a.startsWith(b.endsWith("/") ? b : b + "/");
  for (const f of folders) {
    const r = real(f);
    for (const g of guarded) {
      const gr = real(g.path);
      if (inside(r, gr) || inside(gr, r)) return `the folder it declares, ${f}, ${inside(r, gr) ? "is inside" : "holds"} ${g.what}: a block never reaches that`;
    }
  }
  return null;
}

// ---- the profile ----

const q = (s: string) => JSON.stringify(s);
const ancestors = (p: string) => { const out: string[] = []; for (let d = dirname(p); d !== "/" && d !== "."; d = dirname(d)) out.push(d); return out; };
/** the screen block (RESULT.md 3): the four services and IOKit screencapture needs, nothing else. A record asks for it
 *  with needs.screen; the card says it is the whole screen, every window's title included */
/** the programs the screen block is opened for, when a record asks for the screen: those that only take pictures or
 *  find a window. Never an interpreter: osascript in a wall with the screen block posts the mouse and the keys (tried,
 *  step 7), so a record with screen and osascript, python or a shell gets the screen for none of them */
export const SCREEN_TAKERS: ReadonlySet<string> = new Set(["screencapture", "sol-windows"]);
/** macOS's own file for each taker the system ships: a file of that name found first on the PATH is not it */
const SYSTEM_TAKERS: Record<string, string> = { screencapture: "/usr/sbin/screencapture" };
/** whether this run is one the screen block is opened for, judged by the file that runs, never its name: macOS's own
 *  screencapture, or Sol's helper as the engine built it (a link named screencapture to osascript gets nothing) */
export function takesPictures(program: string, exe: string, helper: string | null): boolean {
  if (!SCREEN_TAKERS.has(program)) return false;
  const sys = SYSTEM_TAKERS[program];
  if (sys) { try { return realpathSync(sys) === exe; } catch { return false; } }
  return helper !== null && helper === exe;
}
export const SCREEN = [
  `(allow mach-lookup (global-name "com.apple.tccd.system") (global-name "com.apple.windowserver.active") (global-name "com.apple.CARenderServer") (global-name "com.apple.replayd"))`,
  "(allow iokit-open)",
];
export type Wall = {
  /** the one program the wall lets start: node for the room, a declared program for sol.run */
  exe: string;
  /** read only: the block's folder, the room's host script and the package.json files node looks for beside them */
  read: string[];
  /** read and written: the declared folders and the room's scratch folder */
  write: string[];
  /** the proxy's port on this machine */
  proxy: number;
  /** what else: the screen block, the certificate service */
  more?: string[];
};
/** the sandbox profile for one wall (pure but for the walk of what the program links) */
export function profileOf(w: Wall): string {
  const start = startFiles(w.exe);
  const reads = [...w.read, ...w.write];
  const named = [...new Set([...start.files, ...reads, ...start.kegs, ...start.etc])];
  return [
    "(version 1)",
    "(deny default)",
    "(deny process-fork)",
    `(allow process-exec (literal ${q(realpathSync(w.exe))}))`,
    `(allow file-read* ${start.files.map((f) => `(literal ${q(f)})`).join(" ")} ${[...start.kegs, ...start.etc].map((k) => `(subpath ${q(k)})`).join(" ")})`,
    ...(reads.length ? [`(allow file-read* ${reads.map((p) => `(subpath ${q(p)})`).join(" ")})`] : []),
    ...(w.write.length ? [`(allow file-write* ${w.write.map((p) => `(subpath ${q(p)})`).join(" ")})`] : []),
    // what any program needs to start: the system's libraries, dyld's cache, a few devices; node reads the root's listing
    `(allow file-read* (subpath "/usr/lib") (subpath "/System") (subpath "/private/var/db/dyld") (subpath "/Library/Apple/usr/libexec/oah") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (literal "/dev/zero"))`,
    `(allow file-read-data (literal "/"))`,
    `(allow file-write-data (literal "/dev/null"))`,
    `(allow file-ioctl (literal "/dev/null"))`,
    "(allow sysctl-read)",
    "(allow process-info* (target self))",
    "(allow signal (target self))",
    // the names of the folders above what it may read, to walk down to them; no listing, no contents
    `(allow file-read-metadata (literal "/") ${[...new Set(named.flatMap(ancestors))].map((p) => `(literal ${q(p)})`).join(" ")})`,
    `(allow network-outbound (remote ip ${q(`localhost:${w.proxy}`)}))`,
    ...(w.more ?? []),
  ].join("\n");
}

// ---- the proxy ----

export type Proxy = { port: number; close(): Promise<void> };
/** a host the record declared, as "host" (port 443) or "host:port" */
export function declared(domains: string[], host: string, port: number): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return domains.some((d) => { const [dh, dp] = d.toLowerCase().split(":"); return dh === h && (dp ? Number(dp) : 443) === port; });
}
/** this engine's own port on this machine: never through a room's proxy, declared or not (it would be the whole of
 *  Sol's API, past the gate) */
export function engineItself(host: string, port: number): boolean {
  const mine = Number(process.env.SOL_PORT || process.env.PORT || 7777);
  return port === mine && /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i.test(host);
}
const v4near = (b: number[]) => { const [x, y] = b; return x === 127 || x === 10 || x === 0 || x >= 224 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || (x === 198 && (y === 18 || y === 19)); };
/** an IPv6 address as its 16 bytes, or null (a dotted IPv4 tail is read too) */
function v6bytes(a: string): number[] | null {
  let t = a;
  const dot = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (dot) { const q = dot[1].split(".").map(Number); t = t.slice(0, -dot[1].length) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16); }
  const [l, r] = t.split("::");
  const L = l ? l.split(":") : [], R = r !== undefined && r ? r.split(":") : [];
  const groups = r === undefined ? L : [...L, ...Array(Math.max(0, 8 - L.length - R.length)).fill("0"), ...R];
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => { const n = parseInt(g || "0", 16); return [n >> 8, n & 255]; });
}
/** an address not on the open internet: this machine, a private network, a link, multicast, or an IPv6 form that carries
 *  one of those IPv4s inside it (mapped, compatible, NAT64, 6to4). For IPv6 only global unicast passes */
export function nearby(a: string): boolean {
  const v = a.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (isIP(v) === 4) return v4near(v.split(".").map(Number));
  if (isIP(v) !== 6) return false;
  const b = v6bytes(v);
  if (!b) return true;
  const zero = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zero(10) && b[10] === 255 && b[11] === 255) return v4near(b.slice(12));                        // ::ffff:a.b.c.d
  if (zero(12)) return true;                                                                           // ::, ::1, ::a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return v4near(b.slice(12));   // 64:ff9b::/96
  if (b[0] === 0x20 && b[1] === 0x02) return v4near(b.slice(2, 6));                                    // 2002::/16, 6to4
  return (b[0] & 0xe0) !== 0x20;                                                                       // not 2000::/3
}
/** one room's proxy: CONNECT to a declared host passes, the rest is refused and said (refused(host, port)) */
export function openProxy(domains: string[], refused: (host: string, port: number) => void): Promise<Proxy> {
  const open = new Set<Socket>();
  const keep = (s: Socket) => { open.add(s); s.on("close", () => open.delete(s)); };
  const server: Server = createServer((req, res) => {   // plain http through the proxy: refused, whatever the host
    let host = "";
    try { host = new URL(req.url ?? "").hostname; } catch { /* not a url */ }
    refused(host || String(req.headers.host ?? ""), 80);
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("not declared: the big room's proxy passes https to the hosts its record declares\n");
  });
  server.on("connection", keep);
  server.on("connect", (req, client: Socket, head: Buffer) => {
    let up: Socket | null = null;
    client.on("error", () => up?.destroy());   // first: a client gone while its name is looked up never throws in the engine
    client.on("close", () => up?.destroy());
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? "");
    const host = m?.[1] ?? "", port = Number(m?.[2] ?? 0);
    const no = () => { refused(host || String(req.url ?? ""), port); if (!client.destroyed) client.end("HTTP/1.1 403 Not Declared\r\n\r\n"); };
    if (!m || !declared(domains, host, port) || engineItself(host, port)) return no();
    // the name is looked up here and the address checked is the one connected to (no second lookup to rebind): a
    // declared name that turns out to be this machine, a private network or a link is refused, unless what was declared
    // is itself a local address
    void lookup(host, { all: true }).then((as) => {
      if (client.destroyed) return;
      const near = as.some((a) => nearby(a.address));
      if (!as.length || (near && !nearby(host) && host.toLowerCase() !== "localhost") || as.some((a) => engineItself(a.address, port))) return no();
      const u = connect(port, as[0].address, () => { if (client.destroyed) { u.destroy(); return; } client.write("HTTP/1.1 200 OK\r\n\r\n"); if (head.length) u.write(head); u.pipe(client); client.pipe(u); });
      up = u;
      keep(u);
      u.on("error", () => client.destroy());
    }, () => no());
  });
  return new Promise((ok, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      ok({
        port: typeof a === "object" && a ? a.port : 0,
        close: () => new Promise<void>((done) => { for (const s of open) s.destroy(); open.clear(); server.close(() => done()); }),
      });
    });
  });
}

// ---- one room ----

/** what a room says over its channel */
type Said = { t: string; q?: number; call?: number; ok?: boolean; value?: unknown; why?: string; name?: string; description?: string; args?: unknown; what?: string; line?: string; where?: string; program?: string; url?: string; opts?: unknown; tool?: string };
export type Answer = { ok: boolean; value?: unknown; why?: string };
/** what the kernel does for a room: the gate and the log are the kernel's */
export type RoomHost = {
  read(what: string): unknown;
  write(what: string, value: unknown): void;
  /** a line, trouble, a tool it registered: as the small room's words (kernel.ts hear) */
  said(m: { t: string; line?: string; where?: string; why?: string; name?: string; what?: string }): void;
  run(program: string, args: unknown, opts: unknown, room: { proxy: number }): Promise<unknown>;
  fetch(url: string, opts: unknown): Promise<unknown>;
  call(tool: string, args: unknown): Promise<unknown>;
  /** the declared folders as they resolve now, checked again (a symlink planted since, a clash), one not there yet made
   *  (the room is up: its card was pressed): throws why */
  folders(): string[];
  /** a line on the log by the engine about this room: woke, put away */
  note(kind: "plugin.wake" | "plugin.sleep", value: Record<string, unknown>): void;
  /** the room broke while it was up: the kernel breaks the block */
  broke(why: string): void;
};
export type RoomOptions = {
  id: string; dir: string; file: string; host: string; cols: Columns;
  closeMs: number;
} & Limits;

/** one big room: asleep until a call, a time or an event; then a process in its wall, put away when idle */
export class Room {
  private child: ChildProcess | null = null;
  private proxy: Proxy | null = null;
  private scratch: string | null = null;
  private waking: Promise<string | null> | null = null;
  private ready = false;
  private gone = false;   // unloaded or broken: it never wakes again
  private calls = new Map<number, (a: Answer) => void>();
  private n = 0;
  private busy = 0;       // calls and door asks in flight: it is not idle while any are
  private queue: unknown[] = [];
  private dropped = 0;
  private ticks = new Set<number>();
  private idle: NodeJS.Timeout | null = null;
  private watch: NodeJS.Timeout | null = null;
  private closing = false;
  private sleeping: Promise<void> | null = null;
  private err = "";
  /** the programs it asked the engine to run, killed with it */
  readonly runs = new Set<ChildProcess>();

  constructor(private o: RoomOptions, private h: RoomHost) {}

  get awake(): boolean { return this.ready; }
  get pid(): number | null { return this.child?.pid ?? null; }

  /** start its process, once; null when it is up, else why it could not be */
  wake(why: string): Promise<string | null> {
    if (this.gone) return Promise.resolve("it is unloaded");
    if (this.sleeping) return this.sleeping.then(() => this.wake(why));   // being put away: wake it again after
    if (this.ready) return Promise.resolve(null);
    if (!this.waking) this.waking = this.start(why).then((no) => { this.waking = null; if (no) this.broke(no); return no; });   // a room that cannot wake is broken, as a small room that cannot load
    return this.waking;
  }

  private async start(why: string): Promise<string | null> {
    const n = this.o.cols.needs;
    const domains = n?.domains ?? [];
    let folders: string[] = [];
    try {
      folders = this.h.folders();
      this.proxy = await openProxy(domains, (host, port) => this.h.said({ t: "refused-net", what: `${host}:${port}` }));
      if (this.gone) { await this.put(); return "it is unloaded"; }   // unloaded while its proxy opened: nothing starts
      const base = realpathSync(mkdtempSync(join(tmpdir(), `sol-room-${this.o.id}-`)));
      this.scratch = base;
      const exe = realpathSync(process.execPath);
      const pkgs = [this.o.host, this.o.file].flatMap((f) => ancestors(f).map((d) => join(d, "package.json"))).filter((p) => existsSync(p));
      const profile = profileOf({
        exe,
        read: [realpathSync(this.o.dir), realpathSync(this.o.host), ...pkgs],
        write: [base, ...folders],
        proxy: this.proxy.port,
      });
      const url = `http://127.0.0.1:${this.proxy.port}`;
      const env = { HOME: base, TMPDIR: base, PATH: "", HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, NODE_USE_ENV_PROXY: "1", NO_PROXY: "", no_proxy: "" };
      const child = spawn(this.o.sandbox, ["-p", profile, exe, `--max-old-space-size=${Math.max(64, this.o.memMb)}`, "--disable-warning=ExperimentalWarning", this.o.host], {
        env, cwd: base, stdio: ["ignore", "ignore", "pipe", "ipc"], serialization: "json",
      });
      this.child = child;
      this.err = "";
      child.stderr?.on("data", (b: Buffer) => { this.err = (this.err + b.toString("utf8")).slice(-2000); });
      child.unref();
      (child as unknown as { channel?: { unref(): void } }).channel?.unref();
    } catch (e) {
      await this.put();
      return `its room could not be made: ${(e as Error).message}`;
    }
    const child = this.child!;
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (no: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (no) { void this.put(); resolve(no); return; }
        this.ready = true;
        this.h.note("plugin.wake", { why, pid: child.pid });
        this.startWatch();
        resolve(null);
        this.flush();
        this.touch();
      };
      const timer = setTimeout(() => done(`its engine half did not finish loading within ${this.o.loadMs} ms`), this.o.loadMs);
      child.on("message", (m: Said) => {
        if (m?.t === "ready") done(null);
        else if (m?.t === "failed") done(`its engine half threw at load: ${String(m.why)}`);
        else this.hear(m);
      });
      child.on("error", (e) => { if (!settled) done(`its sandbox would not start: ${e.message}`); });
      child.on("exit", (code, sig) => {
        const said = this.err.trim().split("\n").filter(Boolean);
        const sandbox = said.find((l) => l.startsWith("sandbox-exec:"));
        const why = sandbox ? `its sandbox would not start: ${sandbox.slice(13).trim()}` : `its room ended (${sig ?? `exit ${code}`})${said.length ? `: ${said.at(-1)!.slice(0, 300)}` : ""}`;
        if (!settled) { done(why); return; }
        if (this.child !== child) return;
        const ours = this.closing;
        void this.put();
        if (!ours && !this.gone) this.broke(why);
      });
      child.send({ t: "start", id: this.o.id, file: this.o.file, folders });   // sol.folders: where its declared folders are (its HOME is a scratch folder)
    });
  }

  /** a seat's step through one of its tools: wakes it, waits at most callMs */
  async call(name: string, args: Record<string, unknown>, ms = this.o.callMs): Promise<Answer> {
    this.busy++;
    try {
      const no = await this.wake(`a seat called ${name}`);
      if (no) return { ok: false, why: no };
      const child = this.child!;
      const call = ++this.n;
      return await new Promise<Answer>((resolve) => {
        const timer = setTimeout(() => { this.calls.delete(call); resolve({ ok: false, why: `${name} did not answer within ${ms} ms` }); }, ms);
        this.calls.set(call, (a) => { clearTimeout(timer); resolve(a); });
        child.send({ t: "call", call, name, args });
      });
    } finally { this.busy--; this.touch(); }
  }

  /** an event it hears: handed now when it is up, else kept and it is woken */
  event(e: unknown): void {
    if (this.gone) return;
    if (this.ready) { this.child?.send({ t: "ev", e }); this.touch(); return; }
    this.queue.push(e);
    if (this.queue.length > QUEUE) { this.queue.shift(); this.dropped++; }
    void this.wake("an event it hears");
  }

  /** one of its declared times came round */
  tick(ms: number): void {
    if (this.gone) return;
    if (this.ready) { this.child?.send({ t: "every", ms }); this.touch(); return; }
    this.ticks.add(ms);
    void this.wake(`its time (every ${ms} ms)`);
  }

  private flush() {
    const c = this.child;
    if (!c) return;
    if (this.dropped) { this.h.said({ t: "trouble", where: "its waiting events", why: `${this.dropped} events came while it woke and were dropped (it keeps ${QUEUE})` }); this.dropped = 0; }
    for (const e of this.queue.splice(0)) c.send({ t: "ev", e });
    for (const ms of this.ticks) c.send({ t: "every", ms });
    this.ticks.clear();
  }

  private broke(why: string) {
    if (this.gone) return;
    this.gone = true;
    this.fail(`${this.o.id} broke: ${why}`);
    void this.put();
    this.h.broke(why);
  }

  private fail(why: string) {
    for (const f of this.calls.values()) f({ ok: false, why });
    this.calls.clear();
  }

  /** what the room says: an answer, or something it asks of the engine */
  private hear(m: Said) {
    const c = this.child;
    if (!c) return;
    this.touch();
    const answer = (q: number | undefined, p: Promise<unknown> | (() => unknown)) => {
      this.busy++;
      Promise.resolve().then(typeof p === "function" ? p : () => p)
        .then((value) => ({ ok: true, value }), (e) => ({ ok: false, why: (e as Error)?.message ?? String(e) }))
        .then((a) => { this.busy--; this.touch(); if (this.child === c && c.connected) c.send({ t: "answer", q, ...a }); });
    };
    switch (m?.t) {
      case "result": { const f = this.calls.get(Number(m.call)); this.calls.delete(Number(m.call)); f?.({ ok: !!m.ok, value: m.value, why: m.why }); return; }
      case "log": case "trouble": case "tool": this.h.said(m as { t: string }); return;
      case "read": answer(m.q, () => this.h.read(String(m.what))); return;
      case "write": answer(m.q, () => this.h.write(String(m.what), m.value)); return;
      case "run": answer(m.q, this.h.run(String(m.program), m.args, m.opts, { proxy: this.proxy?.port ?? 0 })); return;
      case "fetch": answer(m.q, this.h.fetch(String(m.url), m.opts)); return;
      case "call": answer(m.q, this.h.call(String(m.tool), m.args)); return;
    }
  }

  /** idle for idleMs with nothing in flight: put away */
  private touch() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (!this.ready || this.gone) return;
    this.idle = setTimeout(() => { if (this.busy > 0 || this.calls.size) this.touch(); else void this.sleep("idle"); }, this.o.idleMs);
    this.idle.unref();
  }

  private startWatch() {
    const c = this.child;
    this.watch = setInterval(() => {
      if (!c?.pid || this.child !== c) return;
      execFile("/bin/ps", ["-o", "rss=", "-p", String(c.pid)], (err, out) => {
        if (err || this.child !== c) return;
        const mb = Number(out.trim()) / 1024;
        if (mb > this.o.memMb) { c.kill("SIGKILL"); this.broke(`it used ${Math.round(mb)} MB, more than ${this.o.memMb} MB`); }
      });
    }, this.o.watchMs);
    this.watch.unref();
  }

  /** put the room away: what its load returned runs (closeMs at most), then the process is killed and its proxy closed */
  sleep(why: string): Promise<void> {
    if (this.sleeping) return this.sleeping;
    if (!this.child) return Promise.resolve();
    this.sleeping = this.sleepNow(why).finally(() => { this.sleeping = null; });
    return this.sleeping;
  }
  private async sleepNow(why: string): Promise<void> {
    const c = this.child;
    if (!c) return;
    this.closing = true;
    if (this.ready && c.connected) {
      await new Promise<void>((done) => {
        const timer = setTimeout(done, this.o.closeMs);
        const on = (m: Said) => { if (m?.t === "closed") { clearTimeout(timer); c.off("message", on); done(); } };
        c.on("message", on);
        try { c.send({ t: "unload" }); } catch { clearTimeout(timer); done(); }
      });
    }
    const was = this.ready;
    this.fail(`${this.o.id} was put away (${why}) while its tool ran: its answer is dropped`);
    await this.put();
    this.closing = false;
    if (was) this.h.note("plugin.sleep", { why });
  }

  /** kill the process, close the proxy and every tunnel through it, remove the scratch folder */
  private async put() {
    this.ready = false;
    if (this.idle) clearTimeout(this.idle);
    if (this.watch) clearInterval(this.watch);
    this.idle = this.watch = null;
    const c = this.child, p = this.proxy, s = this.scratch;
    this.child = null; this.proxy = null; this.scratch = null;
    for (const r of this.runs) { try { r.kill("SIGKILL"); } catch { /* gone */ } }   // what it asked to run goes with it
    this.runs.clear();
    if (c && c.exitCode === null && c.signalCode === null) {
      const exited = new Promise<void>((done) => { c.once("exit", () => done()); setTimeout(done, 2000).unref(); });
      try { c.kill("SIGKILL"); } catch { /* gone */ }
      await exited;
    }
    if (p) await p.close().catch(() => {});
    if (s) rmSync(s, { recursive: true, force: true });
  }

  /** unload: put away for good */
  async close(why: string): Promise<void> {
    await this.sleep(why);
    this.gone = true;
    this.fail(`${this.o.id} was unloaded (${why})`);
    await this.put();
  }
}

// ---- the door's two errands: a program run beside the room, a request sent for it ----

/** gh's commands that print the key or make a word that runs another (an alias, an extension) */
const GH_NOT = new Set(["auth", "alias", "extension", "extensions", "ext", "config"]);
/** where each program known to take a key from its environment takes it */
const KEY_ENV: Record<string, string> = { gh: "GH_TOKEN" };
/** cut a key's text out of what comes back, wherever it shows */
export const redact = (s: string, key: string | null) => (key ? s.split(key).join("[key]") : s);

export type RunAsk = { program: string; args: unknown; opts: unknown };
export type RunOk = { code: number | null; signal: string | null; stdout: string; stderr: string };
/** check a run against the record (pure): the program declared and found, the args words, a key declared, gh auth refused */
export function runRefusal(cols: Columns, found: Record<string, string>, a: RunAsk): { why: string } | { exe: string; args: string[]; key: string | null; keyAs: string | null; input: string | null } {
  const n = cols.needs;
  if (!n?.programs.includes(a.program)) return { why: `${a.program} is not among the programs its record declares (${n?.programs.join(", ") || "none"})` };
  const exe = found[a.program];
  if (!exe) return { why: `${a.program} is not on this Mac` };
  if (!Array.isArray(a.args) || !a.args.every((x) => typeof x === "string") || a.args.length > 256) return { why: "its arguments are not a list of words" };
  const args = a.args as string[];
  const o = (a.opts && typeof a.opts === "object" ? a.opts : {}) as Record<string, unknown>;
  const odd = Object.keys(o).find((k) => !["key", "keyAs", "input"].includes(k));
  if (odd) return { why: `run takes key, keyAs and input, not ${odd}` };
  const sub = args.find((x) => !x.startsWith("-"));
  if (basename(a.program) === "gh" && sub && GH_NOT.has(sub)) return { why: sub === "auth" ? "gh auth is refused: it prints the key" : `gh ${sub} is refused: it makes a word that runs another command` };
  let key: string | null = null, keyAs: string | null = null;
  if (o.key !== undefined) {
    if (typeof o.key !== "string" || !n.keys.includes(o.key)) return { why: `the key ${String(o.key)} is not among the keys its record declares (${n.keys.join(", ") || "none"})` };
    key = o.key;
    // a key goes only to a program known to keep it (gh sends it to its host and prints it nowhere but gh auth, refused):
    // an interpreter or a program that echoes its environment would hand it to the room in any spelling
    keyAs = KEY_ENV[a.program] ?? null;
    if (!keyAs) return { why: `a key goes only to the programs known to keep it (${Object.keys(KEY_ENV).join(", ")}): ${a.program} could hand it back; send a request with sol.fetch instead` };
    if (o.keyAs !== undefined && o.keyAs !== keyAs) return { why: `${a.program} takes its key as ${keyAs}` };
  } else if (o.keyAs !== undefined) return { why: "keyAs without a key" };
  if (o.input !== undefined && typeof o.input !== "string") return { why: "input is not text" };
  return { exe, args, key, keyAs, input: (o.input as string | undefined) ?? null };
}

/** run a declared program beside the room: its own wall (the declared folders, a fresh home of its own for this run that
 *  the room cannot see or plant a config in, the room's proxy, the certificate service, the screen block when declared,
 *  no fork), a clean environment with the key in it when one is named, killed at ms */
export async function runBeside(exe: string, args: string[], o: { sandbox: string; folders: string[]; proxy: number; screen: boolean; env: Record<string, string>; input: string | null; ms: number; key: string | null; track?: Set<ChildProcess> }): Promise<RunOk> {
  const own = realpathSync(mkdtempSync(join(tmpdir(), "sol-run-")));
  try { return await runIn(own, exe, args, o); } finally { rmSync(own, { recursive: true, force: true }); }
}
function runIn(own: string, exe: string, args: string[], o: { sandbox: string; folders: string[]; proxy: number; screen: boolean; env: Record<string, string>; input: string | null; ms: number; key: string | null; track?: Set<ChildProcess> }): Promise<RunOk> {
  const profile = profileOf({
    exe, read: [], write: [own, ...o.folders], proxy: o.proxy,
    more: [`(allow mach-lookup (global-name "com.apple.trustd.agent"))`, ...(o.screen ? SCREEN : [])],
  });
  const url = `http://127.0.0.1:${o.proxy}`;
  const env = { HOME: own, TMPDIR: own, PATH: dirname(exe), HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, ...o.env };
  return new Promise((resolve) => {
    const c = spawn(o.sandbox, ["-p", profile, exe, ...args], { env, cwd: own, stdio: ["pipe", "pipe", "pipe"] });
    o.track?.add(c);
    c.on("exit", () => o.track?.delete(c));
    let out = Buffer.alloc(0), err = Buffer.alloc(0), cut = false;
    const take = (b: Buffer, to: "out" | "err") => {
      if (out.length + err.length + b.length > OUT_MAX) { cut = true; c.kill("SIGKILL"); return; }
      if (to === "out") out = Buffer.concat([out, b]); else err = Buffer.concat([err, b]);
    };
    c.stdout.on("data", (b: Buffer) => take(b, "out"));
    c.stderr.on("data", (b: Buffer) => take(b, "err"));
    c.stdin.on("error", () => {});
    c.stdin.end(o.input ?? undefined);
    const timer = setTimeout(() => c.kill("SIGKILL"), o.ms);
    const finish = (code: number | null, signal: string | null, more = "") => {
      clearTimeout(timer);
      const stderr = err.toString("utf8") + more + (cut ? `\n[cut at ${OUT_MAX} bytes]` : "");
      resolve({ code, signal, stdout: redact(out.toString("utf8"), o.key), stderr: redact(stderr, o.key) });
    };
    c.on("error", (e) => finish(null, null, e.message));
    c.on("close", (code, sig) => finish(code, sig));
  });
}

export type FetchAsk = { url: string; opts: unknown };
export type FetchOk = { status: number; headers: Record<string, string>; body: string };
/** the headers a block never sends, nor names as where its key goes: they say where the request goes and how it is
 *  framed, and the engine says those from the address it checked. A block's own host would take the request (and a key
 *  bound to the declared host) to another name on the same server */
const ENGINE_HEADERS = /^(host|content-length|transfer-encoding|connection|upgrade|te|trailer|keep-alive|expect|proxy-.*)$/;
/** and with a key on the request, nor these: an answer compressed, cut where the block asks, or spelled in another charset
 *  is one the key cannot be found in and cut out of */
const KEY_HEADERS = /^(accept(-.*)?|range|if-range|a-im|want-.*|prefer)$/;
/** with a key on the request the block's headers are these alone (the key's own is the engine's): none of them asks the
 *  server to spell its answer another way. A list of what is let through, not of what is refused: a server may honour a
 *  header nobody thought of (accept-charset, a-im, want-digest) and send the key back where it is not found */
const KEY_SAFE = /^(accept|accept-language|content-type|user-agent|if-none-match|if-modified-since|x-github-api-version)$/;
/** the one charset the key is looked for in, with a key on the request: utf-8 */
const KEY_CHARSET = /^utf-?8$/;
/** the charset an accept or content-type value names, if any */
const charsetOf = (v: string | undefined) => /;\s*charset\s*=\s*"?([^";,\s]+)/i.exec(v ?? "")?.[1]?.toLowerCase();
/** with a key, an accept is its media types alone: a parameter (a charset, a q, a server's own format=) could ask for the
 *  answer spelled another way */
const bareAccept = (v: string) => v.split(",").map((t) => t.split(";")[0].trim()).filter((t) => /^[\w.+*-]+\/[\w.+*-]+$/.test(t)).join(", ");
/** and a content-type it sends is its media type in utf-8 (a multipart body keeps its boundary, which spells nothing):
 *  a server may answer in the charset it was written to in */
function utf8Type(v: string) {
  const [type, ...params] = v.split(";").map((p) => p.trim());
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(type)) return null;
  const boundary = params.find((p) => /^boundary=/i.test(p));
  return [type, ...(boundary ? [boundary] : []), "charset=utf-8"].join("; ");
}
/** check a fetch against the record (pure): https to a declared host, a key declared */
export function fetchRefusal(cols: Columns, a: FetchAsk): { why: string } | { url: URL; method: string; headers: Record<string, string>; body: string | null; key: string | null; keyAs: string } {
  let url: URL;
  try { url = new URL(a.url); } catch { return { why: `${a.url} is not a web address` }; }
  if (url.protocol !== "https:") return { why: "fetch goes by https only" };
  const n = cols.needs, port = url.port ? Number(url.port) : 443;
  if (!declared(n?.domains ?? [], url.hostname, port)) return { why: `${url.host} is not among the domains its record declares (${n?.domains.join(", ") || "none"})` };
  const o = (a.opts && typeof a.opts === "object" ? a.opts : {}) as Record<string, unknown>;
  const odd = Object.keys(o).find((k) => !["method", "headers", "body", "key", "keyAs"].includes(k));
  if (odd) return { why: `fetch takes method, headers, body, key and keyAs, not ${odd}` };
  const method = typeof o.method === "string" ? o.method.toUpperCase() : "GET";
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method)) return { why: `${method} is not a method fetch sends` };
  const headers: Record<string, string> = {};
  if (o.headers !== undefined) {
    if (!o.headers || typeof o.headers !== "object" || Array.isArray(o.headers)) return { why: "headers is not an object of name: value" };
    for (const [k, v] of Object.entries(o.headers)) {
      if (typeof v !== "string") return { why: `the header ${k} is not text` };
      if (ENGINE_HEADERS.test(k.toLowerCase())) return { why: `the header ${k} is the engine's to send` };
      headers[k.toLowerCase()] = v;
    }
  }
  if (o.body !== undefined && typeof o.body !== "string") return { why: "body is not text" };
  let key: string | null = null;
  if (o.key !== undefined) {
    if (typeof o.key !== "string" || !n?.keys.includes(o.key)) return { why: `the key ${String(o.key)} is not among the keys its record declares (${n?.keys.join(", ") || "none"})` };
    key = o.key;
  }
  const keyAs = typeof o.keyAs === "string" ? o.keyAs : "bearer";
  if (!/^(bearer|token|[A-Za-z][A-Za-z0-9-]{0,63})$/.test(keyAs)) return { why: `${keyAs} is not where a key goes (bearer, token, or a header's name)` };
  if (ENGINE_HEADERS.test(keyAs.toLowerCase()) || KEY_HEADERS.test(keyAs.toLowerCase())) return { why: `a key does not go as ${keyAs}: it is the engine's to send` };
  const hides = key ? Object.keys(headers).find((h) => !KEY_SAFE.test(h)) : undefined;
  if (hides) return { why: `the header ${hides} is not sent with a key: the answer could come back where the key cannot be cut out of it` };
  for (const h of key ? ["accept", "content-type"] : []) {
    const spelled = charsetOf(headers[h]);
    if (spelled && !KEY_CHARSET.test(spelled)) return { why: `${h} names charset ${spelled}, which is not sent with a key: the key could not be cut out of the answer` };
  }
  return { url, method, headers, body: (o.body as string | undefined) ?? null, key, keyAs };
}

/** what a request sends and what comes back, before the key is cut out and before the cap: the body read up to `max`
 *  bytes, and `cut` when more came after them */
export type Sent = { status: number; headers: Record<string, string>; body: Buffer | string; cut?: boolean };
export type Send = (url: URL, o: { method: string; headers: Record<string, string>; body: string | null; signal: AbortSignal; max: number }) => Promise<Sent>;
/** the codings the engine reads an answer out of itself, as fetch did, so what the block gets is plain bytes and the key
 *  can be looked for in it */
// zstd only where this Node has it (22.15 on): imported by name, an older Node would stop at start, frame on or off
const zstd = (zlib as { createZstdDecompress?: () => Transform }).createZstdDecompress;
const DECODE: Record<string, () => Transform> = { gzip: createGunzip, "x-gzip": createGunzip, deflate: createInflate, br: createBrotliDecompress, ...(zstd ? { zstd } : {}) };
/** whether an answer's body comes out of the sender as plain bytes: no coding, identity, or one it reads (above) */
export const plainCoding = (coding: string | undefined) => { const c = (coding ?? "").trim().toLowerCase(); return c === "" || c === "identity" || Object.hasOwn(DECODE, c); };
/** how the engine sends a room's request: node's https, a connection of its own each time and no pool, so a request that
 *  ends (its time is up, its block unloaded) takes its connection with it. Node's fetch kept its connections in one pool
 *  for the whole engine, where a request ended in its TLS handshake (a host that takes the connection and never answers)
 *  stayed open for good (step 0b, tried 2026-11-10: 40 s on, still open). Up to `max` is read, then it stops: a huge
 *  answer is never held whole in the engine (fetchFor cuts it at OUT_MAX). It says who it is and takes any answer, as fetch did (GitHub refuses a
 *  request with no user-agent).
 *  Where it goes is the checked address's alone: a host, framing or proxy header from the block is dropped (fetchRefusal
 *  refuses them first) and the TLS name is the address's host, so the request cannot reach another name on the same
 *  server. It asks for no coding, and an answer coded anyway in a coding it knows is read out before the cap and before
 *  the key is cut out (fetchFor), as fetch did. `ca` is a test's own certificate */
export const httpsSend = (ca?: string): Send => (url, o) => new Promise((ok, no) => {
  const own = Object.fromEntries(Object.entries(o.headers).filter(([k]) => !ENGINE_HEADERS.test(k.toLowerCase())));
  const headers: Record<string, string> = { accept: "*/*", "user-agent": "sol", "accept-encoding": "identity", ...own };
  if (o.body !== null) { headers["content-type"] ??= "text/plain;charset=UTF-8"; headers["content-length"] = String(Buffer.byteLength(o.body)); }
  const name = url.hostname.replace(/^\[|\]$/g, "");
  let settled = false, drop = () => {};
  // ended by its signal: said with the signal's reason (its time was up, its block went), not as a bare abort
  const fail = (e: unknown) => { if (settled) return; settled = true; drop(); no(o.signal.aborted && o.signal.reason !== undefined ? o.signal.reason : e); };
  const req = httpsRequest(url, { method: o.method, headers, agent: false, signal: o.signal, servername: isIP(name) ? undefined : name, ...(ca ? { ca } : {}) }, (res) => {
    const parts: Buffer[] = [];
    let got = 0, cut = false, dec: Transform | null = null;
    const coding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
    drop = () => { res.destroy(); dec?.destroy(); };
    const done = () => {
      if (settled) return;
      settled = true;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) out[k] = Array.isArray(v) ? v.join(", ") : v;
      ok({ status: res.statusCode ?? 0, headers: out, body: Buffer.concat(parts), cut });
    };
    const take = (b: Buffer) => {
      if (cut || settled) return;
      if (got + b.length > o.max) { parts.push(b.subarray(0, o.max - got)); cut = true; done(); drop(); return; }
      parts.push(b);
      got += b.length;
    };
    // the decoder is made at the first byte: an empty body (a HEAD, a 204) is no coded stream to read
    res.on("data", (b: Buffer) => {
      if (!dec && Object.hasOwn(DECODE, coding)) { dec = DECODE[coding](); dec.on("data", take); dec.on("end", done); dec.on("error", fail); }
      if (dec) dec.write(b); else take(b);
    });
    res.on("end", () => { if (dec) dec.end(); else done(); });
    res.on("error", fail);
  });
  req.on("error", fail);
  req.end(o.body ?? undefined);
});
const sendHttps = httpsSend();
let send: Send = sendHttps;
/** a test's own sender (null: the engine's again) */
export const useSend = (f: Send | null) => { send = f ?? sendHttps; };

/** send it from the engine, no redirect followed (a redirect comes back as it is, to be fetched again if declared); ended
 *  at ms, or when `stop` is said (its block unloaded) */
export async function fetchFor(f: { url: URL; method: string; headers: Record<string, string>; body: string | null; keyAs: string }, key: string | null, ms: number, stop?: AbortSignal): Promise<FetchOk> {
  // with a key, only the headers that cannot change how the answer is spelled go (fetchRefusal refuses the rest first),
  // and the answer is asked for plain, whatever the block said
  // and in utf-8, whatever the block's accept and content-type said: an accept is its media types alone, a content-type
  // is forced to charset=utf-8
  const headers = key ? Object.fromEntries(Object.entries(f.headers).map(([k, v]) => [k.toLowerCase(), v]).filter(([k]) => KEY_SAFE.test(k))) : { ...f.headers };
  if (key) {
    if (headers.accept !== undefined) { const a = bareAccept(headers.accept); if (a) headers.accept = a; else delete headers.accept; }
    if (headers["content-type"] !== undefined) { const t = utf8Type(headers["content-type"]); if (t) headers["content-type"] = t; else delete headers["content-type"]; }
    headers["accept-encoding"] = "identity";
    if (f.keyAs === "bearer") headers.authorization = `Bearer ${key}`;
    else if (f.keyAs === "token") headers.authorization = `token ${key}`;
    else headers[f.keyAs.toLowerCase()] = key;
  }
  // ended at ms or when its block goes, whichever is first; the timer is the engine's own and goes with the request
  // (AbortSignal.timeout's would stay until ms, after the request and its block are gone)
  const end = new AbortController(), ended = () => end.abort(stop?.reason);
  const timer = setTimeout(() => end.abort(new DOMException(`the request did not finish within ${ms} ms`, "TimeoutError")), ms);
  if (stop?.aborted) ended(); else stop?.addEventListener("abort", ended, { once: true });
  let r: Sent;
  // a key's length past the cap is read too, so a key the cut goes through is seen whole (below)
  const keyBytes = key ? Buffer.from(key, "utf8") : null;
  try { r = await send(f.url, { method: f.method, headers, body: f.body, signal: end.signal, max: OUT_MAX + (keyBytes?.length ?? 0) }); }
  finally { clearTimeout(timer); stop?.removeEventListener("abort", ended); }
  // with a key on it, an answer in a coding the engine cannot read is not handed on: the key could be in it, unfound
  const raw = typeof r.body === "string" ? Buffer.from(r.body, "utf8") : r.body;
  if (key && raw.length && !plainCoding(r.headers["content-encoding"])) throw new Error(`the answer came coded as ${r.headers["content-encoding"]}, which the engine cannot read to cut the key out of it`);
  // nor one that names another charset: the key spelled in utf-16 is not the key's bytes
  const charset = charsetOf(r.headers["content-type"]);
  if (key && raw.length && charset && !KEY_CHARSET.test(charset)) throw new Error(`the answer came in ${charset}, which the engine cannot read to cut the key out of it`);
  // cut at OUT_MAX, and where a key the cut would go through starts, if one does: its start is not left behind. Every key
  // that starts before the cut ends inside what was read (a key's length more), so it is found
  const cut = !!r.cut || raw.length > OUT_MAX;
  let at = Math.min(raw.length, OUT_MAX);
  if (cut && keyBytes) { const i = raw.indexOf(keyBytes, Math.max(0, at - keyBytes.length + 1)); if (i >= 0 && i < at) at = i; }
  const kept = raw.subarray(0, at);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) out[k] = redact(v, key);
  return { status: r.status, headers: out, body: redact(key ? keyedText(kept, cut) : kept.toString("utf8"), key) + (cut ? `\n[cut at ${OUT_MAX} bytes]` : "") };
}

/** a keyed answer is the key's own spelling or nothing: whatever the request asked, the server (or a path or query the
 *  block chose) may answer in another, and a label is only the server's word. So the bytes themselves are read: no byte
 *  order mark, no NUL (ascii in utf-16 or utf-32 is NULs between valid utf-8, and the key between them is not found), and
 *  strict utf-8, else an error and no body. A character the 8 MB cut goes through is left out, not an error */
function keyedText(b: Buffer, cut: boolean) {
  const no = (what: string) => new Error(`the answer ${what}, so the engine cannot be sure to cut the key out of it`);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) throw no("starts with a byte order mark");
  if (b.includes(0)) throw no("has a NUL byte in it (text spelled in utf-16 or utf-32)");
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(b, { stream: cut }); }
  catch { throw no("is not utf-8"); }
}

/** whether a big room can be made on this machine at all, else why not */
export function bigRoomHere(sandbox = SANDBOX): string | null {
  if (platform() !== "darwin") return "the big room runs on a Mac only (macOS's sandbox); isolation elsewhere is not built";
  if (!existsSync(sandbox)) return `its sandbox would not start: ${sandbox} is not on this Mac`;
  return null;
}
