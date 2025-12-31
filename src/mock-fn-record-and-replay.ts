import { expect } from "vitest";
import fs from "fs";
import path from "path";

import "./FulfillableMock"; // Augment expect with toBeFulfilled matcher
import { FulfillableMock, FulfillableResult } from "./FulfillableMock";
import { jsonEquals, JsonValue } from "./json-equals";

/**
 * Snapshot-backed *record-and-replay* mock for async functions.
 *
 * Records function calls (arguments + results) as JSON snapshots on first run, then replays
 * them deterministically on subsequent runs.  Supports snapshotting both successful returns
 * and thrown errors.
 *
 * ## How It Works
 *
 * **First test run (record mode):**
 *   - Calls execute against the real function
 *   - Arguments, return values, and errors are serialized to individual JSON files
 *   - Files are named:  `__snapshots__/{name}-001.json`, `{name}-002.json`, etc.
 *
 * **Subsequent runs (replay mode):**
 *   - Calls are matched against existing snapshots by call order and arguments
 *   - Recorded return values are deserialized and returned (or errors re-thrown)
 *   - Mismatched arguments trigger snapshot diff failures (standard vitest workflow)
 *
 * **Assertions:**
 *   - `expect(mock).toBeFulfilled()` verifies all recorded snapshots were replayed
 *   - Leftover snapshots indicate missing test calls (prompts you to delete stale files)
 *
 * ## Serialization
 *
 * You must provide serialization functions for full control over snapshot format and type safety:
 *
 * **serialize:**
 *   - `args:  (args) => JsonValue` - Convert function arguments to JSON
 *   - `success: (value) => JsonValue` - Convert successful return values to JSON
 *   - `error: (err) => JsonValue` - Convert thrown errors to JSON
 *
 * **deserialize:**
 *   - `success: (json) => ReturnValue` - Reconstruct return values from JSON
 *   - `error: (json) => unknown` - Reconstruct errors from JSON (will be re-thrown)
 *
 * This design allows you to:
 *   - Strip non-serializable data (class instances, functions, circular refs)
 *   - Validate snapshots with runtime type checkers (Zod, io-ts, etc.)
 *   - Reconstruct proper error instances (not just plain objects)
 *
 * ## Vitest Snapshot Modes
 *
 * Vitest has three snapshot update modes:
 *
 *   - `"none"` (`CI=1 vitest`) - No snapshots created/updated.  Mismatches fail the test.
 *   - `"new"` (`vitest`) - New snapshots created, existing ones are NOT overwritten.
 *   - `"all"` (`vitest -u`) - All snapshots may be created or updated.
 *
 * The real function is only called in `"new"` or `"all"` modes when fresh data is needed.
 *
 * ### Interactive Workflow with `allowOnlyOneUpdatePerTest`
 *
 * Set `allowOnlyOneUpdatePerTest: true` so that only the **first** mismatched snapshot is
 * updated per test in `all` mode. This allows you to review each change individually.
 *
 * ## Example
 *
 * ```ts
 * import { z } from "zod";
 *
 * async function divAsync(a: number, b: number): Promise<number> {
 *     if (b === 0) throw new Error("Division by zero");
 *     return a / b;
 * }
 *
 * test("divAsync mock", async () => {
 *     const divMock = recordAndReplayFnMock({
 *         name: "div-async",
 *         fn: divAsync,
 *
 *         serialize: {
 *             args: args => args,  // Arguments are already JSON-safe
 *             success: value => value,  // Numbers are JSON-safe
 *             error: serializeError,  // Convert Error to { message }
 *         },
 *
 *         deserialize: {
 *             success: obj => z.number().parse(obj),  // No transformation, but validate snapshot type
 *             error: deserializeError,  // Reconstruct Error instance
 *         },
 *
 *         allowOnlyOneUpdatePerTest: true,
 *     });
 *
 *     // Success case
 *     expect(await divMock(1, 2)).toBe(3);
 *     expect(await divMock(5, 7)).toBe(12);
 *
 *     // Error case
 *     await expect(divMock(10, 0)).rejects.toThrow("Division by zero");
 *
 *     // Verify all snapshots were used
 *     expect(divMock).toBeFulfilled();
 * });
 * ```
 *
 * ## Snapshot File Format
 *
 * Each call generates a file like `__snapshots__/NAME-NNN.json`:
 *
 * ```json
 * {
 *   "args": [1, 2],
 *   "result": { "success": true, "value": 3 }
 * }
 * ```
 *
 * Or for errors:
 *
 * ```json
 * {
 *   "args": [10, 0],
 *   "result": { "success": false, "error": { "message": "Division by zero" } }
 * }
 * ```
 */

export type Options<Args extends unknown[], ReturnValue> = {
    name: string;
    fn: (...args: Args) => Promise<ReturnValue>;
    serialize: {
        args: (args: Args) => JsonValue;
        success: (val: ReturnValue) => JsonValue;
        error: (err: ErrorValue) => JsonValue;
    };
    deserialize: {
        success: (json: JsonValue) => ReturnValue;
        error: (json: JsonValue) => ErrorValue;
    };
    snapshotsFolder?: string;
    allowOnlyOneUpdatePerTest?: boolean;
};

