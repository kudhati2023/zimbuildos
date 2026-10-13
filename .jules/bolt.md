## 2023-10-13 - Memoizing Array Filters in React Render Functions
**Learning:** In large React components like `App.tsx`, calculating derived state via array filtering (e.g., `stands.filter(s => s.status === 'AVAILABLE')`) inside the render block causes potentially expensive O(n) operations on every re-render, especially with large datasets like GIS stands or applications.
**Action:** Always wrap these derived state calculations in `useMemo` with the appropriate dependencies so they only run when the underlying data changes, avoiding unnecessary recalculations.
