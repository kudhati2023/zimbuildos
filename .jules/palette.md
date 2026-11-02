## 2024-05-24 - Added Accessibility Attributes to Global Icons
**Learning:** Icon-only buttons in the global header and alerts were missing ARIA labels and focus indicators, making them inaccessible to screen readers and keyboard users.
**Action:** Applied `aria-label` and `focus-visible:ring-2` to these elements, ensuring focus ring colors match the action intent (e.g., rose for destructive/dismiss, indigo for default).
