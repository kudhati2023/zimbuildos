## 2024-05-15 - Global Header Buttons Accessibility
**Learning:** Icon-only buttons across the global header and alerts (like refresh, sign-in, sign-out, dismiss messages) frequently lack ARIA attributes and focus-visible states, impeding screen reader functionality and keyboard navigability.
**Action:** Always ensure `aria-label`s and visible focus indicators (`focus:outline-none focus-visible:ring-2`) are applied consistently to these elements across the React frontend.
