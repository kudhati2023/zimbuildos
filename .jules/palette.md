## 2026-11-07 - Adding Accessible Focus Rings to Icon-Only Buttons
**Learning:** Icon-only utility buttons in the header lacked proper `aria-label` and explicit `focus-visible` keyboard outlines, which impacts screen reader and keyboard navigation.
**Action:** Apply Tailwind's `focus-visible:ring-2 focus:outline-none` and semantic `aria-label`s to interactive icon-only elements.
