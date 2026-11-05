
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize ServicingProgressBar re-renders
**Learning:** Functional pure presentational components rendered in lists (like `ServicingProgressBar`) that accept nested object props (like `stand.servicing`) cause O(N) unnecessary re-renders when their parent component re-renders unless wrapped in `React.memo` with a custom equality function.
**Action:** Wrap functional list components in `React.memo` and provide a custom equality function to check nested properties, avoiding unnecessary deep equality checks or re-rendering unmodified child components.
