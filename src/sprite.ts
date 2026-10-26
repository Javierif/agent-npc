// Characters are drawn from code so every pose is derived from one base and stays
// consistent. "Postie" (a peach blob wearing a sticky note) is the default; others,
// like the frog in frog.ts, plug in through the `Character` interface below.

import { DUCK } from "./duck";
import { FROG } from "./frog";
import { HAMSTER } from "./hamster";

export type Pose =
  | "idle" | "blink" | "walk1" | "walk2" | "sit" | "sleep1" | "sleep2"
  | "wave1" | "wave2" | "work1" | "work2" | "think1" | "think2" | "think3" | "alert1" | "alert2"
  | "happy1" | "happy2" | "sad" | "held" | "juggle1" | "juggle2" | "look" | "hurt1" | "hurt2"
  | "yawn1" | "yawn2" | "idea1" | "idea2"
  | "scratch1" | "scratch2" | "sneeze1" | "sneeze2" | "shake" | "nod1" | "nod2"
  | "cover1" | "cover2" | "work3" | "work4" | "fly1" | "fly2" | "fly3" | "tongue" | "gulp"
  | "croak1" | "croak2" | "dance1" | "dance2" | "dance3"
  | "pet1" | "pet2" | "slap1" | "slap2" | "angry1" | "angry2";

export const SPRITE_W = 16;
export const SPRITE_H = 20;

const BASE_PALETTE: Record<string, string> = {
  o: "#3a2820", b: "#f4a67a", s: "#d98558", w: "#ffffff", e: "#2a1b17",
  p: "#f28b8b", m: "#7a3b2e", y: "#ffd966", Y: "#e3b341", f: "#5a3d32",
  L: "#9aa3ad", K: "#4b5560", t: "#6ec6ff", r: "#ff5a5a", z: "#8fb8ff",
  q: "#fff3a0", h: "#ffd3b8", "1": "#ff6b6b", "2": "#6bd6ff", "3": "#9bff6b",
  // hats
  A: "#e5484d", B: "#3b82f6", C: "#f5c542", D: "#2b2b33", E: "#ff8fb3",
};

export type HatId = "none" | "party" | "crown" | "tophat" | "beanie" | "flower" | "antenna" | "halo";
export const HATS: HatId[] = ["none", "party", "crown", "tophat", "beanie", "flower", "antenna", "halo"];
/** Hue turns (degrees) offered to tell the copies of the character apart. */
export const HUES = [0, 45, 90, 150, 200, 250, 300, 340];

/** How one copy of the character is told apart from the others: a colour and a hat. */
export interface Look {
  hue: number;
  hat: HatId;
}

// Hats are 16 columns wide; the last row sits on top of the head. Letters are palette keys.
const HAT_SHAPES: Record<Exclude<HatId, "none">, string[]> = {
  party: [".......CC.......", ".......AA.......", "......ABBA......", ".....AAAAAA....."],
  crown: ["....C..CC..C....", "....CCCCCCCC....", "....CACCCCAC...."],
  tophat: [".....DDDDDD.....", ".....DDDDDD.....", ".....DAAAAD.....", "...DDDDDDDDDD..."],
  beanie: [".......EE.......", "......BBBB......", ".....BBBBBB....."],
  flower: ["..........E.....", ".........EwE....", "..........E....."],
  antenna: [".......AA.......", ".......D........", ".......D........"],
  halo: [".....C....C.....", "......CCCC......"],
};

export type Eyes = "open" | "blink" | "closed" | "happy" | "wide" | "down" | "sad" | "up" | "x";
export type Mouth = "smile" | "flat" | "open" | "frown" | "tongue";
export type Setter = (x: number, y: number, c: string) => void;
export type RowOf = (bodyRow: number) => number;

/**
 * Everything that makes one character look different from another. The poses
 * (what each one is doing) are shared; a character only supplies the drawing.
 * Grids are SPRITE_W x SPRITE_H with the body in the 15 rows below BODY_TOP.
 */
