
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2023-11-23 - Optimize GIS Stands Metrics
**Learning:** React renders components frequently; iterating an array multiple times inside the render method (e.g., using `.filter()`, `.some()`) is an unnecessary performance drain, especially on arrays mapped to lists or grid items.
**Action:** Replace multiple chained array loops directly inside JSX with a single `useMemo` block that uses a single O(N) pass, gathering and saving multiple derived values to optimize complex React components.
