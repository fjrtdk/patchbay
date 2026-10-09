import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Download, X } from "lucide-react";
import { toJson, toYaml } from "@/lib/patchbay/code";
import { startReplay, useBay } from "@/lib/patchbay/model";
import { decorateDiscovery, parseInventory, summary } from "@/lib/patchbay/parse";
import { Button, Field, IconButton, areaClass, controlClass } from "@/components/patchbay/ui";
import { CloudDialog } from "@/components/patchbay/cloud-dialog";

export function BayDialogs() {
  const panel = useBay((state) => state.panel);
  const close = () => useBay.getState().openPanel(null);
  return (
    <>
      <ImportDialog open={panel === "import"} onClose={close} />
      <DiscoverDialog open={panel === "discover"} onClose={close} />
      <CodeDialog open={panel === "code"} onClose={close} />
      <SampleDialog open={panel === "sample"} onClose={close} />
      <CloudDialog open={panel === "cloud"} onClose={close} />
    </>
  );
}

function Shell({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="bay-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bay-dialog float-panel bay-ui fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-line bg-surface p-4 text-ink">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl leading-tight">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-normal text-muted">{description}</Dialog.Description>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const parsed = useMemo(() => (text.trim() ? parseInventory(text) : null), [text]);
  const ready = !!parsed && parsed.nodes.length > 0;

  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Import nodes"
      description="Paste one node or many. JSON and YAML both work: a single object, a list, or a graph with nodes and edges."
    >
      <textarea
        className={areaClass}
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        aria-label="Inventory paste"
        placeholder={"label: nas\nkind: storage\nip: 10.0.20.20\nvia: crs"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="bay-btn inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium">
          Choose files
          <input
            type="file"
            accept=".json,.yaml,.yml,.txt,.xml"
            multiple
            className="sr-only"
            onChange={async (event) => {
              const files = [...(event.target.files ?? [])];
              if (!files.length) return;
              const bodies = await Promise.all(files.map((file) => file.text()));
              setText((prev) => (prev.trim() ? `${prev.trim()}\n---\n${bodies.join("\n---\n")}` : bodies.join("\n---\n")));
              event.target.value = "";
            }}
          />
        </label>
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>
      <p className={`mt-3 text-sm ${parsed && parsed.nodes.length === 0 ? "text-fault" : "text-muted"}`}>
        {parsed ? summary(parsed) : "Nothing pasted yet."}
        {parsed?.warnings.length ? ` ${parsed.warnings[0]}` : ""}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="solid"
          disabled={!ready}
          onClick={() => {
            if (parsed) useBay.getState().applyParsed(parsed, mode);
          }}
        >
          {mode === "merge" ? "Merge" : "Replace"}
        </Button>
      </div>
    </Shell>
  );
}

function DiscoverDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [gateway, setGateway] = useState("");
  const [cidr, setCidr] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return decorateDiscovery(parseInventory(text), { gateway, cidr });
  }, [text, gateway, cidr]);
  const ready = !!parsed && parsed.nodes.length > 0;

  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Network discovery"
      description="A browser cannot ARP-scan your LAN. Paste an nmap greppable or XML dump, an Ansible inventory, a Compose file, or a host list. Or replay the recorded scan of the sample closet."
    >
      <textarea
        className={areaClass}
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        aria-label="Scan paste"
        placeholder={"Host: 10.0.0.1 (opnsense.lan)\tStatus: Up\nHost: 10.0.0.1 (opnsense.lan)\tPorts: 22/open/tcp//ssh///, 443/open/tcp//https///"}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Gateway IP">
          <input className={controlClass} value={gateway} onChange={(event) => setGateway(event.target.value)} placeholder="10.0.0.1" />
        </Field>
        <Field label="CIDR">
          <input className={controlClass} value={cidr} onChange={(event) => setCidr(event.target.value)} placeholder="10.0.0.0/24" />
        </Field>
      </div>
      <div className="mt-3">
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>
      <p className={`mt-3 text-sm ${parsed && parsed.nodes.length === 0 ? "text-fault" : "text-muted"}`}>
        {parsed ? summary(parsed) : "Nothing pasted yet."}
        {parsed?.warnings[0] ? ` ${parsed.warnings[0]}` : ""}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            startReplay();
          }}
        >
          Replay recorded scan
        </Button>
        <Button
          variant="solid"
          disabled={!ready}
          onClick={() => {
            if (parsed) useBay.getState().applyParsed(parsed, mode);
          }}
        >
          Apply scan
        </Button>
      </div>
    </Shell>
  );
}

function CodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useBay((state) => state.name);
  const nodes = useBay((state) => state.nodes);
  const edges = useBay((state) => state.edges);
  const [format, setFormat] = useState<"yaml" | "json">("yaml");
  const [layout, setLayout] = useState(false);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  const serialize = (nextFormat: "yaml" | "json", nextLayout: boolean) =>
    nextFormat === "yaml" ? toYaml(name, nodes, edges, nextLayout) : toJson(name, nodes, edges, nextLayout);

  useEffect(() => {
    if (!open) return;
    setText(serialize(format, layout));
    setDirty(false);
    setMessage("");
    // Refresh from the bay each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Shell
      open={open}
      onClose={onClose}
      title="As code"
      description="The bay is this document. Edit it and apply, or copy it into the repo that describes the closet."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(format === "yaml")} onClick={() => switchFormat("yaml")}>
          YAML
        </button>
        <button type="button" className={chip(format === "json")} onClick={() => switchFormat("json")}>
          JSON
        </button>
        <label className="inline-flex h-11 items-center gap-2 px-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={layout}
            onChange={(event) => {
              const next = event.target.checked;
              setLayout(next);
              if (!dirty) setText(serialize(format, next));
            }}
          />
          Include layout
        </label>
      </div>
      <textarea
        className={areaClass}
        value={text}
        spellCheck={false}
        aria-label="Graph source"
        onChange={(event) => {
          setText(event.target.value);
          setDirty(true);
          setMessage("");
        }}
      />
      {message ? <p className="mt-3 text-sm text-fault">{message}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(text);
          }}
        >
          <Copy className="size-4" />
          Copy
        </Button>
        <Button
          onClick={() => {
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = format === "yaml" ? "patchbay.yaml" : "patchbay.json";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="size-4" />
          Download
        </Button>
        <Button
          variant="solid"
          onClick={() => {
            const parsed = parseInventory(text);
            if (!parsed.nodes.length) {
              setMessage(parsed.warnings[0] ?? "No nodes in that document.");
              return;
            }
            useBay.getState().applyParsed(parsed, "replace");
          }}
        >
          Apply
        </Button>
      </div>
    </Shell>
  );

  function switchFormat(next: "yaml" | "json") {
    setFormat(next);
    if (!dirty) setText(serialize(next, layout));
  }

  function chip(active: boolean) {
    return `bay-btn h-11 rounded-lg px-3 text-sm font-medium ${active ? "bg-ink text-canvas" : "border border-line bg-surface text-ink"}`;
  }
}

function SampleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Sample closet"
      description="Replace the bay with the North rack: a firewall, core switch, four VLANs, and the services behind them."
    >
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="solid"
          onClick={() => {
            useBay.getState().loadSample();
          }}
        >
          Load sample
        </Button>
      </div>
    </Shell>
  );
}

function ModeSwitch({ mode, onChange }: { mode: "merge" | "replace"; onChange: (mode: "merge" | "replace") => void }) {
  return (
    <div className="inline-flex rounded-xl border border-line p-1">
      <button type="button" className={modeChip(mode === "merge")} onClick={() => onChange("merge")}>
        Merge
      </button>
      <button type="button" className={modeChip(mode === "replace")} onClick={() => onChange("replace")}>
        Replace
      </button>
    </div>
  );
}

function modeChip(active: boolean) {
  return `h-11 rounded-lg px-3 text-sm ${active ? "bg-elevated text-ink" : "text-muted"}`;
}
