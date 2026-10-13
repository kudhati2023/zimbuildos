## 2026-10-13 - Icon-Only Button Accessibility
**Learning:** Icon-only buttons (like refresh, sign in, sign out, and map controls) frequently lack `aria-label` attributes, which are critical for screen reader users to understand the button's purpose since there is no visible text.
**Action:** When creating or modifying icon-only buttons, always ensure an `aria-label` attribute is included that clearly describes the action the button performs.
