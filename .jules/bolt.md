
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-10-29 - Prevent O(N) re-renders for nested object props in pure functional components
**Learning:** Pure functional components rendered inside lists (e.g. `ServicingProgressBar` inside the GIS data grid) will frequently re-render needlessly when parent components generate new object references for nested prop arrays/objects (like `servicing`), leading to an O(N) performance hit.
**Action:** When working with list items that receive nested object properties, wrap them in `React.memo` and explicitly define a custom comparison function that individually checks each nested property (e.g. `prev.servicing.water === next.servicing.water`) to skip re-renders effectively.
