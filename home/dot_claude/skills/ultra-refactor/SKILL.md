---
name: ultra-refactor
description: Stress-test the design of a commit / branch / file through a team of opinionated refactor specialists.
user-invocable: true
disable-model-invocation: true
---

Run a team of aspect-specialist agents over a concrete review target, have each propose a grounded refactor, then have one critic adversarially review every report against the others, attempt the implementation, and report what survives contact with the code.

## Step 0 — Inputs and tasks

From the user's request, take the **review target** and any stated controls: `rounds` (default 3), an explicit aspect list.

Fix the **scope**: the commit/branch/PR/path the user named, else the current branch's diff against `origin/main`.

Write outputs under `OUT = .claude-works/ultra-refactor/<slug>/reports/`.

The **aspects** — the specialist lenses, used verbatim when spawning the team below. Default to exactly these five unless the user overrides; each agent's full thesis lives in its reference file:
- `TYPE` — Type-safety & totality → `references/aspect-type-safety.md`
- `DEPS` — Module dependency shape → `references/aspect-dependencies.md`
- `INVARIANT` — Invariant & business-logic consistency → `references/aspect-invariant.md`
- `FP` — Functional-programming purity → `references/aspect-fp.md`
- `SIMPLE` — Ruthless simplicity → `references/aspect-simplicity.md`

Register tasks with TaskCreate: `Round 1`…`Round N`, `Synthesize`, `Apply`. Update status as you go.

## Step 1 — Rounds

Spawn the persistent team once up front: one `general-purpose` analyst per aspect (named `analyst-<KEY>`) plus the `critic` (Step 2). Each analyst:
```
Read ${CLAUDE_SKILL_DIR}/references/analyst.md and ${CLAUDE_SKILL_DIR}/references/aspect-<key>.md. Follow both.
Scope <SCOPE>. Read the code to orient.
Each round, write your report to OUT/reports/round-<N>-<KEY>.md and reply with its summary.
```

Then for `rounds` rounds: the analysts report in parallel; once all of them have finished the round, the critic (Step 2) reviews every report against the others and implements. From round 2 on, each round's message hands the analyst the critic's feedback to revise against:
```
Round <r>. Critic's feedback on your last report: <per-aspect critique + implementation failures>. Conflicts to resolve: <cross-aspect deltas>. Sharpen your report and answer it.
```

## Step 2 — Critique (per round)

Once all analysts have finished the round, SendMessage the `critic`:
```
Read ${CLAUDE_SKILL_DIR}/references/critic.md and follow it.
ROUND r. Read these round-r reports and review them against each other: <OUT/reports/round-<NN>-*.md paths>
Write OUT/reports/round-<NN>-critique.md, reply with: per-aspect verdict (keep/revise/kill) + decisive reason, cross-aspect conflicts and tradeoffs, and for each proposal you attempted to implement — what you did, whether it compiled/tested, and what broke.
```

The critic MUST actually attempt the highest-value proposals in a scratch/worktree, run typecheck/lint/tests, and report concrete failures — not hypothesize.

## Step 3 — Synthesize

Write `OUT/FINAL-REFACTOR.md` following `${CLAUDE_SKILL_DIR}/references/synthesizer.md`, drawing on the final round's `OUT/reports/round-<last>-*.md` (including the critique). For long runs, delegate to a fresh `general-purpose` subagent with the same reference. The synthesis is the ordered, implementation-verified plan that drives Step 4 — prioritized, with rejected ideas and their disqualifying evidence.

## Step 4 — Apply

Implement `OUT/FINAL-REFACTOR.md` against the working tree and commit only when typecheck, lint, and tests are fully green. If any refactor can't pass, revert clean, feed the failure back, and restart from Step 1. Tolerate no errors.

## Step 5 — Report

Give the user: what was applied and verified green, anything that was skipped or failed (with the reason), the path to `OUT/FINAL-REFACTOR.md`, and the `OUT/reports/` directory.
