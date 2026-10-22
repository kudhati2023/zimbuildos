## 2024-05-24 - Accessibility for Icon-only Buttons
**Learning:** Many icon-only utility buttons (e.g., refresh, sign in, dismiss alerts) in the global header are missing descriptive `aria-label` attributes and keyboard focus states, making them difficult for screen reader and keyboard users to navigate.
**Action:** When adding or modifying utility buttons, ensure they have context-appropriate `aria-label`s and `focus-visible` styling (using Tailwind's `focus-visible:ring-2` with an appropriate semantic color like `indigo`, `rose`, or `emerald`) for accessible keyboard navigation.
