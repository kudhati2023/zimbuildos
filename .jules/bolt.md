
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-10-19 - Optimize Map Telemetry Badge re-renders in App.tsx
**Learning:** Having inline operations such as `.filter()` and `.some()` in the return statement (JSX rendering block) causes them to be re-executed entirely on every single component re-render (e.g. O(3N) here for `filteredGISStands`).
**Action:** Extract repetitive rendering metrics calculations into `useMemo` hooks and compute them in a single O(N) loop.