export interface Character {
  id: string;
  /** Body rows 0-12; eyes, mouth and feet are painted on top. */
  body: string[];
  /** Colours specific to this character, laid over the shared palette (effects like "!" and "z" use the shared ones). */
  palette: Record<string, string>;
  /** Palette key used for the arms in waving / flailing poses. */
  arm: string;
  /** Palette keys that change colour when the character is given another hue. */
  tint: string[];
  /** Body-grid position of the tear shown when sad. */
  tear: [number, number];
  eyes(set: Setter, row: RowOf, eyes: Eyes, gaze: number): void;
  mouth(set: Setter, row: RowOf, mouth: Mouth): void;
  /** Draws the two feet (and legs) at the given left columns, rows 13-14. */
  feet(set: Setter, row: RowOf, at: [number, number]): void;
  /** Where the mouth is (x, body row), for the tongue and the sneeze spray. */
  mouthAt: [number, number];
  /** What it says when it vocalises, or null for a quiet character. */
  sound: string | null;
  /** Cheek columns (left, right) and body row, where a slap leaves its mark. */
  cheek: [number, number, number];
  /** Hands over the eyes; `peek` leaves one eye uncovered. */
  cover(set: Setter, row: RowOf, peek: boolean): void;
  /** Legs when sitting or sleeping; `thighs` adds the upper leg drawn when awake. */
  sitLegs(set: Setter, row: RowOf, thighs: boolean): void;
}

/** Themes are palette swaps of a character; Postie's sticky note changes colour too. */
export const THEMES: Record<string, { label: string; character?: string; colors: Record<string, string> }> = {
  postie: { label: "Postie", colors: {} },
  rana: { label: "Don Rana", character: "frog", colors: {} },
  pato: { label: "Don Pato", character: "duck", colors: {} },
  hamster: { label: "Don Hámster", character: "hamster", colors: {} },
  menta: { label: "Menta", colors: { b: "#8fd9a8", s: "#5fb883", p: "#ffb3c7", y: "#ff9ecb", Y: "#e06fa3" } },
  noche: { label: "Noche", colors: { b: "#9d8cf0", s: "#7261c9", p: "#f0a0d8", y: "#5ec8ff", Y: "#3a9fd6", o: "#1d1840" } },
  tostada: { label: "Tostada", colors: { b: "#d9a066", s: "#b57a3e", p: "#e8806a", y: "#f6f1e0", Y: "#d9cfae", o: "#2f1d10" } },
};

let palette = BASE_PALETTE;
let active: Character;

