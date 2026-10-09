import { useEffect, type ReactNode } from "react";
import {
  Cloud,
  FileCode,
  Flame,
  Library,
  Link2,
  LocateFixed,
  Plus,
  Radar,
  Search,
  Snowflake,
  Upload,
  User as UserIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useBay } from "@/lib/patchbay/model";
import { matchesQuery } from "@/lib/patchbay/types";
import { fitView, zoomBy } from "@/lib/patchbay/view";
import { useFirebase } from "@/lib/firebase/context";
import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";

export function BayChrome() {
  const { user } = useFirebase();
  const name = useBay((state) => state.name);
  const nodes = useBay((state) => state.nodes);
  const edges = useBay((state) => state.edges);
  const query = useBay((state) => state.query);
  const setQuery = useBay((state) => state.setQuery);
  const cycleMatch = useBay((state) => state.cycleMatch);
  const frozen = useBay((state) => state.frozen);
  const simulating = useBay((state) => state.simulating);
  const linkMode = useBay((state) => state.linkMode);
  const selection = useBay((state) => state.selection);
  const scanLines = useBay((state) => state.scanLines);
  const scanActive = useBay((state) => state.scanActive);
  const openPanel = useBay((state) => state.openPanel);
  const toggleFreeze = useBay((state) => state.toggleFreeze);
  const reheat = useBay((state) => state.reheat);
  const toggleLink = useBay((state) => state.toggleLink);
  const addNode = useBay((state) => state.addNode);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("bay-search")?.focus();
      }
      if ((event.key === "f" || event.key === "F") && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        fitView();
      }
      if (event.key === "Escape") {
        useBay.getState().select(null);
        if (useBay.getState().linkMode) useBay.getState().toggleLink();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = query.trim();
  const matches = trimmed ? nodes.filter((node) => matchesQuery(node, trimmed)).length : nodes.length;
  const phase = frozen ? "Frozen" : simulating ? "Simulating" : "Settled";

  return (
    <div className="bay-ui pointer-events-none absolute inset-0">
      <header className="topbar pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-3 md:pl-44">
        <div className="pointer-events-auto rounded-2xl border border-line bg-surface px-3 py-2">
          <div className="font-display text-lg leading-none text-ink">Patchbay</div>
          <div className="mt-1 font-mono text-xs text-muted">homelab as code</div>
        </div>
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-2">
          <Search className="ml-1 size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            id="bay-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                cycleMatch(event.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search the bay"
            aria-label="Search nodes"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <span className="shrink-0 pr-2 font-mono text-xs text-muted tabular-nums">
            {trimmed ? `${matches}/${nodes.length}` : nodes.length}
          </span>
        </div>
        <div className="pointer-events-auto hidden rounded-2xl border border-line bg-surface px-3 py-2 sm:block">
          <div className="font-mono text-xs text-faint">{name}</div>
          <div className="text-sm text-ink tabular-nums">
            {nodes.length} nodes · {edges.length} links
          </div>
          <div className="text-xs text-muted">{phase}</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          <PWAInstallButton compact={true} />
          <button
            type="button"
            onClick={() => openPanel("cloud")}
            className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-1 text-xs font-mono text-ink hover:bg-elevated transition"
            title={user ? "Cloud Database & Account" : "Sign in to sync with Cloud"}
          >
            {user ? (
              <>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <UserIcon className="size-4 text-sage" />
                )}
                <span className="hidden lg:inline text-xs truncate max-w-24">
                  {user.displayName?.split(" ")[0] || "Account"}
                </span>
                <span className="size-2 rounded-full bg-sage" title="Cloud Active" />
              </>
            ) : (
              <>
                <Cloud className="size-4 text-muted" />
                <span className="hidden sm:inline">Sign in</span>
              </>
            )}
          </button>
        </div>
      </header>

      {linkMode ? (
        <p className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          Drag from one node to another
        </p>
      ) : null}

      <nav aria-label="Graph controls" className={`dock pointer-events-auto ${selection ? "dock-raised" : ""}`}>
        <div className="dock-scroll float-panel rounded-2xl border border-line bg-surface p-2">
          <DockButton label="Add" onClick={addNode}>
            <Plus className="size-4" />
          </DockButton>
          <DockButton label="Cloud" onClick={() => openPanel("cloud")}>
            <Cloud className="size-4 text-sage" />
          </DockButton>
          <DockButton label="Import" onClick={() => openPanel("import")}>
            <Upload className="size-4" />
          </DockButton>
          <DockButton label="Discover" onClick={() => openPanel("discover")}>
            <Radar className="size-4" />
          </DockButton>
          <DockButton label="Code" onClick={() => openPanel("code")}>
            <FileCode className="size-4" />
          </DockButton>
          <DockButton label="Sample" onClick={() => openPanel("sample")}>
            <Library className="size-4" />
          </DockButton>
          <DockButton label="Link" pressed={linkMode} onClick={toggleLink}>
            <Link2 className="size-4" />
          </DockButton>
          <DockButton label={frozen ? "Frozen" : "Freeze"} pressed={frozen} onClick={toggleFreeze}>
            <Snowflake className="size-4" />
          </DockButton>
          <DockButton label="Reheat" onClick={reheat}>
            <Flame className="size-4" />
          </DockButton>
          <DockButton label="Fit" onClick={() => fitView()}>
            <LocateFixed className="size-4" />
          </DockButton>
          <DockButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            <ZoomOut className="size-4" />
          </DockButton>
          <DockButton label="Zoom in" onClick={() => zoomBy(1.2)}>
            <ZoomIn className="size-4" />
          </DockButton>
        </div>
      </nav>

      {nodes.length === 0 && !scanActive ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
          <div className="pointer-events-auto max-w-sm text-center">
            <h2 className="font-display text-2xl text-ink">The bay is empty</h2>
            <p className="mt-2 text-sm text-muted">Import a manifest, paste a discovery scan, or load the sample closet.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="bay-btn h-11 rounded-lg bg-ink px-3 text-sm font-medium text-canvas" onClick={() => openPanel("import")}>
                Import
              </button>
              <button type="button" className="bay-btn h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink" onClick={() => openPanel("discover")}>
                Discover
              </button>
              <button type="button" className="bay-btn h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink" onClick={() => openPanel("sample")}>
                Sample
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scanLines.length > 0 ? (
        <section className="scan-log pointer-events-auto rounded-2xl border border-line bg-surface p-3" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium text-muted">Discovery</h2>
            <button type="button" className="h-11 px-2 text-xs text-faint" onClick={() => useBay.setState({ scanLines: [], scanActive: false })}>
              Dismiss
            </button>
          </div>
          <ol className="space-y-1 font-mono text-xs text-ink">
            {scanLines.slice(-6).map((line, index) => (
              <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function DockButton({
  label,
  pressed = false,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`bay-btn flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border md:w-auto md:justify-start md:px-3 ${
        pressed ? "border-sage bg-ink text-canvas" : "border-line bg-surface text-ink"
      }`}
    >
      {children}
      <span className="hidden text-sm font-medium md:inline">{label}</span>
    </button>
  );
}
