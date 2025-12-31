import { expect, describe, test } from "vitest";
import { startVitest, Vitest } from "vitest/node";
import fs from "fs";
import path from "path";

describe("No snapshots", () => {
    test("mode='none' -> test fails, no snapshots created", async () => {
        deleteSnapshotFiles();
        const testRun = await runTest({ mode: "none" });

        expectTestRunToHaveFailed(testRun);
        expectNoSnapshotFilesToExist();
    });

    test("mode='new' -> test succeeds, snapshots created", async () => {
        deleteSnapshotFiles();
        const testRun = await runTest({ mode: "new" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });

    test("mode='all' -> test succeeds, snapshots created", async () => {
        deleteSnapshotFiles();
        const testRun = await runTest({ mode: "all" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });
});

describe("With correct snapshots", () => {
    test("mode='none' -> test succeeds, snapshots used", async () => {
        writeSnapshotFiles();
        const testRun = await runTest({ mode: "none" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });

    test("mode='new' -> test succeeds, snapshots used", async () => {
        writeSnapshotFiles();
        const testRun = await runTest({ mode: "new" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });

    test("mode='all' -> test succeeds, snapshots used", async () => {
        writeSnapshotFiles();
        const testRun = await runTest({ mode: "all" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });
});

describe("With one incorrect snapshot", () => {
    test("mode='none' -> test fails, snapshot not updated", async () => {
        writeSnapshotFiles({ invalid: [1] });
        const testRun = await runTest({ mode: "none" });

        expectTestRunToHaveFailed(testRun);
    });

    test("mode='new' -> test fails, snapshot not updated", async () => {
        writeSnapshotFiles({ invalid: [1] });
        const testRun = await runTest({ mode: "new" });

        expectTestRunToHaveFailed(testRun);
    });

    test("mode='all' -> test succeeds, snapshot updated", async () => {
        writeSnapshotFiles({ invalid: [1] });
        const testRun = await runTest({ mode: "all" });

        expectTestRunToHaveSucceeded(testRun);
    });
});

describe("With two incorrect snapshots", () => {
    test("mode='all', only one update allowed -> test fails, only first snapshot updated", async () => {
        writeSnapshotFiles({ invalid: [1, 2] });
        const testRun = await runTest({ mode: "all" });

        expectTestRunToHaveFailed(testRun);

        const snapshots = getSnapshotFiles(mockName);
        expect(snapshots.length).toBe(2);

        const [file1, file2] = assertArray(snapshots, 2);
        expectJsonContents(file1, validCalls.call1);
        expectJsonContents(file2, invalidCalls.call2);
    });

    test("mode='all', all updates allowed -> test succeeds, both snapshots updated", async () => {
        writeSnapshotFiles({ invalid: [1] });
        const testRun = await runTest({ mode: "all" });

        expectTestRunToHaveSucceeded(testRun);
        expectSnapshotFilesToExistWithValidContent();
    });
});

/* Helpers */

const snapshotsFolder = path.join(__dirname, "__snapshots-example__");

type SnapshotUpdateMode = "none" | "new" | "all";

async function runTest(options: { mode: SnapshotUpdateMode }): Promise<Vitest> {
    const snapshotOptions = (() => {
        switch (options.mode) {
            case "none":
                // CI=1 works when used in the shell, but, as a runner, it's executed with mode 'new'.
                // So we'll need to make sure the mode is set to 'none' in the spec itself when CI=1.
                return { update: false, env: { CI: "1" } };
            case "new":
                return { update: false };
            case "all":
                return { update: true };
        }
    })();

    return startVitest("test", [], {
        root: process.cwd(),
        watch: false,
        include: ["./src/mock-fn-record-and-replay-example.spec.ts"],
        coverage: { enabled: false },
        reporters: [new SilentReporter()],
        ...snapshotOptions,
        env: { ...snapshotOptions.env, SNAPSHOTS_FOLDER: snapshotsFolder },
    });
}

const mockName = "div-success";

const validCalls = {
    call1: { args: [6, 2], result: { success: true, data: 3 } },
    call2: { args: [10, 5], result: { success: true, data: 2 } },
};

const invalidCalls = {
    call1: { args: [10, 1], result: { success: true, data: 10 } },
    call2: { args: [4, 2], result: { success: true, data: 2 } },
};

function writeSnapshotFiles(options: { invalid?: (1 | 2)[] } = {}) {
    fs.mkdirSync(snapshotsFolder, { recursive: true });

    const file1 = path.join(snapshotsFolder, `${mockName}-001.json`);
    const file2 = path.join(snapshotsFolder, `${mockName}-002.json`);

    const call1 = !options.invalid?.includes(1) ? validCalls.call1 : invalidCalls.call1;
    const call2 = !options.invalid?.includes(2) ? validCalls.call2 : invalidCalls.call2;

    fs.writeFileSync(file1, JSON.stringify(call1, null, 2), "utf-8");
    fs.writeFileSync(file2, JSON.stringify(call2, null, 2), "utf-8");
}

function deleteSnapshotFiles() {
    const files = getSnapshotFiles(mockName);
    deleteFiles(files);
}

function expectTestRunToHaveFailed(testRun: Vitest) {
    expect(testRun.state.getCountOfFailedTests(), `countOfFailedTests`).toBeGreaterThan(0);
}

function expectNoSnapshotFilesToExist() {
    const snapshots = getSnapshotFiles(mockName);
    expect(snapshots.length).toBe(0);
}

function expectTestRunToHaveSucceeded(testRun: Vitest) {
    expect(testRun.state.getCountOfFailedTests(), `countOfFailedTests`).toBe(0);
}

function expectSnapshotFilesToExistWithValidContent() {
    const snapshots = getSnapshotFiles(mockName);
    expect(snapshots.length).toBeGreaterThan(0);

    const [file1, file2] = assertArray(snapshots, 2);
    expectJsonContents(file1, validCalls.call1);
    expectJsonContents(file2, validCalls.call2);
}

function expectJsonContents(filePath: string, expected: object) {
    const contents = fs.readFileSync(filePath, "utf-8");
    const obj = JSON.parse(contents);
    expect(obj).toEqual(expected);
}

function getSnapshotFiles(name: string) {
    return fs
        .readdirSync(snapshotsFolder)
        .filter(f => f.startsWith(name))
        .sort()
        .map(f => path.join(snapshotsFolder, f));
}

type Tuple<T, N extends number, R extends T[] = []> = R["length"] extends N ? R : Tuple<T, N, [...R, T]>;

function assertArray<T, const Length extends number>(array: (T | undefined)[], length: Length): Tuple<T, Length> {
    if (array.length !== length) {
        throw new Error(`Expected array length ${length}, got ${array.length}`);
    }

    for (let i = 0; i < array.length; i++) {
        if (array[i] === undefined) {
            throw new Error(`Expected arr[${i}] to be defined, got undefined`);
        }
    }

    return array as Tuple<T, Length>;
}

function deleteFiles(files: string[]) {
    for (const file of files) {
        fs.unlinkSync(file);
    }
}

class SilentReporter {
    onInit() {}
    onFinished() {}
    onTaskUpdate() {}
}
