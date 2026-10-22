
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-10-22 - Extract inline React filtering array operations to useMemo
**Learning:** In the large `App.tsx` component, multiple redundant inline `.filter()` and `.some()` computations on large arrays like `filteredGISStands` inside the JSX render tree lead to O(N) operations happening multiple times per re-render.
**Action:** Always combine and extract these operations into a single-pass `useMemo` hook to calculate related metrics at once (e.g., `withGeometry`, `withoutGeometry`) before returning them for JSX usage, saving CPU cycles on heavy data views.