/** Mixes a `#rrggbb` colour towards white; used to derive the body highlight for any theme. */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, "0")).join("")}`;
}

/** Adds themes loaded from the user's themes folder. */
export function registerThemes(extra: Array<{ id: string; label: string; colors: Record<string, string> }>): void {
  for (const theme of extra) THEMES[theme.id] = { label: theme.label, colors: theme.colors };
}

/** Switches the active theme; unknown names fall back to the default. */
export function activeCharacter(): Character {
  return active;
}

export function setTheme(name: string): void {
  const theme = THEMES[name] ?? THEMES.postie;
  active = CHARACTERS[theme.character ?? "postie"] ?? POSTIE;
  palette = { ...BASE_PALETTE, ...active.palette, ...theme.colors };
  if (active === POSTIE && !theme.colors.h) palette.h = lighten(palette.b, 0.4);
  cache.clear();
}

const POSTIE_BODY = [
  ".....yyyyyy.....",
  "....yYYyyYYy....",
  "....YYYYYYYY....",
  "...oooooooooo...",
  "..obhhbbbbbbso..",
  ".obhhbbbbbbbbso.",
  ".obhbbbbbbbbbso.",
  ".obbbbbbbbbbbso.",
  ".obbbbbbbbbbbso.",
  ".obpbbbbbbbbpso.",
  ".obbbbbbbbbbsso.",
  "..osssssssssso..",
  "...oooooooooo...",
];

const BODY_TOP = 5; // rows above the body are free for effects (z, !, juggling balls)

interface Recipe {
  dy?: number;
  feet?: [number, number] | null;
  eyes?: Eyes;
  mouth?: Mouth;
  /** Pupil direction (-1, 0, 1) for poses that choose where to look. */
  gaze?: number;
  extra?: (set: Setter, rowOf: RowOf) => void;
}

const RECIPES: Record<Pose, Recipe> = {
  idle: {},
  blink: { eyes: "blink" },
  look: { eyes: "up" },
  walk1: { feet: [2, 10], dy: 0 },
  walk2: { feet: [4, 9], dy: -1 },
  sit: { dy: 1, feet: null, extra: (set, row) => active.sitLegs(set, row, true) },
  sleep1: { dy: 1, feet: null, eyes: "closed", mouth: "flat", extra: (set, row) => {
    active.sitLegs(set, row, false);
    zzz(set, 0);
  } },
  sleep2: { dy: 1, feet: null, eyes: "closed", mouth: "open", extra: (set, row) => {
    active.sitLegs(set, row, false);
    zzz(set, 1);
  } },
  wave1: { mouth: "smile", extra: (set, row) => arm(set, row, 0) },
  wave2: { mouth: "smile", extra: (set, row) => arm(set, row, 1) },
  work1: { eyes: "down", mouth: "flat", extra: (set, row) => laptop(set, row, 0) },
  work2: { eyes: "down", mouth: "flat", extra: (set, row) => laptop(set, row, 1) },
  think1: { eyes: "up", mouth: "flat", gaze: -1, extra: (set, row) => ponder(set, row, 1) },
  think2: { eyes: "up", mouth: "flat", gaze: 0, extra: (set, row) => ponder(set, row, 2) },
  think3: { eyes: "up", mouth: "flat", gaze: 1, extra: (set, row) => ponder(set, row, 3) },
  alert1: { eyes: "wide", mouth: "open", dy: -1, extra: (set) => bang(set, 0) },
  alert2: { eyes: "wide", mouth: "open", dy: 0, extra: (set) => bang(set, 1) },
  happy1: { eyes: "happy", mouth: "smile", dy: -3, feet: [3, 10], extra: (set) => sparkle(set, 0) },
  happy2: { eyes: "happy", mouth: "open", dy: 0, extra: (set) => sparkle(set, 1) },
  sad: { eyes: "sad", mouth: "frown", dy: 1, extra: (set, row) => {
    set(active.tear[0], row(active.tear[1]), "t");
  } },
  held: { eyes: "wide", mouth: "open", feet: [2, 11], extra: (set, row) => armsUp(set, row, 0) },
  hurt1: { eyes: "x", mouth: "frown", dy: 1, feet: [2, 11], extra: (set, row) => { armsUp(set, row, 1); stars(set, 0); } },
  hurt2: { eyes: "x", mouth: "open", dy: 1, feet: [2, 11], extra: (set) => stars(set, 1) },
  yawn1: { eyes: "closed", mouth: "open", extra: (set, row) => armsUp(set, row, 0) },
  yawn2: { eyes: "closed", mouth: "open", dy: -1, extra: (set, row) => armsUp(set, row, 1) },
  idea1: { eyes: "wide", mouth: "smile", dy: -1, extra: (set) => bulb(set, 0) },
  idea2: { eyes: "wide", mouth: "open", dy: -1, extra: (set) => bulb(set, 1) },
  scratch1: { eyes: "happy", mouth: "smile", extra: (set, row) => scratch(set, row, 0) },
  scratch2: { eyes: "happy", mouth: "smile", extra: (set, row) => scratch(set, row, 1) },
  sneeze1: { eyes: "closed", mouth: "open", dy: -1 },
  sneeze2: { eyes: "closed", mouth: "open", dy: 1, extra: (set, row) => spray(set, row) },
  shake: { eyes: "closed", mouth: "flat" },
  nod1: { eyes: "closed", mouth: "flat", dy: 1 },
  nod2: { eyes: "blink", mouth: "flat" },
  cover1: { eyes: "closed", mouth: "open", extra: (set, row) => active.cover(set, row, false) },
  cover2: { eyes: "wide", mouth: "open", extra: (set, row) => active.cover(set, row, true) },
  work3: { eyes: "down", mouth: "tongue", extra: (set, row) => laptop(set, row, 0) },
  work4: { eyes: "down", mouth: "tongue", extra: (set, row) => laptop(set, row, 1) },
  fly1: { eyes: "up", mouth: "flat", gaze: -1, extra: (set) => fly(set, 3, 2) },
  fly2: { eyes: "up", mouth: "flat", gaze: 1, extra: (set) => fly(set, 13, 1) },
  fly3: { eyes: "up", mouth: "flat", gaze: 1, extra: (set, row) => fly(set, 14, row(active.mouthAt[1]) - 2) },
  tongue: { eyes: "up", mouth: "open", gaze: 1, extra: (set, row) => {
    const y = row(active.mouthAt[1]) - 2;
    tongueLine(set, row, 14, y);
    fly(set, 15, y);
  } },
  gulp: { eyes: "happy", mouth: "smile" },
  croak1: { eyes: "open", mouth: "open", dy: -1 },
  croak2: { eyes: "blink", mouth: "open" },
  dance1: { eyes: "happy", mouth: "smile", dy: -1, extra: (set, row) => armSingle(set, row, 0, 3) },
  dance2: { eyes: "happy", mouth: "open", dy: -3, feet: [3, 10], extra: (set, row) => { armsUp(set, row, 0); sparkle(set, 1); } },
  dance3: { eyes: "happy", mouth: "smile", dy: -1, extra: (set, row) => armSingle(set, row, 15, 3) },
  pet1: { eyes: "happy", mouth: "smile", extra: (set) => hearts(set, 0) },
  pet2: { eyes: "happy", mouth: "smile", extra: (set) => hearts(set, 1) },
  slap1: { eyes: "closed", mouth: "open", dy: 1, extra: (set, row) => slapMark(set, row, 0) },
  slap2: { eyes: "closed", mouth: "open", dy: 1, extra: (set, row) => slapMark(set, row, 1) },
  angry1: { eyes: "sad", mouth: "frown", extra: (set) => anger(set, 0) },
  angry2: { eyes: "sad", mouth: "frown", extra: (set) => anger(set, 1) },
  juggle1: { eyes: "up", mouth: "smile", extra: (set) => balls(set, 0) },
  juggle2: { eyes: "up", mouth: "smile", extra: (set) => balls(set, 1) },
};

/** Thinking: a hand at the chin and a row of dots that fills up, one more per frame. */
function ponder(set: Setter, row: RowOf, dots: number) {
  for (let i = 0; i < dots; i++) {
    const x = 7 + i * 3;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, 1 + dy, "L");
  }
  set(15, row(8), "o"); set(15, row(9), active.arm); set(15, row(10), active.arm); set(15, row(11), "o");
  set(14, row(10), active.arm);
}

/** Floating hearts: one big one, then two small ones. */
function hearts(set: Setter, frame: number) {
  const big = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
  const small = [[0, 0], [2, 0], [1, 1]];
  if (frame === 0) for (const [dx, dy] of big) set(6 + dx, dy, "r");
  else for (const [x, y] of [[3, 2], [12, 1]]) for (const [dx, dy] of small) set(x + dx, y + dy, "r");
}

/** A red hand mark on the cheek that was hit (0 = left, 1 = right). */
function slapMark(set: Setter, row: RowOf, side: number) {
  const [left, right, r] = active.cheek;
  const x = side === 0 ? left : right;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, row(r) + dy, "r");
}

/** The cross-shaped anger vein, then puffs of steam. */
function anger(set: Setter, frame: number) {
  if (frame === 0) {
    for (const [x, y] of [[12, 1], [14, 1], [13, 2], [12, 3], [14, 3]]) set(x, y, "r");
  } else {
    for (const [x, y] of [[3, 2], [4, 1], [12, 2], [11, 1]]) set(x, y, "w");
  }
}

/** One raised arm at the given edge column. */
function armSingle(set: Setter, row: RowOf, x: number, top: number) {
  set(x, row(top), "o"); set(x, row(top + 1), active.arm); set(x, row(top + 2), active.arm); set(x, row(top + 3), "o");
}

/** A hand on the head, rubbing back and forth. */
function scratch(set: Setter, row: RowOf, frame: number) {
  armSingle(set, row, 15, 2);
  set(frame === 0 ? 13 : 14, row(2), active.arm);
  set(frame === 0 ? 14 : 13, row(2), "o");
}

/** Sneeze spray flying out of the mouth. */
function spray(set: Setter, row: RowOf) {
  const [mx, my] = active.mouthAt;
  for (const [dx, dy] of [[3, -1], [5, 0], [4, 1], [6, -2]]) set(mx + dx, row(my) + dy, "t");
}

function fly(set: Setter, x: number, y: number) {
  set(x, y, "e"); set(x - 1, y - 1, "w"); set(x + 1, y - 1, "w");
}

/** The tongue, from the mouth in a straight line to a point of the grid. */
function tongueLine(set: Setter, row: RowOf, tx: number, ty: number) {
  const [mx, my] = active.mouthAt;
  const x0 = mx + 1;
  const y0 = row(my);
  const n = Math.max(Math.abs(tx - x0), Math.abs(ty - y0), 1);
  for (let i = 0; i <= n; i++) set(Math.round(x0 + ((tx - x0) * i) / n), Math.round(y0 + ((ty - y0) * i) / n), "p");
}

/** A lightbulb over the head; the second frame is lit with rays. */
function bulb(set: Setter, frame: number) {
  const glass = frame === 0 ? "y" : "q";
  for (const x of [7, 8, 9]) set(x, 0, glass);
  for (const x of [6, 7, 8, 9, 10]) set(x, 1, glass);
  for (const x of [7, 8, 9]) set(x, 2, glass);
  set(7, 3, "L"); set(8, 3, "L"); set(9, 3, "L"); set(8, 4, "K");
  if (frame === 1) {
    for (const [x, y] of [[4, 1], [12, 1], [5, 3], [11, 3], [8, -1]]) set(x, y, "q");
  }
}

function zzz(set: (x: number, y: number, c: string) => void, frame: number) {
  const ox = frame === 0 ? 12 : 13;
  const oy = frame === 0 ? 2 : 0;
  for (let i = 0; i < 3; i++) { set(ox + i, oy, "z"); set(ox + i, oy + 2, "z"); }
  set(ox + 1, oy + 1, "z");
}

function bang(set: (x: number, y: number, c: string) => void, frame: number) {
  const y = frame === 0 ? 0 : 1;
  set(8, y, "r"); set(8, y + 1, "r"); set(8, y + 2, "r"); set(8, y + 4, "r");
  set(7, y, "r"); set(7, y + 1, "r"); set(7, y + 2, "r"); set(7, y + 4, "r");
}

function sparkle(set: (x: number, y: number, c: string) => void, frame: number) {
  const spots = frame === 0 ? [[1, 3], [14, 2], [13, 7]] : [[0, 6], [15, 4], [2, 1]];
  for (const [x, y] of spots) { set(x, y, "q"); set(x + 1, y, "q"); set(x, y + 1, "q"); }
}

function stars(set: (x: number, y: number, c: string) => void, frame: number) {
  const spots = frame === 0 ? [[2, 2], [13, 1]] : [[13, 3], [3, 1]];
  for (const [x, y] of spots) {
    set(x, y, "q"); set(x - 1, y, "q"); set(x + 1, y, "q"); set(x, y - 1, "q"); set(x, y + 1, "q");
  }
}

/** Both arms raised (flailing in the air or in pain); `frame` alternates the height. */
function armsUp(set: (x: number, y: number, c: string) => void, row: (n: number) => number, frame: number) {
  for (const x of [0, 15]) {
    const top = frame === 0 ? 3 : 4;
    set(x, row(top), "o"); set(x, row(top + 1), active.arm); set(x, row(top + 2), active.arm); set(x, row(top + 3), "o");
  }
}

function balls(set: (x: number, y: number, c: string) => void, frame: number) {
  const spots = frame === 0 ? [[2, 1, "1"], [7, 0, "2"], [12, 2, "3"]] : [[3, 2, "2"], [7, 1, "3"], [11, 0, "1"]];
  for (const [x, y, c] of spots) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set((x as number) + dx, (y as number) + dy, c as string);
  }
}

function arm(set: (x: number, y: number, c: string) => void, row: (n: number) => number, frame: number) {
  const top = frame === 0 ? 4 : 3;
  set(15, row(top), "o");
  set(15, row(top + 1), active.arm);
  set(15, row(top + 2), active.arm);
  set(15, row(top + 3), "o");
}

function laptop(set: (x: number, y: number, c: string) => void, row: (n: number) => number, frame: number) {
  for (let x = 4; x <= 11; x++) set(x, row(10), "L");
  set(7, row(10), "w"); set(8, row(10), "w");
  for (let x = 3; x <= 12; x++) set(x, row(11), "K");
  set(frame === 0 ? 5 : 6, row(11), "b");
  set(frame === 0 ? 10 : 9, row(11), "b");
}

function postieEyes(set: Setter, row: RowOf, eyes: Eyes, gaze: number) {
  const pairs: Array<[number, number, string]> = [];
  // Open eyes can look sideways; closed and happy ones are drawn as arcs and stay put.
  const dx = eyes === "closed" || eyes === "happy" ? 0 : gaze;
  const both = (cols: number[], r: number, c: string) => cols.forEach((x) => pairs.push([x + dx, r, c]));
  const L = [4, 5];
  const R = [10, 11];
  switch (eyes) {
    case "open": both([...L, ...R], 6, "e"); both([...L, ...R], 7, "e"); both([4, 10], 6, "w"); break;
    case "blink": both([...L, ...R], 7, "e"); break;
    case "closed": both([...L, ...R], 7, "o"); break;
    case "happy": both([...L, ...R], 6, "e"); both([3, 6, 9, 12], 7, "e"); break;
    case "wide": both([...L, ...R], 5, "e"); both([...L, ...R], 6, "e"); both([...L, ...R], 7, "e"); both([4, 10], 5, "w"); break;
    case "down": both([...L, ...R], 7, "e"); both([...L, ...R], 8, "e"); break;
    case "sad": both([...L, ...R], 7, "e"); both([3, 12], 6, "o"); break;
    case "x":
      for (const c of [3, 10]) { both([c, c + 2], 6, "e"); both([c + 1], 7, "e"); both([c, c + 2], 8, "e"); }
      break;
    case "up": both([...L, ...R], 5, "e"); both([...L, ...R], 6, "e"); break;
  }
  for (const [x, r, c] of pairs) set(x, row(r), c);
}

function postieMouth(set: Setter, row: RowOf, mouth: Mouth) {
  switch (mouth) {
    case "smile": set(6, row(9), "m"); set(9, row(9), "m"); set(7, row(10), "m"); set(8, row(10), "m"); break;
    case "flat": set(7, row(9), "m"); set(8, row(9), "m"); break;
    case "open": for (const r of [9, 10]) { set(7, row(r), "m"); set(8, row(r), "m"); } break;
    case "frown": set(7, row(9), "m"); set(8, row(9), "m"); set(6, row(10), "m"); set(9, row(10), "m"); break;
    case "tongue": set(7, row(9), "m"); set(8, row(9), "m"); set(9, row(9), "p"); set(10, row(9), "p"); break;
  }
}

function postieFeet(set: Setter, row: RowOf, at: [number, number]) {
  for (const fx of at) {
    set(fx, row(13), "o"); set(fx + 1, row(13), "f"); set(fx + 2, row(13), "o");
    set(fx, row(14), "o"); set(fx + 1, row(14), "o"); set(fx + 2, row(14), "o");
  }
}

function postieSitLegs(set: Setter, row: RowOf, thighs: boolean) {
  for (const x of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13]) set(x, row(13), "o");
  if (thighs) for (const x of [3, 4, 5, 10, 11, 12]) set(x, row(12), "f");
}

function postieCover(set: Setter, row: RowOf, peek: boolean) {
  for (const r of [6, 7]) {
    for (let x = 3; x <= (peek ? 9 : 12); x++) set(x, row(r), "s");
    set(3, row(r), "o"); set(peek ? 9 : 12, row(r), "o");
  }
}

const POSTIE: Character = {
  id: "postie",
  body: POSTIE_BODY,
  palette: {},
  arm: "b",
  tint: ["b", "s", "h"],
  tear: [4, 9],
  mouthAt: [8, 10],
  cheek: [2, 12, 8],
  sound: null,
  cover: postieCover,
  eyes: postieEyes,
  mouth: postieMouth,
  feet: postieFeet,
  sitLegs: postieSitLegs,
};

const CHARACTERS: Record<string, Character> = { postie: POSTIE, frog: FROG, duck: DUCK, hamster: HAMSTER };
active = POSTIE;

const cache = new Map<string, HTMLCanvasElement>();

/** Turns a `#rrggbb` colour round the colour wheel by `degrees`, keeping its saturation and lightness. */
function rotateHue(hex: string, degrees: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d > 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const hue = (((h + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** The colour that stands for a hue in a picker: the character's main tinted colour at that hue. */
export function swatchColor(hue: number): string {
  return rotateHue(palette[active.tint[0]] ?? "#f4a67a", hue);
}

function paintHat(set: Setter, row: RowOf, hat: Exclude<HatId, "none">) {
  const shape = HAT_SHAPES[hat];
  shape.forEach((line, i) => {
    const r = i - shape.length;
    [...line].forEach((c, x) => c !== "." && set(x, row(r), c));
  });
}

/** Draws `pose` into a canvas at an integer `scale`. Result is cached per pose/scale/look. */
export function renderPose(pose: Pose, scale: number, gaze = 0, look?: Look): HTMLCanvasElement {
  const hue = look?.hue ?? 0;
  const hat = look?.hat ?? "none";
  const key = `${pose}@${scale}@${gaze}@${hue}@${hat}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const recipe = RECIPES[pose];
  const dy = recipe.dy ?? 0;
  const grid: string[][] = Array.from({ length: SPRITE_H }, () => Array(SPRITE_W).fill("."));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H) grid[y][x] = c;
  };
  const row = (bodyRow: number) => BODY_TOP + dy + bodyRow;

  active.body.forEach((line, r) => [...line].forEach((c, x) => c !== "." && set(x, row(r), c)));
  active.eyes(set, row, recipe.eyes ?? "open", gaze || (recipe.gaze ?? 0));
  active.mouth(set, row, recipe.mouth ?? "smile");

  const feet = recipe.feet === undefined ? ([3, 10] as [number, number]) : recipe.feet;
  if (feet) active.feet(set, row, feet);
  if (hat !== "none") paintHat(set, row, hat);
  recipe.extra?.(set, row);

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_W * scale;
  canvas.height = SPRITE_H * scale;
  const ctx = canvas.getContext("2d")!;
  let colors = palette;
  if (hue) {
    colors = { ...palette };
    for (const k of active.tint) if (colors[k]) colors[k] = rotateHue(colors[k], hue);
  }
  grid.forEach((line, y) =>
    line.forEach((c, x) => {
      const color = colors[c];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }));
  cache.set(key, canvas);
  return canvas;
}
