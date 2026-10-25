// Original character: "Postie", a peach blob wearing a sticky note. Drawn from
// code so every pose is derived from one base and stays consistent.

export type Pose =
  | "idle" | "blink" | "walk1" | "walk2" | "sit" | "sleep1" | "sleep2"
  | "wave1" | "wave2" | "work1" | "work2" | "think" | "alert1" | "alert2"
  | "happy1" | "happy2" | "sad" | "held" | "juggle1" | "juggle2" | "look";

export const SPRITE_W = 16;
export const SPRITE_H = 20;

const BASE_PALETTE: Record<string, string> = {
  o: "#3a2820", b: "#f4a67a", s: "#d98558", w: "#ffffff", e: "#2a1b17",
  p: "#f28b8b", m: "#7a3b2e", y: "#ffd966", Y: "#e3b341", f: "#5a3d32",
  L: "#9aa3ad", K: "#4b5560", t: "#6ec6ff", r: "#ff5a5a", z: "#8fb8ff",
  q: "#fff3a0", "1": "#ff6b6b", "2": "#6bd6ff", "3": "#9bff6b",
};

/** Themes are palette swaps of the same character; the sticky note on its head changes colour too. */
export const THEMES: Record<string, { label: string; colors: Record<string, string> }> = {
  postie: { label: "Postie", colors: {} },
  menta: { label: "Menta", colors: { b: "#8fd9a8", s: "#5fb883", p: "#ffb3c7", y: "#ff9ecb", Y: "#e06fa3" } },
  noche: { label: "Noche", colors: { b: "#9d8cf0", s: "#7261c9", p: "#f0a0d8", y: "#5ec8ff", Y: "#3a9fd6", o: "#1d1840" } },
  tostada: { label: "Tostada", colors: { b: "#d9a066", s: "#b57a3e", p: "#e8806a", y: "#f6f1e0", Y: "#d9cfae", o: "#2f1d10" } },
};

let palette = BASE_PALETTE;

/** Adds themes loaded from the user's themes folder. */
export function registerThemes(extra: Array<{ id: string; label: string; colors: Record<string, string> }>): void {
  for (const theme of extra) THEMES[theme.id] = { label: theme.label, colors: theme.colors };
}

/** Switches the active theme; unknown names fall back to the default. */
export function setTheme(name: string): void {
  const theme = THEMES[name] ?? THEMES.postie;
  palette = { ...BASE_PALETTE, ...theme.colors };
  cache.clear();
}

// Rows 0-12 of the body (the feet are drawn separately). Eyes and mouth are blank.
const BODY = [
  ".....yyyyyy.....",
  "....yyyyyyyy....",
  "....YYYYYYYY....",
  "...oooooooooo...",
  "..obbbbbbbbbbo..",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obpbbbbbbbbpbo.",
  ".obbbbbbbbbbbbo.",
  "..osssssssssso..",
  "...oooooooooo...",
];

const BODY_TOP = 5; // rows above the body are free for effects (z, !, juggling balls)

type Eyes = "open" | "blink" | "closed" | "happy" | "wide" | "down" | "sad" | "up";
type Mouth = "smile" | "flat" | "open" | "frown";

interface Recipe {
  dy?: number;
  feet?: [number, number] | null;
  eyes?: Eyes;
  mouth?: Mouth;
  extra?: (set: (x: number, y: number, c: string) => void, rowOf: (bodyRow: number) => number) => void;
}

const RECIPES: Record<Pose, Recipe> = {
  idle: {},
  blink: { eyes: "blink" },
  look: { eyes: "up" },
  walk1: { feet: [2, 10], dy: 0 },
  walk2: { feet: [4, 9], dy: -1 },
  sit: { dy: 1, feet: null, extra: (set, row) => {
    for (const x of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13]) set(x, row(13), "o");
    for (const x of [3, 4, 5, 10, 11, 12]) set(x, row(12), "f");
  } },
  sleep1: { dy: 1, feet: null, eyes: "closed", mouth: "flat", extra: (set, row) => {
    for (const x of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13]) set(x, row(13), "o");
    zzz(set, 0);
  } },
  sleep2: { dy: 1, feet: null, eyes: "closed", mouth: "open", extra: (set, row) => {
    for (const x of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13]) set(x, row(13), "o");
    zzz(set, 1);
  } },
  wave1: { mouth: "smile", extra: (set, row) => arm(set, row, 0) },
  wave2: { mouth: "smile", extra: (set, row) => arm(set, row, 1) },
  work1: { eyes: "down", mouth: "flat", extra: (set, row) => laptop(set, row, 0) },
  work2: { eyes: "down", mouth: "flat", extra: (set, row) => laptop(set, row, 1) },
  think: { eyes: "up", mouth: "flat", extra: (set) => {
    set(13, 3, "w"); set(14, 2, "w"); set(15, 0, "w"); set(14, 0, "w"); set(15, 1, "w");
  } },
  alert1: { eyes: "wide", mouth: "open", dy: -1, extra: (set) => bang(set, 0) },
  alert2: { eyes: "wide", mouth: "open", dy: 0, extra: (set) => bang(set, 1) },
  happy1: { eyes: "happy", mouth: "smile", dy: -3, feet: [3, 10], extra: (set) => sparkle(set, 0) },
  happy2: { eyes: "happy", mouth: "open", dy: 0, extra: (set) => sparkle(set, 1) },
  sad: { eyes: "sad", mouth: "frown", dy: 1, extra: (set, row) => {
    set(4, row(8) + 1, "t");
  } },
  held: { eyes: "wide", mouth: "open", feet: [2, 11] },
  juggle1: { eyes: "up", mouth: "smile", extra: (set) => balls(set, 0) },
  juggle2: { eyes: "up", mouth: "smile", extra: (set) => balls(set, 1) },
};

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

