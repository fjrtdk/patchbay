import { parseAllDocuments } from "yaml";
import { KINDS, type GraphEdge, type GraphNode, type Kind, type Status } from "@/lib/patchbay/types";

export type PendingLink = { to: string; label: string };

export type DraftNode = {
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
  x?: number;
  y?: number;
  links: PendingLink[];
};

export type ParseResult = {
  nodes: DraftNode[];
  edges: GraphEdge[];
  name?: string;
  format: string;
  warnings: string[];
};

const KIND_ALIAS: Record<string, Kind> = {
  network: "network",
  vlan: "network",
  subnet: "network",
  wan: "network",
  lan: "network",
  router: "router",
  firewall: "router",
  gateway: "router",
  opnsense: "router",
  pfsense: "router",
  switch: "switch",
  sw: "switch",
  ap: "ap",
  wifi: "ap",
  wap: "ap",
  "access-point": "ap",
  accesspoint: "ap",
  host: "host",
  server: "host",
  machine: "host",
  proxmox: "host",
  vm: "vm",
  virtual: "vm",
  "virtual-machine": "vm",
  container: "container",
  lxc: "container",
  docker: "container",
  ct: "container",
  service: "service",
  app: "service",
  storage: "storage",
  nas: "storage",
  san: "storage",
  dns: "dns",
  proxy: "proxy",
  "reverse-proxy": "proxy",
  lb: "proxy",
  loadbalancer: "proxy",
  iot: "iot",
  device: "iot",
  camera: "iot",
  ups: "ups",
  pdu: "ups",
  power: "ups",
};

export function slug(value: string): string {
  const t = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t || "node";
}

export function parseInventory(text: string): ParseResult {
  const warnings: string[] = [];
  const raw = text.replace(/^\uFEFF/, "").trim();
  if (!raw) return empty("empty", ["Nothing to import."]);

  try {
    if (raw.startsWith("<")) return finish(parseNmapXml(raw), "nmap-xml", warnings);
    if (isNmapGrep(raw)) return finish(parseNmapGrep(raw), "nmap-grep", warnings);

    let data: unknown;
    let format = "YAML";
    if (raw.startsWith("{") || raw.startsWith("[")) {
      data = JSON.parse(raw) as unknown;
      format = "JSON";
    } else if (raw.startsWith("---") || raw.includes("\n---")) {
      const docs = parseAllDocuments(raw).map((doc) => doc.toJSON() as unknown);
      if (docs.length > 1) {
        const merged = mergeParsed(docs.map((doc) => normalizeData(doc, warnings)));
        return finish(merged, "YAML", warnings);
      }
      data = docs[0];
    } else {
      data = parseAllDocuments(raw)[0]?.toJSON() as unknown;
    }

    const structured = normalizeData(data, warnings);
    if (structured.nodes.length === 0) {
      const lines = parseLines(raw);
      if (lines.nodes.length) return finish(lines, "lines", warnings);
    }
    return finish(structured, format, warnings);
  } catch (err) {
    const lines = parseLines(raw);
    if (lines.nodes.length) return finish(lines, "lines", warnings);
    const message = err instanceof Error ? err.message : "Could not parse that file.";
    return empty("invalid", [message]);
  }
}

export function summary(result: ParseResult): string {
  if (result.format === "invalid" || result.format === "empty") {
    return result.warnings[0] ?? "Nothing to import.";
  }
  const nodeWord = result.nodes.length === 1 ? "node" : "nodes";
  const edgeWord = result.edges.length === 1 ? "link" : "links";
  return `${result.format} · ${result.nodes.length} ${nodeWord} · ${result.edges.length} ${edgeWord}`;
}

export function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const addr = ipv4ToInt(ip);
  const network = ipv4ToInt(base);
  if (addr == null || network == null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (addr & mask) === (network & mask);
}

