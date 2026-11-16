// The home's files over HTTP (moved from index.ts, #934): GET /file?path= (only inside home/, files.ts), GET /pane-image?path=
// (an image the file pane opened), GET /pane-asset/<folder>/<rel> (a page's own files, for the page pane, #54, work/page.ts)
import type { Parts } from "../parts.js";
import { serveFile, servePaneImage } from "../files.js";
import { servePaneAsset } from "../work/page.js";

export default function (p: Parts) {
  p.route("GET", "/file", ({ HOME, req, res }) => serveFile(HOME, req, res));
  p.route("GET", "/pane-image", ({ req, res }) => servePaneImage(req, res));
  p.route("GET", /^\/pane-asset\//, ({ req, res }) => servePaneAsset(req, res));   // a page's own files, the page pane (#54)
}
