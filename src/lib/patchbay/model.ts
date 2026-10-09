import { create } from "zustand";
import { toYaml } from "@/lib/patchbay/code";
import { draftsToNodes, type ParseResult } from "@/lib/patchbay/parse";
import { getBody, markBorn, mergePositions, resetPositions } from "@/lib/patchbay/positions";
import { SAMPLE_EDGES, SAMPLE_NAME, SAMPLE_NODES, SCAN_BEATS } from "@/lib/patchbay/sample";
import { KINDS, matchesQuery, type GraphEdge, type GraphNode, type Kind, type Panel, type Selection, type Status } from "@/lib/patchbay/types";
import { viewCenter } from "@/lib/patchbay/view";

const KEY = "patchbay.v1";

type Bay = {
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selection: Selection;
  query: string;
  frozen: boolean;
  heat: number;
  fitToken: number;
  focusId: string | null;
  focusToken: number;
  panel: Panel;
  linkMode: boolean;
  scanLines: string[];
  scanActive: boolean;
  simulating: boolean;
  setQuery: (query: string) => void;
  select: (selection: Selection) => void;
  openPanel: (panel: Panel) => void;
  toggleFreeze: () => void;
  reheat: () => void;
  setSimulating: (simulating: boolean) => void;
  toggleLink: () => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  updateEdge: (id: string, patch: Partial<Pick<GraphEdge, "label">>) => void;
  deleteSelection: () => void;
  addNode: () => void;
  addEdge: (source: string, target: string, label?: string) => void;
  loadSample: () => void;
  applyParsed: (result: ParseResult, mode: "merge" | "replace") => void;
  cycleMatch: (dir: number) => void;
  requestFit: () => void;
};

function cloneNode(node: GraphNode): GraphNode {
  return { ...node, ports: [...node.ports], tags: [...node.tags] };
}

function sampleState() {
  return {
    name: SAMPLE_NAME,
    nodes: SAMPLE_NODES.map(cloneNode),
    edges: SAMPLE_EDGES.map((edge) => ({ ...edge })),
  };
}

let replayTimer = 0;
let hydrated = false;
let persistTimer = 0;

