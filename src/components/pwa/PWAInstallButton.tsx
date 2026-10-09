import React, { useState } from "react";
import { usePWAInstall } from "@/lib/pwa/usePWAInstall";
import { Smartphone, Download, X } from "lucide-react";

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  // Chromium / Android / Desktop flow with beforeinstallprompt
  if (isInstallable) {
    return (
      <button
        onClick={handleInstall}
        disabled={installing}
        title={isAndroid ? "Install Android App" : "Install App"}
        className="flex items-center gap-1.5 rounded-md border border-sage/30 bg-surface/80 px-2.5 py-1 text-xs font-mono text-sage hover:bg-elevated hover:text-ink transition-colors shadow-sm"
      >
        {isAndroid ? <Smartphone className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
        <span>{compact ? "Install" : isAndroid ? "Install Android App" : "Install App"}</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface/80 px-2.5 py-1 text-xs font-mono text-muted hover:text-ink transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{compact ? "Install" : "Install App"}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl text-ink">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-sm font-semibold tracking-wide">Install on Home Screen</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-muted hover:text-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs text-muted leading-relaxed font-sans">
                <div className="flex gap-2.5 items-start">
                  <span className="flex-none w-5 h-5 rounded-full bg-elevated border border-line flex items-center justify-center text-[10px] text-ink font-mono font-bold">1</span>
                  <p>Tap the <strong>Share</strong> button in Safari toolbar.</p>
                </div>
                <div className="flex gap-2.5 items-start">
                  <span className="flex-none w-5 h-5 rounded-full bg-elevated border border-line flex items-center justify-center text-[10px] text-ink font-mono font-bold">2</span>
                  <p>Scroll down and select <strong>Add to Home Screen</strong>.</p>
                </div>
                <div className="flex gap-2.5 items-start">
                  <span className="flex-none w-5 h-5 rounded-full bg-elevated border border-line flex items-center justify-center text-[10px] text-ink font-mono font-bold">3</span>
                  <p>Launch <strong>Patchbay</strong> anytime with standalone fullscreen UI and offline access.</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-md border border-line bg-elevated py-1.5 text-xs font-mono text-ink hover:bg-line transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for Android browsers before prompt fires
  return (
    <button
      onClick={() => alert("To install Patchbay on Android:\n1. Open browser menu (⋮)\n2. Tap 'Install app' or 'Add to Home screen'")}
      className="flex items-center gap-1.5 rounded-md border border-line bg-surface/80 px-2.5 py-1 text-xs font-mono text-muted hover:text-ink transition-colors"
      title="Install on Android"
    >
      <Smartphone className="w-3.5 h-3.5" />
      <span>{compact ? "Install" : "Install App"}</span>
    </button>
  );
};
