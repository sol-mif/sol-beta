// Home's world (#1093): the 3D place, drawn with three.js on one canvas. The designer's scene (n13, 13 Nov): the same
// makeWorld(canvas, hands) as before, a different look and grammar.
//   The island floats on the window's glass (no sea, no fog, a clear canvas): one black, a pearl hairline on its rim.
//   Districts are hairline outlines, never grey slabs. One shape per kind: a folder is a pearl box with a lid, a sticky
//   a tile, a project a plinth of slabs (one per session), the Jelly project has its registry as pegs behind it, a
//   teammate a lamp, a past day a brick in the wall, the hour a bead on the arc.
//   What wants him stands on the island's front edge, with a hairline back to where it came from.
//   An agent working is a drop of his jelly: it leaves the jelly, hops to the tile, sits on it, and goes home after.
//   1-bit dither only while a thing arrives or changes. Names are HTML over the canvas (the kit's type), by level:
//   far (the island), mid (a district), near (one folder, its lid up, its tiles standing in front of it).
//   A press on a folder or a project first goes to it; hands.onPress comes on the second press (open it where it lives).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DOCK, ISLAND, PLAZA, SHELF, SLOTS, WORKSHOP, asks, folderSpots, projectSpots, type Box, type Folder, type Project, type Spot, type Thing, type WorldData } from "./model.ts";

export type Target =
  | { kind: "folder"; id: string; name: string; part: string }
  | { kind: "thing"; id: string; name: string; folder: string; mood: Thing["mood"] }
  | { kind: "project"; id: string; name: string; health: Project["health"] }
  | { kind: "session"; id: string; name: string; project: string; ghost?: boolean }   /* ghost: the dashed outline on the shelf (Jev thinks it is finished): a press shelves it */
  | { kind: "jelly"; id: "jelly"; name: string }
  | { kind: "part"; id: string; name: string }
  | { kind: "tie"; id: string; name: string }   /* Jev's pick 4: the dashed line between two things, pressed (id: `a|b`) */
  | { kind: "mate"; id: string; name: string }
  | { kind: "day"; id: string; name: string }
  | { kind: "hour"; id: "hour"; name: string }
  | { kind: "area"; id: string; name: string; project: string };   // one of the Jelly project's registry lights: "night · 26 systems · 9 broken"
type ThingT = Extract<Target, { kind: "thing" }>;
export type Hands = {
  onHover: (t: Target | null, x: number, y: number) => void;
  /** a sticky, a session, a teammate, a day: the press. A folder or a project: the second press (open it) */
  onPress: (t: Target) => void;
  onDrop: (thing: ThingT, folder: string) => void;
  onCarry: (t: ThingT | null, over: string | null) => void;
  /** dropped on his jelly: do it */
  onFeed?: (thing: ThingT) => void;
  /** dropped on the shelf: done */
  onShelve?: (thing: ThingT) => void;
  /** dropped on open ground at (x, z): Jev's pick 1 decides where it belongs; without this it glides back */
  onLoose?: (thing: ThingT, x: number, z: number) => void;
  /** a sticky dropped on a project: tie them (the sticky is with that project) */
  onTie?: (thing: ThingT, project: string) => void;
  /** a folder held (300 ms), dragged and left at another place in its district: the district's folders in their new order */
  onArrange?: (folder: string, part: string, order: string[]) => void;
  /** the level changed, or what the camera is on */
  onLevel?: (level: Level, on: string | null) => void;
  onFrame?: (fps: number) => void;
};
export type Level = "far" | "mid" | "near";
/** what a folder stands as, so a class is not a job is not money: a stack of books, a tray of cards, a jar of coins,
 *  a kettlebell with its plates, a plant, or a plain box. Read from the folder's own `form` when it has one (Jev's
 *  pick 6), else from its name and its part of life. What got done stays on it: books at the foot of the stack, cards
 *  lying in the tray, coins in the jar, plates by the bell, leaves on the plant. */
export type Form = "books" | "tray" | "jar" | "bell" | "plant" | "box";
export function formOf(f: { name: string; part: string; form?: Form }): Form {
  if (f.form) return f.form;
  const n = f.name.toLowerCase();
  if (/money|rent|bank|budget|tax|invoice|bills?|saving/.test(n)) return "jar";
  if (/gym|run|health|fit|sport|sleep|yoga|climb/.test(n)) return "bell";
  if (/school|class|course|study|uni/.test(f.part) || /^[a-z]{2,4}\s?\d{3}/.test(n)) return "books";
  if (/job|work|career|client|sales/.test(f.part)) return "tray";
  if (/life|home|family|self/.test(f.part)) return "plant";
  return "box";
}
/** what the scene draws beyond model.ts's WorldData; every field optional, each a real fact when given */
export type Extra = {
  hour?: number;                                                              // the real hour is used when absent
  days?: (number | { n: number; day: string; names?: string[] })[];             // past days, oldest first: the wall ("Thu 12", 5 done); with `names`, a brick pressed lays that day on the shelf
  newDay?: boolean;                                                           // the first look of a day: yesterday's brick goes from the shelf to the wall, once
  ties?: { thing: string; project: string }[];                                // a sticky (by name) tied to a project (by id): a hairline between them while either is under the pointer
  jelly?: string[];                                                           // his body's own five colours in the kit's order (JELLY.six.slice(0, 5)): foot to top
  doneAt?: number[];                                                          // hours today at which things got done: ticks on the arc
  registry?: { area: string; n: number; broken: number; parked?: boolean }[]; // part 5's areas, for the Jelly project
  offline?: boolean;                                                          // no engine: everything holds still
  edge?: string[];                                                            // (builder, n13) the front edge's order, first first (Jev's pick 2); the rest after, as asks() gives them
  pieces?: Record<string, { n: number; fresh?: number }>;                      // a project's pieces (part 1, work.pieces.list), by project id: a brick each on its plate; `fresh` of them changed since his last look
  style?: "solid" | "dither";                                                  // a second look he can switch to: the same island drawn in 1-bit pearl dots; state colours and his jelly keep their colour, names stay clean type
  shelved?: { id: string; name: string; project?: string }[];                  // sessions finished today (by his hand or Jev's pick 3 at 0.7): a done tile each on today's shelf, no slab on the plate
  lean?: { part: string; sure: boolean };                                      // Jev's pick 5, where the world opens: sure, that district wears a second rim and its name is bright; not sure, a dashed ring inside it, pressed: onPress gives the part
  tieMaybe?: { a: string; b: string }[];                                      // Jev's pick 4 (ids of folders, projects, stickies): a dashed line between the two with `tied?` at its middle; pressed: onPress gives { kind: "tie", id: `a|b` }
  tiesKept?: { a: string; b: string }[];                                      // ties he kept (pick 4 pressed; the same ids): a hairline between the two while either is under the pointer or pressed, as a sticky tied to a project has
  maybeDone?: string[];                                                       // session ids Jev thinks are finished (0.45 and over): a dashed outline on the shelf; pressed, onPress gives the session with ghost: true
  wall?: boolean;                                                             // a second screen: no hands, a slow drift
  past?: { hour: number; data: WorldData }[];                                 // the island as it was earlier today, oldest first: the bead pulled back shows it
};
export type World = {
  where: (id: string) => { x: number; y: number } | null; set: (d: WorldData & Extra) => void;
  view: (v: "all" | "home" | "build" | "near") => void; focus: (id: string) => void; up: () => boolean; level: () => Level;
  /** Jev's ghost (0.45 and over): a dashed hairline from a sticky to the folder it may belong in; a press on that folder files it (onDrop). null takes it away */
  hint: (thing: string | null, folder?: string) => void;
  /** the buttons are up on this sticky (null: away): its own name and the names behind the buttons hide meanwhile */
  acts: (id: string | null) => void;
  /** the island as it was at an earlier hour of today (the bead pulled back does this); null is now again */
  at: (hour: number | null) => void;
  /** a past day laid on the shelf (the index in `days`; a brick pressed does this); null is today again */
  day: (i: number | null) => void;
  dispose: () => void; fps: () => number;
};

const css = (name: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; } };
const WARM = ["#ff2e4e", "#ff4888", "#fb7129", "#f89b2a", "#f4c82a"];
/** the front edge, where what wants him stands */
/** the districts along the back, by how many parts of life there are: three stand as drawn (SLOTS); one or two share the same row, wider, so the island never carries a hole where a part is not (his real Home today: school and jobs) */
export const slotsFor = (n: number): Box[] => { const x0 = SLOTS[0].x - SLOTS[0].w / 2, x1 = SLOTS[2].x + SLOTS[2].w / 2, gap = 0.6, k = Math.max(1, Math.min(n, 2)), w = (x1 - x0 - gap * (k - 1)) / k; return n >= 3 ? SLOTS : Array.from({ length: k }, (_, i) => ({ x: x0 + w / 2 + i * (w + gap), z: SLOTS[0].z, w, d: SLOTS[0].d })); };
export const EDGE = { z: ISLAND.d / 2 - 1.2, x0: -ISLAND.w / 2 + 2.4, step: 3.4 } as const;
const T_MOVE = 700, T_HOP = 900, T_DITHER = 500, T_CAM = 9;   // ms, ms, ms, and the camera's ease per second (there in about 400 ms)

// ---- the 1-bit dither: a material that can be drawn through an ordered 4×4 screen, 0 (nothing) to 1 (whole) ----
function dithered<M extends THREE.Material>(m: M): M & { userData: { d: { value: number } } } {
  const d = { value: 1 }; m.userData.d = d;
  m.onBeforeCompile = (s) => {
    s.uniforms.uDither = d;
    s.fragmentShader = s.fragmentShader
      .replace("void main() {", "uniform float uDither;\nfloat w3bayer(vec2 p){ const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); vec2 c = mod(floor(p), 4.0); return (m[int(c.x + c.y * 4.0)] + 0.5) / 16.0; }\nvoid main() {")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n  if (uDither < 0.999 && w3bayer(gl_FragCoord.xy / 2.0) > uDither) discard;");
  };
  return m as M & { userData: { d: { value: number } } };
}

