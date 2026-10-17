
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-03-04 - Optimize React Render Loops in App.tsx
**Learning:** The `App.tsx` file had multiple O(N) array filtering operations inline in the JSX, specifically for mapping gis stands, applications, stands and CRM inquiries, which caused performance bottlenecks on every render.
**Action:** Extract expensive or repetitive filtering logic into `useMemo` hooks (e.g. `gisStandsMetrics`, `approvedApplications`, `availableStands`, `filteredCrmInquiries`) and replace inline array methods with the memoized properties to improve UI performance and reduce unnecessary recalculations.
