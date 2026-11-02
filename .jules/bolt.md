
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2023-11-23 - Clean up generated temp scripts/files
**Learning:** Do not leave Python temporary testing files or package.json changes around when optimizing. Leaving them causes the review system to fail.
**Action:** Ensure any temporary files are safely removed and git repo is clean before submission.