export const useBay = create<Bay>((set, get) => ({
  ...sampleState(),
  selection: null,
  query: "",
  frozen: false,
  heat: 0,
  fitToken: 0,
  focusId: null,
  focusToken: 0,
  panel: null,
  linkMode: false,
  scanLines: [],
  scanActive: false,
  simulating: false,
  setQuery: (query) => set({ query }),
  select: (selection) => set({ selection, linkMode: false }),
  openPanel: (panel) => set({ panel }),
  toggleFreeze: () => set((state) => ({ frozen: !state.frozen })),
  reheat: () => set((state) => ({ frozen: false, heat: state.heat + 1 })),
  setSimulating: (simulating) => {
    if (get().simulating === simulating) return;
    set({ simulating });
  },
  toggleLink: () => set((state) => ({ linkMode: !state.linkMode, selection: state.linkMode ? state.selection : null })),
  updateNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...patch, id: node.id } : node)),
    })),
  updateEdge: (id, patch) =>
    set((state) => ({
      edges: state.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
    })),
  deleteSelection: () => {
    const { selection } = get();
    if (!selection) return;
    if (selection.kind === "edge") {
      set((state) => ({ edges: state.edges.filter((edge) => edge.id !== selection.id), selection: null }));
      return;
    }
    set((state) => {
      const nodes = state.nodes.filter((node) => node.id !== selection.id);
      mergePositions(nodes);
      return {
        nodes,
        edges: state.edges.filter((edge) => edge.source !== selection.id && edge.target !== selection.id),
        selection: null,
      };
    });
  },
  addNode: () => {
    const center = viewCenter();
    const node = blankNode(center);
    set((state) => {
      const nodes = [...state.nodes, node];
      mergePositions(nodes);
      markBorn([node.id]);
      return { nodes, selection: { kind: "node", id: node.id }, linkMode: false };
    });
  },
  addEdge: (source, target, label = "") => {
    if (source === target) return;
    set((state) => {
      if (state.edges.some((edge) => sameLink(edge, source, target, label))) return state;
      const edge: GraphEdge = { id: nextEdgeId(state.edges), source, target, label };
      return { edges: [...state.edges, edge], selection: { kind: "edge", id: edge.id }, linkMode: false };
    });
  },
  loadSample: () => {
    stopReplay();
    const next = sampleState();
    resetPositions(next.nodes);
    set((state) => ({
      ...next,
      selection: null,
      panel: null,
      scanLines: [],
      scanActive: false,
      linkMode: false,
      fitToken: state.fitToken + 1,
    }));
  },
  applyParsed: (result, mode) => {
    stopReplay();
    const origin = viewCenter();
    const incoming = draftsToNodes(result.nodes, origin);
    const explicit =
      result.nodes.length > 0 && result.nodes.every((node) => typeof node.x === "number" && typeof node.y === "number");
    if (mode === "replace") {
      resetPositions(incoming);
      markBorn(incoming.map((node) => node.id));
      set((state) => ({
        name: result.name || state.name,
        nodes: incoming,
        edges: result.edges.map((edge) => ({ ...edge })),
        selection: null,
        panel: null,
        scanLines: [],
        scanActive: false,
        frozen: explicit ? state.frozen : false,
        heat: explicit ? state.heat : state.heat + 1,
        fitToken: state.fitToken + 1,
      }));
      return;
    }
    set((state) => {
      const merged = state.nodes.map(cloneNode);
      const index = new Map(merged.map((node, i) => [node.id, i]));
      const fresh: string[] = [];
      for (const node of incoming) {
        const at = index.get(node.id);
        if (at == null) {
          fresh.push(node.id);
          index.set(node.id, merged.length);
          merged.push(node);
          continue;
        }
        const prev = merged[at]!;
        merged[at] = {
          ...prev,
          ...node,
          x: prev.x,
          y: prev.y,
          pinned: prev.pinned || node.pinned,
          notes: node.notes || prev.notes,
          os: node.os || prev.os,
          mac: node.mac || prev.mac,
          vlan: node.vlan || prev.vlan,
          ip: node.ip || prev.ip,
          ports: node.ports.length ? node.ports : prev.ports,
          tags: Array.from(new Set([...prev.tags, ...node.tags])),
          status: node.status !== "unknown" ? node.status : prev.status,
        };
      }
      const edges = state.edges.map((edge) => ({ ...edge }));
      const seen = new Set(edges.map((edge) => edge.id));
      for (const edge of result.edges) {
        if (edges.some((have) => sameLink(have, edge.source, edge.target, edge.label))) continue;
        let id = edge.id;
        while (seen.has(id)) id = `${edge.id}-${seen.size}`;
        seen.add(id);
        edges.push({ ...edge, id });
      }
      mergePositions(merged);
      markBorn(fresh);
      return {
        name: result.name || state.name,
        nodes: merged,
        edges,
        panel: null,
        scanActive: false,
        fitToken: state.nodes.length === 0 ? state.fitToken + 1 : state.fitToken,
      };
    });
  },
  cycleMatch: (dir) => {
    const { nodes, query, selection } = get();
    const list = nodes.filter((node) => matchesQuery(node, query));
    if (!query.trim() || list.length === 0) return;
    const current = selection?.kind === "node" ? list.findIndex((node) => node.id === selection.id) : -1;
    const next = list[(current + dir + list.length) % list.length];
    if (!next) return;
    set((state) => ({
      selection: { kind: "node", id: next.id },
      focusId: next.id,
      focusToken: state.focusToken + 1,
    }));
  },
  requestFit: () => set((state) => ({ fitToken: state.fitToken + 1 })),
}));

function blankNode(at: { x: number; y: number }): GraphNode {
  const id = nextNodeId();
  return {
    id,
    label: "Untitled",
    kind: "host",
    ip: "",
    mac: "",
    vlan: "",
    os: "",
    status: "unknown",
    notes: "",
    ports: [],
    tags: [],
    pinned: true,
    x: at.x,
    y: at.y,
  };
}

function nextNodeId() {
  const ids = new Set(useBay.getState().nodes.map((node) => node.id));
  let n = ids.size + 1;
  let id = `node-${n}`;
  while (ids.has(id)) id = `node-${++n}`;
  return id;
}

function nextEdgeId(edges: GraphEdge[]) {
  const ids = new Set(edges.map((edge) => edge.id));
  let n = edges.length + 1;
  let id = `e-${n}`;
  while (ids.has(id)) id = `e-${++n}`;
  return id;
}

function sameLink(edge: GraphEdge, source: string, target: string, label: string) {
  return (
    edge.label === label &&
    ((edge.source === source && edge.target === target) || (edge.source === target && edge.target === source))
  );
}

export function stopReplay() {
  if (typeof window === "undefined") return;
  window.clearTimeout(replayTimer);
  if (useBay.getState().scanActive) useBay.setState({ scanActive: false });
}

