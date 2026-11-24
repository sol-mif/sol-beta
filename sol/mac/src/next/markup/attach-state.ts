// The attach menu's four entries, as moves (BR1, #1615; HANDOFF-P2 3c): Mark up turns Mark up on; Screenshot of the
// app takes the Sol window's shot and pins on it (each press after it is a mark on the thing under it, by Mark up's hit
// test, never a point); Photo and File put a picked file in the message. Live, the engine keeps each where the session
// can open it (next.attach.put / next.attach.shot, engine next/attach.ts) and the message says its path; on the fixture
// the name alone. Every entry ends in Mark up's card, which holds the message and Send. Signed: marcocyl04-ux's agent
// (builder P), BR1 (#1615).
import { MODE } from "../cv/core.ts";
import { engine } from "../cv/wire/near.ts";
import { said } from "../bar/undo.ts";
import { attach, markUp, type Att } from "./model.ts";

/** keys: what starts it from anywhere, said beside its name */
export type Entry = { id: "markup" | "shot" | "photo" | "file"; label: string; keys?: string };
export const ENTRIES: readonly Entry[] = [
  { id: "markup", label: "Mark things on screen", keys: "⇧⌘M" },
  { id: "shot", label: "Screenshot of the app" },
  { id: "photo", label: "Photo" },
  { id: "file", label: "File" },
];

type Kept = { type?: string; rid?: string; ok?: boolean; path?: string; name?: string; url?: string; why?: string; perm?: boolean };
/** what a refused screenshot says: never silent; refused for Screen Recording, how to turn it on */
export const NO_SHOT_PERM = "No screenshot: Sol needs Screen Recording. Turn it on in System Settings › Privacy & Security › Screen Recording, then try again.";
export const shotRefused = (r: Kept | null): string =>
  r?.perm ? NO_SHOT_PERM : r?.why ? `No screenshot: ${r.why.replace(/^no screenshot: /, "")}` : "Sol’s engine is away, so no screenshot was taken";
let n = 0;
const idOf = (k: string) => `${k}-${Date.now().toString(36)}-${(n++).toString(36)}`;

/** one ask of the engine, answered on next.attach by its rid; null when the engine is away or slow */
function ask(body: Record<string, unknown>, ms: number): Promise<Kept | null> {
  const e = engine();
  if (!e) return Promise.resolve(null);
  const rid = idOf("at");
  return new Promise((res) => {
    const t = setTimeout(() => { off(); res(null); }, ms);
    const off = e.subscribe((m: Kept) => { if (m?.type === "next.attach" && m.rid === rid) { clearTimeout(t); off(); res(m); } });
    if (!e.send({ ...body, rid })) { clearTimeout(t); off(); res(null); }
  });
}

/** the window's shot as the engine kept it, for Mark up's stills of each marked thing (model.ts) */
export const askShot = (ms = 15_000) => ask({ type: "next.attach.shot" }, ms);

/** Screenshot of the app: the window's shot in the message, and Mark up pins on it */
export async function shoot(ms = 15_000): Promise<Att | null> {
  if (MODE !== "live") { const a: Att = { id: idOf("shot"), kind: "shot", name: "Screenshot of the app", path: null, url: null }; attach(a); return a; }
  const r = await ask({ type: "next.attach.shot" }, ms);
  if (!r?.ok || !r.path) { said(shotRefused(r), null); return null; }
  const a: Att = { id: idOf("shot"), kind: "shot", name: "Screenshot of the app", path: r.path, url: r.url ?? null };
  attach(a);
  return a;
}

const base64Of = (f: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => no(r.error);
  r.readAsDataURL(f);
});

/** Photo or File: each picked file kept by the engine and put in the message */
export async function put(kind: "photo" | "file", files: readonly File[], ms = 30_000): Promise<Att[]> {
  const out: Att[] = [];
  for (const f of files) {
    const url = kind === "photo" && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(f) : null;
    let path: string | null = null;
    if (MODE === "live") {
      const r = await ask({ type: "next.attach.put", kind, name: f.name, data: await base64Of(f) }, ms);
      if (!r?.ok || !r.path) { said(`“${f.name}” was not attached: ${r?.why ?? "Sol’s engine is away"}`, null); continue; }
      path = r.path;
    }
    const a: Att = { id: idOf(kind), kind, name: f.name, path, url };
    attach(a); out.push(a);
  }
  return out;
}

/** a menu entry pressed; Photo and File open the picker (pick), which calls put */
export function run(id: Entry["id"], pick: (kind: "photo" | "file") => void): void {
  if (id === "markup") markUp(true);
  else if (id === "shot") void shoot();
  else pick(id);
}
