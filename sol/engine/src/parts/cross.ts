// Home and Build, one place (#1031, src/cross.ts): the crossings by hand, over the socket. Every change is told to every
// face as cross.state; a refusal only to the face that asked, with its line.
//   cross.get                                     -> cross.state { crossings }
//   cross.carry { thing, sessionId, at? }         a Home thing put down on Build's stage: composed there as the person's
//                                                 own block (a page with the folder's facts; a browser for a source with
//                                                 an address), then kept as carried
//   cross.seat { block, sessionId, place }        a stage block put down on a Home folder: kept as seated
//   cross.seat { session: true, sessionId, title, place }   #1045: a whole session of Build's side put down on a folder:
//                                                 kept as seated, its kind "session" (block = the session's id)
//   cross.say { text }                            -> cross.said { patch, moved }: the look's rows a sentence names, unset
//   cross.undo { id }                             a crossing taken back; a carried block is closed with it
import type { Parts, Heard } from "../parts.js";
import { CrossBook, crossFile, cleanThing, carriedBody, lookFromWords } from "../cross.js";
import { getSettings } from "../settings.js";
import * as stage from "../work/blocks.js";
import * as live from "../work/live.js";

let book: CrossBook | null = null;
const at = (a: any) => (a && typeof a === "object" && ["x", "y", "w", "h"].every((k) => Number.isFinite(a[k])) ? { at: { x: a.x, y: a.y, w: a.w, h: a.h, hand: true } } : {});

export default function (p: Parts) {
  p.atStart((e) => { book = new CrossBook(crossFile(e.HOME)); });
  const told = (h: Heard) => h.everyone({ type: "cross.state", ...book!.state() });
  const no = (h: Heard, m: any, why: string) => h.send(h.ws, { type: "cross.state", rid: m.rid, ...book!.state(), refused: why });
  p.on("cross.get", (m, h) => h.send(h.ws, { type: "cross.state", rid: m.rid, ...book!.state() }));
  p.on("cross.carry", async (m, h) => {
    const t = cleanThing(m.thing);
    if (!t) return no(h, m, "nothing to carry: a thing needs its words and its folder");
    try {
      const who = await stage.whoFor(String(m.sessionId ?? ""));
      const me = { ...who, by: who.by.replace(/'s agent/, "") };
      const b = t.url
        ? live.composeBrowser(me, { url: t.url, title: t.words, hand: "you", person: true, ...at(m.at) })
        : stage.compose(me, { kind: "page", title: t.words, body: carriedBody(t), format: "md", person: true, ...at(m.at) });
      const c = book!.carried(t, b.id, who.sessionId);
      h.send(h.ws, { type: "cross.carried", rid: m.rid, crossing: c, block: b });
      told(h);
    } catch (e) { no(h, m, e instanceof Error ? e.message : String(e)); }
  });
  p.on("cross.seat", async (m, h) => {
    try {
      const who = await stage.whoFor(String(m.sessionId ?? ""));
      if (m.session === true) {
        const place = String(m.place ?? "").trim();
        if (!place) return no(h, m, "which folder?");
        const s = book!.seat({ block: who.sessionId, session: who.sessionId, place, title: String(m.title ?? "").trim() || "a session", blockKind: "session" });
        h.send(h.ws, { type: "cross.seated", rid: m.rid, crossing: s });
        return told(h);
      }
      const b = stage.getBlock(who.project, String(m.block ?? ""));
      if (!b || b.state === "dead") return no(h, m, `no block "${m.block}" on this stage`);
      const place = String(m.place ?? "").trim();
      if (!place) return no(h, m, "which folder?");
      const s = book!.seat({ block: b.id, session: who.sessionId, place, title: b.title, blockKind: b.kind });
      h.send(h.ws, { type: "cross.seated", rid: m.rid, crossing: s });
      told(h);
    } catch (e) { no(h, m, e instanceof Error ? e.message : String(e)); }
  });
  // say it and Settings moves: a sentence read into the look's rows; nothing is set here, the face asks the person first
  p.on("cross.say", (m, h) => {
    const { patch, moved } = lookFromWords(String(m.text ?? "").slice(0, 400), getSettings().look);
    h.send(h.ws, { type: "cross.said", rid: m.rid, text: String(m.text ?? "").slice(0, 400), patch: Object.keys(patch).length ? { look: patch } : null, moved });
  });
  p.on("cross.undo", async (m, h) => {
    const c = book!.undo(String(m.id ?? ""));
    if (!c) return no(h, m, "that crossing is not there any more");
    if (c.kind === "carried") {
      try { const who = await stage.whoFor(c.session); stage.place({ ...who, by: who.by.replace(/'s agent/, "") }, { id: c.block, close: true }); } catch { /* the block was closed already */ }
    }
    told(h);
  });
}
