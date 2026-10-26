// Small copies of the character ("children") that trail the main one, one for each Claude
// Code session the user spawned one for. Each repeats what its session is doing, wears its
// own colour and hat, and opens that session when clicked.

import type { Session } from "./api";
import type { ChildLook, Children } from "./children";
import type { Bounds } from "./npc";
import { PET_CELL_H, PET_CELL_W, type PetSheet } from "./petsprite";
import { renderPose, SPRITE_H, SPRITE_W, type Pose } from "./sprite";

const MAX_VISIBLE = 5;
const GAP = 4; // px between neighbours in the line
const FOLLOW_RATE = 3.2; // 1/s; lower trails further behind
const BODY_ROWS = 15;
const PET_HEIGHT = 28;
/** Followers are drawn smaller than their sprite scale suggests, to stay out of the way. */
const SHRINK = 0.7;
const LIE_ANGLE = 1.45; // radians, same as the leader lying down

/** What the leader looks like to its followers. */
export interface Leader {
  x: number;
  w: number;
  /** 1 when facing right, -1 when facing left. */
  direction: 1 | -1;
  hidden: boolean;
  /** Napping: followers doze off a moment after it, one by one. */
  sleeping: boolean;
  /** How far it has sunk below the taskbar edge (0..1 of its height); followers copy it. */
  sink: number;
  /** 0..1, how much it lies on its side after a knock, and towards which side. */
  lie: number;
  lieDir: 1 | -1;
}

const label = (s: Session) => s.topic || (s.cwd ?? "").split(/[\\/]/).filter(Boolean).pop() || "";

class Follower {
  readonly el = document.createElement("div");
  private readonly canvas = document.createElement("canvas");
  private readonly tag = document.createElement("div");
  private readonly ctx = this.canvas.getContext("2d")!;
  /** NaN until the first update, which places it at the leader. */
  x = Number.NaN;
  facing: 1 | -1 = 1;
  session: Session;
  look: ChildLook;
  private w = 0;
  private h = 0;
  private drawn = "";
  private leaving = false;
  private sink = 0;
  private lie = 0;
  private asleepFor = 0;
  private canvasTransform = "";
  private readonly phase = Math.random() * 4;

  constructor(session: Session, look: ChildLook, private readonly scale: number, private pet: PetSheet | null, onPick: (s: Session) => void) {
    this.session = session;
    this.look = look;
    this.el.className = "follower pop";
    this.el.dataset.hit = "";
    this.tag.className = "follower-tag";
    this.el.append(this.canvas, this.tag);
    this.canvas.style.transformOrigin = "50% 100%";
    this.el.addEventListener("click", () => onPick(this.session));
    this.resize();
    this.setSession(session, look);
  }

  setSession(session: Session, look: ChildLook) {
    this.session = session;
    this.tag.textContent = label(session);
    if (look.hue !== this.look.hue || look.hat !== this.look.hat) this.drawn = "";
    this.look = look;
    this.applyFilter();
  }

  /** Imported pets are spritesheets, so their colour is shifted with a CSS filter instead of a palette. */
  private applyFilter() {
    this.canvas.style.filter = this.pet && this.look.hue ? `hue-rotate(${this.look.hue}deg)` : "";
  }

  setPet(pet: PetSheet | null) {
    this.pet = pet;
    this.resize();
  }

  /** The canvas keeps its full resolution; CSS shrinks it (pixelated, so it stays crisp enough). */
  private resize() {
    let cw: number;
    let ch: number;
    if (this.pet) {
      ch = PET_HEIGHT;
      cw = Math.round((PET_CELL_W * PET_HEIGHT) / PET_CELL_H);
      this.w = cw;
      this.h = ch;
      this.canvas.style.top = "0px";
    } else {
      cw = SPRITE_W * this.scale;
      ch = SPRITE_H * this.scale;
      this.w = Math.round(cw * SHRINK);
      this.h = Math.round(BODY_ROWS * this.scale * SHRINK);
      this.canvas.style.top = `${-Math.round((SPRITE_H - BODY_ROWS) * this.scale * SHRINK)}px`;
    }
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.canvas.style.width = this.pet ? `${cw}px` : `${Math.round(cw * SHRINK)}px`;
    this.canvas.style.height = this.pet ? `${ch}px` : `${Math.round(ch * SHRINK)}px`;
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.drawn = "";
    this.canvasTransform = "";
    this.applyFilter();
  }

