import { useEffect, useRef } from "react";
import { schedulePersist, useBay } from "@/lib/patchbay/model";
import { bornAge, getBody, mergePositions, writeBody } from "@/lib/patchbay/positions";
import { tick, type Spring } from "@/lib/patchbay/sim";
import {
  KIND_LABEL,
  matchesQuery,
  nodeRadius,
  type GraphEdge,
  type GraphNode,
  type Kind,
} from "@/lib/patchbay/types";
import { bindView } from "@/lib/patchbay/view";

type RGB = {
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  sage: string;
  fault: string;
};

export function BayCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nodes = useBay((state) => state.nodes);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const holding = new Set<string>();
    let alpha = 0;
    let raf = 0;
    let dirty = true;
    let follow = true;
    let alive = true;
    const cam = { x: 0, y: 0, k: 1 };
    const goal = { x: 0, y: 0, k: 1 };
    let palette = readPalette();
    let hoverId: string | null = null;

    type Drag =
      | { kind: "pan"; px: number; py: number; cx: number; cy: number }
      | { kind: "node"; id: string; ox: number; oy: number; sx: number; sy: number; moved: boolean }
      | { kind: "link"; id: string; x: number; y: number };
    let drag: Drag | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; k: number } | null = null;

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    };

    const css = () => {
      const rect = canvas.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    };

    const w2s = (x: number, y: number, w: number, h: number) => ({
      x: (x - cam.x) * cam.k + w / 2,
      y: (y - cam.y) * cam.k + h / 2,
    });

    const s2w = (sx: number, sy: number, w: number, h: number) => ({
      x: (sx - w / 2) / cam.k + cam.x,
      y: (sy - h / 2) / cam.k + cam.y,
    });

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, ...css() };
    };

    const fit = () => {
      const { nodes: list } = useBay.getState();
      if (!list.length) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of list) {
        const body = getBody(node.id);
        const x = body?.x ?? node.x;
        const y = body?.y ?? node.y;
        const pad = nodeRadius(node.kind) + 48;
        minX = Math.min(minX, x - pad);
        minY = Math.min(minY, y - pad);
        maxX = Math.max(maxX, x + pad);
        maxY = Math.max(maxY, y + pad);
      }
      const { w, h } = css();
      const inset = chromeInset(w);
      const kw = (w - inset.left - inset.right) / Math.max(1, maxX - minX);
      const kh = (h - inset.top - inset.bottom) / Math.max(1, maxY - minY);
      goal.k = clamp(Math.min(kw, kh), 0.34, 1.7);
      const bboxCx = (minX + maxX) / 2;
      const bboxCy = (minY + maxY) / 2;
      const viewCx = inset.left + (w - inset.left - inset.right) / 2;
      const viewCy = inset.top + (h - inset.top - inset.bottom) / 2;
      goal.x = bboxCx - (viewCx - w / 2) / goal.k;
      goal.y = bboxCy - (viewCy - h / 2) / goal.k;
      follow = true;
      if (reduced) {
        cam.x = goal.x;
        cam.y = goal.y;
        cam.k = goal.k;
        follow = false;
      }
      dirty = true;
    };

    const zoomAt = (sx: number, sy: number, factor: number) => {
      const { w, h } = css();
      const world = s2w(sx, sy, w, h);
      cam.k = clamp(cam.k * factor, 0.32, 2.6);
      goal.k = cam.k;
      cam.x = world.x - (sx - w / 2) / cam.k;
      cam.y = world.y - (sy - h / 2) / cam.k;
      goal.x = cam.x;
      goal.y = cam.y;
      follow = false;
      dirty = true;
    };

    const focusNode = (id: string) => {
      const body = getBody(id);
      if (!body) return;
      goal.x = body.x;
      goal.y = body.y;
      goal.k = Math.max(cam.k, 1.05);
      follow = true;
      dirty = true;
    };

    bindView({
      zoomBy: (factor) => {
        const { w, h } = css();
        zoomAt(w / 2, h / 2, factor);
        ensure();
      },
      fit: () => {
        fit();
        ensure();
      },
      center: () => ({ x: cam.x, y: cam.y }),
    });

    const draw = (now: number) => {
      const { w, h } = css();
      const state = useBay.getState();
      ctx.clearRect(0, 0, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = palette.canvas;
      ctx.fillRect(0, 0, w, h);

      const gap = cam.k < 0.55 ? 112 : 56;
      const topLeft = s2w(0, 0, w, h);
      const bottomRight = s2w(w, h, w, h);
      ctx.fillStyle = palette.line;
      const x0 = Math.floor(topLeft.x / gap) * gap;
      const y0 = Math.floor(topLeft.y / gap) * gap;
      for (let x = x0; x <= bottomRight.x; x += gap) {
        for (let y = y0; y <= bottomRight.y; y += gap) {
          const p = w2s(x, y, w, h);
          ctx.fillRect(p.x, p.y, 1.2, 1.2);
        }
      }

      const query = state.query.trim();
      const searching = query.length > 0;
      const dimmed = (node: GraphNode) => searching && !matchesQuery(node, query);
      const nodeOf = (id: string) => state.nodes.find((node) => node.id === id);

      ctx.lineCap = "round";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 11px ${monoFamily()}`;

      for (const edge of state.edges) {
        const a = getBody(edge.source);
        const b = getBody(edge.target);
        const na = nodeOf(edge.source);
        const nb = nodeOf(edge.target);
        if (!a || !b || !na || !nb) continue;
        const pa = w2s(a.x, a.y, w, h);
        const pb = w2s(b.x, b.y, w, h);
        const selected =
          (state.selection?.kind === "edge" && state.selection.id === edge.id) ||
          (state.selection?.kind === "node" &&
            (state.selection.id === edge.source || state.selection.id === edge.target));
        const faded = dimmed(na) || dimmed(nb);
        ctx.globalAlpha = faded ? 0.12 : 0.9;
        ctx.strokeStyle = selected ? palette.sage : palette.muted;
        ctx.lineWidth = selected ? 1.75 : 1.15;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const showLabel = !!edge.label && !faded && len > 72 && (cam.k >= 1.05 || selected);
        if (showLabel) {
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          const ox = (-dy / len) * 11;
          const oy = (dx / len) * 11;
          const text = fitText(ctx, edge.label, 120);
          const width = ctx.measureText(text).width;
          ctx.fillStyle = palette.canvas;
          roundRect(ctx, mx + ox - width / 2 - 5, my + oy - 8, width + 10, 16, 4);
          ctx.fill();
          ctx.fillStyle = selected ? palette.sage : palette.muted;
          ctx.fillText(text, mx + ox, my + oy);
        }
      }
      ctx.globalAlpha = 1;

      const paint = (node: GraphNode) => {
        const body = getBody(node.id);
        if (!body) return;
        const p = w2s(body.x, body.y, w, h);
        if (p.x < -80 || p.y < -80 || p.x > w + 80 || p.y > h + 80) return;
        const selected = state.selection?.kind === "node" && state.selection.id === node.id;
        const match = searching && matchesQuery(node, query);
        const faded = searching && !match;
        const r = nodeRadius(node.kind) * cam.k;
        ctx.globalAlpha = faded ? 0.16 : 1;
        ctx.fillStyle = palette.elevated;
        ctx.strokeStyle = selected || match ? palette.sage : hoverId === node.id ? palette.ink : palette.line;
        ctx.lineWidth = selected || match ? 2 : 1.25;
        traceShape(ctx, node.kind, p.x, p.y, r);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        drawGlyph(ctx, node.kind, p.x, p.y, r, palette.ink);

        if (node.status === "up" || node.status === "down") {
          ctx.beginPath();
          ctx.fillStyle = node.status === "up" ? palette.sage : palette.fault;
          ctx.arc(p.x + r * 0.72, p.y + r * 0.72, Math.max(3, r * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }

        const age = bornAge(node.id, now);
        if (age < 1200) {
          ctx.globalAlpha = (1 - age / 1200) * (faded ? 0.16 : 0.8);
          ctx.strokeStyle = palette.sage;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 8 + (age / 1200) * 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = faded ? 0.16 : 1;
        }

        const showLabel = cam.k >= 0.48 || selected || match || hoverId === node.id;
        if (showLabel) {
          ctx.globalAlpha = faded ? 0.28 : 1;
          ctx.font = `500 12px ${sansFamily()}`;
          ctx.fillStyle = palette.ink;
          ctx.textBaseline = "top";
          const label = fitText(ctx, node.label, 148);
          ctx.fillText(label, p.x, p.y + r + 8);
          if ((selected || cam.k > 0.9) && node.ip) {
            ctx.font = `400 10px ${monoFamily()}`;
            ctx.fillStyle = palette.faint;
            ctx.fillText(node.ip, p.x, p.y + r + 24);
          }
        }
        ctx.globalAlpha = 1;
        ctx.textBaseline = "middle";
      };

      for (const node of state.nodes) {
        if (!(state.selection?.kind === "node" && state.selection.id === node.id)) paint(node);
      }
      const selectedNode =
        state.selection?.kind === "node" ? state.nodes.find((node) => node.id === state.selection?.id) : undefined;
      if (selectedNode) paint(selectedNode);

      if (drag?.kind === "link") {
        const body = getBody(drag.id);
        if (body) {
          const p = w2s(body.x, body.y, w, h);
          ctx.strokeStyle = palette.sage;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(drag.x, drag.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    const tip = (text: string, x: number, y: number) => {
      const el = tipRef.current;
      if (!el) return;
      if (!text) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.textContent = text;
      el.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 16)}px)`;
    };

    const ensure = () => {
      if (!alive || raf) return;
      raf = requestAnimationFrame(loop);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!alive) return;
      const state = useBay.getState();
      const hot = !state.frozen && alpha > 0.02;
      if (hot) {
        const bodies = state.nodes.flatMap((node) => {
          const body = getBody(node.id);
          return body ? [body] : [];
        });
        const index = new Map(bodies.map((body, i) => [body.id, i]));
        const springs: Spring[] = [];
        for (const edge of state.edges) {
          const a = index.get(edge.source);
          const b = index.get(edge.target);
          if (a == null || b == null) continue;
          springs.push({ a, b, rest: 150 });
        }
        const pinned = new Set(state.nodes.filter((node) => node.pinned || holding.has(node.id)).map((node) => node.id));
        tick(bodies, springs, alpha, pinned);
        alpha *= 0.962;
        dirty = true;
      }
      if (follow) {
        const ease = reduced ? 1 : 0.2;
        cam.x += (goal.x - cam.x) * ease;
        cam.y += (goal.y - cam.y) * ease;
        cam.k += (goal.k - cam.k) * ease;
        if (Math.abs(goal.x - cam.x) < 0.4 && Math.abs(goal.y - cam.y) < 0.4 && Math.abs(goal.k - cam.k) < 0.002) {
          cam.x = goal.x;
          cam.y = goal.y;
          cam.k = goal.k;
          follow = false;
        }
        dirty = true;
      }
      const pulsing = state.nodes.some((node) => bornAge(node.id, now) < 1300);
      if (dirty || pulsing) draw(now);
      dirty = false;
      const wasHot = state.simulating;
      if (hot && !wasHot) state.setSimulating(true);
      if (!hot && wasHot && alpha <= 0.02) {
        state.setSimulating(false);
        schedulePersist();
      }
      if (hot || follow || drag || pulsing) ensure();
    };

    const hitNode = (wx: number, wy: number) => {
      const list = useBay.getState().nodes;
      for (let i = list.length - 1; i >= 0; i--) {
        const node = list[i]!;
        const body = getBody(node.id);
        if (!body) continue;
        if (contains(node.kind, body.x, body.y, wx, wy)) return node;
      }
      return null;
    };

    const hitEdge = (wx: number, wy: number) => {
      const { edges } = useBay.getState();
      const thresh = 8 / cam.k;
      let best: GraphEdge | null = null;
      let bestDist = thresh;
      for (const edge of edges) {
        const a = getBody(edge.source);
        const b = getBody(edge.target);
        if (!a || !b) continue;
        const dist = distToSeg(wx, wy, a.x, a.y, b.x, b.y);
        if (dist <= bestDist) {
          best = edge;
          bestDist = dist;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* Pointer capture is unavailable for some synthetic events. */
      }
      const point = local(event);
      pointers.set(event.pointerId, { x: point.x, y: point.y });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: cam.k };
        drag = null;
        return;
      }
      const world = s2w(point.x, point.y, point.w, point.h);
      const node = hitNode(world.x, world.y);
      if (useBay.getState().linkMode && node) {
        drag = { kind: "link", id: node.id, x: point.x, y: point.y };
      } else if (node) {
        const body = getBody(node.id);
        if (!body) return;
        holding.add(node.id);
        drag = {
          kind: "node",
          id: node.id,
          ox: world.x - body.x,
          oy: world.y - body.y,
          sx: point.x,
          sy: point.y,
          moved: false,
        };
      } else {
        drag = { kind: "pan", px: point.x, py: point.y, cx: cam.x, cy: cam.y };
      }
      dirty = true;
      ensure();
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = local(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: point.x, y: point.y });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
        const midX = (a!.x + b!.x) / 2;
        const midY = (a!.y + b!.y) / 2;
        zoomAt(midX, midY, dist / pinch.dist * (pinch.k / cam.k));
        pinch = { dist, k: cam.k };
        ensure();
        return;
      }
      const world = s2w(point.x, point.y, point.w, point.h);
      if (!drag) {
        const node = hitNode(world.x, world.y);
        hoverId = node?.id ?? null;
        canvas.style.cursor = node ? "pointer" : "grab";
        tip(node ? `${node.label} · ${KIND_LABEL[node.kind]}${node.ip ? ` · ${node.ip}` : ""}` : "", point.x, point.y);
        dirty = true;
        ensure();
        return;
      }
      if (drag.kind === "pan") {
        cam.x = drag.cx - (point.x - drag.px) / cam.k;
        cam.y = drag.cy - (point.y - drag.py) / cam.k;
        goal.x = cam.x;
        goal.y = cam.y;
        follow = false;
        canvas.style.cursor = "grabbing";
      } else if (drag.kind === "node") {
        if (Math.hypot(point.x - drag.sx, point.y - drag.sy) > 4) drag.moved = true;
        writeBody(drag.id, world.x - drag.ox, world.y - drag.oy);
        canvas.style.cursor = "grabbing";
        tip("", 0, 0);
      } else {
        drag.x = point.x;
        drag.y = point.y;
        const node = hitNode(world.x, world.y);
        canvas.style.cursor = node ? "alias" : "crosshair";
      }
      dirty = true;
      ensure();
    };

    const onPointerUp = (event: PointerEvent) => {
      const point = local(event);
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      const world = s2w(point.x, point.y, point.w, point.h);
      const current = drag;
      drag = null;
      canvas.style.cursor = "grab";
      if (!current) return;
      if (current.kind === "node") {
        holding.delete(current.id);
        if (current.moved) {
          useBay.getState().updateNode(current.id, { pinned: true });
          schedulePersist();
        } else if (event.detail >= 2) {
          useBay.getState().updateNode(current.id, { pinned: false });
          useBay.getState().select({ kind: "node", id: current.id });
        } else {
          useBay.getState().select({ kind: "node", id: current.id });
        }
      } else if (current.kind === "link") {
        const target = hitNode(world.x, world.y);
        if (target && target.id !== current.id) useBay.getState().addEdge(current.id, target.id, "");
      } else if (Math.hypot(point.x - current.px, point.y - current.py) < 4) {
        const edge = hitEdge(world.x, world.y);
        useBay.getState().select(edge ? { kind: "edge", id: edge.id } : null);
      }
      dirty = true;
      ensure();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = local(event);
      const factor = Math.exp(-event.deltaY * 0.0011);
      zoomAt(point.x, point.y, factor);
      ensure();
    };

    const onResize = () => {
      size();
      palette = readPalette();
      dirty = true;
      ensure();
    };

    mergePositions(useBay.getState().nodes);
    size();
    fit();
    const unsub = useBay.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes) mergePositions(state.nodes);
      if (state.heat !== prev.heat) {
        alpha = 1;
        state.setSimulating(true);
      }
      if (state.fitToken !== prev.fitToken) fit();
      if (state.focusToken !== prev.focusToken && state.focusId) focusNode(state.focusId);
      if (state.frozen && !prev.frozen) alpha = 0;
      dirty = true;
      ensure();
    });
    const resize = new ResizeObserver(onResize);
    resize.observe(canvas);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    document.fonts?.ready.then(() => {
      dirty = true;
      ensure();
    });
    ensure();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      unsub();
      resize.disconnect();
      bindView(null);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none" aria-label="Homelab graph" />
      <div
        ref={tipRef}
        hidden
        className="pointer-events-none absolute left-0 top-0 z-10 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
      />
      <ul className="sr-only">
        {nodes.map((node) => (
          <li key={node.id}>
            {node.label}, {KIND_LABEL[node.kind]}
            {node.ip ? `, ${node.ip}` : ""}
            {node.status === "down" ? ", down" : ""}
          </li>
        ))}
      </ul>
    </>
  );
}

