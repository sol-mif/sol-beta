// Running the explorer on the person's own machine (#1088): the
// face holds explore.mjs as text, writes it under ~/.sol/onboard (work.write), and a shell in the home (work.term.open)
// runs it with node. It writes ~/.sol/onboard/explore.json after every stop; the face reads that file while it runs, so
// each stop is drawn the moment it ends. Where Sol's home is (SOL_HOME, where folders live) is asked of the same shell.
// It is the one reader (#1217): the store reader (places/read.mjs) is written beside it; in Sol.app the stores macOS keeps
// closed to the engine are copied first with Sol's own Full Disk Access (places_copy, #1069) and read from the copy
// (--from), dropped after (reach.ts); the services connected in the person's Claude account, as the engine lists them,
// are written for it (--connected).
import EXPLORE from "./explore.mjs?raw";
import JEV from "./jev-ask.mjs?raw";
import READ from "./places/read.mjs?raw";
import { connectedServices, copyClosed, dropCopy } from "./reach";
import { serviceState } from "./connections";
import type { Explored } from "./sort";

type Ask = <T>(o: object, ms: number) => Promise<T | null>;
type Wire = { send: (o: object) => unknown; subscribe: (fn: (m: any) => void) => () => void };

export const OUT = ".sol/onboard/explore.json";

export async function readExplored(ask: Ask, out = OUT): Promise<Explored | null> {
  const r = await ask<{ text?: string }>({ type: "work.read", cwd: "~", path: out }, 6000);
  if (!r?.text) return null;
  try { return JSON.parse(r.text) as Explored; } catch { return null; }   // torn mid-write: the next read has it
}

/** run it; `onFile` hears the file each time it changed. Ends with the last file, or null when no shell opened here */
/** `said`: the stops were just chosen by the person in this run (the one onboarding), so `skip` alone says which stops are
 *  left out, not the record's `left` from an earlier run; the record's sources by name still hold */
