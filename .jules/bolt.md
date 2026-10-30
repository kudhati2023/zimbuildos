
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2025-02-18 - [Optimize Inline Array Filtering on Cadastre Telemetry Overlay Badge]
**Learning:** Multiple inline array filter calls (`.filter()`) in React components can lead to unnecessary O(N) operations during rendering, compounding the performance cost as the dataset grows.
**Action:** Extract expensive inline array operations into a `useMemo` block that executes a single pass over the data (`for...of`) and calculates multiple metrics at once, to prevent recalculations on every re-render and significantly improve performance.
