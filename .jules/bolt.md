## 2024-05-24 - React useMemo Optimization for Large Datasets
**Learning:** In large React components like `App.tsx` that render extensive data tables, inline array operations (e.g., `.filter().filter().map()`) cause expensive recalculations on every render.
**Action:** Always extract complex filtering logic into `useMemo` hooks (e.g., `filteredPublicStands`) when the dataset is large to prevent unnecessary processing and improve rendering performance. Combine multiple filter conditions into a single pass to iterate over the data only once.
