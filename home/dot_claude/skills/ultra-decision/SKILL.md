---
name: ultra-decision
description: Stress-test a planning, design, architecture, or strategy decision through adversarial rounds.
user-invocable: true
disable-model-invocation: true
---

Run an adversarial propose→review→revise process over a decision, driven by a persistent team of agents, and produce a decisive recommendation backed by every round's reasoning.

## Step 0 — Inputs and tasks

From the user's request, take the decision to stress-test and any stated controls: `rounds` (default 8), `options` = proposals per round (default 5), output directory, an explicit requirements rubric, explicit lenses, whether to skip investigation. Default anything unstated.

Set `OUT` to the user's directory if given, else `.claude-works/ultra-decision/<slug>`. Resolve it absolute (`git rev-parse --show-toplevel`, else `$HOME`) and `mkdir -p "$OUT/rounds"`.

Register tasks with TaskCreate: `Frame`, `Round 1`…`Round N`, `Synthesize`. Update their status as you go.

## Step 1 — Frame

Produce directly:
- **restatedQuestion** — the decision sharpened to remove ambiguity.
- **requirements** — 5–9 crisp, testable, measurable criteria. Use the user's rubric verbatim if given.
- **lenses** — exactly `options` orthogonal angles, each a SHORT uppercase key + one-sentence thesis, including at least one contrarian lens that attacks the premises. Use the user's lenses if given.
- **investigationQuestions** — facts worth verifying first; empty if the decision is self-contained.

Build `RUBRIC` = "REQUIREMENTS (the only rubric that matters):\n- " + the requirements joined.

Unless skipped or empty, spawn the investigation questions as parallel default subagents (one message): "Investigate ONLY this for decision '<restatedQuestion>'. Return a tight, evidence-cited answer (file:line / command output / source); if unknown say NOT FOUND and what you searched. QUESTION: <q>". Collect replies into an `EVIDENCE` block carried into every later prompt.

## Step 2 — Rounds

Spawn the team once, then drive it round by round with SendMessage so each agent revises its own work in one continuous session.

**Spawn (before round 1, single message):** `options`+1 named default subagents.
- Each lens → name `proposer-<KEY>`:
  ```
  Read ${CLAUDE_SKILL_DIR}/references/proposer.md and follow it.
  Lens: <KEY> — <THESIS>
  Decision: <restatedQuestion>
  <RUBRIC>
  <EVIDENCE>
  Rounds planned: <rounds>. Write each round's proposal to OUT/rounds/round-<NN>-<KEY>.md and reply with its summary.
  ```
- Reviewer → name `reviewer`:
  ```
  Read ${CLAUDE_SKILL_DIR}/references/reviewer.md and follow it.
  Decision: <restatedQuestion>
  <RUBRIC>
  <EVIDENCE>
  Rounds planned: <rounds>. Write each round's review to OUT/rounds/round-<NN>-review.md.
  ```

Keep only `settled` (locked decisions) and `trajectory`.

**For r = 1…rounds:**
1. SendMessage every `proposer-<KEY>` in parallel: `ROUND r. New locked decisions: <delta of settled, or none>. Your mandates: <reviewer's mandates for <KEY>, or "open">. Produce your round-r proposal, write OUT/rounds/round-<NN>-<KEY>.md, reply with its summary.` Collect replies.
2. SendMessage `reviewer`: `ROUND r. Score these, rewarding fixes and punishing ignored mandates:\n<each proposer's summary, labeled by lens>\nWrite OUT/rounds/round-<NN>-review.md, reply with: ranking+totals, per-lens fatal flaws, per-lens mandates for next round, newly-settled decisions, convergence read.`
3. Append the reviewer's newly-settled decisions to `settled` (dedupe); push `{round, topLens, topTotal}` to `trajectory`; complete the round task; print one line (top lens, total, convergence).

`NN` is the zero-padded round number. Run all `rounds` unless the reviewer reports full convergence with the top option scoring ≥8 on every requirement for two consecutive rounds.

## Step 3 — Synthesize

Write `OUT/FINAL-DECISION.md` following `${CLAUDE_SKILL_DIR}/references/synthesizer.md`, drawing on the final round's files `OUT/rounds/round-<last>-*.md`, `settled`, and `trajectory`. For 15+ rounds, delegate to a fresh default subagent:
```
Read ${CLAUDE_SKILL_DIR}/references/synthesizer.md and follow it.
Decision: <restatedQuestion>
<RUBRIC>
<EVIDENCE>
Locked decisions: <settled>
Read the final round's proposals and review: <OUT/rounds/round-<last>-*.md paths>
Trajectory: <trajectory>
Output file: OUT/FINAL-DECISION.md
```

## Step 4 — Report

Give the user the verdict in 1–2 lines, the path to `OUT/FINAL-DECISION.md`, and the `OUT/rounds/` directory.
