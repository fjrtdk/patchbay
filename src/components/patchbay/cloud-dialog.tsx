import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cloud,
  Check,
  Trash2,
  Download,
  UploadCloud,
  LogOut,
  RefreshCw,
  X,
  Smartphone,
  Database,
} from "lucide-react";
import { useFirebase } from "@/lib/firebase/context";
import { useBay } from "@/lib/patchbay/model";
import { IconButton } from "@/components/patchbay/ui";
import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";

export function CloudDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    user,
    loading,
    error,
    signIn,
    signOut,
    isSyncing,
    lastSyncedAt,
    syncCurrentTopology,
    savedTopologies,
    loadTopology,
    deleteTopology,
    refreshSavedTopologies,
  } = useFirebase();

  const currentName = useBay((state) => state.name);
  const nodeCount = useBay((state) => state.nodes.length);
  const edgeCount = useBay((state) => state.edges.length);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSync = async () => {
    try {
      await syncCurrentTopology();
      setSuccessMessage("Network topology synced to Cloud Database!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      // Error handled in context
    }
  };

  const handleLoad = (topology: (typeof savedTopologies)[0]) => {
    loadTopology(topology);
    setSuccessMessage(`Loaded "${topology.name}" into workspace`);
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 1000);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="bay-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bay-dialog float-panel bay-ui fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto rounded-3xl border border-line bg-surface p-5 text-ink">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Cloud className="size-5 text-sage" />
                <Dialog.Title className="font-display text-xl leading-tight">
                  Cloud Database & Auth
                </Dialog.Title>
              </div>
              <Dialog.Description className="mt-1 text-xs text-muted">
                Persistent Firestore database & Google authentication for homelab topologies.
              </Dialog.Description>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-fault/30 bg-fault/15 p-3 text-xs text-fault">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-sage/40 bg-sage/15 p-3 text-xs text-sage">
              <Check className="size-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Auth section */}
          {!user ? (
            <div className="rounded-2xl border border-line bg-canvas p-4 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-line bg-surface">
                <Database className="size-5 text-muted" />
              </div>
              <h3 className="mt-2.5 font-display text-base text-ink">Sign in to sync your homelab</h3>
              <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                Connect your account to store topologies, link networks, and persist devices to the cloud database across devices and Android app.
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loading}
                  onClick={signIn}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface hover:bg-elevated px-4 py-2.5 text-xs font-mono font-medium text-ink transition shadow-sm"
                >
                  <svg className="size-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Profile Card */}
              <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="size-9 rounded-full border border-line object-cover"
                    />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-xs font-mono font-bold text-sage">
                      {user.displayName?.[0] || user.email?.[0] || "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-ink">
                      {user.displayName || "Homelab Operator"}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted">{user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={signOut}
                    title="Sign Out"
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-mono text-muted hover:text-fault hover:border-fault/30 transition"
                  >
                    <LogOut className="size-3.5" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </div>
              </div>

              {/* Sync Current Topology */}
              <div className="rounded-2xl border border-line bg-canvas p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-ink">Active Diagram: {currentName}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {nodeCount} nodes · {edgeCount} links
                      {lastSyncedAt && ` · Synced ${lastSyncedAt.toLocaleTimeString()}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleSync}
                    className="flex items-center gap-1.5 rounded-lg border border-sage/40 bg-surface px-3 py-1.5 text-xs font-mono font-medium text-sage hover:bg-elevated hover:text-ink transition"
                  >
                    {isSyncing ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="size-3.5" />
                    )}
                    <span>{isSyncing ? "Saving..." : "Save to Cloud"}</span>
                  </button>
                </div>
              </div>

              {/* Saved Topologies in Cloud */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Database className="size-3.5" />
                    <span>Saved in Firestore ({savedTopologies.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshSavedTopologies()}
                    className="text-[11px] font-mono text-faint hover:text-muted"
                  >
                    Refresh
                  </button>
                </div>

                {savedTopologies.length === 0 ? (
                  <div className="rounded-xl border border-line bg-canvas/50 p-4 text-center font-mono text-xs text-faint">
                    No saved topologies in cloud database yet. Click "Save to Cloud" above to save your first network map.
                  </div>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {savedTopologies.map((top) => (
                      <div
                        key={top.id}
                        className="flex items-center justify-between rounded-xl border border-line bg-canvas p-2.5 transition hover:border-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-ink">{top.name}</div>
                          <div className="font-mono text-[10px] text-muted">
                            {top.nodes?.length || 0} nodes · {top.edges?.length || 0} links
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoad(top)}
                            className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-mono text-ink hover:bg-elevated"
                            title="Load diagram"
                          >
                            <Download className="size-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTopology(top.id)}
                            className="rounded-md border border-line bg-surface p-1 text-muted hover:text-fault hover:border-fault/30"
                            title="Delete diagram"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Android App & PWA Section */}
          <div className="mt-4 rounded-2xl border border-line bg-canvas p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Smartphone className="size-4.5 text-sage mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-medium text-ink">Android & Mobile Application</div>
                  <p className="mt-0.5 text-[11px] text-muted leading-relaxed">
                    Install Patchbay as a standalone Android app with offline caching, home screen shortcut, and full canvas gestures.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <PWAInstallButton compact={false} />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
