# General Coding Principles and Best Practices

This document contains universal programming principles that can be applied across different projects and languages.

## 1. Coding Conventions and Standards

### Type Safety (for typed languages)
- **Avoid loose typing**: No `any` types or type assertions
- **Use strict type checking**: Enable all available strict checks
- **Explicit typing**: All function parameters and return types should be explicit
- **Prefer discriminated unions** over type guards for better type safety

### Code Organization
- **Separate concerns**: Keep UI/presentation logic separate from business logic
- **Maximize pure functions**: Extract logic into pure, testable functions
- **Use exhaustive pattern matching**: When branching on sum types, ensure all cases are handled
- **Immutable state**: Prefer immutable data structures and avoid direct mutations

## 2. Git/Commit Conventions

- **Write clear commit messages**: Describe specific changes concisely
- **Focus on "why" not "what"**: Explain the reasoning behind changes
- **Keep commits atomic**: One logical change per commit
- **Use imperative mood**: "Add feature" not "Added feature"
- **Follow conventional commits**: Use prefixes like `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- **Include context**: Provide background information that isn't obvious from the diff

## 3. Architecture Principles

### Directory Structure
- **Feature-based organization**: Group related files by feature/domain
- **Domain separation**: Keep core business logic separate from UI/framework code
- **Minimize import distance**: Keep dependencies close to where they're used

### State Management
- **Immutable updates**: Return new state objects rather than mutating existing ones
- **Use discriminated unions**: For state machines and complex state types
- **Readonly properties**: Mark data that shouldn't change as readonly

## 4. Testing Approaches

- **Test after each feature**: Run tests and linting after completing sub-tasks
- **Commit working code**: Only commit after tests and linter pass
- **Use built-in tools**: Prefer framework/runtime built-in testing tools when available

## 5. Development Workflow

### Commands
- **Standard commands**: Maintain consistent command patterns (`dev`, `build`, `lint`, `typecheck`)
- **Automated checks**: Run linting and type checking as part of the development process

### Import Management
- **Separate type imports**: Use `import type` for type-only imports when available
- **Be explicit**: Include file extensions in import paths when required by the tooling

### General Best Practices
- **Do only what's asked**: Avoid over-engineering or adding unnecessary features
- **Always prefer editing existing files** over creating new ones
- **Colocate related code**: Keep files that work together in the same directory
- **Maintain consistency**: Follow established patterns throughout the codebase
- **Document non-obvious decisions**: Explain architectural choices and trade-offs
- **Never commit secrets**: Avoid exposing or logging sensitive information
