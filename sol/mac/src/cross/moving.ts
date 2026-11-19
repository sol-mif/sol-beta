// Say it and Settings moves (#1031): the look's rows a sentence just moved (store.markMoving), lit for a moment, and
// each slider carried from its old value to its new one on the kit's travel spring, so the person sees the row move.
import { useEffect, useState } from "react";
import { spring } from "../motion";
import { SPRING } from "../kit/feel";
import { useCross } from "./flag";
import { useCrossState } from "./store";

const KEY = { text: "text", opacity: "alpha", blur: "blur" } as const;
export function useSaidRows(glide: (k: "alpha" | "blur" | "text", v: number | undefined) => void): Set<string> {
  const on = useCross(), { moving } = useCrossState();
  const [lit, setLit] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!on || !moving || Date.now() - moving.at > 3000) return;
    setLit(new Set(moving.rows.map((r) => r.row)));
    const springs = moving.rows.filter((r) => r.row in KEY && typeof r.to === "number").map((r) => {
      const k = KEY[r.row as keyof typeof KEY], fine = k === "alpha";
      const s = spring(Number(r.from) * (fine ? 100 : 1), { ...SPRING.travel, eps: 0.2 }, (v) => glide(k, fine ? Math.round(v) / 100 : Math.round(v)), () => glide(k, undefined));
      s.to(Number(r.to) * (fine ? 100 : 1));
      return s;
    });
    const t = window.setTimeout(() => setLit(new Set()), 2600);
    return () => { window.clearTimeout(t); springs.forEach((s) => s.stop()); };
  }, [moving?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return lit;
}
