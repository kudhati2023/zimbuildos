
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize Map Re-renders
**Learning:** `InteractiveLeafletMap` was an expensive component that re-rendered when state inside `App.tsx` changed (e.g. inspector toggle), even though its core props didn't change.
**Action:** Wrap the component in `React.memo` and provide stable callback props (using `useCallback`) for map actions like `handleReserveFromMap` and `handleSelectStand` inside the parent component to avoid stale closures.
