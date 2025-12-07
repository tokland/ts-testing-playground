export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function jsonEquals(a: JsonValue, b: JsonValue): boolean {
    // Fast path for strict equality
    if (a === b) return true;

    const typeA = getType(a);
    const typeB = getType(b);

    // Different types -> not equal
    if (typeA !== typeB) return false;

    // Both have the same type, do deeper checks based on type if needed
    switch (typeA) {
        // Simple types comparable by value
        case "null":
        case "string":
        case "number":
        case "boolean":
            // We already checked by strict equality above, but let's do it again to avoid confusion
            return a === b;

        case "array":
            const arrayA = a as JsonValue[];
            const arrayB = b as JsonValue[];

            if (arrayA.length !== arrayB.length) {
                return false;
            } else {
                return arrayA.every((item, idx) => {
                    return jsonEquals(item, arrayB[idx] as JsonValue);
                });
            }

        case "object":
            const objA = a as { [key: string]: JsonValue };
            const objB = b as { [key: string]: JsonValue };

            const keysA = Object.keys(objA).sort();
            const keysB = Object.keys(objB).sort();

            if (keysA.length !== keysB.length) {
                return false;
            } else {
                return keysA.every((k, idx) => {
                    return k === keysB[idx] && jsonEquals(objA[k] as JsonValue, objB[k] as JsonValue);
                });
            }
    }
}

// Get the type of a JsonValue (as defined in the JSON specification, not the quirky JS typeof)
function getType(value: JsonValue): "string" | "number" | "boolean" | "null" | "array" | "object" {
    const t = typeof value;

    if (value === null) {
        return "null";
    } else if (Array.isArray(value)) {
        return "array";
    } else if (t === "string" || t === "number" || t === "boolean" || t === "object") {
        return t;
    } else {
        throw new Error(`Invalid JsonValue type: ${typeof value}`);
    }
}
