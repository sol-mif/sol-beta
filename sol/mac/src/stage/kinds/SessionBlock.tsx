// A session block (orchestration step 4, the design #1183 §3; Marco 2026-11-14: "the stage in the orchestration should
// provide all the capabilities needed so i don't have to constantly move around"). A session under the orchestrator,
// kept current by the engine (work/children.ts): the frame's tab is its title; inside, in this order and nothing more,
// its state word, where it works, its last line, its question with its buttons, a steer box, and the presses. Every
// press is one message to the engine (session.ts pressMsg); open goes to the child's talk as the side's row does.
import { useState } from "react";
import { store } from "../engineStore";
import { pressMsg, pressesOf, whereOf, wordOf, type PressMsg } from "./session";
import type { KindProps, SessionBody } from "./types";

const send = (m: PressMsg | null) => { if (m) void store.asker()?.(m.type, m); };
const open = (sid: string) => window.dispatchEvent(new CustomEvent("sol:open-work", { detail: sid }));

export function SessionBlock({ b, body, session }: KindProps<SessionBody>) {
  const [steer, setSteer] = useState("");
  if (!body?.sessionId) return <p className="st-note">this block names no session</p>;
  const word = wordOf(body), where = whereOf(body), on = session ?? "";
  const press = (p: PressMsg["press"], more?: { text?: string; i?: number; label?: string }) => send(pressMsg(on, b.id, p, more));
  return (
    <div className="st-session">
      <div className={`st-sword ${word.replace(" ", "-")}`} data-part="state"><i aria-hidden />{word}</div>
      {where && <div className="st-swhere" data-part="where">{where}</div>}
      <div className="st-slast" data-part="last">{body.last || "nothing said yet"}</div>
      {body.ask && (
        <div className="st-sask" data-part="ask">
          <span>{body.ask.question}</span>
          {!!body.ask.actions?.length && <div className="st-sacts">{body.ask.actions.map((a, i) => <button key={i} className="st-yes" onClick={() => press("answer", { i, label: a.label })}>{a.label}</button>)}</div>}
        </div>
      )}
      <form className="st-url st-ssteer" data-part="steer" onSubmit={(e) => { e.preventDefault(); press("steer", { text: steer }); setSteer(""); }}>
        <input className="st-addr" value={steer} placeholder="steer…" aria-label="steer: what you type runs as a turn in this session" onChange={(e) => setSteer(e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
      </form>
      <div className="st-spress">
        {pressesOf(body).map((p) => <button key={p} onClick={() => (p === "open" ? open(body.sessionId) : press(p))}>{p}</button>)}
      </div>
    </div>
  );
}
