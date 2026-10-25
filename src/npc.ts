// Behaviour loop for the character. The weighted random choice, wandering and
// drag-and-fall follow the approach of just-simple-npc (MIT, see NOTICE); the
// reactions to Claude's state are our own.

import { api } from "./api";
import { advanceFall, type FallState } from "./physics";
import { PET_CELL_H, PET_CELL_W, type PetSheet } from "./petsprite";
import { renderPose, SPRITE_H, SPRITE_W, type Pose } from "./sprite";

export type Mood = "idle" | "thinking" | "working" | "juggling" | "waiting" | "done" | "error";

type Action = "walk" | "idle" | "look" | "sit" | "wave" | "sleep";

const CHOICES: Action[] = ["walk", "walk", "walk", "walk", "idle", "idle", "look", "sit", "wave", "sleep"];
const BODY_ROWS = 15; // sprite rows that belong to the body; the rows above are effects
const DRAG_THRESHOLD = 5;
const SPEED = 38;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export interface Bounds {
  x: number;
  top: number;
  w: number;
  h: number;
}

export class Npc {
  readonly el = document.createElement("div");
  w: number;
  h: number;
  mood: Mood = "idle";
  /** True while the user interacts with the menu: the NPC stays put and faces the pointer. */
  engaged = false;
  x: number;

  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private fall: FallState = { height: 0, velocity: 0 };
  private held = false;
  private facing: 1 | -1 = 1;
  private action: Action = "idle";
  private actionLeft = 1.5;
  private dest = 0;
  private pose: Pose = "idle";
  private drawn = "";
  private clock = 0;
  private blinkIn = rand(2.5, 5);
  private blinkLeft = 0;
  private landPause = 0;
  private lookAt: number | null = null;
  private mini = false;
  private pet: PetSheet | null = null;
  private reactLeft = 0;

  constructor(
    private readonly scale: number,
    private readonly onClick: () => void,
    private readonly onUndock: () => void = () => {},
  ) {
    this.w = SPRITE_W * scale;
    this.h = BODY_ROWS * scale;
    this.x = window.innerWidth * 0.6;
    this.el.className = "npc";
    this.el.dataset.hit = "";
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.canvas.width = SPRITE_W * scale;
    this.canvas.height = SPRITE_H * scale;
    this.canvas.style.top = `${-(SPRITE_H - BODY_ROWS) * scale}px`;
    this.ctx = this.canvas.getContext("2d")!;
    this.el.append(this.canvas);
    this.bindPointer();
    this.render();
  }

  bounds(): Bounds {
    return { x: this.x, top: window.innerHeight - this.h - this.fall.height, w: this.w, h: this.h };
  }

  /** Tells the character where the pointer is so it can turn towards it. */
  watch(pointerX: number | null) {
    this.lookAt = pointerX;
  }

  get flying(): boolean {
    return this.held || this.fall.height > 0;
  }

