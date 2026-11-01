## 2025-02-12 - Added ARIA Labels and Focus Rings to Icon-Only Buttons
**Learning:** Icon-only buttons (like refresh, dismiss, sign in/out) in the global header and alerts frequently lack ARIA attributes and visible focus indicators, creating an accessibility issue for screen readers and keyboard navigation.
**Action:** Always ensure `aria-label`s and intent-matched visible focus indicators (e.g., `focus-visible:ring-2 focus-visible:ring-indigo-500`) are properly applied to these elements using existing Tailwind utility classes.
