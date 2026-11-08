
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-08 - Memoize inline array operations
**Learning:** Inline chained array operations like `.filter().map()` or multiple `.filter().length` checks in React render functions cause redundant O(N) recalculations on every render. In large list-heavy components like `App.tsx`, this creates noticeable UI lag.
**Action:** Always extract inline array derivations into `useMemo` hooks, and prefer single-pass O(N) loops when deriving multiple related counts (like mapped vs unmapped items) from the same list.
