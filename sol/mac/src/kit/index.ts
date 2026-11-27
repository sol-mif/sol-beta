// The kit (#674): the primitives the face is built from, each small, with no knowledge of a feature, each reading only
// tokens.ts (generated from sol/design/system/tokens.json). The rules they keep: sol/design/system/look.md.
export { Glass } from "./Glass";
export { Button, type ButtonForm, type ButtonLook, type ButtonState } from "./Button";
export { Pill } from "./Pill";
export { Field } from "./Field";
export { Ring, type RingLook } from "./Ring";
export { Card } from "./Card";
export { ActionCard, type Said, type Press as CardPress, type Asks } from "./ActionCard";   // the card family: a face and one press or one question (#1299)
export { Row } from "./Row";
export { List, type Item } from "./List";
export { Meter, partColour } from "./Meter";
export { Glyph, GLYPHS, GLYPH_SETS, type GlyphName } from "./Glyph";
export { FileMark, FileChip, KINDS, type FileLook, type Kind } from "./FileMark";
export { Pearl, type PearlLook } from "./Pearl";
export { Halo, haloOf, DOINGS, type Doing, type HaloName } from "./Halo";
export { curve } from "./curve";
export { jellyBands, textW, useSize } from "./paint";
export { LOOKS, type Look } from "./tokens";
export { Frame, Head, SideKey, dragRow, useFrameVars } from "./Chrome";
export { FRAME, MAC, headPad } from "./geometry";
// pass 2's hand moves (#692, tactile.html): ink in four states, the back card, nudge, pinch, circle; slice F draws them
export { Ink, InkField, DoubtCard, FINISH_STOP_MS, type InkState, type InkDoubt } from "./Ink";
export { BackCard, Peel, type BackFacts } from "./BackCard";
export { Nudge, PUSHES, type Push, type Example } from "./Nudge";
export { Pinch } from "./Pinch";
export { Circle, wordsIn, type CircleAct } from "./Circle";
export { Block, BLOCK_STATES, type BlockState, type BlockTake } from "./Block";
// the press at the foot of any artifact that asks (#1298)
export { Press, type PressAnswer } from "./Press";
export { Sticky, FolderCard as HomeFolderCard, type StickyState } from "./Folder";
export { SETS, DEFAULT_SET, litOf, Pure, CUTS, CutSet, useCut, cutStyle, Display, BigNum, GROUNDS, type PaletteSet, type Cut, type CutId, type GroundId } from "./Yours";
// the frame's parts (#1879 step 0): the sidebar's groups and cards, the tabs and the one icon module, tokens only
// (kit/parts.css, tokens.json next); the decisions they follow: sol/design/decisions.md; how to use them: sol/skills/kit
export { Group, GROUP_FIT } from "./Group";
export { StickerCard } from "./StickerCard";
export { BoxIcon, BoxCard } from "./BoxIcon";
export { Key, type KeyState } from "./Key";
export { FolderCard, runningLine } from "./FolderCard";
export { FolderCase } from "./FolderCase";
export { DiaryCard, type DiaryRow } from "./DiaryCard";
export { Tab, Tabs, useCmdHeld, type TabItem } from "./Tab";
export { Mark, Dot, Count, PAINTS, paintAt, windowOf, markOf, type Paint } from "./Signs";
export { Icon, ICONS, ICON_USE, BoxGlyph, BOX_INSIDE, Progress, type IconName, type BoxInside } from "./icons";
// the bar's tools (#1879 step 5)
export { ToolBar, Tool, ToolZoom, ToolSep } from "./ToolBar";
