
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2023-10-25 - Avoid inline multiple array iterations in JSX
**Learning:** Performing multiple inline `.filter()` and `.some()` loops on the same array inside a JSX component forces the application to iterate over the array multiple times on every single re-render.
**Action:** Replace inline metrics calculations in JSX with a single `useMemo` block that runs an O(N) loop to calculate required counts or values in one pass and reuses the result.
