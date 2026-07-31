# Feature Spec

Describes what the product does from the user's point of view — one entry per
feature, behavior not implementation. If this file and the code disagree, the
code is right — fix this file.

## Home page

- **Route:** `/` (`apps/web/src/app/page.tsx`)
- **Behavior:** Shows the `web-skeleton` heading, an explanatory paragraph, a
  click counter, and a card linking to the Turborepo docs.
- **Tests:** `apps/web/e2e/home.spec.ts` (flow), colocated component tests.

## Counter

- **Where:** on the home page (`apps/web/src/components/counter.tsx`)
- **Behavior:** Displays "Clicked N times" (starts at 0) and an **Increment**
  button that raises the count by one per click. The count announces changes to
  screen readers (`aria-live="polite"`). State is per-visit; nothing persists.
- **Tests:** `apps/web/src/components/counter.test.tsx`