  private bindPointer() {
    let startX = 0;
    let startY = 0;
    let moved = false;
    let grabX = 0;
    let grabY = 0;
    let pressed = false;

    this.el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      pressed = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const b = this.bounds();
      grabX = event.clientX - b.x;
      grabY = event.clientY - b.top;
      this.el.setPointerCapture(event.pointerId);
      void api.setInteractive(true);
    });

    this.el.addEventListener("pointermove", (event) => {
      if (!pressed) return;
      if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      this.held = true;
      this.el.classList.add("held");
      this.x = Math.min(Math.max(0, event.clientX - grabX), window.innerWidth - this.w);
      const top = Math.min(Math.max(0, event.clientY - grabY), window.innerHeight - this.h);
      this.fall = { height: window.innerHeight - this.h - top, velocity: 0 };
    });

    const release = (event: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (this.el.hasPointerCapture(event.pointerId)) this.el.releasePointerCapture(event.pointerId);
      this.el.classList.remove("held");
      void api.setInteractive(false);
      if (this.held) {
        this.held = false;
        this.fall = { height: this.fall.height, velocity: 0 };
        if (this.mini && this.x < window.innerWidth - this.w * 1.5) this.setMini(false, true);
      } else if (!moved) {
        this.reactLeft = 0.7; // a little hop of joy when poked
        this.onClick();
      }
    };
    this.el.addEventListener("pointerup", release);
    this.el.addEventListener("pointercancel", release);
  }

  private pickAction() {
    this.action = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    switch (this.action) {
      case "walk": {
        const max = window.innerWidth - this.w;
        this.dest = rand(0, max);
        this.facing = this.dest >= this.x ? 1 : -1;
        this.actionLeft = rand(5, 14);
        break;
      }
      case "sleep": this.actionLeft = rand(7, 14); break;
      case "wave": this.actionLeft = rand(2, 3.5); break;
      default: this.actionLeft = rand(2.5, 7);
    }
  }

  update(dt: number) {
    this.clock += dt;
    this.reactLeft = Math.max(0, this.reactLeft - dt);

    if (this.held) {
      this.pose = "held";
    } else if (this.fall.height > 0) {
      this.fall = advanceFall(this.fall, dt);
      this.pose = "held";
      if (this.fall.height === 0) this.landPause = 0.7;
    } else if (this.landPause > 0) {
      this.landPause -= dt;
      this.pose = "blink";
    } else {
      if (this.mini) this.easeDock(dt);
      this.pose = this.reactionPose() ?? this.autonomousPose(dt);
    }
    this.render();
  }

  private frame(a: Pose, b: Pose, period = 0.28): Pose {
    return Math.floor(this.clock / period) % 2 === 0 ? a : b;
  }

  /** Poses driven by what Claude is doing; they override the idle wandering. */
  private reactionPose(): Pose | null {
    if (this.reactLeft > 0) return this.frame("happy1", "happy2", 0.2);
    switch (this.mood) {
      case "waiting": return this.frame("alert1", "alert2", 0.3);
      case "working": return this.frame("work1", "work2", 0.22);
      case "juggling": return this.frame("juggle1", "juggle2", 0.3);
      case "thinking": return "think";
      case "done": return this.frame("happy1", "happy2", 0.3);
      case "error": return "sad";
      default: return null;
    }
  }

  /** Docks the character at the right screen edge, peeking out; hovering or news brings it out. */
  setMini(on: boolean, fromUser = false) {
    if (on === this.mini) return;
    this.mini = on;
    this.facing = on ? -1 : this.facing;
    if (!on && fromUser) this.onUndock();
    this.drawn = "";
  }

  get isMini(): boolean {
    return this.mini;
  }

  /** Switches between the built-in pixel character and an imported Codex pet (null). */
  setPet(sheet: PetSheet | null) {
    this.pet = sheet;
    if (sheet) {
      const scale = 100 / PET_CELL_H;
      this.w = Math.round(PET_CELL_W * scale);
      this.h = Math.round(PET_CELL_H * scale);
      this.canvas.style.top = "0px";
    } else {
      this.w = SPRITE_W * this.scale;
      this.h = BODY_ROWS * this.scale;
      this.canvas.style.top = `${-(SPRITE_H - BODY_ROWS) * this.scale}px`;
    }
    const canvasH = sheet ? this.h : SPRITE_H * this.scale;
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.canvas.width = this.w;
    this.canvas.height = canvasH;
    this.x = Math.min(this.x, window.innerWidth - this.w);
    this.drawn = "";
  }

  /** Re-draws after a theme change. */
  redraw() {
    this.drawn = "";
  }

  private get peeking(): boolean {
    return this.engaged || this.mood !== "idle";
  }

  /** Slides towards the dock position: mostly hidden by the screen edge, or fully out. */
  private easeDock(dt: number) {
    const target = window.innerWidth - (this.peeking ? this.w : this.w * 0.42);
    this.x += (target - this.x) * Math.min(1, dt * 8);
    this.facing = -1;
  }

  private miniPose(dt: number): Pose {
    const out = this.peeking;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.15;
      this.blinkIn = rand(2.5, 5);
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      return "blink";
    }
    return out ? "wave1" : "idle";
  }

  private autonomousPose(dt: number): Pose {
    if (this.mini) return this.miniPose(dt);
    if (this.engaged) {
      if (this.lookAt !== null) this.facing = this.lookAt >= this.x + this.w / 2 ? 1 : -1;
      return "idle";
    }
    this.actionLeft -= dt;
    if (this.actionLeft <= 0) this.pickAction();

    if (this.action === "walk") {
      const step = SPEED * (this.scale / 4) * dt;
      const delta = this.dest - this.x;
      if (Math.abs(delta) <= step) {
        this.x = this.dest;
        this.actionLeft = 0;
      } else {
        this.x += Math.sign(delta) * step;
        this.facing = delta > 0 ? 1 : -1;
      }
      return this.frame("walk1", "walk2", 0.2);
    }
    if (this.action === "sit") return "sit";
    if (this.action === "sleep") return this.frame("sleep1", "sleep2", 0.9);
    if (this.action === "wave") return this.frame("wave1", "wave2", 0.25);
    if (this.action === "look") return "look";

    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.15;
      this.blinkIn = rand(2.5, 5);
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      return "blink";
    }
    return "idle";
  }

  /** Called when Claude's mood changes, so the character reacts right away. */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === "idle") {
      this.action = "idle";
      this.actionLeft = 1;
    }
  }

  /** Which way the pupils look (-1, 0, 1) in sprite space, towards the pointer when it is near. */
  private gaze(): number {
    const calm: Pose[] = ["idle", "blink", "look", "sit", "walk1", "walk2"];
    if (this.lookAt === null || !calm.includes(this.pose)) return 0;
    const dx = this.lookAt - (this.x + this.w / 2);
    if (Math.abs(dx) < 40 || Math.abs(dx) > 600) return 0;
    return Math.sign(dx) * this.facing; // the canvas is mirrored when facing left
  }

  private render() {
    const b = this.bounds();
    this.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.top)}px)`;
    if (this.pet) {
      // Pets animate by the clock, so they redraw every frame and are never mirrored.
      this.canvas.style.transform = "none";
      this.pet.draw(this.ctx, this.pose, this.facing, this.clock, this.canvas.width, this.canvas.height);
      return;
    }
    const gaze = this.gaze();
    const key = `${this.pose}|${this.facing}|${gaze}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.transform = `scaleX(${this.facing})`;
    this.ctx.drawImage(renderPose(this.pose, this.scale, gaze), 0, 0);
  }
}
