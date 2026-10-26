// "Don Rana": a frog in a navy suit jacket, white shirt and red tie. No trousers,
// only bare green legs and webbed feet. See `Character` in sprite.ts.

import type { Character, Eyes, Mouth, RowOf, Setter } from "./sprite";

// Rows 0-12. The eyes sit in the two bumps on top of the head (rows 1-2), so a
// frog peeking over the taskbar shows its eyes first.
const BODY = [
  "..oooo....oooo..",
  ".oggggo..oggggo.",
  ".oggggggggggGGo.",
  ".ogggggggggggGo.",
  ".ogggggggggggGo.",
  ".oggggggggggGGo.",
  "..oggggggggGGo..",
  ".onnnwwwwwwnnno.",
  ".onnNwwrrwwNnno.",
  ".onnNNwrrwNNnno.",
  ".onnnNNrrNNnnno.",
  ".onnnnnNNnnnnno.",
  "..oooooooooooo..",
];

function eyes(set: Setter, row: RowOf, kind: Eyes, gaze: number) {
  const L = [3, 4];
  const R = [11, 12];
  // Open pupils can look sideways inside their bump; closed and happy ones stay put.
  const dx = kind === "closed" || kind === "happy" || kind === "x" ? 0 : gaze;
  const put = (cols: number[], r: number, c: string) => cols.forEach((x) => set(x + dx, row(r), c));
  switch (kind) {
    case "open": put([...L, ...R], 1, "e"); put([...L, ...R], 2, "e"); put([3, 11], 1, "w"); break;
    case "blink": put([...L, ...R], 1, "G"); put([...L, ...R], 2, "e"); break;
    case "closed": put([...L, ...R], 1, "g"); put([...L, ...R], 2, "o"); break;
    case "happy": put([...L, ...R], 1, "e"); put([3, 4, 11, 12], 2, "g"); break;
    case "wide":
      put([2, 5, 10, 13], 1, "w"); put([2, 5, 10, 13], 2, "w");
      put([...L, ...R], 1, "e"); put([...L, ...R], 2, "e"); put([3, 11], 1, "w");
      break;
    case "down": put([...L, ...R], 1, "G"); put([...L, ...R], 2, "e"); put([...L, ...R], 3, "e"); break;
    case "sad": put([...L, ...R], 2, "e"); put([4, 5, 10, 11], 1, "G"); break;
    case "up": put([...L, ...R], 1, "e"); put([3, 11], 1, "w"); break;
    case "x":
      for (const c of [2, 10]) { put([c, c + 2], 1, "e"); put([c + 1], 2, "e"); put([c, c + 2], 3, "e"); }
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
  for (const r of [1, 2]) {
    for (let x = 2; x <= (peek ? 5 : 13); x++) set(x, row(r), "G");
    set(2, row(r), "o"); set(peek ? 5 : 13, row(r), "o");
  }
}

function feet(set: Setter, row: RowOf, at: [number, number]) {
  for (const fx of at) {
    set(fx, row(13), "o"); set(fx + 1, row(13), "g"); set(fx + 2, row(13), "o");
    set(fx - 1, row(14), "o"); set(fx, row(14), "g"); set(fx + 1, row(14), "g"); set(fx + 2, row(14), "g"); set(fx + 3, row(14), "o");
  }
}

function sitLegs(set: Setter, row: RowOf) {
  for (const x of [2, 9]) {
    set(x, row(13), "o"); set(x + 1, row(13), "g"); set(x + 2, row(13), "g"); set(x + 3, row(13), "g"); set(x + 4, row(13), "o");
    for (const dx of [1, 2, 3]) set(x + dx, row(14), "o");
  }
}

export const FROG: Character = {
  id: "frog",
  body: BODY,
  palette: {
    o: "#2b3519", g: "#86a043", G: "#62803a", e: "#1a2010", m: "#2b3519", p: "#d9645a",
    n: "#34479f", N: "#232e78", w: "#f4f1e6", r: "#d9453b", b: "#86a043",
  },
  arm: "n",
  tint: ["n", "N"],
  tear: [3, 3],
  mouthAt: [8, 5],
  cheek: [2, 12, 3],
  sound: "¡Croac!",
  cover,
  eyes,
  mouth,
  feet,
  sitLegs,
};