  get width(): number {
    return this.w;
  }

  /** Is the point within `margin` px of this follower? (Not while it is leaving.) */
  near(px: number, py: number, margin: number, floor: number): boolean {
    if (this.leaving || Number.isNaN(this.x)) return false;
    const top = floor - this.h + this.sink * this.h;
    return px >= this.x - margin && px <= this.x + this.w + margin && py >= top - margin && py <= top + this.h + margin;
  }

  redraw() {
    this.drawn = "";
  }

  bounds(floor: number): Bounds {
    return { x: this.x, top: floor - this.h + this.sink * this.h, w: this.w, h: this.h };
  }

  /** Plays the exit animation and tells when it is over. */
  leave(done: () => void) {
    if (this.leaving) return;
    this.leaving = true;
    this.el.classList.remove("pop");
    this.el.classList.add("unpop");
    window.setTimeout(done, 260);
  }

  get isLeaving(): boolean {
    return this.leaving;
  }

  /** Calm on purpose: slow frames, and mostly just standing there blinking. */
  private statePose(clock: number): Pose {
    const frame = (a: Pose, b: Pose, period: number): Pose => (Math.floor(clock / period) % 2 === 0 ? a : b);
    const s = this.session;
    switch (s.state) {
      case "working": return s.subagents > 0 ? frame("juggle1", "juggle2", 0.9) : frame("work1", "work2", 0.6);
      case "thinking": return (["think1", "think2", "think3"] as const)[Math.floor(clock / 1.2) % 3];
      case "waiting":
      case "attention": return frame("alert1", "alert2", 0.7);
      case "error": return "sad";
      default: return (clock + this.phase) % 4.5 < 0.15 ? "blink" : "idle";
    }
  }

  /**
   * Eases towards `targetX` on the floor. It walks while catching up, copies the leader when that
   * is napping, hiding or lying down, and otherwise shows what its session is doing.
   */
  update(dt: number, clock: number, targetX: number, leader: Leader, floor: number, index: number) {
    const delta = targetX - this.x;
    this.x += delta * Math.min(1, dt * FOLLOW_RATE);
    const moving = Math.abs(delta) > 6;
    if (moving) this.facing = delta > 0 ? 1 : -1;
    else this.facing = leader.direction;

    this.asleepFor = leader.sleeping ? this.asleepFor + dt : 0;
    const asleep = this.asleepFor > 0.8 + index * 0.6;
    this.sink += (leader.sink - this.sink) * Math.min(1, dt * 2.5);
    this.lie += ((leader.lie > 0.5 ? 1 : 0) - this.lie) * Math.min(1, dt * 10);

    let pose: Pose;
    if (this.lie > 0.5) pose = "hurt1";
    else if (asleep) pose = Math.floor(clock / 1.4) % 2 === 0 ? "sleep1" : "sleep2";
    else if (moving) pose = Math.floor(clock / 0.28) % 2 === 0 ? "walk1" : "walk2";
    else pose = this.statePose(clock);

    this.el.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(floor - this.h + this.sink * this.h)}px)`;
    const mirror = this.pet ? 1 : this.facing;
    const transform = `translateY(${(-this.lie * this.w * 0.5).toFixed(1)}px) rotate(${(this.lie * LIE_ANGLE * leader.lieDir).toFixed(3)}rad) scaleX(${mirror})`;
    if (transform !== this.canvasTransform) {
      this.canvasTransform = transform;
      this.canvas.style.transform = transform;
    }
    if (this.pet) {
      this.pet.draw(this.ctx, pose, this.facing, clock, this.canvas.width, this.canvas.height);
      return;
    }
    const key = `${pose}|${this.facing}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(renderPose(pose, this.scale, 0, this.look), 0, 0);
  }
}

/** Keeps one follower per active session, in the order they appeared. */
export class Followers {
  readonly el = document.createElement("div");
  private readonly all = new Map<string, Follower>();
  private readonly more = document.createElement("div");
  private clock = 0;
  /** Which side of the leader the line trails on (-1 left). It only changes when the leader really walks the other way. */
  private side: 1 | -1 | 0 = 0;
  private lastLeaderX = Number.NaN;
  private run = 0;
  private runDir = 0;
  private pointerNearNow = false;
  private pet: PetSheet | null = null;

