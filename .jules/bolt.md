
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-07 - Optimize fleet mapping in PlantPanel.tsx
**Learning:** Re-renders using inline chained `.filter().length` operations on array data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(3N) loops in PlantPanel.tsx on `fleet`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
