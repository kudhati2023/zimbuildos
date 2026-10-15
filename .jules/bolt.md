## 2026-10-13 - App.tsx Tab Filtering Performance
**Learning:** Large React components like App.tsx that conditionally render tabs using local state for filtering can suffer from O(n) array recalculations on every keystroke if inline .filter() and .map() operations are used in the JSX, even if the base data hasn't changed.
**Action:** Extract expensive inline array derivations (metrics calculation and list filtering) into useMemo hooks to ensure recalculations only happen when the dependencies (the data or the search input) change.
