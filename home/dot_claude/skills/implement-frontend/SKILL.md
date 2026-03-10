---
name: implement-frontend
description: Implement frontend UI features with spec-first workflow using Agent Teams. Team-lead orchestrates spec writing, review, human approval, implementation, and parallel verification.
disable-model-invocation: true
---

# Implement Frontend

You are the **team-lead**. You orchestrate the entire process by spawning teammates and managing tasks. You do NOT implement code yourself — you delegate everything.

All artifacts (specs, showboat docs, screenshots) go in nb (`~/.nb/home/`). Choose a short, slug-friendly name for the feature and use it for all file names.

## Phase 1: Spec + Test Plan

Create tasks for a **spec-writer** teammate:

1. **Write spec** at `~/.nb/home/<feature-slug>-spec.md`:
   - **Goal**: One sentence
   - **ASCII art layouts**: Every screen state (empty, loading, populated, error) using box-drawing characters
   - **Interaction flow**: Step-by-step user actions → outcomes
   - **Data flow**: Queries/mutations, fields used
   - **Edge cases**: Empty states, validation errors, permissions

2. **Write test plan** in the same file under `## Test Plan`:
   - Each TC has: description, preconditions, `agent-browser` commands, expected outcome
   - Screenshots captured at key steps

Spawn the spec-writer teammate to do this. Give it full context about the feature request.

## Phase 2: Review Loop

Spawn a **spec-reviewer** teammate to review `~/.nb/home/<feature-slug>-spec.md`:
- Are ASCII layouts complete for all states?
- Do test commands cover every interaction?
- Missing edge cases?
- Are assertions specific enough?

The spec-reviewer sends findings directly to the spec-writer via message. They loop between themselves up to 3 times until the reviewer passes.

## Phase 3: Human Approval

Present to the user:
- The ASCII layouts
- The test case list with expected outcomes

Ask: "Does this spec match what you want?"

**DO NOT proceed until the user explicitly approves.**

## Phase 4: Implement

Spawn an **implementer** teammate to write the code following the spec exactly. No extras, no shortcuts. The implementer must read the spec file before writing any code.

## Phase 5: Parallel Verification

After implementation completes, spawn ALL of these teammates simultaneously:

### Teammate: code-reviewer
Review the frontend changes on the current branch for quality, performance, accessibility.

### Teammate: static-checker
Run lint and typecheck on the changed packages. Fix any issues found.

### Teammate: test-runner (use frontend-tester agent)
Run the test plan from `~/.nb/home/<feature-slug>-spec.md`. Save results to `~/.nb/home/`.

### After test-runner completes → Teammate: test-reviewer
Run `showboat verify` on the test document to confirm results are reproducible. Then compare against the spec:
1. Does verification pass — are outputs reproducible?
2. Does each TC result match the expected outcome?
3. Do screenshots match the ASCII layouts?
4. Any visual regressions or unexpected UI states?

Return PASS/FAIL per TC with reasoning.

## Phase 6: Report

Collect results from all teammates. Present summary:

| Check | Status | Notes |
|-------|--------|-------|
| Code review | PASS/FAIL | ... |
| Lint | PASS/FAIL | ... |
| Typecheck | PASS/FAIL | ... |
| TC1 | PASS/FAIL | ... |
| TC2 | PASS/FAIL | ... |

If any check fails, resume the relevant teammate to fix, then re-verify.