type ErrorValue = unknown;

export type RecordAndReplayMock<Args extends unknown[], ReturnValue> = ((...args: Args) => Promise<ReturnValue>) &
    FulfillableMock;

export function recordAndReplayFnMock<Args extends unknown[], ReturnValue>(
    options: Options<Args, ReturnValue>,
): RecordAndReplayMock<Args, ReturnValue> {
    const allowOnlyOneUpdatePerTest = options.allowOnlyOneUpdatePerTest ?? false;
    const snapshotsFolder = options.snapshotsFolder ?? getDefaultSnapshotsFolder();
    const state = new MockState();

    const mockFn = async (...args: Args): Promise<ReturnValue> => {
        const mock = new RecordAndReplayFn({
            ...options,
            args: args,
            snapshotsFolder: snapshotsFolder,
            allowOnlyOneUpdatePerTest: allowOnlyOneUpdatePerTest,
            state: state,
        });

        switch (true) {
            case !mock.snapshotExists && mock.inMode(CREATE, CREATE_AND_UPDATE):
                return mock.callFunctionAndCreateSnapshot();
            case !mock.snapshotExists && mock.inMode(NONE):
                return mock.failNoSnapshot();
            case mock.snapshotExists && mock.argsMatch && mock.inMode(NONE, CREATE, CREATE_AND_UPDATE):
                return mock.deserializeResultFromSnapshot();
            case mock.snapshotExists && !mock.argsMatch && mock.inMode(CREATE_AND_UPDATE):
                return mock.callFunctionAndUpdateSnapshot();
            case mock.snapshotExists && !mock.argsMatch && mock.inMode(NONE, CREATE):
                return mock.failArgsMismatch();
            default:
                throw new Error("Unhandled mock state");
        }
    };

    return Object.assign(mockFn as RecordAndReplayMock<Args, ReturnValue>, {
        isFulfilled: () => {
            return isMockFulfilled({
                name: options.name,
                callsCount: state.index,
                snapshotsFolder: snapshotsFolder,
            });
        },
    });
}

/* Exported Error serialization/deserialization helpers, only for strict Error objects */

export function serializeError(err: unknown): { message: string } {
    if (err instanceof Error && Object.getPrototypeOf(err) === Error.prototype) {
        return { message: err.message };
    } else {
        const constructor = typeof err === "object" && err !== null ? err.constructor : null;
        const msg = [
            `Cannot serialize non-Error object (constructor: ${constructor?.name || "unknown"})`,
            "Extend serialize.error/deserialize.error to support that error type.",
        ].join(" ");
        throw new Error(msg);
    }
}

export function deserializeError(obj: JsonValue): Error {
    if (typeof obj === "object" && obj !== null && "message" in obj && typeof obj.message === "string") {
        return new Error(obj.message);
    } else {
        throw new Error("Cannot deserialize error from invalid object");
    }
}

/* Internal helpers */

type ConstructorOptions<Args extends unknown[], ReturnValue> = Required<Options<Args, ReturnValue>> & {
    args: Args;
    snapshotsFolder: string;
    allowOnlyOneUpdatePerTest: boolean;
    state: MockState;
};

class RecordAndReplayFn<Args extends unknown[], ReturnValue> {
    public mode: Mode;
    private snapshotFile: SnapshotFile;

    constructor(private options: ConstructorOptions<Args, ReturnValue>) {
        const currentIndex = this.options.state.index;
        this.options.state.incrementIndex();

        this.snapshotFile = getSnapshotFile({
            name: this.options.name,
            index: currentIndex,
            snapshotsFolder: this.options.snapshotsFolder,
        });
        this.mode = getSnapshotsMode();
    }

    inMode(...modesToCheck: Mode[]): boolean {
        return modesToCheck.includes(this.mode);
    }

    get argsMatch(): boolean {
        return jsonEquals(this.argsSerialized, this.expectedSerializedCall.args);
    }

    get snapshotExists(): boolean {
        return !!this.snapshotFile.call;
    }

    async failNoSnapshot(): Promise<never> {
        await this.expectResultToMatchSnapshot({ success: true, data: null });
        throw new Error("Unreachable");
    }

    async deserializeResultFromSnapshot(): Promise<ReturnValue> {
        const { result } = this.expectedSerializedCall;

        if (result.success) {
            return Promise.resolve(this.options.deserialize.success(result.data));
        } else {
            return Promise.reject(this.options.deserialize.error(result.error));
        }
    }

    async callFunctionAndCreateSnapshot(): Promise<ReturnValue> {
        return this.callFunctionAndSaveSnapshot({ allowOnlyOneUpdatePerTest: false });
    }

    async callFunctionAndUpdateSnapshot(): Promise<ReturnValue> {
        return this.callFunctionAndSaveSnapshot(this.options);
    }

    async failArgsMismatch(): Promise<never> {
        await this.expectResultToMatchSnapshot(this.expectedSerializedCall.result);
        throw new Error("Unreachable");
    }

