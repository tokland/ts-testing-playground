# Declarative Vitest Function Mocks

A playground exploring **declarative** patterns for mocking functions in Vitest.

## Why Declarative Mocks?

Traditional mocks often combine setup, behavior, and expectations directly inside test bodies. This quickly becomes difficult to read, reason about, and maintain.

## Modules

### 1. Declarative (Ordered) Call Expectations

Define the complete sequence of expected calls (arguments + return values),
and the mock ensures that calls match _exactly_ and in _order_.

- **Module:** [`mock-fn-calls.ts`](src/mock-fn-calls.ts)
- **Spec:** [`mock-fn-calls.spec.ts`](src/mock-fn-calls.spec.ts)

Useful when:

- You want **strict control** over call sequences.
- You prefer **declarative** test setup over imperative mocking.

### 2. Snapshot-Based Record & Replay

Record function calls into snapshots on the first run, then safely replay them on subsequent runs.
Supports pluggable JSON serialization and runtime validation.

- **Module:** [`mock-fn-record-and-replay.ts`](src/mock-fn-record-and-replay.ts)
- **Spec:** [`mock-fn-record-and-replay.spec.ts`](src/mock-fn-record-and-replay.spec.ts)

Useful when:

- You want **strict control** over call sequences.
- Store external APIs **stable mocks** without hand-maintaining them.
- You want **snapshot diffs** to inspect behavioral changes.
- Tests must be **deterministic**, **fast** and runnable **offline**.

## Running the Project

```sh
nvm use
yarn install
yarn test
```
