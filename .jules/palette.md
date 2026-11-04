
## 2024-05-19 - Accessible Icon-Only Buttons
**Learning:** Icon-only buttons (like refresh, sign-in, sign-out, dismiss) in the global header/alerts lack crucial `aria-label`s and visual focus indicators (`focus-visible`), making them inaccessible for screen reader and keyboard users. Using Tailwind `focus-visible` with intent-matching colors (e.g. `ring-rose-500` for dismiss, `ring-indigo-500` for refresh/sign-in) improves keyboard accessibility and visibility significantly.
**Action:** Always ensure icon-only buttons receive an `aria-label` that describes their intent, and include `focus-visible:outline-none focus-visible:ring-2` with an appropriate context color.
