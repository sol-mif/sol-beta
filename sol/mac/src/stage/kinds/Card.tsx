// A card (#696; v4 §4): one thing in a few words, born 2 × 1: one sentence big with its meaning dot (live green, yellow
// when it waits on you, red when it went wrong: the meaning colour is its only colour), and one line small under it.
import type { CardBody, KindProps } from "./types";

export function Card({ body }: KindProps<CardBody>) {
  const say = body?.wrong ? "wrong" : body?.ok === false ? "waits" : "live";
  return (
    <div className="st-card">
      <div className="st-big" data-part="big"><i className={`st-say ${say}`} aria-hidden /><span>{body?.big}</span></div>
      {body?.sub && <div className="st-sub" data-part="sub">{body.sub}</div>}
    </div>
  );
}