function balls(set: (x: number, y: number, c: string) => void, frame: number) {
  const spots = frame === 0 ? [[2, 1, "1"], [7, 0, "2"], [12, 2, "3"]] : [[3, 2, "2"], [7, 1, "3"], [11, 0, "1"]];
  for (const [x, y, c] of spots) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set((x as number) + dx, (y as number) + dy, c as string);
  }
}

function arm(set: (x: number, y: number, c: string) => void, row: (n: number) => number, frame: number) {
  const top = frame === 0 ? 4 : 3;
  set(15, row(top), "o");
  set(15, row(top + 1), "b");
  set(15, row(top + 2), "b");
  set(15, row(top + 3), "o");
}

function laptop(set: (x: number, y: number, c: string) => void, row: (n: number) => number, frame: number) {
  for (let x = 4; x <= 11; x++) set(x, row(10), "L");
  set(7, row(10), "w"); set(8, row(10), "w");
  for (let x = 3; x <= 12; x++) set(x, row(11), "K");
  set(frame === 0 ? 5 : 6, row(11), "b");
  set(frame === 0 ? 10 : 9, row(11), "b");
}

function paintEyes(set: (x: number, y: number, c: string) => void, row: (n: number) => number, eyes: Eyes, gaze: number) {
  const pairs: Array<[number, number, string]> = [];
  // Open eyes can look sideways; closed and happy ones are drawn as arcs and stay put.
  const dx = eyes === "closed" || eyes === "happy" ? 0 : gaze;
  const both = (cols: number[], r: number, c: string) => cols.forEach((x) => pairs.push([x + dx, r, c]));
  const L = [4, 5];
  const R = [10, 11];
  switch (eyes) {
    case "open": both([...L, ...R], 6, "e"); both([...L, ...R], 7, "e"); break;
    case "blink": both([...L, ...R], 7, "e"); break;
    case "closed": both([...L, ...R], 7, "o"); break;
    case "happy": both([...L, ...R], 6, "e"); both([3, 6, 9, 12], 7, "e"); break;
    case "wide": both([...L, ...R], 5, "e"); both([...L, ...R], 6, "e"); both([...L, ...R], 7, "e"); break;
    case "down": both([...L, ...R], 7, "e"); both([...L, ...R], 8, "e"); break;
    case "sad": both([...L, ...R], 7, "e"); both([3, 12], 6, "o"); break;
    case "up": both([...L, ...R], 5, "e"); both([...L, ...R], 6, "e"); break;
  }
  for (const [x, r, c] of pairs) set(x, row(r), c);
}

function paintMouth(set: (x: number, y: number, c: string) => void, row: (n: number) => number, mouth: Mouth) {
  switch (mouth) {
    case "smile": set(6, row(9), "m"); set(9, row(9), "m"); set(7, row(10), "m"); set(8, row(10), "m"); break;
    case "flat": set(7, row(9), "m"); set(8, row(9), "m"); break;
    case "open": for (const r of [9, 10]) { set(7, row(r), "m"); set(8, row(r), "m"); } break;
    case "frown": set(7, row(9), "m"); set(8, row(9), "m"); set(6, row(10), "m"); set(9, row(10), "m"); break;
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Draws `pose` into a canvas at an integer `scale`. Result is cached per pose/scale. */
export function renderPose(pose: Pose, scale: number, gaze = 0): HTMLCanvasElement {
  const key = `${pose}@${scale}@${gaze}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const recipe = RECIPES[pose];
  const dy = recipe.dy ?? 0;
  const grid: string[][] = Array.from({ length: SPRITE_H }, () => Array(SPRITE_W).fill("."));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H) grid[y][x] = c;
  };
  const row = (bodyRow: number) => BODY_TOP + dy + bodyRow;

  BODY.forEach((line, r) => [...line].forEach((c, x) => c !== "." && set(x, row(r), c)));
  paintEyes(set, row, recipe.eyes ?? "open", gaze);
  paintMouth(set, row, recipe.mouth ?? "smile");

  const feet = recipe.feet === undefined ? ([3, 10] as [number, number]) : recipe.feet;
  if (feet) {
    for (const fx of feet) {
      set(fx, row(13), "o"); set(fx + 1, row(13), "f"); set(fx + 2, row(13), "o");
      set(fx, row(14), "o"); set(fx + 1, row(14), "o"); set(fx + 2, row(14), "o");
    }
  }
  recipe.extra?.(set, row);

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_W * scale;
  canvas.height = SPRITE_H * scale;
  const ctx = canvas.getContext("2d")!;
  grid.forEach((line, y) =>
    line.forEach((c, x) => {
      const color = palette[c];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }));
  cache.set(key, canvas);
  return canvas;
}
