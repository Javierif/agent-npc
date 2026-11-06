// Landing page: renders the real characters from src/sprite.ts.
import { renderPose, setTheme, type Pose } from "../src/sprite";

const SCALE = 8;
type Anim = { name: string; frames: Pose[] };
const ANIMS: Anim[] = [
  { name: "walking", frames: ["walk1", "walk2"] },
  { name: "working", frames: ["work1", "work2"] },
  { name: "thinking", frames: ["think1", "think2", "think3"] },
  { name: "needs you!", frames: ["alert1", "alert2"] },
  { name: "done!", frames: ["happy1", "happy2"] },
  { name: "oh no...", frames: ["sad", "idle"] },
  { name: "sleeping", frames: ["sleep1", "sleep2"] },
  { name: "waving", frames: ["wave1", "wave2"] },
];

/** Pre-renders every frame of every animation for a theme (setTheme clears the sprite cache). */
function frames(theme: string, scale: number): Map<string, HTMLCanvasElement[]> {
  setTheme(theme);
  const out = new Map<string, HTMLCanvasElement[]>();
  for (const a of ANIMS) out.set(a.name, a.frames.map((p) => renderPose(p, scale)));
  return out;
}

function player(canvas: HTMLCanvasElement, get: () => HTMLCanvasElement[], ms = 320) {
  let i = 0;
  const draw = () => {
    const list = get();
    const f = list[i++ % list.length];
    canvas.width = f.width;
    canvas.height = f.height;
    canvas.getContext("2d")!.drawImage(f, 0, 0);
  };
  draw();
  setInterval(draw, ms);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// Hero: Postie walking.
const heroFrames = frames("postie", 12);
const hero = document.getElementById("hero") as HTMLCanvasElement;
player(hero, () => heroFrames.get("walking")!, 280);

// Gallery: the four characters; click to cycle their state.
const CHARACTERS: Array<[string, string]> = [
  ["postie", "Postie"], ["rana", "Don Rana"], ["pato", "Don Pato"], ["hamster", "Don Hámster"],
];
const gallery = document.getElementById("gallery")!;
for (const [id, label] of CHARACTERS) {
  const set = frames(id, SCALE);
  let idx = 0;
  const card = el("div", "card");
  const canvas = el("canvas", "px");
  const state = el("div", "state", ANIMS[0].name);
  card.append(canvas, el("h3", undefined, label), state);
  card.addEventListener("click", () => {
    idx = (idx + 1) % ANIMS.length;
    state.textContent = ANIMS[idx].name;
  });
  gallery.append(card);
  player(canvas, () => set.get(ANIMS[idx].name)!);
}

