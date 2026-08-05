---
name: kanban-review
description: Use for a status readout of the Web Skeleton board — "how's the board", "what's in flight", "what can I release", "kanban review", "what's blocked". Reads every open task, cross-references PRs on GitHub, and prints a copy-pasteable report of board health, action items, and what is ready to release.
---

# Kanban review

Read-only. Nothing in this skill writes to Asana or GitHub.

## 1. Read the board

```bash
node .claude/ticket-planner/board.mjs               # open tasks, grouped by section
node .claude/ticket-planner/board.mjs --stale 7     # flag threshold in days (default 7)
node .claude/ticket-planner/board.mjs --tag cta     # filter by tag
```

Needs `ASANA_TOKEN`. Output gives, per task: planner ID, points, days since last update,
priority, name — plus a summary of section counts, stale tasks, and stories missing estimates.

## 2. Cross-reference PRs

For tickets past the first column that involve code (skip spikes, design reviews, pure-docs
tickets), find their PRs. **Run these in parallel** — it's the slow part.

```bash
gh pr list --repo notablecap/web-skeleton --state all --limit 100 \
  --json number,title,state,mergedAt,headRefName,statusCheckRollup,reviewDecision
```

Match on the planner ID (`WEB-CTA-3`) in the PR title — this repo's convention is
`feat(WEB-CTA-3): …`. `mergedAt` non-null means merged; otherwise read `state`. If
tickets span other repos in the org, query those too and say which repos you covered.

## 3. Classify

| Signal | Means |
|---|---|
| All PRs merged, task not in a done section | Ready to release |
| Open PR, failing `statusCheckRollup` | Blocked on CI |
| Open PR, `reviewDecision: CHANGES_REQUESTED` | Blocked on review |
| In Progress / In Review, no PR found | Needs verification — either pre-code or the PR title is missing the ID |
| Same section > 7 days | Stale |
| More than 3 in "In Progress" | WIP breach — a small board rarely benefits from more |
| Story with no points or no priority | Unestimated |

## 4. Report

One code block, copy-pasteable into Slack or a doc:

```
📋 Web Skeleton Board — Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 BOARD HEALTH
  Backlog          : N
  To Do            : N
  In Progress      : N  ← WIP (target ≤ 3)
  In Review        : N
  Ready to Release : N

  Stale > 7d: N (listed below)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ACTION ITEMS
  1. WEB-CTA-3 — PR #12 failing e2e; rerun after the fixture fix.
  2. WEB-CTA-7 — In Review 11 days, no PR found. Confirm the branch was pushed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 RELEASE PLAN
✅ Ready (all PRs merged)
  • WEB-CTA-1  [FE] CTA deep-link handling
⛔ Blocked
  • WEB-CTA-5  PR #15 OPEN — changes requested
⏳ NO PR FOUND
  • WEB-CTA-9  [DOCS] Update contract doc
```

Every action item names a next step. Don't list a problem you can't say what to do about.

## Rules

- Tickets in a done section are out of the release plan — they shipped.
- A ticket with no PR is "needs verification", never "not started" — the PR title may just be
  missing the ID.
- Report what you found. If a repo query failed or credentials were missing, say which, and
  mark that section incomplete rather than implying the board is clean.
