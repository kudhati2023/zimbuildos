## 2024-10-13 - Memoizing Inline React Filters
**Learning:** Large monolithic React components with complex state (like `App.tsx` here) often suffer from expensive inline `.filter().map()` chains on large data sets (like `publicStands`) running on every render.
**Action:** Always extract inline array operations into `useMemo` hooks when dealing with list rendering in large components to prevent unnecessary recalculations on unrelated state updates.
