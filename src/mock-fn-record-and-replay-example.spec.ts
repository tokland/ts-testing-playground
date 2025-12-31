import { expect, describe, it } from "vitest";
import { z } from "zod";

import { recordAndReplayFnMock, serializeError, deserializeError } from "./mock-fn-record-and-replay";

async function div(numerator: number, denominator: number): Promise<number> {
    if (denominator === 0) {
        throw new Error("Division by zero");
    } else {
        return numerator / denominator;
    }
}

describe("Custom declarative snapshot mocks", () => {
    it("should record and replay successful calls", async () => {
        const divMock = getDivMock("div-success");

        await expect(divMock(6, 2)).resolves.toBe(3);
        await expect(divMock(10, 5)).resolves.toBe(2);
        expect(divMock).toBeFulfilled();
    });

    it("should record and replay error and successful calls", async () => {
        const divMock = getDivMock("div-error");

        await expect(divMock(4, 0)).rejects.toThrow("Division by zero");
        await expect(divMock(9, 3)).resolves.toBe(3);
        expect(divMock).toBeFulfilled();
    });
});

function getDivMock(name: string) {
    // This test is used in the Vitest runner tests, which sets CI=1 for 'none' mode.
    overrideSnapshotUpdateModeWhenInvokedFromVitestRunnerHack();

    return recordAndReplayFnMock({
        name: name,
        fn: div,
        serialize: {
            args: args => args,
            success: value => value,
            error: serializeError,
        },
        deserialize: {
            success: obj => z.number().parse(obj),
            error: deserializeError,
        },
        snapshotsFolder: process.env.SNAPSHOTS_FOLDER,
        allowOnlyOneUpdatePerTest: Boolean(process.env.ALLOW_ONLY_ONE_UPDATE_PER_TEST ?? "1"),
    });
}

function overrideSnapshotUpdateModeWhenInvokedFromVitestRunnerHack() {
    const state = expect.getState().snapshotState;

    if (process.env.CI) {
        // This is only needed when invoked from Vitest runner.
        state["_updateSnapshot"] = "none";
    }
}