export async function explore(ask: Ask, e: Wire, skip: string[], onFile: (x: Explored) => void, onHome: (solHome: string | null) => void, file = OUT, o: { said?: boolean } = {}): Promise<Explored | null> {
  const t = await ask<{ tid?: string; error?: string }>({ type: "work.term.open", cwd: "~", cols: 160, rows: 40 }, 8000);
  if (!t?.tid) return null;
  const tid = t.tid;
  let out = "", gone = false;
  const wake = new Set<() => void>();
  const off = e.subscribe((m: any) => {
    if (m?.tid !== tid) return;
    if (m.type === "work.term.out") out += String(m.data ?? "");
    else if (m.type === "work.term.exit") gone = true;
    else return;
    wake.forEach((f) => f());
  });
  const line = (cmd: string, mark: string, ms: number) => new Promise<string | null>((res) => {
    const from = out.length;
    const look = () => { const i = out.indexOf(mark, from); if (i >= 0) { const nl = out.indexOf("\n", i); done(out.slice(i + mark.length, nl < 0 ? undefined : nl).trim()); return true; } if (gone) { done(null); return true; } return false; };
    const tm = window.setTimeout(() => done(null), ms);
    const done = (v: string | null) => { window.clearTimeout(tm); wake.delete(f); res(v); };
    const f = () => void look();
    wake.add(f);
    e.send({ type: "work.term.in", tid, data: `${cmd}\n` });
  });
  let poll = 0, last = "", copy: string | null = null;
  try {
    const made = await line(`mkdir -p ~/.sol/onboard ~/.sol/record && echo SOL-$((40+2))-HOME=\${SOL_HOME:-none}`, "SOL-42-HOME=", 15000);
    if (made === null) return null;
    onHome(made && made !== "none" ? made : null);
    const w = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: ".sol/onboard/explore.mjs", text: EXPLORE }, 8000);
    if (!w?.ok) return null;
    await ask({ type: "work.write", cwd: "~", path: ".sol/onboard/read.mjs", text: READ }, 8000);
    await ask({ type: "work.write", cwd: "~", path: file, text: "" }, 6000);
    // the Claude account's connectors (the engine asks the account; null when it cannot say) and Sol's copy of the closed
    // stores, at once; neither is waited on past its own time
    const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p.catch(() => null), new Promise<null>((ok) => window.setTimeout(() => ok(null), ms))]);
    const [services, copied] = await Promise.all([within(connectedServices(ask), 4000), within(copyClosed(["calendar", "notes"]), 15000)]);
    copy = copied;
    let more = copy ? ` --from '${copy.replace(/'/g, `'\\''`)}'` : "";
    if (services) {
      const c = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: ".sol/onboard/connected.json", text: JSON.stringify(services.map((x) => ({ name: x.name, status: x.status, state: serviceState(x) }))) }, 6000);
      if (c?.ok) more += " --connected ~/.sol/onboard/connected.json";
    }
    poll = window.setInterval(async () => {
      const r = await ask<{ text?: string }>({ type: "work.read", cwd: "~", path: file }, 4000);
      if (!r?.text || r.text === last) return;
      last = r.text;
      try { onFile(JSON.parse(r.text)); } catch { /* torn */ }
    }, 350);
    const skipArg = `${skip.length ? ` --skip ${skip.join(",")}` : ""}${o.said ? " --stops-said" : ""}`;
    await line(`node ~/.sol/onboard/explore.mjs --out ~/${file}${skipArg}${more}; echo SOL-$((40+2))-END-$?`, "SOL-42-END-", 120000);
    const x = await readExplored(ask, file);
    if (x) onFile(x);
    return x;
  } finally {
    window.clearInterval(poll);
    void dropCopy(copy);
    off();
    e.send({ type: "work.term.in", tid, data: "exit\n" });
    e.send({ type: "work.term.close", tid });
  }
}

/** the record's folder and each place's folder under Sol's home, made by the engine (agent.mkdir, #1511, #1510): a
 *  careful person's record-only Home explores nothing but still needs a place to keep what they said, and a Sol with no
 *  terminal still gets its Home (work.write does not make folders). False: not made; the caller says so */
export async function makeRecordDir(ask: Ask, more: string[] = []): Promise<boolean> {
  const r = await ask<{ ok?: boolean }>({ type: "agent.mkdir", paths: ["~/.sol/record", "~/.sol/onboard", ...more] }, 8000);
  return !!r?.ok;
}
/** Sol's home as the engine has it, when no terminal could say $SOL_HOME; null when the engine did not answer */
export async function solHomeOf(ask: Ask): Promise<string | null> {
  const r = await ask<{ home?: string }>({ type: "agent.mkdir", paths: [] }, 8000);
  return typeof r?.home === "string" && r.home ? r.home : null;
}

/** Jev's picks, asked from the person's own machine (jev-ask.mjs: the key never reaches the face); null on any trouble */
export async function askJev(ask: Ask, e: Wire, body: object): Promise<{ answers: unknown; ms?: number; why?: string } | null> {
  const w1 = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: ".sol/onboard/jev-ask.mjs", text: JEV }, 6000);
  const w2 = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: ".sol/onboard/jev-in.json", text: JSON.stringify(body) }, 6000);
  if (!w1?.ok || !w2?.ok) return null;
  await ask({ type: "work.write", cwd: "~", path: ".sol/onboard/jev-out.json", text: "" }, 6000);
  const t = await ask<{ tid?: string }>({ type: "work.term.open", cwd: "~", cols: 120, rows: 10 }, 8000);
  if (!t?.tid) return null;
  e.send({ type: "work.term.in", tid: t.tid, data: "node ~/.sol/onboard/jev-ask.mjs --in ~/.sol/onboard/jev-in.json --out ~/.sol/onboard/jev-out.json; exit\n" });
  try {
    for (let i = 0; i < 30; i++) {   // 6 s at most: Jev's own 4 s and the shell's start
      await new Promise((r) => window.setTimeout(r, 200));
      const r = await ask<{ text?: string }>({ type: "work.read", cwd: "~", path: ".sol/onboard/jev-out.json" }, 3000);
      if (r?.text?.trim()) { try { return JSON.parse(r.text); } catch { return null; } }
    }
    return null;
  } finally { e.send({ type: "work.term.close", tid: t.tid }); }
}

/** one line in the person's own shell, then the shell is closed (a door's "open Calendar": open -a Calendar) */
export async function shellOnce(ask: Ask, e: Wire, line: string): Promise<boolean> {
  const t = await ask<{ tid?: string }>({ type: "work.term.open", cwd: "~", cols: 80, rows: 10 }, 8000);
  if (!t?.tid) return false;
  e.send({ type: "work.term.in", tid: t.tid, data: `${line}; exit\n` });
  await new Promise((r) => window.setTimeout(r, 900));
  e.send({ type: "work.term.close", tid: t.tid });
  return true;
}

/** one line in the person's own shell, answered by its real exit code: a mark file is written only when the line succeeds */
export async function shellOk(ask: Ask, e: Wire, line: string): Promise<boolean> {
  const mark = ".sol/onboard/door-ok";
  if (!(await shellOnce(ask, e, `mkdir -p ~/.sol/onboard; rm -f ~/${mark}; ( ${line} ) && echo ok > ~/${mark}`))) return false;
  const r = await ask<{ text?: string }>({ type: "work.read", cwd: "~", path: mark }, 6000);
  return /ok/.test(r?.text ?? "");
}