export function startReplay() {
  if (typeof window === "undefined") return;
  stopReplay();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    const next = sampleState();
    resetPositions(next.nodes);
    useBay.setState((state) => ({
      ...next,
      selection: null,
      panel: null,
      linkMode: false,
      scanActive: false,
      scanLines: [`Recorded scan of ${SAMPLE_NAME}.`, `Scan complete · ${next.nodes.length} nodes · ${next.edges.length} links`],
      fitToken: state.fitToken + 1,
    }));
    return;
  }

  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];
  let lines: string[] = ["Listening on the recorded closet scan."];
  let index = 0;
  useBay.setState({ panel: null, selection: null, linkMode: false, scanActive: true, scanLines: lines, nodes: [], edges: [] });
  resetPositions([]);

  const step = () => {
    const beat = SCAN_BEATS[index];
    if (!beat) return;
    index += 1;
    const added: GraphNode[] = [];
    for (const id of beat.nodeIds) {
      const found = SAMPLE_NODES.find((node) => node.id === id);
      if (found) added.push(cloneNode(found));
    }
    const addedEdges: GraphEdge[] = [];
    for (const id of beat.edgeIds) {
      const found = SAMPLE_EDGES.find((edge) => edge.id === id);
      if (found) addedEdges.push({ ...found });
    }
    nodes = [...nodes, ...added];
    edges = [...edges, ...addedEdges];
    lines = [...lines, beat.log];
    if (index === 1) resetPositions(nodes);
    else mergePositions(nodes);
    markBorn(added.map((node) => node.id));
    const last = index >= SCAN_BEATS.length;
    const doneLine = `Scan complete · ${SAMPLE_NODES.length} nodes · ${SAMPLE_EDGES.length} links`;
    useBay.setState((state) => ({
      name: SAMPLE_NAME,
      nodes,
      edges,
      scanLines: last ? [...lines, doneLine] : lines,
      scanActive: !last,
      fitToken: state.fitToken + 1,
    }));
    if (!last) replayTimer = window.setTimeout(step, 460);
  };
  step();
}

export function schedulePersist() {
  if (typeof window === "undefined") return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistNow, 350);
}

export function persistNow() {
  if (typeof window === "undefined") return;
  const { name, nodes, edges } = useBay.getState();
  const saved = nodes.map((node) => {
    const body = getBody(node.id);
    return { ...node, x: body?.x ?? node.x, y: body?.y ?? node.y };
  });
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, nodes: saved, edges }));
  } catch {
    /* ignore quota */
  }
}

export function hydrateBay() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as { name?: unknown; nodes?: unknown; edges?: unknown };
      if (Array.isArray(data.nodes) && data.nodes.length && Array.isArray(data.edges)) {
        const nodes = data.nodes.map(sanitizeNode).filter((node): node is GraphNode => !!node);
        const ids = new Set(nodes.map((node) => node.id));
        const edges = data.edges
          .map(sanitizeEdge)
          .filter((edge): edge is GraphEdge => !!edge && ids.has(edge.source) && ids.has(edge.target));
        if (nodes.length) {
          resetPositions(nodes);
          useBay.setState((state) => ({
            name: typeof data.name === "string" && data.name.trim() ? data.name : SAMPLE_NAME,
            nodes,
            edges,
            fitToken: state.fitToken + 1,
          }));
        }
      }
    }
  } catch {
    /* keep the sample bay */
  }
  window.addEventListener("pagehide", persistNow);
  useBay.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes || state.edges !== prev.edges || state.name !== prev.name) schedulePersist();
  });
}

export function codeSnapshot(layout: boolean) {
  const { name, nodes, edges } = useBay.getState();
  return toYaml(name, nodes, edges, layout);
}

function sanitizeNode(value: unknown): GraphNode | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<GraphNode>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  const kind = KINDS.includes(raw.kind as Kind) ? (raw.kind as Kind) : "host";
  const status: Status = raw.status === "up" || raw.status === "down" || raw.status === "unknown" ? raw.status : "unknown";
  return {
    id: raw.id,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label : raw.id,
    kind,
    ip: typeof raw.ip === "string" ? raw.ip : "",
    mac: typeof raw.mac === "string" ? raw.mac : "",
    vlan: typeof raw.vlan === "string" ? raw.vlan : "",
    os: typeof raw.os === "string" ? raw.os : "",
    status,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    ports: Array.isArray(raw.ports) ? raw.ports.filter((port): port is string => typeof port === "string") : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    pinned: raw.pinned === true,
    x: typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : 0,
    y: typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : 0,
  };
}

function sanitizeEdge(value: unknown): GraphEdge | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<GraphEdge>;
  if (typeof raw.source !== "string" || typeof raw.target !== "string") return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `e-${raw.source}-${raw.target}`,
    source: raw.source,
    target: raw.target,
    label: typeof raw.label === "string" ? raw.label : "",
  };
}
