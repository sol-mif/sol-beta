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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KINDS: Record<Kind, ComponentType<KindProps<any>>> = { page: Page, list: List, shots: Stills, card: Card, table: Table, diff: Diff, browser: Browser, terminal: Terminal };
export { doneOf } from "./List";
export type { Act } from "./types";
