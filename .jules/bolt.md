
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2023-11-03 - Optimize list item components using React.memo with custom comparison functions
**Learning:** Components rendered frequently in lists (like `ServicingProgressBar` inside `publicStands.map()`) can cause massive unnecessary re-renders (O(N)) when they accept complex nested object props, severely degrading performance.
**Action:** Always wrap such functional presentational components in `React.memo` and provide a custom comparison function that specifically checks the nested properties (e.g., `servicing.water === next.servicing.water`) to ensure equality checks evaluate correctly and prevent unneeded rendering cycles.
