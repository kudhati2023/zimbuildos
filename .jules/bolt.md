
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-10-17 - App.tsx useMemo refactoring
**Learning:** Replaced O(N) array loops using filter and some across the huge `App.tsx` render execution that could slow down large renders by taking them outside of inline render return statements into `useMemo` wrappers.
**Action:** Always wrap filter mappings with `useMemo` and try combining O(3N) multi-method looping arrays inside the same mapping loop into a clean O(1N).
