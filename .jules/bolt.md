
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-03-04 - Optimize filteredGISStands geometry counts in App.tsx
**Learning:** Re-renders using multiple `.some()` and `.filter().length` checks on `filteredGISStands` execute redundant O(N) loops on every component render in the frontend map view.
**Action:** Extract inline array iterations for derived state into a single pass O(N) loop cached using `useMemo` hooks.
