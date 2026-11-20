// The filer (#827; design §7.9; specs home-plan §6 Home 3): the folder a part of a sentence is filed to, chosen among
// the person's folders. The rule filer files by the person's own rules (rules.ts, #1686): their own rules file, their
// record's areas, their folders' names, in that order; nothing of anyone's life is written here. A rule's folder that
// the person has, or one of theirs that starts with it, wins over the rule's own name; no rule, "life". Pure, and
// nothing leaves the machine.
//   confidence   the engine's own (the face has no field for it): .8 when a rule named the folder, .3 for "life"
import { ruleFor, ruleSet, type OwnRules, type Record_, type Rule } from "./rules.js";

export type Filed = { folder: string; confidence: number };
export type Filer = { name: string; file: (text: string, folders: string[]) => Filed };

/** where nothing matched */
export const LIFE = "life";

/** a rule filer over the person's own rules and record (none: their folders' names alone) */
export function personFiler(own: OwnRules = { file: [] }, rec: Record_ | null = null): Filer {
  return {
    name: "rule",
    file(text, folders) {
      const r: Rule | null = ruleFor(text, ruleSet(own, rec, folders));
      if (!r) return { folder: LIFE, confidence: 0.3 };
      return { folder: folders.find((x) => x === r.folder || x.startsWith(r.folder)) ?? r.folder, confidence: 0.8 };
    },
  };
}

/** the factory default: the person's folders' names alone */
export const ruleFiler: Filer = personFiler();

/** the folder of a part */
export function folderOf(text: string, folders: string[] = []): string {
  return ruleFiler.file(text, folders).folder;
}
