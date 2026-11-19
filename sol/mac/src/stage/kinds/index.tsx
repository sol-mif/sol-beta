// The kinds (#696): page, list, stills, card, table, diff; and the two that are programs (#699): browser, terminal.
import type { ComponentType } from "react";
import type { Kind } from "../model";
import type { KindProps } from "./types";
import { Page } from "./Page";
import { List } from "./List";
import { Stills } from "./Stills";
import { Card } from "./Card";
import { Table } from "./Table";
import { Diff } from "./Diff";
import { Browser } from "./Browser";
import { Terminal } from "./Terminal";
import { SessionBlock } from "./SessionBlock";   // a session under an orchestrator, kept current by the engine (step 4)
import { System } from "./System";   // an area of the systems registry, read live (#1091)
import { Clock } from "./Clock";   // everything coming in with its ETA, checked by the engine (#1177)
import { Systems } from "./Systems";   // the whole of Jelly, clusters drawn by their role (#1193)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KINDS: Record<Kind, ComponentType<KindProps<any>>> = { page: Page, list: List, shots: Stills, card: Card, table: Table, diff: Diff, browser: Browser, terminal: Terminal, system: System, session: SessionBlock , clock: Clock, systems: Systems };
export { doneOf } from "./List";
export type { Act } from "./types";
