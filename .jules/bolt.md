
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.
## 2026-10-30 - Optimize Cadastre Telemetry metrics calculation
**Learning:** Calculating lengths and truthiness inline using `.filter().length` and `.some()` inside component rendering for derived values leads to redundant iteration loops which hurts component performance.
**Action:** Pre-calculate these metrics in a single O(N) loop using a `useMemo` hook, keeping the component renders clean and fast.
