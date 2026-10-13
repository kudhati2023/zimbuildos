## 2024-05-15 - Optimizing large arrays with useMemo
**Learning:** In enterprise apps like ZHMS, large arrays (e.g. `publicStands`, `crmInquiries`) rendered as tables with inline filtering like `.filter().map()` can cause extreme performance bottlenecks since O(N) array allocation happens on every render loop.
**Action:** Always extract expensive inline array methods into `useMemo` hooks before mapping over them, so they only re-allocate when their direct dependencies change.