// ---- his jelly and its drops: the body's warm bands, lit, a soft rim; it breathes in the shader ----
function jellyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAmp: { value: 1 }, uC: { value: WARM.map((c) => new THREE.Color(c)) }, uGlow: { value: 0 } },
    vertexShader: `uniform float uT; uniform float uAmp; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vec3 p = position; float n = sin(p.x*3.0+uT*1.5)*sin(p.y*2.6+uT*1.1)*0.06 + sin(p.z*4.0-uT)*0.025; p += normal*n*uAmp; p.y *= 0.9;
        vec4 mv = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uC[5]; uniform float uT; uniform float uGlow; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ float h = clamp(vP.y*0.5+0.5 + sin(vP.x*2.0+uT*0.6)*0.06, 0.0, 0.999)*4.0; int i = int(floor(h)); vec3 col = mix(uC[i], uC[i+1], smoothstep(0.0,1.0,fract(h)));
        float f = pow(1.0-max(dot(vN,vV),0.0), 2.4); vec3 L = normalize(vec3(-0.5,0.8,0.6)); float d = max(dot(vN,L),0.0); float s = pow(max(dot(reflect(-L,vN),vV),0.0), 40.0);
        col = col*(0.62+0.5*d+uGlow*0.25) + vec3(1.0)*f*0.5 + vec3(1.0)*s*0.55; gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
}

type Calc = { p: THREE.Vector3; rx: number; s: number };
type Live = { key: string; obj: THREE.Object3D; target: Target; kind: "tile" | "folder" | "project" | "slab" | "other"; calc?: () => Calc; from: Calc; to: Calc; t0: number; dur: number; mood?: string; d?: { value: number }; d0: number; dMode: "in" | "blink" | null; lid?: THREE.Object3D; lidY?: number; fig?: THREE.Object3D; form?: Form; h?: number; bead?: { m: THREE.Object3D; w: number; d: number; y: number } };
type Drop = { m: THREE.Mesh; mode: "to" | "sit" | "home"; t0: number; from: THREE.Vector3; ask: boolean };
type Lab = { el: HTMLDivElement; at: THREE.Vector3; kind: "part" | "folder" | "project" | "thing" | "edge" | "mate"; id: string; own?: string; run?: boolean; w: number; w0: number; show: number; x: number; y: number; hid: boolean };
const RANK = { edge: 0, thing: 1, project: 2, folder: 3, mate: 4, part: 5 } as const;

export function makeWorld(canvas: HTMLCanvasElement, hands: Hands): World {
  const PEARL = new THREE.Color(css("--c-pearl", "#e6e1d8")), DEEP = new THREE.Color(css("--c-deep", "#0a0a0b"));
  const RUN = new THREE.Color(css("--green", "#70df45")), ASK = new THREE.Color(css("--sun", "#f4c82a")), BAD = new THREE.Color(css("--ember", "#fd302d"));
  const still = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setClearColor(0x000000, 0);          // the window stays glass
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
  const hemi = new THREE.HemisphereLight(0xf2f0ec, 0x0a0a0b, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 80 }); scene.add(sun, sun.target);

  // ---- materials ----
  const pearl = (o: THREE.MeshPhysicalMaterialParameters = {}) => dithered(new THREE.MeshPhysicalMaterial({ color: PEARL, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25, iridescence: 0.35, iridescenceIOR: 1.25, ...o }));
  const glow = (c: THREE.Color, k: number) => dithered(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.35 }));
  const line = (c: THREE.Color, a: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: a, depthWrite: false });
  const M = {
    island: new THREE.MeshPhysicalMaterial({ color: DEEP, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.65 }),   /* a faint broad sheen: by day the old shine lay as a white bar on the front rim, under the names there (the builder's stills 44, 65) */
    hair: line(PEARL, 0.34), hairDim: line(PEARL, 0.16), hairAsk: line(ASK, 0.5),
    dash: new THREE.LineDashedMaterial({ color: PEARL, transparent: true, opacity: 0.6, dashSize: 0.14, gapSize: 0.1 }),
    ghost: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    seam: new THREE.MeshBasicMaterial({ color: DEEP }), eye: new THREE.MeshBasicMaterial({ color: DEEP }),
    mat: new THREE.MeshPhysicalMaterial({ color: PEARL.clone().multiplyScalar(0.17), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
    dim: pearl({ color: PEARL.clone().multiplyScalar(0.36), iridescence: 0 }), post: pearl({ color: PEARL.clone().multiplyScalar(0.5), iridescence: 0 }),
    red: glow(BAD, 0.9), green: glow(RUN, 1.0), lampOn: glow(PEARL, 1.5), yellow: glow(ASK, 0.9),
    rain: new THREE.LineBasicMaterial({ color: PEARL, transparent: true, opacity: 0.4 }),
    cloud: new THREE.MeshStandardMaterial({ color: PEARL.clone().multiplyScalar(0.55), roughness: 0.9, flatShading: true }),
  };
  const tileMat = (mood: string) => mood === "run" ? glow(RUN, 0.5) : mood === "ask" ? glow(ASK, 0.85) : mood === "done" ? pearl({ color: PEARL.clone().multiplyScalar(0.42), iridescence: 0 }) : pearl({ color: new THREE.Color("#f4f1ea") });
  const G = {
    tile: new RoundedBoxGeometry(0.36, 0.05, 0.36, 2, 0.02), drop: new THREE.IcosahedronGeometry(1, 4), dot: new THREE.SphereGeometry(0.07, 14, 14),
    peg: new THREE.CylinderGeometry(0.045, 0.045, 1, 6), brick: new RoundedBoxGeometry(0.62, 0.2, 0.26, 1, 0.02), eye: new THREE.CapsuleGeometry(0.075, 0.13, 4, 10),
    stud: new THREE.CylinderGeometry(0.055, 0.055, 0.045, 12), bulb: new THREE.SphereGeometry(0.16, 20, 20), post: new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), puff: new THREE.IcosahedronGeometry(0.34, 0), bead: new THREE.SphereGeometry(0.2, 24, 24), ring: new THREE.TorusGeometry(0.2, 0.035, 8, 32),
  };
  /** a hairline with real width, lying on the ground: the outline of a rounded box */
  const outline = (b: Box, rad: number, mat: THREE.Material, t = 0.028) => {
    const path = (w: number, d: number, q: number) => { const s = new THREE.Shape(), x = -w / 2, y = -d / 2; s.moveTo(x + q, y); s.lineTo(x + w - q, y); s.quadraticCurveTo(x + w, y, x + w, y + q); s.lineTo(x + w, y + d - q); s.quadraticCurveTo(x + w, y + d, x + w - q, y + d); s.lineTo(x + q, y + d); s.quadraticCurveTo(x, y + d, x, y + d - q); s.lineTo(x, y + q); s.quadraticCurveTo(x, y, x + q, y); return s; };
    const sh = path(b.w, b.d, rad); sh.holes.push(path(b.w - t * 2, b.d - t * 2, Math.max(0.01, rad - t)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), mat); m.rotation.x = -Math.PI / 2; m.position.set(b.x, 0.012, b.z); m.renderOrder = 1; return m;
  };
  const strip = (x1: number, z1: number, x2: number, z2: number, mat: THREE.Material, t = 0.03) => { const len = Math.hypot(x2 - x1, z2 - z1); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, t), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1); m.position.set((x1 + x2) / 2, 0.014, (z1 + z2) / 2); m.renderOrder = 1; return m; };

  /** a folder's figure, standing at the back of its mat: its kind as a shape, and what got done as its growth */
  const figure = (form: Form, done: number, open: number, w: number, m: THREE.Material) => {
    const g = new THREE.Group(), fw = Math.min(0.95, w * 0.72), rnd = (i: number) => Math.sin(i * 12.9898 + w * 78.233) * 0.5; let h = 0.5, lid: THREE.Object3D | undefined;
    const box = (x: number, y: number, z: number, mat: THREE.Material, at: [number, number, number]) => { const b = new THREE.Mesh(new RoundedBoxGeometry(x, y, z, 1, Math.min(0.02, y / 3)), mat); b.position.set(...at); g.add(b); return b; };
    const cyl = (r1: number, r2: number, hh: number, mat: THREE.Material, at: [number, number, number]) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, hh, 28), mat); c.position.set(...at); g.add(c); return c; };
    if (form === "books") { // a book per open sticky on top, a book per finished one at the foot (the term's work, as a stack)
      const old = Math.min(5, done), n = old + Math.max(1, Math.min(5, open)); let y = 0;
      for (let i = 0; i < n; i++) { const bh = 0.125, b = box(fw * (0.84 + rnd(i) * 0.22), bh, 0.46, i < old ? M.post : m, [rnd(i + 7) * 0.07, y + bh / 2, rnd(i + 3) * 0.05]); b.rotation.y = rnd(i + 11) * 0.24; y += bh + 0.014; if (i === n - 1) lid = b; }
      h = y;
    } else if (form === "tray") { // a card tray: a card standing per open thing, the sent ones lying flat in front of them
      box(fw, 0.05, 0.5, m, [0, 0.025, 0]); box(fw, 0.3, 0.035, m, [0, 0.15, -0.232]); box(0.035, 0.2, 0.5, m, [-fw / 2 + 0.018, 0.1, 0]); box(0.035, 0.2, 0.5, m, [fw / 2 - 0.018, 0.1, 0]); box(fw, 0.09, 0.035, m, [0, 0.045, 0.232]);
      const cards: THREE.Object3D[] = []; for (let i = 0; i < Math.max(1, Math.min(6, open)); i++) { const c = box(fw * 0.8, 0.3, 0.018, tileMat("wait"), [0, 0.2, -0.17 + i * 0.055]); c.rotation.x = -0.22; cards.push(c); }
      for (let i = 0; i < Math.min(8, done); i++) box(fw * 0.74, 0.014, 0.16, M.post, [rnd(i) * 0.03, 0.058 + i * 0.016, 0.12]).rotation.y = rnd(i + 5) * 0.2;
      g.userData.cards = cards; h = 0.36;
    } else if (form === "jar") { // a jar: a coin per finished thing
      const glass = new THREE.MeshPhysicalMaterial({ color: PEARL, roughness: 0.15, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false }); cyl(0.26, 0.26, 0.03, m, [0, 0.015, 0]); { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.018, 8, 36), m); rim.rotation.x = Math.PI / 2; rim.position.y = 0.56; g.add(rim); }   // a base and a rim, so the glass reads on black
      for (let i = 0; i < Math.min(9, done); i++) cyl(0.19, 0.19, 0.045, i % 2 ? M.post : m, [rnd(i) * 0.05, 0.055 + i * 0.052, rnd(i + 4) * 0.05]);
      cyl(0.27, 0.25, 0.56, glass, [0, 0.28, 0]).renderOrder = 2; cyl(0.2, 0.27, 0.05, glass, [0, 0.585, 0]).renderOrder = 2; lid = cyl(0.215, 0.215, 0.07, m, [0, 0.645, 0]); h = 0.68;
    } else if (form === "bell") { // a kettlebell: a plate per finished thing
      const lift = new THREE.Group(); g.add(lift); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 28, 20), m); ball.scale.y = 0.88; ball.position.set(-0.14, 0.22, 0); const hd = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 10, 28), m); hd.position.set(-0.14, 0.47, 0); lift.add(ball, hd);
      for (let i = 0; i < Math.min(7, done); i++) cyl(0.17, 0.17, 0.05, i % 2 ? M.post : m, [0.28, 0.025 + i * 0.056, 0.02]);
      g.userData.lift = lift; h = 0.62;
    } else if (form === "plant") { // a plant: a leaf per finished thing
      cyl(0.24, 0.17, 0.26, m, [0, 0.13, 0]); const leaves = Math.min(6, done) + 1, sh = 0.16 + leaves * 0.066; const stem = new THREE.Group(); stem.position.y = 0.26; g.add(stem);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, sh, 8), m); st.position.y = sh / 2; stem.add(st);
      for (let i = 0; i < leaves; i++) { const lf = new THREE.Mesh(G.drop, i === leaves - 1 ? m : M.post), side = i % 2 ? 1 : -1; lf.scale.set(0.13, 0.03, 0.07); lf.position.set(side * 0.12, 0.1 + i * 0.066, 0); lf.rotation.z = side * 0.5; lf.rotation.y = rnd(i) * 0.8; stem.add(lf); }
      g.userData.sway = stem; h = 0.26 + sh;
    } else { // a plain box with a lid
      box(fw, 0.4, 0.46, m, [0, 0.2, 0]); box(fw - 0.04, 0.02, 0.42, M.seam, [0, 0.41, 0]); lid = box(fw + 0.04, 0.11, 0.5, m, [0, 0.475, 0]); h = 0.53;
    }
    g.traverse((c) => { const k = c as THREE.Mesh; if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } });
    return { g, h, lid };
  };
  const FIG = 1.2;    // the figure is what is read from far: drawn larger again than its mat
  const GROW = 1.35;  // how much larger than its slot in model.ts a folder is drawn
  const MAT = 0.07;   // the height of a folder's mat: its tiles lie on it, in front of its figure
  const busy = new Set<string>();   // the folders an agent is working in now

  // ---- the fixed ground ----
  const ground = new THREE.Group(); scene.add(ground);
  const island = new THREE.Mesh(new RoundedBoxGeometry(ISLAND.w, 1.0, ISLAND.d, 6, 0.5), M.island); island.position.y = -0.5; island.receiveShadow = true; ground.add(island);
  ground.add(outline({ x: 0, z: 0, w: ISLAND.w - 0.12, d: ISLAND.d - 0.12 }, 0.46, M.hair, 0.04));
  { // the soft shadow the island leaves on the glass
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!; const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND.w * 1.5, ISLAND.d * 1.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = -2.2; sh.renderOrder = -1; ground.add(sh);
  }
  ground.add(outline(WORKSHOP, 0.16, M.hair));
  { const m = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.535, 96), M.hairDim); m.rotation.x = -Math.PI / 2; m.position.set(PLAZA.x, 0.012, PLAZA.z); ground.add(m); }
  ground.add(outline(SHELF, 0.12, M.hairDim));
  ground.add(strip(-ISLAND.w / 2 + 0.7, EDGE.z - 0.5, ISLAND.w / 2 - 0.7, EDGE.z - 0.5, M.hairDim));        // the front edge's line
  // the day: an arc over the back of the island, a bead at the hour, ticks where things got done
  const arcAt = (u: number) => new THREE.Vector3(-Math.cos(u * Math.PI) * 11.4, Math.sin(u * Math.PI) * 4.2 + 0.2, -ISLAND.d / 2 + 0.1);
  const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => arcAt(i / 64))), new THREE.LineBasicMaterial({ color: PEARL, transparent: true, opacity: 0.28 })); const dayG = new THREE.Group(); ground.add(dayG); dayG.add(arc);   // the day (arc, bead, ticks): seen from far only, so nothing lies under the counts when he is close
  const bead = new THREE.Mesh(G.bead, new THREE.MeshBasicMaterial({ color: PEARL })); const moon = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: PEARL })); dayG.add(bead, moon);
  const ticks = new THREE.Group(); dayG.add(ticks); let socG: THREE.Group | null = null;
  // the weather is how his day is going, said by the bead alone: four or more things want him, a small cloud sits in front of it and the light drops a little;
  // nothing wants him and something got done today, a thin halo round it; else the plain bead. It clears the moment he clears the front edge.
  const skyCloud = new THREE.Group(); [[-0.34, 0, 0, 1], [0.1, 0.12, 0.05, 1.3], [0.5, -0.02, -0.04, 0.95]].forEach(([x, y, z, k]) => { const m = new THREE.Mesh(G.puff, M.cloud); m.position.set(x, y, z); m.scale.setScalar(k); skyCloud.add(m); }); skyCloud.scale.setScalar(0); dayG.add(skyCloud);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: PEARL, transparent: true, opacity: 0 })); dayG.add(halo);
  let weather = 0, cloudK = 0;   // 1 clouded, -1 clear, 0 plain
  const beadHit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), M.ghost); ground.add(beadHit);        // the bead is small; its hold is larger

  // ---- his jelly on the plaza ----
  const JM = jellyMaterial(); const J = new THREE.Mesh(G.drop, JM); J.scale.setScalar(0.78); J.position.set(PLAZA.x, 0.74, PLAZA.z); J.castShadow = true; scene.add(J);
  const eyes = new THREE.Group(); [-1, 1].forEach((k) => { const e = new THREE.Mesh(G.eye, M.eye); e.position.set(k * 0.19, 0.06, 0.76); eyes.add(e); }); eyes.position.copy(J.position); scene.add(eyes);
  const jl = new THREE.PointLight(0xff8a5c, 0, 5, 1.6); jl.position.set(PLAZA.x, 1.3, PLAZA.z); scene.add(jl);
  let gulp = 0, blinkAt = 3000, lookX = 0, lookY = 0, handAt = performance.now(), hadAsks = 0;

  // ---- the things that change ----
  const things = new THREE.Group(); scene.add(things);
  let leanOn: string | null = null;   // the district Jev is sure the day starts in: its name bright
  const live = new Map<string, Live>(); const drops = new Map<string, Drop>(); const pickables: THREE.Object3D[] = []; const rains: THREE.Object3D[] = []; const tethers: THREE.Object3D[] = [];
  const memo = new Map<string, { c: Calc; mood?: string }>();
  let data: (WorldData & Extra) | null = null; let folderAt = new Map<string, Spot>(); let projectAt = new Map<string, Spot>(); let open: string | null = null; let on: string | null = null; let dayOn: number | null = null;   /* a past day laid on the shelf (its brick pressed) */
  const tag = (o: THREE.Object3D, t: Target) => o.traverse((c) => (c.userData.target = t));
  const keyOf = (t: { id: string; name: string }, kind: string) => (kind === "thing" ? `t:${t.name}` : `${kind[0]}:${t.id}`);

  // names: HTML over the canvas, in the kit's type
  const host = document.createElement("div"); host.className = "w3-labels"; canvas.parentElement?.appendChild(host); let labs: Lab[] = [];
  const hourEl = document.createElement("div"); hourEl.className = "w3-l hour"; host.appendChild(hourEl);        // the hour, shown only while the bead is pulled back
  const ringEl = document.createElement("div"); ringEl.className = "w3-ring"; host.appendChild(ringEl);          // the pearl ring on the thing the keys are on
  const label = (text: string, at: THREE.Vector3, kind: Lab["kind"], id: string, own?: string, run?: boolean) => { const el = document.createElement("div"); el.className = `w3-l ${kind}`; el.textContent = kind !== "thing" && kind !== "edge" && text.length > 19 ? `${text.slice(0, 18)}…` : text; el.style.opacity = "0"; host.appendChild(el); labs.push({ el, at, kind, id, own, run, w: 0, w0: 0, show: -1, x: 0, y: 0, hid: false }); };

  let SL: Box[] = SLOTS;   // this island's districts (slotsFor)
  let eStep: number = EDGE.step;   // the front edge's step: wider when few things wait, so their names read whole
  const tileCalc = (t: Thing, f: Folder, sp: Spot, k: number, n: number, edge: Map<string, number>, shelfK: number) => (): Calc => {
    if (t.mood === "ask") return { p: new THREE.Vector3(EDGE.x0 + (edge.get(t.id) ?? 0) * eStep, 0.4, EDGE.z), rx: 1.0, s: 2.1 };
    if (t.mood === "done") { const col = shelfK % 7, row = Math.floor(shelfK / 7); return { p: new THREE.Vector3(SHELF.x - SHELF.w / 2 + 0.36 + col * 0.46, 0.04, SHELF.z - SHELF.d / 2 + 0.34 + row * 0.46), rx: 0, s: 1 }; }
    if (open === f.id) {   /* (builder, n13) the open folder's row stays inside its district: many overlap like a hand of cards, never past the outline */
      const D = SL.find((b) => Math.abs(sp.x - b.x) <= b.w / 2), lo = D ? D.x - D.w / 2 + 0.55 : -Infinity, hi = D ? D.x + D.w / 2 - 0.55 : Infinity;
      const step = n > 1 ? Math.min(1.3, (hi - lo) / (n - 1)) : 0, half = ((n - 1) * step) / 2, cx = Math.min(Math.max(sp.x, lo + half), hi - half);
      return { p: new THREE.Vector3(cx + (k - (n - 1) / 2) * step, 0.3 + k * 0.004, sp.z + sp.d / 2 + 1.25), rx: 1.0, s: 1.6 };
    }
    const step = n > 1 ? Math.min(0.42, (sp.w - 0.4) / (n - 1)) : 0, x = sp.x - ((n - 1) * step) / 2 + k * step, z = sp.z + sp.d / 2 - 0.24;   // one row on the front of the mat; many overlap like a hand of cards
    return t.mood === "run" ? { p: new THREE.Vector3(x, MAT + 0.2, z), rx: 1.0, s: 1 } : { p: new THREE.Vector3(x, MAT + 0.03 + k * 0.006, z), rx: step < 0.36 ? 0.16 : 0, s: 1 };
  };
  const add = (key: string, obj: THREE.Object3D, target: Target, kind: Live["kind"], calc: (() => Calc) | undefined, mood: string | undefined, d: { value: number } | undefined, now: number, more: Partial<Live> = {}) => {
    const was = memo.get(key); const to = calc ? calc() : { p: obj.position.clone(), rx: 0, s: 1 }; const from = was ? was.c : to;
    const born = !was, changed = !!was && was.mood !== mood; const moved = !!was && was.c.p.distanceTo(to.p) > 0.02;
    obj.position.copy(from.p); obj.rotation.x = from.rx; if (kind === "tile") obj.scale.setScalar(from.s);
    if (d) d.value = born && !still && firstSet ? 0 : 1;
    live.set(key, { key, obj, target, kind, calc, from, to, t0: moved ? now : 0, dur: still ? 1 : T_MOVE, mood, d, d0: (born && firstSet) || changed ? now : 0, dMode: born && firstSet ? "in" : changed ? "blink" : null, ...more });
  };
  const ARR = 1;   // the arrival's pace (1 as designed; larger only to look at it slowly)
  let arr0 = 0; let firstSet = false, laid = false; const ghosts: { m: THREE.Mesh; d: { value: number }; t0: number }[] = [];
  const slots = new Map<string, { id: string; x: number; z: number }[]>(), folderLab = new Map<string, THREE.Vector3>();
  let arranging: { id: string; part: string; order: string[] } | null = null, holdT = 0;
  const hints = new THREE.Group(); scene.add(hints); let hinted: { thing: ThingT; folder: string } | null = null;
  const hint = (thing: string | null, folder?: string) => {
    hints.clear(); hinted = null; const l = thing ? [...live.values()].find((x) => x.target.id === thing && x.target.kind === "thing") : null, sp = folder ? folderAt.get(folder) : null; if (!l || !sp || !folder) return;
    const a = new THREE.Vector3(l.to.p.x, 0.03, l.to.p.z), b = new THREE.Vector3(sp.x, 0.03, sp.z + sp.d / 2 + 0.1);
    // dashes with real width, above the mats, so the ghost is seen from far too: from the tile to the folder, and round the folder
    const dashes = (x1: number, z1: number, x2: number, z2: number) => { const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 0.3)); for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 0.55) / n, d = strip(x1 + (x2 - x1) * u0, z1 + (z2 - z1) * u0, x1 + (x2 - x1) * u1, z1 + (z2 - z1) * u1, M.hair, 0.045); d.position.y = 0.1; d.renderOrder = 3; hints.add(d); } };
    dashes(a.x, a.z, b.x, b.z); const hw = sp.w / 2 + 0.16, hd = sp.d / 2 + 0.16; dashes(sp.x - hw, sp.z - hd, sp.x + hw, sp.z - hd); dashes(sp.x + hw, sp.z - hd, sp.x + hw, sp.z + hd); dashes(sp.x + hw, sp.z + hd, sp.x - hw, sp.z + hd); dashes(sp.x - hw, sp.z + hd, sp.x - hw, sp.z - hd);
    hinted = { thing: l.target as ThingT, folder };
  };

  const shared = new Set<THREE.Material>(Object.values(M));
  const dupe = new Map<string, number>();   // (builder, n13) two stickies of one name in two folders: the second keeps its own key
  function build(d: WorldData & Extra) {
    SL = slotsFor(d.parts.length);
    dupe.clear();
    const now = performance.now();
    memo.clear(); for (const l of live.values()) memo.set(l.key, { c: { p: l.obj.position.clone(), rx: l.obj.rotation.x, s: l.obj.scale.x }, mood: l.mood });
    for (const o of [...things.children]) { things.remove(o); o.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry && !Object.values(G).includes(m.geometry as any)) m.geometry.dispose(); if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();   /* the studs: an instanced mesh keeps its own buffer (the third reviewer, lead 04:27, 4) */ const mm = m.material as THREE.Material | undefined; if (mm && mm !== JM && !shared.has(mm)) mm.dispose(); }); }   // a rebuild frees what it made: its own geometries and materials, never the shared ones
    live.clear(); busy.clear(); pickables.length = 0; rains.length = 0; tethers.length = 0; labs.forEach((l) => l.el.remove()); labs = [];
    const want = asks(d); if (d.edge?.length) { const o = d.edge; want.sort((a, b) => (o.indexOf(a.id) + 1 || 999) - (o.indexOf(b.id) + 1 || 999)); }   /* (builder, n13) Jev's pick 2: the order he is asked in; his jelly pressed goes to the first */ const edge = new Map(want.map((a, i) => [a.id, i])); let shelfK = 0; eStep = Math.min(5.6, Math.max(EDGE.step, (ISLAND.w - 5.2) / Math.max(1, want.length)));
    folderAt = new Map(); slots.clear(); folderLab.clear(); projectAt = projectSpots(d.projects);
    const tether = (id: string, to: { x: number; z: number; d: number }) => { const m = strip(EDGE.x0 + (edge.get(id) ?? 0) * eStep, EDGE.z - 0.3, to.x, to.z + to.d / 2 + 0.05, M.hairAsk, 0.03); m.visible = false; m.userData.tether = id; things.add(m); tethers.push(m); };

    d.parts.slice(0, SL.length).forEach((p, pi) => {
      const b = SL[pi]; const o = outline(b, 0.16, M.hair); tag(o, { kind: "part", id: p.id, name: p.name }); things.add(o);
      label(p.name, new THREE.Vector3(b.x - b.w / 2 + 0.3, 0, b.z + b.d / 2 - 0.2), "part", p.id);
      const spots = folderSpots(p, b); slots.set(p.id, p.folders.map((f) => { const q = spots.get(f.id)!; return { id: f.id, x: q.x, z: q.z }; }));
      const grow = new Set([...spots.values()].map((q) => q.z.toFixed(2))).size > 1 ? 1.05 : GROW;   // two rows in a district: smaller, so a figure never stands over the name of the folder behind it
      p.folders.forEach((f) => {
        const q0 = spots.get(f.id)!, sp: Spot = { ...q0, w: q0.w * grow, d: q0.d * grow }; folderAt.set(f.id, sp); const ft: Target = { kind: "folder", id: f.id, name: f.name, part: f.part };   // drawn larger than its slot, so it is read from far
        const g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); things.add(g);
        if (!f.set) { // not set up: a dashed outline he can press
          /* drawn as the piece not yet placed: its footprint in dashes and its own figure (books, tray, jar …) unlit, in graphite, so his island reads as his life before anything is set up; the ones set up are the pearl ones */
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(sp.w, sp.d)), M.dash); e.rotation.x = -Math.PI / 2; e.computeLineDistances(); e.position.y = 0.02; g.add(e);
          const fig = figure(formOf(f as Folder & { form?: Form }), 0, 2, sp.w, M.mat), solid: THREE.Mesh[] = []; fig.g.traverse((c) => { if ((c as THREE.Mesh).isMesh) solid.push(c as THREE.Mesh); });
          solid.forEach((k) => { const own = k.material as THREE.Material; if (own.transparent) { k.parent!.remove(k); k.geometry.dispose(); own.dispose(); return; }   /* the jar's glass: its rim and base say it */ k.material = d.style === "dither" ? M.dim : M.mat;   /* in dots graphite would be black: the quiet grey gives it a few dots */ k.castShadow = false; });
          fig.g.scale.setScalar(grow * FIG); fig.g.position.set(0, 0.02, -sp.d / 2 + 0.3 * grow * FIG); g.add(fig.g);
          const hit = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.5, sp.d), M.ghost); hit.position.y = 0.25; g.add(hit); pickables.push(hit);
        } else {
          const pm = pearl(), mat = new THREE.Mesh(new RoundedBoxGeometry(sp.w, MAT, sp.d, 2, 0.03), M.mat);   /* the mat is quiet (graphite), so the figure and the tiles on it are what is read */ mat.position.y = MAT / 2; mat.castShadow = mat.receiveShadow = true; g.add(mat); pickables.push(mat);
          const form = formOf(f as Folder & { form?: Form }), fig = figure(form, f.things.filter((t) => t.mood === "done").length, f.things.filter((t) => t.mood !== "done").length, sp.w, pm);
          fig.g.scale.setScalar(grow * FIG); fig.g.position.set(0, MAT, -sp.d / 2 + 0.3 * grow * FIG); g.add(fig.g); fig.g.traverse((c) => { if ((c as THREE.Mesh).isMesh) pickables.push(c); });
          if (f.things.some((t) => t.mood === "run")) busy.add(f.id);
          add(keyOf(f, "folder"), g, ft, "folder", undefined, f.set ? "set" : "unset", (pm as any).userData.d, now, { lid: fig.lid, lidY: fig.lid?.position.y, fig: fig.g, form, h: MAT + fig.h });
        }
        tag(g, ft); if (!f.set) live.set(keyOf(f, "folder"), { key: keyOf(f, "folder"), obj: g, target: ft, kind: "folder", from: { p: g.position.clone(), rx: 0, s: 1 }, to: { p: g.position.clone(), rx: 0, s: 1 }, t0: 0, dur: 1, d0: 0, dMode: null });
        { const at = new THREE.Vector3(sp.x, 0, sp.z + sp.d / 2 + 0.22); folderLab.set(f.id, at); label(f.name, at, "folder", f.id); }
        const openT = f.things.filter((t) => t.mood !== "done"), roof = openT.filter((t) => t.mood !== "ask");
        f.things.forEach((t) => {
          if (t.mood === "done" && (t as Thing & { old?: boolean }).old) return;
          if (t.mood === "done" && dayOn !== null) return;   // a past day lies on the shelf: today's leave through the dither and come back the same way   // done before today: it is in the figure (a book, a coin, a leaf) and in the wall, not on today's shelf
          const tt: ThingT = { kind: "thing", id: t.id, name: t.name, folder: f.id, mood: t.mood };
          const m = new THREE.Mesh(G.tile, tileMat(t.mood)); m.castShadow = true; tag(m, tt); things.add(m); pickables.push(m);
          const k = roof.indexOf(t), nk = keyOf(t, "thing"), nth = dupe.get(nk) ?? 0; dupe.set(nk, nth + 1); add(nth ? `${nk}~${nth}` : nk, m, tt, "tile", tileCalc(t, f, sp, Math.max(0, k), roof.length, edge, t.mood === "done" ? shelfK++ : 0), t.mood, (m.material as any).userData.d, now);
          if (t.mood === "ask") tether(t.id, sp);
          if (t.mood !== "done") label(t.name, m.position, t.mood === "ask" ? "edge" : "thing", t.id, f.id, t.mood === "run");
        });
      });
    });

    label("build", new THREE.Vector3(WORKSHOP.x - WORKSHOP.w / 2 + 0.3, 0, WORKSHOP.z + WORKSHOP.d / 2 - 0.2), "part", "build");
    d.projects.forEach((p) => {
      const sp = projectAt.get(p.id)!; const pt: Target = { kind: "project", id: p.id, name: p.name, health: p.health };
      const g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); things.add(g); const quiet = p.health === "idle";
      const base = new THREE.Mesh(new RoundedBoxGeometry(sp.w, 0.16, sp.d, 2, 0.05), quiet ? M.dim : pearl()); base.position.y = 0.08; base.castShadow = base.receiveShadow = true; g.add(base); pickables.push(base); tag(g, pt);
      add(keyOf(p, "project"), g, pt, "project", undefined, p.health, undefined, now);
      { // a build plate, not a slab: studs over its top (a place where things are snapped together), and each of the project's pieces a brick snapped on along the back
        const pm = base.material as THREE.Material, nx = 7, nz = 5, studs = new THREE.InstancedMesh(G.stud, pm, nx * nz), mx = new THREE.Matrix4();
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { mx.setPosition(-sp.w / 2 + (sp.w * (i + 0.5)) / nx, 0.18, -sp.d / 2 + (sp.d * (j + 0.5)) / nz); studs.setMatrixAt(i * nz + j, mx); }
        studs.castShadow = true; g.add(studs);
        const pc = d.pieces?.[p.id], nB = Math.min(15, pc?.n ?? 0), per = 5, bw = (sp.w * 0.92) / per, bd = sp.d * 0.24, fresh = Math.min(nB, pc?.fresh ?? 0);
        for (let k = 0; k < nB; k++) { const row = Math.floor(k / per), col = k % per, half = row % 2 ? bw / 2 : 0; if (half && col === per - 1) continue;   // a running bond: every second row sits half a brick over, one brick fewer
          const b = new THREE.Mesh(new RoundedBoxGeometry(bw - 0.035, 0.17, bd, 1, 0.02), quiet ? M.dim : k % 2 ? M.post : pm); b.position.set(-sp.w * 0.46 + bw * (col + 0.5) + half, 0.16 + 0.085 + row * 0.18, -sp.d / 2 + bd / 2 + 0.05); b.castShadow = b.receiveShadow = true; g.add(b);
          if (k >= nB - fresh) { const y = new THREE.Mesh(G.dot, M.yellow); y.scale.setScalar(0.7); y.position.set(b.position.x, b.position.y + 0.11, b.position.z); g.add(y); } }
        g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== base) pickables.push(c); }); tag(g, pt);
      }
      label(p.name, new THREE.Vector3(sp.x, 0, sp.z + sp.d / 2 + 0.3), "project", p.id);
      p.sessions.filter((s) => !d.shelved?.some((x) => x.id === s.id)).forEach((s, k) => { // a slab per session, stacked (a shelved one lies on the shelf instead)
        const st: Target = { kind: "session", id: s.id, name: s.title, project: p.name }; const has = !!d.pieces?.[p.id]?.n, w = sp.w * 0.86, dd = sp.d * (has ? 0.56 : 0.8), y = 0.2 + k * 0.3 + 0.12;   // with bricks along the back, the sessions lie in front of them
        const mood = s.waiting ? "ask" : s.busy ? "run" : s.failed ? "bad" : "wait";
        const slab = new THREE.Mesh(new RoundedBoxGeometry(w, 0.24, dd, 2, 0.05), quiet || s.failed ? M.dim : pearl()); slab.castShadow = slab.receiveShadow = true; tag(slab, st); things.add(slab); pickables.push(slab);
        const at = new THREE.Vector3(sp.x, y, sp.z + (has ? sp.d * 0.17 : 0)); let b: Live["bead"];
        if (s.busy) { const m = new THREE.Mesh(G.dot, M.green); tag(m, st); things.add(m); b = { m, w: w / 2 + 0.03, d: dd / 2 + 0.03, y }; }
        if (s.waiting) { const m = new THREE.Mesh(G.dot, M.yellow); m.position.set(sp.x + w / 2 - 0.1, y + 0.17, sp.z + dd / 2 - 0.1); things.add(m); }
        if (s.failed) { const m = new THREE.Mesh(G.dot, M.red); m.position.set(sp.x + w / 2 - 0.1, y + 0.17, sp.z + dd / 2 - 0.1); things.add(m); }
        add(`s:${s.id}`, slab, st, "slab", () => ({ p: at, rx: 0, s: 1 }), mood, (slab.material as any).userData?.d, now, { bead: b });
        if (s.waiting) { // its copy stands on the front edge
          const m = new THREE.Mesh(G.tile, tileMat("ask")); m.castShadow = true; tag(m, st); things.add(m); pickables.push(m);
          add(`e:${s.id}`, m, st, "tile", () => ({ p: new THREE.Vector3(EDGE.x0 + (edge.get(s.id) ?? 0) * eStep, 0.4, EDGE.z), rx: 1.0, s: 2.1 }), "ask", (m.material as any).userData.d, now);
          tether(s.id, sp); label(s.title, m.position, "edge", s.id);
        }
      });
      if (p.health === "broken") { // its own small weather
        const c = new THREE.Group(); [[-0.3, 0, 0, 1], [0.12, 0.1, 0.05, 1.25], [0.5, -0.02, -0.04, 0.9]].forEach(([x, y, z, s]) => { const m = new THREE.Mesh(G.puff, M.cloud); m.position.set(x, y, z); m.scale.setScalar(s); c.add(m); });
        const top = 0.2 + p.sessions.length * 0.3 + 1.5; c.position.set(sp.x, top, sp.z); things.add(c);
        const pts: number[] = []; for (let i = 0; i < 26; i++) { const x = (Math.random() - 0.5) * 1.1, y = -Math.random() * 1.2, z = (Math.random() - 0.5) * 0.7; pts.push(x, y, z, x - 0.02, y - 0.16, z); }
        const rn = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), M.rain); rn.position.set(sp.x, top - 0.25, sp.z); things.add(rn); rains.push(rn);
      }
      const pegs = p.jelly ? d.registry ?? p.checks?.map((c) => ({ area: c.name, n: 20, broken: c.ok ? 0 : 1, parked: false })) : undefined;
      if (pegs?.length) { // the registry along the Jelly project's front: a small light per area, larger the more systems it holds, red where one is broken
        const max = Math.max(...pegs.map((a) => a.n)), gap = Math.min(0.2, (sp.w + 0.5) / pegs.length);
        pegs.forEach((a, i) => { const m = new THREE.Mesh(G.dot, a.broken >= 3 || a.broken / Math.max(1, a.n) >= 0.1 ? M.red : a.parked ? M.dim : M.lampOn); m.scale.setScalar(0.35 + (a.n / max) * 0.35); m.position.set(sp.x - ((pegs.length - 1) * gap) / 2 + i * gap, 0.05, sp.z + sp.d / 2 + 0.16); things.add(m);
          const hit = new THREE.Mesh(G.dot, M.ghost); hit.scale.setScalar(1.5); hit.position.copy(m.position); tag(hit, { kind: "area", id: a.area, name: `${a.area} · ${a.n} systems${a.broken ? ` · ${a.broken} broken` : ""}${a.parked ? " · parked" : ""}`, project: p.id }); things.add(hit); pickables.push(hit); });
      }
    });
    if (dayOn === null) { // sessions on today's shelf: the ones finished lie there as done tiles; the ones Jev thinks are finished have a dashed outline waiting for them
      const spot = (k: number) => new THREE.Vector3(SHELF.x - SHELF.w / 2 + 0.36 + (k % 7) * 0.46, 0.04, SHELF.z - SHELF.d / 2 + 0.34 + Math.floor(k / 7) * 0.46);
      (d.shelved ?? []).forEach((x) => { const st: Target = { kind: "session", id: x.id, name: x.name, project: x.project ?? "" }, at = spot(shelfK++); const m = new THREE.Mesh(G.tile, tileMat("done")); m.castShadow = true; tag(m, st); things.add(m); pickables.push(m);
        add(`s:${x.id}`, m, st, "tile", () => ({ p: at, rx: 0, s: 1 }), "done", (m.material as any).userData.d, now); });   /* the slab's own key: it comes from its plate to the shelf */
      (d.maybeDone ?? []).forEach((id) => { const p = d.projects.find((q) => q.sessions.some((x) => x.id === id)), x = p?.sessions.find((q) => q.id === id); if (!p || !x || d.shelved?.some((q) => q.id === id)) return;
        const st: Target = { kind: "session", id, name: x.title, project: p.name, ghost: true }, at = spot(shelfK++);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.36, 0.36)), M.dash); e.rotation.x = -Math.PI / 2; e.computeLineDistances(); e.position.set(at.x, 0.03, at.z); things.add(e);
        const hit = new THREE.Mesh(G.tile, M.ghost); hit.scale.setScalar(1.6); hit.position.copy(at); tag(hit, st); things.add(hit); pickables.push(hit);
        label(`done? ${x.title}`, new THREE.Vector3(at.x - 0.18, 0, at.z + 0.42), "mate", `maybe:${id}`)   /* starts at the outline's left edge: centred, its first word lay across the shelf's hairline (the builder's still 82) */; });   /* the outline is ten pixels from far (the builder, 05:45): its name and the question stand under it, and the place to press is larger than the outline */
    }

    // the wall: a brick per past day, seven to a row
    (d.days ?? []).forEach((q, i, all) => { const n = typeof q === "number" ? q : q.n, day = typeof q === "number" ? "" : `${q.day} · `; const m = new THREE.Mesh(G.brick, dayOn === i ? M.hair : n ? M.post : M.dim); const col = i % 7, row = Math.floor(i / 7); const at = new THREE.Vector3(-ISLAND.w / 2 + 1.4 + col * 0.68 + (row % 2) * 0.34, 0.1 + row * 0.22 + (dayOn === i ? 0.16 : 0), -ISLAND.d / 2 + 0.75); m.position.copy(at); m.castShadow = true; const dt: Target = { kind: "day", id: String(i), name: `${day}${n} done` }; tag(m, dt); things.add(m); pickables.push(m);
      if (d.newDay && i === all.length - 1 && !laid && !still) { laid = true; const from = { p: new THREE.Vector3(SHELF.x, 0.3, SHELF.z), rx: 0, s: 1 }; m.position.copy(from.p); live.set("d:new", { key: "d:new", obj: m, target: dt, kind: "other", from, to: { p: at, rx: 0, s: 1 }, t0: now + 700, dur: 1100, d0: 0, dMode: null }); } });
    // a past day, its brick pressed: what he finished that day lies on the shelf in place of today's, the day's name at the shelf's corner. Hover a tile: its name. Esc, the brick again, or a pick-up: today is back.
    { const q = dayOn === null ? null : d.days?.[dayOn]; const names = q && typeof q !== "number" ? q.names ?? [] : [];
      if (dayOn !== null && !names.length) dayOn = null;
      else if (q && typeof q !== "number") { label(q.day, new THREE.Vector3(SHELF.x - SHELF.w / 2, 0, SHELF.z + SHELF.d / 2), "part", "day");
        names.slice(0, 21).forEach((name, k) => { const m = new THREE.Mesh(G.tile, tileMat("done")); m.castShadow = true; const dt: Target = { kind: "day", id: `${dayOn}/${k}`, name }; tag(m, dt); things.add(m); pickables.push(m);
          const col = k % 7, row = Math.floor(k / 7), at = new THREE.Vector3(SHELF.x - SHELF.w / 2 + 0.36 + col * 0.46, 0.04, SHELF.z - SHELF.d / 2 + 0.34 + row * 0.46);
          add(`w:${dayOn}/${k}`, m, dt, "other", () => ({ p: at, rx: 0, s: 1 }), "done", (m.material as any).userData.d, now + k * 40); }); } }
    // the dock: a lamp per teammate
    if (d.mates.length) things.add(outline({ x: DOCK.x - 1.7, z: DOCK.z, w: 1.0, d: 3.4 }, 0.12, M.hairDim));   // the dock is there when somebody is: no empty box in a Home with no teammates read yet
    d.mates.forEach((p, i) => { const z = DOCK.z - 1.45 + i * 1.6, x = DOCK.x - 1.7; const post = new THREE.Mesh(G.post, M.post); post.scale.y = 0.6; post.position.set(x, 0.21, z);   /* a short lamp: the one in front never stands over the name of the one behind (the builder's still 61) */ const b = new THREE.Mesh(G.bulb, p.on ? M.lampOn : M.dim); b.position.set(x, 0.5, z); b.castShadow = !p.on; const g = new THREE.Group(); g.add(post, b); tag(g, { kind: "mate", id: p.name, name: p.name }); things.add(g); pickables.push(b);
      if (p.on) { const pl = new THREE.PointLight(0xfff4e0, 1.4, 3.2); pl.position.set(x, 0.62, z); things.add(pl); }
      label(p.name, new THREE.Vector3(x, 0, z + 0.3), "mate", p.name); });
    // the edge of the world: far small lights on the glass, Social when it has data
    socG = new THREE.Group(); things.add(socG); for (let i = 0; i < d.social; i++) { const m = new THREE.Mesh(G.dot, M.hair); m.position.set(-9 + i * (18 / Math.max(1, d.social - 1)), -0.6, -ISLAND.d / 2 - 2.2 - (i % 2) * 1.1); socG.add(m); }
    // ticks on the day's arc
    ticks.clear(); (d.doneAt ?? []).forEach((h) => { const u = (((h - 6) % 12) + 12) % 12 / 12; const m = new THREE.Mesh(G.dot, M.hair); m.scale.setScalar(0.55); m.position.copy(arcAt(u)); ticks.add(m); });
    tag(J, { kind: "jelly", id: "jelly", name: d.who }); pickables.push(J);
    if (d.jelly?.length === 5) (JM.uniforms.uC.value as THREE.Color[]).forEach((c, i) => c.set(d.jelly![i]));   // the kit's own order (JELLY.six, first five): red at its foot, yellow on top, so from above it is the warm yellow body, never red (red is "broken" here)
    tag(beadHit, { kind: "hour", id: "hour", name: "today" }); pickables.push(beadHit);

    for (const t of d.ties ?? []) { const a = live.get(`t:${t.thing}`), b = projectAt.get(t.project); if (!a || !b) continue; const m = strip(a.to.p.x, a.to.p.z, b.x, b.z - b.d / 2 - 0.05, M.hair, 0.016); m.visible = false; m.userData.tie = [a.target.id, t.project]; things.add(m); tethers.push(m); }
    { const posOf = (id: string) => { const f = folderAt.get(id) ?? projectAt.get(id); if (f) return { x: f.x, z: f.z, name: d.parts.flatMap((q) => q.folders).find((q) => q.id === id)?.name ?? d.projects.find((q) => q.id === id)?.name ?? id }; const l = [...live.values()].find((x) => x.kind === "tile" && x.target.id === id); return l ? { x: l.to.p.x, z: l.to.p.z, name: l.target.name } : null; };
      for (const t of d.tieMaybe ?? []) { const a = posOf(t.a), b = posOf(t.b); if (!a || !b) continue;   /* Jev's pick 4 at 0.45: a dashed line he can press to keep */
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, 0.06, a.z), new THREE.Vector3(b.x, 0.06, b.z)]), M.dash); ln.computeLineDistances(); ln.renderOrder = 3; things.add(ln);
        const mid = new THREE.Vector3((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2), hit = new THREE.Mesh(G.tile, M.ghost); hit.scale.set(3.4, 1, 3.6); hit.position.set(mid.x, 0.06, mid.z + 0.4);   /* the place to press covers the word under the line too (the builder, 06:55: a press on `tied?` itself missed) */ tag(hit, { kind: "tie", id: `${t.a}|${t.b}`, name: `${a.name} + ${b.name}` }); things.add(hit); pickables.push(hit);
        label("tied?", new THREE.Vector3(mid.x, 0, mid.z - 0.1), "mate", `tie:${t.a}|${t.b}`); }
      for (const t of d.tiesKept ?? []) { const a = posOf(t.a), b = posOf(t.b); if (!a || !b) continue; const m = strip(a.x, a.z, b.x, b.z, M.hair, 0.03); m.visible = false; m.userData.tie = [t.a, t.b]; things.add(m); tethers.push(m); }   /* a kept tie does not vanish: it shows when he touches either end */
      const pi = d.lean ? d.parts.findIndex((q) => q.id === d.lean!.part) : -1, lb = pi >= 0 ? SL[pi] : d.lean?.part === "build" ? WORKSHOP : null; leanOn = d.lean?.sure && lb ? d.lean.part : null;
      if (lb && d.lean!.sure) things.add(outline({ x: lb.x, z: lb.z, w: lb.w - 0.22, d: lb.d - 0.22 }, 0.1, M.hairDim));   /* Jev's pick 5 at 0.7: the district the day starts in wears a second rim */
      else if (lb) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(lb.w - 0.3, lb.d - 0.3)), M.dash); e.rotation.x = -Math.PI / 2; e.computeLineDistances(); e.position.set(lb.x, 0.03, lb.z); things.add(e);   /* at 0.45: a dashed ring inside it; its name's corner is the place to press */
        const hit = new THREE.Mesh(G.tile, M.ghost); hit.scale.set(4, 1, 1.6); hit.position.set(lb.x - lb.w / 2 + 0.9, 0.04, lb.z + lb.d / 2 - 0.35); tag(hit, { kind: "part", id: d.lean!.part, name: d.parts[pi]?.name ?? "build" }); things.add(hit); pickables.push(hit); } }
    // drops: one per thing an agent is on, or waits beside
    const wantDrop = new Map<string, boolean>(); for (const l of live.values()) if (l.kind === "tile" && (l.mood === "run" || l.mood === "ask") && l.target.kind === "thing") wantDrop.set(l.key, l.mood === "ask");
    for (const [k, ask] of wantDrop) { const dr = drops.get(k); if (dr) { dr.ask = ask; if (dr.mode === "home") { dr.mode = "to"; dr.t0 = now; dr.from = dr.m.position.clone(); } continue; }
      const m = new THREE.Mesh(G.drop, JM); m.scale.setScalar(firstSet ? 0.05 : 0.15); m.position.copy(J.position); m.castShadow = true; scene.add(m); drops.set(k, { m, mode: firstSet && !still ? "to" : "sit", t0: now, from: J.position.clone(), ask }); }
    for (const [k, dr] of drops) if (!wantDrop.has(k) && dr.mode !== "home") { dr.mode = "home"; dr.t0 = now + (still ? 0 : T_MOVE); dr.from = dr.m.position.clone(); }
    // a tile that is no longer there leaves through the dither, where it last stood
    if (firstSet && !still) for (const [key, was] of memo) if ((key.startsWith("t:") || key.startsWith("w:")) && !live.has(key) && ghosts.length < 40) { const m = new THREE.Mesh(G.tile, tileMat(was.mood ?? "wait")); m.position.copy(was.c.p); m.rotation.x = was.c.rx; m.scale.setScalar(was.c.s); scene.add(m); ghosts.push({ m, d: (m.material as any).userData.d, t0: now }); }
    if (hadAsks && !want.length) gulp = now + 400;   // the last one left the front edge: it settles once
    // the arrival, once per opening: the island and his jelly are there in the first frame; every thing then comes down onto it through the dither, left to right and back to front, the front edge last. All landed within 0.8 s; none of it under reduced motion.
    if (!still && (!firstSet || now < arr0 + 900 * ARR)) { if (!firstSet) arr0 = now;   // a re-read while they are still coming down (the first reads land within the same second) keeps the same arrival, never a second one
      for (const l of live.values()) { if (l.kind === "other") continue; const wait = (60 + ((l.to.p.x + ISLAND.w / 2) / ISLAND.w) * 240 + ((l.to.p.z + ISLAND.d / 2) / ISLAND.d) * 140) * ARR;
        l.from = { p: l.to.p.clone().setY(l.to.p.y + 0.8), rx: l.to.rx, s: l.to.s }; if (now < arr0 + wait) l.obj.position.copy(l.from.p); l.t0 = arr0 + wait; l.dur = 380 * ARR; if (l.d) { l.d.value = 0; l.d0 = arr0 + wait; l.dMode = "in"; } } }
    hadAsks = want.length; firstSet = true;
    weather = want.length >= 4 ? 1 : want.length === 0 && d.parts.some((p) => p.folders.some((f) => f.things.some((t) => t.mood === "done" && !(t as Thing & { old?: boolean }).old))) ? -1 : 0;
  }
  /** homes again, without rebuilding: a folder opened or closed */
  const relayout = () => { const now = performance.now(); for (const l of live.values()) if (l.calc && l.kind === "tile") { const to = l.calc(); if (to.p.distanceTo(l.to.p) > 0.02 || to.s !== l.to.s) { l.from = { p: l.obj.position.clone(), rx: l.obj.rotation.x, s: l.obj.scale.x }; l.to = to; l.t0 = now; l.dur = still ? 1 : 420; } } };

  // ---- the camera: fixed tilt, pan and zoom only; three levels ----
  let PITCH = 0.92; const YAW = 0;   // the tilt: 0.92 in a wide pane, steeper in a squarer one (set in fit), so the island fills the pane
  const fitAll = () => { const v = (cam.fov * Math.PI) / 360, hz = Math.atan(Math.tan(v) * cam.aspect); return Math.max((ISLAND.w + 3.4) / 2 / Math.tan(hz), (ISLAND.d * Math.sin(PITCH) + 4.4 * Math.cos(PITCH) + 5.2) / 2 / Math.tan(v)) + 3; };
  const VIEWS = { all: { x: 0, z: 0.2, dist: 34 }, home: { x: 0.4, z: -3.2, dist: 22 }, build: { x: -1, z: 3.6, dist: 20 }, near: { x: 0, z: 0, dist: 13 } };
  const want = { ...VIEWS.all }, cur = { ...want };
  const clamp = () => { // the camera never looks far past the island: the nearer it is, the less it may leave the middle
    want.dist = Math.max(8, Math.min(VIEWS.all.dist * 1.25, want.dist)); const v = (cam.fov * Math.PI) / 360, hw = want.dist * Math.tan(Math.atan(Math.tan(v) * cam.aspect)), hd = (want.dist * Math.tan(v)) / Math.sin(PITCH);
    const mx = Math.max(0, ISLAND.w / 2 + 1.2 - hw), mz = Math.max(0, ISLAND.d / 2 + 1.6 - hd); want.x = Math.max(-mx, Math.min(mx, want.x)); const low = !!on && [...live.values()].some((l) => l.target.id === on && l.kind === "tile" && l.mood === "ask");   /* on a thing of the front edge the camera may come further forward: its buttons hang under it and need the room */ want.z = Math.max(-mz, Math.min(mz + (low ? 2.6 : 0.4), want.z));
  };
  const place = () => { cam.position.set(cur.x + Math.sin(YAW) * Math.cos(PITCH) * cur.dist, Math.sin(PITCH) * cur.dist, cur.z + Math.cos(YAW) * Math.cos(PITCH) * cur.dist); cam.lookAt(cur.x, 0, cur.z); };
  let lvl: Level = "far", lvlOn: string | null = null, actsOn: string | null = null;   /* (builder, n13) lvlOn */
  const level = (): Level => (open ? "near" : want.dist > VIEWS.all.dist * 0.72 ? "far" : "mid");
  const setOpen = (id: string | null) => { if (open === id) return; open = id; relayout(); };
  /** the camera on a folder or a project: its district stays whole in view, so he never loses where he is */
  const frame = (s: Spot, b: Box, f: boolean) => { const hz = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect), need = Math.min(VIEWS.all.dist * 0.7, (b.w + 1.4) / 2 / Math.tan(hz)); want.dist = Math.max(f ? 15 : 16, need); { const slack = Math.max(0, want.dist * Math.tan(hz) - (b.w + 1.4) / 2); want.x = Math.min(b.x + slack, Math.max(b.x - slack, s.x)); }   /* it leans to the pressed thing only as far as its district stays whole (a narrow district with its last folder pressed lost its first: design still r22, 06:39) */   /* a wide district is centred, no lean: a lean cost it an edge (the builder's still 68: the outline ran off the right) */ want.z = need > 15.5 ? b.z + 0.1 : s.z + (f ? 0.9 : 0.4); };
  const goTo = (id: string) => {
    const f = folderAt.get(id), p = projectAt.get(id); const s = f ?? p; if (!s) { const l = live.get(`t:${id}`) ?? [...live.values()].find((x) => x.target.id === id); if (l) { const edge = l.mood === "ask"; want.x = l.to.p.x; on = id; want.z = l.to.p.z - (edge ? 2.2 : 1.6); want.dist = edge ? Math.max(19, VIEWS.all.dist * 0.6) : 15; const fid = l.target.kind === "thing" ? l.target.folder : null, fs = fid ? folderAt.get(fid) : null; if (!edge && fid && fs) { frame(fs, SL[data?.parts.findIndex((q) => q.folders.some((x) => x.id === fid)) ?? -1] ?? fs, true); if (open !== fid) setOpen(null); } else setOpen(null); clamp(); } return; }
    frame(s, f ? SL[data?.parts.findIndex((q) => q.folders.some((x) => x.id === id)) ?? -1] ?? s : WORKSHOP, !!f); on = id; setOpen(f && data?.parts.some((q) => q.folders.some((x) => x.id === id && x.set)) ? id : null); clamp();
  };
  /** a past day on the shelf (its brick pressed; again, or null: today) */
  const showDay = (i: number | null) => { if (dayOn === i || !data) return; dayOn = i; hovered = null; hands.onHover(null, 0, 0);   /* the brick's own name leaves with the press: the camera moves, the name would stay behind over something else (the builder's still 53) */ build(data); if (i !== null && dayOn !== null) { setOpen(null); on = null; want.x = SHELF.x; want.z = SHELF.z - 0.6; want.dist = Math.max(19, VIEWS.all.dist * 0.6); clamp(); } };
  const up = () => { if (hinted) { hint(null); return true; } if (dayOn !== null) { showDay(null); Object.assign(want, VIEWS.all); return true; } if (open || on) { const was = open ?? on; setOpen(null); on = null; const part = data?.parts.findIndex((q) => q.folders.some((f) => f.id === was)) ?? -1; if (part >= 0 && want.dist < 18) { const b = SL[part]; want.x = b.x; want.z = b.z + 0.4; want.dist = 19; } else Object.assign(want, VIEWS.all); return true; } if (level() !== "far") { Object.assign(want, VIEWS.all); return true; } return false; };

  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  // ---- hands ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(); const carryPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), arcPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), ISLAND.d / 2 - 0.1);
  const aim = (cx: number, cy: number) => { const b = canvas.getBoundingClientRect(); ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, cam); };
  const pick = (cx: number, cy: number): Target | null => { aim(cx, cy); return (ray.intersectObjects(pickables, false)[0]?.object.userData.target as Target) ?? null; };
  /** what is under a carried tile: a folder's id, "jelly", "shelf", or null (open ground) */
  const under = (cx: number, cy: number): { over: string | null; x: number; z: number } => {
    aim(cx, cy); if (!ray.ray.intersectPlane(groundPlane, hit)) return { over: null, x: 0, z: 0 };
    let best: string | null = null, bd = 1.0; for (const [id, s] of folderAt) { const dd = Math.hypot(hit.x - s.x, hit.z - s.z); if (dd < bd) { bd = dd; best = id; } }
    if (!best) for (const [id, sp] of projectAt) if (Math.abs(hit.x - sp.x) < sp.w / 2 + 0.25 && Math.abs(hit.z - sp.z) < sp.d / 2 + 0.25) best = id;
    if (!best && Math.hypot(hit.x - PLAZA.x, hit.z - PLAZA.z) < 1.5) best = "jelly";
    if (!best && Math.abs(hit.x - SHELF.x) < SHELF.w / 2 + 0.2 && Math.abs(hit.z - SHELF.z) < SHELF.d / 2 + 0.2) best = "shelf";
    return { over: best, x: hit.x, z: hit.z };
  };
  const whereJ = () => { v3.copy(J.position).project(cam); return { x: ((v3.x + 1) / 2) * canvas.clientWidth, y: ((1 - v3.y) / 2) * canvas.clientHeight }; };
  let down: { x: number; y: number; t: Target | null; cx: number; cz: number } | null = null; let carrying: Live | null = null; let over: string | null = null; let hovered: Target | null = null;
  const onDown = (e: PointerEvent) => { if (data?.wall) return; kb = null; canvas.setPointerCapture(e.pointerId); { const t0 = pick(e.clientX, e.clientY); if (dayOn !== null && t0?.kind === "thing") showDay(null); }   /* a hand on one of today's things: today's shelf is back before anything is carried */ down = { x: e.clientX, y: e.clientY, t: pick(e.clientX, e.clientY), cx: want.x, cz: want.z };
    const t = down.t; window.clearTimeout(holdT); if (t?.kind === "folder" && slots.get(t.part)?.length! > 1) holdT = window.setTimeout(() => { if (down?.t === t && !carrying) { arranging = { id: t.id, part: t.part, order: slots.get(t.part)!.map((q) => q.id) }; setOpen(null); canvas.style.cursor = "grabbing"; hands.onHover(null, 0, 0); } }, 300); };
  const onMove = (e: PointerEvent) => {
    if (data?.wall) return;
    { const b = canvas.getBoundingClientRect(), p = whereJ(); lookX = THREE.MathUtils.clamp((e.clientX - b.left - p.x) / 400, -1, 1); lookY = THREE.MathUtils.clamp((p.y - (e.clientY - b.top)) / 300, -1, 1); handAt = performance.now(); }
    if (!down) { const t = pick(e.clientX, e.clientY); if (t?.id !== hovered?.id || t?.kind !== hovered?.kind) { hovered = t; canvas.style.cursor = t ? ((t.kind === "thing" && t.mood !== "done" && t.mood !== "run") || t.kind === "hour" ? "grab" : t.kind === "part" ? "default" : "pointer") : "default"; } hands.onHover(t && t.kind !== "part" && t.kind !== "hour" ? t : null, e.clientX, e.clientY); return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!carrying && Math.hypot(dx, dy) > 5 && down.t?.kind === "thing" && down.t.mood !== "done" && down.t.mood !== "run") { { const id = down.t.id;   /* a thing being worked is not picked up: its agent is writing in it (the reviewer, lead 03:36) */ carrying = [...live.values()].find((x) => x.kind === "tile" && x.target.id === id) ?? null; } canvas.style.cursor = "grabbing"; hands.onHover(null, 0, 0); }
    if (carrying) {
      aim(e.clientX, e.clientY); if (ray.ray.intersectPlane(carryPlane, hit)) { carrying.obj.rotation.z = THREE.MathUtils.clamp((carrying.obj.position.x - hit.x) * 0.9, -0.5, 0.5); carrying.obj.position.lerp(hit, 0.7); carrying.obj.scale.setScalar(Math.min(2, carrying.obj.scale.x + 0.25)); carrying.obj.rotation.x += (0.9 - carrying.obj.rotation.x) * 0.4; }   // in the hand it is larger and faces him
      const u = under(e.clientX, e.clientY), tt = carrying.target as ThingT; over = u.over && u.over !== tt.folder ? u.over : null; hands.onCarry(tt, over); return;
    }
    if (down.t?.kind === "hour") { canvas.style.cursor = "grabbing"; pull(e.clientX, e.clientY); return; }
    if (arranging) { // the held folder follows the hand; the others take the places its move leaves
      aim(e.clientX, e.clientY); const sl = slots.get(arranging.part)!, me = folderAt.get(arranging.id); if (!me || !ray.ray.intersectPlane(groundPlane, hit)) return;
      me.x = hit.x; me.z = hit.z; let to = 0, bd = Infinity; sl.forEach((q, i) => { const dd = Math.hypot(hit.x - q.x, hit.z - q.z); if (dd < bd) { bd = dd; to = i; } });
      const rest = sl.map((q) => q.id).filter((id) => id !== arranging!.id); rest.splice(to, 0, arranging.id); arranging.order = rest;
      rest.forEach((id, i) => { if (id === arranging!.id) return; const sp = folderAt.get(id); if (sp) { sp.x = sl[i].x; sp.z = sl[i].z; } }); relayout(); return;
    }
    if (Math.hypot(dx, dy) > 5) window.clearTimeout(holdT);
    if (Math.hypot(dx, dy) > 3) { const k = cur.dist / 900; want.x = down.cx - dx * k * 1.6; want.z = down.cz - dy * k * 2.2; clamp(); }
  };
  const onUp = (e: PointerEvent) => {
    window.clearTimeout(holdT);
    if (pulled !== null) { down = null; canvas.style.cursor = "default"; try { canvas.releasePointerCapture(e.pointerId); } catch { /* gone */ } showAt(null); return; }
    if (arranging) { const a = arranging, sl = slots.get(a.part)!, me = folderAt.get(a.id), i = a.order.indexOf(a.id); arranging = null; down = null; canvas.style.cursor = "default"; try { canvas.releasePointerCapture(e.pointerId); } catch { /* gone */ }
      if (me) { me.x = sl[i].x; me.z = sl[i].z; } relayout(); if (a.order.some((id, k) => id !== sl[k].id)) hands.onArrange?.(a.id, a.part, a.order); return; }
    const d = down; down = null; try { canvas.releasePointerCapture(e.pointerId); } catch { /* gone */ }
    if (carrying) {
      const l = carrying, t = l.target as ThingT, o = over, u = under(e.clientX, e.clientY); carrying = null; over = null; hands.onCarry(null, null); canvas.style.cursor = "default"; l.obj.rotation.z = 0;
      l.from = { p: l.obj.position.clone(), rx: l.obj.rotation.x, s: l.obj.scale.x }; l.t0 = performance.now(); l.dur = still ? 1 : 300;   // it glides home unless the data says otherwise
      if (o === "jelly") { gulp = performance.now(); hands.onFeed?.(t); } else if (o === "shelf") hands.onShelve?.(t); else if (o && projectAt.has(o)) hands.onTie?.(t, o); else if (o) hands.onDrop(t, o); else if (!u.over) hands.onLoose?.(t, u.x, u.z);
      return;
    }
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 5) return;
    if (!d.t || d.t.kind === "part") { if (d.t?.kind === "part" && !open && !on) { const i = data?.parts.findIndex((p) => p.id === d.t!.id) ?? -1; if (i >= 0) { const b = SL[i]; want.x = b.x; want.z = b.z + 0.4; want.dist = 19; clamp(); } } else up(); return; }
    act(d.t);
  };
  /** the press, from the pointer or from Enter */
  const act = (t: Target) => {
    if (t.kind === "hour") return;                                                                      // the bead is held and pulled, never pressed
    if (t.kind === "day") { if (t.id.includes("/")) return; const q = data?.days?.[Number(t.id)]; if (q && typeof q !== "number" && q.names?.length) { if (dayOn === Number(t.id)) { showDay(null); Object.assign(want, VIEWS.all); } else showDay(Number(t.id)); return; } }   // a brick pressed lays its day on the shelf; a day with no names kept only says its count
    if (t.kind === "folder" && hinted?.folder === t.id) { const h = hinted; hint(null); hands.onDrop(h.thing, h.folder); return; }   // the ghost, pressed
    if ((t.kind === "folder" || t.kind === "project") && on !== t.id) { goTo(t.id); return; }             // the first press goes to it
    if (t.kind === "thing" || t.kind === "session") on = t.id;
    if (t.kind === "jelly") { // his jelly pressed, "what next": it bumps once and takes him to the first thing that wants him (pressed again: the one after); nothing wants him: the whole island is back
      gulp = performance.now(); const edge = [...live.values()].filter((l) => l.kind === "tile" && l.mood === "ask").sort((a, b) => a.to.p.x - b.to.p.x), next = edge.length ? edge[(edge.findIndex((l) => l.target.id === on) + 1) % edge.length] : null;
      if (next) { on = next.target.id; hands.onPress(next.target); return; }
      setOpen(null); on = null; Object.assign(want, VIEWS.all);
    }
    hands.onPress(t);
  };
  // ---- the keys' walk: Tab goes along the front edge, then the folders, then the projects; Enter is the press ----
  let kb: string | null = null;
  const walk = (): Live[] => {
    const all = [...live.values()], edge = all.filter((l) => l.kind === "tile" && l.mood === "ask").sort((a, b) => a.to.p.x - b.to.p.x), out: Live[] = [...edge];
    for (const l of all) { if (l.kind === "folder") { out.push(l); if (open === l.target.id) out.push(...all.filter((x) => x.kind === "tile" && x.target.kind === "thing" && x.target.folder === open && x.mood !== "ask" && x.mood !== "done")); } }
    return [...out, ...all.filter((l) => l.kind === "project")];
  };
  const onTab = (e: KeyboardEvent) => {
    if (data?.wall) return;
    if (e.key === "Tab") { const w = walk(), i = w.findIndex((l) => l.key === kb), j = kb === null ? (e.shiftKey ? w.length - 1 : 0) : i + (e.shiftKey ? -1 : 1);
      if (j < 0 || j >= w.length) { kb = null; return; }                                                // past the last: the Tab leaves the world
      e.preventDefault(); kb = w[j].key; const t = w[j].target; if (level() !== "far" && t.kind !== "thing") { want.x = w[j].to.p.x; want.z = w[j].to.p.z + 0.4; clamp(); } }
    else if ((e.key === "Enter" || e.key === " ") && kb) { const l = live.get(kb); if (l) { e.preventDefault(); act(l.target); } }
  };
  const onBlur = () => { kb = null; };
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.addEventListener("keydown", onTab); canvas.addEventListener("blur", onBlur);
  const onWheel = (e: WheelEvent) => { if (data?.wall) return; e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.5) { want.dist *= Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)); if (open && want.dist > 19) { setOpen(null); on = null; } } else { const k = cur.dist / 900; want.x += e.deltaX * k; want.z += e.deltaY * k; } clamp(); };
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    if (e.type === "keyup") { keys.delete(e.key.toLowerCase()); return; }
    if (data?.wall || !canvas.parentElement?.contains(document.activeElement)) return;   // (builder, n13) keys move the world only while it has focus
    const k = e.key.toLowerCase(); if (e.type === "keyup") { keys.delete(k); return; } if (e.metaKey || e.ctrlKey) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { keys.add(k); e.preventDefault(); }
    else if (k === "=" || k === "+") { want.dist *= 0.8; clamp(); } else if (k === "-") { want.dist *= 1.25; clamp(); } else if (k === "0") { setOpen(null); on = null; Object.assign(want, VIEWS.all); }
  };
  const onLeave = () => { if (!down) { hovered = null; hands.onHover(null, 0, 0); } };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false }); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);

  let fitted = false, ranBefore: Set<string> | null = null;
  const fit = () => { const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); PITCH = Math.max(0.92, Math.min(1.2, 0.92 + (1.62 - cam.aspect) * 0.55)); VIEWS.all.z = 0.2 - (PITCH - 0.92) * 4; const was = VIEWS.all.dist; VIEWS.all.dist = fitAll(); VIEWS.home.dist = VIEWS.all.dist * 0.7; VIEWS.build.dist = VIEWS.all.dist * 0.72; if (!fitted || Math.abs(want.dist - was) < 0.01) { fitted = true; Object.assign(want, VIEWS.all); if (cur.dist === was || cur.dist === 34) Object.assign(cur, VIEWS.all); } };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();

  // ---- the day: the bead on the arc at the real hour; the light comes from where it is ----
  const hourNow = () => { const now = new Date(), q = new URLSearchParams(location.search).get("world.hour"); return data?.hour ?? (q ? Number(q) : now.getHours() + now.getMinutes() / 60); };
  const sky = () => {
    const h = pulled ?? hourNow();
    const day = h >= 6 && h < 18, u = ((((h - 6) % 12) + 12) % 12) / 12, p = arcAt(u), soft = Math.min(1, Math.sin(u * Math.PI) * 2.2);
    bead.visible = day; moon.visible = !day; bead.position.copy(p); moon.position.copy(p); beadHit.position.copy(p); moon.lookAt(cam.position);
    sun.position.set(p.x * 1.1, 7 + p.y * 2.4, 9); sun.target.position.set(0, 0, 0); sun.intensity = (day ? 1.3 + soft * 1.1 : 1.7) * (1 - 0.2 * cloudK); hemi.intensity = day ? 0.6 : 0.7;   /* night: the same pearl, only the glow is added */
    JM.uniforms.uGlow.value = day ? 0 : 1; jl.intensity = day ? 0 : 2.2; (M.lampOn as THREE.MeshStandardMaterial).emissiveIntensity = day ? 1.2 : 2.4;
  };
  let lastSky = 0;
  // the day pulled toward him: the bead held and drawn back along the arc shows the island at that hour; let go, it is now again
  let pulled: number | null = null; const snaps: { hour: number; data: WorldData & Extra }[] = [];
  const pull = (cx: number, cy: number) => {
    aim(cx, cy); if (!data || !ray.ray.intersectPlane(arcPlane, hit)) return; const h0 = hourNow(), day = h0 >= 6 && h0 < 18, base = day ? 6 : h0 >= 18 ? 18 : -6;
    const u = Math.acos(THREE.MathUtils.clamp(-hit.x / 11.4, -1, 1)) / Math.PI; showAt(Math.min(h0, base + u * 12));
  };
  /** the island at an earlier hour of today (null: now again) */
  const showAt = (h: number | null) => {
    if (!data) return; if (h === null) { if (pulled !== null) { pulled = null; shown = null; build(data); sky(); delete canvas.parentElement?.dataset.pulled; } return; }
    const h0 = hourNow(), all = [...(data.past ?? []).map((q) => ({ hour: q.hour, data: { ...data!, ...q.data } })), ...snaps];
    const was = [...all].reverse().find((q) => q.hour <= h); pulled = Math.min(h, h0); if (canvas.parentElement) canvas.parentElement.dataset.pulled = "1";   /* the counts dim while he looks at an earlier hour (world3d.css) */ const show = was && h < h0 - 0.05 ? was.data : data; if (show !== shown) { shown = show; build(show); } sky();
  };
  let shown: (WorldData & Extra) | null = null;

  // ---- the second look, "dither": what is drawn is turned into 1-bit pearl dots by its brightness (the file visualizer's look); what has a state colour,
  //      and his jelly, keep their colour; the names are type over the canvas, so they stay clean. Black stays black: never a light page. ----
  let rt: THREE.WebGLRenderTarget | null = null; const styleQ = new URLSearchParams(location.search).get("world.style");
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, px: { value: 2 } }, depthTest: false, depthWrite: false, transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D t; uniform float px; varying vec2 vUv;
      float bayer(vec2 p){ const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); ivec2 q = ivec2(mod(floor(p), 4.0)); return (m[q.x + q.y * 4] + 0.5) / 16.0; }
      void main(){ vec4 s = texture2D(t, vUv); if (s.a < 0.01) { gl_FragColor = vec4(0.0); return; }
        vec3 c = s.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        float g = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 1.0 / 2.2);
        float on = step(bayer(gl_FragCoord.xy / px), (g - 0.3) * 1.6);
        vec3 o = (sat > 0.4 && mx > 0.12) ? c : vec3(0.797, 0.759, 0.694) * on;
        gl_FragColor = linearToOutputTexel(vec4(o, s.a)); }`,
  })); post.frustumCulled = false; postScene.add(post);

  // ---- the loop ----
  const ease = (u: number) => 1 - Math.pow(1 - u, 3), back = (u: number) => { const c = 1.25; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  let raf = 0, t0 = performance.now(), last = t0, frames = 0, fps = 60, fpsAt = t0, hidden = false, n = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick); if (hidden) return;
    const now = performance.now(), t = (now - t0) / 1000, frozen = !!data?.offline, dt = Math.min(0.25, (now - last) / 1000), kf = (rate: number) => (still ? 1 : 1 - Math.exp(-dt * rate)); last = now;   // every ease is by time, not by frame
    if (now - lastSky > 30_000 || lastSky === 0) { sky(); lastSky = now; }
    { // the weather eases in over about two seconds: the cloud drifts in front of the bead from its left, the halo fades in
      const was = cloudK; cloudK += ((weather > 0 ? 1 : 0) - cloudK) * kf(1.6); const bp = bead.position; skyCloud.position.set(bp.x - (1 - cloudK) * 2.4 + Math.sin(t * 0.25) * 0.08, bp.y - 0.06, bp.z + 0.5); skyCloud.scale.setScalar(0.92 * Math.min(1, cloudK * 1.6));
      halo.position.copy(bp); halo.lookAt(cam.position); const hm = halo.material as THREE.MeshBasicMaterial; hm.opacity += ((weather < 0 ? 0.5 : 0) - hm.opacity) * kf(1.6);
      if (Math.abs(was - cloudK) > 0.0005) sky();
    }
    const pan = cur.dist / 60; if (keys.has("w") || keys.has("arrowup")) want.z -= pan; if (keys.has("s") || keys.has("arrowdown")) want.z += pan; if (keys.has("a") || keys.has("arrowleft")) want.x -= pan; if (keys.has("d") || keys.has("arrowright")) want.x += pan; if (keys.size) clamp();
    if (data?.wall) { want.x = Math.sin(t * 0.03) * 1.2; want.z = -0.3; want.dist = VIEWS.all.dist; }
    const k = kf(T_CAM); cur.x += (want.x - cur.x) * k; cur.z += (want.z - cur.z) * k; cur.dist += (want.dist - cur.dist) * k; place();
    const L = level(); if (L !== lvl || on !== lvlOn) { lvl = L; lvlOn = on; hands.onLevel?.(L, on); }   /* (builder, n13) also when it went to another thing, so a second unlit figure pressed gets its `set up` */ { const far = L === "far" || pulled !== null; dayG.visible = far; if (socG) socG.visible = far; }

    // his jelly: breathes, quicker with drops out; swallows; blinks; looks at the camera
    JM.uniforms.uT.value = frozen ? 0 : t * (drops.size ? 1.5 : 1); const g = now < gulp ? 0 : Math.max(0, 1 - (now - gulp) / 300); J.scale.setScalar(0.78 * (1 + 0.06 * Math.sin(g * Math.PI)) * (over === "jelly" ? 1.12 : 1));
    eyes.lookAt(cam.position); const doze = !drops.size && now - handAt > 45_000 && !frozen;   // nothing working and no hand for a while: it dozes
    if (doze) eyes.scale.y += (0.12 - eyes.scale.y) * kf(6); else if (now > blinkAt) { if (now > blinkAt + 120) blinkAt = now + 2600 + Math.random() * 3200; eyes.scale.y = 0.12; } else eyes.scale.y = 1;
    if (now - handAt > 4000 && drops.size) { const dm = drops.values().next().value!.m.position; lookX = THREE.MathUtils.clamp((dm.x - J.position.x) / 7, -1, 1); lookY = THREE.MathUtils.clamp((J.position.z - dm.z) / 5, -1, 1); }   // the hand is still: it watches the work
    eyes.children.forEach((e, i) => { e.position.x += ((i ? 0.19 : -0.19) + lookX * 0.09 - e.position.x) * kf(12); e.position.y += (0.06 + lookY * 0.07 - e.position.y) * kf(12); });   // its eyes follow the hand

    for (const l of live.values()) {
      if (l === carrying) continue;
      if (l.t0) { const u = Math.max(0, Math.min(1, (now - l.t0) / l.dur)), far = l.from.p.distanceTo(l.to.p), e = far > 2 ? back(u) : ease(u); l.obj.position.lerpVectors(l.from.p, l.to.p, e); l.obj.position.y += Math.sin(Math.min(1, u) * Math.PI) * Math.min(1.6, far * 0.22);
        l.obj.rotation.x = l.from.rx + (l.to.rx - l.from.rx) * ease(u); if (l.kind === "tile") l.obj.scale.setScalar(l.from.s + (l.to.s - l.from.s) * ease(u)); if (u >= 1) l.t0 = 0; }
      else if (l.kind === "tile") { l.obj.position.copy(l.to.p); if (l.mood === "ask" && !still && !frozen) l.obj.position.y += Math.sin(t * 2.2 + l.to.p.x) * 0.05; }
      if (l.d && l.dMode) { const u = Math.min(1, (now - l.d0) / T_DITHER); l.d.value = l.dMode === "in" ? u : 1 - 0.7 * Math.sin(u * Math.PI); if (u >= 1) { l.d.value = 1; l.dMode = null; } }
      if (l.kind === "folder") { const sp = folderAt.get(l.target.id), held = arranging?.id === l.target.id; if (sp) { const q = held ? 1 : kf(14); l.obj.position.x += (sp.x - l.obj.position.x) * q; l.obj.position.z += (sp.z - l.obj.position.z) * q; folderLab.get(l.target.id)?.set(l.obj.position.x, 0, l.obj.position.z + sp.d / 2 + 0.22); } }
      if (l.kind === "folder" || l.kind === "project") { const lit = (hovered?.id === l.target.id && hovered.kind === l.target.kind) || over === l.target.id || arranging?.id === l.target.id; const s = lit ? 1.04 : 1; l.obj.scale.x += (s - l.obj.scale.x) * kf(24); l.obj.scale.z = l.obj.scale.x; l.obj.scale.y += ((lit ? 1.05 : 1) - l.obj.scale.y) * kf(24);
        const work = l.fig && busy.has(l.target.id) && !frozen && !still, ph = t * 3 + l.obj.position.x;
        if (l.lid && l.lidY !== undefined) { const upBy = open === l.target.id ? 0.3 : over === l.target.id ? 0.22 : work ? (l.form === "books" ? 0.05 : 0.03) * Math.abs(Math.sin(ph)) : 0, rot = open === l.target.id || over === l.target.id ? -0.5 : work && l.form === "books" ? -0.3 * Math.abs(Math.sin(ph)) : 0;   // open, a tile held over it, or being worked: a book's cover turns, a jar's lid rattles
          l.lid.position.y += (l.lidY + upBy - l.lid.position.y) * kf(16); l.lid.rotation.x += (rot - l.lid.rotation.x) * kf(16); }
        if (l.fig) { const u = l.fig.userData as { cards?: THREE.Object3D[]; lift?: THREE.Object3D; sway?: THREE.Object3D };
          u.cards?.forEach((c, i) => { c.rotation.x += ((work ? -0.22 + Math.sin(ph * 1.6 - i * 0.9) * 0.2 : -0.22) - c.rotation.x) * kf(14); });        // the cards riffle
          if (u.lift) u.lift.position.y += ((work ? Math.abs(Math.sin(ph * 0.7)) * 0.2 : 0) - u.lift.position.y) * kf(10);                             // the bell is lifted
          if (u.sway) u.sway.rotation.z += ((work ? Math.sin(ph * 0.6) * 0.1 : 0) - u.sway.rotation.z) * kf(8); } }                                     // the plant leans
      if (l.bead && !frozen) { const P = 2 * (l.bead.w + l.bead.d) * 2, s = ((t * 1.6 + l.to.p.x) % 1 + 1) % 1 * P, w2 = l.bead.w * 2, d2 = l.bead.d * 2; let x = 0, z = 0; if (s < w2) { x = -l.bead.w + s; z = l.bead.d; } else if (s < w2 + d2) { x = l.bead.w; z = l.bead.d - (s - w2); } else if (s < 2 * w2 + d2) { x = l.bead.w - (s - w2 - d2); z = -l.bead.d; } else { x = -l.bead.w; z = -l.bead.d + (s - 2 * w2 - d2); } l.bead.m.position.set(l.to.p.x + x, l.bead.y, l.to.p.z + z); }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) { const g2 = ghosts[i], u = (now - g2.t0) / T_DITHER; g2.d.value = Math.max(0, 1 - u); if (u >= 1) { scene.remove(g2.m); (g2.m.material as THREE.Material).dispose(); ghosts.splice(i, 1); } }
    // drops: to the tile in three hops, on it while it works, beside it while it waits, home when it is over
    for (const [key, dr] of drops) {
      const l = live.get(key); const seat = v3.copy(l ? l.obj.position : J.position); if (l) { if (dr.ask) seat.x += 0.62; else seat.y += 0.3; }
      if (dr.mode === "to" || dr.mode === "home") {
        if (now < dr.t0) { dr.m.position.copy(seat); continue; }
        const u = Math.min(1, (now - dr.t0) / (still ? 1 : T_HOP)), to = dr.mode === "to" ? seat : v4.copy(J.position); dr.m.position.lerpVectors(dr.from, to, ease(u)); dr.m.position.y += Math.abs(Math.sin(u * Math.PI * 3)) * 0.55 * (1 - u * 0.4);
        const sq = 1 - 0.22 * Math.pow(Math.abs(Math.cos(u * Math.PI * 3)), 6), sc = dr.mode === "to" ? 0.05 + 0.11 * Math.min(1, u * 3) : 0.16 * (1 - 0.6 * Math.max(0, u - 0.8) * 5); dr.m.scale.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
        if (u >= 1) { if (dr.mode === "to") dr.mode = "sit"; else { scene.remove(dr.m); drops.delete(key); gulp = now; } }
      } else { dr.m.position.copy(seat); const pu = frozen || still ? 0 : dr.ask ? Math.sin(t * 2.2) * 0.04 : Math.sin(t * 5.2) * 0.1; dr.m.scale.set(0.16 * (1 - pu * 0.5), 0.16 * (1 + pu), 0.16 * (1 - pu * 0.5)); if (dr.ask) dr.m.position.y = 0.16 + Math.abs(Math.sin(t * 2.2)) * 0.12 * (frozen ? 0 : 1); }
    }
    if (!frozen) for (const rn of rains) rn.position.y = rn.userData.y0 ??= rn.position.y, rn.position.y = rn.userData.y0 - ((t * 1.4) % 0.32);

    for (const m of tethers) m.visible = m.userData.tie ? m.userData.tie.includes(hovered?.id) || m.userData.tie.includes(actsOn) || m.userData.tie.includes(on) : m.userData.tether === hovered?.id || m.userData.tether === actsOn;
    // names
    if (labs.length) {
      const b = canvas.getBoundingClientRect(); n++;
      const edgePx = (() => { v3.set(EDGE.x0, 0, EDGE.z).project(cam); v4.set(EDGE.x0 + eStep, 0, EDGE.z).project(cam); return Math.max(40, ((v4.x - v3.x) / 2) * b.width - 14); })();
      const onT = actsOn ? [...live.values()].find((x) => x.target.id === actsOn && x.kind === "tile") : null; let actsAt: { x: number; y: number } | null = null;
      const under = onT?.mood === "ask"; if (onT) { v4.copy(onT.obj.position); if (under) { v4.y = 0; v4.z = ISLAND.d / 2 + 0.14; } else v4.y += 0.2 + 0.22 * onT.obj.scale.x; v4.project(cam); actsAt = { x: ((v4.x + 1) / 2) * b.width, y: ((1 - v4.y) / 2) * b.height }; }
      for (const a of labs) {
        if (!a.w0) a.w = a.w0 = a.el.offsetWidth || 40;
        if (a.kind === "edge" && Math.abs(Math.min(a.w0, edgePx) - a.w) > 1) { a.w = Math.min(a.w0, edgePx); a.el.style.maxWidth = `${Math.round(edgePx)}px`; }   // a name on the front edge never reaches the next one
        const src = a.kind === "thing" || a.kind === "edge" ? a.at : a.at; v3.copy(src); if (a.kind === "thing" || a.kind === "edge") v3.y = 0, v3.z += a.kind === "edge" ? 0.45 : 0.5; v3.project(cam);
        a.x = Math.round(((v3.x + 1) / 2) * b.width - (a.kind === "part" || a.id.startsWith("maybe:") ? 0 : a.w / 2)); a.y = Math.round(((1 - v3.y) / 2) * b.height + (a.kind === "part" ? -18 : 4)); if (a.id.startsWith("maybe:")) { v4.set(SHELF.x + SHELF.w / 2 - 0.12, 0, a.at.z).project(cam); const hi = ((v4.x + 1) / 2) * b.width - a.w; v4.set(SHELF.x - SHELF.w / 2 + 0.12, 0, a.at.z).project(cam); a.x = Math.round(Math.max(((v4.x + 1) / 2) * b.width, Math.min(a.x, hi))); }   /* the question stays inside the shelf, whichever place its outline has */ if (a.run && a.own !== open) a.y += 17;   /* a working tile on its mat: its name goes under the folder's, never in its place */ a.el.style.transform = `translate(${a.x}px, ${a.y}px)`;
        let s = 0;
        if (a.kind === "edge") s = 1; else if (a.kind === "part") s = L === "near" ? 0 : a.id === leanOn ? 0.92 : 0.55; else if (a.kind === "mate") s = L === "far" ? 0.55 : 0.92;
        else if (a.kind === "folder" || a.kind === "project") s = L === "far" ? 0.62 : L === "mid" ? 0.92 : a.id === open || a.id === on ? 0.92 : 0.32;
        else s = (a.own === open && L === "near") || (a.run && L !== "far") || (hovered?.id === a.id && hovered.kind === "thing") ? 0.92 : 0;
        if (actsOn === a.id && (a.kind === "edge" || a.kind === "thing")) s = 0;                                  // its name is on the buttons while they are up
        if (carrying && a.kind === "folder") s = a.id === over ? 1 : 0.6;   /* in the hand: every folder is a place it may land, so every name stays readable; the one under it is bright */
        if (arr0 && performance.now() < arr0 + 700 * ARR && a.kind !== "part") s = 0;                       // the arrival: a name comes when its thing has landed, never before it
        if (carrying && a.kind === "thing") s = 0;                                                         // in the hand: where it may land is named, not the tile
        if (actsAt && a.x + a.w > actsAt.x - 150 && a.x < actsAt.x + 150 && (under ? a.y > actsAt.y - 8 && a.y < actsAt.y + 120 : a.y > actsAt.y - 120 && a.y < actsAt.y + 4)) s = 0;   // nothing reads through the buttons on a sticky
        a.el.dataset.want = String(s); if (a.hid) s = 0;
        if (s !== a.show) { a.show = s; a.el.style.opacity = String(s); }
      }
    }
    if (labs.length && n % 12 === 1) { // a name never lies over another: the lower in rank hides
      const seen: Lab[] = []; for (const a of [...labs].sort((p, q) => RANK[p.kind] - RANK[q.kind])) { const wants = Number(a.el.dataset.want) > 0; a.hid = wants && (a.y < 60 || seen.some((o) => a.x < o.x + o.w + 6 && o.x < a.x + a.w + 6 && Math.abs(a.y - o.y) < 15));   /* (builder, n13) nothing under the counts: a name in their band at the top hides */ if (wants && !a.hid) seen.push(a); }
    }
    if (pulled !== null) { const b = canvas.getBoundingClientRect(), hh = ((pulled % 24) + 24) % 24; v3.copy(bead.position).project(cam); hourEl.textContent = `${Math.floor(hh)}:${String(Math.floor((hh % 1) * 60)).padStart(2, "0")}`; hourEl.style.transform = `translate(${Math.round(((v3.x + 1) / 2) * b.width + 14)}px, ${Math.round(((1 - v3.y) / 2) * b.height - 8)}px)`; hourEl.style.opacity = "0.92"; } else if (hourEl.style.opacity !== "0") hourEl.style.opacity = "0";
    { const l = kb ? live.get(kb) : null; if (!l) { if (ringEl.style.opacity !== "0") ringEl.style.opacity = "0"; } else {
        const b = canvas.getBoundingClientRect(), sp = l.kind === "folder" ? folderAt.get(l.target.id) : l.kind === "project" ? projectAt.get(l.target.id) : null, half = sp ? sp.w / 2 + 0.14 : 0.2 * l.obj.scale.x + 0.06, y = sp ? (l.h ?? 0.5) / 2 : l.obj.position.y;
        v3.set(l.obj.position.x - half, y, l.obj.position.z).project(cam); v4.set(l.obj.position.x + half, y, l.obj.position.z).project(cam);
        const w = ((v4.x - v3.x) / 2) * b.width, h = sp ? w * 0.86 : w, cx = ((v3.x + v4.x) / 2 + 1) / 2 * b.width, cy = (1 - (v3.y + v4.y) / 2) / 2 * b.height;
        ringEl.style.width = `${Math.round(w)}px`; ringEl.style.height = `${Math.round(h)}px`; ringEl.style.transform = `translate(${Math.round(cx - w / 2)}px, ${Math.round(cy - h / 2)}px)`; ringEl.style.opacity = "1"; } }
    const dith = (data?.style ?? styleQ) === "dither"; { const im = M.island as THREE.MeshPhysicalMaterial, cc = dith ? 0 : 0.3; if (im.clearcoat !== cc) { im.clearcoat = cc; im.roughness = dith ? 1 : 0.62; } }   // in the second look the island has no shine: no dots under a name
    if (dith) { // the second look: the island is drawn once, then redrawn as 1-bit pearl dots
      const w = r.domElement.width, h = r.domElement.height; if (!rt || rt.width !== w || rt.height !== h) { rt?.dispose(); rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true }); (post.material as THREE.ShaderMaterial).uniforms.t.value = rt.texture; }
      (post.material as THREE.ShaderMaterial).uniforms.px.value = 2 * r.getPixelRatio();
      r.setRenderTarget(rt); r.clear(); r.render(scene, cam); r.setRenderTarget(null); r.render(postScene, postCam);
    } else r.render(scene, cam);
    frames++; if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; hands.onFrame?.(fps); }
  };
  const vis = () => { hidden = document.hidden; }; document.addEventListener("visibilitychange", vis);
  raf = requestAnimationFrame(tick);

  return {
    set(d) {
      { // the thing he just pressed began to be worked: the whole island comes into view, so the drop leaving his jelly and the tile landing on the shelf are both seen
        const runs = new Set(d.parts.flatMap((p) => p.folders.flatMap((f) => f.things.filter((t) => t.mood === "run").map((t) => t.name)))), mine = on ? [...live.values()].find((l) => l.target.id === on && l.kind === "tile")?.target.name : null;
        if (ranBefore && mine && runs.has(mine) && !ranBefore.has(mine) && !d.wall && level() !== "far") { setOpen(null); on = null; Object.assign(want, VIEWS.all); }
        ranBefore = runs;
      }
      const ghost = hinted; data = d; snaps.push({ hour: hourNow(), data: d }); if (snaps.length > 400) snaps.shift(); if (pulled === null) build(d); hint(ghost?.thing.id ?? null, ghost?.folder);   /* the ghost stays through a re-read: until pressed, Esc, or its thing is gone */ lastSky = 0; if (open && !d.parts.some((p) => p.folders.some((f) => f.id === open))) open = null; },
    view(v) { setOpen(null); on = null; Object.assign(want, VIEWS[v]); },
    focus: goTo, up, level, hint, at: showAt, day: showDay, acts(id) { actsOn = id; const l = id ? [...live.values()].find((x) => x.target.id === id && x.kind === "tile") : null; if (canvas.parentElement) { if (l?.mood === "ask") canvas.parentElement.dataset.acts = "under"; else delete canvas.parentElement.dataset.acts; } },   // a thing on the front edge: its buttons hang under it (world3d.css), where nothing is behind them
    fps: () => fps,
    /** where a thing stands on the screen (the acts on a sticky sit here; the walk's hand finds things by this) */
    where(id) {
      const b = canvas.getBoundingClientRect(), out = () => { v3.project(cam); return { x: b.left + ((v3.x + 1) / 2) * b.width, y: b.top + ((1 - v3.y) / 2) * b.height }; };
      if (id === "jelly") { v3.copy(J.position); return out(); } if (id === "hour") { v3.copy(bead.position); return out(); }
      const l = [...live.values()].find((x) => x.target.id === id && x.kind === "tile") ?? [...live.values()].find((x) => x.target.id === id); if (!l) return null;
      l.obj.getWorldPosition(v3); if (l.kind === "folder" || l.kind === "project") v3.y += 0.4; else if (l.kind === "tile" && l.mood === "ask" && actsOn === id) { v3.y = 0; v3.z = ISLAND.d / 2 + 0.14;   /* just past the island's rim: nothing crosses its words */ } else v3.y += 0.2 + 0.22 * l.obj.scale.x; return out();
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("keydown", onTab); canvas.removeEventListener("blur", onBlur);
      host.remove(); scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => { (x as any).map?.dispose?.(); x.dispose(); }); });
      rt?.dispose(); (post.material as THREE.Material).dispose(); post.geometry.dispose(); r.dispose(); r.forceContextLoss();   // the WebGL context is given back at once
    },
  };
}

/** can this window draw WebGL at all (the still is shown when not) */
export function canDraw(): boolean {
  try { const c = document.createElement("canvas"); return !!c.getContext("webgl2"); } catch { return false; }
}
