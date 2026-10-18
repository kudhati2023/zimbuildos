
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-05-15 - Extract expensive inline array operations to useMemo hooks
**Learning:** Performing multiple chained `.filter().map()` operations directly in JSX leads to significant performance degradation during React re-renders, especially when dealing with data lists like `stands`, `applications`, or `inquiries`.
**Action:** Extract list-filtering logic into `useMemo` hooks (e.g. `availableStands`) and combine multiple passes over the same dataset into single O(N) loops. This prevents redundant operations and ensures recalculations only occur when dependencies actually change.
