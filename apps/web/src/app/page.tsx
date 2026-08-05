import { Card } from "@repo/ui/card";
import type { JSX } from "react";

import { CapabilityList, type Capability } from "../components/capability-list";
import { Counter } from "../components/counter";
import { Section } from "../components/section";

const DISCIPLINE_SKILLS: readonly Capability[] = [
  {
    name: "/explore-before-coding",
    what: "Find the canonical example and verify every API before calling it.",
    guards:
      "Stops hallucinated imports and a second way of doing what the repo already does once.",
  },
  {
    name: "/clarify-and-plan",
    what: "State assumptions; make every plan step end in a check.",
    guards:
      "Stops silently picking one reading of an ambiguous request and building the wrong thing.",
  },
  {
    name: "/surgical-diffs",
    what: "Every changed line traces to the request; self-review the diff.",
    guards: "Stops drive-by reformatting that buries the real change.",
  },
  {
    name: "/respect-the-layers",
    what: "Code lives in its layer; dependencies point one way.",
    guards:
      "Stops the one-line query in a route handler that erodes the architecture.",
  },
  {
    name: "/complete-the-wiring",
    what: "Grep the newest sibling's footprint and match it location for location.",
    guards:
      "Stops the new config key that works locally and is undefined in production.",
  },
  {
    name: "/test-like-a-user",
    what: "Test through the public surface; mock only at the system boundary.",
    guards: "Stops tests that pass while the thing is unregistered and broken.",
  },
  {
    name: "/debug-root-cause",
    what: "No fix before a reproduction and a one-sentence causal explanation.",
    guards: "Stops stacking guesses until something appears to work.",
  },
  {
    name: "/verify-before-done",
    what: "Done means a check you ran passed — and failures get reported.",
    guards:
      "Stops the most costly habit of all: claiming success without evidence.",
  },
];

const TICKET_SKILLS: readonly Capability[] = [
  {
    name: "/plan-tickets",
    what: "Turn a PRD or RFC into a reviewable dry-run folder, then replay it into Asana.",
    guards: "Corrections are free on disk and expensive once 44 tasks exist.",
  },
  {
    name: "/work-ticket",
    what: "Resolve a planner ID to its row, design context and blockers before coding.",
    guards: "Stops building the design that was already reversed.",
  },
  {
    name: "/sync-tickets",
    what: "Reconcile the local JSONL and the board field by field, in the direction it moved.",
    guards: "No auto-merge — a conflict is always a human decision.",
  },
  {
    name: "/kanban-review",
    what: "Board readout cross-referenced against GitHub PRs.",
    guards: "Every action item names a next step.",
  },
];

export default function HomePage(): JSX.Element {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Skeleton repo</p>
        <h1>web-skeleton</h1>
        <p className="lede">
          A Turborepo monorepo that ships an{" "}
          <strong>engineering workflow</strong>, not just a stack. The
          interesting part is not the Next.js app — it is everything around it
          that makes AI-assisted development produce reviewable, verifiable
          work.
        </p>
      </header>

      <Section
        id="layout"
        title="What is in here"
        lede="Two apps and three shared packages, with one-way dependencies."
      >
        <ul className="layout">
          <li>
            <code>apps/web</code> — this Next.js app (App Router).
          </li>
          <li>
            <code>apps/api</code> — a NestJS service exposing{" "}
            <code>GET /health</code> and nothing else yet.
          </li>
          <li>
            <code>packages/ui</code> — shared React components.{" "}
            <code>button.tsx</code> is the reference every other component
            copies.
          </li>
          <li>
            <code>packages/eslint-config</code>,{" "}
            <code>packages/typescript-config</code> — the shared rules both apps
            extend.
          </li>
        </ul>
        <p>
          <code>apps/*</code> may import <code>packages/*</code>; packages never
          import an app. <code>import/no-cycle</code> is an ESLint error, and it
          is proven to fire rather than assumed to.
        </p>
      </Section>

      <Section
        id="skills"
        title="How AI-assisted development is supported"
        lede="CLAUDE.md sets the behavioural rules. Thirteen skills in .claude/skills/ turn each of them into an explicit procedure an agent follows."
      >
        <p>
          The premise: the gap between a weak and a strong coding agent is
          mostly not code generation. It is reconnaissance before writing,
          restraint while editing, and honesty about what was actually verified.
          Each skill targets one specific way that goes wrong.
        </p>
        <h3>Engineering discipline — portable, no repo knowledge required</h3>
        <CapabilityList items={DISCIPLINE_SKILLS} />
        <h3>Ticket workflow — Asana</h3>
        <p>
          Asana has no human-readable issue keys, so the planner mints its own:{" "}
          <code>WEB-CTA-3</code>. That ID is the durable handle — it goes in the
          commit scope, so the board can be cross-referenced against merged PRs.
        </p>
        <CapabilityList items={TICKET_SKILLS} />
        <h3>Keeping the docs true</h3>
        <p>
          <code>/maintain-architecture-docs</code> requires the specs in{" "}
          <code>docs/architecture/</code> to be updated in the same commit as
          the change. A CI job re-reads every diff that lands on{" "}
          <code>develop</code> as a backstop and opens a correction PR for
          whatever that discipline missed.
        </p>
      </Section>

      <Section
        id="guardrails"
        title="Guardrails that do not depend on anyone remembering"
        lede="Rules enforced by a hook or a config beat rules written in a document."
      >
        <ul className="layout">
          <li>
            <strong>Conventional commits</strong>, enforced by a{" "}
            <code>commit-msg</code> hook — which is what lets releases derive
            their semver bump from the commits themselves.
          </li>
          <li>
            <strong>Pre-commit</strong> runs lint-staged;{" "}
            <strong>pre-push</strong> gates on branch name plus lint, typecheck
            and tests.
          </li>
          <li>
            <strong>Exact version pins.</strong> No <code>^</code>, no{" "}
            <code>~</code>, anywhere.
          </li>
          <li>
            <strong>A 7-day supply-chain gate.</strong> A package published in
            the last week will not install — compromised releases are usually
            caught inside that window.
          </li>
          <li>
            <strong>Install scripts blocked</strong> by default, with two
            reviewed exceptions.
          </li>
        </ul>
      </Section>

      <Section
        id="pipeline"
        title="Promotion, not deployment-by-vibes"
        lede="feature → develop → main → release, with each arrow doing something specific."
      >
        <ul className="layout">
          <li>
            Every push to <code>develop</code> mints a <code>vX.Y.Z</code> tag
            from the conventional commits in the range.
          </li>
          <li>
            Opening a promotion PR has Claude read the merged PRs and write the
            title, the description, and a semver judgement recorded as a label a
            human can override.
          </li>
          <li>
            Merging into <code>main</code> bumps <code>package.json</code>{" "}
            according to that label.
          </li>
        </ul>
        <p>
          The two version mechanisms are independent on purpose: tags say what
          reached integration, <code>main</code> says what was released.
        </p>
      </Section>

      <Section
        id="demo"
        title="The server/client boundary, live"
        lede="This page is a Server Component. The counter below is not, because it needs state and an event handler."
      >
        <Counter />
        <p>
          That is the whole rule: default to Server Components, and add{" "}
          <code>&quot;use client&quot;</code> only on the interactive leaf.
        </p>
      </Section>

      <footer className="footer">
        <Card href="https://turborepo.dev/docs" title="Turborepo docs">
          How the task pipeline and caching work.
        </Card>
      </footer>
    </main>
  );
}
