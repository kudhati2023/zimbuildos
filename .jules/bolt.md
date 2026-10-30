
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-10-30 - Optimize ServicingProgressBar
**Learning:** Functional pure presentational components rendered inside grid/list views often suffer from unnecessary O(N) re-renders, especially when they receive complex nested props (like the `servicing` object).
**Action:** Use `React.memo` with a custom deep comparison function to check specific nested properties for equality to prevent re-renders when rendering components inside O(N) loops.
