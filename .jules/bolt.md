
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-05 - Memoize event handlers to prevent heavy map re-renders
**Learning:** Passing unmemoized functions (like inline arrow functions or unmemoized variables) to heavy components like `InteractiveLeafletMap` triggers expensive complete re-renders of the component (e.g. Leaflet redrawing all polygon layers) on every parent component render.
**Action:** Extract inline callbacks and use `useCallback` to memoize event handlers passed to heavy UI components. Always explicitly include all referenced state setters in the dependency array to prevent stale closures.
