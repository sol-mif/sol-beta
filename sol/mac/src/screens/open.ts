// The second window (#1090): opened on the other screen. In Sol.app the shell makes it (src-tauri/src/screens.rs,
// screen_window_open: a web view labelled screen-<win> on the display that is not the main window's, sized to it); in a
// browser (dev, the shots, a face on another computer) it is window.open beside this one. Either way it is the same
// page told which window it is (`?screen=two`) and the role it starts in.
import type { Role } from "./model";

const IN_APP = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** the page a second window opens on: this page's own link, told its window and role, the switch on for it (pure) */
export function screenUrl(href: string, win: string, role: Role): string {
  const u = new URL(href);
  u.searchParams.set("screen", win);
  u.searchParams.set("role", role);
  u.searchParams.set("screens.two", "on");
  return u.toString();
}

/** the same, at once, inside the person's gesture (a let-go, a press): a browser refuses a popup opened later. In Sol.app
 *  the shell's command is asked and true is answered (it cannot refuse) */
export function openScreenNow(win = "two", role: Role = "stage"): boolean {
  if (IN_APP()) { void openScreen(win, role); return true; }
  const w = window.outerWidth || 1280, h = window.outerHeight || 800;
  return !!window.open(screenUrl(location.href, win, role), `sol-screen-${win}`, `left=${(window.screenX || 0) + w},top=${window.screenY || 0},width=${w},height=${h}`);
}

/** open window `win` in `role` on the other screen; false when it could not (a popup refused) */
export async function openScreen(win = "two", role: Role = "stage"): Promise<boolean> {
  if (IN_APP()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("screen_window_open", { win, role });
      return true;
    } catch (err) { console.warn(`screens: open: ${err}`); }
  }
  const w = window.outerWidth || 1280, h = window.outerHeight || 800;
  return !!window.open(screenUrl(location.href, win, role), `sol-screen-${win}`, `left=${(window.screenX || 0) + w},top=${window.screenY || 0},width=${w},height=${h}`);
}
