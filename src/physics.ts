// Ported from just-simple-npc (MIT, (c) 2026 David Hurtado). See NOTICE.
export interface FallState { height: number; velocity: number }
export const GRAVITY = 1400;
export const MAX_FALL_SPEED = 650;
export const LANDING_SECONDS = 2;

/** Height is measured upward from the floor; velocity is downward in px/s. */
export function advanceFall(state: FallState, seconds: number): FallState {
  const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const height = Math.max(0, state.height), velocity = Math.min(MAX_FALL_SPEED, Math.max(0, state.velocity));
  const accelerating = Math.min(dt, (MAX_FALL_SPEED - velocity) / GRAVITY);
  const distance = velocity * accelerating + .5 * GRAVITY * accelerating * accelerating + MAX_FALL_SPEED * (dt - accelerating);
  const nextHeight = Math.max(0, height - distance);
  return { height: nextHeight, velocity: nextHeight > 0 ? Math.min(MAX_FALL_SPEED, velocity + GRAVITY * dt) : 0 };
}
