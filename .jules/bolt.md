
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2023-11-01 - [Optimizing List-Rendered Presentational Components]
**Learning:** Pure presentational components rendered inside long lists (e.g., thousands of items) can cause significant O(N) re-renders, especially when they receive nested objects as props. Using `React.memo` without a custom comparison function may not prevent re-renders due to referential inequality of the nested props.
**Action:** When passing nested objects to expensive components rendered in long lists, always wrap the component in `React.memo` and provide a custom equality function to explicitly check the specific relevant primitive properties.
