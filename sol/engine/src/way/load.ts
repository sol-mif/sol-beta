// Reading a way file (FORMAT §1, §7). Pure: the file's text or its parsed JSON in, the way, its print and what is
// wrong out, and it never throws: a file that cannot be read is a problem like any other.
//   first        a text with a key written twice in one object is refused (JSON.parse keeps the last, a person reading
//                the stored `<ver>.json` may read the first: two meanings, one ver); then nothing nested deeper than
//                NEST is looked at further (it is checked without recursion, before anything walks it)
//   ver          hashOf(the whole way) (canonical.ts: keys sorted), so the same way written in another key order has
//                the same ver; the file has no `ver` key of its own (one is a problem)
//   every slot   exactly the shapes the format allows; every name it uses for something else must be there (a state, a
//                move, a rule, a trigger, a seam, a role, a thing, a field); each thing has a birth move; no move leaves
//                an `end` state; a trigger's `do` is one of ping, move and act, and the move it does lists
//                `trigger:<id>` among who may press it; every seam names its package's print, `sha256:<64 hex>`, or
//                `sha256:tbd` while the plugin is not built
//   rules        the forms rules.ts reads; an `is` whose value is not of the field's type, and an `older` on a field
//                that is not a time, are refused; so is a rule that nests deeper than one judging goes (MAX_DEPTH),
//                or that is bigger than SIZE forms once every rule it names is written out
//   ids          a field's name is at most FIELD_MAX long, so "<thing>.<field>" is at most 120; a state's at most
//                STATE_MAX, so a proposal's "<old>><new>" is at most 119
//   numbers      every number is a safe integer, and, in a text, written as canonical JSON writes it (no 1.0, no
//                9007199254740993 that reads as ...992): one ver never stands for two readings
//   one press    at most CHECKS_MAX seams give "check" (a press names one way.checked a seam), so the largest value one
//                press can write (pressBytes) is provably within the trail's 64 KB; a way past it does not load
// A way with any problem never runs: it is shown read-only with the reasons (the format's §7: what is not understood
// does not pass). A clean way with a seam still `sha256:tbd` is not pinned: it can be read and replayed, never applied
// (fold.ts) nor run.
import { hashOf } from "../canonical.js";
import { isEventOn, readOn, zoneOk } from "./clock.js";
import { MAX_DEPTH, SIZE, age, formOf } from "./rules.js";
import { CHECKS_MAX, FIELD_MAX, FORMAT, ID, LIST_MAX, RUNNER, STATE_MAX, TEXT_MAX, WHO, PKG, fromList, holds, isObj, own, type Loaded, type Problem, type Way } from "./types.js";

/** the trail's limit on one event's value (team/v3/trail.ts VALUE_MAX) */
export const VALUE_MAX = 64 * 1024;
/** the most bytes one value a press writes can take, as canonical JSON, for a way whose `checks` seams are n (pure).
 *  A way.move, way.refused or way.fired: its ids at their longest and n check ids of 64 hex; a way.set: a `names` or
 *  `numbers` of LIST_MAX ids; a way.note: TEXT_MAX of words. The keys, quotes and commas are counted at their most */
export const pressBytes = (n: number): number => Math.max(
  1024 + n * (64 + 3),
  1024 + LIST_MAX * (120 + 3) + LIST_MAX * (120 + 25),
  1024 + TEXT_MAX,
);

export { holds };

const TOP = ["way", "id", "name", "prev", "zone", "runner", "roles", "things", "life", "rules", "triggers", "record", "views", "seams"];
const CARRY = /^(name|text|number|boolean|names|numbers|time)\??$/;
const GIVES = ["check", "act", "page", "carry"];
const AUTO = ["life", "board", "timeline"];
const PARTS = ["list"];
const HEX = /^[0-9a-f]{64}$/;
/** the deepest any part of a way file may be nested */
const NEST = 64;

