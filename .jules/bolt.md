## 2025-02-15 - React Component Render Optimization

**Learning:** When interacting with forms in a component, unrelated UI sections recalculate their data derived from state objects directly inline during rendering. If these operations involve iterations like `.filter`, `.reduce`, or `.find` over data properties, it can block rendering and cause noticeable delays.
**Action:** Extract inline array iterations over state collections inside JSX into `useMemo` hooks, combining overlapping filters or computations into a single-pass loop whenever feasible. This limits work to state updates that actually modify the underlying collections, ignoring unrelated form interactions.
