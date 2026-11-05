
## 2026-03-04 - Optimize publicStands mapping in App.tsx
**Learning:** Re-renders using inline chained `.filter().map()` operations on data that isn't functionally mutated each pass significantly hurts frontend performance by running multiple iterative loops (O(4N) loops in App.tsx on `publicStands`).
**Action:** Always combine and precalculate shared looping logic or related counts in a single pass O(N) using `useMemo` hooks.

## 2026-03-04 - Optimize reserve tab arrays filtering
**Learning:** React component render cycles execute inline array `.filter().map()` operations synchronously, which blocks the main thread when dropdown lists (like `applications` and `stands`) grow large.
**Action:** Use `useMemo` hooks to extract array `.filter()` logic for form dropdowns so the list derivations are cached and only recalculated when the underlying data changes, instead of on every keypress during form interaction.
