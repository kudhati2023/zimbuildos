## 2026-11-05 - [Icon Buttons Accessibility]
**Learning:** Many utility icon buttons (like refresh, sign out, sign in, dismiss messages) across the main application interface were missing aria-labels, making them completely inaccessible to screen readers as they lacked text content.
**Action:** Added descriptive aria-labels and keyboard focus indicators (focus-visible:ring-2) to all icon-only utility buttons to ensure they are both discoverable by assistive technologies and visually clear during keyboard navigation.
