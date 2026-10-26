// Behaviour loop for the character. The weighted random choice, wandering and
// drag-and-fall follow the approach of just-simple-npc (MIT, see NOTICE); the
// reactions to Claude's state are our own.

import { api } from "./api";
import { isResting, severity, stepBody, throwVelocity, type Body } from "./physics";
import { PET_CELL_H, PET_CELL_W, type PetSheet } from "./petsprite";
import { phrase, type PhraseKind } from "./i18n";
import { activeCharacter, renderPose, SPRITE_H, SPRITE_W, type Pose } from "./sprite";

export type Mood = "idle" | "thinking" | "working" | "juggling" | "waiting" | "done" | "error";

type Action =
  | "walk" | "idle" | "look" | "sit" | "wave" | "sleep" | "hide" | "yawn"
  | "chase" | "scratch" | "sneeze" | "shake" | "fly" | "croak" | "nod" | "quip";
/** Hiding below the taskbar edge: "sleep" naps with only the top of the head showing, "peek" pops up now and then to look around. */
type HideMode = "sleep" | "peek";

/** Base weights of the random choice at the default activity (50). Restless actions grow with activity, sleepy ones shrink. */
const CHOICES: Array<[Action, number, "lively" | "calm" | "sleepy"]> = [
  ["walk", 4, "lively"], ["idle", 2, "calm"], ["look", 1, "calm"], ["sit", 1, "calm"], ["wave", 1, "lively"],
  ["sleep", 1, "sleepy"], ["hide", 2, "sleepy"], ["chase", 1, "lively"], ["scratch", 1, "lively"],
  ["sneeze", 1, "lively"], ["shake", 1, "lively"], ["fly", 1, "lively"], ["croak", 1, "lively"],
  ["quip", 2, "calm"],
];
const BODY_ROWS = 15; // sprite rows that belong to the body; the rows above are effects
const DRAG_THRESHOLD = 5;
const SPEED = 38;
const SPEED_SCALE = 4; // SPEED is tuned for a sprite scale of 4
// How far the body sinks below the floor, as a fraction of its height.
const SINK_SLEEP = 0.55;
const SINK_PEEK_LOW = 0.82;
const SINK_PEEK_HIGH = 0.5;
const LIE_ANGLE = 1.45; // radians: flat on the floor after a hard knock
const HURT_SECONDS = [0, 1.5, 2.8] as const;
const SQUASH_LIMIT = { min: -0.3, max: 0.45 };

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

  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private body: Body = { x: 0, height: 0, vx: 0, vy: 0 };
  /** Recent pointer positions `[ms, x, y]` while dragging, used to throw the character on release. */
  private samples: Array<[number, number, number]> = [];
  private hurtLeft = 0;
  private hurtLevel: 0 | 1 | 2 = 0;
  private lieDir: 1 | -1 = 1;
  /** Squash-and-stretch spring: positive squashes (wide and short), negative stretches. */
  private squash = 0;
  private squashVel = 0;
  private tilt = 0;
  private lie = 0;
  private canvasTransform = "";
  private hideMode: HideMode = "sleep";
  private hideAge = 0;
  /** 0 = standing, 1 = sunk by a full body height; eased towards `sinkGoal()`. */
  private sink = 0;
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
  /** Now and then the character decides to watch the pointer for a few seconds. */
  private followIn = rand(4, 9);
  private followLeft = 0;
  private afterYawn: Action | null = null;
  private ideaLeft = 0;
  private actionAge = 0;
  private said = false;
  /** Seconds left of being startled, or of covering the eyes after the pointer whizzed past. */
  private startleLeft = 0;
  private coverLeft = 0;
  private reactCooldown = 0;
  /** Set while the pointer is busy with something else near the character (its followers); no startling. */
  calm = false;
  private sayLeft = 0;
  private lastPointer: [number, number, number] | null = null;
  /** Back-and-forth passes of the pointer over the character: slow ones pet it, fast ones slap it. */
  private strokes: Array<{ t: number; peak: number }> = [];
  private passDir = 0;
  private passPeak = 0;
  private passTime = -1e9;
  private petLeft = 0;
  /** Distance the pointer has gently travelled over the character; enough of it counts as a stroke. */
  private petMeter = 0;
  private petMeterTime = -1e9;
  private slapLeft = 0;
  private slapSide = -1;
  private slapTimes: number[] = [];
  private angryLeft = 0;
  /** How hard Claude has been working lately (tool calls per few seconds); makes the typing faster. */
  private busy = 0;
  /** Seconds of nothing going on; after a while the character nods off. */
  private idleFor = 0;
  private mini = false;
  /** 0 (sleepy) to 1 (hyperactive); 0.5 is the original behaviour. */
  private activity = 0.5;
  private pet: PetSheet | null = null;
  private reactLeft = 0;

  constructor(
    private readonly scale: number,
    private readonly onClick: () => void,
    private readonly onUndock: () => void = () => {},
    private readonly onSay: (text: string) => void = () => {},
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

  get x(): number {
    return this.body.x;
  }

  set x(value: number) {
    this.body.x = value;
  }

  bounds(): Bounds {
    return { x: this.x, top: window.innerHeight - this.h - this.body.height + this.sink * this.h, w: this.w, h: this.h };
  }

  /** Tells the character where the pointer is so it can turn towards it. */
  watch(pointerX: number | null, pointerY: number | null = null) {
    this.lookAt = pointerX;
    if (pointerX === null || pointerY === null) return;
    const now = performance.now();
    const last = this.lastPointer;
    this.lastPointer = [now, pointerX, pointerY];
    if (!last) return;
    const seconds = (now - last[0]) / 1000;
    if (seconds < 0.005 || seconds > 0.3) return;
    const speed = Math.hypot(pointerX - last[1], pointerY - last[2]) / seconds;
    this.noteTouch(last, pointerX, pointerY, now, speed);
    this.reactToPointer(speed, pointerX, pointerY);
  }

  /** Does the pointer's last step go through the character? */
  private crosses(from: [number, number, number], x: number, y: number): boolean {
    const b = this.bounds();
    for (let i = 0; i <= 6; i++) {
      const px = from[1] + ((x - from[1]) * i) / 6;
      const py = from[2] + ((y - from[2]) * i) / 6;
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.top - 4 && py <= b.top + b.h + 4) return true;
    }
    return false;
  }

  /** Tracks the pointer sweeping back and forth over the character. */
  private noteTouch(from: [number, number, number], x: number, y: number, now: number, speed: number) {
    if (this.held || this.mini || !this.crosses(from, x, y)) return;
    if (speed >= 1400) {
      this.petMeter = 0;
    } else if (speed > 30) {
      // Slowly moving over it, in any direction, is a caress.
      if (now - this.petMeterTime > 800) this.petMeter = 0;
      this.petMeterTime = now;
      this.petMeter += Math.hypot(x - from[1], y - from[2]);
      if (this.petMeter >= 60) this.startPetting();
    }
    if (Math.abs(x - from[1]) < 3) return;
    const dir = Math.sign(x - from[1]);
    if (dir === this.passDir && now - this.passTime < 500) {
      this.passPeak = Math.max(this.passPeak, speed);
      this.passTime = now;
      return;
    }
    // The pointer turned around: the pass that just ended is one stroke.
    const finished = this.passDir !== 0 && now - this.passTime < 800;
    const peak = this.passPeak;
    const was = this.passDir;
    this.passDir = dir;
    this.passPeak = speed;
    this.passTime = now;
    if (!finished) {
      this.strokes = [];
      return;
    }
    this.strokes = this.strokes.filter((s) => now - s.t < 3000);
    this.strokes.push({ t: now, peak });
    if (peak >= 1400) this.slap(was, now);
  }

  private startPetting() {
    if (this.petLeft <= 0) this.say("pet", 0.7);
    this.petLeft = 1.4;
    this.wake();
  }

  private slap(dir: number, now: number) {
    if (this.slapLeft > 0.3 || this.hurtLeft > 0) return;
    this.slapLeft = 0.55;
    // The hand arrives from the side it came from; the mark is in sprite space, which is mirrored when facing left.
    this.slapSide = -dir * this.facing;
    this.tilt = dir * 0.45;
    this.squashVel += 4;
    this.petLeft = 0;
    this.wake();
    this.slapTimes = this.slapTimes.filter((t) => now - t < 8000);
    this.slapTimes.push(now);
    if (this.slapTimes.length >= 4) {
      this.slapTimes = [];
      this.angryLeft = 2.5;
      this.say("angry", 1, true);
    } else {
      this.say("slap", 0.8, true);
    }
  }

  /** Being touched wakes it up. */
  private wake() {
    if (this.action === "sleep" || this.action === "hide" || this.action === "nod") {
      this.action = "idle";
      this.actionLeft = 1.5;
    }
  }

  /** A pointer whizzing past close by startles the character or makes it cover its eyes. */
  private reactToPointer(speed: number, px: number, py: number) {
    if (speed < 2200 || this.reactCooldown > 0 || this.calm) return;
    if (this.held || this.mini || this.engaged || this.mood !== "idle" || this.hurtLeft > 0 || !isResting(this.body)) return;
    if (this.action === "sleep" || this.action === "hide" || this.startleLeft > 0 || this.coverLeft > 0) return;
    if (performance.now() - this.passTime < 1000) return; // someone is already playing with it
    const b = this.bounds();
    if (Math.hypot(px - (b.x + b.w / 2), py - (b.top + b.h / 2)) > 190) return;
    this.reactCooldown = 12;
    if (this.pet || Math.random() < 0.5) {
      this.startleLeft = 0.8;
      this.body.vx = (b.x + b.w / 2 >= px ? 1 : -1) * 240;
      this.body.vy = 480;
      this.say("startle", 1, true);
    } else {
      this.coverLeft = 1.8;
      this.say("cover", 0.8, true);
    }
  }

  /** Claude just used a tool: the harder it works, the faster the typing. */
  pulse() {
    this.busy = Math.min(8, this.busy + 1);
  }

  /** Says a random line for the situation. Chatter is rationed unless `force`d, so it never turns into spam. */
  private say(kind: PhraseKind, chance = 1, force = false) {
    if (Math.random() > chance || (!force && this.sayLeft > 0)) return;
    this.sayLeft = 2;
    this.onSay(phrase(kind));
  }

  get flying(): boolean {
    return this.held || !isResting(this.body);
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
      if (!moved) this.samples = [];
      moved = true;
      this.held = true;
      this.el.classList.add("held");
      this.x = Math.min(Math.max(0, event.clientX - grabX), window.innerWidth - this.w);
      const top = Math.min(Math.max(0, event.clientY - grabY), window.innerHeight - this.h);
      this.body = { x: this.x, height: window.innerHeight - this.h - top, vx: 0, vy: 0 };
      this.samples.push([performance.now(), event.clientX, event.clientY]);
      if (this.samples.length > 12) this.samples.shift();
    });

    const release = (event: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (this.el.hasPointerCapture(event.pointerId)) this.el.releasePointerCapture(event.pointerId);
      this.el.classList.remove("held");
      void api.setInteractive(false);
      if (this.held) {
        this.held = false;
        this.action = "idle"; // a thrown character forgets what it was doing
        this.actionLeft = 1.5;
        const { vx, vy } = throwVelocity(this.samples, performance.now());
        this.body = { ...this.body, vx, vy };
        this.samples = [];
        if (Math.hypot(vx, vy) > 900) this.say("thrown", 0.8, true);
        if (this.mini && this.x < window.innerWidth - this.w * 1.5) this.setMini(false, true);
      } else if (!moved) {
        this.reactLeft = 0.7; // a little hop of joy when poked
        if (!this.mini && isResting(this.body) && this.hurtLeft <= 0) this.body.vy = 560;
        this.onClick();
      }
    };
    this.el.addEventListener("pointerup", release);
    this.el.addEventListener("pointercancel", release);
  }

  private pickAction() {
    const previous = this.action;
    let next: Action;
    if (previous === "nod") {
      // Jolts awake after dozing off at the desk.
      this.startleLeft = 0.9;
      this.say("wake", 1, true);
      next = "idle";
    } else if (this.afterYawn) {
      next = this.afterYawn;
      this.afterYawn = null;
    } else {
      next = this.choose();
      // Yawn and stretch before dozing off, and again when waking up.
      if (next === "sleep") {
        this.afterYawn = "sleep";
        next = "yawn";
      }
    }
    if (previous === "sleep" && next !== "yawn") {
      next = "yawn";
      this.afterYawn = null;
    }
    this.action = next;
    this.actionAge = 0;
    this.said = false;
    if (next === "yawn") this.say(this.afterYawn === "sleep" ? "yawn" : "stretch", 0.7);
    else if (next === "scratch") this.say("scratch", 0.5);
    else if (next === "chase") this.say("chase", 0.6);
    else if (next === "quip") this.say(this.quipKind(), 1, true);
    const rest = 0.4 + 0.6 * 2 * (1 - this.activity); // 1.6x longer pauses when calm, 0.4x when hyper
    switch (this.action) {
      case "yawn": this.actionLeft = rand(2.2, 3); break;
      case "chase": this.actionLeft = rand(5, 9); break;
      case "scratch": this.actionLeft = rand(2, 3); break;
      case "sneeze": this.actionLeft = 1.9; break;
      case "shake": this.actionLeft = 1; break;
      case "fly": this.actionLeft = 3.8; break;
      case "croak": this.actionLeft = 1.8; break;
      case "nod": this.actionLeft = rand(4, 6); break;
      case "quip": this.actionLeft = 4; break;
      case "walk": {
        const max = window.innerWidth - this.w;
        this.dest = rand(0, max);
        this.facing = this.dest >= this.x ? 1 : -1;
        this.actionLeft = rand(5, 14);
        break;
      }
      case "sleep": this.actionLeft = rand(7, 14) * rest; break;
      case "hide":
        this.hideMode = Math.random() < 0.5 ? "sleep" : "peek";
        this.hideAge = 0;
        this.actionLeft = (this.hideMode === "sleep" ? rand(10, 20) : rand(8, 14)) * rest;
        break;
      case "wave": this.actionLeft = rand(2, 3.5); break;
      default: this.actionLeft = rand(2.5, 7) * rest;
    }
  }

  /** 0 = sleepy, 100 = hyperactive: changes what it picks to do, how long it rests and how fast it walks. */
  setActivity(percent: number) {
    this.activity = Math.min(1, Math.max(0, (Number.isFinite(percent) ? percent : 50) / 100));
  }

  private choose(): Action {
    // The nap at the desk comes sooner when calm and almost never when hyper.
    if (this.idleFor > 20 + 80 * this.activity && Math.random() < 0.5) {
      this.idleFor = 0;
      return "nod";
    }
    const lively = Math.max(0.1, 2 * this.activity);
    const calm = Math.max(0.15, 2 * (1 - this.activity));
    const sleepy = Math.max(0.05, calm * calm);
    const factor = { lively, calm, sleepy };
    const weights = CHOICES.map(([action, weight, kind]) => (this.allowed(action) ? weight * factor[kind] : 0));
    let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < CHOICES.length; i++) {
      pick -= weights[i];
      if (pick < 0) return CHOICES[i][0];
    }
    return "idle";
  }

  /** Office jokes for everyone, now and then ones about being a sticky note or an animal in a suit. */
  private quipKind(): PhraseKind {
    if (!this.pet && Math.random() < 0.4) {
      const id = activeCharacter().id;
      return id === "frog" ? "quipFrog" : id === "duck" ? "quipDuck" : id === "hamster" ? "quipHamster" : "quipPostie";
    }
    return "quip";
  }

  private allowed(action: Action): boolean {
    switch (action) {
      case "chase": return this.lookAt !== null;
      case "fly": return !this.pet;
      case "croak": return !this.pet && activeCharacter().sound !== null;
      default: return true;
    }
  }

  update(dt: number) {
    this.clock += dt;
    this.reactLeft = Math.max(0, this.reactLeft - dt);
    this.ideaLeft = Math.max(0, this.ideaLeft - dt);
    const wasHurt = this.hurtLeft > 0;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.startleLeft = Math.max(0, this.startleLeft - dt);
    this.sayLeft = Math.max(0, this.sayLeft - dt);
    this.petLeft = Math.max(0, this.petLeft - dt);
    this.slapLeft = Math.max(0, this.slapLeft - dt);
    this.angryLeft = Math.max(0, this.angryLeft - dt);
    this.coverLeft = Math.max(0, this.coverLeft - dt);
    this.reactCooldown = Math.max(0, this.reactCooldown - dt);
    this.busy = Math.max(0, this.busy - dt * 0.8);
    this.idleFor = this.mood === "idle" && !this.engaged && !this.held ? this.idleFor + dt : 0;
    if (wasHurt && this.hurtLeft === 0 && !this.held) {
      // Shake it off.
      this.say("shake", 0.8);
      this.action = "shake";
      this.actionAge = 0;
      this.actionLeft = 1;
    }
    this.updateFollow(dt);
    if (this.hurtLeft === 0) this.hurtLevel = 0;

    if (this.held) {
      this.pose = "held";
    } else if (!isResting(this.body)) {
      this.simulate(dt);
      this.pose = this.hurtLeft > 0 ? this.frame("hurt1", "hurt2", 0.22) : "held";
    } else if (this.hurtLeft > 0) {
      this.pose = this.frame("hurt1", "hurt2", 0.35);
    } else if (this.landPause > 0) {
      this.landPause -= dt;
      this.pose = "blink";
    } else {
      if (this.mini) this.easeDock(dt);
      this.pose = this.reactionPose() ?? this.autonomousPose(dt);
    }
    this.animateBody(dt);
    this.easeSink(dt);
    this.render();
  }

  /** Moves the free-flying body and reacts to what it hits. */
  private simulate(dt: number) {
    const arena = { width: window.innerWidth - this.w, height: window.innerHeight - this.h };
    const result = stepBody(this.body, dt, arena);
    this.body = result.body;
    if (this.body.vx !== 0) this.lieDir = this.body.vx > 0 ? 1 : -1;
    for (const impact of result.impacts) {
      this.squashVel += Math.min(impact.speed, 1500) / 300;
      const level = severity(impact.speed);
      if (level > this.hurtLevel) {
        this.hurtLevel = level as 1 | 2;
        this.hurtLeft = Math.max(this.hurtLeft, HURT_SECONDS[level]);
        this.say(level === 2 ? "bigbump" : "bump", 1, true);
      }
    }
    if (isResting(this.body)) this.landPause = this.hurtLeft > 0 ? 0 : 0.5;
  }

  private updateFollow(dt: number) {
    this.followLeft = Math.max(0, this.followLeft - dt);
    this.followIn -= dt;
    if (this.followIn > 0) return;
    this.followIn = rand(8, 20);
    if (this.lookAt !== null && this.action !== "sleep" && this.action !== "hide") this.followLeft = rand(3, 6);
  }

  /** Where the body wants to be vertically: sunk while hiding, standing otherwise. */
  private sinkGoal(): number {
    if (this.held || this.mini || this.engaged || this.mood !== "idle" || !isResting(this.body) || this.hurtLeft > 0) return 0;
    if (this.action !== "hide" || this.landPause > 0) return 0;
    if (this.hideMode === "sleep") return SINK_SLEEP;
    const phase = this.hideAge % 5.5;
    return phase > 1.8 && phase < 4 ? SINK_PEEK_HIGH : SINK_PEEK_LOW;
  }

  private easeSink(dt: number) {
    const goal = this.sinkGoal();
    // Sinking is lazy, popping back up is quick, like being startled.
    const rate = goal > this.sink ? 2.5 : 9;
    this.sink += (goal - this.sink) * Math.min(1, dt * rate);
    if (Math.abs(goal - this.sink) < 0.002) this.sink = goal;
  }

  private hiddenPose(dt: number): Pose {
    this.hideAge += dt;
    if (this.hideMode === "sleep") return this.frame("sleep1", "sleep2", 0.9);
    const phase = this.hideAge % 5.5;
    if (phase > 1.8 && phase < 4) return Math.floor(phase * 1.4) % 2 === 0 ? "look" : "idle";
    return phase > 4.6 ? "blink" : "idle";
  }

  /** Springs and tilt that make the body feel soft: squash on impact, stretch in flight, lean when swung. */
  private animateBody(dt: number) {
    this.squashVel += (-220 * this.squash - 14 * this.squashVel) * dt;
    this.squash = Math.min(SQUASH_LIMIT.max, Math.max(SQUASH_LIMIT.min, this.squash + this.squashVel * dt));

    let tiltTarget = 0;
    if (this.held) tiltTarget = Math.max(-0.5, Math.min(0.5, throwVelocity(this.samples, performance.now(), 120).vx * 0.0006));
    else if (!isResting(this.body)) tiltTarget = Math.max(-0.8, Math.min(0.8, this.body.vx * 0.0012));
    else if (this.petLeft > 0 && this.lookAt !== null) {
      // Leans into the hand, purring.
      const toward = Math.max(-1, Math.min(1, (this.lookAt - (this.x + this.w / 2)) / 250));
      tiltTarget = toward * 0.12 + Math.sin(this.clock * 7) * 0.04;
    } else if (this.pose.startsWith("dance")) tiltTarget = Math.sin(this.clock * 14) * 0.16;
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, dt * 10);

    const lying = !this.held && this.hurtLevel === 2 && this.body.height === 0 ? 1 : 0;
    this.lie += (lying - this.lie) * Math.min(1, dt * 12);
  }

  private frame(a: Pose, b: Pose, period = 0.28): Pose {
    return Math.floor(this.clock / period) % 2 === 0 ? a : b;
  }

  /** Poses driven by what Claude is doing; they override the idle wandering. */
  private reactionPose(): Pose | null {
    if (this.angryLeft > 0) return this.frame("angry1", "angry2", 0.25);
    if (this.slapLeft > 0) return this.slapSide < 0 ? "slap1" : "slap2";
    if (this.petLeft > 0) return this.frame("pet1", "pet2", 0.4);
    if (this.startleLeft > 0) return this.frame("alert1", "alert2", 0.15);
    if (this.coverLeft > 0) return this.frame("cover1", "cover2", 0.5);
    if (this.reactLeft > 0) return this.frame("happy1", "happy2", 0.2);
    if (this.ideaLeft > 0) return this.frame("idea1", "idea2", 0.18);
    switch (this.mood) {
      case "waiting": return this.frame("alert1", "alert2", 0.3);
      case "working":
        // Busy bursts of tool calls type faster and make it stick its tongue out.
        if (this.busy >= 3) return this.frame("work3", "work4", 0.12);
        return this.frame("work1", "work2", this.busy >= 1.5 ? 0.15 : 0.22);
      case "juggling": return this.frame("juggle1", "juggle2", 0.3);
      case "thinking": return (["think1", "think2", "think3"] as const)[Math.floor(this.clock / 0.55) % 3];
      case "done": return (["dance1", "dance2", "dance3", "dance2"] as const)[Math.floor(this.clock / 0.2) % 4];
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

  /** Napping, in the open or sunk below the taskbar (followers copy this). */
  get asleep(): boolean {
    return this.action === "sleep" || (this.action === "hide" && this.hideMode === "sleep" && this.sink > 0.2);
  }

  get sinkAmount(): number {
    return this.sink;
  }

  get lieAmount(): number {
    return this.lie;
  }

  get lieDirection(): 1 | -1 {
    return this.lieDir;
  }

  /** Which way it faces: 1 right, -1 left. */
  get direction(): 1 | -1 {
    return this.facing;
  }

  get isMini(): boolean {
    return this.mini;
  }

  /** Switches between the built-in pixel character and an imported Codex pet (null). */
  setPet(sheet: PetSheet | null) {
    this.pet = sheet;
    if (sheet) {
      const scale = 76 / PET_CELL_H;
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
    this.actionAge += dt;
    // While following the pointer, turn to face it unless busy walking.
    if (this.followLeft > 0 && this.lookAt !== null && this.action !== "walk" && this.action !== "sleep" && this.action !== "hide") {
      this.facing = this.lookAt >= this.x + this.w / 2 ? 1 : -1;
    }

    if (this.action === "walk") {
      const step = SPEED * (0.6 + 0.8 * this.activity) * (this.scale / SPEED_SCALE) * dt;
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
    if (this.action === "chase") return this.chasePose(dt);
    if (this.action === "scratch") return this.frame("scratch1", "scratch2", 0.18);
    if (this.action === "shake") return "shake";
    if (this.action === "nod") return this.frame("nod1", "nod2", 0.9);
    if (this.action === "sneeze") {
      if (this.actionAge < 0.9) return "sneeze1";
      if (!this.said) {
        this.said = true;
        this.squashVel += 6;
        this.say("sneeze", 1, true);
      }
      return "sneeze2";
    }
    if (this.action === "croak") {
      if (!this.said) {
        this.said = true;
        this.squashVel += 5;
        this.say("croak", 1, true);
      }
      return this.frame("croak1", "croak2", 0.25);
    }
    if (this.action === "fly") {
      // A fly buzzes around, then the tongue shoots out and catches it.
      if (this.actionAge < 2.4) return (["fly1", "fly2", "fly3"] as const)[Math.floor(this.actionAge / 0.8) % 3];
      if (this.actionAge < 2.9) return "tongue";
      if (!this.said) {
        this.said = true;
        this.say("munch", 1, true);
      }
      return "gulp";
    }
    if (this.action === "sit") return "sit";
    if (this.action === "yawn") return this.frame("yawn1", "yawn2", 0.55);
    if (this.action === "sleep") return this.frame("sleep1", "sleep2", 0.9);
    if (this.action === "hide") return this.hiddenPose(dt);
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

  /** Trots after the pointer, then stops next to it. */
  private chasePose(dt: number): Pose {
    if (this.lookAt === null) {
      this.actionLeft = 0;
      return "idle";
    }
    this.followLeft = Math.max(this.followLeft, 0.3);
    const delta = this.lookAt - this.w / 2 - this.x;
    this.facing = delta >= 0 ? 1 : -1;
    if (Math.abs(delta) < 50) {
      this.actionLeft = Math.min(this.actionLeft, 1.5);
      return "look";
    }
    const step = Math.min(SPEED * 1.7 * (this.scale / SPEED_SCALE) * dt, Math.abs(delta));
    this.x = Math.min(Math.max(0, this.x + Math.sign(delta) * step), window.innerWidth - this.w);
    return this.frame("walk1", "walk2", 0.13);
  }

  /** Called when Claude's mood changes, so the character reacts right away. */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    // The "aha" moment: thinking turns into doing.
    if (this.mood === "thinking" && (mood === "working" || mood === "juggling")) this.ideaLeft = 1;
      this.say("idea", 0.6);
    this.mood = mood;
    if (mood === "idle") {
      this.action = "idle";
      this.actionLeft = 1;
    }
  }

  /** Which way the pupils look (-1, 0, 1) in sprite space, towards the pointer when it is near. */
  private gaze(): number {
    const calm: Pose[] = ["idle", "blink", "look", "sit", "walk1", "walk2"];
    if (this.lookAt === null || !calm.includes(this.pose) || (this.followLeft <= 0 && !this.engaged)) return 0;
    const dx = this.lookAt - (this.x + this.w / 2);
    if (Math.abs(dx) < 40) return 0;
    return Math.sign(dx) * this.facing; // the canvas is mirrored when facing left
  }

  private render() {
    const b = this.bounds();
    this.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.top)}px)`;
    this.applyBodyTransform();
    if (this.pet) {
      // Pets animate by the clock, so they redraw every frame and are never mirrored.
      this.pet.draw(this.ctx, this.pose, this.facing, this.clock, this.canvas.width, this.canvas.height);
      return;
    }
    const gaze = this.gaze();
    const key = `${this.pose}|${gaze}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(renderPose(this.pose, this.scale, gaze), 0, 0);
  }

  private applyBodyTransform() {
    const flying = !this.held && !isResting(this.body);
    const stretch = flying ? Math.min(0.18, Math.abs(this.body.vy) / 6000) : 0;
    const sy = 1 - this.squash + stretch;
    const sx = 1 + 0.6 * (this.squash - stretch);
    const angle = this.tilt + this.lie * LIE_ANGLE * this.lieDir;
    const lift = this.lie * this.w * 0.5;
    const mirror = this.pet ? 1 : this.facing;
    const shakeX = this.pose === "shake" ? Math.sin(this.clock * 70) * this.w * 0.04 : 0;
    const transform = `translate(${shakeX.toFixed(1)}px, ${(-lift).toFixed(1)}px) rotate(${angle.toFixed(3)}rad) scale(${(sx * mirror).toFixed(3)}, ${sy.toFixed(3)})`;
    if (transform === this.canvasTransform) return;
    this.canvasTransform = transform;
    this.canvas.style.transformOrigin = this.held ? "50% 30%" : "50% 100%";
    this.canvas.style.transform = transform;
  }
}
