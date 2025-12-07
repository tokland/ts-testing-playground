import { describe, it, expect } from "vitest";
import { jsonEquals } from "./json-equals";

describe("jsonEquals", () => {
    it("compares primitives", () => {
        expect(jsonEquals(1, 1)).toBe(true);
        expect(jsonEquals(1, 2)).toBe(false);

        expect(jsonEquals("foo", "foo")).toBe(true);
        expect(jsonEquals("foo", "bar")).toBe(false);

        expect(jsonEquals(true, true)).toBe(true);
        expect(jsonEquals(true, false)).toBe(false);

        expect(jsonEquals(null, null)).toBe(true);
        expect(jsonEquals(null, 0)).toBe(false);
        expect(jsonEquals(0, null)).toBe(false);
    });

    it("compares arrays", () => {
        expect(jsonEquals([], [])).toBe(true);
        expect(jsonEquals([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(jsonEquals([1, 2], [1, 2, 3])).toBe(false);
        expect(jsonEquals([1, 2, 3], [1, 3, 2])).toBe(false);
    });

    it("compares objects with same key order", () => {
        expect(jsonEquals({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
        expect(jsonEquals({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
        expect(jsonEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it("ignores object key order differences", () => {
        const left = { a: 1, b: 2 };
        const right = { b: 2, a: 1 };

        expect(jsonEquals(left, right)).toBe(true);
    });

    it("compares nested structures", () => {
        const obj1 = {
            user: { name: "Alice", age: 30, tags: ["admin", "owner"] },
            active: true,
        };

        const obj2 = {
            active: true,
            user: { age: 30, tags: ["admin", "owner"], name: "Alice" },
        };

        const obj3 = {
            active: true,
            user: { age: 31, tags: ["admin", "owner"], name: "Alice" },
        };

        expect(jsonEquals(obj1, obj2)).toBe(true);
        expect(jsonEquals(obj1, obj3)).toBe(false);
    });

    it("returns false when one is array and the other is object", () => {
        expect(jsonEquals([], {})).toBe(false);
        expect(jsonEquals({ length: 0 }, [])).toBe(false);
    });
});
