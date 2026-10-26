// "Don Pato": a duck in a charcoal suit jacket, white shirt and burgundy tie. No
// trousers, only bare orange legs and webbed feet. See `Character` in sprite.ts.

import type { Character, Eyes, Mouth, RowOf, Setter } from "./sprite";

// Rows 0-12. Round yellow head with a flat orange bill (rows 4-6) and the eyes above it.
const BODY = [
  ".....oooooo.....",
  "...ooddddddoo...",
  "..odddddddddao..",
  ".odddddddddddao.",
  ".odddkkkkkkddao.",
  ".odddkkkkkkddao.",
  "..odddjjjjddao..",
  ".ouuuwwwwwwuuuo.",
  ".ouuUwwrrwwUuuo.",
  ".ouuUUwrrwUUuuo.",
  ".ouuuUUrrUUuuuo.",
  ".ouuuuuUUuuuuuo.",
  "..oooooooooooo..",
];

function eyes(set: Setter, row: RowOf, kind: Eyes, gaze: number) {
  const L = [4, 5];
  const R = [10, 11];
  // Open pupils can look sideways; closed and happy ones stay put.
  const dx = kind === "closed" || kind === "happy" || kind === "x" ? 0 : gaze;
  const put = (cols: number[], r: number, c: string) => cols.forEach((x) => set(x + dx, row(r), c));
  switch (kind) {
    case "open": put([...L, ...R], 2, "e"); put([...L, ...R], 3, "e"); put([4, 10], 2, "w"); break;
    case "blink": put([...L, ...R], 2, "d"); put([...L, ...R], 3, "e"); break;
    case "closed": put([...L, ...R], 2, "d"); put([...L, ...R], 3, "o"); break;
    case "happy": put([...L, ...R], 2, "e"); put([...L, ...R], 3, "d"); break;
    case "wide":
      put([3, 6, 9, 12], 2, "w"); put([3, 6, 9, 12], 3, "w");
      put([...L, ...R], 2, "e"); put([...L, ...R], 3, "e"); put([4, 10], 2, "w");
      break;
    case "down": put([...L, ...R], 2, "a"); put([...L, ...R], 3, "e"); break;
    case "sad": put([...L, ...R], 3, "e"); put([5, 6, 9, 10], 2, "a"); break;
    case "up": put([...L, ...R], 2, "e"); put([4, 10], 2, "w"); put([...L, ...R], 3, "d"); break;
    case "x":
      // The bill takes the inner corner of the bottom row, so those two pixels are skipped.
      for (const [a, b] of [[3, 5], [12, 10]]) {
        set(a, row(2), "e"); set(b, row(2), "e"); set((a + b) / 2, row(3), "e"); set(a, row(4), "e");
      }
      break;
  }
}

function mouth(set: Setter, row: RowOf, kind: Mouth) {
  const line = (from: number, to: number, r: number) => { for (let x = from; x <= to; x++) set(x, row(r), "m"); };
  switch (kind) {
    case "smile": line(5, 10, 5); set(4, row(4), "m"); set(11, row(4), "m"); break;
    case "flat": line(4, 11, 5); break;
    case "open": line(5, 10, 5); line(6, 9, 6); set(7, row(6), "p"); set(8, row(6), "p"); break;
    case "frown": line(5, 10, 5); set(4, row(6), "m"); set(11, row(6), "m"); break;
    case "tongue": line(4, 11, 5); set(8, row(6), "p"); set(8, row(7), "p"); break;
  }
}

function cover(set: Setter, row: RowOf, peek: boolean) {
  const end = peek ? 6 : 12;
  for (const r of [2, 3]) {
    for (let x = 3; x <= end; x++) set(x, row(r), "a");
    set(3, row(r), "o"); set(end, row(r), "o");
  }
}

function feet(set: Setter, row: RowOf, at: [number, number]) {
  for (const fx of at) {
    set(fx, row(13), "o"); set(fx + 1, row(13), "k"); set(fx + 2, row(13), "o");
    set(fx - 1, row(14), "o"); set(fx, row(14), "k"); set(fx + 1, row(14), "k"); set(fx + 2, row(14), "k"); set(fx + 3, row(14), "o");
  }
}

function sitLegs(set: Setter, row: RowOf) {
  for (const x of [2, 9]) {
    set(x, row(13), "o"); set(x + 1, row(13), "k"); set(x + 2, row(13), "k"); set(x + 3, row(13), "k"); set(x + 4, row(13), "o");
    for (const dx of [1, 2, 3]) set(x + dx, row(14), "o");
  }
}

export const DUCK: Character = {
  id: "duck",
  body: BODY,
  palette: {
    o: "#3b2c14", d: "#f7d54a", a: "#dcae2b", k: "#f08a24", j: "#c4631a", e: "#241a12", m: "#7a3a14", p: "#d9645a",
    u: "#4a4f5c", U: "#30333f", w: "#f4f1e6", r: "#8e2a45", b: "#f7d54a",
  },
  arm: "u",
  tint: ["u", "U"],
  tear: [3, 4],
  mouthAt: [8, 5],
  cheek: [3, 12, 4],
  sound: "¡Cuac!",
  cover,
  eyes,
  mouth,
  feet,
  sitLegs,
};
