
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-10 - Optimize multiple inline filter and mapping operations in App.tsx
**Learning:** Re-evaluating multiple inline chained array operations (like `.filter()`, `.some()`) during React renders causes unnecessary performance overhead, especially on larger datasets.
**Action:** Use `useMemo` and extract chained/repeated array operations into a single pass O(N) loop or memoized values.
