import { useEffect, useState } from "react";
import { Pin, PinOff, Trash2, X } from "lucide-react";
import { useBay } from "@/lib/patchbay/model";
import { KIND_LABEL, KINDS, type Kind, type Status } from "@/lib/patchbay/types";
import { Field, IconButton, controlClass } from "@/components/patchbay/ui";

const STATUSES: Status[] = ["up", "down", "unknown"];

export function Inspector() {
  const selection = useBay((state) => state.selection);
  const nodes = useBay((state) => state.nodes);
  const edges = useBay((state) => state.edges);
  const updateNode = useBay((state) => state.updateNode);
  const updateEdge = useBay((state) => state.updateEdge);
  const deleteSelection = useBay((state) => state.deleteSelection);
  const addEdge = useBay((state) => state.addEdge);
  const select = useBay((state) => state.select);

  const node = selection?.kind === "node" ? nodes.find((item) => item.id === selection.id) : undefined;
  const edge = selection?.kind === "edge" ? edges.find((item) => item.id === selection.id) : undefined;

  if (!node && !edge) return null;

  return (
    <aside className="inspector bay-ui float-panel border border-line bg-surface text-ink" aria-label="Details">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">{node ? KIND_LABEL[node.kind] : "Link"}</div>
          <h2 className="truncate font-display text-xl leading-tight">{node ? node.label : edgeLabel(edge!, nodes)}</h2>
        </div>
        <IconButton label="Close details" onClick={() => select(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="inspector-scroll mt-3 flex flex-col gap-3 px-4 pb-4">
        {node ? (
          <NodeForm
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            onUpdate={updateNode}
            onAddEdge={addEdge}
            onDelete={deleteSelection}
          />
        ) : edge ? (
          <EdgeForm edgeId={edge.id} nodes={nodes} onUpdate={updateEdge} onDelete={deleteSelection} />
        ) : null}
      </div>
    </aside>
  );
}

function NodeForm({
  nodeId,
  nodes,
  edges,
  onUpdate,
  onAddEdge,
  onDelete,
}: {
  nodeId: string;
  nodes: ReturnType<typeof useBay.getState>["nodes"];
  edges: ReturnType<typeof useBay.getState>["edges"];
  onUpdate: (id: string, patch: Partial<(typeof nodes)[number]>) => void;
  onAddEdge: (source: string, target: string, label?: string) => void;
  onDelete: () => void;
}) {
  const node = nodes.find((item) => item.id === nodeId);
  const [target, setTarget] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  useEffect(() => {
    setTarget("");
    setLinkLabel("");
  }, [nodeId]);
  if (!node) return null;
  const links = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const others = nodes.filter((item) => item.id !== node.id);

  return (
    <>
      <Field label="Label">
        <input className={controlClass} value={node.label} onChange={(event) => onUpdate(node.id, { label: event.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kind">
          <select className={controlClass} value={node.kind} onChange={(event) => onUpdate(node.id, { kind: event.target.value as Kind })}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={controlClass}
            value={node.status}
            onChange={(event) => onUpdate(node.id, { status: event.target.value as Status })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Address">
        <input className={controlClass} value={node.ip} onChange={(event) => onUpdate(node.id, { ip: event.target.value })} placeholder="10.0.0.1" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="VLAN">
          <input className={controlClass} value={node.vlan} onChange={(event) => onUpdate(node.id, { vlan: event.target.value })} />
        </Field>
        <Field label="MAC">
          <input className={controlClass} value={node.mac} onChange={(event) => onUpdate(node.id, { mac: event.target.value })} />
        </Field>
      </div>
      <Field label="System">
        <input className={controlClass} value={node.os} onChange={(event) => onUpdate(node.id, { os: event.target.value })} />
      </Field>
      <Field label="Ports">
        <input
          className={controlClass}
          value={node.ports.join(", ")}
          onChange={(event) => onUpdate(node.id, { ports: splitList(event.target.value) })}
        />
      </Field>
      <Field label="Tags">
        <input
          className={controlClass}
          value={node.tags.join(", ")}
          onChange={(event) => onUpdate(node.id, { tags: splitList(event.target.value) })}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className="min-h-24 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none"
          value={node.notes}
          onChange={(event) => onUpdate(node.id, { notes: event.target.value })}
        />
      </Field>
      <button
        type="button"
        className="bay-btn inline-flex h-11 items-center gap-2 text-sm text-muted"
        onClick={() => onUpdate(node.id, { pinned: !node.pinned })}
      >
        {node.pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
        {node.pinned ? "Holding position" : "Hold position"}
      </button>
      <div>
        <div className="mb-2 text-xs font-medium text-muted">Links</div>
        <ul className="flex flex-col gap-2">
          {links.map((link) => {
            const otherId = link.source === node.id ? link.target : link.source;
            const other = nodes.find((item) => item.id === otherId);
            return (
              <li key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <button type="button" className="min-w-0 truncate text-left text-sm" onClick={() => useBay.getState().select({ kind: "edge", id: link.id })}>
                  <span className="text-ink">{other?.label ?? otherId}</span>
                  {link.label ? <span className="ml-2 font-mono text-xs text-muted">{link.label}</span> : null}
                </button>
              </li>
            );
          })}
          {links.length === 0 ? <li className="text-sm text-faint">No links yet.</li> : null}
        </ul>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select className={controlClass} value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Link target">
          <option value="">Link to…</option>
          {others.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bay-btn h-11 rounded-lg bg-ink px-3 text-sm font-medium text-canvas disabled:opacity-40"
          disabled={!target}
          onClick={() => {
            onAddEdge(node.id, target, linkLabel.trim());
            setTarget("");
            setLinkLabel("");
          }}
        >
          Add
        </button>
      </div>
      <input
        className={controlClass}
        value={linkLabel}
        onChange={(event) => setLinkLabel(event.target.value)}
        placeholder="Link label"
        aria-label="Link label"
      />
      <p className="font-mono text-xs text-faint">{node.id}</p>
      <button
        type="button"
        className="bay-btn inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm text-fault"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Remove node
      </button>
    </>
  );
}

function EdgeForm({
  edgeId,
  nodes,
  onUpdate,
  onDelete,
}: {
  edgeId: string;
  nodes: ReturnType<typeof useBay.getState>["nodes"];
  onUpdate: (id: string, patch: { label: string }) => void;
  onDelete: () => void;
}) {
  const edge = useBay((state) => state.edges.find((item) => item.id === edgeId));
  if (!edge) return null;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  return (
    <>
      <button type="button" className="h-11 text-left text-sm text-ink" onClick={() => useBay.getState().select({ kind: "node", id: edge.source })}>
        {source?.label ?? edge.source}
      </button>
      <button type="button" className="h-11 text-left text-sm text-ink" onClick={() => useBay.getState().select({ kind: "node", id: edge.target })}>
        {target?.label ?? edge.target}
      </button>
      <Field label="Label">
        <input className={controlClass} value={edge.label} onChange={(event) => onUpdate(edge.id, { label: event.target.value })} />
      </Field>
      <button
        type="button"
        className="bay-btn inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm text-fault"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Remove link
      </button>
    </>
  );
}

function edgeLabel(edge: { source: string; target: string; label: string }, nodes: { id: string; label: string }[]) {
  const name = (id: string) => nodes.find((node) => node.id === id)?.label ?? id;
  return edge.label ? `${name(edge.source)} · ${edge.label}` : `${name(edge.source)} → ${name(edge.target)}`;
}

function splitList(value: string) {
  return value.split(",").map((part) => part.trim());
}
