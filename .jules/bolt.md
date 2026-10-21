
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2025-02-18 - Extracting Expensive Array Operations from JSX

**Learning:** When performing metrics counting on filtered datasets within React components, calling `.filter()` or `.some()` multiple times directly inside JSX rendering blocks results in redundant O(N) loop executions during every render phase.
**Action:** Extract these calculations into single-pass O(N) loops wrapped in `useMemo` hooks. This combines the iteration logic into a single structure and only recalculates when dependencies change, improving render performance for large datasets.
