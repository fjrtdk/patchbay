export const KINDS = [
  "network",
  "router",
  "switch",
  "ap",
  "host",
  "vm",
  "container",
  "service",
  "storage",
  "dns",
  "proxy",
  "iot",
  "ups",
] as const;

export type Kind = (typeof KINDS)[number];

export type Status = "up" | "down" | "unknown";

export const KIND_LABEL: Record<Kind, string> = {
  network: "Network",
  router: "Router",
  switch: "Switch",
  ap: "Access point",
  host: "Host",
  vm: "Virtual machine",
  container: "Container",
  service: "Service",
  storage: "Storage",
  dns: "DNS",
  proxy: "Proxy",
  iot: "IoT",
  ups: "Power",
};

export type GraphNode = {
  id: string;
  label: string;
  kind: Kind;
  ip: string;
  mac: string;
  vlan: string;
  os: string;
  status: Status;
  notes: string;
  ports: string[];
  tags: string[];
  pinned: boolean;
  x: number;
  y: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export type Panel = "import" | "discover" | "code" | "sample" | "cloud" | null;

export function nodeRadius(kind: Kind): number {
  switch (kind) {
    case "network":
      return 28;
    case "switch":
    case "router":
    case "storage":
    case "host":
      return 22;
    default:
      return 16;
  }
}

export function hitRadius(kind: Kind): number {
  if (kind === "switch" || kind === "network") return nodeRadius(kind) * 1.4;
  return nodeRadius(kind);
}

export function matchesQuery(node: GraphNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    node.label,
    node.id,
    node.kind,
    KIND_LABEL[node.kind],
    node.ip,
    node.mac,
    node.vlan,
    node.os,
    node.notes,
    node.status,
    ...node.ports,
    ...node.tags,
  ]
    .join("\n")
    .toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}
