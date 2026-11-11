
## 2026-11-11 - Added ARIA label to GeoJsonUploaderModal close button
**Learning:** Icon-only buttons in modals lack context for screen readers. Using `aria-label` ensures screen reader users can identify the close action. Adding explicit `focus-visible` states improves keyboard navigation for visually impaired users relying on Tab to navigate the modal.
**Action:** Always ensure that any icon-only button used for critical actions (like closing a modal) has an explicit `aria-label` and visible focus styles to improve accessibility.
