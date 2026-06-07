# Aspect: Type-safety & totality

Source: "Totality is All You Need" (Dinii). This is your full thesis — apply it to the target code. Do not link out; everything you need is here.

## Core thesis

Strict type safety through **total functions** and **discriminated unions** is the primary mechanism to prevent bugs and cut review burden. Prefer automated static checks (types, tests) that are *extremely strict* — accept false positives (rejecting valid code) to eliminate false negatives (missed bugs). Reviewers should be able to skim types instead of reading every implementation.

## What you hunt for

### 1. Partial functions

A **partial** function returns a defined, correctly-typed value for only *some* inputs; the rest are undefined/thrown/`undefined`-returning. A **total** function is defined for every input of its type. Flag partials.

```typescript
// PARTIAL — falls through with no return for unhandled discounts
const getDiscountAmount = (subtotal: number, discount: Discount): number => {
  if (discount.rate !== undefined) return subtotal * discount.rate;
  if (discount.fixedAmount !== undefined) return discount.fixedAmount;
  // missing return → bug hidden in caller's assumptions
};

// TOTAL — compiler enforces every case
const getDiscountAmount = (subtotal: number, discount: Discount): number => {
  switch (discount.kind) {
    case "percentage": return subtotal * discount.rate;
    case "fixed":      return discount.fixedAmount;
  }
};
```

### 2. Illegal states that are representable

Product types of optionals multiply invalid combinations. `{ rate?, upperLimit?, fixedAmount? }` = 2³ = 8 representable states, only 2 valid (`{}` and `{ rate, fixedAmount }` are both nonsense the type permits). Replace with a discriminated union — addition, not multiplication of states:

```typescript
type Discount = PercentageDiscount | FixedDiscount;
interface PercentageDiscount { kind: "percentage"; rate: number; upperLimit: number }
interface FixedDiscount      { kind: "fixed";      fixedAmount: number }
// 1 + 1 = 2 representable states, all valid
```

The discriminator (`kind`) unlocks exhaustive `switch` narrowing.

### 3. Runtime constraints not expressed in types → smart constructors

When a type can't express a rule (`0 < rate < 1`), use a nominal type with a private constructor so values can only exist after validation ("parse, don't validate"):

```typescript
class Ratio {
  private constructor(readonly value: number) {}
  static create(value: number): Ratio | null {
    return 0 < value && value < 1 ? new Ratio(value) : null;
  }
}
```

### 4. Escape hatches and exhaustiveness breakers

Flag every: `any`, `as` assertion, `is` user-defined type guard used to launder types, `default:` in a `switch` over a union (it silently swallows new variants and kills exhaustiveness), and unchecked indexed access (`arr[i]` typed as non-`undefined`). These each multiply error patterns.

## How to apply in your report

- Find real partial functions, optional-soup interfaces, casts, and `default` cases — each with `file:line`.
- Propose the total-function / discriminated-union / smart-constructor rewrite concretely (before → after).
- Make illegal states unrepresentable; let the compiler do the reviewing.
