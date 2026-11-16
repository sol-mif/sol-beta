// The face's hands on Sol's browser (src/browser.ts; moved from index.ts, #934): browser.watch, open, close, select,
// input, navigate, resize, inspect, locate. A failure is the asker's error line, counted (errcount.ts)
import type { Parts } from "../parts.js";
import { watch, openTab, closeTab, selectTab, navigateTab, resizeTab, inputTab, inspectTab, locateTab } from "../browser.js";
import { countError } from "../errcount.js";

export default function (p: Parts) {
  p.on("browser.", async (m, { ws, face, send }) => {
    try {
      if (m.type === "browser.watch") await watch(face, m.tab ?? null);
      else if (m.type === "browser.open") await openTab(String(m.url ?? ""), m.sessionId);
      else if (m.type === "browser.close") await closeTab(String(m.tab));
      else if (m.type === "browser.select") selectTab(String(m.tab));
      else if (m.type === "browser.input") await inputTab(String(m.tab), m.event);
      else if (m.type === "browser.navigate") await navigateTab(String(m.tab), m.action);
      else if (m.type === "browser.resize") await resizeTab(String(m.tab), Number(m.w), Number(m.h));
      else if (m.type === "browser.inspect") await inspectTab(face, m);
      else if (m.type === "browser.locate") await locateTab(face, m);
    } catch (err) {
      countError(err, "browser", m.type);
      send(ws, { type: "error", message: "browser: " + (err instanceof Error ? err.message.split("\n")[0] : String(err)) });
    }
  });
}
