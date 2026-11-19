// owned by slice 1 (Plane), docs/port/slices.md
// The plane's phrases for the talk pill (engine.js say: "closer", "further"), and the plane's own moves by name: today's
// page, a zone, a new folder, pause, resume and stop a run. Tried before the shared ones (say/index.ts).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { M, type Phrase } from "../core.ts";
import { ZSTEP } from "../../plane/layout.ts";

const phrases: Phrase[] = [
  { hears: /^(?:closer|zoom closer)$/, run: () => M.zoom(ZSTEP) },
  { hears: /^(?:further|zoom further)$/, run: () => M.zoom(1 / ZSTEP) },
  { hears: /^(?:to )?(?:the diary|today's page|today’s page)$/, run: () => M.toDiary() },
  { hears: /^(?:to )?(?:the )?(build|life) zone$/, run: (m) => M.toZone(m[1]) },
  { hears: /^new folder (.+?)(?: for (sessions|stickies))?$/, run: (m) => M.newFolder(m[1], m[2]) },
  { hears: /^(pause|resume|stop) (.+)$/, run: (m) => M[m[1]](m[2]) },
];
export default phrases;
