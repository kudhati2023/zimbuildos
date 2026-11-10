
## 2026-11-10 - Add ARIA labels and focus states to icon-only buttons
**Learning:** Header utility buttons (Refresh, Sign Out, Sign In) often lack explicit semantic labels and keyboard focus states, making them inaccessible to screen readers and keyboard users.
**Action:** Always include `aria-label` for icon-only buttons and explicitly define focus states using Tailwind classes like `focus-visible:ring-2 focus:outline-none`.