/** the first key written twice in one object of a JSON text, or null (pure; the text is JSON already) */
export function repeatedKey(text: string): string | null {
  const stack: (Set<string> | null)[] = [];
  let key = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top && key) { const k = JSON.parse(text.slice(i, j + 1)) as string; if (top.has(k)) return k; top.add(k); key = false; }
      i = j;
    } else if (c === "{") { stack.push(new Set()); key = true; }
    else if (c === "[") stack.push(null);
    else if (c === "}" || c === "]") stack.pop();
    else if (c === ",") key = stack[stack.length - 1] instanceof Set;
  }
  return null;
}
/** the first number in a JSON text not written as canonical JSON writes a safe integer, or null (pure; JSON already) */
function oddNumber(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { let j = i + 1; while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1; i = j; continue; }
    if (c !== "-" && (c < "0" || c > "9")) continue;
    let j = i;
    while (j < text.length && /[-+.eE0-9]/.test(text[j])) j++;
    const tok = text.slice(i, j), n = Number(tok);
    if (!Number.isSafeInteger(n) || String(n) !== tok) return tok;
    i = j - 1;
  }
  return null;
}
/** whether any number in a value is not a safe integer (pure, no recursion) */
function unsafeNumber(v: unknown): boolean {
  const todo: unknown[] = [v];
  while (todo.length) {
    const x = todo.pop();
    if (typeof x === "number" && !Number.isSafeInteger(x)) return true;
    if (x && typeof x === "object") todo.push(...Object.values(x));
  }
  return false;
}
/** whether any part of a value is nested deeper than `max` (pure, no recursion) */
function tooDeep(v: unknown, max: number): boolean {
  const todo: [unknown, number][] = [[v, 0]];
  while (todo.length) {
    const [x, d] = todo.pop()!;
    if (!x || typeof x !== "object") continue;
    if (d > max) return true;
    for (const y of Object.values(x)) todo.push([y, d + 1]);
  }
  return false;
}

/** a way file read and checked (pure): text is parsed first. Never throws. The way given back is a copy: a caller that
 *  changes the object it handed in does not change the way its ver names */
export function load(file: unknown): Loaded {
  const fail = (why: string, at = ""): Loaded => ({ way: null, ver: "", problems: [{ at, why }], pinned: false, runs: false });
  try {
    let raw = file;
    if (typeof file === "string") {
      try { raw = JSON.parse(file); } catch { return fail("not_json"); }
      const twice = isObj(raw) ? repeatedKey(file) : null;
      if (twice !== null) return fail("repeated_key", twice);
      const odd = isObj(raw) ? oddNumber(file) : null;
      if (odd !== null) return fail("bad_number", odd);
    }
    if (!isObj(raw)) return fail("not_object");
    if (tooDeep(raw, NEST)) return fail("too_deep");
    if (unsafeNumber(raw)) return fail("bad_number");
    const way = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const problems = check(way);
    const pinned = isObj(way.seams) && Object.values(way.seams).every((s) => isObj(s) && typeof s.pkg === "string" && /^sha256:[0-9a-f]{64}$/.test(s.pkg));
    return { way: way as unknown as Way, ver: hashOf(way), problems, pinned, runs: problems.length === 0 && pinned };
  } catch {
    return fail("unreadable");
  }
}

/** the seams whose package print is not pinned yet (`sha256:tbd`): a way with one cannot be applied (FORMAT §10) */
export const unpinned = (way: Way): string[] => Object.keys(way.seams).filter((s) => !/^sha256:[0-9a-f]{64}$/.test(way.seams[s].pkg));

