
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Memoize map event handlers in App.tsx
**Learning:** Passing unstable function references to expensive components (like Leaflet map components `InteractiveLeafletMap`) via props forces massive O(N) layer teardowns and rebuilds on every parent component re-render.
**Action:** Always wrap callback props that are passed to complex mapping or heavy visualization components in `useCallback` to ensure stable references and avoid unnecessary DOM/canvas thrashing.
