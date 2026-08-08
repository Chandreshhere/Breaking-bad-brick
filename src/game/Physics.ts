import type { BrickState } from './Bricks';

/**
 * Deterministic arcade ball physics on the X/Z plane. No rigid bodies, no
 * gravity — reflections tuned for control, stepped at a fixed 1/120 s so
 * behaviour is identical across devices and frame rates.
 */

export interface BallBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
}

export interface PhysicsEnv {
  radius: number;
  minX: number; // left wall bound for the ball centre
  maxX: number;
  minZ: number; // rear wall bound for the ball centre
  lossZ: number;
  paddle: {
    x: number;
    z: number;
    halfW: number;
    halfD: number;
    vx: number;
    vz: number;
  };
  maxSpeed: number;
  bricks: BrickState[];
  maxBounceAngle: number; // radians
  minForwardRatio: number;
  pierceBricks: boolean; // heavy ball smashes through instead of bouncing
  shieldZ: number | null; // defensive-wall plane, or null when inactive
}

export interface StepEvents {
  hitBrick: BrickState | null;
  hitPaddle: boolean;
  hitWall: boolean;
  hitShield: boolean;
  lost: boolean;
}

/** Renormalises velocity to `speed` and enforces the forward-motion floor. */
function normalise(ball: BallBody, minForwardRatio: number): void {
  const len = Math.hypot(ball.vx, ball.vz) || 1;
  ball.vx = (ball.vx / len) * ball.speed;
  ball.vz = (ball.vz / len) * ball.speed;

  const minVz = minForwardRatio * ball.speed;
  if (Math.abs(ball.vz) < minVz) {
    const sign = ball.vz === 0 ? -1 : Math.sign(ball.vz);
    ball.vz = sign * minVz;
    const remaining = Math.sqrt(Math.max(0, ball.speed ** 2 - minVz ** 2));
    ball.vx = Math.sign(ball.vx || 1) * remaining;
  }
}

/** Advances the ball one fixed step and resolves all collisions. */
export function stepBall(ball: BallBody, dt: number, env: PhysicsEnv): StepEvents {
  const events: StepEvents = {
    hitBrick: null,
    hitPaddle: false,
    hitWall: false,
    hitShield: false,
    lost: false,
  };

  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  // Side walls
  if (ball.x < env.minX) {
    ball.x = env.minX + (env.minX - ball.x);
    ball.vx = Math.abs(ball.vx);
    events.hitWall = true;
  } else if (ball.x > env.maxX) {
    ball.x = env.maxX - (ball.x - env.maxX);
    ball.vx = -Math.abs(ball.vx);
    events.hitWall = true;
  }

  // Rear wall
  if (ball.z < env.minZ) {
    ball.z = env.minZ + (env.minZ - ball.z);
    ball.vz = Math.abs(ball.vz);
    events.hitWall = true;
  }

  // Bricks — closest-point circle vs AABB, resolve along the shallow axis.
  for (const brick of env.bricks) {
    if (!brick.alive || brick.intangible) continue;
    const dx = ball.x - brick.x;
    const dz = ball.z - brick.z;
    const overlapX = brick.halfW + env.radius - Math.abs(dx);
    const overlapZ = brick.halfD + env.radius - Math.abs(dz);
    if (overlapX <= 0 || overlapZ <= 0) continue;

    if (!env.pierceBricks) {
      if (overlapX < overlapZ) {
        ball.x += Math.sign(dx) * overlapX;
        ball.vx = Math.sign(dx) * Math.abs(ball.vx);
      } else {
        ball.z += Math.sign(dz) * overlapZ;
        ball.vz = Math.sign(dz) * Math.abs(ball.vz);
      }
    }
    events.hitBrick = brick;
    break; // one brick per step keeps reflections stable
  }

  // Paddle — front-face reflection; hit position steers the outgoing angle.
  // The face is swept by the paddle's own Z motion so a dash into the ball
  // can never phase through it.
  const p = env.paddle;
  const sweep = Math.abs(p.vz) * dt;
  if (
    ball.vz > 0 &&
    ball.z + env.radius >= p.z - p.halfD - sweep &&
    ball.z < p.z + p.halfD + sweep &&
    Math.abs(ball.x - p.x) <= p.halfW + env.radius * 0.6
  ) {
    const offset = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.halfW + env.radius)));
    const angle = offset * env.maxBounceAngle;
    // A paddle moving toward the court (vz < 0) transfers energy to the ball.
    const energy = Math.max(0, -p.vz) * 0.3;
    ball.speed = Math.min(env.maxSpeed * 1.15, ball.speed + energy);
    ball.vx = Math.sin(angle) * ball.speed + p.vx * 0.25;
    ball.vz = -Math.abs(Math.cos(angle)) * ball.speed;
    ball.z = p.z - p.halfD - env.radius;
    events.hitPaddle = true;
  }

  // Defensive wall behind the paddle.
  if (env.shieldZ !== null && ball.vz > 0 && ball.z + env.radius >= env.shieldZ) {
    ball.z = env.shieldZ - env.radius;
    ball.vz = -Math.abs(ball.vz);
    events.hitShield = true;
  }

  normalise(ball, env.minForwardRatio);

  if (ball.z > env.lossZ) events.lost = true;
  return events;
}