  constructor(private readonly scale: number, private readonly onPick: (s: Session) => void) {
    this.el.id = "followers";
    this.more.className = "follower-more";
    this.more.style.display = "none";
    this.el.append(this.more);
  }

  setPet(pet: PetSheet | null) {
    this.pet = pet;
    for (const f of this.all.values()) f.setPet(pet);
  }

  /** Tells where the pointer is: with it close by, the line stays put so it can be clicked. */
  watch(x: number, y: number) {
    this.pointerNearNow = [...this.all.values()].some((f) => f.near(x, y, 28, window.innerHeight));
  }

  get pointerNear(): boolean {
    return this.pointerNearNow;
  }

  redraw() {
    for (const f of this.all.values()) f.redraw();
  }

  /** Where the child of a session stands, or null when that session has no visible child. */
  boundsOf(sessionId: string): Bounds | null {
    const f = this.all.get(sessionId);
    if (!f || f.isLeaving || Number.isNaN(f.x)) return null;
    return f.bounds(window.innerHeight);
  }

  /** Adds, updates and removes followers to match the children the user has spawned for live sessions. */
  sync(sessions: Session[], children: Children) {
    const mine = sessions
      .filter((x) => children.has(x.id))
      .sort((a, b) => children.get(a.id)!.created - children.get(b.id)!.created);
    const shown = mine.slice(0, MAX_VISIBLE);
    const keep = new Set(shown.map((x) => x.id));

    for (const [id, follower] of this.all) {
      if (keep.has(id)) continue;
      this.all.delete(id);
      follower.leave(() => follower.el.remove());
    }
    for (const x of shown) {
      const look = children.get(x.id)!;
      const existing = this.all.get(x.id);
      if (existing) {
        existing.setSession(x, look);
        continue;
      }
      const follower = new Follower(x, look, this.scale, this.pet, this.onPick);
      this.all.set(x.id, follower);
      this.el.append(follower.el);
    }
    const extra = mine.length - shown.length;
    this.more.textContent = extra > 0 ? `+${extra}` : "";
    this.more.style.display = extra > 0 ? "block" : "none";
  }

  update(dt: number, leader: Leader) {
    this.clock += dt;
    this.el.style.display = leader.hidden ? "none" : "";
    if (leader.hidden) return;
    const followers = [...this.all.values()].sort((a, b) => a.look.created - b.look.created);
    const floor = window.innerHeight;
    // The line stays on one side and only switches after the leader has walked a good way the other
    // way. Turning round to look at the pointer must not send everyone running across it.
    const dx = leader.x - this.lastLeaderX;
    this.lastLeaderX = leader.x;
    if (this.side === 0) this.side = leader.direction === 1 ? -1 : 1;
    if (Math.abs(dx) > 0.05) {
      const dir = Math.sign(dx);
      this.run = dir === this.runDir ? this.run + Math.abs(dx) : Math.abs(dx);
      this.runDir = dir;
      if (this.run > 60) this.side = dir === 1 ? -1 : 1;
    }
    let behind: 1 | -1 = this.side;
    const total = followers.reduce((sum, f) => sum + f.width + GAP, 0);
    if (behind === -1 && leader.x - total < 0) behind = 1;
    if (behind === 1 && leader.x + leader.w + total > window.innerWidth) behind = -1;

    let offset = 0;
    let index = 0;
    let last = leader.x;
    for (const f of followers) {
      const targetX = behind === -1 ? leader.x - GAP - offset - f.width : leader.x + leader.w + GAP + offset;
      if (Number.isNaN(f.x)) f.x = leader.x + leader.w / 2 - f.width / 2;
      // With the pointer next to them they hold still, so a click never lands on a moving target.
      const goal = this.pointerNearNow ? f.x : Math.min(Math.max(0, targetX), window.innerWidth - f.width);
      f.update(dt, this.clock, goal, leader, floor, index++);
      offset += f.width + GAP;
      last = f.x;
    }
    if (this.more.style.display !== "none") {
      const x = behind === -1 ? last - 28 : last + (followers[followers.length - 1]?.width ?? 0) + 4;
      this.more.style.transform = `translate(${Math.round(Math.min(Math.max(0, x), window.innerWidth - 28))}px, ${floor - 22}px)`;
    }
  }
}
