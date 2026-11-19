// The filer (#827; design §7.9; specs home-plan §6 Home 3): the folder a part of a sentence is filed to, chosen among
// the person's folders. The only filer tonight is the rule filer, the folder half of Marco's keyword judge
// (origin/marco/mine-run sol/mac/src/home/whole/reads.ts l.81-98, `FOLDERS` and `folderOf`): the first rule whose words
// the part holds names a folder; a folder of the person's that is that one or starts with it wins over the rule's own
// name; no rule, "life". Pure, and nothing leaves the machine.
//   confidence   the engine's own (the face has no field for it): .8 when a rule named the folder, .3 for "life"
export type Filed = { folder: string; confidence: number };
export type Filer = { name: string; file: (text: string, folders: string[]) => Filed };

const FOLDERS: [RegExp, string][] = [
  [/\b(bio|biology|slides|midterm)\b/i, "school › bio 201"], [/\b(chem|chemistry|lab|equilibrium)\b/i, "school › chem 110"],
  [/\b(stats|statistics|survey|maya)\b/i, "school › stats 140"], [/\b(offer|interview|application|cv|cover letter|recruiter|sam|shopify)\b/i, "jobs"],
  [/\b(exam|lecture|class|course|homework|set \d)\b/i, "school"],
];
/** where nothing matched */
export const LIFE = "life";

/** the folder of a part (MR reads.ts folderOf) */
export function folderOf(text: string, folders: string[] = []): string {
  return ruleFiler.file(text, folders).folder;
}

/** the factory default: Marco's rules */
export const ruleFiler: Filer = {
  name: "rule",
  file(text, folders) {
    for (const [re, f] of FOLDERS) if (re.test(text)) return { folder: folders.find((x) => x === f || x.startsWith(f)) ?? f, confidence: 0.8 };
    return { folder: LIFE, confidence: 0.3 };
  },
};
