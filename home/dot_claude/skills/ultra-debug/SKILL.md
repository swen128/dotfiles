---
name: ultra-debug
description: Investigate the root cause of a bug by spawning debugger agents per hypothesis and adversarially critiquing their findings. Use when asked to find the root cause of a production issue, debug a Sentry error, or run a deep/adversarial root-cause analysis. Triggers on "investigate root cause", "ultra-debug", "deep debug".
disable-model-invocation: false
argument-hint: <problem description>
---

# Ultra Debug

The user describes problem context.

Spawn a set of debugger agents to investigate the root cause of the issue, one per hypothesis. You act as the adversarial critic, challenging their findings via `SendMessage` over several rounds until each hypothesis is proved or disproved.

## Orchestration Workflow

### Phase 0: Gather Context (keep it brief)

Spend minimal time here — just enough to frame the problem and form hypotheses. Quick searches are fine; deep investigation is the debuggers' job.

1. **Sentry**: If a Sentry URL or issue ID is provided, fetch the issue summary (title, stack trace, first/last seen)
2. **Quick checks**: A few log or code searches to understand the affected area are okay
3. **Summarize in one paragraph**: WHAT is broken, WHEN it started, WHO is affected, WHERE in the system

Do NOT spend more than a few tool calls here. Move on to hypothesis formation quickly.

### Phase 1: Form Hypotheses

Based on the summary and your general knowledge of the system, generate **5 distinct, testable hypotheses**. Each hypothesis must be:

- **Specific**: names a concrete mechanism (code path, data state, timing condition, external dependency)
- **Testable**: can be confirmed or refuted with available evidence (logs, code, data, errors)
- **Independent**: does not overlap significantly with other hypotheses

### Phase 2: Spawn Debuggers

Spawn one debugger per hypothesis with the `Agent` tool, all in parallel and `run_in_background: true` so they investigate concurrently. Give each a distinct `name:` (e.g. `debugger-1`) so you can address it, and a prompt containing: the path to its instructions (`~/.claude/skills/ultra-debug/references/debugger.md`), its one assigned hypothesis, and the Phase 0 context. Each debugger sends its findings to you and answers your challenges via `SendMessage`.

### Phase 3: Critique

You are the adversarial critic. You do NOT investigate or collect evidence yourself — that is the debuggers' job. Your role is to **review, question, reject, and demand proof** until only bulletproof conclusions remain. You succeed when weak hypotheses are eliminated by unanswered challenges and the surviving one has gap-free evidence; you fail when a wrong root cause passes unchallenged or the investigation ends in hedged, unverifiable claims.

1. Debuggers send you findings as they go; background-agent completions notify you automatically
2. Challenge each finding via `SendMessage` to that debugger, with actionable, specific demands. If one debugger's evidence bears on another's hypothesis, forward it
3. Allow **up to 5 rounds** of challenge-response per hypothesis, until each is proved or disproved
4. If a new hypothesis emerges during investigation, spawn an additional debugger if warranted

Apply these challenges to every finding:

| Test | Question to Ask | Purpose |
|------|----------------|---------|
| Causation vs. Correlation | "You showed X happened before Y — but what proves X **caused** Y?" | Reject correlation-as-causation |
| Alternative Explanations | "Could this same evidence be explained by Z instead?" | Force debuggers to rule out alternatives |
| Confounders | "Did you account for [specific factor]? How?" | Check completeness |
| Contradictions | "If your hypothesis is true, then [consequence] should also be true — did you verify that?" | Test internal consistency |
| Timeline | "You claim A caused B, but did you verify A happened **before** B with timestamps?" | Verify causal ordering |
| Reachability | "You cite this code path — but is it actually executed under the conditions of this bug?" | Verify feasibility |
| Sufficiency | "You have one data point. What rules out coincidence?" | Demand statistical/logical sufficiency |
| Culprit Change | "Which specific commit or PR introduced this bug? Show the diff." | Pin the cause to a concrete change |
| Release Timing | "Does the deploy/release timestamp of that change align with when the issue first appeared?" | Verify the change was live when the issue started |

Every challenge you send MUST: **quote** the specific claim, explain **why** the evidence is insufficient, state **exactly what evidence** would satisfy you (be concrete: "show me the log entry with timestamp T proving X called Y"), and propose an **alternative explanation** the debugger must rule out.

Reject and demand correction for any argument that uses hedge words, relies on correlation without causation, assumes runtime or code behavior without citing a log/trace or specific file:line, hand-waves over timing/ordering/concurrency, cites "common knowledge" instead of evidence, or presents a single data point as proof. When you reject, say what is missing, what evidence would satisfy you, and what alternative the debugger must disprove.

Assign each hypothesis a verdict: **SURVIVED** (all challenges answered with concrete evidence, no gaps, alternatives ruled out), **WEAKENED** (some challenges unanswered or evidence partial), or **ELIMINATED** (the debugger's own evidence contradicts it, or critical challenges went unanswered).

### Phase 4: Synthesize Report

After every debugger reports its final assessment and you have resolved your challenges:

1. Collect all findings, evidence, and debate outcomes
2. Determine the consensus:
   - If exactly one hypothesis **SURVIVED** your challenges: status = **CONFIRMED**
   - If multiple survived or none did: status = **INCONCLUSIVE**
3. Write the report to `.claude-works/ultra-debug-<name>/report.md`
4. Present the report to the user

## Report Template

```markdown
# <title>

**Date**: YYYY-MM-DD
**Status**: CONFIRMED | INCONCLUSIVE

## Problem Statement

<What is broken. When it started. Who is affected. How it manifests.>

## Root Cause

<If CONFIRMED: Single definitive statement of the root cause, with primary evidence reference.>
<If INCONCLUSIVE: What was eliminated and what remains unresolved.>

## Evidence

| # | Finding | Source |
|---|---------|--------|
| 1 | <concrete finding> | <file:line / log timestamp / query / Sentry event ID> |
| 2 | ... | ... |

## Investigation Timeline

| Hypothesis | Verdict | Summary |
|------------|---------|---------|
| <hypothesis 1> | CONFIRMED / DISPROVED | <one line> |
| <hypothesis 2> | CONFIRMED / DISPROVED | <one line> |

## Debate Log

### Hypothesis 1: <name>
- **Debugger finding**: <summary with evidence refs>
- **Critic challenge**: <the challenge and its basis>
- **Resolution**: <how it was resolved, with evidence>

### Hypothesis 2: <name>
...

## Recommendations

<Concrete, actionable next steps based on findings. Reference specific code locations.>
```

## Strict Rules

### Language Rules

The final report MUST NOT contain any of these hedge words or phrases:

> likely, unlikely, maybe, perhaps, possibly, probably, might, could (expressing uncertainty),
> appears to, seems to, seems like, it looks like, we think, we believe,
> should be (expressing uncertainty), in theory

Every statement must be either:
- A **fact** backed by cited evidence in the Evidence table, OR
- Explicitly labeled as **[UNVERIFIED]** with a note on what evidence is missing

### Evidence Rules

- Code references: markdown link with `file:line` as link text and GitHub permalink with commit SHA as URL (e.g., `[/path/to/file.ts:142](https://github.com/org/repo/blob/<commit-sha>/path/to/file.ts#L142)`). Run `git rev-parse HEAD` to get the current commit SHA.
- Log references: timestamp and log source
- Database findings: the exact query used (reproducible)
- Sentry references: event ID or issue ID with link
- Git references: commit hash

### Scope Rules

- Do NOT fix the bug — only identify the root cause
- Do NOT modify any source files
- Do NOT speculate about fixes beyond the Recommendations section
- The report is the sole deliverable
