## 2024-10-13 - Memoizing inline filters in large React components
**Learning:** Performing array operations like `.filter()` directly in JSX on large data structures (like `publicStands`) leads to slow performance because the operations are executed repeatedly on every re-render (e.g. state changes like keystrokes).
**Action:** Always extract expensive inline operations like `.filter()` chains to `useMemo` when rendering lists or calculating derived statistics in large React components.
