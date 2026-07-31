// Detects drift between the architecture specs in docs/architecture/ and the
// code that just landed on develop, and edits the specs to match.
//
// This is a BACKSTOP, not the primary mechanism: the `maintain-architecture-docs`
// skill has whoever makes a change update the specs in the same commit. This job
// exists to catch what that discipline misses.
//
// The model returns targeted find/replace edits rather than rewritten files:
// the PR diff then shows only what actually changed, and an edit whose anchor
// no longer matches is reported instead of silently mangling a spec.
//
// Inputs (env):
//   ANTHROPIC_API_KEY - required by the SDK client
//   RANGE             - the git range being analysed, e.g. "abc123..def456"
//   DIFF_FILE         - unified diff for that range
//   DIFFSTAT_FILE     - `git diff --stat` for the same range
//   COMMITS_FILE      - commit subjects + bodies in the range
//   RESULT_FILE       - where to write the JSON result (default: drift-result.json)
//
// Side effect: applies accepted edits to the spec files in the working tree.
//
// Output: RESULT_FILE, a single JSON object:
//   { drift, summary, applied: [{file, reason}], failed: [{file, reason, why}] }

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const SPEC_FILES = [
  "docs/architecture/ARCHITECTURE_SPEC.md",
  "docs/architecture/API_SPEC.md",
  "docs/architecture/FEATURE_SPEC.md",
];

// Cost/latency cap, not a fitting cap — an oversized diff is truncated and
// flagged in the prompt rather than failing the run.
const MAX_DIFF_CHARS = 400_000;

const range = process.env.RANGE ?? "(unknown range)";
const resultFile = process.env.RESULT_FILE ?? "drift-result.json";

const read = (envVar) => {
  const path = process.env[envVar];
  return path && fs.existsSync(path)
    ? fs.readFileSync(path, "utf8").trim()
    : "";
};

const rawDiff = read("DIFF_FILE");
const diff =
  rawDiff.length > MAX_DIFF_CHARS
    ? `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n…[diff truncated at ${MAX_DIFF_CHARS} characters — judge the remainder from the diffstat and commit messages]`
    : rawDiff;
const diffstat = read("DIFFSTAT_FILE");
const commits = read("COMMITS_FILE");

if (!diff && !diffstat) {
  console.error("No diff to analyse — nothing to do.");
  fs.writeFileSync(
    resultFile,
    JSON.stringify({ drift: false, summary: "", applied: [], failed: [] }),
  );
  process.exit(0);
}

const specs = SPEC_FILES.map((file) => ({
  file,
  content: fs.readFileSync(file, "utf8"),
}));

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["drift", "summary", "edits"],
  properties: {
    drift: {
      type: "boolean",
      description:
        "True only if at least one spec statement is now wrong, incomplete, or missing",
    },
    summary: {
      type: "string",
      description:
        "GitHub-flavored markdown. When drift is true: a few bullets naming what changed in the code and which spec statement each edit corrects. When false: one sentence saying why the specs still hold.",
    },
    edits: {
      type: "array",
      description: "Empty when drift is false",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "old_string", "new_string", "reason"],
        properties: {
          file: { type: "string", enum: SPEC_FILES },
          old_string: {
            type: "string",
            description:
              "Text to replace, copied verbatim from the current file including indentation. Must appear EXACTLY ONCE in that file — include surrounding lines until it is unique.",
          },
          new_string: { type: "string", description: "Replacement text" },
          reason: {
            type: "string",
            description:
              "One sentence: which code change makes this edit necessary",
          },
        },
      },
    },
  },
};

