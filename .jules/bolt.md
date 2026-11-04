
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize array operations in App.tsx
**Learning:** Performing array filtering in JSX maps (e.g. `array.filter(..).map(..)`) forces redundant, unmemoized calculations on every single render.
**Action:** Extract expensive inline operations, such as filtering, into `useMemo` hooks before the JSX return to calculate them only when dependencies change. Combine O(N) mapping metrics loops together into a single pre-calculated `useMemo` object.
