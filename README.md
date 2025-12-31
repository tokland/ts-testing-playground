# Declarative Function Mocks for Typescript

Traditional mocks often involve imperative and manual setup that may become
difficult to read and maintain. This project explores different patterns
to write declarative function mocks. It uses Vitest for the implementation, but the same
ideas should work also for Jest.

## Modules

### 1. Declarative Call Expectations

Define the complete sequence of expected calls (including arguments and return values), and the mock ensures that the functions receive the correct arguments and are invoked in the specified order.

- **Module:** [`mock-fn-calls.ts`](src/mock-fn-calls.ts)
- **Spec:** [`mock-fn-calls.spec.ts`](src/mock-fn-calls.spec.ts)

The mock can be adjusted for various scenarios (min/max calls, unsorted invocations, etc.).

### 2. Snapshot-Based Record & Replay

Record function calls into snapshots on the first run, then safely replay them on subsequent runs.
Supports pluggable JSON serialization and runtime validation.

- **Module:** [`mock-fn-record-and-replay.ts`](src/mock-fn-record-and-replay.ts)
- **Spec:** [`mock-fn-record-and-replay.spec.ts`](src/mock-fn-record-and-replay.spec.ts)

A common use case for this pattern is testing complex API calls in data repositories within clean/hexagonal architectures. In this scenario, you create a mock for functions passed as dependencies, which means you are effectively performing unit tests.

Like other snapshot‑based approaches, it is not particularly suited for TDD or as a formal specification. However, it provides a stable “green‑light” reference that makes refactoring safer without the burden of manually mocking functions. Once snapshots are in place, tests are deterministic and fast.

## Running the Project

```sh
$ nvm use
$ yarn install
$ yarn test
```

### LICENSE

MIT
