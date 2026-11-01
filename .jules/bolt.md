
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-03-24 - [InteractiveLeafletMap telemetry badge]
**Learning:** Re-rendering expensive mapping logic with redundant O(N) array calculations inside JSX (using `.filter` and `.some`) negatively impacts performance.
**Action:** Always extract metrics (like mapped vs unmapped stands) computed directly on array props into `useMemo` hooks returning an object, rather than calling native array methods within render logic.
