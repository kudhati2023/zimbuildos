
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2025-05-18 - Optimize map interaction callbacks in App.tsx
**Learning:** Re-renders using inline functions passed to heavy components like `InteractiveLeafletMap` cause expensive child elements (like map polygons) to tear down and rebuild on every parent re-render, hurting map interactivity performance.
**Action:** Always wrap callback props to expensive child components (like `InteractiveLeafletMap`) in `useCallback`, ensuring correct dependency arrays (or using functional state updates) to prevent unnecessary re-renders without introducing stale closures.
