import { describe, expect, it, vi } from "vitest";
import {
  createMermaidPreviewRenderer,
  shouldZoomMermaidWithWheel,
  wrapMermaidPreview,
} from "./mermaid-preview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createMermaid(render = vi.fn(async () => ({ svg: "<svg />" }))) {
  return {
    initialize: vi.fn(),
    render,
  };
}

describe("Mermaid code-block preview", () => {
  it("bypasses other languages and empty Mermaid blocks without loading Mermaid", () => {
    const loadMermaid = vi.fn();
    const applyPreview = vi.fn();
    const renderPreview = createMermaidPreviewRenderer({ loadMermaid });

    expect(renderPreview("typescript", "const x = 1", applyPreview)).toBeNull();
    expect(renderPreview("", "plain text", applyPreview)).toBeNull();
    expect(renderPreview(" Mermaid ", "   ", applyPreview)).toBeNull();
    expect(loadMermaid).not.toHaveBeenCalled();
    expect(applyPreview).not.toHaveBeenCalled();
  });

  it("loads and strictly initializes Mermaid once before rendering previews", async () => {
    const mermaid = createMermaid();
    const loadMermaid = vi.fn(async () => ({ default: mermaid }));
    const applyPreview = vi.fn();
    const renderPreview = createMermaidPreviewRenderer({
      createId: () => "diagram-id",
      loadMermaid,
    });

    expect(
      renderPreview("MERMAID", "flowchart LR\nA-->B", applyPreview),
    ).toBeUndefined();
    await vi.waitFor(() =>
      expect(applyPreview).toHaveBeenCalledWith(
        '<div class="mewmo-mermaid-canvas"><svg /></div>',
      ),
    );
    renderPreview("mermaid", "sequenceDiagram\nA->>B: Hi", applyPreview);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));

    expect(loadMermaid).toHaveBeenCalledTimes(1);
    expect(mermaid.initialize).toHaveBeenCalledOnce();
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        suppressErrorRendering: true,
      }),
    );
    expect(mermaid.render).toHaveBeenCalledWith(
      "diagram-id",
      "flowchart LR\nA-->B",
    );
  });

  it("shows a safe local error and recovers after a valid edit", async () => {
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error("<img src=x onerror=alert(1)>"))
      .mockResolvedValueOnce({ svg: "<svg>recovered</svg>" });
    const mermaid = createMermaid(render);
    const safeError = {
      textContent: "Mermaid 图表无法渲染，请检查语法",
    } as HTMLElement;
    const applyPreview = vi.fn();
    const renderPreview = createMermaidPreviewRenderer({
      createErrorPreview: () => safeError,
      loadMermaid: async () => ({ default: mermaid }),
    });

    renderPreview("mermaid", "not valid", applyPreview);
    await vi.waitFor(() =>
      expect(applyPreview).toHaveBeenCalledWith(safeError),
    );
    expect(safeError.textContent).not.toContain("onerror");

    renderPreview("mermaid", "flowchart LR\nA-->B", applyPreview);
    await vi.waitFor(() =>
      expect(applyPreview).toHaveBeenLastCalledWith(
        '<div class="mewmo-mermaid-canvas"><svg>recovered</svg></div>',
      ),
    );
  });

  it("renders every Mermaid block instead of starving earlier previews", async () => {
    const first = deferred<{ svg: string }>();
    const second = deferred<{ svg: string }>();
    const render = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const applyFirstPreview = vi.fn();
    const applySecondPreview = vi.fn();
    const renderPreview = createMermaidPreviewRenderer({
      createErrorPreview: () => ({}) as HTMLElement,
      loadMermaid: async () => ({ default: createMermaid(render) }),
    });

    renderPreview("mermaid", "flowchart LR\nA-->B", applyFirstPreview);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    renderPreview("mermaid", "flowchart LR\nC-->D", applySecondPreview);
    expect(render).toHaveBeenCalledTimes(1);

    first.resolve({ svg: "<svg>first</svg>" });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(applyFirstPreview).toHaveBeenCalledWith(
      '<div class="mewmo-mermaid-canvas"><svg>first</svg></div>',
    );

    second.resolve({ svg: "<svg>new</svg>" });
    await vi.waitFor(() =>
      expect(applySecondPreview).toHaveBeenCalledWith(
        '<div class="mewmo-mermaid-canvas"><svg>new</svg></div>',
      ),
    );

    expect(applyFirstPreview).toHaveBeenCalledTimes(1);
    expect(applySecondPreview).toHaveBeenCalledTimes(1);
  });

  it("applies newer edits last and clears a pending preview after language changes", async () => {
    const first = deferred<{ svg: string }>();
    const render = vi.fn().mockReturnValueOnce(first.promise);
    const applyPreview = vi.fn();
    const renderPreview = createMermaidPreviewRenderer({
      loadMermaid: async () => ({ default: createMermaid(render) }),
    });

    renderPreview("mermaid", "flowchart LR\nA-->B", applyPreview);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(renderPreview("text", "plain", applyPreview)).toBeNull();

    first.resolve({ svg: "<svg>old</svg>" });
    await vi.waitFor(() => expect(applyPreview).toHaveBeenLastCalledWith(null));
  });

  it("wraps SVG for post-sanitize interactions", () => {
    expect(wrapMermaidPreview("<svg>diagram</svg>")).toBe(
      '<div class="mewmo-mermaid-canvas"><svg>diagram</svg></div>',
    );
  });

  it("uses pinch wheel events without hijacking ordinary scrolling", () => {
    expect(shouldZoomMermaidWithWheel({ ctrlKey: true })).toBe(true);
    expect(shouldZoomMermaidWithWheel({ ctrlKey: false })).toBe(false);
  });
});