export function decorateDiscovery(
  result: ParseResult,
  opts: { gateway?: string; cidr?: string },
): ParseResult {
  const warnings = [...result.warnings];
  const nodes = result.nodes.map((node) => ({ ...node, links: [...node.links] }));
  const edges = [...result.edges];
  const gateway = opts.gateway?.trim() ?? "";
  const cidr = opts.cidr?.trim() ?? "";

  if (cidr && !/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(cidr)) {
    warnings.push("CIDR should look like 10.0.0.0/24.");
  } else if (cidr) {
    const id = slug(cidr);
    if (!nodes.some((node) => node.id === id || node.ip === cidr)) {
      nodes.push(blank(id, cidr, "network", { ip: cidr, tags: ["discovered"] }));
    }
  }

  let gatewayId = "";
  if (gateway) {
    const bare = gateway.split("/")[0] ?? gateway;
    const found = nodes.find((node) => node.ip.split("/")[0] === bare || node.id === slug(bare));
    if (found) {
      gatewayId = found.id;
      if (found.kind === "host") found.kind = "router";
    } else {
      gatewayId = slug(bare) || "gateway";
      nodes.push(
        blank(gatewayId, `Gateway ${bare}`, "router", { ip: bare, tags: ["discovered"], status: "up" }),
      );
    }
  }

  const scanFormats = new Set(["nmap-grep", "nmap-xml", "lines"]);
  if (gatewayId && scanFormats.has(result.format)) {
    for (const node of nodes) {
      if (node.id === gatewayId || !node.ip) continue;
      if (cidr && !inCidr(node.ip, cidr)) continue;
      const exists = edges.some(
        (edge) =>
          (edge.source === gatewayId && edge.target === node.id) ||
          (edge.target === gatewayId && edge.source === node.id),
      );
      if (!exists) {
        edges.push({
          id: `e-${gatewayId}-${node.id}`,
          source: gatewayId,
          target: node.id,
          label: "discovered",
        });
      }
    }
  }

  if (cidr) {
    const net = nodes.find((node) => node.ip === cidr || node.id === slug(cidr));
    if (net) {
      for (const node of nodes) {
        if (node.id === net.id || !node.ip || node.ip.includes("/")) continue;
        if (!inCidr(node.ip, cidr)) continue;
        const exists = edges.some(
          (edge) =>
            (edge.source === net.id && edge.target === node.id) ||
            (edge.target === net.id && edge.source === node.id),
        );
        if (!exists) {
          edges.push({
            id: `e-${net.id}-${node.id}`,
            source: net.id,
            target: node.id,
            label: "in subnet",
          });
        }
      }
    }
  }

  return { ...result, nodes, edges, warnings };
}

function empty(format: string, warnings: string[]): ParseResult {
  return { nodes: [], edges: [], format, warnings };
}

function finish(
  partial: { nodes: DraftNode[]; edges: GraphEdge[]; name?: string },
  format: string,
  warnings: string[],
): ParseResult {
  const resolved = resolveLinks(partial.nodes, partial.edges, warnings);
  if (resolved.nodes.length === 0 && !warnings.length) warnings.push("No nodes found in that text.");
  return { ...resolved, name: partial.name, format, warnings };
}

function mergeParsed(parts: Array<{ nodes: DraftNode[]; edges: GraphEdge[]; name?: string }>) {
  return {
    name: parts.find((part) => part.name)?.name,
    nodes: parts.flatMap((part) => part.nodes),
    edges: parts.flatMap((part) => part.edges),
  };
}

