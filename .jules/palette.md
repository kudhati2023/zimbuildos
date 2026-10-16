## 2024-05-15 - [Icon-Only Buttons A11y Pattern]
**Learning:** Verified that header icon-only buttons lacked aria-labels and keyboard focus indicators across the app, a common pattern that disrupts screen-reader usability.
**Action:** Always add `aria-label`s and `focus-visible` states to buttons containing only icons, to ensure smooth keyboard and screen-reader navigation.
