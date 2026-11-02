
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-02 - Optimize InteractiveLeafletMap callback props
**Learning:** Passing callback props to expensive child components (like `InteractiveLeafletMap`) without memoization causes `useEffect` dependencies to trigger unnecessary teardowns and rebuilds of complex elements on every parent re-render.
**Action:** Always wrap callback props for expensive components in `useCallback`, explicitly including necessary stable React state setters in the dependency array to satisfy linters and maintain referential equality.
