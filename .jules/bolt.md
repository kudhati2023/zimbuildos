
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize React GIS map metrics and CRM logic mapping
**Learning:** Re-renders using inline chained array operations (`.filter().length` and `.some()`) on complex or large state variables inside UI badge blocks or forms can trigger O(N) performance bottlenecks in large datasets like GIS layers, degrading React performance significantly.
**Action:** Always pre-calculate derived logic using `useMemo` hooks, mapping simple inline array metrics and collections efficiently into memoized single O(N) operations to avoid repeated re-evaluations during React rendering loops.
