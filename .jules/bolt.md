## 2024-05-18 - [Optimized public register stats calculation]
**Learning:** React component rendered the public stand list multiple times. Each render executed an O(N) loop to calculate availability stats, causing unnecessary work.
**Action:** Used `useMemo` to memoize the statistics calculation loop in `src/App.tsx` based on the `publicStands` dependency.
