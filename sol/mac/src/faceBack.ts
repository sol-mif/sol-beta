// The face Sol fell back to says so (#1822). With the hot face on (src-tauri/src/hot.rs), the window shows the Sol
// folder's face through Vite, so an update changes the face too. When that Vite stops answering, the window goes back
// to the face this app was downloaded with, which may be older; until now only the old Settings drawer said so. This draws one line along the bottom of that page,
// what happened and what brings the folder's face back, and takes it away when the folder's face is back. Loaded by
// main.tsx on every page of the main window, today's face and the new one alike. Part of the fence.
export type Face = { hot: boolean; state: string } | null;

/** the line for a face state (pure): null when there is nothing to say */
export function backWords(f: Face): string | null {
  if (!f?.hot) return null;   // the person chose the bundled face, or nothing known
  if (f.state === "dev server down") return "Sol is showing the face this app came with: the face in your Sol folder did not start, so it may be older than your Sol. Sol keeps trying, and switches back by itself.";
  return null;
}

/** on the bundled page of the main window: ask the state once, then follow face-state */
export async function installFaceBack(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window) || location.protocol === "http:") return;   // the dev pages are the folder's face
  const [{ invoke }, { listen }, { getCurrentWindow }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event"), import("@tauri-apps/api/window")]);
  if (getCurrentWindow().label !== "main") return;
  let bar: HTMLDivElement | null = null;
  const show = (f: Face) => {
    const words = backWords(f);
    if (!words) { bar?.remove(); bar = null; return; }
    // the live region is put on the page empty and filled a frame later, so a screen reader hears the words
    if (!bar) { bar = document.createElement("div"); bar.className = "face-back"; bar.setAttribute("role", "status"); document.body.append(bar); }
    const b = bar;
    requestAnimationFrame(() => { b.textContent = words; });
  };
  await listen<Face>("face-state", (e) => show(e.payload));
  show(await invoke<Face>("face_state").catch(() => null));
}
