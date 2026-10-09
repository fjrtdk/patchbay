import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BayCanvas } from "@/components/patchbay/canvas";
import { BayChrome } from "@/components/patchbay/chrome";
import { BayDialogs } from "@/components/patchbay/dialogs";
import { Inspector } from "@/components/patchbay/inspector";
import { hydrateBay } from "@/lib/patchbay/model";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  useEffect(() => {
    hydrateBay();
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-canvas text-ink">
      <BayCanvas />
      <BayChrome />
      <Inspector />
      <BayDialogs />
    </main>
  );
}
