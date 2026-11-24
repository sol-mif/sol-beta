// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// The seam into slice 6's Settings panel (round 6, #1615; merge/seats.js's window.ST_EXTRA, which build.mjs hooked into
// ui.html's Settings): pages of their own (#settings&seats), rows under a group of the main page, and the parts of the
// panel they replace. Seats replaces Connected services: its row in "Money and your data", its section of the data
// page and its place in find go (docs/port/requests/seats.md). Slices 11 and 12 can add theirs here the same way.
// Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { createElement, type ComponentType, type ReactNode } from "react";
import { PLACES, type Place } from "../model.ts";
import { Seats, SeatsRow } from "./Seats.tsx";

export const ST_EXTRA = {
  pages: {} as Record<string, ComponentType>,
  rows: [] as ((group: string) => ReactNode)[],
  gone: new Set<string>(),
  /** the page drawn for Settings' page name, or null for the panel's own */
  page(name: string): ComponentType | null { return this.pages[name] ?? null; },
  /** the extra rows under a group of the main page */
  rowsFor(group: string): ReactNode[] { return this.rows.map((f) => f(group)).filter(Boolean); },
  /** a part of the panel another page replaced ("conn": Connected services) */
  hides(part: string): boolean { return this.gone.has(part); },
};

ST_EXTRA.pages.seats = Seats;
ST_EXTRA.rows.push((g) => (g === "How your AIs work" ? createElement(SeatsRow, { key: "seats" }) : null));
ST_EXTRA.gone.add("conn");
// find: Connected services' place becomes Seats and sign-ins (build.mjs's "PLACES conn"); stPlace("seats") opens it
{
  const i = PLACES.findIndex((p) => p.id === "conn");
  const seats = { id: "seats", n: "Your AI subscriptions", w: "seats and sign-ins seats seat sign signin login logged renew expire expires plan plans subscription claude codex connect connections accounts gmail calendar bank portal school drive slack figma github aws integrations apps", where: "Your AI plans, and each account they read", page: "seats" } as unknown as Place;
  if (i >= 0) PLACES.splice(i, 1, seats); else if (!PLACES.some((p) => p.id === "seats")) PLACES.push(seats);
}
