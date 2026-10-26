// Ported from just-simple-npc (MIT, (c) 2026 David Hurtado). See NOTICE.
// The fall was extended into a small 2D rigid-body step: thrown characters keep
// their momentum, bounce off the floor and walls, and report how hard they hit.

/** `x` is the left edge; `height` is measured upward from the floor; `vy` is upward in px/s. */
export interface Body { x: number; height: number; vx: number; vy: number }
export interface Arena { width: number; height: number }
export type Surface = "floor" | "wall" | "ceiling";
export interface Impact { surface: Surface; speed: number }

export const GRAVITY = 2300;
export const MAX_SPEED = 2200;
export const FLOOR_BOUNCE = 0.17;
export const WALL_BOUNCE = 0.28;
const FLOOR_FRICTION = 11; // 1/s while sliding on the floor
const AIR_DRAG = 0.15; // 1/s
const REST_SPEED = 170; // a bounce slower than this just settles
const SUBSTEP = 1 / 120;

const finite = (n: number) => (Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function substep(b: Body, dt: number, arena: Arena, impacts: Impact[]): Body {
  let { x, height, vx, vy } = b;
  const onFloor = height <= 0 && vy <= 0;
  if (!onFloor) vy -= GRAVITY * dt;
  vx *= Math.exp(-(onFloor ? FLOOR_FRICTION : AIR_DRAG) * dt);
  if (onFloor && Math.abs(vx) < 4) vx = 0;
  x += vx * dt;
  height += vy * dt;

  const maxX = Math.max(0, arena.width);
  if (x < 0 || x > maxX) {
    if (Math.abs(vx) > 1) impacts.push({ surface: "wall", speed: Math.abs(vx) });
    x = clamp(x, 0, maxX);
    vx = -vx * WALL_BOUNCE;
  }
  const maxH = Math.max(0, arena.height);
  if (height > maxH) {
    impacts.push({ surface: "ceiling", speed: Math.abs(vy) });
    height = maxH;
    vy = -Math.abs(vy) * WALL_BOUNCE;
  }
  if (height <= 0) {
    height = 0;
    if (vy < 0) {
      const speed = -vy;
      if (speed > REST_SPEED) {
        impacts.push({ surface: "floor", speed });
        vy = speed * FLOOR_BOUNCE;
      } else {
        vy = 0;
      }
    }
  }
  return { x, height, vx, vy };
}

/**
 * Advances `body` by `seconds`. `arena.width` / `arena.height` are the free travel
 * of the character's left edge and of its height above the floor.
 */
export function stepBody(body: Body, seconds: number, arena: Arena): { body: Body; impacts: Impact[] } {
  const total = clamp(finite(seconds), 0, 0.1);
  const impacts: Impact[] = [];
  let next: Body = {
    x: finite(body.x),
    height: Math.max(0, finite(body.height)),
    vx: clamp(finite(body.vx), -MAX_SPEED, MAX_SPEED),
    vy: clamp(finite(body.vy), -MAX_SPEED, MAX_SPEED),
  };
  for (let left = total; left > 1e-9; left -= SUBSTEP) {
    next = substep(next, Math.min(SUBSTEP, left), arena, impacts);
  }
  return { body: next, impacts };
}

export function isResting(b: Body): boolean {
  return b.height <= 0 && b.vy === 0 && b.vx === 0;
}

/** Estimates the pointer velocity (px/s) from recent `[time ms, x, y]` samples, for throwing. */
export function throwVelocity(samples: ReadonlyArray<readonly [number, number, number]>, now: number, windowMs = 90): { vx: number; vy: number } {
  const recent = samples.filter(([t]) => now - t <= windowMs);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const [t0, x0, y0] = recent[0];
  const [t1, x1, y1] = recent[recent.length - 1];
  const dt = (t1 - t0) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return {
    vx: clamp(((x1 - x0) / dt) * 0.85, -MAX_SPEED, MAX_SPEED),
    vy: clamp((-(y1 - y0) / dt) * 0.85, -MAX_SPEED, MAX_SPEED), // screen y grows downward
  };
}

/** How badly an impact hurts: 0 none, 1 a bump, 2 a hard knock. */
export function severity(speed: number): 0 | 1 | 2 {
  if (speed >= 1600) return 2;
  if (speed >= 950) return 1;
  return 0;
}
