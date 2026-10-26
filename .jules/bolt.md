
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2025-02-12 - Memoizing Callbacks for Expensive Maps
**Learning:** Missing memoization on callback props passed to expensive child components like `InteractiveLeafletMap` can cause unnecessary unmounting/remounting or teardown/rebuilds of internal features (like Leaflet popups or GeoJSON polygons) on every parent re-render due to the callback dependencies in `useEffect` in the child component.
**Action:** Always wrap event handlers (like `onSelectStand`, `onReserveClick`) passed to heavy GIS or graphing components in `useCallback`. Consider using functional state updates (e.g., `setState(prev => ...prev)`) to avoid adding state variables to the dependency array.
