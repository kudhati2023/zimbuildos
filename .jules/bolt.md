
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2025-01-01 - [O(N) operations in large React rendering loops]
**Learning:** Found multiple O(N) filtering operations (`.filter()`) invoked directly inside the JSX render tree in `src/App.tsx` (like `applications.filter()`, `stands.filter()`, `crmInquiries.filter()`, and `filteredGISStands.filter()`). Because `App.tsx` re-renders often, this causes expensive recalculations on every render for large arrays.
**Action:** Extract expensive inline filtering operations in React rendering loops into `useMemo` hooks. This precalculates subsets of data or aggregates (e.g. mapped vs unmapped counts) so they are evaluated only when their dependencies change.
