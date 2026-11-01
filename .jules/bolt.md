
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-03-04 - Optimize GIS Stands Metrics in App.tsx
**Learning:** Performing multiple chained array iterations (`.filter(s => s.geometry).length`, `.some()`, and `.filter(s => !s.geometry).length`) directly in JSX during the render cycle causes redundant O(N) operations, hurting frontend performance.
**Action:** Always combine and precalculate shared metrics or counts in a single O(N) pass using `useMemo` hooks, then consume the precalculated results in JSX.