function normalizeData(data: unknown, warnings: string[]): { nodes: DraftNode[]; edges: GraphEdge[]; name?: string } {
  if (Array.isArray(data)) return fromList(data, warnings);
  if (!data || typeof data !== "object") return { nodes: [], edges: [] };
  const obj = data as Record<string, unknown>;

  if (isCompose(obj)) return fromCompose(obj);
  if (isAnsible(obj)) return { nodes: fromAnsible(obj), edges: collectEdges(obj) };

  const name = str(obj.name);
  const nodes: DraftNode[] = [];
  const edges = collectEdges(obj);

  if (Array.isArray(obj.nodes)) {
    const listed = fromList(obj.nodes, warnings);
    nodes.push(...listed.nodes);
    edges.push(...listed.edges);
  }
  if (Array.isArray(obj.hosts)) {
    const listed = fromList(obj.hosts, warnings);
    nodes.push(...listed.nodes);
    edges.push(...listed.edges);
  }
  if (Array.isArray(obj.results)) nodes.push(...fromList(obj.results, warnings).nodes);
  if (Array.isArray(obj.items)) nodes.push(...fromList(obj.items, warnings).nodes);

  if (obj.hosts && typeof obj.hosts === "object" && !Array.isArray(obj.hosts)) {
    nodes.push(...fromNameMap(obj.hosts as Record<string, unknown>));
  }

  const named =
    Array.isArray(obj.nodes) ||
    Array.isArray(obj.hosts) ||
    Array.isArray(obj.results) ||
    Array.isArray(obj.items) ||
    (!!obj.hosts && typeof obj.hosts === "object");

  if (nodes.length === 0 && edges.length === 0 && isNodeLike(obj)) {
    const one = fromLoose(obj, undefined);
    if (one) nodes.push(one);
  }

  return { nodes, edges, name: named ? name : undefined };
}

function fromList(list: unknown[], warnings: string[]) {
  const nodes: DraftNode[] = [];
  const edges: GraphEdge[] = [];
  list.forEach((item, index) => {
    if (typeof item === "string") {
      const node = fromLoose({ label: item }, undefined);
      if (node) nodes.push(node);
      return;
    }
    if (Array.isArray(item) && item.length >= 2 && item.every((part) => typeof part === "string")) {
      edges.push({
        id: `e-list-${index}`,
        source: item[0] as string,
        target: item[1] as string,
        label: typeof item[2] === "string" ? item[2] : "",
      });
      return;
    }
    if (!item || typeof item !== "object") {
      warnings.push(`Skipped entry ${index + 1}.`);
      return;
    }
    const rec = item as Record<string, unknown>;
    if (isEdgeLike(rec) && !isNodeLike(rec)) {
      const edge = edgeFrom(rec, `e-list-${index}`);
      if (edge) edges.push(edge);
      return;
    }
    const node = fromLoose(rec, undefined);
    if (node) nodes.push(node);
    else warnings.push(`Skipped entry ${index + 1}.`);
  });
  return { nodes, edges };
}

function fromNameMap(map: Record<string, unknown>): DraftNode[] {
  const nodes: DraftNode[] = [];
  for (const [name, value] of Object.entries(map)) {
    const node = fromLoose(asObj(value) ?? {}, name);
    if (node) nodes.push(node);
  }
  return nodes;
}

function fromAnsible(root: Record<string, unknown>): DraftNode[] {
  const nodes: DraftNode[] = [];
  const walk = (node: unknown, group?: string, seen?: Set<unknown>) => {
    const bag = seen ?? new Set<unknown>();
    if (!node || typeof node !== "object" || bag.has(node)) return;
    bag.add(node);
    const obj = node as Record<string, unknown>;
    if (obj.hosts && typeof obj.hosts === "object" && !Array.isArray(obj.hosts)) {
      for (const [name, vars] of Object.entries(obj.hosts as Record<string, unknown>)) {
        const extra = asObj(vars) ?? {};
        const kindHint = group && group !== "all" && group !== "ungrouped" ? group : undefined;
        const draft = fromLoose({ ...extra, kind: extra.kind ?? extra.type ?? kindHint }, name);
        if (draft) nodes.push(draft);
      }
    }
    if (obj.children && typeof obj.children === "object") {
      for (const [name, child] of Object.entries(obj.children as Record<string, unknown>)) {
        walk(child, name, bag);
      }
    }
  };
  if (root.all) walk(root.all, "all");
  else walk(root, "all");
  return nodes;
}

