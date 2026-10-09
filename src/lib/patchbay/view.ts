type ViewApi = {
  zoomBy: (factor: number) => void;
  fit: () => void;
  center: () => { x: number; y: number };
};

let api: ViewApi | null = null;

export function bindView(next: ViewApi | null) {
  api = next;
}

export function zoomBy(factor: number) {
  api?.zoomBy(factor);
}

export function fitView() {
  api?.fit();
}

export function viewCenter() {
  return api?.center() ?? { x: 0, y: 0 };
}
