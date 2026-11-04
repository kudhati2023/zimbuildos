
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2024-05-23 - Optimize ServicingProgressBar with React.memo
**Learning:** Pure presentational components receiving nested object props (like `servicing`) re-render unnecessarily in long lists when the parent re-renders, because object references change.
**Action:** Wrap such components in `React.memo` and provide a custom comparison function to check specific nested properties (e.g., `water`, `sewer`, `roads`) for equality to prevent O(N) re-renders.
