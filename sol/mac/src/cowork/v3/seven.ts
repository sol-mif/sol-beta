// Cowork v3, slice 7 (fr-30, #560): the face's one way to ask the engine about artifacts, search and the floor.
// Requests go as team.v3.artifacts.* / team.v3.search.* / team.v3.floor.* with a rid; the engine answers once, by that
// rid, as work.v3.<the same rest> (team/v3/floorwire.ts), on the page's one link to the engine (socket.ts), so the
// same calls work from Cowork and from Home. Loaded only with the switch on (every file here is a lazy chunk).
import { useCallback, useEffect, useRef, useState } from "react";
import { askV3 } from "./ask";

export type By = { person: string; machine?: string; agent?: string };
export type ArtKind = "document" | "page" | "table" | "canvas" | "flow";
export type Section = { h: string; p: string };
export type Shape = { k: "pill" | "sw" | "ring" | "note" | "mark"; x: number; y: number; w?: number; h?: number; s?: number; tone?: number; t?: string };
export type Content = { sections?: Section[]; hero?: string; p?: string; cards?: string[]; cols?: string[]; rows?: string[][]; shapes?: Shape[]; words?: string; parts?: string[] };
export type Artifact = { id: string; project: string; kind: ArtKind; title: string; whose: string; place: string; version: number; by: By; at: number; updated: number; waiting?: boolean };
export type ArtVersion = { v: number; event: string; by: By; at: number; title: string; note?: string; content: Content; waiting?: boolean };
export type Open = { room: "plan" | "space" | "artifacts" | "talk" | "places" | "trail"; id?: string };
export type HitKind = "item" | "loose" | "artifact" | "talk" | "trail" | "place";
export type Hit = { kind: HitKind; id: string; project: string; title: string; whose: string; place: string; at: number; open: Open; score: number; agent?: boolean };
export type Groups = { q: string; total: number; ms: number; groups: { kind: HitKind; hits: Hit[] }[] };
export type Interrupt = { what: string; quiet: { from: string; to: string } | null; zone: string; layer: string };
export type Device = { name: string; key: string; here: boolean; vouched: boolean; answers: boolean; seen: number; note?: string };
export type LeaveLine = { act: "reconnect" | "hand" | "revoke" | "off"; kind: "place" | "item" | "loose" | "agent" | "automation"; id: string; title: string; line: string; place: string; press: string;
  alt?: { act: "off"; press: string } };
export type LeaveCard = { who: string; heir: string; lines: LeaveLine[]; calm: string };
export type ConflictCard = { collection: "items" | "loose" | "members" | "places"; id: string; field: string; title: string; kind: string; shown: string;
  versions: { event: string; by: By; at: number; value: unknown }[] };
export type Floor = {
  me: string; project: string; machine: string; trail: "slice0" | "stand-in";
  interrupt: Interrupt; quietNow: boolean; whats: string[]; quiets: ({ from: string; to: string } | null)[];
  devices: Device[]; waiting: { count: number; things: { id: string; title: string; kind: string }[]; away: string };
  conflicts: ConflictCard[]; people: string[]; leave?: LeaveCard;
};

/** one question, answered by rid (ask.ts askV3, the one work.v3.* listener) */
export const ask = <T = Record<string, unknown>>(type: string, body: object = {}, wait = 15_000): Promise<T & { error?: string }> => askV3<T>(type, body, wait);

/** a read kept fresh: asked now, again on `again()` and every `every` ms while shown */
export function useRead<T>(type: string, body: object | null, every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const key = body ? JSON.stringify(body) : "";
  const alive = useRef(true);
  const again = useCallback(async () => {
    if (!body) return;
    const r = await ask<T>(type, body);
    if (!alive.current) return;
    if (r.error) setError(r.error); else { setError(""); setData(r); }
  }, [type, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true;
    void again();
    const t = every ? window.setInterval(() => void again(), every) : 0;
    return () => { alive.current = false; if (t) window.clearInterval(t); };
  }, [again, every]);
  return { data, setData, error, again };
}

// the words and marks every page here shares
export const KIND_WORD: Record<ArtKind, string> = { document: "document", page: "page", table: "table", canvas: "canvas", flow: "flow" };
export const KINDS: ArtKind[] = ["document", "page", "table", "canvas", "flow"];
/** a kind's glyph (cowork/pixels.ts) */
export const kindGlyph = (k: string) => (({ document: "doc", page: "web", table: "sheet", canvas: "slides", flow: "decisions", item: "flag", loose: "file", talk: "decisions", trail: "calendar", place: "folder" } as Record<string, string>)[k] ?? "file");
/** where a thing lives, as a glyph */
export const placeGlyph = (place: string) => (({ record: "file", github: "github", drive: "doc", talk: "decisions", chat: "decisions", figma: "figma", web: "web", calendar: "calendar", machine: "folder", email: "doc", home: "add" } as Record<string, string>)[place] ?? "file");
export const PLACE_WORD: Record<string, string> = { record: "the project's record", github: "GitHub", drive: "Drive", talk: "Talk", chat: "Talk", figma: "Figma", web: "the web", calendar: "the calendar", machine: "their machine", email: "email", home: "Home" };
export const placeWord = (p: string) => PLACE_WORD[p] ?? p;
export const who = (login: string, me: string) => (login && me && login.toLowerCase() === me.toLowerCase() ? "you" : login);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const when = (at: number) => {
  if (!at) return "";
  const d = new Date(at), now = new Date(), mins = Math.round((now.getTime() - at) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  if (d.toDateString() === now.toDateString()) return d.toTimeString().slice(0, 5);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
/** a file handed to the browser to keep (an export) */
export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
