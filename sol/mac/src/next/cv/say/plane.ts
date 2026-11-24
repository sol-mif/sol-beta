// owned by slice 1 (Plane), docs/port/slices.md
// The plane's phrases for the talk pill (engine.js say: "closer", "further"), and the plane's own moves by name: today's
// page, a side, a new folder, pause, resume and stop a run. Tried before the shared ones (say/index.ts).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, M, done, type Phrase } from "../core.ts";
import { ZSTEP, titleOf } from "../../plane/layout.ts";
import { archive, askHolder } from "../../holders/model.ts";   // holders.html (#1615): Archive, and a holder from the person's words

/** a folder by the name the person says (case and a leading "the" aside) */
const byName = (s: string) => { const n = s.trim().toLowerCase().replace(/^the /, ""); return D.regions.find((r) => String(r.name).toLowerCase() === n)?.id ?? null; };
/** a session by its task as the person reads it on its card */
const sessionByName = (s: string) => { const n = s.trim().toLowerCase().replace(/^the (?:session )?/, ""); return Object.values(D.pieces).find((p) => p.kind === "session" && titleOf(p).toLowerCase() === n)?.id ?? null; };

const phrases: Phrase[] = [
  { hears: /^(?:closer|zoom closer)$/, run: () => M.zoom(ZSTEP) },
  { hears: /^(?:further|zoom further)$/, run: () => M.zoom(1 / ZSTEP) },
  { hears: /^(?:to )?(?:the diary|today's page|today’s page)$/, run: () => M.toDiary() },
  { hears: /^pan (?:to )?(?:the )?(left|right)$/, run: (m) => M.toEdge(m[1]) },
  { hears: /^new folder (.+?)(?: for (sessions|stickies))?$/, run: (m) => M.newFolder(m[1], m[2]) },
  // BR1 words (#1615): the ask bar's two examples, the person's own folders by name. "open <folder>" opens its page, as
  // its row and its card do; "archive <folder or session>" is the ⋯ menu's own word (holders.html: the Shelf's old
  // "put … on the shelf" still heard). A name nothing has falls through (near's "open <part>", settings' "open settings")
  { hears: /^open (?:the folder )?(.+)$/, run: (m) => { const a = byName(m[1]); return a ? M.folder_open(a) : null; } },
  { hears: /^archive (?:the folder )?(.+)$/, run: (m) => { const a = byName(m[1]); if (a) return M.offCanvas(a); const s = sessionByName(m[1]); return s ? done(archive(s), s) : null; } },
  { hears: /^put (?:the folder )?(.+?) on the shelf$/, run: (m) => { const a = byName(m[1]); return a ? M.offCanvas(a) : null; } },
  // holders.html: "keep every client preview link in one place" makes a holder, marked ✦ until touched
  { hears: /^(?:please )?(?:keep|gather|collect) (?:all |every |each )?.+ (?:in one place|together)$/, run: (_m, words) => { const a = askHolder(words); return a ? done(true, a.id) : null; } },
  // BR1, folders in folders: by the folders' names, as the person sees them
  { hears: /^put (?:the folder )?(.+?) in(?:to|side)? (?:the folder )?(.+)$/, run: (m) => { const a = byName(m[1]), b = byName(m[2]); return a && b ? M.nest(a, b) : null; } },
  { hears: /^take (?:the folder )?(.+?) out(?: to the canvas)?$/, run: (m) => { const a = byName(m[1]); return a ? M.nest(a, null) : null; } },
  { hears: /^(pause|resume|stop) (.+)$/, run: (m) => M[m[1]](m[2]) },
];
export default phrases;
