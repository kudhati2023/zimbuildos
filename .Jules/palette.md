## 2026-10-27 - Icon-Only Button Accessibility
**Learning:** Found several icon-only buttons (like refresh, sign-in, dismiss alerts) that lacked ARIA labels and focus states, which impacts screen reader users and keyboard navigation.
**Action:** Consistently apply `aria-label`, `title`, and `focus-visible:ring-2` to all icon-only interactive elements to ensure they are perceivable and operable by all users.
