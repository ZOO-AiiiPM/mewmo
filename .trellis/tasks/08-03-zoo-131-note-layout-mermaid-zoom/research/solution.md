# Pan/Zoom Solution Research

## Candidates

- [`@panzoom/panzoom`](https://github.com/timmywil/panzoom): 2.4k stars, 2026-07 active, about 3.7 KB gzip, native SVG/Pointer Events/pinch support.
- [`react-zoom-pan-pinch`](https://github.com/BetterTyped/react-zoom-pan-pinch): 1.9k stars, 2026-08 active, React component/context API and larger package surface.
- [`d3-zoom`](https://d3js.org/d3-zoom): mature SVG/HTML/canvas zoom behavior with extensive constraints, but introduces D3 selection/event concepts beyond this use case.

## Decision

Use `@panzoom/panzoom`. Milkdown creates preview DOM outside React, so a small DOM-first library fits directly and avoids a parallel React render tree. It supports the required pinch and drag behavior without implementing browser gesture edge cases locally.
