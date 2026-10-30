## 2026-10-30 - Add ARIA Labels and Focus Styles to Icon Buttons
**Learning:** In the global header and alerts components, many icon-only buttons (like refresh, sign in/out, dismiss alerts) were missing ARIA attributes and focus styles. This pattern is common across this application's components.
**Action:** Ensure `aria-label` and visible focus indicators (`focus-visible:ring-2 focus-visible:outline-none rounded`) are properly applied to all icon-only buttons to improve accessibility and keyboard navigation. Match the ring color to the action's intent.
