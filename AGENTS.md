# AGENT.md

## Product naming

Always refer to the product as PTP in documentation, UI labels, and conversation. Use “Phile Transfer Protocol” only when explaining the name or pronunciation: PTP (pronounced “Phile Transfer Protocol”), with “Phile” combining PHP and file. Keep literal package names, filesystem paths, and existing code identifiers intact.

## Coding Style

Follow these conventions consistently unless explicitly told otherwise.

The goal is:
- readability
- maintainability
- low cognitive overhead
- future debugging clarity
- predictable structure
- explicit behavior over cleverness

Code should feel easy to scan vertically.

---

# General Philosophy

- Prefer explicit code over clever code.
- Prefer readability over brevity.
- Prefer maintainability over abstraction purity.
- Optimize for future debugging and modification.
- Write code that is easy to understand while tired or under pressure.
- Avoid unnecessary magic or hidden behavior.
- Avoid overengineering.
- Avoid architectural ceremony.

---

# Formatting

Always use single quotes unless the string itself has to contain single quotes for some reason. Never use em dashes, use commas instead.

## Braces

Opening braces stay on the same line.

Correct:

```ts
if (condition) {
   doThing();
}
```

Incorrect:

```ts
if (condition)
{
   doThing();
}
```

No inline conditions unless they're es5/es6 style short conditions. Use brackets almost always.
---

## Blank Lines

Use blank lines between logical sections.

Separate:
- variable setup
- validation
- loops
- conditionals
- transformations
- returns

Prefer vertical readability.

---

# Variables

## Naming

Use descriptive variable names.

Avoid:
- single-letter variables
- vague names
- abbreviations unless universally understood

Exception:
- simple loop counters (`i`, `j`)
- extremely local obvious cases

---

## Intermediate Variables

Prefer intermediate variables over deeply nested expressions.

---

# Control Flow

## Inline Statements

Never use inline:
- if
- for
- while

Correct:

```ts
if (isValid) {
   execute();
}
```

Incorrect:

```ts
if (isValid) execute();
```

---

## Ternaries

Avoid ternaries unless extremely small and obvious.

---

## Guard Clauses

Prefer early validation and early returns/throws.

---

# Functions

## Function Size

Functions should generally do one clear thing.

Break apart:
- large branching logic
- unrelated responsibilities
- deeply nested behavior

---

## Parameters

Prefer explicit named structures over positional arguments when parameter count grows.

---

## Return Flow

Prefer explicit returns.

---

# TypeScript

## Types

Use explicit types where useful.

Prefer:
- extracted types
- named interfaces
- readable structures

Avoid giant inline types when reused or complex.

---

## Visibility

Use explicit visibility modifiers in classes.

---

## Imports

Keep imports compact and readable.

Correct:

```ts
import {Config} from "./Config";
```

Use source prefixes when possible, like "@/components/File"

---

## Utils

Utility functions are useful. Keep them in a util folder in the src folder. They should be exported helped functions and in rare cases classes where it makes sense.

--

## Classes

Prefer classes for:
- stateful systems
- utilities with lifecycle
- structured domain logic

Avoid unnecessary functional abstraction layers.

---

# Vue

Vue SFC order is always:

```vue
<script setup lang="ts">
</script>

<template>
</template>

<style lang="scss">
</style>
```

---

## Vue Style Rules

- Use `<script setup lang="ts">`
- Styles use SCSS
- Separate large logic into composables/components
- Keep templates readable vertically
- Avoid excessive inline logic in templates

---

# CSS / SCSS

- Use SCSS
- Group related styles together
- Prefer nesting sparingly
- Avoid extremely deep nesting
- Keep spacing visually readable

---

# Architecture Preferences

## Preferred

- explicit APIs
- predictable data flow
- thin abstractions
- deterministic behavior
- readable file structures
- operational clarity

## Avoid

- framework magic
- hidden behavior
- unnecessary abstractions
- inversion-of-control-heavy patterns
- clever metaprogramming
- excessive chaining
- architecture astronaut code

---

# Error Handling

- Fail loudly when appropriate.
- Throw descriptive errors.
- Include useful debugging context.
- Avoid swallowing exceptions silently.

---

# Comments

Comments should explain:
- why
- intent
- edge cases
- reasoning

Do not comment obvious code.

---

# Preferred Code Feel

Code should feel:
- explicit
- stable
- vertically readable
- operational
- maintainable
- low surprise
- easy to debug
- easy to scan quickly

Avoid code that feels:
- overly condensed
- overly abstract
- "smart"
- fragile
- difficult to mentally trace
