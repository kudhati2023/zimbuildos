
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-05 - Memoize multiple O(N) array operations in JSX
**Learning:** Performing multiple inline `.filter()` and `.some()` calls on the same array directly within a JSX component's render method causes redundant O(N) loops during every re-render.
**Action:** Extract related array metric calculations into a single `useMemo` hook that iterates over the data once (O(N)), passing the precalculated metrics down to the JSX.