    private async callFunctionAndSaveSnapshot(options: { allowOnlyOneUpdatePerTest: boolean }): Promise<ReturnValue> {
        if (options.allowOnlyOneUpdatePerTest && this.options.state.updatedCount > 0) {
            throw new Error("Snapshot update already performed in this test. Rerun the test to continue.");
        }

        this.options.state.incrementUpdates();

        try {
            const returnValue = await this.options.fn(...this.options.args);

            await this.expectResultToMatchSnapshot({
                success: true,
                data: this.options.serialize.success(returnValue),
            });

            return returnValue;
        } catch (err) {
            await this.expectResultToMatchSnapshot({
                success: false,
                error: this.options.serialize.error(err as ErrorValue),
            });

            throw err;
        }
    }

    private get argsSerialized() {
        return this.options.serialize.args(this.options.args);
    }

    private get expectedSerializedCall(): SerializedCall {
        return orThrow(this.snapshotFile.call, "Snapshot does not exist");
    }

    private expectResultToMatchSnapshot(result: SerializedCall["result"]) {
        const call: SerializedCall = {
            args: this.argsSerialized,
            result: result,
        };
        const serializedCallStr = JSON.stringify(call, null, 4) + "\n";
        return expect(serializedCallStr).toMatchFileSnapshot(this.snapshotFile.path);
    }
}

function orThrow<T>(value: T | null, message: string): T {
    if (value === null) throw new Error(message);
    return value;
}

function getSnapshotFiles(name: string, snapshotsFolder: string): string[] {
    if (!fs.existsSync(snapshotsFolder)) return [];

    return fs
        .readdirSync(snapshotsFolder)
        .filter(filename => filename.startsWith(name + "-") && filename.endsWith(".json"))
        .map(filename => path.join(snapshotsFolder, filename))
        .map(filePath => path.relative(process.cwd(), filePath));
}

function isMockFulfilled(options: { name: string; callsCount: number; snapshotsFolder: string }): FulfillableResult {
    const { name, callsCount, snapshotsFolder } = options;
    const snapshotFiles = getSnapshotFiles(name, snapshotsFolder);
    const missingCalls = snapshotFiles.slice(callsCount).map(s => `  - ${s}`);

    if (missingCalls.length > 0) {
        const error = [
            `${callsCount} of ${snapshotFiles.length} calls were made.`,
            `The following snapshot calls were missing:`,
            missingCalls.join("\n"),
            `If they are no longer relevant, delete these files.`,
        ];
        return { success: false, error: error.join("\n") };
    } else {
        return { success: true };
    }
}

type Result<Data, Error> = { success: true; data: Data } | { success: false; error: Error };

type SerializedCall = {
    args: JsonValue;
    result: Result<JsonValue, JsonValue>;
};

type Mode = (typeof modes)[keyof typeof modes];

const modes = {
    NONE: "NONE",
    CREATE: "CREATE",
    CREATE_AND_UPDATE: "CREATE_AND_UPDATE",
} as const;

function getSnapshotsMode(): Mode {
    const mode = expect.getState().snapshotState["_updateSnapshot"] as string;

    switch (mode) {
        case "none":
            return modes.NONE;
        case "new":
            return modes.CREATE;
        case "all":
            return modes.CREATE_AND_UPDATE;
        default:
            throw new Error(`Unsupported snapshot update mode: ${mode}`);
    }
}

function getDefaultSnapshotsFolder(): string {
    return path.dirname(expect.getState().snapshotState.snapshotPath);
}

type SnapshotFile = {
    path: string;
    call: SerializedCall | null;
};

function getSnapshotFile(options: { index: number; name: string; snapshotsFolder: string }): SnapshotFile {
    const { index, name, snapshotsFolder } = options;
    const filename = `${name}-${padZeros(index + 1, 3)}.json`;
    const snapshotPath = path.join(snapshotsFolder, filename);

    if (fs.existsSync(snapshotPath)) {
        const json = safeJsonParse(fs.readFileSync(snapshotPath, "utf-8"));
        if (!isSerializedCall(json)) console.error("Invalid snapshot content:", json);
        const call = isSerializedCall(json) ? json : null;
        return { call: call, path: snapshotPath };
    } else {
        return { call: null, path: snapshotPath };
    }
}

function safeJsonParse(json: string): JsonValue {
    try {
        return JSON.parse(json) as JsonValue;
    } catch {
        console.error("Failed to parse JSON:", json);
        return null;
    }
}

function padZeros(num: number, size: number): string {
    return num.toString().padStart(size, "0");
}

function isSerializedCall(obj: JsonValue): obj is SerializedCall {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "args" in obj &&
        "result" in obj &&
        typeof obj.result === "object" &&
        obj.result !== null &&
        "success" in obj.result
    );
}

// Encapsulated mock state to track updates and call index
class MockState {
    public updatedCount = 0;
    public index = 0;

    incrementUpdates() {
        this.updatedCount++;
    }

    incrementIndex() {
        this.index++;
    }
}

const { NONE, CREATE, CREATE_AND_UPDATE } = modes;
