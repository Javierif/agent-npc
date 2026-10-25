// Renders Codex pets: a spritesheet of 8 columns x 9 rows of 192x208 cells, one animation per row.
// Row order and frame counts follow the community documentation of the Codex pet format.

import type { Pose } from "./sprite";

export const PET_CELL_W = 192;
export const PET_CELL_H = 208;

const ROWS = {
  idle: { row: 0, frames: 6, ms: 160 },
  runRight: { row: 1, frames: 8, ms: 90 },
  runLeft: { row: 2, frames: 8, ms: 90 },
  waving: { row: 3, frames: 4, ms: 180 },
  jumping: { row: 4, frames: 5, ms: 120 },
  failed: { row: 5, frames: 8, ms: 120 },
  waiting: { row: 6, frames: 6, ms: 150 },
  running: { row: 7, frames: 6, ms: 110 },
  review: { row: 8, frames: 6, ms: 150 },
} as const;

type RowName = keyof typeof ROWS;

export function rowFor(pose: Pose, facing: 1 | -1): RowName {
  switch (pose) {
    case "walk1":
    case "walk2": return facing === 1 ? "runRight" : "runLeft";
    case "wave1":
    case "wave2": return "waving";
    case "work1":
    case "work2":
    case "juggle1":
    case "juggle2": return "running";
    case "think": return "review";
    case "alert1":
    case "alert2": return "waiting";
    case "happy1":
    case "happy2":
    case "held": return "jumping";
    case "sad": return "failed";
    default: return "idle";
  }
}

export function frameFor(row: RowName, seconds: number): number {
  const { frames, ms } = ROWS[row];
  return Math.floor((seconds * 1000) / ms) % frames;
}

export class PetSheet {
  private constructor(private readonly image: HTMLImageElement) {}

  static load(dataUrl: string): Promise<PetSheet> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(new PetSheet(image));
      image.onerror = () => reject(new Error("could not decode the pet spritesheet"));
      image.src = dataUrl;
    });
  }

  draw(ctx: CanvasRenderingContext2D, pose: Pose, facing: 1 | -1, seconds: number, width: number, height: number) {
    const row = rowFor(pose, facing);
    const frame = frameFor(row, seconds);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.image, frame * PET_CELL_W, ROWS[row].row * PET_CELL_H, PET_CELL_W, PET_CELL_H, 0, 0, width, height);
  }
}
