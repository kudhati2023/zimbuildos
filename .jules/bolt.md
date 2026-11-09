
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-09 - Combine Multiple Array Filters into Single Pass
**Learning:** Chaining multiple array filter/reduce operations on large arrays within React components can cause unnecessary O(N) recalculations on every render.
**Action:** Use a single-pass loop within a useMemo hook to calculate multiple aggregations at once, preventing redundant array traversals and keeping the component responsive.
