
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2024-05-18 - [Cache Derived Counts]
**Learning:** Inline array operations (`.filter().length` and `.reduce()`) in React components cause redundant O(N) recalculations on every render cycle.
**Action:** Use `useMemo` hooks to cache derived counts and metrics, preventing unnecessary computation when dependencies (`fleet`, `summary`) have not changed.
