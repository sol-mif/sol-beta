// The named slots (#1604, docs/port/slices.md): each slice's view mounts in one, lazily, from its one entry file, so the
// shell never imports a slice's insides and no two builders touch one file. A slot's props say where it is drawn.
//   plane     slice 1  #view at Far and Middle: the zones, folders, faces, the camera; it mounts life and diary inside
//   needs     slice 2  #view at dist "needs" (part "view"), the ask line in #line (part "line"), "too much" (part "toomuch")
//   near      slice 3  #view at Near: a code session's panes, a life piece, beside, the starter, split parts
//   life      slice 4  inside a life folder at Middle (the plane mounts it with { region, band })
//   diary     slice 4  over the plane at Far, on today's page (D.zones.page) (the shell mounts it with { band })
//   ais       slice 5  #view on the page "ais"
//   agent     slice 5  over the plane at Far and Middle: told, rings, proof (the shell mounts it with { band })
//   settings  slice 6  the panel over the page on the page "settings"
//   people    slices 8+9  #view on the pages cowork, group:<id>, first:<id>, social, friend:<name>, asfriend:<name>, link; under Needs (part "needs")
//   peopleside slices 8+9  the sidebar's people section: the Cowork and Social rows and their nested rows
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { createElement, lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

export type SlotName = "plane" | "needs" | "near" | "life" | "diary" | "ais" | "agent" | "settings" | "people" | "peopleside";
export type SlotProps = { part?: string; region?: string; band?: "far" | "middle"; [more: string]: unknown };

const VIEWS: Record<SlotName, LazyExoticComponent<ComponentType<SlotProps>>> = {
  plane: lazy(() => import("./plane/index.tsx")),
  needs: lazy(() => import("./needs/index.tsx")),
  near: lazy(() => import("./near/index.tsx")),
  life: lazy(() => import("./life/index.tsx")),
  diary: lazy(() => import("./diary/index.tsx")),
  ais: lazy(() => import("./ais/index.tsx")),
  agent: lazy(() => import("./agent/index.tsx")),
  settings: lazy(() => import("./settings/index.tsx")),
  people: lazy(() => import("./people/index.tsx")), peopleside: lazy(() => import("./people/SideRows.tsx")),
};
export const SLOTS = Object.keys(VIEWS) as SlotName[];

/** a slice's view in its slot: <Slot name="plane" band="far" /> */
export function Slot({ name, ...props }: { name: SlotName } & SlotProps) {
  return createElement(Suspense, { fallback: null }, createElement(VIEWS[name], props));
}
