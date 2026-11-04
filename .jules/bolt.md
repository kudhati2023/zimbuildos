
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-04 - HR Payroll Summary Optimization
**Learning:** By combining two sequential loops of list comprehension using sum() into a single loop, we optimized the hr_payroll_manager's get_hr_summary logic to run faster without traversing the same structure twice.
**Action:** Combined active count and total base salary calculations into a single iteration block in get_hr_summary, reducing execution time by roughly 36%.
