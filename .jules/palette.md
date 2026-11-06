## 2025-05-18 - Improve keyboard accessibility of interactive elements
**Learning:** Icon-only buttons and inline text buttons lacked proper ARIA labels and focus states, making them difficult to use with keyboard navigation and screen readers.
**Action:** Always add `aria-label` to icon-only buttons and `focus-visible:ring-2 focus:outline-none` to all interactive buttons for proper keyboard accessibility.
