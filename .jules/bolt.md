
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Memoize Map Callbacks to Prevent Expensive Re-renders
**Learning:** When mapping complex layers in Leaflet/React, inline callback props (`onSelectStand={(id) => ...}`) cause `useEffect` dependency arrays inside the child map component to trigger a complete tear-down and rebuild of hundreds of map polygons on every parent render.
**Action:** Always wrap callback props in `useCallback` when passing them to expensive components, especially those managing external state (like Leaflet Maps) via effects with callback dependencies.
