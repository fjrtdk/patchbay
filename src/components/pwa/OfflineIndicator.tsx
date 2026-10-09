import React from "react";
import { useOnlineStatus } from "@/lib/pwa/useOnlineStatus";

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-14 left-4 z-50 flex items-center gap-2 rounded-md border border-fault/30 bg-fault/15 px-3 py-1.5 text-xs font-mono text-fault shadow-lg backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-fault animate-pulse" />
      <span>Offline Mode — Cached local topology active</span>
    </div>
  );
};
