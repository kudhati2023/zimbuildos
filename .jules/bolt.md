
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-11 - Extract inline React arrays to useMemo
**Learning:** Extracting inline chained array operations (like `.filter().map()`) into a single `useMemo` hook caches the derived lists, preventing redundant O(N) recalculations on every render cycle during user interaction.
**Action:** Use `useMemo` hooks to memoize filtered lists derived from state arrays in React components, keeping the heavy recalculations off the main render thread unless dependent values change.
