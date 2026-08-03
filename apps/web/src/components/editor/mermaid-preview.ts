type Mermaid = (typeof import("mermaid"))["default"];
type MermaidApi = {
  initialize: (config: Parameters<Mermaid["initialize"]>[0]) => void;
  render: (id: string, content: string) => Promise<{ svg: string }>;
};

type MermaidModule = { default: MermaidApi };
type PreviewValue = string | HTMLElement | null;
type ApplyPreview = (value: PreviewValue) => void;
type PanzoomFactory = (typeof import("@panzoom/panzoom"))["default"];
type PanzoomInstance = ReturnType<PanzoomFactory>;

interface MermaidPreviewDependencies {
  loadMermaid?: () => Promise<MermaidModule>;
  createId?: () => string;
  createErrorPreview?: () => HTMLElement;
}

let renderId = 0;
let panzoomPromise: Promise<PanzoomFactory> | undefined;

function createRenderId() {
  renderId += 1;
  return `mewmo-mermaid-${renderId}`;
}

function createErrorPreview() {
  const error = document.createElement("div");
  error.className = "mewmo-mermaid-error";
  error.textContent = "Mermaid 图表无法渲染，请检查语法";
  return error;
}

export function wrapMermaidPreview(svg: string) {
  return `<div class="mewmo-mermaid-canvas">${svg}</div>`;
}

export function shouldZoomMermaidWithWheel(event: Pick<WheelEvent, "ctrlKey">) {
  return event.ctrlKey;
}

export function enableMermaidPreviewInteractions(root: HTMLElement) {
  const instances = new Map<HTMLElement, {
    panzoom: PanzoomInstance;
    wheel: (event: WheelEvent) => void;
  }>();
  let disposed = false;

  const removeDetachedInstances = () => {
    for (const [canvas, { panzoom, wheel }] of instances) {
      if (root.contains(canvas)) continue;
      canvas.removeEventListener("wheel", wheel);
      panzoom.destroy();
      instances.delete(canvas);
    }
  };

  const setup = async () => {
    removeDetachedInstances();
    const canvases = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".mewmo-mermaid-canvas:not([data-panzoom-ready])",
      ),
    );
    if (!canvases.length) return;

    for (const canvas of canvases) canvas.dataset.panzoomReady = "loading";
    let Panzoom: PanzoomFactory;
    try {
      panzoomPromise ??= import("@panzoom/panzoom").then(
        ({ default: factory }) => factory,
      );
      Panzoom = await panzoomPromise;
    } catch {
      panzoomPromise = undefined;
      for (const canvas of canvases) delete canvas.dataset.panzoomReady;
      return;
    }
    if (disposed) return;

    for (const canvas of canvases) {
      if (!root.contains(canvas)) continue;
      const svg = canvas.querySelector<SVGElement>(":scope > svg");
      if (!svg) {
        delete canvas.dataset.panzoomReady;
        continue;
      }

      const panzoom = Panzoom(svg, {
        canvas: true,
        maxScale: 5,
        minScale: 1,
        panOnlyWhenZoomed: true,
        pinchAndPan: true,
        step: 0.18,
      });
      const wheel = (event: WheelEvent) => {
        if (!shouldZoomMermaidWithWheel(event)) return;
        event.preventDefault();
        panzoom.zoomWithWheel(event);
      };
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.dataset.panzoomReady = "true";
      instances.set(canvas, { panzoom, wheel });
    }
  };

  const observer = new MutationObserver(() => void setup());
  observer.observe(root, { childList: true, subtree: true });
  void setup();

  return () => {
    disposed = true;
    observer.disconnect();
    for (const [canvas, { panzoom, wheel }] of instances) {
      canvas.removeEventListener("wheel", wheel);
      panzoom.destroy();
    }
    instances.clear();
  };
}

export function createMermaidPreviewRenderer(
  dependencies: MermaidPreviewDependencies = {},
) {
  const loadMermaid = dependencies.loadMermaid ?? (() => import("mermaid"));
  const nextId = dependencies.createId ?? createRenderId;
  const makeErrorPreview =
    dependencies.createErrorPreview ?? createErrorPreview;
  let generation = 0;
  let mermaidPromise: Promise<MermaidApi> | undefined;

  const getMermaid = () => {
    mermaidPromise ??= loadMermaid().then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "base",
      });
      return mermaid;
    });
    return mermaidPromise;
  };

  return (language: string, content: string, applyPreview: ApplyPreview) => {
    const isMermaid = language.trim().toLowerCase() === "mermaid";
    if (!isMermaid || !content.trim()) {
      generation += 1;
      return null;
    }

    const currentGeneration = ++generation;
    void getMermaid()
      .then((mermaid) => mermaid.render(nextId(), content))
      .then(({ svg }) => {
        if (currentGeneration === generation) {
          applyPreview(wrapMermaidPreview(svg));
        }
      })
      .catch(() => {
        if (currentGeneration === generation) applyPreview(makeErrorPreview());
      });

    return undefined;
  };
}

export const renderMermaidPreview = createMermaidPreviewRenderer();
