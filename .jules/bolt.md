## 2026-10-13 - Memoization of expensive array operations on large datasets
**Learning:** React renders can be severely bogged down by repeatedly mapping and filtering large collections inline. The `publicStands` dataset was being iterated over five times per render.
**Action:** Extract inline derived state (counts, unique sets, and filtered subsets) into `useMemo` blocks, ideally combining multiple passes into a single iteration where possible.