function check(w: Record<string, unknown>): Problem[] {
  const out: Problem[] = [];
  const bad = (at: string, why: string) => out.push({ at, why });
  /** an object with exactly these keys: the required ones there, nothing else */
  const keys = (at: string, o: unknown, need: string[], may: string[] = []): o is Record<string, unknown> => {
    if (!isObj(o)) { bad(at, "not_object"); return false; }
    if (Object.hasOwn(o, "ver") && at === "") bad("ver", "has_ver");
    for (const k of Object.keys(o)) if (!need.includes(k) && !may.includes(k) && !(k === "ver" && at === "")) bad(join(at, k), "unknown_key");
    for (const k of need) if (!Object.hasOwn(o, k)) bad(join(at, k), "missing");
    return true;
  };
  const map = (at: string, o: unknown): [string, unknown][] => {
    if (!isObj(o)) { bad(at, "not_object"); return []; }
    return Object.entries(o).filter(([k]) => (ID.test(k) ? true : (bad(join(at, k), "bad_id"), false)));
  };
  const str = (at: string, v: unknown, re?: RegExp) => { if (typeof v !== "string" || (re && !re.test(v))) bad(at, "bad_value"); };

  keys("", w, TOP);
  if (typeof w.way !== "number" || !Number.isInteger(w.way) || w.way < 1) bad("way", "bad_value");
  else if (w.way > FORMAT) bad("way", "newer_format");
  str("id", w.id, ID);
  str("name", w.name);
  if (w.prev !== "" && !(typeof w.prev === "string" && HEX.test(w.prev))) bad("prev", "bad_value");
  if (!zoneOk(w.zone)) bad("zone", "bad_zone");
  str("runner", w.runner, RUNNER);   // one Sol, `<machine>@<login>`: a bare login names no Sol

  // roles
  const roles = new Set<string>();
  for (const [id, role] of map("roles", w.roles)) {
    roles.add(id);
    const at = `roles.${id}`;
    if (!keys(at, role, ["name", "who"])) continue;
    str(`${at}.name`, role.name);
    if (!Array.isArray(role.who) || role.who.length === 0) bad(`${at}.who`, "bad_value");
    else role.who.forEach((x, i) => { if (typeof x !== "string" || !WHO.test(x)) bad(`${at}.who[${i}]`, "bad_who"); });
  }

  // things and their fields
  const fields = new Map<string, Record<string, string>>();
  for (const [id, t] of map("things", w.things)) {
    const at = `things.${id}`;
    if (!keys(at, t, ["name", "fields"])) continue;
    str(`${at}.name`, t.name);
    const f: Record<string, string> = {};
    for (const [name, type] of map(`${at}.fields`, t.fields)) {
      if (name.length > FIELD_MAX) bad(`${at}.fields.${name}`, "id_too_long");
      else if (typeof type !== "string" || !CARRY.test(type)) bad(`${at}.fields.${name}`, "unknown_type");
      else if (name === "born" && type.replace(/\?$/, "") !== "time") bad(`${at}.fields.born`, "bad_value");
      else f[name] = type;
    }
    fields.set(id, f);
  }
  /** the types a field has in the things that have it (born: time in all) */
  const typesOf = (name: string): string[] => (name === "born" ? ["time"] : [...fields.values()].filter((f) => Object.hasOwn(f, name)).map((f) => f[name]));

  // seams
  const seams = new Map<string, string>();
  for (const [id, s] of map("seams", w.seams)) {
    const at = `seams.${id}`;
    if (!keys(at, s, ["plugin", "pv", "pkg", "gives"])) continue;
    str(`${at}.plugin`, s.plugin, ID);
    if (typeof s.pv !== "number" || !Number.isInteger(s.pv) || s.pv < 1) bad(`${at}.pv`, "bad_value");
    if (typeof s.pkg !== "string" || s.pkg === "") bad(`${at}.pkg`, "empty_pkg");
    else if (!PKG.test(s.pkg)) bad(`${at}.pkg`, "bad_pkg");
    if (typeof s.gives !== "string" || !GIVES.includes(s.gives)) bad(`${at}.gives`, "bad_value");
    else seams.set(id, s.gives);
  }
  const checkSeams = [...seams.values()].filter((g) => g === "check").length;
  if (checkSeams > CHECKS_MAX) bad("seams", "too_many_checks");
  else if (pressBytes(checkSeams) > VALUE_MAX) bad("seams", "press_too_big");
  const seam = (at: string, id: unknown, gives: string) => {
    if (typeof id !== "string" || !seams.has(id)) bad(at, "dangling_seam");
    else if (seams.get(id) !== gives) bad(at, `seam_not_${gives}`);
  };

  // the triggers' ids first: moves name them in `by`
  const triggerIds = new Set(isObj(w.triggers) ? Object.keys(w.triggers) : []);

  // life: states and moves, one life a thing
  const states = new Set<string>();
  const moves = new Map<string, { kind: string; by: unknown }[]>();
  const lifeKinds = isObj(w.life) ? Object.keys(w.life) : [];
  for (const kind of fields.keys()) if (!lifeKinds.includes(kind)) bad(`life.${kind}`, "no_life");
  for (const [kind, life] of map("life", w.life)) {
    const at = `life.${kind}`;
    if (!fields.has(kind)) bad(at, "dangling_thing");
    if (!keys(at, life, ["states", "moves"])) continue;
    const own_ = new Set<string>(), ends = new Set<string>();
    for (const [sid, st] of map(`${at}.states`, life.states)) {
      const sat = `${at}.states.${sid}`;
      if (sid === "same") bad(sat, "reserved_state");
      if (sid.length > STATE_MAX) bad(sat, "id_too_long");
      own_.add(sid); states.add(sid);
      if (!keys(sat, st, ["name"], ["end", "enter"])) continue;
      str(`${sat}.name`, st.name);
      if (st.end !== undefined && typeof st.end !== "boolean") bad(`${sat}.end`, "bad_value");
      if (st.end === true) ends.add(sid);
      if (st.enter !== undefined) seam(`${sat}.enter`, st.enter, "act");
    }
    if (!Array.isArray(life.moves)) { bad(`${at}.moves`, "not_list"); continue; }
    const f = fields.get(kind) ?? {};
    let births = 0;
    const seen = new Set<string>();
    life.moves.forEach((m: unknown, i: number) => {
      const mat = `${at}.moves[${i}]`;
      if (!keys(mat, m, ["id", "from", "to", "by"], ["set", "fix", "when"])) return;
      if (typeof m.id !== "string" || !ID.test(m.id)) bad(`${mat}.id`, "bad_id");
      else if (seen.has(m.id)) bad(`${mat}.id`, "duplicate_move");
      else { seen.add(m.id); moves.set(m.id, [...(moves.get(m.id) ?? []), { kind, by: m.by }]); }
      // from: null (a birth), a state, or a list of states; never an end state (an ended thing stays ended)
      if (m.from === null) births++;
      else if (typeof m.from === "string" || (Array.isArray(m.from) && m.from.length > 0)) {
        for (const s of fromList(m.from as string | string[])) {
          if (typeof s !== "string" || !own_.has(s)) bad(`${mat}.from`, "dangling_state");
          else if (ends.has(s)) bad(`${mat}.from`, "from_end");
        }
      } else bad(`${mat}.from`, "bad_value");
      if (m.to === "same") { if (m.from === null) bad(`${mat}.to`, "same_at_birth"); }
      else if (typeof m.to !== "string" || !own_.has(m.to)) bad(`${mat}.to`, "dangling_state");
      if (!Array.isArray(m.by) || m.by.length === 0) bad(`${mat}.by`, "bad_value");
      else m.by.forEach((b: unknown, j: number) => {
        if (typeof b !== "string") bad(`${mat}.by[${j}]`, "bad_value");
        else if (b.startsWith("trigger:")) { if (!triggerIds.has(b.slice(8))) bad(`${mat}.by[${j}]`, "dangling_trigger"); }
        else if (!roles.has(b)) bad(`${mat}.by[${j}]`, "dangling_role");
      });
      if (m.set !== undefined) {
        if (!Array.isArray(m.set)) bad(`${mat}.set`, "bad_value");
        else m.set.forEach((s: unknown, j: number) => { if (typeof s !== "string" || s === "born" || !Object.hasOwn(f, s)) bad(`${mat}.set[${j}]`, "dangling_field"); });
      }
      if (m.fix !== undefined) {
        if (!isObj(m.fix)) bad(`${mat}.fix`, "bad_value");
        else for (const [k, v] of Object.entries(m.fix)) {
          if (k === "born" || !Object.hasOwn(f, k)) bad(`${mat}.fix.${k}`, "dangling_field");
          else if (!holds(f[k], v)) bad(`${mat}.fix.${k}`, "bad_fix");
        }
      }
      if (m.when !== undefined && (typeof m.when !== "string" || !(isObj(w.rules) && Object.hasOwn(w.rules, m.when)))) bad(`${mat}.when`, "dangling_rule");
    });
    if (births === 0) bad(at, "no_birth");
  }

  // rules: the forms, every name they use, and the types they compare
  const rule = (at: string, r: unknown, depth = 0): void => {
    if (depth > 32) { bad(at, "rule_too_deep"); return; }
    const form = formOf(r);
    if (!form) { bad(at, "unknown_rule_form"); return; }
    const x = r as Record<string, unknown>;
    switch (form) {
      case "all": case "any":
        if (!Array.isArray(x[form]) || (x[form] as unknown[]).length === 0) bad(`${at}.${form}`, "bad_value");
        else (x[form] as unknown[]).forEach((s, i) => rule(`${at}.${form}[${i}]`, s, depth + 1));
        return;
      case "not": rule(`${at}.not`, x.not, depth + 1); return;
      case "older": {
        const types = typeof x.field === "string" ? typesOf(x.field) : [];
        if (!types.length) bad(`${at}.field`, "dangling_field");
        else if (types.some((t) => t.replace(/\?$/, "") !== "time")) bad(`${at}.field`, "not_time");
        if (age(x.older) === null) bad(`${at}.older`, "bad_duration");
        return;
      }
      case "is": {
        const types = typeof x.field === "string" ? typesOf(x.field) : [];
        if (!types.length) bad(`${at}.field`, "dangling_field");
        if (x.is !== null && typeof x.is === "object") bad(`${at}.is`, "bad_value");
        else if (types.some((t) => (x.is === null ? !t.endsWith("?") : !holds(t, x.is)))) bad(`${at}.is`, "bad_is");
        return;
      }
      case "in":
        for (const s of Array.isArray(x.in) ? x.in : [x.in]) if (typeof s !== "string" || !states.has(s)) bad(`${at}.in`, "dangling_state");
        if (Array.isArray(x.in) && x.in.length === 0) bad(`${at}.in`, "bad_value");
        return;
      case "rule": if (typeof x.rule !== "string" || !(isObj(w.rules) && Object.hasOwn(w.rules, x.rule))) bad(`${at}.rule`, "dangling_rule"); return;
      case "check": seam(`${at}.check`, x.check, "check"); return;
      case "fired": if (typeof x.fired !== "string" || !triggerIds.has(x.fired)) bad(`${at}.fired`, "dangling_trigger"); return;
    }
  };
  const ruleMap = map("rules", w.rules);
  const rulesOf = w.rules as Record<string, unknown>;
  for (const [id, r] of ruleMap) rule(`rules.${id}`, r);
  // a rule that names itself, through any others, would never end
  const uses = (r: unknown, acc: string[] = []): string[] => {
    if (!isObj(r)) return acc;
    if (typeof r.rule === "string") acc.push(r.rule);
    for (const v of Object.values(r)) (Array.isArray(v) ? v : [v]).forEach((s) => uses(s, acc));
    return acc;
  };
  const loops = new Set<string>();
  for (const [id] of ruleMap) {
    const seen = new Set<string>(), todo = [...uses(own(rulesOf, id))];
    while (todo.length) {
      const next = todo.pop()!;
      if (next === id) { bad(`rules.${id}`, "rule_loop"); loops.add(id); break; }
      if (seen.has(next)) continue;
      seen.add(next);
      todo.push(...uses(own(rulesOf, next)));
    }
  }
  // how deep a judging goes and how many forms it holds once every rule it names is written out in its place. Each
  // named rule is worked out once; a chain of names deeper than a judging can go is cut off (no recursion past it)
  const deepOf = new Map<string, number>(), sizeOf = new Map<string, number>();
  const measure = (r: unknown, hops: number): { depth: number; size: number } => {
    if (hops > MAX_DEPTH + 1) return { depth: Infinity, size: Infinity };
    if (!isObj(r)) return { depth: 0, size: 1 };
    if (typeof r.rule === "string") {
      const id = r.rule;
      if (loops.has(id) || !Object.hasOwn(rulesOf, id)) return { depth: 1, size: 1 };   // named above already
      if (!deepOf.has(id)) { const m = measure(rulesOf[id], hops + 1); deepOf.set(id, m.depth); sizeOf.set(id, Math.min(m.size, SIZE + 1)); }
      return { depth: 1 + deepOf.get(id)!, size: 1 + sizeOf.get(id)! };
    }
    let depth = 0, size = 1;
    for (const v of Object.values(r)) for (const s of Array.isArray(v) ? v : [v]) {
      if (!isObj(s)) continue;
      const m = measure(s, hops + 1);
      depth = Math.max(depth, 1 + m.depth); size += m.size;
      if (size > SIZE) return { depth, size: SIZE + 1 };
    }
    return { depth, size };
  };
  const tooBig = (at: string, r: unknown, named: boolean) => {
    const m = measure(named ? { rule: r } : r, 0);
    if (m.depth > MAX_DEPTH) bad(at, "rule_too_deep");
    else if (m.size > SIZE) bad(at, "rule_too_big");
  };
  for (const [id] of ruleMap) if (!loops.has(id)) tooBig(`rules.${id}`, id, true);

  // triggers
  for (const [id, t] of map("triggers", w.triggers)) {
    const at = `triggers.${id}`;
    if (!keys(at, t, ["on", "do"], ["if"])) continue;
    if (!readOn(t.on) && !isEventOn(t.on)) bad(`${at}.on`, "bad_on");
    if (t.if !== undefined) { rule(`${at}.if`, t.if); tooBig(`${at}.if`, t.if, false); }
    const d = t.do;
    if (!isObj(d)) { bad(`${at}.do`, "bad_do"); continue; }
    if (Object.hasOwn(d, "ping")) {
      keys(`${at}.do`, d, ["ping"], ["say"]);
      if (typeof d.ping !== "string" || !roles.has(d.ping)) bad(`${at}.do.ping`, "dangling_role");
      if (d.say !== undefined && typeof d.say !== "string") bad(`${at}.do.say`, "bad_value");
    } else if (Object.hasOwn(d, "move")) {
      keys(`${at}.do`, d, ["move"]);
      const where = typeof d.move === "string" ? moves.get(d.move) : undefined;
      if (!where) bad(`${at}.do.move`, "dangling_move");
      else for (const m of where) if (!Array.isArray(m.by) || !m.by.includes(`trigger:${id}`)) bad(`${at}.do.move`, "trigger_cannot_move");
    } else if (Object.hasOwn(d, "act")) {
      keys(`${at}.do`, d, ["act"]);
      seam(`${at}.do.act`, d.act, "act");
    } else bad(`${at}.do`, "bad_do");
  }

  // record
  if (keys("record", w.record, ["home", "pings"])) {
    if (w.record.home !== "team" && w.record.home !== "local") bad("record.home", "bad_value");
    str("record.pings", w.record.pings);
  }

  // views
  if (keys("views", w.views, ["auto", "parts", "pages"])) {
    const v = w.views;
    if (!Array.isArray(v.auto)) bad("views.auto", "not_list");
    else v.auto.forEach((a: unknown, i: number) => { if (typeof a !== "string" || !AUTO.includes(a)) bad(`views.auto[${i}]`, "bad_value"); });
    if (!Array.isArray(v.parts)) bad("views.parts", "not_list");
    else v.parts.forEach((p: unknown, i: number) => {
      const at = `views.parts[${i}]`;
      if (!keys(at, p, ["id", "part", "of"], ["where", "show"])) return;
      str(`${at}.id`, p.id, ID);
      if (typeof p.part !== "string" || !PARTS.includes(p.part)) bad(`${at}.part`, "bad_value");
      if (typeof p.of !== "string" || !fields.has(p.of)) { bad(`${at}.of`, "dangling_thing"); return; }
      if (p.where !== undefined) { rule(`${at}.where`, p.where); tooBig(`${at}.where`, p.where, false); }
      const f = fields.get(p.of)!;
      if (p.show !== undefined) {
        if (!Array.isArray(p.show)) bad(`${at}.show`, "bad_value");
        else p.show.forEach((s: unknown, j: number) => { if (typeof s !== "string" || (s !== "born" && !Object.hasOwn(f, s))) bad(`${at}.show[${j}]`, "dangling_field"); });
      }
    });
    if (!Array.isArray(v.pages)) bad("views.pages", "not_list");
    else v.pages.forEach((p: unknown, i: number) => seam(`views.pages[${i}]`, p, "page"));
  }
  return out;
}

const join = (at: string, k: string) => (at ? `${at}.${k}` : k);
