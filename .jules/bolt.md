
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize GIS Stand mapping operations
**Learning:** Inline array loops (`.filter`, `.some`) in JSX trigger O(N) recalculations on every render, slowing down the frontend. In App.tsx, the telemetry overlay performed redundant loops on the same data.
**Action:** Use a single O(N) loop wrapped in `useMemo` to precalculate counts (e.g. mapped, unmapped) before the JSX return.
