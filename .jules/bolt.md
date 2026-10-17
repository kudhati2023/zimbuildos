
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-03-04 - Eliminate Multiple React Renders Array Computations using useMemo
**Learning:** Performing array computations such as `.filter()` or `.some()` multiple times on the same object data inline within React's render function (like `gisStands.filter` and `applications.filter`) will repeat these O(N) operations unnecessarily upon every UI update, causing sluggish UI performance as lists grow.
**Action:** Extract all inline React rendering data transformation array loops (such as multiple filters) into a single O(N) iteration wrapped inside a React `useMemo` dependency array hook.
