// Open it for the person (#1521, src/openfor.ts): the seat's open_settings and open_pane are told to every face.
import type { Parts } from "../parts.js";
import { setOpenForFaces } from "../openfor.js";

export default function (p: Parts) {
  p.atStart((e) => setOpenForFaces(e.everyone));
}