function fromCompose(obj: Record<string, unknown>) {
  const services = obj.services as Record<string, unknown>;
  const nodes: DraftNode[] = [];
  for (const [name, value] of Object.entries(services)) {
    const spec = asObj(value) ?? {};
    const ports = strList(spec.ports).map((port) => port.split(":")[0] ?? port);
    const draft = fromLoose(
      {
        ...spec,
        label: spec.container_name ?? name,
        kind: "container",
        ports,
        notes: spec.image ? `image ${String(spec.image)}` : spec.notes,
      },
      name,
    );
    if (draft) nodes.push(draft);
  }
  return { nodes, edges: [] as GraphEdge[], name: str(obj.name) };
}

function fromLoose(raw: Record<string, unknown>, fallbackName?: string): DraftNode | null {
  const ip = pickIp(raw);
  const label = str(raw.label) || str(raw.name) || str(raw.hostname) || fallbackName || ip;
  if (!label && !str(raw.id)) return null;
  const id = slug(str(raw.id) || label || ip || "node");
  const kind = coerceKind(str(raw.kind) || str(raw.type) || str(raw.role) || str(raw.group));
  const x = num(raw.x);
  const y = num(raw.y);
  const links = pendingFromNode(raw);
  return {
    id,
    label: label || id,
    kind,
    ip: ip.replace(/\/32$/, ""),
    mac: str(raw.mac) ?? "",
    vlan: str(raw.vlan) ?? str(raw.vlan_id) ?? "",
    os: str(raw.os) || str(raw.platform) || str(raw.ansible_distribution) || "",
    status: coerceStatus(str(raw.status) || str(raw.state)),
    notes: str(raw.notes) || str(raw.comment) || str(raw.description) || "",
    ports: strList(raw.ports),
    tags: strList(raw.tags),
    pinned: raw.pinned === true,
    x: x ?? undefined,
    y: y ?? undefined,
    links,
  };
}

function pendingFromNode(raw: Record<string, unknown>): PendingLink[] {
  const links: PendingLink[] = [];
  const via = str(raw.via) || str(raw.parent) || str(raw.upstream);
  if (via) links.push({ to: via, label: str(raw.link) ?? "" });
  const deps = raw.depends_on;
  if (typeof deps === "string") links.push({ to: deps, label: "depends" });
  else if (Array.isArray(deps)) {
    for (const dep of deps) {
      if (typeof dep === "string") links.push({ to: dep, label: "depends" });
    }
  } else if (deps && typeof deps === "object") {
    for (const name of Object.keys(deps as Record<string, unknown>)) links.push({ to: name, label: "depends" });
  }
  const rawLinks = raw.links ?? raw.edges ?? raw.connections;
  if (Array.isArray(rawLinks)) {
    for (const link of rawLinks) {
      if (typeof link === "string") links.push({ to: link, label: "" });
      else if (link && typeof link === "object") {
        const rec = link as Record<string, unknown>;
        const to = str(rec.to) || str(rec.target) || str(rec.dst) || str(rec.host);
        if (to) links.push({ to, label: str(rec.label) || str(rec.via) || "" });
      }
    }
  }
  return links;
}

function collectEdges(obj: Record<string, unknown>): GraphEdge[] {
  const raw = obj.edges ?? obj.links ?? obj.connections;
  if (!Array.isArray(raw)) return [];
  const edges: GraphEdge[] = [];
  raw.forEach((item, index) => {
    if (Array.isArray(item) && item.length >= 2) {
      edges.push({
        id: `e-doc-${index}`,
        source: String(item[0]),
        target: String(item[1]),
        label: item[2] != null ? String(item[2]) : "",
      });
      return;
    }
    if (item && typeof item === "object") {
      const edge = edgeFrom(item as Record<string, unknown>, `e-doc-${index}`);
      if (edge) edges.push(edge);
    }
  });
  return edges;
}

