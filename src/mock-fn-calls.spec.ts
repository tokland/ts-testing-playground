import { expect, describe, it } from "vitest";

import { mockFnCalls } from "./mock-fn-calls";

type Add = (a: number, b: number) => number;

describe("Declarative mock function", () => {
    it("validates that it's called with the expected args and returns values", () => {
        const add_ = mockFnCalls<Add>({
            expectedCalls: [
                { args: [1, 2], returnValue: 3 },
                { args: [5, 7], returnValue: 12 },
            ],
            serialize: args => args,
        });

        expect(add_(1, 2)).toBe(3);
        expect(add_(5, 7)).toBe(12);
        expect(add_).toBeFulfilled();
    });

    it("fails when called with unexpected arguments", () => {
        const add_ = mockFnCalls<Add>({
            expectedCalls: [{ args: [1, 4], returnValue: 5 }],
            serialize: args => args,
        });

        expect(() => {
            return add_(1, 2);
        }).toThrow("expected [ 1, 2 ] to deeply equal [ 1, 4 ]");
    });

    it("fails when a non-defined call is made", () => {
        const add_ = mockFnCalls<Add>({
            serialize: args => args,
            expectedCalls: [],
        });

        expect(() => {
            return add_(1, 2);
        }).toThrow("0 calls were available (this was #1)");
    });

    it("fails when too few calls are made", () => {
        const add_ = mockFnCalls<Add>({
            expectedCalls: [{ args: [1, 2], returnValue: 3 }],
            serialize: args => args,
        });

        expect(() => {
            return expect(add_).toBeFulfilled();
        }).toThrow("1 expected calls were not made");
    });
});
