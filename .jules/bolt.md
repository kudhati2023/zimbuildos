## 2025-02-23 - Memoize functional pure presentational component with nested props

**Learning:** When functional components accept complex nested props (like `ServicingProgressBar` accepting the `servicing` object with nested `water`, `sewer`, `roads` properties), simple `React.memo` will not prevent re-renders if the parent passes a new object reference on every render.
**Action:** Provide a custom comparison function to `React.memo` that explicitly checks the specific nested properties for equality to prevent O(N) unnecessary re-renders when rendering lists of these components.