function edgeFrom(raw: Record<string, unknown>, fallbackId: string): GraphEdge | null {
  const source = str(raw.source) || str(raw.from) || str(raw.src);
  const target = str(raw.target) || str(raw.to) || str(raw.dst);
  if (!source || !target) return null;
  return {
    id: str(raw.id) || fallbackId,
    source,
    target,
    label: str(raw.label) || str(raw.via) || "",
  };
}

function resolveLinks(
  drafts: DraftNode[],
  edges: GraphEdge[],
  warnings: string[],
): { nodes: DraftNode[]; edges: GraphEdge[] } {
  const used = new Set<string>();
  const nodes = drafts.map((draft) => {
    let id = slug(draft.id);
    if (!id) id = "node";
    let next = id;
    let n = 2;
    while (used.has(next)) next = `${id}-${n++}`;
    used.add(next);
    return { ...draft, id: next };
  });

  const aliases = new Map<string, string>();
  for (const node of nodes) {
    aliases.set(node.id, node.id);
    aliases.set(node.id.toLowerCase(), node.id);
    aliases.set(node.label.toLowerCase(), node.id);
    aliases.set(slug(node.label), node.id);
    if (node.ip) {
      const bare = node.ip.split("/")[0] ?? node.ip;
      aliases.set(bare, node.id);
      aliases.set(node.ip, node.id);
    }
  }

  const ensure = (ref: string) => {
    const key = ref.trim();
    const hit =
      aliases.get(key) ||
      aliases.get(key.toLowerCase()) ||
      aliases.get(slug(key)) ||
      aliases.get(key.split("/")[0] ?? key);
    if (hit) return hit;
    const id = allocate(slug(key || "node"), used);
    nodes.push(blank(id, key || id, "host", { tags: ["stub"] }));
    aliases.set(key, id);
    aliases.set(key.toLowerCase(), id);
    aliases.set(id, id);
    warnings.push(`Created a stub node for “${key}”.`);
    return id;
  };

  const resolved: GraphEdge[] = [];
  const seen = new Set<string>();
  const pushEdge = (sourceRef: string, targetRef: string, label: string, idHint?: string) => {
    const source = ensure(sourceRef);
    const target = ensure(targetRef);
    if (source === target) return;
    const key = `${source}|${target}|${label}`;
    const reverse = `${target}|${source}|${label}`;
    if (seen.has(key) || seen.has(reverse)) return;
    seen.add(key);
    resolved.push({
      id: idHint && !resolved.some((edge) => edge.id === idHint) ? idHint : `e-${source}-${target}-${resolved.length}`,
      source,
      target,
      label,
    });
  };

  for (const edge of edges) pushEdge(edge.source, edge.target, edge.label, edge.id);
  for (const node of nodes) {
    for (const link of node.links) pushEdge(node.id, link.to, link.label);
  }

  return { nodes, edges: resolved };
}

function parseNmapGrep(raw: string): { nodes: DraftNode[]; edges: GraphEdge[] } {
  const byIp = new Map<string, DraftNode>();
  for (const line of raw.split(/\r?\n/)) {
    const host = /^Host:\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\(([^)]*)\)\s+Status:\s+(\S+)/i.exec(line);
    if (host) {
      const ip = host[1] ?? "";
      const name = (host[2] ?? "").trim();
      const status = /^up$/i.test(host[3] ?? "") ? "up" : /^down$/i.test(host[3] ?? "") ? "down" : "unknown";
      const existing = byIp.get(ip) ?? blank(slug(name || ip), name || ip, "host", { ip, status });
      existing.status = status;
      if (name && existing.label === ip) existing.label = name;
      byIp.set(ip, existing);
      continue;
    }
    const ports = /^Host:\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\(([^)]*)\)\s+Ports:\s+(.+)$/i.exec(line);
    if (!ports) continue;
    const ip = ports[1] ?? "";
    const name = (ports[2] ?? "").trim();
    const open: string[] = [];
    for (const part of (ports[3] ?? "").split(",")) {
      const bits = part.trim().split("/");
      if ((bits[1] ?? "").toLowerCase() === "open" && bits[0]) open.push(bits[0]);
    }
    const node = byIp.get(ip) ?? blank(slug(name || ip), name || ip, kindFromPorts(open), { ip, status: "up" });
    if (name) node.label = name;
    node.ports = Array.from(new Set([...node.ports, ...open]));
    if (node.kind === "host") node.kind = kindFromPorts(node.ports);
    node.tags = Array.from(new Set([...node.tags, "discovered"]));
    byIp.set(ip, node);
  }
  return { nodes: [...byIp.values()], edges: [] };
}

