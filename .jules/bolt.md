
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-05 - Optimize GIS stands mapped metrics in App.tsx
**Learning:** Re-calculating metrics inline like `mapped` and `unmapped` values using `.filter().length` in JSX forces O(2N) extra iterations on every re-render and recomputes unchanged values.
**Action:** Always extract such counts into a single precalculated `useMemo` block that iterates once O(N).
