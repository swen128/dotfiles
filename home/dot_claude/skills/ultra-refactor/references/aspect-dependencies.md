# Aspect: Module dependency shape

Source: "Readable code explained in dependency graphs" (Dinii). This is your full thesis — apply it to the target code. Do not link out.

## Core thesis

Readability tracks the shape of the dependency graph. Code is readable when related parts are **localized and explicit**. Model code as a directed graph: a vertex is a unit (variable, function, class, module); an edge `A→B` means "to understand A you must first understand B." Cognitive cost of a vertex = understanding it + recursively understanding everything it depends on.

## What you hunt for

### 1. Cycles

Mutable state and circular module dependencies create loops in the graph, forcing a reader to hold all connected nodes in mind at once — cost explodes. **Acyclicity is the critical constraint.** Immutable values and one-directional dependencies keep the graph a DAG.

```typescript
// Cyclic / mutable — reader must trace the whole loop
let subtotal = 0;
for (const item of items) subtotal += calculate(item);

// Acyclic / declarative — pure composition, tree-shaped
const subtotal = sumBy(items, calculate);
```

### 2. Loose coupling, high cohesion

Good code forms **clusters**: few arrows crossing cluster boundaries (loose coupling), dense related vertices inside (high cohesion). A clean cluster can be mentally "folded" into one unit — complexity drops from O(n) to O(k), k ≪ n. Heuristic: cluster quality ≈ external dependencies / internal density. Flag modules with many inbound/outbound cross-boundary edges and scattered related logic.

### 3. Scope as a structural wall

Variable scope "prevents inbound arrows" — a function-local can't be reached from outside, enforcing cluster boundaries mechanically. Maximize locality; the worst offenders are mutable global/shared state (a shared mutable DB across code versions is the extreme case). Constants and loggers are safe globals because they create only one-directional edges — target *mutable/stateful* globals, not all globals.

### 4. Direction & layering

Side effects (DB, I/O, network) belong at the architectural **edges** (entry points), not in core logic, so contamination stays contained and the core stays legible. Dependencies should point: impure shell → pure core, never the reverse. Flag side-effecting code buried in business logic and dependencies pointing the wrong way.

### 5. Explicitness aids

- **Dependency injection** — pass dependencies as explicit params instead of reaching for hidden globals/closures.
- **Static types** — make implicit dependencies explicit and let a reader skip an implementation based on the signature alone.
- **Naming** — a good name (`factorial`, not `f`) lets the reader fold a subgraph without inspecting it.

## Anti-patterns to name

Mutable global state; circular module dependencies; implicit params smuggled through closures; untyped params forcing call-site inspection; related logic scattered across files.

## How to apply in your report

- Draw (in prose or a small graph) the actual dependency edges; point at real cycles, wrong-direction edges, and leaky clusters with `file:line`.
- Propose concrete cuts: break a cycle, invert a dependency, push a side effect to the edge, fold a cluster behind a clean interface.
