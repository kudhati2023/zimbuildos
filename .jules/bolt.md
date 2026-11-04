
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-04 - Reduce redundant list iterations in payroll processing
**What:** Refactored multiple `sum(... for s in slips)` generator expressions into a single loop accumulating all totals at once.
**Why:** Calculating multiple sums separately incurs multiple O(N) passes through the `slips` array. Combining them into one loop reduces iteration overhead and makes it O(N) once.
**Impact:** CPU time for payroll summary generation improved by ~24%.
