
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-11-05 - Optimize Customer Lookup by Phone/Email to O(1)
**Learning:** O(N) linear scanning scales poorly for CRM lookups where fields like phone/email are queried. Secondary dict-based indices can drastically improve performance.
**Action:** Introduced `customer_phone_idx` and `customer_email_idx` dictionaries in `SalesCRMPipelineManager`, populated them during seeding/creation, and updated `find_customer_by_phone_or_email` to use O(1) key lookups instead of looping.
