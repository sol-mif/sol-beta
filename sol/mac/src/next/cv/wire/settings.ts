// owned by slice 6 (Settings), docs/port/slices.md
// Settings' wire (#1604; map.md, the Settings rows): in a real Sol, D.settings is the engine's settings (settings.get →
// settings), what I've learned is home.sources' learned lines, the connected services are home.connections' list, and
// the AIs are the store's own (agents.list, slice 5). Settings' moves send through it: agents.mode for how far an AI
// goes, home.learned.keep/drop, settings.set { ui: { next: false } } for the way back (settings/link.ts). The settings'
// history, a spend limit per AI and the ways are "no" here: nothing reads them. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { change } from "../core.ts";
import type { Engine } from "./types.ts";
import { link } from "../../settings/link.ts";
import { W } from "../moves/settings.ts";

type Line = { id: string; text: string; seen?: number };
type Conn = { id: string; name: string; state: string; from: string };

export function attach(e: Engine): void | (() => void) {
  link.e = e;
  const off = e.subscribe((m: { type?: string; settings?: unknown; learned?: Line[]; list?: Conn[]; off?: boolean }) => {
    if (m?.type === "settings" && m.settings) change((d) => { d.settings = m.settings; });
    else if (m?.type === "home.sources" && Array.isArray(m.learned)) {
      const lines = m.learned;
      change(() => { W().prefs.learned = lines.map((l) => ({ id: l.id, t: l.text, from: l.seen ? `seen ${l.seen} time${l.seen === 1 ? "" : "s"}` : "what you did" })); });
    } else if (m?.type === "home.connections" && Array.isArray(m.list)) {
      const list = m.list;
      change(() => { W().connections = list.map((c) => ({ id: c.id, name: c.name, state: c.state, from: c.from })); });
    }
  });
  e.send({ type: "settings.get" });
  e.send({ type: "home.sources" });
  e.send({ type: "connections" });
  return () => { off(); if (link.e === e) link.e = null; };
}
