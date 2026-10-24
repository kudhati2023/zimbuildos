
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Memoize list-rendered components with nested object props
**Learning:** Unmemoized functional pure presentational components (like `ServicingProgressBar`) mapping over lists cause O(N) unnecessary re-renders when the parent component's state changes. If they accept nested objects (like `servicing`), `React.memo`'s default shallow comparison fails.
**Action:** When optimizing components rendered in lists that take nested objects as props, wrap them in `React.memo` and provide a custom comparison function that manually checks the nested properties (e.g. `.water`, `.sewer`, `.roads`) for equality.
