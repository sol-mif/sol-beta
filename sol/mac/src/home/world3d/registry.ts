// Home's world (#1093): the Jelly project's registry, one row per area of part 5's sol/systems/records (#1091), counted
// from branch marcocyl04-ux/n13-systems at 607c3eaa (13 Nov, 02:20): how many systems each area holds, how many are broken,
// parked when the area is parked or legacy. The fallback: the engine counts the live records (agent.areas, engine/src/agent/areas.ts) when it answers.
export type Area = { area: string; n: number; broken: number; parked?: boolean };
export const REGISTRY: Area[] = [
  { area: "app", n: 23, broken: 1 }, { area: "build", n: 49, broken: 1 }, { area: "day", n: 11, broken: 3 },
  { area: "design", n: 35, broken: 0 }, { area: "engine", n: 61, broken: 0 }, { area: "face", n: 21, broken: 1 },
  { area: "machines", n: 34, broken: 1 }, { area: "marketing", n: 9, broken: 0 }, { area: "memory", n: 15, broken: 3 },
  { area: "mine", n: 23, broken: 2 }, { area: "money", n: 13, broken: 0 }, { area: "nights", n: 17, broken: 2 },
  { area: "product", n: 59, broken: 0 }, { area: "releases", n: 21, broken: 1 }, { area: "team", n: 34, broken: 1 },
  { area: "testers", n: 8, broken: 0 }, { area: "legacy", n: 21, broken: 0, parked: true },
];
