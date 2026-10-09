import type { Body } from "@/lib/patchbay/positions";

export type Spring = { a: number; b: number; rest: number };

const CUT = 480;
const CUT2 = CUT * CUT;

export function tick(bodies: Body[], springs: Spring[], alpha: number, pinned: ReadonlySet<string>) {
  const n = bodies.length;
  if (n === 0 || alpha <= 0) return;

  if (n > 220) repulseGrid(bodies, alpha);
  else repulsePairs(bodies, alpha);

  for (let s = 0; s < springs.length; s++) {
    const spring = springs[s]!;
    const a = bodies[spring.a];
    const b = bodies[spring.b];
    if (!a || !b) continue;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      dx = 0.01;
      dy = 0;
      dist = 0.01;
    }
    const mag = (dist - spring.rest) * 0.018 * alpha;
    const fx = (dx / dist) * mag;
    const fy = (dy / dist) * mag;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += bodies[i]!.x;
    cy += bodies[i]!.y;
  }
  cx /= n;
  cy /= n;

  const maxSpeed = 16;
  for (let i = 0; i < n; i++) {
    const b = bodies[i]!;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      b.x = 0;
      b.y = 0;
      b.vx = 0;
      b.vy = 0;
      continue;
    }
    if (pinned.has(b.id)) {
      b.vx = 0;
      b.vy = 0;
      continue;
    }
    b.vx -= (b.x - cx) * 0.012 * alpha;
    b.vy -= (b.y - cy) * 0.012 * alpha;
    b.vx *= 0.76;
    b.vy *= 0.76;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > maxSpeed) {
      b.vx = (b.vx / speed) * maxSpeed;
      b.vy = (b.vy / speed) * maxSpeed;
    }
    b.x += b.vx;
    b.y += b.vy;
  }
}

function repulsePairs(bodies: Body[], alpha: number) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < n; j++) {
      push(a, bodies[j]!, alpha);
    }
  }
}

function repulseGrid(bodies: Body[], alpha: number) {
  const cell = 160;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]!;
    const key = `${Math.floor(b.x / cell)}:${Math.floor(b.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }
  for (const [key, bucket] of grid) {
    const [cx, cy] = key.split(":").map(Number) as [number, number];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const other = grid.get(`${cx + ox}:${cy + oy}`);
        if (!other) continue;
        for (const i of bucket) {
          for (const j of other) {
            if (j <= i) continue;
            push(bodies[i]!, bodies[j]!, alpha);
          }
        }
      }
    }
  }
}

function push(a: Body, b: Body, alpha: number) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d2 = dx * dx + dy * dy;
  if (d2 > CUT2) return;
  if (d2 < 0.04) {
    dx = (a.id.length + 1) * 0.05;
    dy = 0.05;
    d2 = dx * dx + dy * dy;
  }
  const dist = Math.sqrt(d2);
  let force = (1680 * alpha) / d2;
  const min = 64;
  if (dist < min) force += (min - dist) * 0.09;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;
  a.vx -= fx;
  a.vy -= fy;
  b.vx += fx;
  b.vy += fy;
}
