// Cowork v3 slice 3 (fr-30, #556): the shapes of the engine's team.v3.people, team.v3.window and team.v3.running answers
// (sol/engine/src/team/v3/people.ts, running.ts), copied for the face. The engine's files are the source.
export type Role = "owner" | "editor" | "guest";
export type Ring = "mine" | "myWay" | "workFacts";
export const RINGS: Ring[] = ["mine", "myWay", "workFacts"];
export type Abilities = { composer: boolean; presses: boolean; agent: boolean };
export type Station = { who: string; role: Role; you: boolean; here: "here" | "away"; on: string | null; agent: { whose: string; busy: boolean; may: string[] } | null };
export type LayerRow = { k: string; name: string; opts: string[]; team?: string; project?: string; me?: string; value: string; from: "team" | "project" | "me" | "default" };
export type PeopleAnswer = {
  project: string; me: string; role: Role | null; can: Abilities;
  groups: { on: string; people: Station[] }[];
  roles: Record<Role, string[]>; agents: string[]; layers: LayerRow[];
  error?: string;
};
export type ChipView = { id: string; ring: Ring; label: string; full: string; pass: "yes" | "ask" | "never"; shut?: true };
export type WindowAnswer = {
  project: string; whose: string; viewer: string; mine: boolean; rings: Record<Ring, ChipView[]>;
  words: Record<Ring, { name: string; rule: string }>; can: { move: boolean }; error?: string;
};
export type Press = { label: string; via: string; body?: Record<string, unknown> };
export type NowLine = {
  red: { title: string; whose: string; place: string; line: string; press: Press | null }[];
  running: { title: string; whose: string; agent?: boolean; place?: string; line?: string; press: Press | null }[];
  next: { label: string; at: string; inMinutes: number; whose: string; place: string; line: string } | null;
};
export type DevCard = { number: number; title: string; author: string; url: string; mark?: string; presses: Press[] };
export type DevFace = {
  repo: string; reviewer: boolean; drafts: DevCard[]; reads: DevCard[];
  versions: { releases: { tag: string; at: string; kind: string; beta: boolean; changes: number }[]; people: { login: string; on: string | null; behind: number }[] };
  night: { handIn?: string; review?: string; release?: string; reviewers: string[]; backups: string[]; handedIn: number; presses: Press[] };
};
export type RunningAnswer = { project: string; role: Role | null; line: NowLine; dev: DevFace | null; error?: string };
