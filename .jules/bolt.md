
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-05-18 - Optimized filteredGISStands in App.tsx
**Learning:** In React components rendering large arrays (like `filteredGISStands` with mapping), counting subsets inside JSX using chained `.filter(s => s.property).length` or `.some()` forces an O(N) traversal on every render frame during user interaction (like panning maps or typing in search boxes). This bottlenecks the main thread.
**Action:** Instead, aggregate these counts (mapped/unmapped) during the primary `useMemo` filter loop. This reduces 3 array iterations per render into just 1 during the initial data cache phase, directly eliminating unnecessary work in the render path.
