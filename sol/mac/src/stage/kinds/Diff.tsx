// A diff (#696; v4 §4, #738): a file row, one pill per file with what it adds and takes away, then the picked file's lines
// in mono at 11 with their gutter numbers; added and removed lie on soft green and red bands. One file, one pill. The
// reading is lines.ts's.
import { useState } from "react";
import type { DiffBody, KindProps } from "./types";
import { filesOf } from "./lines";

export function Diff({ b, body }: KindProps<DiffBody>) {
  const files = filesOf(body, b.bind?.watch || b.bind?.source || b.title);
  const [on, setOn] = useState(0);
  const f = files[Math.min(on, files.length - 1)];
  return (
    <div className="st-diffk">
      <div className="st-filerow">
        {files.map((x, i) => (
          <button key={i} className={`st-file ${x === f ? "on" : ""}`} onClick={() => setOn(i)} data-part={`file ${x.name}`}>
            {x.name} <span className="p">+{x.add}</span> <span className="m">−{x.del}</span>
          </button>
        ))}
      </div>
      <div className="st-diff">
        {f.lines.map((l, i) => (
          <div key={i} className={`st-dl ${l.k === "+" ? "a" : l.k === "-" ? "d" : ""}`} data-part={`${f.name} › line ${l.n}`}>
            <span className="n">{l.n}</span><span className="s">{l.k === " " ? "" : l.k === "-" ? "−" : "+"}</span><span>{l.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
