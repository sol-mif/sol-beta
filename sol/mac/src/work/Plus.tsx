import { useRef, useState } from "react";
import { Menu, type MenuItem } from "./Menu";
import { Pill } from "../kit";

// The box's + (#24 round two: the same box everywhere). Every talk can attach files; a session adds what Claude Code
// has (mention, a command, a skill, ask on the side) after it. A chat's + is attach alone, so it opens the picker at once.
// `kit` (#647 round 4, the clean Home's box): the + is the kit's Pill, a picker like the row's, its word on the talk's
// text edge, the edge the row's first word stands on.
export function Plus({ more, onFiles, kit }: { more?: MenuItem[]; onFiles: (fs: File[]) => void; kit?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const pick = () => input.current?.click();
  const items: MenuItem[] = [{ label: "attach files", run: pick }, ...(more ?? [])];
  return (<>
    <button type="button" className={`wplus${kit ? " kit" : ""}`} title={more?.length ? "attach, mention, a command" : "attach files"}
      onClick={(ev) => { if (!more?.length) return pick(); const r = ev.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6 }); }}>{kit ? <Pill words={["+"]} picked={-1} up={!!menu} h={24} start /> : "+"}</button>
    <input ref={input} type="file" multiple hidden onChange={(ev) => { const fs = Array.from(ev.target.files ?? []); ev.target.value = ""; if (fs.length) onFiles(fs); }} />
    {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
  </>);
}
