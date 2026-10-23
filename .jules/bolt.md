
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-10-23 - Optimize callback props in App.tsx
**Learning:** Wrapping callback props passed to expensive child components (like InteractiveLeafletMap) with useCallback prevents unnecessary teardown and rebuilds of complex map layers on every parent state change.
**Action:** Always wrap callback props passed to heavy components with useCallback, but ensure all dependencies are included in the dependency array to avoid stale closure bugs.
