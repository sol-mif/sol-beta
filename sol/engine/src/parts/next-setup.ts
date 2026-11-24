// Every folder has a setup, and its agent keeps it organized (BR1 item 2, #1615; next/setup.ts, sol/PROTOCOL.md
// "next.folder.setup"). Behind ui.next, from Sol's own windows only (NOT_OWN), one change at a time:
//   next.folder.setup      { folder }                       → next.folder.setup { setup }
//   next.folder.setups     {}                               → next.folder.setups { setups }
//   next.folder.setup.set  { folder, field, take, by? }     → next.folder.setup.set { preview: { changes, token } };
//                          { folder, token, keep|back }     → { kept | back, setup }, and every window hears next.folder.setups
//   next.folder.setup.keep { folder }                       → next.folder.setup { setup }: set up as it stands
//   next.folder.sort       { folder }                       → next.folder.sorted { run } (the person pressed Sort)
//   next.folder.sort.back  { run, move? }                   → next.folder.sorted { run, refused }
//   next.folder.setup.drop { folder, line }                 → next.folder.setup { setup }: a read line taken out (×)
// A folder's parts (BR1 item 6, next/look.ts): what Sol saw in a folder, a part per fact, ranked by the person's presses:
//   next.folder.look       { folder } | { folders }          → next.folder.look { looks: { <folder>: Look } }
//   next.folder.press      { folder, part }                  → next.folder.look { looks } (that folder's)
//   next.folder.part.hide  { folder, part, reach?, to?, folders? } → next.folder.look { looks, fix, same }
//   next.folder.part.back  { folder, part }                  → next.folder.look { looks, fix }
// The agent's pass: every SORT_MS while ui.next is on, each folder set up gets sortRun; a run with moves is told to every
// window (next.folder.sorted), with the notes, the folders' sessions and the day's Diary, since its line is there.
// Signed: marcocyl04-ux's agent, BR1 item 2 (#1615).
import { homedir } from "node:os";
import type { Engine, Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { dayOf, diaryMsg } from "../next/diary.js";
import { foldersMsg } from "../next/folders.js";
import { notesMsg } from "../next/notes.js";
import * as look from "../next/look.js";
import * as setup from "../next/setup.js";
import { recordHomeOf, type Where } from "../next/you.js";
import { NOT_OWN } from "./next.js";

export const SORT_MS = 20_000;

export default function (p: Parts) {
  let line: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T> | T): Promise<T> => { const r = line.then(f, f); line = r.catch(() => {}); return r; };
  const where = (sol: string): Where => { const user = process.env.HOME || homedir(); return { sol, user, rec: recordHomeOf(sol, user) }; };
  const own = (type: string, f: (m: any, h: Heard) => unknown, reply = type) => p.on(type, (m, h) => {
    if (!uiNext()) return undefined;
    const rid = m?.rid !== undefined ? { rid: m.rid } : {};
    if (!h.fromSol) return h.send(h.ws, { type: reply, ...rid, ok: false, why: NOT_OWN });
    return serial(() => {
      const out = f(m ?? {}, h) as Record<string, unknown> | undefined;
      if (out) h.send(h.ws, { type: reply, ...rid, ...out });
    });
  });
  const tellSetups = (e: Engine) => e.everyone({ type: "next.folder.setups", ok: true, setups: setup.setupsOf(e.HOME) });
  const tellSorted = (e: Engine, run: setup.Run, refused?: unknown) => {
    e.everyone({ type: "next.folder.sorted", ok: true, run, ...(refused ? { refused } : {}) });
    e.everyone(notesMsg(e.HOME));
    e.everyone(foldersMsg(e.HOME));
    e.everyone(diaryMsg(e.HOME, dayOf(new Date())));
  };

  own("next.folder.setup", (m, h) => (typeof m.folder === "string" && m.folder ? { ok: true, setup: setup.setupOf(h.HOME, m.folder) } : { ok: false, why: "that is not a folder" }));
  own("next.folder.setups", (_m, h) => ({ ok: true, setups: setup.setupsOf(h.HOME) }));
  own("next.folder.setup.set", (m, h) => {
    const r = setup.setField(where(h.HOME), m);
    if (r.ok && typeof m.token === "string") tellSetups(h);
    return r;
  });
  own("next.folder.setup.keep", (m, h) => { const r = setup.keepSetup(h.HOME, m); if (r.ok) tellSetups(h); return r; }, "next.folder.setup");
  own("next.folder.setup.drop", (m, h) => { const r = setup.dropLine(h.HOME, m); if (r.ok) tellSetups(h); return r; }, "next.folder.setup");
  own("next.folder.sort", (m, h) => {
    const r = setup.sortRun(h.HOME, m.folder, "person");
    if (!r.ok) return r;
    if (r.run) tellSorted(h, r.run);
    return { ok: true, run: r.run, ...(r.run ? {} : { says: "Nothing new to sort here." }) };
  }, "next.folder.sorted");
  own("next.folder.sort.back", (m, h) => {
    const r = setup.sortBack(h.HOME, m);
    if (!r.ok) return r;
    tellSorted(h, r.run, r.refused);
    return undefined;
  }, "next.folder.sorted");

  const one = (folder: string, r: { ok: true; look: look.Look } & Record<string, unknown>) => { const { look: l, ok: _ok, ...rest } = r; return { ok: true, looks: { [folder]: l }, ...rest }; };
  own("next.folder.look", (m, h) => {
    const folders = Array.isArray(m.folders) ? m.folders : typeof m.folder === "string" ? [m.folder] : [];
    if (!folders.length) return { ok: false, why: "folder is the folder, or folders the folders, to look at" };
    return { ok: true, looks: look.looksOf(h.HOME, folders) };
  });
  own("next.folder.press", (m, h) => { const r = look.pressPart(h.HOME, m); return r.ok ? one(m.folder, r) : r; }, "next.folder.look");
  own("next.folder.part.hide", (m, h) => { const r = look.hidePart(where(h.HOME), m); return r.ok ? one(m.folder, r) : r; }, "next.folder.look");
  own("next.folder.part.back", (m, h) => { const r = look.backPart(where(h.HOME), m); return r.ok ? one(m.folder, r) : r; }, "next.folder.look");

  p.atStart((e) => {
    const t = setInterval(() => {
      if (!uiNext()) return;
      void serial(() => {
        for (const f of setup.sortingFolders(e.HOME)) {
          const r = setup.sortRun(e.HOME, f, "sol");
          if (r.ok && r.run) tellSorted(e, r.run);
        }
      }).catch(() => {});
    }, SORT_MS);
    t.unref();
  });
}
