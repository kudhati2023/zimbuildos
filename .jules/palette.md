## 2026-10-28 - Added focus rings and aria-labels to top navigation icons
**Learning:** Top navigation items and modal close buttons lacked proper `focus-visible:ring-2` outlines, reducing keyboard accessibility, and also lacked `aria-label`s for screen reader support.
**Action:** When working on navigation or icon-only buttons in the UI, consistently add `aria-label` and `focus-visible:ring-2` for keyboard accessibility and screen readers.
