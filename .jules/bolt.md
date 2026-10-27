
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2023-10-27 - Wrap Callback Props with useCallback and use React.memo on List Item Components
**Learning:** React re-renders components aggressively. Complex child components that receive callbacks as props (like `InteractiveLeafletMap`) will needlessly tear down and rebuild their internal state (like Leaflet objects) if their parent component (like `App.tsx`) recreates those callbacks inline on every render. Similarly, rendering many pure functional components (like `ServicingProgressBar`) inside a large list (like the data grid) causes an O(N) re-render issue unless they are memoized. However, simply using `React.memo` isn't enough when nested objects are passed as props, as their references change.
**Action:** Always wrap callback props in `useCallback` when passing them to expensive child components. For functional pure presentational components rendered in lists that accept nested object props, wrap them in `React.memo` and provide a custom comparison function to check specific nested properties for equality, preventing O(N) unnecessary re-renders.
