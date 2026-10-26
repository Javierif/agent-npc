// "Don Hámster": a hamster in a forest-green suit jacket, white shirt and mustard tie. No
// trousers, only little pink paws. See `Character` in sprite.ts.

import type { Character, Eyes, Mouth, RowOf, Setter } from "./sprite";

// Rows 0-12. Two round ears, a chubby head with a pale muzzle and puffed cheeks (rows 4-6)
// and a pink nose; the jacket, shirt and tie (rows 7-12) match the other suited characters.
const BODY = [
  "..ooo......ooo..",
  ".oiiiooooooiiio.",
  ".oddddddddddddo.",
  "oddddddddddddddo",
  "odddcccnncccdddo",
  "oddccccccccccddo",
  ".odccccccccccdo.",
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
      for (const [a, b] of [[3, 5], [12, 10]]) {
        set(a, row(2), "e"); set(b, row(2), "e"); set((a + b) / 2, row(3), "e"); set(a, row(4), "e");
      }
      break;
  }
}

// The mouth sits under the nose (row 4), on the pale muzzle.
function mouth(set: Setter, row: RowOf, kind: Mouth) {
  const line = (from: number, to: number, r: number) => { for (let x = from; x <= to; x++) set(x, row(r), "m"); };
  switch (kind) {
    case "smile": line(6, 9, 5); set(5, row(4), "m"); set(10, row(4), "m"); break;
    case "flat": line(6, 9, 5); break;
    case "open": line(6, 9, 5); line(7, 8, 6); set(7, row(6), "p"); set(8, row(6), "p"); break;
    case "frown": line(6, 9, 5); set(5, row(6), "m"); set(10, row(6), "m"); break;
    case "tongue": line(6, 9, 5); set(8, row(6), "p"); break;
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
    set(fx, row(13), "o"); set(fx + 1, row(13), "k"); set(fx + 2, row(13), "k"); set(fx + 3, row(13), "o");
    set(fx + 1, row(14), "o"); set(fx + 2, row(14), "o");
  }
}

function sitLegs(set: Setter, row: RowOf) {
  for (const x of [2, 9]) {
    set(x, row(13), "o"); set(x + 1, row(13), "k"); set(x + 2, row(13), "k"); set(x + 3, row(13), "k"); set(x + 4, row(13), "o");
    for (const dx of [1, 2, 3]) set(x + dx, row(14), "o");
  }
}

export const HAMSTER: Character = {
  id: "hamster",
  body: BODY,
  palette: {
    o: "#3d2a18", d: "#e2a867", a: "#c08340", c: "#f8e8cf", i: "#f0a8a0", n: "#e07f86", k: "#eab8a2",
    e: "#241a12", m: "#7a3a14", p: "#d9645a",
    u: "#2f6b5a", U: "#1f4c40", w: "#f4f1e6", r: "#d9a73a", b: "#e2a867",
  },
  arm: "u",
  tint: ["u", "U"],
  tear: [3, 4],
  mouthAt: [8, 5],
  cheek: [2, 13, 5],
  sound: "¡Squic!",
  cover,
  eyes,
  mouth,
  feet,
  sitLegs,
};
