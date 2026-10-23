
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-10-23 - Prevent Stale Closures When Using useCallback
**Learning:** In React, if you pass an empty dependency array `[]` to `useCallback`, any state variables accessed inside that callback will be "trapped" at their initial values from the first render. If the callback accesses variables derived from state or props that change over time (like `allocations` or dynamically generated arrays), it will cause a stale closure bug and execute with outdated data. Furthermore, applying `React.memo` to a component is entirely ineffective if complex props passed to it (like dynamically filtered arrays) are not themselves memoized using `useMemo`, as their references will change on every render, causing the shallow comparison to always fail.
**Action:** When using `useCallback`, explicitly include all referenced variables in the dependency array unless you use functional state updates (e.g., `setState(prev => ...)`). When passing arrays or objects to a `React.memo` component, ensure those props are wrapped in `useMemo`. Always read the actual usage of a component with `grep` before attempting to optimize it.
