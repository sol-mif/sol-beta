// Open it for the person (#1521, src/openfor.ts): the seat's open_settings and open_pane are told to every face.
import type { Parts } from "../parts.js";
import { setOpenForFaces } from "../openfor.js";
import { setPlaceFaces } from "../homeplaces.js";   // Home's place tools (#1662): Home reads the record again

export default function (p: Parts) {
  p.atStart((e) => { setOpenForFaces(e.everyone); setPlaceFaces(e.everyone); });
}
