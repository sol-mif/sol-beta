// The stage a kind is on (#692 suite step 1): its store and its session, for a kind that adds a block beside itself
// (a Home block lifted to the stage composes sol://home/block/<id> here). OneStage provides it; null off a stage.
import { createContext, useContext } from "react";
import type { StageStore } from "../store";

export type Here = { store: StageStore; session: string };
export const StageHere = createContext<Here | null>(null);
export const useStageHere = () => useContext(StageHere);
