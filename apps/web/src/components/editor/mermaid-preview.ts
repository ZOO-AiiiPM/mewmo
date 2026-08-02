type Mermaid = (typeof import("mermaid"))["default"];
type MermaidApi = {
  initialize: (config: Parameters<Mermaid["initialize"]>[0]) => void;
  render: (id: string, content: string) => Promise<{ svg: string }>;
};

type MermaidModule = { default: MermaidApi };
type PreviewValue = string | HTMLElement | null;
type ApplyPreview = (value: PreviewValue) => void;

interface MermaidPreviewDependencies {
  loadMermaid?: () => Promise<MermaidModule>;
  createId?: () => string;
  createErrorPreview?: () => HTMLElement;
}

let renderId = 0;

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
        if (currentGeneration === generation) applyPreview(svg);
      })
      .catch(() => {
        if (currentGeneration === generation) applyPreview(makeErrorPreview());
      });

    return undefined;
  };
}

export const renderMermaidPreview = createMermaidPreviewRenderer();
