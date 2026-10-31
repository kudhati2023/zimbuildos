
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2024-03-21 - [Optimize Presentational List Components]
**Learning:** Rendering list components (like `ServicingProgressBar`) that accept nested object props without a custom comparison function causes unnecessary O(N) recalculations on every re-render, as strict equality on objects fails.
**Action:** Always wrap pure functional presentational components in `React.memo` and provide a custom equality function for specific nested properties when passing nested objects as props to avoid these performance issues in lists.
