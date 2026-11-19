// A page opened from Cowork (#1416): the shell hands its parts one opener, so a row that names an issue or a change
// opens it in the app, as a layer of the place with the crumbs back (place.open), never out of the window. Outside the
// shell (the old Cowork, a dev page) the opener is the person's browser, as before.
import { createContext, useContext } from "react";
import { openUrl } from "../util";

/** open a page: its address, and the words its crumb says */
export type Opener = (url: string, label: string) => void;
export const OutContext = createContext<Opener>((url) => openUrl(url));
export const useOut = (): Opener => useContext(OutContext);
/** a crumb's words for a page: short enough for the bar */
export const outLabel = (words: string, n = 40) => { const t = words.trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
/** a block id for the page's web view, the same for the same address (letters and digits only) */
export const viewId = (url: string) => { let x = 5381; for (let i = 0; i < url.length; i++) x = ((x << 5) + x + url.charCodeAt(i)) | 0; return `cowork-out-${(x >>> 0).toString(36)}`; };