function parseNmapXml(raw: string): { nodes: DraftNode[]; edges: GraphEdge[] } {
  const nodes: DraftNode[] = [];
  for (const chunk of raw.split(/<host\b/i).slice(1)) {
    const addr =
      /<address\b[^>]*\baddr="([^"]+)"[^>]*\baddrtype="ipv4"/i.exec(chunk) ||
      /<address\b[^>]*\baddrtype="ipv4"[^>]*\baddr="([^"]+)"/i.exec(chunk);
    const ip = addr?.[1] ?? "";
    if (!ip) continue;
    const hostname = /<hostname\b[^>]*\bname="([^"]+)"/i.exec(chunk);
    const state = /<status\b[^>]*\bstate="([^"]+)"/i.exec(chunk);
    const ports: string[] = [];
    const portRe = /<port\b[^>]*\bportid="(\d+)"[^>]*>\s*<state\b[^>]*\bstate="([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = portRe.exec(chunk))) {
      if ((match[2] ?? "").toLowerCase() === "open" && match[1]) ports.push(match[1]);
    }
    const label = hostname?.[1] || ip;
    const status = coerceStatus(state?.[1]);
    nodes.push(
      blank(slug(label), label, kindFromPorts(ports), {
        ip,
        status: status === "unknown" ? "up" : status,
        ports,
        tags: ["discovered"],
      }),
    );
  }
  return { nodes, edges: [] };
}

function parseLines(raw: string): { nodes: DraftNode[]; edges: GraphEdge[] } {
  const nodes: DraftNode[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const ipFirst = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/\d{1,2})?\s+(\S+)(?:\s+(\S+))?$/.exec(trimmed);
    if (ipFirst) {
      nodes.push(
        blank(slug(ipFirst[2] || ipFirst[1] || "node"), ipFirst[2] || ipFirst[1] || "node", coerceKind(ipFirst[3]), {
          ip: ipFirst[1] ?? "",
        }),
      );
      continue;
    }
    const nameFirst = /^(\S+)\s+(\d{1,3}(?:\.\d{1,3}){3})(?:\s+(\S+))?$/.exec(trimmed);
    if (nameFirst && !nameFirst[1]?.includes(":")) {
      nodes.push(
        blank(slug(nameFirst[1] || "node"), nameFirst[1] || "node", coerceKind(nameFirst[3]), {
          ip: nameFirst[2] ?? "",
        }),
      );
    }
  }
  return { nodes, edges: [] };
}

function kindFromPorts(ports: string[]): Kind {
  const set = new Set(ports);
  if (set.has("8006")) return "host";
  if (set.has("445") || set.has("2049")) return "storage";
  if (set.has("53")) return "dns";
  if (set.has("3493")) return "ups";
  if (set.has("8123")) return "service";
  if (set.has("554")) return "iot";
  if (set.has("443") || set.has("8443") || set.has("80")) return "proxy";
  return "host";
}

function isNmapGrep(raw: string) {
  return /^Host:\s+\d{1,3}(?:\.\d{1,3}){3}/m.test(raw);
}

