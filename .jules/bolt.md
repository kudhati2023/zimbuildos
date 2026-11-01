
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-11-01 - Optimize filteredGISStands rendering logic
**Learning:** Inline array methods like `.filter()` or `.some()` called directly in the JSX block result in repetitive O(N) evaluations that run every time the component renders. For `filteredGISStands`, which was already derived via `useMemo`, traversing the array again in the render block for telemetry is unoptimal.
**Action:** Use a single `useMemo` hook to calculate and aggregate all multiple metrics (like mapped and unmapped counts) from derived lists with just one O(N) pass, then reference these pre-calculated primitives in the render block.
