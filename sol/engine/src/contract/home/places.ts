// Places and people (#874; face #799): the shapes the engine sends and takes, as Zod schemas, each with its type. Every
// name and field is Marco's, read from his face (origin/marco/mine-run, sol/mac/src/home/whole/places.ts l.13-21;
// specs/face-wire.md §3.5), none is the engine's pick. What the engine sends parses with the strict schemas (no field
// beyond these); an ask may carry more (a rid, say) and is read for its own fields only.
import { z } from "zod";

/** where a place comes from: a Canvas course, a folder on disk, or one you made */
export const From = z.object({ source: z.enum(["canvas", "files", "you"]), ref: z.string(), label: z.string() }).strict();
/** one thing a place knows, and from where */
export const Knows = z.object({ kind: z.enum(["slides", "file", "syllabus", "person", "site", "notes"]), label: z.string(), from: z.string() }).strict();
/** a place (a folder): its crumb path as the Things' `folder` names it ("school › bio 201"), its parent's id */
export const PlaceItem = z.object({ id: z.string(), name: z.string(), path: z.string(), parent: z.string().optional(), from: From, knows: z.array(Knows) }).strict();
/** a person Sol keeps up with, and the Things that name them */
export const Person = z.object({ id: z.string(), name: z.string(), note: z.string(), thingIds: z.array(z.string()) }).strict();
export const PlacesMsg = z.object({ type: z.literal("home.places"), places: z.array(PlaceItem), people: z.array(Person) }).strict();

// the ask (face to engine)
export const PlacesAsk = z.object({ type: z.literal("home.places") });

export type From = z.infer<typeof From>;
export type Knows = z.infer<typeof Knows>;
export type PlaceItem = z.infer<typeof PlaceItem>;
export type Person = z.infer<typeof Person>;
export type PlacesMsg = z.infer<typeof PlacesMsg>;
