// Home and Build, one place (#1045): the folders the shelf draws and a thing carries from are the person's own, the
// record's areas (onboard/record.ts), told here by the Home that drew them (OneHome). Until #1223 they were his constant
// lists (home/folders/la245.ts), which went with the folders' Home. The shelf, the seat's name and a lift's path read
// them here, so the one mechanism (hand.ts, shelf.ts, store.ts, the engine's cross.ts) works from and to Home. The
// rules: folderList.ts.
import { useSyncExternalStore } from "react";
import { liftIn, pathIn, type Folder, type Lifted } from "./folderList.ts";
import { readRecord } from "../onboard/record.ts";
export type { Folder } from "./folderList.ts";

let list: Folder[] = [];
let said = new Map<string, string>();
const subs = new Set<() => void>();
/** the record's areas, as Home draws them: told by OneHome each time the record changes */
export function setHomeFolders(areas: readonly { id: string; name: string; said?: string }[]): void {
  list = areas.map((a) => ({ id: a.id, name: a.name }));
  said = new Map(areas.filter((a) => a.said).map((a) => [a.id, a.said!]));
  subs.forEach((f) => f());
}
export const homeFolders = (): Folder[] => list;
export const useHomeFolders = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, homeFolders);
/** a folder's name */
export const folderName = (id: string): string => list.find((f) => f.id === id)?.name ?? id;
/** a lift out of one of the person's folders: its path and what they said of it ride with it; none while cross is off */
export const homeLift = (on: boolean, place: string, words: string, mark: Lifted["mark"], key?: string): Lifted | undefined =>
  liftIn(on, pathIn(list, place) ?? place, said.has(place) ? [{ kind: "you said", label: said.get(place)! }] : [], place, words, mark, key);

// #1502: OneHome tells the list, and it mounts only on Home, so a window that opened in Build had none until Home was
// visited and a block let go had nowhere to land. The cross layer, always there with cross on, reads the record once
// through this when the list is empty; OneHome keeps telling it as the record changes.
export type Wire = { up: boolean; send: (o: object) => boolean; subscribe: (f: (m: any) => void) => () => void };   // eslint-disable-line @typescript-eslint/no-explicit-any
let asked = 0;
export function shelfFromRecord(e: Wire): Promise<void> {
  const ask = <T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `cross-rec-${++asked}`;
    const t = window.setTimeout(() => { off(); res(null); }, ms);
    const off = e.subscribe((m: { rid?: string }) => { if (m?.rid === rid) { window.clearTimeout(t); off(); res(m as T); } });
    e.send({ ...o, rid });
  });
  return readRecord(ask).then((rec) => { if (rec?.built && !homeFolders().length) setHomeFolders(rec.areas); });
}
