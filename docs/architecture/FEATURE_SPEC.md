# Feature Spec

Describes what the product does from the user's point of view — one entry per
feature, behavior not implementation. If this file and the code disagree, the
code is right — fix this file.

## Home page

- **Route:** `/` (`apps/web/src/app/page.tsx`)
- **Behavior:** A single explainer page for the repo itself. Under the
  `web-skeleton` heading it walks through five sections: what the workspaces
  are, how the Claude skills support AI-assisted development (each listed with
  the failure mode it prevents), the guardrails that don't rely on anyone
  remembering, the branch-promotion model, and a live demonstration of the
  server/client boundary. Ends with a card linking to the Turborepo docs.
- **Tests:** `apps/web/e2e/home.spec.ts` asserts every section heading is
  reachable by accessible name and that the embedded counter still responds.

## Health endpoint

- **Where:** `apps/api`, `GET /health` — see `API_SPEC.md` for the contract
- **Behavior:** Reports that the service process is alive, with its uptime.
  Nothing consumes it inside this repo; it exists for a load balancer or
  orchestrator probe.
- **Tests:** `apps/api/src/health/health.controller.test.ts`

## Counter

- **Where:** on the home page (`apps/web/src/components/counter.tsx`)
- **Behavior:** Displays "Clicked N times" (starts at 0) and an **Increment**
  button that raises the count by one per click. The count announces changes to
  screen readers (`aria-live="polite"`). State is per-visit; nothing persists.
- **Tests:** `apps/web/src/components/counter.test.tsx`
