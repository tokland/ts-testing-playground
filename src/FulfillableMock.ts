import { expect } from "vitest";

/**
 * Add `toBeFulfilled()` matcher to Vitest’s expect. To be used with mocks that provide a
 * method isFulfilled returning `{ success: true } | { success: false; error: string }`.
 *
 * expect(fulfillableMock).toBeFulfilled();
 */

declare module "vitest" {
    // disable no any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Assertion<T = any> {
        toBeFulfilled(): T;
    }
}

export type FulfillableResult = { success: true } | { success: false; error: string };

export interface FulfillableMock {
    isFulfilled: () => FulfillableResult;
}

function toBeFulfilled(obj: unknown) {
    if (!isFulfillableMock(obj)) {
        return {
            pass: false,
            message: () => "Expected a mock with isFulfilled() method, but it was not found",
        };
    } else {
        const res = obj.isFulfilled();

        if (!res.success) {
            return {
                pass: false,
                message: () => `Expected mock was not fulfilled: ${res.error}`,
            };
        } else {
            return {
                pass: true,
                message: () => "Expected mock was fulfilled",
            };
        }
    }
}

function isFulfillableMock(obj: unknown): obj is FulfillableMock {
    return obj !== null && typeof obj === "function" && "isFulfilled" in obj;
}

expect.extend({ toBeFulfilled });
