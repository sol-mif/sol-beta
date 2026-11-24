// The one line a downloaded Sol.app shows when another Sol already answers on this Mac's port (#1852,
// src-tauri/src/other.rs): no first run, no face, and nothing here dials the engine (renovation and useEngine are not
// imported). Under the line, where the other Sol runs from, when it said.
import "../tokens.css";
import "./another.css";
import { invoke } from "@tauri-apps/api/core";

const tilde = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");
void invoke<string | null>("another_sol").then((root) => {
  const where = document.querySelector<HTMLElement>(".another-where");
  if (!where || !root) return;
  where.textContent = `It runs from ${tilde(root)}.`;
  where.hidden = false;
}).catch(() => {});
