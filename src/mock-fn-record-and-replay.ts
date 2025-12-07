import { expect, Mock, vi } from "vitest";
import fs from "fs";
import path from "path";

import "./FulfillableMock";
import { FulfillableMock } from "./FulfillableMock";

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
                throw new Error(`Unreachable: No snapshot found and we are in update mode 'none'`);
            } else {
                // No snapshot and we are in new or all mode, call the real function and snapshot
                const returnValueReal = await options.realFunction(...args);
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: serializeReturnValue(returnValueReal),
                });
                return returnValueReal;
            }
        } else {
            // We have a snapshot, get the recorded args and return value
            const expected = JSON.parse(snapshotFile.contents);
            const argsAreEqual = areJsonObjectsEqual(serializeArgs(args), expected.args);

            if (argsAreEqual) {
                return deserializeReturnValue(expected.returnValue);
            } else if (updateMode !== "all") {
                // Args do not match, snapshot existed and we are not in all mode, fail the test
                await expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: expected.returnValue,
                });
                throw new Error("Unreachable");
            } else {
                // Args do not match and we are in all mode, call the real function and snapshot
                const realReturnValue = await options.realFunction(...args);
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
        const snapFiles = getSnapshotFiles(options.name);
        const missingCalls = snapFiles.slice(index).map(s => `  - ${s}`);

        if (index < snapFiles.length) {
            const msg = `${index} of ${snapFiles.length} calls made. Missing:\n${missingCalls.join("\n")}`;
            return { success: false, error: msg };
        } else {
            return { success: true };
        }
    };

    return mockFn;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Internal helpers

type AnyAsyncFunction = (...args: any[]) => Promise<any>;

type AsyncFunction<AsyncFn extends AnyAsyncFunction> = (
    ...args: Parameters<AsyncFn>
) => Promise<Awaited<ReturnType<AsyncFn>>>;

type SerializedCall = {
    args: JsonValue;
    returnValue: JsonValue;
};

function expectCallMatchesSnapshot(snapFilePath: string, call: SerializedCall) {
    const pretty = JSON.stringify(call, null, 4);
    return expect(pretty).toMatchFileSnapshot(snapFilePath);
}

function getSnapshotFiles(name: string) {
    const { snapshotState } = expect.getState();
    const snapsFolder = path.dirname(snapshotState.snapshotPath);

    return fs
        .readdirSync(snapsFolder)
        .filter(filename => filename.startsWith(name + "-call-") && filename.endsWith(".json"))
        .map(filename => path.join(snapsFolder, filename));
}

function areJsonObjectsEqual(obj1: JsonValue, obj2: JsonValue): boolean {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

function getSnapshotsUpdateMode(): "none" | "new" | "all" {
    return expect.getState().snapshotState["_updateSnapshot"];
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
