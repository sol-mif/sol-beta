// Home's suite, step 2 (#692): the registry of shapes. A recipe whose block draws its own inside names its part here;
// Piece.tsx's Inside draws it in the frame (the words, the ring, the shelf and the moves are the frame's). A recipe not
// here draws step 1's inside from its body. One line per block; a builder adds its lines, never reorders.
// (Three builders each made this file; the join keeps one, with every block's line.)
import type { ComponentType } from "react";
import type { Block2, Home2Api, HomeState2, Place, Recipe } from "../pass2";

/** what the frame hands a shape: its block, its recipe, the wire, the state, and the way to a folder */
export type ShapeProps = { b: Block2; r?: Recipe; h: Home2Api; st: HomeState2; setPlace: (p: Place) => void };
export type Shape = ComponentType<ShapeProps>;

export const SHAPES: Record<string, Shape> = {};

// ---- the blocks that draw their own inside, one line each ----
// b1: tracker, deck, inbox, watch
import { Tracker } from "./Tracker";
SHAPES.tracker = Tracker;
import { Deck } from "./Deck";
SHAPES.deck = Deck;
import { Inbox } from "./Inbox";
SHAPES.inbox = Inbox;
import { Watch } from "./Watch";
SHAPES.watch = Watch;
// b2: stack, draft, ask, board
import { Stack } from "./Stack";
SHAPES.stack = Stack;
import { Draft } from "./Draft";
SHAPES.draft = Draft;
import { Ask } from "./Ask";
SHAPES.ask = Ask;
import { Board } from "./Board";
SHAPES.board = Board;
// b3: week, pile, world
import { WeekShape } from "./ShapeWeek";
SHAPES.week = WeekShape;
import { PileShape } from "./ShapePile";
SHAPES.pile = PileShape;
import { WorldShape } from "./ShapeWorld";
SHAPES.world = WorldShape;
