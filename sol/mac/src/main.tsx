import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { Site, Tape } from "./Site";
import { start } from "./renovation";
import "./hot";
import "./face.css";

// the app itself is loaded after the fence has mounted: a cold load with a broken edit in it shows the boundary, not a blank page (#16 blocker 5)
const App = lazy(() => import("./App"));

// The face belongs to the main window, Work's pop-outs (work-*, Split.tsx popOut) and the stage's popped blocks (pop-*,
// stage/pop.ts, #701). Any other window of Sol.app that
// lands on this page got it from Tauri's fallback: a page missing from the build (sol/mac/vite.config.ts
// build.rollupOptions.input) is answered with index.html. Drawn there it would be a second Sol: a screen-sized glow
// window above everything wore the whole face from 2026-10-26 to 10-29. Here it stays blank and says why.
const label = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
const wrongWindow = typeof label === "string" && label !== "main" && !label.startsWith("work-") && !label.startsWith("pop-");
if (wrongWindow) {
  console.error(`the face was loaded in the window "${label}", which asked for another page: that page is not in this build (sol/mac/vite.config.ts build.rollupOptions.input)`);
} else {
// the face is wrapped whole (a part that is not one of the named sites still never blanks the window) and the tape
// sits over it, outside it, so it lives on whatever breaks under it (Site.tsx, issue #15)
// the press animation comes from a seat-editable file: loaded after the mount, so a broken edit there cannot stop the page
void import("./motion").then((m) => m.installPress()).catch(() => {});
start();
document.documentElement.dataset.face = "";   // this page is the face: it alone draws the glass (face.css)
if ("__TAURI_INTERNALS__" in window) document.documentElement.dataset.app = "";
// #891: behind either run switch, the window and its words are the readable set (face.css [data-whole], tokens.json shade.read)
// loaded the way motion is above: the boot's own imports stay inside the fence (engine test/fence.test.ts), so a seat's
// edit to the switches can never stop the window from starting
void import("./flag").then(({ anyWhole, subWhole }) => { const mark = () => document.documentElement.toggleAttribute("data-whole", anyWhole()); mark(); subWhole(mark); }).catch(() => {});
import("./look").then((l) => l.applyKeptLook()).catch(() => {});
// a thing's page is native, over the face (cowork/thingView.ts): a face that loads again (a reload, a new face) never
// finds one left on screen from the page before; the main window's only, a pop-out has none
if ("__TAURI_INTERNALS__" in window) void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => { if (getCurrentWindow().label === "main") await (await import("./cowork/thingView")).shell.close(); }).catch(() => {});   // the kept look, before the engine answers; never over the engine's
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Site name="face"><Suspense fallback={null}><App /></Suspense></Site>
    <Tape />
  </React.StrictMode>,
);
}
