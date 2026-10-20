
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize React Callback Props for Expensive Child Components
**Learning:** Passing inline or non-memoized callback functions (like `handleReserveFromMap` in `App.tsx`) to expensive child components (like `InteractiveLeafletMap`) forces the child to re-render on every parent render. This triggers complex DOM rebuilds (e.g. Leaflet map teardowns) and significantly hurts frontend performance.
**Action:** When passing callback props to expensive child components, always wrap them in `useCallback` with an empty dependency array (or minimal dependencies). To avoid stale closures, use functional state updates (e.g. `setState(prev => ({...prev, ...}))`) inside the callback.
