import { stringify } from "yaml";
import { getBody } from "@/lib/patchbay/positions";
import type { GraphEdge, GraphNode } from "@/lib/patchbay/types";

export function toDocument(name: string, nodes: GraphNode[], edges: GraphEdge[], layout: boolean) {
  return {
    name,
    nodes: nodes.map((node) => {
      const body = getBody(node.id);
      const record: Record<string, unknown> = {
        id: node.id,
        label: node.label,
        kind: node.kind,
      };
      if (node.ip) record.ip = node.ip;
      if (node.mac) record.mac = node.mac;
      if (node.vlan) record.vlan = node.vlan;
      if (node.os) record.os = node.os;
      if (node.status !== "unknown") record.status = node.status;
      if (node.ports.length) record.ports = node.ports;
      if (node.tags.length) record.tags = node.tags;
      if (node.notes) record.notes = node.notes;
      if (node.pinned) record.pinned = true;
      if (layout) {
        record.x = Math.round(body?.x ?? node.x);
        record.y = Math.round(body?.y ?? node.y);
      }
      return record;
    }),
    edges: edges.map((edge) => {
      const record: Record<string, string> = { source: edge.source, target: edge.target };
      if (edge.label) record.label = edge.label;
      return record;
    }),
  };
}

export function toYaml(name: string, nodes: GraphNode[], edges: GraphEdge[], layout: boolean) {
  return stringify(toDocument(name, nodes, edges, layout), { lineWidth: 88 });
}

export function toJson(name: string, nodes: GraphNode[], edges: GraphEdge[], layout: boolean) {
  return JSON.stringify(toDocument(name, nodes, edges, layout), null, 2);
}
