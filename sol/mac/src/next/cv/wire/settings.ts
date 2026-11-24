// owned by slice 6 (Settings), docs/port/slices.md
// Settings' wire (#1604; map.md, the Settings rows): in a real Sol, D.settings is the engine's settings (settings.get →
// settings), what I've learned is home.sources' learned lines, the connected services are home.connections' list, and
// the AIs are the store's own (agents.list, slice 5). Settings' moves send through it: agents.mode for how far an AI
// goes, home.learned.keep/drop, settings.set { ui: { next: false } } for the way back (settings/link.ts). The settings'
// history, a spend limit per AI and the ways are "no" here: nothing reads them. Signed: marcocyl04-ux's agent, slice 6 (#1615).
// How Sol worked (#1615): next.traces, asked by stWorked, is read into D.worked through worked.ts's allowlist; a
// next.refused for it says so. Signed: franktsai2008-eng's agent, the face half of "How Sol worked" (#1615).
import { change, hooks } from "../core.ts";
import type { Engine } from "./types.ts";
import { link } from "../../settings/link.ts";
import { W } from "../moves/settings.ts";
import { clean, type Worked } from "../../settings/worked-read.ts";
// BR1 (#1615): each knob not per AI is a fit the engine keeps (next.fits, S15): read whole on attach and again after
// every keep, Back or let-go the moves send (next.fit.set, next.fit.back), and folded into what the panel shows in use.
import { applyFits, type Fit } from "../../settings/model.ts";
import { ofLearned } from "../../known.ts";

type Line = { id: string; text: string; seen?: number };
type Conn = { id: string; name: string; state: string; from: string };

export function attach(e: Engine): void | (() => void) {
  link.e = e;
  const off = e.subscribe((m: { type?: string; settings?: unknown; learned?: Line[]; list?: Conn[]; off?: boolean; asked?: string; ok?: boolean; why?: string; fits?: Fit[] }) => {
    if (m?.type === "settings" && m.settings) change((d) => { d.settings = m.settings; });
    else if (m?.type === "next.fits" && m.ok && Array.isArray(m.fits)) {
      const fits = m.fits;
      change(() => { const w = W(); w.fits = fits; applyFits(w); });
    } else if (m?.type === "next.fit.set" || m?.type === "next.fit.back") {
      if (m.ok === false) hooks.flash?.("That didn’t keep. Nothing changed.");
      e.send({ type: "next.fits" });
    }
    else if (m?.type === "home.sources" && Array.isArray(m.learned)) {
      const lines = m.learned;
      change(() => { W().prefs.learned = ofLearned(lines); });
    } else if (m?.type === "home.connections" && Array.isArray(m.list)) {
      const list = m.list;
      change(() => { W().connections = list.map((c) => ({ id: c.id, name: c.name, state: c.state, from: c.from })); });
    } else if (m?.type === "next.traces") {
      const t = clean(m);
      change((d) => { const w = d.worked as Worked | undefined; d.worked = { day: w?.day ?? null, state: t ? "here" : "refused", t } satisfies Worked; });
    } else if (m?.type === "next.refused" && m.asked === "next.traces") {
      change((d) => { const w = d.worked as Worked | undefined; d.worked = { day: w?.day ?? null, state: "refused", t: null } satisfies Worked; });
    }
  });
  e.send({ type: "settings.get" });
  e.send({ type: "next.fits" });
  e.send({ type: "home.sources" });
  e.send({ type: "connections" });
  return () => { off(); if (link.e === e) link.e = null; };
}
