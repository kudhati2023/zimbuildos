
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-05-15 - Bolt: Optimize tag membership check
**Learning:** O(N) list containment checks inside loops cause O(N^2) complexity. Using a temporary set provides O(1) lookups, significantly improving performance for objects with many elements.
**Action:** Used a temporary set for checking existing customer tags in SalesCRMPipelineManager.
