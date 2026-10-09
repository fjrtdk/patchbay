export type Body = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const pos = new Map<string, Body>();
const born = new Map<string, number>();

export function getBody(id: string): Body | undefined {
  return pos.get(id);
}

export function allBodies(): Map<string, Body> {
  return pos;
}

export function resetPositions(nodes: { id: string; x: number; y: number }[]) {
  pos.clear();
  for (const n of nodes) {
    pos.set(n.id, { id: n.id, x: n.x, y: n.y, vx: 0, vy: 0 });
  }
}

/** Keep live coordinates for ids that remain. Seed anything new. */
export function mergePositions(nodes: { id: string; x: number; y: number }[]) {
  const ids = new Set(nodes.map((n) => n.id));
  for (const id of pos.keys()) {
    if (!ids.has(id)) pos.delete(id);
  }
  for (const n of nodes) {
    if (!pos.has(n.id)) pos.set(n.id, { id: n.id, x: n.x, y: n.y, vx: 0, vy: 0 });
  }
}

export function writeBody(id: string, x: number, y: number) {
  const b = pos.get(id);
  if (b) {
    b.x = x;
    b.y = y;
    b.vx = 0;
    b.vy = 0;
  } else {
    pos.set(id, { id, x, y, vx: 0, vy: 0 });
  }
}

export function markBorn(ids: string[]) {
  const t = typeof performance !== "undefined" ? performance.now() : Date.now();
  for (const id of ids) born.set(id, t);
}

export function bornAge(id: string, now: number): number {
  const t = born.get(id);
  if (t == null) return Number.POSITIVE_INFINITY;
  return now - t;
}

export function spiral(index: number, cx: number, cy: number) {
  const angle = index * 2.399963;
  const radius = 78 + index * 18;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}