function isCompose(obj: Record<string, unknown>) {
  if (!obj.services || typeof obj.services !== "object" || Array.isArray(obj.services)) return false;
  if (obj.nodes) return false;
  const values = Object.values(obj.services as Record<string, unknown>);
  if (!values.length) return false;
  return values.every((value) => {
    const spec = asObj(value);
    return !!spec && ("image" in spec || "build" in spec || "container_name" in spec);
  });
}

function isAnsible(obj: Record<string, unknown>) {
  if (obj.nodes || obj.edges || obj.services || Array.isArray(obj.hosts)) return false;
  if (obj.all && typeof obj.all === "object") return true;
  const hosts = asObj(obj.hosts);
  if (hosts && Object.values(hosts).some((value) => !!asObj(value) && "ansible_host" in (asObj(value) as object))) {
    return true;
  }
  return false;
}

function isNodeLike(obj: Record<string, unknown>) {
  return ["label", "name", "hostname", "id", "ip", "ansible_host", "kind", "type", "role", "address"].some(
    (key) => key in obj,
  );
}

function isEdgeLike(obj: Record<string, unknown>) {
  const source = obj.source ?? obj.from ?? obj.src;
  const target = obj.target ?? obj.to ?? obj.dst;
  return source != null && target != null;
}

function coerceKind(value: string | undefined): Kind {
  if (!value) return "host";
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if ((KINDS as readonly string[]).includes(key)) return key as Kind;
  return KIND_ALIAS[key] ?? "host";
}

function coerceStatus(value: string | undefined): Status {
  const v = (value ?? "").toLowerCase();
  if (["up", "online", "running", "active", "ok"].includes(v)) return "up";
  if (["down", "offline", "stopped", "failed", "unreachable"].includes(v)) return "down";
  return "unknown";
}

function blank(
  id: string,
  label: string,
  kind: Kind,
  extra: Partial<DraftNode> = {},
): DraftNode {
  return {
    id,
    label,
    kind,
    ip: "",
    mac: "",
    vlan: "",
    os: "",
    status: "unknown",
    notes: "",
    ports: [],
    tags: [],
    pinned: false,
    links: [],
    ...extra,
  };
}

function allocate(base: string, used: Set<string>) {
  let id = base || "node";
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function asObj(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => str(item)).filter((item): item is string => !!item);
  if (typeof value === "string") return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "number") return [String(value)];
  return [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pickIp(raw: Record<string, unknown>): string {
  const direct = str(raw.ip) || str(raw.address) || str(raw.ansible_host);
  if (direct) return direct;
  const host = str(raw.hostname);
  if (host && looksLikeIp(host)) return host;
  const primary = asObj(raw.primary_ip);
  const address = str(primary?.address);
  return address ? address.replace(/\/\d+$/, "") : "";
}

function looksLikeIp(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.split("/")[0] ?? "");
}

function ipv4ToInt(ip: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.split("/")[0] ?? "");
  if (!match) return null;
  const parts = [1, 2, 3, 4].map((index) => Number(match[index]));
  if (parts.some((part) => part > 255)) return null;
  return (((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0);
}

export function draftsToNodes(drafts: DraftNode[], origin: { x: number; y: number }): GraphNode[] {
  return drafts.map((draft, index) => {
    const hasPoint = typeof draft.x === "number" && typeof draft.y === "number";
    const point = hasPoint ? { x: draft.x as number, y: draft.y as number } : spiralAround(index, origin);
    return {
      id: draft.id,
      label: draft.label,
      kind: draft.kind,
      ip: draft.ip,
      mac: draft.mac,
      vlan: draft.vlan,
      os: draft.os,
      status: draft.status,
      notes: draft.notes,
      ports: draft.ports,
      tags: draft.tags,
      pinned: draft.pinned,
      x: point.x,
      y: point.y,
    };
  });
}

function spiralAround(index: number, origin: { x: number; y: number }) {
  const angle = index * 2.399963;
  const radius = 72 + index * 16;
  return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
}