const system = `You maintain the architecture documentation for web-skeleton, a React +
Next.js web application monorepo. Code has just landed on the develop branch.
Your job is to decide whether that code makes anything in the specs wrong, and
to correct it.

The three specs and their scopes:
- docs/architecture/ARCHITECTURE_SPEC.md — system structure: workspaces and
  their roles, boundaries and dependency direction, the server/client boundary,
  data and persistence, the build and test pipeline.
- docs/architecture/API_SPEC.md — every HTTP-reachable surface of apps/web:
  route handlers, Server Actions, middleware; auth, request and response
  shapes, side effects.
- docs/architecture/FEATURE_SPEC.md — user-facing behavior, one entry per
  feature: route, behavior, the tests that pin it.

Each spec states its own contract at the top: "If this file and the code
disagree, the code is right — fix this file." That is the job.

How to judge drift. A spec has drifted when the code contradicts it or has
outgrown it:
- a documented route, Server Action, page, component contract, config key,
  or env var changed or disappeared
- a new one exists that the spec's own structure clearly means to cover
- documented behavior, a limit, or a default no longer matches the code
- a stated constraint ("None yet", "no database", "X is out of scope") is now false

It has NOT drifted for: refactors that preserve behavior, renamed internals the
spec never mentions, test-only changes, formatting, dependency bumps, or
anything the spec deliberately keeps at a higher level of abstraction. Prefer
returning drift: false over inventing work. A spec that is still true is the
normal outcome, not a failure.

Rules for edits:
- Only state what the diff proves. Never infer a route, prop, or behavior
  you cannot see in the code provided. If the diff is truncated and you are
  unsure, leave that part alone and say so in the summary.
- Keep edits minimal and surgical — change the sentence, table row, or code
  block that is wrong, not the section around it.
- Match the surrounding voice, formatting, heading depth, and table style
  exactly. These are hand-written documents; your edits should be invisible as
  edits.
- old_string must be copied verbatim from the file you were given, including
  leading whitespace, and must appear exactly once in that file. If a short
  anchor would be ambiguous, extend it with neighbouring lines until unique.
- Do not renumber sections, reflow prose, fix unrelated typos, or update a
  "last updated" date.
- Follow the specs' own conventions: describe what IS, never what is planned —
  no "will", no roadmap, no speculative sections. Delete the entry for a
  removed feature rather than marking it obsolete. Describe behavior and
  contracts, not implementation detail; name the file and the test that pins
  it rather than restating code.
- API_SPEC.md keeps a "How to document an endpoint (template)" section. It is
  documentation of the format, not a claim about the code — never edit or
  remove it, and follow its shape when adding a real endpoint.`;

const specSections = specs
  .map(
    ({ file, content }) => `### ${file}\n\n\`\`\`markdown\n${content}\n\`\`\``,
  )
  .join("\n\n");

const prompt = `Commit range on develop: ${range}

## Commits in the range

${commits || "(none)"}

## Files changed

${diffstat || "(no diffstat available)"}

## Diff

\`\`\`diff
${diff || "(no diff available — judge from the diffstat and commit messages)"}
\`\`\`

## Current architecture specs

${specSections}`;

// --- Apply -----------------------------------------------------------

function applyEdits(edits) {
  const applied = [];
  const failed = [];
  const buffers = new Map(specs.map(({ file, content }) => [file, content]));

  for (const edit of edits) {
    const content = buffers.get(edit.file);
    if (content === undefined) {
      failed.push({ ...edit, why: `not a spec file` });
      continue;
    }
    // Count occurrences against the running buffer, so an earlier edit that
    // changed this text is visible to the check rather than silently ignored.
    const parts = content.split(edit.old_string);
    if (parts.length === 1) {
      failed.push({ ...edit, why: "anchor text not found in the file" });
      continue;
    }
    if (parts.length > 2) {
      failed.push({
        ...edit,
        why: `anchor text appears ${parts.length - 1} times; must be unique`,
      });
      continue;
    }
    buffers.set(edit.file, parts.join(edit.new_string));
    applied.push(edit);
  }

  for (const { file, content } of specs) {
    const next = buffers.get(file);
    if (next !== content) fs.writeFileSync(file, next);
  }
  return { applied, failed };
}

function finish({ drift, summary, applied = [], failed = [] }) {
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        drift,
        summary,
        applied: applied.map(({ file, reason }) => ({ file, reason })),
        failed: failed.map(({ file, reason, why }) => ({ file, reason, why })),
      },
      null,
      2,
    )}\n`,
  );
}

// --- Run -------------------------------------------------------------

const client = new Anthropic();

try {
  // Streaming: the spec files plus a large diff make this a long request, and
  // a non-streaming call at this max_tokens risks an SDK HTTP timeout.
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    // Not a build failure: the docs are simply left alone this run.
    console.error(
      "Anthropic API declined the request:",
      JSON.stringify(response.stop_details),
    );
    finish({ drift: false, summary: "" });
    process.exit(0);
  }
  if (response.stop_reason === "max_tokens") {
    console.error(
      "Response truncated at max_tokens; the edit list would be incomplete.",
    );
    process.exit(1);
  }

  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) {
    console.error("No text block in response");
    process.exit(1);
  }

  const result = JSON.parse(text);
  if (!result.drift || result.edits.length === 0) {
    console.log("No drift: the specs still describe the code.");
    console.log(result.summary);
    finish({ drift: false, summary: result.summary });
    process.exit(0);
  }

  const { applied, failed } = applyEdits(result.edits);
  applied.forEach((e) => console.log(`[edit]   ${e.file} — ${e.reason}`));
  failed.forEach((e) =>
    console.log(`[skip]   ${e.file} — ${e.why} (${e.reason})`),
  );
  console.log(`${applied.length} edit(s) applied, ${failed.length} skipped.`);

  finish({
    drift: applied.length > 0,
    summary: result.summary,
    applied,
    failed,
  });
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    console.error("Anthropic API rate limited:", error.message);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
