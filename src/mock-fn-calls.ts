import { expect, vi, Mock } from "vitest";

import "./FulfillableMock";
import { FulfillableMock } from "./FulfillableMock";
import { JsonValue } from "./json-equals";

/**
 * Vitest function mock that declaratively specifies expected calls.
 *
 * A mock specifies a list of calls with:
 *   - The expected arguments.
 *   - The return value.
 *
 * The mock will validate:
 *   - That arguments match.
 *   - That calls occur in the exact expected order.
 *   - That all expected calls were made.
 *
 * This is useful when you want tight control over mock behavior without relying
 * on Vitest’s imperative `mockReturnValueOnce` or `toHaveBeenCalledWith` assertions.
 *
 * Note that we need serialization to be able to compare arbitrary arguments.
 * We use JSON-compatible values as serialization format. It's both simple and supported by the
 * vitest equality methods. If your arguments are not valid JSON values, create your
 * own serializer or use libraries like SuperJSON.
 *
 * ## Simple Example
 *
 * ```ts
 * function add(a: number, b: number): number {
 *     return a + b;
 * }
 *
 * const addMock = mockFnCalls<Add>({
 *     // The args (a pair of numbers) are JSON-compatible args, use identity serialization
 *     serialize: args => args,
 *     expectedCalls: [
 *         { args: [1, 2], returnValue: 3 },
 *         { args: [5, 7], returnValue: 12 }
 *     ]
 * });
 *
 * expect(addMock(1, 2)).toBe(3);
 * expect(addMock(5, 7)).toBe(12);
 * expect(addMock).toBeFulfilled();
 * ```
 */

export function mockFnCalls<Fn extends AnyFunction>(options: {
    expectedCalls: MockCall<Fn>[];
    serialize: (args: Parameters<Fn>) => JsonValue;
}): Mock<FunctionOf<Fn>> & FulfillableMock {
    const { expectedCalls, serialize } = options;
    let index = 0;

    const fn = vi.fn<FunctionOf<Fn>>((...args) => {
        const currentIndex = index++;
        const expectedCall = expectedCalls[currentIndex];
        const argsSerialized = serialize(args);

        if (!expectedCall) {
            const error = `${expectedCalls.length} calls were available (this was #${currentIndex + 1})`;
            expect(argsSerialized, error).toBeUndefined();
            throw new Error("Unreachable");
        } else {
            const expectedArgsSerialized = serialize(expectedCall.args);
            expect(argsSerialized).toEqual(expectedArgsSerialized);
            return expectedCall.returnValue;
        }
    }) as Mock<FunctionOf<Fn>> & FulfillableMock;

    fn.isFulfilled = () => {
        if (index < expectedCalls.length) {
            const error = `${expectedCalls.length - index} expected calls were not made`;
            return { success: false, error: error };
        } else {
            return { success: true };
        }
    };

    return fn;
}

export type MockCall<Fn extends AnyFunction> = {
    args: Parameters<Fn>;
    returnValue: ReturnType<Fn>;
};

// Helpers

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

type FunctionOf<Fn extends AnyFunction> = (...args: Parameters<Fn>) => ReturnType<Fn>;