function readPalette(): RGB {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    canvas: get("--color-canvas", "#0c0d0b"),
    surface: get("--color-surface", "#141613"),
    elevated: get("--color-elevated", "#1c1e1a"),
    ink: get("--color-ink", "#eceae4"),
    muted: get("--color-muted", "#9a968c"),
    faint: get("--color-faint", "#6f6c64"),
    line: get("--color-line", "#2c2e28"),
    sage: get("--color-sage", "#8fa396"),
    fault: get("--color-fault", "#c17b6e"),
  };
}

function sansFamily() {
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function monoFamily() {
  return "IBM Plex Mono, ui-monospace, monospace";
}

function chromeInset(width: number) {
  const wide = width >= 768;
  return {
    left: wide ? 176 : 24,
    right: wide ? 36 : 24,
    top: wide ? 108 : 112,
    bottom: wide ? 36 : 104,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function contains(kind: Kind, x: number, y: number, wx: number, wy: number) {
  const r = nodeRadius(kind);
  const dx = wx - x;
  const dy = wy - y;
  if (kind === "switch") return Math.abs(dx) <= r * 1.4 && Math.abs(dy) <= r * 0.82;
  if (kind === "network") return (dx * dx) / (r * 1.45) ** 2 + (dy * dy) / (r * 0.92) ** 2 <= 1;
  return dx * dx + dy * dy <= (r + 4) ** 2;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function traceShape(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, r: number) {
  ctx.beginPath();
  if (kind === "network") {
    ctx.ellipse(x, y, r * 1.35, r * 0.82, 0, 0, Math.PI * 2);
    ctx.setLineDash([4, 3]);
  } else if (kind === "switch") {
    roundRect(ctx, x - r * 1.35, y - r * 0.62, r * 2.7, r * 1.24, Math.min(10, r * 0.35));
    ctx.setLineDash([]);
  } else if (kind === "router") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.setLineDash([]);
  } else if (kind === "host" || kind === "vm" || kind === "ups" || kind === "iot") {
    const side = r * (kind === "iot" ? 1.35 : 1.7);
    roundRect(ctx, x - side / 2, y - side / 2, side, side, kind === "iot" ? 3 : Math.min(8, r * 0.28));
    ctx.setLineDash([]);
  } else if (kind === "container") {
    const s = r * 0.92;
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = x + Math.cos(angle) * s;
      const py = y + Math.sin(angle) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.setLineDash([]);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.setLineDash([]);
  }
}

function drawGlyph(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.1, r * 0.08);
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  const s = Math.max(4, r * 0.42);
  ctx.beginPath();
  if (kind === "router") {
    ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s);
  } else if (kind === "switch") {
    for (let i = -1.5; i <= 1.5; i++) {
      ctx.moveTo(i * s * 0.55, -s * 0.15);
      ctx.lineTo(i * s * 0.55, s * 0.55);
    }
  } else if (kind === "ap") {
    ctx.arc(0, s * 0.25, s * 0.22, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.7, -s * 0.15);
    ctx.arc(0, s * 0.25, s * 0.7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.moveTo(-s * 1.05, -s * 0.45);
    ctx.arc(0, s * 0.25, s * 1.05, Math.PI * 1.2, Math.PI * 1.8);
  } else if (kind === "storage") {
    ctx.ellipse(0, -s * 0.35, s * 0.7, s * 0.28, 0, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.7, -s * 0.35);
    ctx.lineTo(-s * 0.7, s * 0.35);
    ctx.ellipse(0, s * 0.35, s * 0.7, s * 0.28, 0, 0, Math.PI);
    ctx.moveTo(s * 0.7, s * 0.35);
    ctx.lineTo(s * 0.7, -s * 0.35);
  } else if (kind === "dns") {
    ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.75, 0);
    ctx.lineTo(s * 0.75, 0);
    ctx.moveTo(0, -s * 0.75);
    ctx.lineTo(0, s * 0.75);
  } else if (kind === "proxy") {
    ctx.moveTo(-s * 0.2, -s * 0.7);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(-s * 0.2, s * 0.7);
  } else if (kind === "ups") {
    roundRect(ctx, -s * 0.55, -s * 0.7, s * 1.1, s * 1.35, 2);
    ctx.moveTo(-s * 0.2, -s * 0.95);
    ctx.lineTo(s * 0.2, -s * 0.95);
  } else if (kind === "network") {
    ctx.arc(-s * 0.35, 0, s * 0.28, 0, Math.PI * 2);
    ctx.moveTo(s * 0.15, 0);
    ctx.arc(s * 0.4, 0, s * 0.28, 0, Math.PI * 2);
  } else {
    ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > max) next = next.slice(0, -1);
  return `${next}…`;
}
