import { expect, Mock, vi } from "vitest";
import fs from "fs";
import path from "path";

import "./FulfillableMock";
import { FulfillableMock } from "./FulfillableMock";
import { jsonEquals, JsonValue } from "./json-equals";

/**
 * Utility for creating snapshot-backed *record-and-replay* mocks for async functions in Vitest.
 *
 * On the first test run, calls to the wrapped function are:
 *   - Executed against the real function.
 *   - Serialized (arguments + return value).
 *   - Stored as individual JSON snapshot files.
 *
 * On subsequent runs, calls are:
 *   - Matched against existing snapshots.
 *   - Replayed deterministically using the recorded return values.
 *
 * This provides stable, declarative mocks that behave identically across machines and
 * test runs, while still giving you full visibility through snapshot diffs when behavior changes.
 *
 * The mock also tracks how many calls were consumed, allowing you to assert that:
 *   - All recorded calls have been replayed (`toBeFulfilled()`).
 *   - Extra or missing calls surface as snapshot mismatches.
 *
 * ## Serialization
 *
 * You must provide:
 *   - `serializeArgs` — converts the function's arguments into a JSON-compatible value.
 *   - `serializeReturnValue` — converts the resolved return value into JSON-compatible form.
 *   - `deserializeReturnValue` — performs the inverse operation when replaying.
 *
 * These functions give you full control over the shape and type safety of your snapshots.
 *
 * ## Snapshot Update Behavior (for developers)
 *
 * Vitest has three snapshot update modes:
 *   - `"none"` — snapshots must match exactly; any difference fails the test.
 *   - `"new"`  — new snapshots are created, but existing ones are not overwritten.
 *   - `"all"`  — all snapshots may be updated if arguments differ.
 *
 * This module respects these modes when recording and replaying calls with an exception:
 *  - When in `"all"` mode, only the first mismatched snapshot is updated per test run.
 *    This allows you to review and accept changes one at a time, rather than having
 *    all snapshots updated at once.
 *
 * ## Simple Example
 *
 * ```ts
 * async function add(a: number, b: number): Promise<number> {
 *     return a + b;
 * }
 *
 * const add_ = recordAndReplayFnCalls<typeof add>({
 *     name: "add",
 *     realFunction: add,
 *
 *     // JSON-compatible serialization
 *     serializeArgs: args => args,
 *     serializeReturnValue: value => value,
 *
 *     // Type-safe deserialization (using Zod)
 *     deserializeReturnValue: obj => z.number().parse(obj)
 * });
 *
 * // On first run: executes real function and records snapshots.
 * // On later runs: replays recorded results deterministically.
 *
 * expect(await add_(1, 2)).toBe(3);
 * expect(await add_(5, 7)).toBe(12);
 *
 * // Ensures all recorded calls were consumed
 * expect(add_).toBeFulfilled();
 * ```
 */

export function recordAndReplayFnCalls<Fn extends AnyAsyncFunction>(options: {
    name: string;
    realFunction: Fn;
    serializeArgs: (args: Parameters<Fn>) => JsonValue;
    serializeReturnValue: (obj: Awaited<ReturnType<Fn>>) => JsonValue;
    deserializeReturnValue: (obj: JsonValue) => Awaited<ReturnType<Fn>>;
}): Mock<AsyncFunction<Fn>> & FulfillableMock {
    const { serializeArgs, serializeReturnValue, deserializeReturnValue } = options;
    let index = 0;

    const mockFn = vi.fn<AsyncFunction<Fn>>(async (...args) => {
        const currentIndex = index++;
        const snapshotFile = getSnapshotFile(currentIndex, options.name);
        const updateMode = getSnapshotsUpdateMode();

        if (!snapshotFile.contents) {
            if (updateMode === "none") {
                // No snapshot and we are not in new/all mode, fail the test comparing with null
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: null,
                });
                throw new Error("Invariant broken");
            } else {
                // No snapshot and we are in <new> or <all> mode, call the real function and snapshot
                const returnValueReal = await options.realFunction(...args);
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: serializeReturnValue(returnValueReal),
                });
                return returnValueReal;
            }
        } else {
            // We have a snapshot, get the recorded args and return value
            const expected = JSON.parse(snapshotFile.contents) as SerializedCall;
            const argsAreEqual = jsonEquals(serializeArgs(args), expected.args);

            if (argsAreEqual) {
                return deserializeReturnValue(expected.returnValue);
            } else if (updateMode !== "all") {
                // Args do not match and we are not in <all> mode, fail the test
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: expected.returnValue,
                });
                throw new Error("Unreachable");
            } else {
                // Args do not match and we are in <all> mode, call the real function and snapshot
                const realReturnValue = (await options.realFunction(...args)) as Awaited<ReturnType<Fn>>;
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: serializeReturnValue(realReturnValue),
                });
                preventFurtherSnapshotUpdates();
                return realReturnValue;
            }
        }
    }) as Mock<AsyncFunction<Fn>> & FulfillableMock;

    mockFn.isFulfilled = () => {
        const snapshotFiles = getSnapshotFiles(options.name);
        const missingCalls = snapshotFiles.slice(index).map(s => `  - ${s}`);

        if (missingCalls.length > 0) {
            const msg = [
                `${index} of ${snapshotFiles.length} calls were made. Missing calls:`,
                missingCalls.join("\n"),
                `If any of these calls are not expected anymore, remove their snapshot files.`,
            ].join("\n");
            return { success: false, error: msg };
        } else {
            return { success: true };
        }
    };

    return mockFn;
}

// Internal helpers

type AnyAsyncFunction = (...args: any[]) => Promise<any>;

type AsyncFunction<AsyncFn extends AnyAsyncFunction> = (
    ...args: Parameters<AsyncFn>
) => Promise<Awaited<ReturnType<AsyncFn>>>;

type SerializedCall = {
    args: JsonValue;
    returnValue: JsonValue;
};

function expectCallMatchesSnapshot(snapshotFilePath: string, call: SerializedCall) {
    const pretty = JSON.stringify(call, null, 4);
    return expect(pretty).toMatchFileSnapshot(snapshotFilePath);
}

function getSnapshotFiles(name: string) {
    const { snapshotState } = expect.getState();
    const snapsFolder = path.dirname(snapshotState.snapshotPath);

    return fs
        .readdirSync(snapsFolder)
        .filter(filename => filename.startsWith(name + "-call-") && filename.endsWith(".json"))
        .map(filename => path.join(snapsFolder, filename))
        .map(filePath => path.relative(__dirname, filePath));
}

function getSnapshotsUpdateMode(): "none" | "new" | "all" {
    const mode = expect.getState().snapshotState["_updateSnapshot"];

    if (mode === "none" || mode === "new" || mode === "all") {
        return mode;
    } else {
        throw new Error(`Unknown snapshot update mode: ${mode}`);
    }
}

// This is not the typical behaviour for jest/vitest, but this way a diff is shown for every
// snapshot that changes (the user may update them one by one by pressing 'u' in watch mode)
function preventFurtherSnapshotUpdates() {
    expect.getState().snapshotState["_updateSnapshot"] = "none";
}

function getSnapshotFile(currentIndex: number, name: string): { contents: string | null; path: string } {
    const snapshotsFolder = path.dirname(expect.getState().snapshotState.snapshotPath);
    const snapshotFilePath = path.join(snapshotsFolder, `${name}-call-${currentIndex + 1}.json`);
    const contents = fs.existsSync(snapshotFilePath) ? fs.readFileSync(snapshotFilePath, "utf-8") : null;
    return { contents: contents, path: snapshotFilePath };
}
