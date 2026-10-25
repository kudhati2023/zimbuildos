
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2025-03-04 - React.memo custom comparators for nested list props
**Learning:** When passing nested object props (like `servicing: { water, sewer, roads }`) to pure presentational components rendered in long lists, the parent recreating the object wrapper triggers O(N) re-renders. A standard `React.memo` isn't enough.
**Action:** Always provide a custom comparison function to `React.memo` that explicitly checks the equality of the specific primitive properties inside the nested object to guarantee the memoization holds.
