
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2025-02-23 - Optimize O(N) Customer Lookup by Name
**Learning:** `find_customer_by_name` previously iterated over all customers in an O(N) lookup. Adding a secondary index dictionary speeds this up significantly.
**Action:** Implemented a secondary dictionary index `_customer_name_index` mapping lowercased names to customer IDs, reducing the lookup time complexity from O(N) to O(1).
