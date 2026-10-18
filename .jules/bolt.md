
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize Leaflet Map Event Handlers
**Learning:** Passing inline arrow functions down to `onSelectStand` and `onReserveClick` in React components causes child components (like `InteractiveLeafletMap`) to re-render unnecessarily. In `InteractiveLeafletMap`, this triggers recreating the map layer features because the component dependencies update.
**Action:** Always wrap event handlers passed as props to expensive child components (especially map or chart components) in `useCallback` to maintain referential equality.
