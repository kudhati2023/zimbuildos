
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-11 - Optimize fleet filter lengths in PlantPanel
**Learning:** Extracting multiple inline O(N) array filter iterations into a single useMemo pass improves performance on every render cycle.
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using useMemo hooks.
