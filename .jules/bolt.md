
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-03-04 - Optimize filteredGISStands filtering in App.tsx
**Learning:** Re-renders using inline chained `.filter()` and `.some()` operations on data in JSX rendering significantly hurts frontend performance by allocating multiple arrays and iteratively looping to retrieve sizes.
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
