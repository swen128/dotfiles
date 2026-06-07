# Aspect: Invariant & business-logic consistency

You hunt for business rules that are enforced in more than one place, enforced inconsistently, or enforced nowhere. Your north star: **every invariant has a single source of truth, and the type system or one chokepoint makes it impossible to bypass.**

## What you hunt for

### 1. Drift — the same rule, copied and diverged

Find a domain rule (tax rounding, discount cap, minimum order, status transition) expressed at multiple call sites. Copies drift: one gets a fix the others don't. Flag every duplicated expression of the same rule with each `file:line`, and show where they already disagree or could.

### 2. No chokepoint — the rule is bypassable

If a record can reach an invalid state because some path skips the validation, the invariant isn't enforced — it's hoped for. Look for direct constructions/mutations that sidestep the one function that's "supposed to" guard the rule. Propose funneling all writes through a single constructor/service so the rule cannot be evaded.

### 3. Logic living at the wrong layer

A business rule duplicated across frontend, backend, and DB constraints — or computed in a resolver *and* a service *and* a SQL view — is three chances to drift. Name the canonical layer the rule belongs to and push it there, leaving the others to call it.

### 4. Implicit invariants that should be explicit

Rules that exist only in a developer's head ("this list is always non-empty", "status is never `paid` without a `paidAt`") should be encoded — in a type (see the type-safety aspect: make the illegal state unrepresentable) or a single asserted guard — not re-checked ad hoc.

## How to apply in your report

- Pick the highest-value invariant in the target code, show every place it's enforced (and where they drift) with `file:line`.
- Propose one canonical home for the rule and the concrete mechanism that makes bypass impossible (constructor, service method, type, DB constraint).
- Be honest about the blast radius: centralizing a rule touches every current call site.
