
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Prevent costly child component re-renders with useCallback and React.memo
**Learning:** Passing unstable inline function references as callback props to complex interactive child components (like `InteractiveLeafletMap`) forces React to trigger `useEffect` dependency checks on every render, causing expensive operations like tearing down and rebuilding Leaflet map polygons. Similarly, pure presentational components like `ServicingProgressBar` taking nested object properties as props inside long grid views trigger O(N) re-renders because React's shallow equality check fails on the nested objects.
**Action:** Always wrap callback props meant for heavy child components in `useCallback` using functional state updates (`[]` dependencies), and use `React.memo` with a tailored custom equality check comparing specifically the nested keys for purely presentational components used in loops.
