## 2024-10-15 - Extracted Expensive Inline Filter/Map operations in Large React Component
**Learning:** In a highly complex UI dashboard like ZHMS (`App.tsx`), repeatedly running inline `.filter()` and `.map()` on datasets like `publicStands` or `crmInquiries` inside the render function significantly blocks the main thread upon every state change.
**Action:** Extract large dataset derivations into `useMemo` hooks near the top of the component to prevent re-computing data that hasn't changed.
